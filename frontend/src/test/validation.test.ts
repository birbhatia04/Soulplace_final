import { describe, expect, it } from "vitest";
import {
  FILE_LIMIT_BYTES,
  InputValidationError,
  normalizeEmail,
  normalizeIndianPhone,
  validateAppointmentBooking,
  validateDoctorRegistration,
  validateGoogleMeet,
  validatePatientProfile,
  validatePatientRegistration,
  validateSchedule
} from "../validation";

const patient = {
  phoneno: "+91 98765 43210",
  email: " Person@Example.com ",
  password: "long-enough-password",
  name1: "  Test   Patient ",
  age: 28,
  gender: "Female",
  livingstatus: "With family",
  therapyexp: "New to therapy",
  preferred_language: "English",
  emergency_contact_name: "Trusted Person",
  emergency_contact_phone: "9123456789",
  consent_accepted: true,
  consent_version: "1.0"
};

describe("production input validation", () => {
  it("normalizes emails, Indian phones, and patient names", () => {
    expect(normalizeIndianPhone("+91 98765-43210")).toBe("9876543210");
    expect(normalizeEmail(" Person@Example.com ")).toBe("person@example.com");
    expect(validatePatientRegistration(patient)).toMatchObject({
      phoneno: "9876543210",
      email: "person@example.com",
      name1: "Test Patient"
    });
  });

  it("allows patient registration without a phone number", () => {
    expect(validatePatientRegistration({ ...patient, phoneno: "" })).toMatchObject({
      phoneno: "",
      email: "person@example.com"
    });
  });

  it.each([
    [{ ...patient, age: 12 }, "Age must be between 13 and 120."],
    [{ ...patient, password: "short" }, "Password must contain at least 8 characters."],
    [{ ...patient, consent_accepted: false }, "Privacy and treatment consent is required."],
    [{ ...patient, email: "not-an-email" }, "Enter a valid email address."]
  ])("rejects invalid patient registration data", (input, message) => {
    expect(() => validatePatientRegistration(input)).toThrow(message);
  });

  it("rejects appointment requests without required consent and a reason", () => {
    expect(() => validateAppointmentBooking({
      doctor: "DOC-1",
      appointment_date: "2026-09-01",
      appointment_time: "10:30",
      symptoms: "",
      is_teleconsult: 1
    }, { privacy: true, telemedicine: true, version: "1.0" })).toThrow("Reason for visit is required.");

    expect(() => validateAppointmentBooking({
      doctor: "DOC-1",
      appointment_date: "2026-09-01",
      appointment_time: "10:30",
      symptoms: "Anxiety",
      is_teleconsult: 1
    }, { privacy: true, telemedicine: false, version: "1.0" })).toThrow("Telemedicine consent is required");
  });

  it("rejects invalid calendar dates and time values", () => {
    expect(() => validateAppointmentBooking({
      doctor: "DOC-1",
      appointment_date: "2026-02-30",
      appointment_time: "25:00",
      symptoms: "Anxiety",
      is_teleconsult: 0
    }, { privacy: true, telemedicine: false, version: "1.0" })).toThrow("Enter a valid date.");
  });

  it("rejects oversized or disguised doctor verification uploads", () => {
    const base = {
      full_name: "Doctor Test",
      email: "doctor@example.com",
      mobile_number: "9876543210",
      password: "long-enough-password",
      specialty: "Psychiatry",
      medical_registration: "MED-123",
      consultation_fee: 1000,
      avg_consult_duration_mins: 30,
      specialization_tags: "Trauma",
      professional_consent: true,
      consent_version: "1.0"
    };
    expect(() => validateDoctorRegistration({
      ...base,
      verification: new File(["content"], "proof.exe", { type: "application/octet-stream" })
    })).toThrow("Verification must be a PDF, PNG, or JPEG.");
    expect(() => validateDoctorRegistration({
      ...base,
      verification: new File([new Uint8Array(FILE_LIMIT_BYTES + 1)], "proof.pdf", { type: "application/pdf" })
    })).toThrow("5 MB or smaller");
  });

  it("only accepts canonical Google Meet URLs", () => {
    expect(validateGoogleMeet("APT-1", "spaces/example", "https://meet.google.com/abc-defg-hij")).toMatchObject({
      appointment: "APT-1",
      meeting_link: "https://meet.google.com/abc-defg-hij"
    });
    expect(() => validateGoogleMeet("APT-1", "id", "https://meet.google.com.evil.test/abc-defg-hij")).toThrow("valid https://meet.google.com");
    expect(() => validateGoogleMeet("APT-1", "id", "https://meet.google.com/not-a-code")).toThrow("valid https://meet.google.com");
  });

  it("strips non-editable fields from profile writes", () => {
    expect(validatePatientProfile({
      name: "PAT-OTHER",
      app_user: "Administrator",
      name1: "Patient Name",
      age: 30
    })).toEqual({ name1: "Patient Name", age: 30 });
  });

  it("rejects malformed and duplicate schedule slots", () => {
    expect(() => validateSchedule({
      schedule_json: JSON.stringify({ Monday: { Morning: ["09:00", "09:00"] } })
    })).toThrow("duplicate times");
  });

  it("exposes field-specific errors for forms", () => {
    try {
      normalizeEmail("invalid");
      throw new Error("Expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(InputValidationError);
      expect((error as InputValidationError).fieldErrors.email).toBeTruthy();
    }
  });
});
