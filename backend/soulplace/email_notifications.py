import frappe
from frappe import _
from frappe.utils import escape_html, format_date, format_time, validate_email_address


INTERNAL_EMAIL_SUFFIX = "@soulplace.local"


def _usable_email(value):
    email = validate_email_address(value)
    if not email or "," in email or email.lower().endswith(INTERNAL_EMAIL_SUFFIX):
        return None
    return email


def _appointment_details(doc):
    return {
        "date": escape_html(format_date(doc.appointment_date)),
        "time": escape_html(format_time(doc.appointment_time)),
    }


def _queue_appointment_email(doc, recipient, subject, message):
    recipient = _usable_email(recipient)
    if not recipient:
        frappe.log_error(
            title=f"Appointment email skipped for {doc.name}",
            message="The intended recipient does not have a usable email address.",
        )
        return False

    try:
        frappe.sendmail(
            recipients=[recipient],
            subject=subject,
            message=message,
            reference_doctype=doc.doctype,
            reference_name=doc.name,
            add_unsubscribe_link=0,
            delayed=True,
            queue_separately=True,
            is_notification=True,
            redact_message_after_send=True,
        )
    except Exception:
        frappe.log_error(
            title=f"Unable to queue appointment email for {doc.name}",
            message=frappe.get_traceback(),
        )
        return False

    return True


def notify_doctor_of_appointment_request(doc):
    doctor = frappe.get_doc("Doctor", doc.doctor)
    patient = frappe.get_doc("PatientUser", doc.patient)
    details = _appointment_details(doc)
    doctor_name = escape_html(doctor.full_name or _("Doctor"))
    patient_name = escape_html(patient.name1 or _("A patient"))

    message = f"""
        <p>{_('Hello')} {doctor_name},</p>
        <p>{patient_name} {_('has requested an appointment with you.')}</p>
        <p><strong>{_('Date')}:</strong> {details['date']}<br>
        <strong>{_('Time')}:</strong> {details['time']}</p>
        <p>{_('Please sign in to SoulPlace to approve or cancel the request.')}</p>
        <p>{_('This is an automated message. Please do not reply.')}</p>
    """

    return _queue_appointment_email(
        doc,
        doctor.email,
        _("New SoulPlace appointment request"),
        message,
    )


def notify_doctor_of_reschedule_request(doc):
    doctor = frappe.get_doc("Doctor", doc.doctor)
    patient = frappe.get_doc("PatientUser", doc.patient)
    details = _appointment_details(doc)
    doctor_name = escape_html(doctor.full_name or _("Doctor"))
    patient_name = escape_html(patient.name1 or _("A patient"))

    message = f"""
        <p>{_('Hello')} {doctor_name},</p>
        <p>{patient_name} {_('has requested a new time for an appointment with you.')}</p>
        <p><strong>{_('Requested date')}:</strong> {details['date']}<br>
        <strong>{_('Requested time')}:</strong> {details['time']}</p>
        <p>{_('Please sign in to SoulPlace to accept or reject the reschedule request.')}</p>
        <p>{_('This is an automated message. Please do not reply.')}</p>
    """

    return _queue_appointment_email(
        doc,
        doctor.email,
        _("SoulPlace appointment reschedule request"),
        message,
    )


def notify_patient_of_appointment_status(doc):
    patient = frappe.get_doc("PatientUser", doc.patient)
    doctor = frappe.get_doc("Doctor", doc.doctor)
    details = _appointment_details(doc)
    patient_name = escape_html(patient.name1 or _("Patient"))
    doctor_name = escape_html(doctor.full_name or _("your doctor"))

    if doc.status == "Confirmed":
        subject = _("Your SoulPlace appointment is confirmed")
        status_message = _("Your appointment with {0} has been confirmed.").format(doctor_name)
    elif doc.status == "Cancelled":
        cancel_reason = escape_html(getattr(doc, "cancel_reason", "") or "")
        doctor_rejected = "please create a new appointment" in cancel_reason.lower()
        if doctor_rejected:
            subject = _("Your SoulPlace appointment request was declined")
            status_message = _("{0} could not accept your requested appointment time.").format(
                doctor_name
            )
            next_step = (
                f"<p>{cancel_reason}</p>"
                f"<p><strong>{_('Please create a new appointment to choose another available time.')}</strong></p>"
            )
        else:
            subject = _("Your SoulPlace appointment was cancelled")
            status_message = _("Your appointment request with {0} was cancelled.").format(doctor_name)
            next_step = f"<p>{cancel_reason}</p>" if cancel_reason else ""
    else:
        return False

    message = f"""
        <p>{_('Hello')} {patient_name},</p>
        <p>{status_message}</p>
        <p><strong>{_('Date')}:</strong> {details['date']}<br>
        <strong>{_('Time')}:</strong> {details['time']}</p>
        {next_step if doc.status == 'Cancelled' else ''}
        <p>{_('Please sign in to SoulPlace to view the appointment.')}</p>
        <p>{_('This is an automated message. Please do not reply.')}</p>
    """

    return _queue_appointment_email(doc, patient.email, subject, message)
