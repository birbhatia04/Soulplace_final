"""Record-level permission rules for the Soulplace patient and doctor portals."""

from __future__ import annotations

from typing import Any

import frappe

PATIENT_ROLE = "Patient App User"
DOCTOR_ROLE = "Doctor App User"
PRIVILEGED_ROLES = {"System Manager", "Administrator"}


def _user(user: str | None = None) -> str:
    return user or frappe.session.user


def _roles(user: str | None = None) -> set[str]:
    resolved = _user(user)
    if resolved == "Administrator":
        return {"Administrator", "System Manager"}
    return set(frappe.get_roles(resolved))


def is_privileged(user: str | None = None) -> bool:
    return bool(_roles(user) & PRIVILEGED_ROLES)


def current_patient(user: str | None = None) -> str | None:
    resolved = _user(user)
    patient = frappe.db.get_value("PatientUser", {"app_user": resolved}, "name")
    if patient:
        return patient

    # Compatibility for profiles created before app_user was introduced.
    phone = resolved.split("@", 1)[0] if "@" in resolved else resolved
    return frappe.db.get_value("PatientUser", {"phoneno": phone}, "name")


def current_doctor(user: str | None = None) -> str | None:
    resolved = _user(user)
    doctor = frappe.db.get_value("Doctor", {"app_user": resolved}, "name")
    if doctor:
        return doctor
    return frappe.db.get_value("Doctor", {"email": resolved}, "name")


def _escape(value: str) -> str:
    return frappe.db.escape(value)


def _deny() -> str:
    return "1 = 0"


def appointment_query(user: str | None = None) -> str | None:
    if is_privileged(user):
        return None
    roles = _roles(user)
    if PATIENT_ROLE in roles and (patient := current_patient(user)):
        return f"`tabSoulPlace Appointment`.`patient` = {_escape(patient)}"
    if DOCTOR_ROLE in roles and (doctor := current_doctor(user)):
        return f"`tabSoulPlace Appointment`.`doctor` = {_escape(doctor)}"
    return _deny()


def doctor_query(user: str | None = None) -> str | None:
    if is_privileged(user):
        return None
    roles = _roles(user)
    if PATIENT_ROLE in roles:
        return "`tabDoctor`.`approval_status` = 'Approved' AND `tabDoctor`.`status` = 'Active'"
    if DOCTOR_ROLE in roles and (doctor := current_doctor(user)):
        return f"`tabDoctor`.`name` = {_escape(doctor)}"
    return _deny()


def patient_query(user: str | None = None) -> str | None:
    if is_privileged(user):
        return None
    roles = _roles(user)
    if PATIENT_ROLE in roles and (patient := current_patient(user)):
        return f"`tabPatientUser`.`name` = {_escape(patient)}"
    if DOCTOR_ROLE in roles and (doctor := current_doctor(user)):
        return (
            "EXISTS (SELECT 1 FROM `tabSoulPlace Appointment` a "
            "WHERE a.patient = `tabPatientUser`.name "
            f"AND a.doctor = {_escape(doctor)})"
        )
    return _deny()


def consultation_query(user: str | None = None) -> str | None:
    if is_privileged(user):
        return None
    roles = _roles(user)
    if DOCTOR_ROLE in roles and (doctor := current_doctor(user)):
        return f"`tabConsultation`.`doctor` = {_escape(doctor)}"
    if PATIENT_ROLE in roles and (patient := current_patient(user)):
        return (
            "EXISTS (SELECT 1 FROM `tabSoulPlace Appointment` a "
            "WHERE a.name = `tabConsultation`.appointment "
            f"AND a.patient = {_escape(patient)})"
        )
    return _deny()


def prescription_query(user: str | None = None) -> str | None:
    if is_privileged(user):
        return None
    roles = _roles(user)
    if DOCTOR_ROLE in roles and (doctor := current_doctor(user)):
        return (
            "EXISTS (SELECT 1 FROM `tabConsultation` c "
            "WHERE c.name = `tabPrescription`.consultation "
            f"AND c.doctor = {_escape(doctor)})"
        )
    if PATIENT_ROLE in roles and (patient := current_patient(user)):
        return (
            "EXISTS (SELECT 1 FROM `tabConsultation` c "
            "INNER JOIN `tabSoulPlace Appointment` a ON a.name = c.appointment "
            "WHERE c.name = `tabPrescription`.consultation "
            f"AND a.patient = {_escape(patient)})"
        )
    return _deny()


def consent_query(user: str | None = None) -> str | None:
    if is_privileged(user):
        return None
    if PATIENT_ROLE in _roles(user) and (patient := current_patient(user)):
        return f"`tabPatient Consent Record`.`patient` = {_escape(patient)}"
    return _deny()


def teleconsult_query(user: str | None = None) -> str | None:
    if is_privileged(user):
        return None
    roles = _roles(user)
    if PATIENT_ROLE in roles and (patient := current_patient(user)):
        return f"`tabTeleconsult Session`.`patient` = {_escape(patient)}"
    if DOCTOR_ROLE in roles and (doctor := current_doctor(user)):
        return f"`tabTeleconsult Session`.`practitioner` = {_escape(doctor)}"
    return _deny()


def schedule_exception_query(user: str | None = None) -> str | None:
    if is_privileged(user):
        return None
    if DOCTOR_ROLE in _roles(user) and (doctor := current_doctor(user)):
        return f"`tabDoctor Schedule Exception`.`practitioner` = {_escape(doctor)}"
    return _deny()


def appointment_audit_query(user: str | None = None) -> str | None:
    if is_privileged(user):
        return None
    roles = _roles(user)
    if PATIENT_ROLE in roles and (patient := current_patient(user)):
        return (
            "EXISTS (SELECT 1 FROM `tabSoulPlace Appointment` a "
            "WHERE a.name = `tabAppointment Audit Timeline`.appointment "
            f"AND a.patient = {_escape(patient)})"
        )
    if DOCTOR_ROLE in roles and (doctor := current_doctor(user)):
        return (
            "EXISTS (SELECT 1 FROM `tabSoulPlace Appointment` a "
            "WHERE a.name = `tabAppointment Audit Timeline`.appointment "
            f"AND a.doctor = {_escape(doctor)})"
        )
    return _deny()


def _document_allowed(doc: Any, user: str | None = None) -> bool:
    if is_privileged(user):
        return True
    roles = _roles(user)
    doctype = doc.doctype

    if doctype == "SoulPlace Appointment":
        return bool(
            (PATIENT_ROLE in roles and doc.patient == current_patient(user))
            or (DOCTOR_ROLE in roles and doc.doctor == current_doctor(user))
        )
    if doctype == "Doctor":
        return bool(
            (PATIENT_ROLE in roles and doc.approval_status == "Approved" and doc.status == "Active")
            or (DOCTOR_ROLE in roles and doc.name == current_doctor(user))
        )
    if doctype == "PatientUser":
        if PATIENT_ROLE in roles:
            return doc.name == current_patient(user)
        if DOCTOR_ROLE in roles and (doctor := current_doctor(user)):
            return bool(frappe.db.exists("SoulPlace Appointment", {"patient": doc.name, "doctor": doctor}))
    if doctype == "Consultation":
        if DOCTOR_ROLE in roles:
            return doc.doctor == current_doctor(user)
        if PATIENT_ROLE in roles:
            return frappe.db.get_value("SoulPlace Appointment", doc.appointment, "patient") == current_patient(user)
    if doctype == "Prescription":
        consultation = frappe.db.get_value(
            "Consultation", doc.consultation, ["appointment", "doctor"], as_dict=True
        )
        if not consultation:
            return False
        if DOCTOR_ROLE in roles:
            return consultation.doctor == current_doctor(user)
        if PATIENT_ROLE in roles:
            return (
                frappe.db.get_value("SoulPlace Appointment", consultation.appointment, "patient")
                == current_patient(user)
            )
    if doctype == "Patient Consent Record":
        return PATIENT_ROLE in roles and doc.patient == current_patient(user)
    if doctype == "Teleconsult Session":
        return bool(
            (PATIENT_ROLE in roles and doc.patient == current_patient(user))
            or (DOCTOR_ROLE in roles and doc.practitioner == current_doctor(user))
        )
    if doctype == "Doctor Schedule Exception":
        return DOCTOR_ROLE in roles and doc.practitioner == current_doctor(user)
    if doctype == "Appointment Audit Timeline":
        appointment = frappe.db.get_value(
            "SoulPlace Appointment", doc.appointment, ["patient", "doctor"], as_dict=True
        )
        return bool(
            appointment
            and (
                (PATIENT_ROLE in roles and appointment.patient == current_patient(user))
                or (DOCTOR_ROLE in roles and appointment.doctor == current_doctor(user))
            )
        )
    return False


def has_document_permission(doc: Any, user: str | None = None, permission_type: str | None = None) -> bool:
    """Restrict portal users to readable records; writes happen through audited RPCs."""
    if permission_type not in (None, "read", "select") and not is_privileged(user):
        return False
    return _document_allowed(doc, user)
