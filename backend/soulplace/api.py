"""Secure portal API for appointments, clinical records, and operations.

Portal roles receive read-only DocPerm access. Every mutation in this module
derives ownership from the authenticated session, validates the transition,
and completes inside Frappe's request transaction.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta
from math import isfinite
from typing import Any
from urllib.parse import urlparse

import frappe
from frappe import _
from frappe.auth import LoginManager
from frappe.rate_limiter import rate_limit
from frappe.utils import (
    add_to_date,
    cint,
    get_datetime,
    getdate,
    now,
    now_datetime,
    validate_email_address,
)

from soulplace.events import (
    ACTIVE_APPOINTMENT_STATUSES,
    GOOGLE_MEET_PATH,
    GOOGLE_MEET_SPACE,
    appointment_start,
    doctor_duration,
)
from soulplace.permissions import (
    DOCTOR_ROLE,
    PATIENT_ROLE,
    current_doctor,
    current_patient,
    is_privileged,
)

ALLOWED_CONSENTS = {"Privacy", "Treatment", "Telemedicine"}
ALLOWED_APPOINTMENT_STATUSES = {"Pending", "Confirmed", "Completed", "Cancelled"}
ALLOWED_EXCEPTION_TYPES = {"Block", "Override", "Add Slots"}
MAX_VERIFICATION_FILE_BYTES = 5 * 1024 * 1024
VERIFICATION_MIME_TYPES = {"application/pdf", "image/jpeg", "image/png"}
OTP_TTL_SECONDS = 300
PATIENT_GENDERS = {"Male", "Female"}
PATIENT_LANGUAGES = {"English", "Hindi", "Marathi"}
PATIENT_THERAPY_EXPERIENCE = {
    "New to therapy",
    "Some previous experience",
    "Currently in therapy",
}
PORTAL_APPOINTMENT_FIELDS = [
    "name",
    "creation",
    "modified",
    "patient",
    "doctor",
    "appointment_date",
    "appointment_time",
    "status",
    "symptoms",
    "booking_source",
    "is_teleconsult",
    "teleconsult_session_id",
    "cancel_reason",
    "rescheduled_from",
]
DOCTOR_APPOINTMENT_FIELDS = [*PORTAL_APPOINTMENT_FIELDS, "notes"]
DOCTOR_CONSULTATION_FIELDS = [
    "name",
    "creation",
    "modified",
    "appointment",
    "doctor",
    "diagnosis",
    "notes",
    "follow_up_date",
    "chief_complaint",
    "soap_subjective",
    "soap_objective",
    "soap_assessment",
    "soap_plan",
    "patient_friendly_summary",
]
PUBLIC_DOCTOR_FIELDS = [
    "name",
    "full_name",
    "specialty",
    "consultation_fee",
    "availability",
    "schedule_json",
    "status",
    "teleconsult_enabled",
    "avg_consult_duration_mins",
    "specialization_tags",
    "approval_status",
]


def _add_appointment_names(rows):
    """Attach human-readable linked names without exposing full profiles."""
    if not rows:
        return rows
    patient_ids = {row.get("patient") for row in rows if row.get("patient")}
    doctor_ids = {row.get("doctor") for row in rows if row.get("doctor")}
    patient_names = {
        row.name: row.name1
        for row in frappe.get_all(
            "PatientUser",
            filters={"name": ("in", patient_ids)},
            fields=["name", "name1"],
            limit=max(len(patient_ids), 1),
        )
    } if patient_ids else {}
    doctor_names = {
        row.name: row.full_name
        for row in frappe.get_all(
            "Doctor",
            filters={"name": ("in", doctor_ids)},
            fields=["name", "full_name"],
            limit=max(len(doctor_ids), 1),
        )
    } if doctor_ids else {}
    for row in rows:
        row["patient_name"] = patient_names.get(row.get("patient"), row.get("patient"))
        row["doctor_name"] = doctor_names.get(row.get("doctor"), row.get("doctor"))
    return rows


def _require_authenticated():
    if frappe.session.user == "Guest":
        frappe.throw(_("Sign in to continue"), frappe.AuthenticationError)


def _require_patient() -> str:
    _require_authenticated()
    patient = current_patient()
    if not patient or PATIENT_ROLE not in frappe.get_roles():
        frappe.throw(_("A linked patient profile is required"), frappe.PermissionError)
    return patient


def _require_doctor() -> str:
    _require_authenticated()
    doctor = current_doctor()
    if not doctor or DOCTOR_ROLE not in frappe.get_roles():
        frappe.throw(_("A linked doctor profile is required"), frappe.PermissionError)
    return doctor


def _require_admin():
    _require_authenticated()
    if not is_privileged():
        frappe.throw(_("Administrator access is required"), frappe.PermissionError)


def _as_dict(value: Any) -> dict[str, Any]:
    if not value:
        return {}
    if isinstance(value, str):
        value = frappe.parse_json(value)
    if not isinstance(value, dict):
        frappe.throw(_("Invalid request payload"))
    return value


def _clean(value: Any, maximum: int = 4000) -> str:
    return str(value or "").strip()[:maximum]


def _validated_text(
    value: Any,
    label: str,
    *,
    minimum: int = 0,
    maximum: int = 4000,
    required: bool = False,
) -> str:
    cleaned = " ".join(str(value or "").strip().split())
    if required and not cleaned:
        frappe.throw(_("{0} is required").format(label))
    if cleaned and len(cleaned) < minimum:
        frappe.throw(_("{0} must contain at least {1} characters").format(label, minimum))
    if len(cleaned) > maximum:
        frappe.throw(_("{0} must be {1} characters or fewer").format(label, maximum))
    return cleaned


def _bounded_text(
    value: Any,
    label: str,
    *,
    maximum: int,
    required: bool = False,
) -> str:
    cleaned = str(value or "").strip()
    if required and not cleaned:
        frappe.throw(_("{0} is required").format(label))
    if len(cleaned) > maximum:
        frappe.throw(_("{0} must be {1} characters or fewer").format(label, maximum))
    return cleaned


def _boolean(value: Any, label: str) -> int:
    if value in (True, 1, "1", "true", "True"):
        return 1
    if value in (False, 0, "0", "false", "False", "", None):
        return 0
    frappe.throw(_("{0} must be true or false").format(label))


def _phone(value: Any, label: str) -> str:
    digits = "".join(character for character in str(value or "") if character.isdigit())
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if digits and len(digits) != 10:
        frappe.throw(_("Enter a valid 10-digit {0}").format(label.lower()))
    return digits


def _appointment_datetime(appointment_date: Any, appointment_time: Any):
    try:
        value = get_datetime(f"{getdate(appointment_date)} {appointment_time}")
    except (TypeError, ValueError):
        frappe.throw(_("Enter a valid appointment date and time"))
    if value <= now_datetime():
        frappe.throw(_("Choose a future appointment time"))
    return value


def _assert_configured_slot(doctor: str, start) -> None:
    doctor_doc = frappe.get_doc("Doctor", doctor)
    try:
        schedule = json.loads(doctor_doc.schedule_json or "{}")
    except (TypeError, json.JSONDecodeError):
        schedule = {}
    categories = schedule.get(start.strftime("%A"), {})
    regular_slots = {
        str(slot)[:5]
        for slots in categories.values()
        if isinstance(slots, list)
        for slot in slots
    }
    exceptions = frappe.get_all(
        "Doctor Schedule Exception",
        filters={
            "practitioner": doctor,
            "active": 1,
            "from_datetime": ("<=", start),
            "to_datetime": (">", start),
        },
        fields=["exception_type", "from_datetime", "to_datetime"],
        limit=100,
    )
    if any(item.exception_type == "Block" for item in exceptions):
        frappe.throw(_("The selected appointment time is blocked"))

    duration = doctor_duration(doctor)
    is_added_slot = any(
        item.exception_type == "Add Slots"
        and int((start - get_datetime(item.from_datetime)).total_seconds()) % (duration * 60) == 0
        for item in exceptions
    )
    if start.strftime("%H:%M") not in regular_slots and not is_added_slot:
        frappe.throw(_("Choose one of the doctor's available appointment times"))


def _verification_signature_matches(content: bytes, content_type: str) -> bool:
    signatures = {
        "application/pdf": (b"%PDF-",),
        "image/png": (b"\x89PNG\r\n\x1a\n",),
        "image/jpeg": (b"\xff\xd8\xff",),
    }
    return bool(content) and any(content.startswith(prefix) for prefix in signatures[content_type])


def _decode_verification_upload(encoded_file: str, filename: str) -> tuple[str, bytes]:
    """Validate and decode a private doctor verification re-upload."""
    safe_filename = _validated_text(
        filename, "Verification filename", maximum=255, required=True
    )
    encoded = str(encoded_file or "").strip()
    if "," not in encoded:
        frappe.throw(_("Invalid verification file data"))

    header, payload = encoded.split(",", 1)
    if not header.startswith("data:") or not header.endswith(";base64"):
        frappe.throw(_("Verification must be uploaded as a PDF, PNG, or JPEG"))
    content_type = header[5:-7].lower()
    if content_type not in VERIFICATION_MIME_TYPES:
        frappe.throw(_("Verification must be a PDF, PNG, or JPEG"))

    allowed_extensions = {
        "application/pdf": (".pdf",),
        "image/png": (".png",),
        "image/jpeg": (".jpg", ".jpeg"),
    }
    if not safe_filename.lower().endswith(allowed_extensions[content_type]):
        frappe.throw(_("Verification filename does not match its file type"))

    try:
        content = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        frappe.throw(_("Invalid verification file data"))
    if len(content) > MAX_VERIFICATION_FILE_BYTES:
        frappe.throw(_("Verification documents must be 5 MB or smaller"))
    if not _verification_signature_matches(content, content_type):
        frappe.throw(_("The verification file contents do not match its declared type"))
    return safe_filename, content


def _lock_doctor(doctor: str):
    # Serializes bookings for one doctor so concurrent requests cannot both
    # pass overlap validation when the selected slot is initially empty.
    frappe.db.sql("SELECT name FROM `tabDoctor` WHERE name = %s FOR UPDATE", doctor)


def _get_owned_appointment(name: str, *, doctor_only: bool = False):
    appointment = frappe.get_doc("SoulPlace Appointment", name)
    if is_privileged():
        return appointment
    roles = set(frappe.get_roles())
    doctor = current_doctor()
    patient = current_patient()
    if DOCTOR_ROLE in roles and doctor and appointment.doctor == doctor:
        return appointment
    if not doctor_only and PATIENT_ROLE in roles and patient and appointment.patient == patient:
        return appointment
    frappe.throw(_("You do not have access to this appointment"), frappe.PermissionError)


def _assert_approved_doctor(doctor: str):
    state = frappe.db.get_value(
        "Doctor", doctor, ["approval_status", "status"], as_dict=True
    )
    if not state or state.approval_status != "Approved" or state.status != "Active":
        frappe.throw(_("This doctor is not currently accepting appointments"))


def _record_consent(patient: str, consent_type: str, status: str, version: str = "1.0"):
    if consent_type not in ALLOWED_CONSENTS:
        frappe.throw(_("Unsupported consent type"))
    normalized_version = _validated_text(version, "Consent version", maximum=50) or "1.0"
    latest = frappe.get_all(
        "Patient Consent Record",
        filters={"patient": patient, "consent_type": consent_type},
        fields=["name", "status", "consent_version"],
        order_by="creation desc",
        limit=1,
    )
    if (
        latest
        and latest[0].status == status
        and latest[0].consent_version == normalized_version
    ):
        return frappe.get_doc("Patient Consent Record", latest[0].name)

    record = frappe.get_doc(
        {
            "doctype": "Patient Consent Record",
            "patient": patient,
            "consent_type": consent_type,
            "consent_version": normalized_version,
            "status": status,
            "granted_on": now() if status == "Granted" else None,
            "revoked_on": now() if status == "Revoked" else None,
            "capture_source": "Web",
            "ip_address": getattr(frappe.local, "request_ip", "") or "",
        }
    ).insert(ignore_permissions=True)
    return record


@frappe.whitelist(allow_guest=True, methods=["POST"])
def get_portal_identity():
    if frappe.session.user == "Guest":
        return {"status": "anonymous", "username": "Guest", "roles": []}

    roles = frappe.get_roles()
    patient_name = current_patient()
    doctor_name = current_doctor()
    portal = None
    patient = None
    doctor = None
    if is_privileged():
        portal = "admin"
    elif doctor_name and DOCTOR_ROLE in roles:
        portal = "doctor"
        doctor = frappe.get_doc("Doctor", doctor_name).as_dict()
    elif patient_name and PATIENT_ROLE in roles:
        portal = "patient"
        patient = frappe.get_doc("PatientUser", patient_name).as_dict()

    if not portal:
        return {"status": "anonymous", "username": frappe.session.user, "roles": roles}
    return {
        "status": "authenticated",
        "username": frappe.session.user,
        "fullName": frappe.db.get_value("User", frappe.session.user, "full_name") or frappe.session.user,
        "roles": roles,
        "portal": portal,
        "patient": patient,
        "doctor": doctor,
    }


@frappe.whitelist(methods=["POST"])
def list_admin_doctors(status: str = "", limit: int | str = 200):
    """Return complete Doctor records only to privileged administrators."""
    _require_admin()
    page_length = min(max(cint(limit) or 100, 1), 200)
    approval_status = _clean(status, 20)
    if approval_status and approval_status not in {"Pending", "Approved", "Rejected"}:
        frappe.throw(_("Unsupported doctor approval status"))
    filters = {"approval_status": approval_status} if approval_status else None
    return frappe.get_all(
        "Doctor",
        filters=filters,
        fields=["*"],
        order_by="creation asc",
        limit=page_length,
    )


@frappe.whitelist(methods=["POST"])
def list_admin_appointments(limit: int | str = 200):
    """Return appointments with display names to privileged administrators."""
    _require_admin()
    page_length = min(max(cint(limit) or 100, 1), 200)
    rows = frappe.get_all(
        "SoulPlace Appointment",
        fields=DOCTOR_APPOINTMENT_FIELDS,
        order_by="appointment_date desc, appointment_time desc",
        limit=page_length,
    )
    return _add_appointment_names(rows)


@frappe.whitelist(methods=["POST"])
def list_portal_doctors(limit: int | str = 200):
    """Return only discoverable doctors and explicitly public profile fields."""
    _require_patient()
    page_length = min(max(cint(limit) or 100, 1), 200)
    return frappe.get_all(
        "Doctor",
        filters={
            "approval_status": "Approved",
            "status": "Active",
            "app_user": ("is", "set"),
        },
        fields=PUBLIC_DOCTOR_FIELDS,
        order_by="full_name asc",
        limit=page_length,
    )


@frappe.whitelist(methods=["POST"])
def get_portal_doctor(name: str):
    _require_authenticated()
    doctor = frappe.get_doc("Doctor", _validated_text(name, "Doctor", maximum=140, required=True))
    roles = set(frappe.get_roles())
    if is_privileged() or (DOCTOR_ROLE in roles and current_doctor() == doctor.name):
        return doctor.as_dict()
    if (
        PATIENT_ROLE in roles
        and current_patient()
        and doctor.approval_status == "Approved"
        and doctor.status == "Active"
    ):
        return {field: doctor.get(field) for field in PUBLIC_DOCTOR_FIELDS}
    frappe.throw(_("You do not have access to this doctor"), frappe.PermissionError)


@frappe.whitelist(methods=["POST"])
def list_portal_appointments(limit: int | str = 200):
    """Return only appointments owned by the authenticated portal profile."""
    _require_authenticated()
    page_length = min(max(cint(limit) or 100, 1), 200)
    doctor = current_doctor()
    patient = current_patient()
    if doctor and DOCTOR_ROLE in frappe.get_roles():
        filters = {"doctor": doctor}
        fields = DOCTOR_APPOINTMENT_FIELDS
    elif patient and PATIENT_ROLE in frappe.get_roles():
        filters = {"patient": patient}
        fields = PORTAL_APPOINTMENT_FIELDS
    else:
        frappe.throw(_("A linked portal profile is required"), frappe.PermissionError)
    rows = frappe.get_all(
        "SoulPlace Appointment",
        filters=filters,
        fields=fields,
        order_by="appointment_date asc, appointment_time asc",
        limit=page_length,
    )
    return _add_appointment_names(rows)


@frappe.whitelist(methods=["POST"])
def get_portal_appointment(name: str):
    """Return one owned appointment, excluding clinician notes from patients."""
    appointment = _get_owned_appointment(name)
    values = appointment.as_dict()
    if not is_privileged() and current_doctor() != appointment.doctor:
        values.pop("notes", None)
    return _add_appointment_names([values])[0]


@frappe.whitelist(methods=["POST"])
def list_portal_consultations(limit: int | str = 200):
    """Expose complete clinical notes only to their authenticated author."""
    _require_authenticated()
    page_length = min(max(cint(limit) or 100, 1), 200)
    doctor = current_doctor()
    patient = current_patient()
    if doctor and DOCTOR_ROLE in frappe.get_roles():
        return frappe.get_all(
            "Consultation",
            filters={"doctor": doctor},
            fields=DOCTOR_CONSULTATION_FIELDS,
            order_by="creation desc",
            limit=page_length,
        )
    if patient and PATIENT_ROLE in frappe.get_roles():
        appointments = frappe.get_all(
            "SoulPlace Appointment",
            filters={"patient": patient},
            pluck="name",
            limit=1000,
        )
        if not appointments:
            return []
        return frappe.get_all(
            "Consultation",
            filters={"appointment": ("in", appointments)},
            fields=[
                "name",
                "creation",
                "modified",
                "appointment",
                "doctor",
                "follow_up_date",
                "patient_friendly_summary",
            ],
            order_by="creation desc",
            limit=page_length,
        )
    frappe.throw(_("A linked portal profile is required"), frappe.PermissionError)


@frappe.whitelist(methods=["POST"])
def get_portal_consultation(name: str):
    """Return a full owned note to its doctor or its shared patient summary."""
    _require_authenticated()
    consultation = frappe.get_doc("Consultation", name)
    doctor = current_doctor()
    if doctor and DOCTOR_ROLE in frappe.get_roles() and consultation.doctor == doctor:
        return consultation.as_dict()
    patient = current_patient()
    appointment_patient = frappe.db.get_value("SoulPlace Appointment", consultation.appointment, "patient")
    if patient and PATIENT_ROLE in frappe.get_roles() and appointment_patient == patient:
        return {
            "name": consultation.name,
            "appointment": consultation.appointment,
            "doctor": consultation.doctor,
            "follow_up_date": consultation.follow_up_date,
            "patient_friendly_summary": consultation.patient_friendly_summary,
        }
    if is_privileged():
        return consultation.as_dict()
    frappe.throw(_("You do not have access to this consultation"), frappe.PermissionError)


@frappe.whitelist(methods=["POST"])
def book_appointment(
    doctor: str,
    appointment_date: str,
    appointment_time: str,
    symptoms: str,
    is_teleconsult: int | str = 0,
    privacy_consent: int | str = 0,
    telemedicine_consent: int | str = 0,
    consent_version: str = "1.0",
):
    patient = _require_patient()
    if not _boolean(privacy_consent, "Privacy consent"):
        frappe.throw(_("Privacy consent is required to book"))
    teleconsult = _boolean(is_teleconsult, "Teleconsult selection")
    if teleconsult and not _boolean(telemedicine_consent, "Telemedicine consent"):
        frappe.throw(_("Telemedicine consent is required for a video appointment"))
    symptom_text = _validated_text(
        symptoms, "Reason for visit", minimum=3, maximum=4000, required=True
    )
    start = _appointment_datetime(appointment_date, appointment_time)
    _assert_approved_doctor(doctor)
    if teleconsult and not cint(frappe.db.get_value("Doctor", doctor, "teleconsult_enabled")):
        frappe.throw(_("This doctor does not offer video appointments"))
    _lock_doctor(doctor)
    _assert_configured_slot(doctor, start)

    _record_consent(patient, "Privacy", "Granted", consent_version)
    if teleconsult:
        _record_consent(patient, "Telemedicine", "Granted", consent_version)

    appointment = frappe.get_doc(
        {
            "doctype": "SoulPlace Appointment",
            "patient": patient,
            "doctor": doctor,
            "appointment_date": start.date(),
            "appointment_time": start.time(),
            "status": "Pending",
            "symptoms": symptom_text,
            "booking_source": "Web",
            "is_teleconsult": teleconsult,
        }
    ).insert(ignore_permissions=True)
    return appointment.as_dict()


@frappe.whitelist(methods=["POST"])
def update_appointment_status(
    name: str, status: str, reason: str = "", meeting_link: str = ""
):
    if status not in ALLOWED_APPOINTMENT_STATUSES - {"Pending"}:
        frappe.throw(_("Unsupported appointment status"))
    appointment = _get_owned_appointment(name)
    roles = set(frappe.get_roles())
    old_status = appointment.status

    if not is_privileged():
        if PATIENT_ROLE in roles:
            if status != "Cancelled" or old_status not in ACTIVE_APPOINTMENT_STATUSES:
                frappe.throw(_("Patients may only cancel active appointments"), frappe.PermissionError)
        elif DOCTOR_ROLE in roles:
            allowed = {
                "Pending": {"Confirmed", "Cancelled"},
                "Confirmed": {"Completed", "Cancelled"},
            }
            if status not in allowed.get(old_status, set()):
                frappe.throw(_("This appointment status transition is not allowed"))
        else:
            frappe.throw(_("You cannot change this appointment"), frappe.PermissionError)

    cancellation_reason = ""
    if status == "Cancelled":
        cancellation_reason = _validated_text(
            reason, "Cancellation reason", minimum=3, maximum=500, required=True
        )
        if DOCTOR_ROLE in roles and old_status == "Pending" and not is_privileged():
            cancellation_reason = _(
                "Doctor declined this appointment request: {0}. Please create a new appointment."
            ).format(cancellation_reason.rstrip(". "))
    manual_meeting_link = str(meeting_link or "").strip()
    if manual_meeting_link:
        if status != "Confirmed" or not cint(appointment.is_teleconsult):
            frappe.throw(_("A Meet link can only be added while confirming a teleconsult appointment"))
        _validate_google_meet_link(manual_meeting_link)
    appointment.status = status
    if status == "Cancelled":
        appointment.cancel_reason = cancellation_reason
    appointment.save(ignore_permissions=True)
    if manual_meeting_link:
        save_manual_google_meet_session(appointment.name, manual_meeting_link)
    return appointment.as_dict()


@frappe.whitelist(methods=["POST"])
def reschedule_appointment(name: str, appointment_date: str, appointment_time: str, reason: str = ""):
    appointment = _get_owned_appointment(name)
    roles = set(frappe.get_roles())
    if not is_privileged() and PATIENT_ROLE not in roles:
        frappe.throw(_("Only patients may request a new appointment time"), frappe.PermissionError)
    if appointment.status not in ACTIVE_APPOINTMENT_STATUSES:
        frappe.throw(_("Only active appointments can be rescheduled"))
    start = _appointment_datetime(appointment_date, appointment_time)
    reason_text = _validated_text(reason, "Reschedule reason", maximum=1000)
    _lock_doctor(appointment.doctor)
    _assert_configured_slot(appointment.doctor, start)
    appointment.appointment_date = start.date()
    appointment.appointment_time = start.time()
    appointment.status = "Pending"
    appointment.cancel_reason = ""
    appointment.notes = reason_text or appointment.notes
    appointment.save(ignore_permissions=True)
    return appointment.as_dict()


@frappe.whitelist(methods=["POST"])
def save_consultation(values: Any):
    doctor = _require_doctor()
    data = _as_dict(values)
    name = _validated_text(data.get("name"), "Consultation", maximum=140)
    appointment_name = _validated_text(data.get("appointment"), "SoulPlace Appointment", maximum=140)
    if name:
        consultation = frappe.get_doc("Consultation", name)
        appointment_name = consultation.appointment
        if consultation.doctor != doctor:
            frappe.throw(_("You do not own this consultation"), frappe.PermissionError)
    else:
        if not appointment_name:
            frappe.throw(_("An appointment is required"))
        appointment = _get_owned_appointment(appointment_name, doctor_only=True)
        if appointment.status not in {"Confirmed", "Completed"}:
            frappe.throw(_("Confirm the appointment before recording a consultation"))
        existing = frappe.db.get_value("Consultation", {"appointment": appointment_name}, "name")
        consultation = (
            frappe.get_doc("Consultation", existing)
            if existing
            else frappe.get_doc(
                {"doctype": "Consultation", "appointment": appointment_name, "doctor": doctor}
            )
        )

    allowed_fields = {
        "diagnosis",
        "notes",
        "follow_up_date",
        "chief_complaint",
        "soap_subjective",
        "soap_objective",
        "soap_assessment",
        "soap_plan",
        "patient_friendly_summary",
    }
    for field in allowed_fields:
        if field in data:
            if field == "follow_up_date":
                follow_up = str(data[field] or "").strip()
                if follow_up:
                    try:
                        follow_up = getdate(follow_up)
                    except (TypeError, ValueError):
                        frappe.throw(_("Enter a valid follow-up date"))
                consultation.set(field, follow_up or None)
            else:
                consultation.set(
                    field,
                    _bounded_text(data[field], field.replace("_", " ").title(), maximum=10000),
                )
    consultation.save(ignore_permissions=True) if consultation.name else consultation.insert(ignore_permissions=True)
    return consultation.as_dict()


@frappe.whitelist(methods=["POST"])
def save_prescription(values: Any):
    doctor = _require_doctor()
    data = _as_dict(values)
    name = _validated_text(data.get("name"), "Prescription", maximum=140)
    if name:
        prescription = frappe.get_doc("Prescription", name)
        consultation = frappe.get_doc("Consultation", prescription.consultation)
    else:
        consultation_name = _validated_text(
            data.get("consultation"), "Consultation", maximum=140, required=True
        )
        consultation = frappe.get_doc("Consultation", consultation_name)
        prescription = frappe.get_doc(
            {"doctype": "Prescription", "consultation": consultation.name}
        )
    if consultation.doctor != doctor:
        frappe.throw(_("You do not own this consultation"), frappe.PermissionError)
    medicine = _validated_text(
        data.get("medicine_name"), "Medicine name", maximum=500, required=True
    )
    dosage = _validated_text(data.get("dosage"), "Dosage", maximum=500, required=True)
    prescription.medicine_name = medicine
    prescription.dosage = dosage
    prescription.instructions = _bounded_text(
        data.get("instructions"), "Instructions", maximum=4000
    )
    prescription.save(ignore_permissions=True) if prescription.name else prescription.insert(ignore_permissions=True)
    return prescription.as_dict()


@frappe.whitelist(methods=["POST"])
def grant_consent(consent_type: str, consent_version: str = "1.0"):
    patient = _require_patient()
    record = _record_consent(patient, consent_type, "Granted", consent_version)
    frappe.db.set_value("PatientUser", patient, "consent_status", "Granted", update_modified=False)
    return record.as_dict()


@frappe.whitelist(methods=["POST"])
def revoke_consent(name: str):
    patient = _require_patient()
    source = frappe.get_doc("Patient Consent Record", name)
    if source.patient != patient:
        frappe.throw(_("You do not own this consent record"), frappe.PermissionError)
    record = _record_consent(patient, source.consent_type, "Revoked", source.consent_version)
    frappe.db.set_value("PatientUser", patient, "consent_status", "Revoked", update_modified=False)
    return record.as_dict()


def _validate_google_meet_link(link: str):
    parsed = urlparse(link)
    if (
        parsed.scheme != "https"
        or parsed.hostname != "meet.google.com"
        or parsed.username
        or parsed.password
        or parsed.port
        or parsed.query
        or parsed.fragment
        or not GOOGLE_MEET_PATH.fullmatch(parsed.path)
    ):
        frappe.throw(_("Enter a valid https://meet.google.com meeting link"))


@frappe.whitelist(methods=["POST"])
def save_google_meet_session(appointment: str, meeting_id: str, meeting_link: str):
    doctor = _require_doctor()
    _assert_approved_doctor(doctor)
    appointment_doc = _get_owned_appointment(appointment, doctor_only=True)
    if appointment_doc.doctor != doctor or not cint(appointment_doc.is_teleconsult):
        frappe.throw(_("This is not your teleconsult appointment"), frappe.PermissionError)
    if appointment_doc.status != "Confirmed":
        frappe.throw(_("Confirm the appointment before creating a meeting"))
    meeting_identifier = _validated_text(
        meeting_id, "Meeting identifier", maximum=500, required=True
    )
    if not GOOGLE_MEET_SPACE.fullmatch(meeting_identifier):
        frappe.throw(_("Enter a valid Google Meet space identifier"))
    normalized_link = str(meeting_link or "").strip()
    _validate_google_meet_link(normalized_link)

    session_name = frappe.db.get_value("Teleconsult Session", {"appointment": appointment}, "name")
    if session_name:
        existing = frappe.get_doc("Teleconsult Session", session_name)
        if (
            existing.meeting_id == meeting_identifier
            and existing.meeting_link == normalized_link
        ):
            return existing.as_dict()
        if existing.meeting_id or existing.meeting_link:
            frappe.throw(_("A Google Meet room already exists for this appointment"))
    session = (
        frappe.get_doc("Teleconsult Session", session_name)
        if session_name
        else frappe.get_doc(
            {
                "doctype": "Teleconsult Session",
                "appointment": appointment,
                "practitioner": doctor,
                "patient": appointment_doc.patient,
            }
        )
    )
    start = appointment_start(appointment_doc)
    session.provider = "Google Meet"
    session.meeting_id = meeting_identifier
    session.meeting_link = normalized_link
    session.start_time = start
    session.end_time = add_to_date(start, minutes=doctor_duration(doctor))
    session.session_status = "Created"
    session.save(ignore_permissions=True) if session.name else session.insert(ignore_permissions=True)
    appointment_doc.teleconsult_session_id = session.name
    appointment_doc.save(ignore_permissions=True)
    return session.as_dict()


@frappe.whitelist(methods=["POST"])
def save_manual_google_meet_session(appointment: str, meeting_link: str):
    """Save a doctor-created Meet URL while retaining automated Meet support."""
    normalized_link = str(meeting_link or "").strip()
    _validate_google_meet_link(normalized_link)
    meeting_code = urlparse(normalized_link).path.strip("/")
    return save_google_meet_session(
        appointment,
        f"spaces/{meeting_code}",
        normalized_link,
    )


@frappe.whitelist(methods=["POST"])
def save_doctor_schedule(
    schedule_json: str,
    availability: str = "",
    status: str | None = None,
    teleconsult_enabled: int | str | None = None,
    avg_consult_duration_mins: int | str | None = None,
):
    doctor_name = _require_doctor()
    schedule = frappe.parse_json(schedule_json or "{}")
    if not isinstance(schedule, dict):
        frappe.throw(_("Schedule must be a JSON object"))
    valid_days = {"Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"}
    valid_categories = {"Morning", "Afternoon", "Evening"}
    if len(schedule) > len(valid_days):
        frappe.throw(_("Schedule contains too many days"))
    total_slots = 0
    for day, categories in schedule.items():
        if day not in valid_days or not isinstance(categories, dict):
            frappe.throw(_("Schedule contains an invalid day"))
        for category, slots in categories.items():
            if category not in valid_categories or not isinstance(slots, list):
                frappe.throw(_("Schedule contains an invalid time group"))
            if len(slots) > 96 or len(slots) != len(set(slots)):
                frappe.throw(_("Schedule contains too many or duplicate times"))
            total_slots += len(slots)
            for slot in slots:
                try:
                    datetime.strptime(slot, "%H:%M")
                except (TypeError, ValueError):
                    frappe.throw(_("Schedule contains an invalid time"))
    if total_slots > 672:
        frappe.throw(_("Schedule contains too many appointment times"))

    doctor = frappe.get_doc("Doctor", doctor_name)
    doctor.schedule_json = json.dumps(schedule, separators=(",", ":"))
    doctor.availability = _clean(availability, 1000)
    if status is not None:
        if status not in {"Active", "Inactive"}:
            frappe.throw(_("Invalid doctor status"))
        doctor.status = status
    if teleconsult_enabled is not None:
        doctor.teleconsult_enabled = _boolean(teleconsult_enabled, "Teleconsult availability")
    if avg_consult_duration_mins is not None:
        duration = cint(avg_consult_duration_mins)
        if duration < 5 or duration > 240:
            frappe.throw(_("Consultation duration must be between 5 and 240 minutes"))
        doctor.avg_consult_duration_mins = duration
    doctor.save(ignore_permissions=True)
    return doctor.as_dict()


@frappe.whitelist(allow_guest=True, methods=["POST"])
def get_doctor_slots(doctor: str, date: str):
    day = getdate(date)
    if day < getdate():
        return []
    if not (is_privileged() or current_doctor() == doctor):
        _assert_approved_doctor(doctor)
    doctor_doc = frappe.get_doc("Doctor", doctor)
    try:
        schedule = json.loads(doctor_doc.schedule_json or "{}")
    except (TypeError, json.JSONDecodeError):
        schedule = {}
    categories = schedule.get(day.strftime("%A"), {})
    slots = sorted({slot for values in categories.values() for slot in values})

    existing = frappe.get_all(
        "SoulPlace Appointment",
        filters={
            "doctor": doctor,
            "appointment_date": day,
            "status": ("in", ACTIVE_APPOINTMENT_STATUSES),
        },
        pluck="appointment_time",
        limit=500,
    )
    booked = {str(value)[:5] for value in existing}
    exceptions = frappe.get_all(
        "Doctor Schedule Exception",
        filters={
            "practitioner": doctor,
            "active": 1,
            "from_datetime": ("<=", f"{day} 23:59:59"),
            "to_datetime": (">=", f"{day} 00:00:00"),
        },
        fields=["exception_type", "from_datetime", "to_datetime"],
        limit=100,
    )
    result = []
    now_value = now_datetime()
    for slot in slots:
        slot_dt = get_datetime(f"{day} {slot}")
        if slot_dt <= now_value or slot[:5] in booked:
            continue
        blocked = any(
            item.exception_type == "Block"
            and get_datetime(item.from_datetime) <= slot_dt < get_datetime(item.to_datetime)
            for item in exceptions
        )
        if not blocked:
            result.append(f"{slot[:5]}:00")

    for item in exceptions:
        if item.exception_type != "Add Slots":
            continue
        cursor = get_datetime(item.from_datetime)
        end = get_datetime(item.to_datetime)
        increment = max(cint(doctor_doc.avg_consult_duration_mins) or 30, 5)
        while cursor < end:
            value = cursor.strftime("%H:%M:00")
            if cursor.date() == day and cursor > now_value and value[:5] not in booked:
                result.append(value)
            cursor += timedelta(minutes=increment)
    return sorted(set(result))


@frappe.whitelist(methods=["POST"])
def create_schedule_exception(values: Any):
    data = _as_dict(values)
    practitioner = current_doctor()
    if is_privileged():
        practitioner = _clean(data.get("practitioner"), 140)
    elif not practitioner:
        frappe.throw(_("Doctor access is required"), frappe.PermissionError)
    if not practitioner or not frappe.db.exists("Doctor", practitioner):
        frappe.throw(_("Select a valid doctor"))
    exception_type = data.get("exception_type")
    if exception_type not in ALLOWED_EXCEPTION_TYPES:
        frappe.throw(_("Invalid schedule exception type"))
    try:
        start = get_datetime(data.get("from_datetime"))
        end = get_datetime(data.get("to_datetime"))
    except (TypeError, ValueError):
        frappe.throw(_("Enter valid start and end times"))
    if end <= start:
        frappe.throw(_("The end must be after the start"))
    doc = frappe.get_doc(
        {
            "doctype": "Doctor Schedule Exception",
            "practitioner": practitioner,
            "exception_type": exception_type,
            "from_datetime": start,
            "to_datetime": end,
            "reason": _clean(data.get("reason"), 1000),
            "active": _boolean(data.get("active", 1), "Active status"),
        }
    ).insert(ignore_permissions=True)
    return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def update_schedule_exception(name: str, values: Any):
    data = _as_dict(values)
    doc = frappe.get_doc("Doctor Schedule Exception", name)
    if not is_privileged() and doc.practitioner != _require_doctor():
        frappe.throw(_("You do not own this schedule exception"), frappe.PermissionError)
    if "exception_type" in data:
        if data["exception_type"] not in ALLOWED_EXCEPTION_TYPES:
            frappe.throw(_("Invalid schedule exception type"))
        doc.exception_type = data["exception_type"]
    if "from_datetime" in data:
        try:
            doc.from_datetime = get_datetime(data["from_datetime"])
        except (TypeError, ValueError):
            frappe.throw(_("Enter a valid start time"))
    if "to_datetime" in data:
        try:
            doc.to_datetime = get_datetime(data["to_datetime"])
        except (TypeError, ValueError):
            frappe.throw(_("Enter a valid end time"))
    if get_datetime(doc.to_datetime) <= get_datetime(doc.from_datetime):
        frappe.throw(_("The end must be after the start"))
    if "reason" in data:
        doc.reason = _clean(data["reason"], 1000)
    if "active" in data:
        doc.active = _boolean(data["active"], "Active status")
    doc.save(ignore_permissions=True)
    return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def delete_schedule_exception(name: str):
    doc = frappe.get_doc("Doctor Schedule Exception", name)
    if not is_privileged() and doc.practitioner != _require_doctor():
        frappe.throw(_("You do not own this schedule exception"), frappe.PermissionError)
    frappe.delete_doc("Doctor Schedule Exception", name, ignore_permissions=True)
    return {"deleted": True}


@frappe.whitelist(methods=["POST"])
def update_patient_profile(values: Any):
    patient = frappe.get_doc("PatientUser", _require_patient())
    data = _as_dict(values)
    if "name1" in data:
        patient.name1 = _validated_text(
            data["name1"], "Name", minimum=2, maximum=140, required=True
        )
    if "email" in data:
        email = str(data["email"] or "").strip().lower()
        if len(email) > 254 or not validate_email_address(email):
            frappe.throw(_("Enter a valid email address"))
        existing = frappe.db.get_value("PatientUser", {"email": email}, "name")
        if existing and existing != patient.name:
            frappe.throw(_("A patient profile with this email already exists"))
        patient.email = email
    if "age" in data:
        age = cint(data["age"])
        if age < 13 or age > 120:
            frappe.throw(_("Age must be between 13 and 120"))
        patient.age = age
    if "gender" in data:
        if data["gender"] not in PATIENT_GENDERS:
            frappe.throw(_("Select a supported gender"))
        patient.gender = data["gender"]
    if "preferred_language" in data:
        if data["preferred_language"] not in PATIENT_LANGUAGES:
            frappe.throw(_("Select a supported preferred language"))
        patient.preferred_language = data["preferred_language"]
    if "livingstatus" in data:
        patient.livingstatus = _boolean(data["livingstatus"], "Living status")
    if "therapyexp" in data:
        if data["therapyexp"] not in PATIENT_THERAPY_EXPERIENCE:
            frappe.throw(_("Select a supported therapy experience"))
        patient.therapyexp = data["therapyexp"]
    if "emergency_contact_name" in data:
        patient.emergency_contact_name = _validated_text(
            data["emergency_contact_name"], "Emergency contact name", maximum=140
        )
    if "emergency_contact_phone" in data:
        patient.emergency_contact_phone = _phone(
            data["emergency_contact_phone"], "emergency contact phone number"
        )
    patient.save(ignore_permissions=True)
    return patient.as_dict()


@frappe.whitelist(methods=["POST"])
def update_doctor_profile(values: Any):
    doctor = frappe.get_doc("Doctor", _require_doctor())
    data = _as_dict(values)
    for field, label, maximum in (
        ("full_name", "Name", 140),
        ("specialty", "Specialty", 140),
        ("specialization_tags", "Specialization tags", 1000),
    ):
        if field in data:
            doctor.set(
                field,
                _validated_text(
                    data[field], label, minimum=2 if field != "specialization_tags" else 0,
                    maximum=maximum, required=field != "specialization_tags"
                ),
            )
    if "mobile_number" in data:
        doctor.mobile_number = _phone(data["mobile_number"], "mobile number")
    if not doctor.full_name or not doctor.specialty:
        frappe.throw(_("Name and specialty are required"))
    if "consultation_fee" in data:
        try:
            fee = float(data["consultation_fee"])
        except (TypeError, ValueError):
            frappe.throw(_("Enter a valid consultation fee"))
        if not isfinite(fee) or fee < 0 or fee > 1_000_000:
            frappe.throw(_("Consultation fee must be between 0 and 1,000,000"))
        doctor.consultation_fee = fee
    if "avg_consult_duration_mins" in data:
        duration = cint(data["avg_consult_duration_mins"])
        if duration < 5 or duration > 240:
            frappe.throw(_("Consultation duration must be between 5 and 240 minutes"))
        doctor.avg_consult_duration_mins = duration
    doctor.save(ignore_permissions=True)
    return doctor.as_dict()


@frappe.whitelist(methods=["POST"])
def review_doctor(name: str, decision: str, reason: str = ""):
    _require_admin()
    if decision not in {"Approved", "Rejected"}:
        frappe.throw(_("Decision must be Approved or Rejected"))
    review_reason = ""
    if decision == "Rejected":
        review_reason = _bounded_text(
            reason, "Rejection reason", maximum=2000, required=True
        )
    doctor = frappe.get_doc("Doctor", name)
    if decision == "Approved" and (
        not doctor.app_user or not frappe.db.exists("User", doctor.app_user)
    ):
        frappe.throw(_("Link this doctor to a portal user before approval"))
    doctor.approval_status = decision
    doctor.status = "Active" if decision == "Approved" else "Inactive"
    doctor.rejection_reason = "" if decision == "Approved" else review_reason
    doctor.reviewed_by = frappe.session.user
    doctor.reviewed_on = now()
    doctor.save(ignore_permissions=True)
    return doctor.as_dict()


@frappe.whitelist(methods=["POST"])
def reapply_doctor(verificationFileBase64: str, verificationFileName: str):
    """Allow only the signed-in rejected doctor to submit replacement proof."""
    from frappe.utils.file_manager import save_file

    doctor_name = _require_doctor()
    doctor = frappe.get_doc("Doctor", doctor_name)
    if doctor.approval_status != "Rejected":
        frappe.throw(_("A new verification document can only be submitted after rejection"))

    filename, content = _decode_verification_upload(
        verificationFileBase64, verificationFileName
    )
    file_doc = save_file(
        filename,
        content,
        "Doctor",
        doctor.name,
        is_private=1,
        df="verification_proof",
    )
    doctor.verification_proof = file_doc.file_url
    doctor.approval_status = "Pending"
    doctor.status = "Inactive"
    doctor.rejection_reason = ""
    doctor.reviewed_by = None
    doctor.reviewed_on = None
    doctor.save(ignore_permissions=True)
    return {
        "success": True,
        "message": _("Re-application submitted for review"),
        "doctor": doctor.as_dict(),
    }


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=60 * 60, methods="POST")
def register_doctor(
    full_name: str,
    email: str,
    mobile_number: str,
    password: str,
    specialty: str,
    medical_registration: str,
    consultation_fee: int | str = 0,
    avg_consult_duration_mins: int | str = 30,
    specialization_tags: str = "",
    teleconsult_enabled: int | str = 0,
    professional_consent: int | str = 0,
    consent_version: str = "1.0",
):
    from frappe.utils.file_manager import save_file
    from frappe.utils.password import update_password

    normalized_email = str(email or "").strip().lower()
    if len(normalized_email) > 254 or not validate_email_address(normalized_email):
        frappe.throw(_("Enter a valid professional email"))
    if len(password or "") < 8:
        frappe.throw(_("Password must contain at least 8 characters"))
    if len(password or "") > 128:
        frappe.throw(_("Password must be 128 characters or fewer"))
    normalized_name = _validated_text(
        full_name, "Name", minimum=2, maximum=140, required=True
    )
    normalized_specialty = _validated_text(
        specialty, "Specialty", minimum=2, maximum=140, required=True
    )
    registration = _validated_text(
        medical_registration, "Medical registration", minimum=2, maximum=200, required=True
    )
    tags = _validated_text(specialization_tags, "Specialization tags", maximum=1000)
    version = _validated_text(consent_version, "Consent version", maximum=50) or "1.0"
    mobile_digits = _phone(mobile_number, "mobile number")
    if not mobile_digits:
        frappe.throw(_("Mobile number is required"))
    if not _boolean(professional_consent, "Professional consent"):
        frappe.throw(_("Professional terms must be accepted"))
    if frappe.db.exists("User", normalized_email) or frappe.db.exists("Doctor", {"email": normalized_email}):
        frappe.throw(_("An account with this email already exists"))
    if frappe.db.exists("Doctor", {"medical_registration": registration}):
        frappe.throw(_("This medical registration is already on file"))
    try:
        fee = float(consultation_fee or 0)
    except (TypeError, ValueError):
        frappe.throw(_("Enter a valid consultation fee"))
    if not isfinite(fee) or fee < 0 or fee > 1_000_000:
        frappe.throw(_("Consultation fee must be between 0 and 1,000,000"))

    uploaded = getattr(frappe.request, "files", {}).get("verification") if frappe.request else None
    if not uploaded:
        frappe.throw(_("A verification document is required"))
    content_type = (uploaded.content_type or "").split(";", 1)[0]
    if content_type not in VERIFICATION_MIME_TYPES:
        frappe.throw(_("Verification must be a PDF, PNG, or JPEG"))
    content = uploaded.stream.read(MAX_VERIFICATION_FILE_BYTES + 1)
    if len(content) > MAX_VERIFICATION_FILE_BYTES:
        frappe.throw(_("Verification documents must be 5 MB or smaller"))
    if not _verification_signature_matches(content, content_type):
        frappe.throw(_("The verification file contents do not match its declared type"))

    user = frappe.get_doc(
        {
            "doctype": "User",
            "email": normalized_email,
            "first_name": normalized_name,
            "mobile_no": mobile_digits,
            "send_welcome_email": 0,
            "user_type": "Website User",
        }
    ).insert(ignore_permissions=True)
    user.add_roles(DOCTOR_ROLE)
    update_password(user.name, password)

    duration = cint(avg_consult_duration_mins) or 30
    if duration < 5 or duration > 240:
        frappe.throw(_("Consultation duration must be between 5 and 240 minutes"))
    doctor = frappe.get_doc(
        {
            "doctype": "Doctor",
            "full_name": normalized_name,
            "app_user": user.name,
            "specialty": normalized_specialty,
            "medical_registration": registration,
            "mobile_number": mobile_digits,
            "email": normalized_email,
            "consultation_fee": fee,
            "status": "Inactive",
            "teleconsult_enabled": _boolean(teleconsult_enabled, "Teleconsult availability"),
            "avg_consult_duration_mins": duration,
            "specialization_tags": tags,
            "approval_status": "Pending",
            "professional_consent": 1,
            "professional_consent_version": version,
            "professional_consent_on": now(),
        }
    ).insert(ignore_permissions=True)
    file_doc = save_file(
        uploaded.filename,
        content,
        "Doctor",
        doctor.name,
        is_private=1,
        df="verification_proof",
    )
    doctor.db_set("verification_proof", file_doc.file_url, update_modified=False)
    LoginManager().login_as(user.name)
    return {"success": True, "doctor": doctor.as_dict(), "status": "Pending"}


@frappe.whitelist(methods=["POST"])
def dashboard_stats():
    _require_admin()
    today = getdate()
    count = frappe.db.count
    status_rows = frappe.get_all(
        "SoulPlace Appointment",
        fields=["status", "count(name) as count"],
        group_by="status",
        limit=20,
    )
    trend = frappe.db.sql(
        """
        SELECT appointment_date AS date, COUNT(name) AS count
        FROM `tabSoulPlace Appointment`
        WHERE appointment_date >= DATE_SUB(%s, INTERVAL 13 DAY)
        GROUP BY appointment_date ORDER BY appointment_date
        """,
        today,
        as_dict=True,
    )
    approvals = frappe.get_all(
        "Doctor",
        fields=["approval_status", "count(name) as count"],
        group_by="approval_status",
        limit=20,
    )
    return {
        "totalPatients": count("PatientUser"),
        "totalDoctors": count("Doctor"),
        "pendingDoctors": count("Doctor", {"approval_status": "Pending"}),
        "todayAppointments": count("SoulPlace Appointment", {"appointment_date": today}),
        "activeConsultations": count("Consultation"),
        "cancelledAppointments": count("SoulPlace Appointment", {"status": "Cancelled"}),
        "appointmentStatuses": {row.status: row.count for row in status_rows},
        "appointmentTrend": trend,
        "doctorApprovals": {row.approval_status: row.count for row in approvals},
    }


@frappe.whitelist(allow_guest=True, methods=["GET"])
def health():
    return {"status": "ok"}
