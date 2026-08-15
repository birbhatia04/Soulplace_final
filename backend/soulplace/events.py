"""Validation and immutable audit events for clinical scheduling records."""

from __future__ import annotations

import re
from urllib.parse import urlparse

import frappe
from frappe import _
from frappe.utils import add_to_date, get_datetime, now_datetime

from soulplace.email_notifications import (
    notify_doctor_of_appointment_request,
    notify_doctor_of_reschedule_request,
    notify_patient_of_appointment_status,
)

ACTIVE_APPOINTMENT_STATUSES = ("Pending", "Confirmed")
GOOGLE_MEET_PATH = re.compile(r"^/[a-z]{3}-[a-z]{4}-[a-z]{3}/?$")
GOOGLE_MEET_SPACE = re.compile(r"^spaces/[A-Za-z0-9_-]{1,128}$")
AUDIT_EVENT_BY_STATUS = {
    "Confirmed": "Confirmed",
    "Cancelled": "Cancelled",
    "Completed": "Completed",
}


def appointment_start(doc) -> object:
    if not doc.appointment_date or not doc.appointment_time:
        frappe.throw(_("Appointment date and time are required"))
    return get_datetime(f"{doc.appointment_date} {doc.appointment_time}")


def doctor_duration(doctor: str) -> int:
    duration = int(frappe.db.get_value("Doctor", doctor, "avg_consult_duration_mins") or 30)
    if duration < 5 or duration > 240:
        frappe.throw(_("Doctor consultation duration must be between 5 and 240 minutes"))
    return duration


def validate_appointment(doc, method=None):
    if not doc.patient or not doc.doctor:
        frappe.throw(_("Patient and doctor are required"))
    if doc.status not in ACTIVE_APPOINTMENT_STATUSES:
        return

    new_start = appointment_start(doc)
    schedule_changed = doc.is_new() or doc.has_value_changed("appointment_date") or doc.has_value_changed(
        "appointment_time"
    )
    if schedule_changed and new_start <= now_datetime():
        frappe.throw(_("Choose a future appointment time"))
    duration_mins = doctor_duration(doc.doctor)
    new_end = add_to_date(new_start, minutes=duration_mins)
    appointments = frappe.get_all(
        "SoulPlace Appointment",
        filters={
            "name": ("!=", doc.name or ""),
            "doctor": doc.doctor,
            "appointment_date": ("between", [new_start.date(), new_end.date()]),
            "status": ("in", ACTIVE_APPOINTMENT_STATUSES),
        },
        fields=["name", "appointment_date", "appointment_time"],
        limit=500,
    )
    for appointment in appointments:
        existing_start = get_datetime(
            f"{appointment.appointment_date} {appointment.appointment_time}"
        )
        existing_end = add_to_date(existing_start, minutes=duration_mins)
        if new_start < existing_end and new_end > existing_start:
            frappe.throw(
                _("This doctor already has appointment {0} during the selected time.").format(
                    appointment.name
                )
            )


def _actor_role() -> str:
    roles = set(frappe.get_roles(frappe.session.user))
    if "System Manager" in roles:
        return "Administrator"
    if "Doctor App User" in roles:
        return "Doctor"
    if "Patient App User" in roles:
        return "Patient"
    return "System"


def _write_audit(doc, event_type: str, previous_status: str = "", reason: str = ""):
    frappe.get_doc(
        {
            "doctype": "Appointment Audit Timeline",
            "appointment": doc.name,
            "event_type": event_type,
            "previous_status": previous_status,
            "new_status": doc.status,
            "actor_user": frappe.session.user,
            "actor_role": _actor_role(),
            "reason": reason,
            "event_time": now_datetime(),
        }
    ).insert(ignore_permissions=True)


def after_insert_appointment(doc, method=None):
    _write_audit(doc, "Created", reason="Appointment created")
    if doc.status == "Pending":
        notify_doctor_of_appointment_request(doc)


def _sync_teleconsult_session(doc, *, schedule_changed: bool, status_changed: bool):
    session_name = frappe.db.get_value(
        "Teleconsult Session", {"appointment": doc.name}, "name"
    )
    if not session_name:
        return

    updates = {}
    if schedule_changed:
        start = appointment_start(doc)
        updates.update(
            {
                "start_time": start,
                "end_time": add_to_date(start, minutes=doctor_duration(doc.doctor)),
            }
        )
    if status_changed and doc.status in {"Cancelled", "Completed"}:
        updates["session_status"] = doc.status
    if updates:
        frappe.db.set_value("Teleconsult Session", session_name, updates)


def on_update_appointment(doc, method=None):
    previous = doc.get_doc_before_save()
    if not previous:
        return

    date_changed = doc.has_value_changed("appointment_date")
    time_changed = doc.has_value_changed("appointment_time")
    status_changed = doc.has_value_changed("status")
    if not (date_changed or time_changed or status_changed):
        return

    _sync_teleconsult_session(
        doc,
        schedule_changed=date_changed or time_changed,
        status_changed=status_changed,
    )

    event_type = "Rescheduled" if date_changed or time_changed else AUDIT_EVENT_BY_STATUS.get(doc.status)
    if not event_type:
        return
    reason = getattr(doc, "cancel_reason", "") if event_type == "Cancelled" else ""
    _write_audit(doc, event_type, previous.status or "", reason or f"Appointment {event_type.lower()}")
    if date_changed or time_changed:
        notify_doctor_of_reschedule_request(doc)
    if status_changed and doc.status in {"Confirmed", "Cancelled"}:
        notify_patient_of_appointment_status(doc)


def validate_teleconsult(doc, method=None):
    required = {
        "appointment": doc.appointment,
        "practitioner": doc.practitioner,
        "patient": doc.patient,
        "provider": doc.provider,
        "meeting ID": doc.meeting_id,
        "meeting link": doc.meeting_link,
        "start time": doc.start_time,
        "end time": doc.end_time,
        "session status": doc.session_status,
    }
    missing = [label for label, value in required.items() if not value]
    if missing:
        frappe.throw(_("Teleconsult session is missing: {0}").format(", ".join(missing)))

    appointment = frappe.db.get_value(
        "SoulPlace Appointment",
        doc.appointment,
        ["doctor", "patient", "is_teleconsult"],
        as_dict=True,
    )
    if not appointment or not appointment.is_teleconsult:
        frappe.throw(_("Select a valid teleconsult appointment"))
    if appointment.doctor != doc.practitioner or appointment.patient != doc.patient:
        frappe.throw(_("Teleconsult participants must match the appointment"))
    if get_datetime(doc.end_time) <= get_datetime(doc.start_time):
        frappe.throw(_("Teleconsult end time must be after its start time"))

    parsed = urlparse(doc.meeting_link)
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or parsed.username
        or parsed.password
        or parsed.port
        or parsed.query
        or parsed.fragment
    ):
        frappe.throw(_("Meeting links must use HTTPS"))
    if doc.provider == "Google Meet":
        if parsed.hostname != "meet.google.com" or not GOOGLE_MEET_PATH.fullmatch(parsed.path):
            frappe.throw(_("Google Meet links must use a canonical meet.google.com URL"))
        if not GOOGLE_MEET_SPACE.fullmatch(doc.meeting_id):
            frappe.throw(_("Google Meet sessions require a valid space identifier"))
