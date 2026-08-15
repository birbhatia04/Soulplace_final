import { beforeEach, describe, expect, it, vi } from "vitest";
import { appointmentsApi } from "../api/appointments";
import { consultationsApi } from "../api/consultations";
import { prescriptionsApi } from "../api/prescriptions";
import { consentsApi } from "../api/consents";
import { adminApi } from "../api/admin";
import { doctorsApi } from "../api/doctors";
import { authApi } from "../api/auth";
import { teleconsultApi } from "../api/teleconsult";
import { ApiError, request } from "../api/client";

function ok(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })
  );
}

describe("typed Frappe API workflows", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).includes("get_csrf_token")) {
        return ok("csrf-token");
      }
      return ok({ name: "DOC-0001" });
    });
  });

  it("books through the atomic server endpoint with consent", async () => {
    await appointmentsApi.book({
      doctor: "DOC-1",
      appointment_date: "2026-08-10",
      appointment_time: "10:30",
      symptoms: "Anxiety",
      booking_source: "Web",
      is_teleconsult: 1
    }, {
      privacy: true,
      telemedicine: true,
      version: "1.0"
    });
    const mutation = vi.mocked(fetch).mock.calls.find(([url]) =>
      String(url).includes("/api/method/soulplace.api.book_appointment")
    );
    expect(mutation).toBeDefined();
    expect(JSON.parse(String(mutation?.[1]?.body))).toMatchObject({
      doctor: "DOC-1",
      is_teleconsult: 1,
      privacy_consent: true,
      telemedicine_consent: true
    });
  });

  it("submits the complete patient registration contract", async () => {
    await authApi.registerPatient({
      phoneno: "",
      email: "patient@example.com",
      password: "SecurePass123!",
      name1: "Patient Name",
      age: 28,
      gender: "Female",
      livingstatus: "With family",
      therapyexp: "New to therapy",
      preferred_language: "English",
      emergency_contact_name: "Emergency Contact",
      emergency_contact_phone: "9876500000",
      consent_accepted: true,
      consent_version: "1.0"
    });

    const registration = vi.mocked(fetch).mock.calls.find(([url]) =>
      String(url).includes("/api/method/soulplace.auth.register_patient")
    );
    expect(registration).toBeDefined();
    expect(JSON.parse(String(registration?.[1]?.body))).toMatchObject({
      phoneno: "",
      email: "patient@example.com",
      preferred_language: "English",
      emergency_contact_name: "Emergency Contact",
      emergency_contact_phone: "9876500000",
      consent_accepted: true,
      consent_version: "1.0"
    });
  });

  it("submits a doctor application through the registration RPC", async () => {
    const verification = new File(["%PDF-1.4"], "registration.pdf", {
      type: "application/pdf"
    });
    await authApi.registerDoctor({
      full_name: "Doctor Name",
      email: "doctor@example.com",
      mobile_number: "9876543210",
      password: "SecurePass123!",
      specialty: "Clinical Psychology",
      medical_registration: "MED-12345",
      consultation_fee: 1200,
      avg_consult_duration_mins: 45,
      specialization_tags: "Anxiety, Stress",
      teleconsult_enabled: true,
      professional_consent: true,
      consent_version: "1.0",
      verification
    });

    const registration = vi.mocked(fetch).mock.calls.find(([url]) =>
      String(url).includes("/api/method/soulplace.api.register_doctor")
    );
    expect(registration).toBeDefined();
    const body = registration?.[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("full_name")).toBe("Doctor Name");
    expect((body as FormData).get("email")).toBe("doctor@example.com");
    expect((body as FormData).get("specialty")).toBe("Clinical Psychology");
    expect((body as FormData).get("verification")).toBe(verification);
  });

  it("cancels an appointment with its configured reason field", async () => {
    await appointmentsApi.cancel("APT-1", "Schedule conflict");
    const mutation = vi.mocked(fetch).mock.calls.find(([url]) =>
      String(url).endsWith("/api/method/soulplace.api.update_appointment_status")
    );
    expect(JSON.parse(String(mutation?.[1]?.body))).toEqual({
      name: "APT-1",
      status: "Cancelled",
      reason: "Schedule conflict"
    });
  });

  it("updates doctor approval, rejection, and availability through real Doctor fields", async () => {
    await adminApi.approveDoctor("DOC-1");
    await adminApi.rejectDoctor("DOC-1", "Registration could not be verified");
    await doctorsApi.saveSchedule({
      schedule_json: "{}",
      availability: "Weekdays 09:00–17:00",
      status: "Active",
      teleconsult_enabled: 1,
      avg_consult_duration_mins: 45
    });
    const reviews = vi.mocked(fetch).mock.calls.filter(([url]) =>
      String(url).endsWith("/api/method/soulplace.api.review_doctor")
    );
    expect(JSON.parse(String(reviews[0][1]?.body))).toMatchObject({
      name: "DOC-1",
      decision: "Approved"
    });
    expect(JSON.parse(String(reviews[1][1]?.body))).toMatchObject({
      name: "DOC-1",
      decision: "Rejected",
      reason: "Registration could not be verified"
    });
    const schedule = vi.mocked(fetch).mock.calls.find(([url]) =>
      String(url).endsWith("/api/method/soulplace.api.save_doctor_schedule")
    );
    expect(JSON.parse(String(schedule?.[1]?.body))).toMatchObject({
      teleconsult_enabled: 1,
      avg_consult_duration_mins: 45
    });
  });

  it("creates consultation, prescription, and consent records", async () => {
    await consultationsApi.create({
      appointment: "APT-1",
      doctor: "DOC-1",
      diagnosis: "Generalized anxiety",
      soap_plan: "Weekly follow-up"
    });
    await prescriptionsApi.create({
      consultation: "CON-1",
      medicine_name: "Medicine",
      dosage: "Once daily",
      instructions: "After food"
    });
    await consentsApi.grant("PAT-1", "Telemedicine");
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.endsWith("/api/method/soulplace.api.save_consultation"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/api/method/soulplace.api.save_prescription"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/api/method/soulplace.api.grant_consent"))).toBe(true);
  });

  it("persists a Google Meet link in the shared teleconsult session", async () => {
    await teleconsultApi.saveGoogleMeet(
      "APT-1",
      "spaces/meet-space-1",
      "https://meet.google.com/abc-defg-hij"
    );
    const mutation = vi.mocked(fetch).mock.calls.find(([url]) =>
      String(url).endsWith("/api/method/soulplace.api.save_google_meet_session")
    );
    expect(mutation).toBeDefined();
    expect(JSON.parse(String(mutation?.[1]?.body))).toMatchObject({
      appointment: "APT-1",
      meeting_id: "spaces/meet-space-1",
      meeting_link: "https://meet.google.com/abc-defg-hij"
    });
  });

  it("normalizes Frappe permission errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          _server_messages: JSON.stringify([
            JSON.stringify({ message: "Not permitted" })
          ])
        }),
        { status: 403, statusText: "Forbidden" }
      )
    );
    await expect(request("/api/resource/Appointment")).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
      code: "PERMISSION",
      message: "Not permitted"
    } satisfies Partial<ApiError>);
  });
});
