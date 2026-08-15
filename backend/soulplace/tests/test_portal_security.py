from __future__ import annotations

import base64
import uuid
from types import SimpleNamespace
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, getdate

from soulplace.api import (
    _decode_verification_upload,
    _verification_signature_matches,
    book_appointment,
    dashboard_stats,
    get_portal_appointment,
    get_portal_consultation,
    get_portal_doctor,
    list_admin_doctors,
    list_portal_doctors,
    list_portal_appointments,
    reapply_doctor,
    review_doctor,
    reschedule_appointment,
    save_google_meet_session,
    save_manual_google_meet_session,
    update_appointment_status,
    update_doctor_profile,
    update_patient_profile,
)
from soulplace.auth import (
    _boolean,
    _clean_text,
    _contact_email,
    _frontend_password_reset_link,
    _normalize_phone,
    _validate_password,
)
from soulplace.permissions import has_document_permission


class TestPortalSecurity(FrappeTestCase):
    def setUp(self):
        suffix = uuid.uuid4().hex[:10]
        self.patient_user = self._make_user(f"patient-{suffix}@example.com", "Patient App User")
        self.other_patient_user = self._make_user(
            f"patient-other-{suffix}@example.com", "Patient App User"
        )
        self.doctor_user = self._make_user(f"doctor-{suffix}@example.com", "Doctor App User")
        self.date = str(add_days(getdate(), 7))
        weekday = getdate(self.date).strftime("%A")
        self.patient = frappe.get_doc(
            {
                "doctype": "PatientUser",
                "phoneno": f"8{suffix[:9]}",
                "name1": "Portal Test Patient",
                "age": 30,
                "gender": "Female",
                "app_user": self.patient_user,
                "preferred_language": "English",
                "consent_status": "Granted",
            }
        ).insert(ignore_permissions=True)
        self.other_patient = frappe.get_doc(
            {
                "doctype": "PatientUser",
                "phoneno": f"7{suffix[:9]}",
                "name1": "Other Test Patient",
                "age": 31,
                "gender": "Male",
                "app_user": self.other_patient_user,
                "preferred_language": "English",
                "consent_status": "Granted",
            }
        ).insert(ignore_permissions=True)
        self.doctor = frappe.get_doc(
            {
                "doctype": "Doctor",
                "full_name": "Portal Test Doctor",
                "app_user": self.doctor_user,
                "specialty": "Psychiatry",
                "medical_registration": f"TEST-{suffix}",
                "mobile_number": "9000000000",
                "email": self.doctor_user,
                "consultation_fee": 1000,
                "status": "Active",
                "approval_status": "Approved",
                "avg_consult_duration_mins": 30,
                "teleconsult_enabled": 1,
                "schedule_json": frappe.as_json(
                    {weekday: {"Morning": ["10:00", "11:00", "12:00", "12:15"]}}
                ),
            }
        ).insert(ignore_permissions=True)

    def tearDown(self):
        frappe.set_user("Administrator")

    @staticmethod
    def _make_user(email: str, role: str) -> str:
        # The suite deliberately creates isolated users per test. Frappe's
        # production signup throttle is unrelated to these fixtures and can
        # otherwise make repeated local/CI runs fail based on existing data.
        with patch("frappe.core.doctype.user.user.throttle_user_creation"):
            user = frappe.get_doc(
                {
                    "doctype": "User",
                    "email": email,
                    "first_name": "Portal Test",
                    "send_welcome_email": 0,
                    "user_type": "Website User",
                }
            ).insert(ignore_permissions=True)
        user.add_roles(role)
        frappe.clear_cache(user=user.name)
        return user.name

    def _appointment(self, patient=None, time="10:00:00"):
        return frappe.get_doc(
            {
                "doctype": "SoulPlace Appointment",
                "patient": patient or self.patient.name,
                "doctor": self.doctor.name,
                "appointment_date": self.date,
                "appointment_time": time,
                "status": "Pending",
                "symptoms": "Test symptoms",
            }
        ).insert(ignore_permissions=True)

    def test_patient_can_read_only_owned_appointment(self):
        owned = self._appointment()
        other = self._appointment(patient=self.other_patient.name, time="11:00:00")
        frappe.set_user(self.patient_user)

        self.assertTrue(has_document_permission(owned, permission_type="read"))
        self.assertFalse(has_document_permission(other, permission_type="read"))
        self.assertFalse(has_document_permission(owned, permission_type="write"))
        visible = frappe.get_list("SoulPlace Appointment", pluck="name")
        self.assertIn(owned.name, visible)
        self.assertNotIn(other.name, visible)

        with patch("soulplace.api.frappe.get_roles", return_value=["All"]):
            with self.assertRaises(frappe.PermissionError):
                get_portal_appointment(owned.name)

    def test_booking_is_atomic_and_rejects_overlapping_slot(self):
        frappe.set_user(self.patient_user)
        first = book_appointment(
            self.doctor.name,
            self.date,
            "12:00:00",
            "Need a consultation",
            privacy_consent=1,
        )
        self.assertEqual(first["patient"], self.patient.name)
        with self.assertRaises(frappe.ValidationError):
            book_appointment(
                self.doctor.name,
                self.date,
                "12:15:00",
                "Overlapping consultation",
                privacy_consent=1,
            )

    def test_booking_rejects_unconfigured_slots_and_invalid_boolean_values(self):
        frappe.set_user(self.patient_user)
        with self.assertRaises(frappe.ValidationError):
            book_appointment(
                self.doctor.name,
                self.date,
                "13:00:00",
                "Need a consultation",
                privacy_consent=1,
            )
        with self.assertRaises(frappe.ValidationError):
            book_appointment(
                self.doctor.name,
                self.date,
                "11:00:00",
                "Need a consultation",
                privacy_consent=2,
            )

    def test_status_transitions_are_role_scoped(self):
        appointment = self._appointment()
        frappe.set_user(self.patient_user)
        with self.assertRaises(frappe.PermissionError):
            update_appointment_status(appointment.name, "Confirmed")

        frappe.set_user(self.doctor_user)
        confirmed = update_appointment_status(appointment.name, "Confirmed")
        self.assertEqual(confirmed["status"], "Confirmed")

    @patch("soulplace.events.notify_doctor_of_reschedule_request")
    def test_reschedule_requires_doctor_approval_and_rejection_cancels_request(
        self, notify_doctor
    ):
        appointment = self._appointment()
        frappe.set_user(self.doctor_user)
        update_appointment_status(appointment.name, "Confirmed")
        with self.assertRaises(frappe.PermissionError):
            reschedule_appointment(appointment.name, self.date, "11:00:00", "Move later")

        frappe.set_user(self.patient_user)
        updated = reschedule_appointment(
            appointment.name, self.date, "11:00:00", "A later time works better"
        )
        self.assertEqual(updated["status"], "Pending")
        self.assertEqual(str(updated["appointment_time"]), "11:00:00")
        notify_doctor.assert_called_once()

        frappe.set_user(self.doctor_user)
        rejected = update_appointment_status(
            appointment.name, "Cancelled", "Unavailable at the requested time"
        )
        self.assertEqual(rejected["status"], "Cancelled")
        self.assertIn("Please create a new appointment", rejected["cancel_reason"])

    def test_profile_edits_and_upload_signatures_are_validated(self):
        frappe.set_user(self.patient_user)
        with self.assertRaises(frappe.ValidationError):
            update_patient_profile({"age": 5})
        with self.assertRaises(frappe.ValidationError):
            update_patient_profile({"email": "invalid-email"})

        frappe.set_user(self.doctor_user)
        with self.assertRaises(frappe.ValidationError):
            update_doctor_profile({"consultation_fee": -1})

        self.assertTrue(_verification_signature_matches(b"%PDF-1.7 data", "application/pdf"))
        self.assertFalse(_verification_signature_matches(b"not a pdf", "application/pdf"))
        filename, content = _decode_verification_upload(
            "data:application/pdf;base64,"
            + base64.b64encode(b"%PDF-1.7 replacement proof").decode(),
            "replacement.pdf",
        )
        self.assertEqual(filename, "replacement.pdf")
        self.assertTrue(content.startswith(b"%PDF-"))

    @patch("frappe.utils.file_manager.save_file")
    def test_rejected_doctor_can_submit_replacement_verification(self, save_file):
        save_file.return_value = SimpleNamespace(file_url="/private/files/replacement.pdf")
        self.doctor.db_set("approval_status", "Rejected")
        self.doctor.db_set("status", "Inactive")
        self.doctor.db_set("rejection_reason", "Please upload a clearer document")
        frappe.set_user(self.doctor_user)

        result = reapply_doctor(
            "data:application/pdf;base64,"
            + base64.b64encode(b"%PDF-1.7 replacement proof").decode(),
            "replacement.pdf",
        )

        self.doctor.reload()
        self.assertTrue(result["success"])
        self.assertEqual(self.doctor.approval_status, "Pending")
        self.assertEqual(self.doctor.rejection_reason, "")
        self.assertEqual(self.doctor.verification_proof, "/private/files/replacement.pdf")

    def test_patient_registration_boundaries_reject_malformed_values(self):
        self.assertEqual(_normalize_phone(""), "")
        with patch("soulplace.auth.frappe.conf", {"frontend_url": "https://app.soulplace.test"}):
            self.assertEqual(
                _frontend_password_reset_link("https://api.soulplace.test/update-password?key=test-key"),
                "https://app.soulplace.test/patient/reset-password?key=test-key",
            )
        with self.assertRaises(frappe.ValidationError):
            _contact_email("not-an-email")
        with self.assertRaises(frappe.ValidationError):
            _validate_password("short")
        with self.assertRaises(frappe.ValidationError):
            _validate_password("x" * 129)
        with self.assertRaises(frappe.ValidationError):
            _boolean(2, "Consent acceptance")
        with self.assertRaises(frappe.ValidationError):
            _clean_text("x" * 141, 140, "Name")

    def test_google_meet_requires_confirmation_and_a_canonical_link(self):
        appointment = self._appointment()
        appointment.is_teleconsult = 1
        appointment.save(ignore_permissions=True)
        frappe.set_user(self.doctor_user)

        with self.assertRaises(frappe.ValidationError):
            save_google_meet_session(
                appointment.name,
                "spaces/test",
                "https://meet.google.com/abc-defg-hij",
            )

        update_appointment_status(
            appointment.name,
            "Confirmed",
            meeting_link="https://meet.google.com/abc-defg-hij",
        )
        with self.assertRaises(frappe.ValidationError):
            save_google_meet_session(
                appointment.name,
                "spaces/test",
                "https://meet.google.com.evil.test/abc-defg-hij",
            )

        session = save_manual_google_meet_session(
            appointment.name, "https://meet.google.com/abc-defg-hij"
        )
        self.assertEqual(session["provider"], "Google Meet")
        same_session = save_google_meet_session(
            appointment.name,
            "spaces/abc-defg-hij",
            "https://meet.google.com/abc-defg-hij",
        )
        self.assertEqual(same_session["name"], session["name"])

        with self.assertRaises(frappe.ValidationError):
            save_google_meet_session(
                appointment.name,
                "invalid-space-id",
                "https://meet.google.com/abc-defg-hij",
            )
        with self.assertRaises(frappe.ValidationError):
            save_google_meet_session(
                appointment.name,
                "spaces/another-room",
                "https://meet.google.com/xyz-abcd-efg",
            )

    def test_google_meet_requires_an_active_approved_doctor(self):
        appointment = self._appointment()
        appointment.is_teleconsult = 1
        appointment.save(ignore_permissions=True)
        frappe.set_user(self.doctor_user)
        update_appointment_status(appointment.name, "Confirmed")
        self.doctor.db_set("status", "Inactive")

        with self.assertRaises(frappe.ValidationError):
            save_google_meet_session(
                appointment.name,
                "spaces/test",
                "https://meet.google.com/abc-defg-hij",
            )

    def test_teleconsult_session_tracks_appointment_lifecycle(self):
        appointment = self._appointment()
        appointment.is_teleconsult = 1
        appointment.save(ignore_permissions=True)
        frappe.set_user(self.doctor_user)
        update_appointment_status(appointment.name, "Confirmed")
        session = save_google_meet_session(
            appointment.name,
            "spaces/test",
            "https://meet.google.com/abc-defg-hij",
        )

        appointment.reload()
        appointment.appointment_time = "11:00:00"
        appointment.save(ignore_permissions=True)
        synced = frappe.get_doc("Teleconsult Session", session["name"])
        self.assertEqual(str(synced.start_time.time()), "11:00:00")

        update_appointment_status(appointment.name, "Completed")
        synced.reload()
        self.assertEqual(synced.session_status, "Completed")

        cancelled_appointment = self._appointment(time="12:00:00")
        cancelled_appointment.is_teleconsult = 1
        cancelled_appointment.save(ignore_permissions=True)
        update_appointment_status(cancelled_appointment.name, "Confirmed")
        cancelled_session = save_google_meet_session(
            cancelled_appointment.name,
            "spaces/cancelled-test",
            "https://meet.google.com/xyz-abcd-efg",
        )
        update_appointment_status(
            cancelled_appointment.name,
            "Cancelled",
            "Patient requested cancellation",
        )
        self.assertEqual(
            frappe.db.get_value(
                "Teleconsult Session", cancelled_session["name"], "session_status"
            ),
            "Cancelled",
        )

    def test_dashboard_aggregates_are_frappe_v17_compatible(self):
        frappe.set_user("Administrator")
        stats = dashboard_stats()
        self.assertIn("appointmentStatuses", stats)
        self.assertIn("doctorApprovals", stats)

    def test_admin_doctor_list_is_privileged_and_supports_approval_filters(self):
        frappe.set_user(self.patient_user)
        with self.assertRaises(frappe.PermissionError):
            list_admin_doctors()

        frappe.set_user("Administrator")
        approved = list_admin_doctors(status="Approved")
        self.assertIn(self.doctor.name, {item.name for item in approved})
        self.assertTrue(all(item.approval_status == "Approved" for item in approved))
        self.assertIn("email", approved[0])

        with self.assertRaises(frappe.ValidationError):
            list_admin_doctors(status="Unknown")

    def test_portal_payloads_do_not_cross_patient_or_clinical_boundaries(self):
        owned = self._appointment()
        owned.notes = "Clinician-only appointment note"
        owned.save(ignore_permissions=True)
        other = self._appointment(patient=self.other_patient.name, time="11:00:00")
        consultation = frappe.get_doc(
            {
                "doctype": "Consultation",
                "appointment": owned.name,
                "doctor": self.doctor.name,
                "diagnosis": "Private diagnosis",
                "soap_plan": "Private clinical plan",
                "patient_friendly_summary": "Shared care summary",
            }
        ).insert(ignore_permissions=True)

        frappe.set_user(self.patient_user)
        visible = list_portal_appointments()
        self.assertIn(owned.name, {item.name for item in visible})
        self.assertNotIn(other.name, {item.name for item in visible})
        self.assertNotIn("notes", get_portal_appointment(owned.name))
        patient_view = get_portal_consultation(consultation.name)
        self.assertEqual(patient_view["patient_friendly_summary"], "Shared care summary")
        self.assertNotIn("diagnosis", patient_view)
        self.assertNotIn("soap_plan", patient_view)
        public_doctor = get_portal_doctor(self.doctor.name)
        self.assertIn(self.doctor.name, {item.name for item in list_portal_doctors()})
        self.assertNotIn("email", public_doctor)
        self.assertNotIn("medical_registration", public_doctor)
        self.assertNotIn("verification_proof", public_doctor)
        shared_consultation = frappe.get_list(
            "Consultation", filters={"name": consultation.name}, fields=["*"]
        )[0]
        self.assertNotIn("diagnosis", shared_consultation)
        self.assertNotIn("soap_plan", shared_consultation)

        frappe.set_user(self.doctor_user)
        doctor_view = get_portal_consultation(consultation.name)
        self.assertEqual(doctor_view["diagnosis"], "Private diagnosis")
        self.assertEqual(doctor_view["soap_plan"], "Private clinical plan")

    def test_unlinked_doctors_cannot_be_approved_or_discovered(self):
        suffix = uuid.uuid4().hex[:10]
        unlinked = frappe.get_doc(
            {
                "doctype": "Doctor",
                "full_name": "Unlinked Portal Doctor",
                "specialty": "Psychology",
                "medical_registration": f"UNLINKED-{suffix}",
                "status": "Active",
                "approval_status": "Approved",
            }
        ).insert(ignore_permissions=True)

        frappe.set_user(self.patient_user)
        self.assertNotIn(unlinked.name, {item.name for item in list_portal_doctors()})

        unlinked.db_set("approval_status", "Pending")
        frappe.set_user("Administrator")
        with self.assertRaises(frappe.ValidationError):
            review_doctor(unlinked.name, "Approved")
