from types import SimpleNamespace
from unittest.mock import patch

from frappe.tests.utils import FrappeTestCase

from soulplace.email_notifications import (
    notify_doctor_of_appointment_request,
    notify_doctor_of_reschedule_request,
    notify_patient_of_appointment_status,
)
from soulplace.events import on_update_appointment


class TestAppointmentEmailNotifications(FrappeTestCase):
    def setUp(self):
        self.format_date = patch(
            "soulplace.email_notifications.format_date", return_value="10 Aug 2026"
        )
        self.format_time = patch(
            "soulplace.email_notifications.format_time", return_value="10:30 AM"
        )
        self.format_date.start()
        self.format_time.start()
        self.addCleanup(self.format_date.stop)
        self.addCleanup(self.format_time.stop)
        self.appointment = SimpleNamespace(
            doctype="SoulPlace Appointment",
            name="APT-TEST-001",
            patient="PAT-TEST-001",
            doctor="DOC-TEST-001",
            appointment_date="2026-08-10",
            appointment_time="10:30:00",
            status="Pending",
        )
        self.patient = SimpleNamespace(name1="Patient Name", email="patient@example.com")
        self.doctor = SimpleNamespace(full_name="Doctor Name", email="doctor@example.com")

    def get_doc(self, doctype, name):
        return self.doctor if doctype == "Doctor" else self.patient

    @patch("soulplace.email_notifications.frappe.sendmail")
    @patch("soulplace.email_notifications.frappe.get_doc")
    def test_request_email_goes_to_doctor_using_configured_account(self, get_doc, sendmail):
        get_doc.side_effect = self.get_doc

        self.assertTrue(notify_doctor_of_appointment_request(self.appointment))

        arguments = sendmail.call_args.kwargs
        self.assertEqual(arguments["recipients"], ["doctor@example.com"])
        self.assertNotIn("reply_to", arguments)
        self.assertEqual(arguments["reference_doctype"], "SoulPlace Appointment")
        self.assertNotIn("symptoms", arguments["message"].lower())
        self.assertTrue(arguments["delayed"])

    @patch("soulplace.email_notifications.frappe.sendmail")
    @patch("soulplace.email_notifications.frappe.get_doc")
    def test_confirmed_email_goes_to_patient(self, get_doc, sendmail):
        get_doc.side_effect = self.get_doc
        self.appointment.status = "Confirmed"

        self.assertTrue(notify_patient_of_appointment_status(self.appointment))

        arguments = sendmail.call_args.kwargs
        self.assertEqual(arguments["recipients"], ["patient@example.com"])
        self.assertNotIn("reply_to", arguments)
        self.assertIn("confirmed", arguments["subject"].lower())

    @patch("soulplace.email_notifications.frappe.sendmail")
    @patch("soulplace.email_notifications.frappe.get_doc")
    def test_reschedule_request_email_goes_to_doctor(self, get_doc, sendmail):
        get_doc.side_effect = self.get_doc

        self.assertTrue(notify_doctor_of_reschedule_request(self.appointment))

        arguments = sendmail.call_args.kwargs
        self.assertEqual(arguments["recipients"], ["doctor@example.com"])
        self.assertIn("reschedule", arguments["subject"].lower())
        self.assertIn("accept or reject", arguments["message"].lower())

    @patch("soulplace.email_notifications.frappe.sendmail")
    @patch("soulplace.email_notifications.frappe.get_doc")
    def test_cancelled_email_goes_to_patient(self, get_doc, sendmail):
        get_doc.side_effect = self.get_doc
        self.appointment.status = "Cancelled"
        self.appointment.cancel_reason = "Patient cancelled"

        self.assertTrue(notify_patient_of_appointment_status(self.appointment))

        arguments = sendmail.call_args.kwargs
        self.assertEqual(arguments["recipients"], ["patient@example.com"])
        self.assertIn("cancelled", arguments["subject"].lower())

    @patch("soulplace.email_notifications.frappe.sendmail")
    @patch("soulplace.email_notifications.frappe.get_doc")
    def test_rejected_request_email_tells_patient_to_book_again(self, get_doc, sendmail):
        get_doc.side_effect = self.get_doc
        self.appointment.status = "Cancelled"
        self.appointment.cancel_reason = (
            "Doctor declined this appointment request: unavailable. "
            "Please create a new appointment."
        )

        self.assertTrue(notify_patient_of_appointment_status(self.appointment))

        arguments = sendmail.call_args.kwargs
        self.assertIn("declined", arguments["subject"].lower())
        self.assertIn("create a new appointment", arguments["message"].lower())

    @patch("soulplace.email_notifications.frappe.log_error")
    @patch("soulplace.email_notifications.frappe.sendmail")
    @patch("soulplace.email_notifications.frappe.get_doc")
    def test_internal_patient_login_address_is_not_emailed(self, get_doc, sendmail, log_error):
        get_doc.side_effect = self.get_doc
        self.patient.email = "9990099999@soulplace.local"
        self.appointment.status = "Confirmed"

        self.assertFalse(notify_patient_of_appointment_status(self.appointment))
        sendmail.assert_not_called()
        log_error.assert_called_once()

    @patch("soulplace.events.notify_patient_of_appointment_status")
    @patch("soulplace.events.now_datetime", return_value="2026-08-09 14:00:00")
    @patch("soulplace.events.frappe.get_doc")
    def test_confirmed_status_update_invokes_patient_notification(
        self, get_doc, _now_datetime, notify_patient
    ):
        audit_entry = SimpleNamespace(insert=lambda **kwargs: None)
        get_doc.return_value = audit_entry
        appointment = SimpleNamespace(
            name="APT-TEST-001",
            status="Confirmed",
            appointment_date="2026-08-10",
            appointment_time="10:30:00",
            cancel_reason=None,
            is_new=lambda: False,
            has_value_changed=lambda field: field == "status",
            get_doc_before_save=lambda: SimpleNamespace(status="Pending"),
        )

        on_update_appointment(appointment, None)

        self.assertEqual(get_doc.call_args.args[0]["event_type"], "Confirmed")
        notify_patient.assert_called_once_with(appointment)
