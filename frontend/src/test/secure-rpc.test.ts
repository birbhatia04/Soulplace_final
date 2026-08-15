import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "../api/admin";
import { appointmentsApi } from "../api/appointments";
import { authApi, normalizeIndianPhone } from "../api/auth";
import { clearSessionTokens } from "../api/client";
import { consultationsApi } from "../api/consultations";
import { doctorsApi } from "../api/doctors";
import { patientsApi } from "../api/patients";
import { teleconsultApi } from "../api/teleconsult";

function ok(message: unknown = { name: "RECORD-1" }) {
  return Promise.resolve(new Response(JSON.stringify({ message }), { status: 200 }));
}

describe("secure portal RPC contracts", () => {
  beforeEach(() => {
    clearSessionTokens();
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation((input) =>
      String(input).includes("get_csrf_token") ? ok("csrf-token") : ok()
    );
  });

  it("normalizes Indian country codes consistently", () => {
    expect(normalizeIndianPhone("+91 98765 43210")).toBe("9876543210");
    expect(normalizeIndianPhone("98765-43210")).toBe("9876543210");
  });

  it("requests and verifies patient OTPs through rate-limited server methods", async () => {
    await authApi.requestPatientOtp("+91 98765 43210");
    await authApi.verifyPatientOtp({ phoneno: "+91 98765 43210", otp: "123456" });
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.some(([url]) => String(url).endsWith("soulplace.auth.request_patient_otp"))).toBe(true);
    const verify = calls.find(([url]) => String(url).endsWith("soulplace.auth.verify_patient_otp"));
    expect(JSON.parse(String(verify?.[1]?.body))).toMatchObject({
      phoneno: "9876543210",
      otp: "123456"
    });
  });

  it("submits doctor identity and proof together as multipart data", async () => {
    await authApi.registerDoctor({
      full_name: "Dr. Ada",
      email: "ada@example.com",
      mobile_number: "9876543210",
      password: "SecurePass123!",
      specialty: "Psychiatry",
      medical_registration: "MED-100",
      consultation_fee: 1200,
      avg_consult_duration_mins: 30,
      specialization_tags: "anxiety",
      teleconsult_enabled: true,
      professional_consent: true,
      consent_version: "1.0",
      verification: new File(["proof"], "proof.pdf", { type: "application/pdf" })
    });
    const registration = vi.mocked(fetch).mock.calls.find(([url]) =>
      String(url).endsWith("soulplace.api.register_doctor")
    );
    const body = registration?.[1]?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("medical_registration")).toBe("MED-100");
    expect(body.get("professional_consent")).toBe("1");
    expect(body.get("verification")).toBeInstanceOf(File);
  });

  it("uses guarded status and reschedule transitions", async () => {
    await appointmentsApi.confirm("APT-1");
    await appointmentsApi.confirm(
      "APT-VIDEO",
      "https://meet.google.com/abc-defg-hij"
    );
    await appointmentsApi.complete("APT-1");
    await appointmentsApi.reject("APT-1", "Requested time no longer works");
    await appointmentsApi.reschedule("APT-1", "2026-09-01", "11:30", "Patient request");
    const bodies = vi.mocked(fetch).mock.calls
      .filter(([url]) => String(url).includes("soulplace.api."))
      .map(([, options]) => JSON.parse(String(options?.body)));
    expect(bodies).toContainEqual({ name: "APT-1", status: "Confirmed" });
    expect(bodies).toContainEqual({
      name: "APT-VIDEO",
      status: "Confirmed",
      meeting_link: "https://meet.google.com/abc-defg-hij"
    });
    expect(bodies).toContainEqual({ name: "APT-1", status: "Completed" });
    expect(bodies).toContainEqual({
      name: "APT-1",
      reason: "Requested time no longer works",
      status: "Cancelled"
    });
    expect(bodies).toContainEqual({
      name: "APT-1",
      appointment_date: "2026-09-01",
      appointment_time: "11:30",
      reason: "Patient request"
    });
  });

  it("submits rejected-doctor proof and manual Meet links through owned RPCs", async () => {
    await authApi.reapplyDoctor({
      verificationFileBase64: "data:application/pdf;base64,JVBERi0=",
      verificationFileName: "replacement.pdf"
    });
    await teleconsultApi.saveManualGoogleMeet(
      "APT-VIDEO",
      "https://meet.google.com/abc-defg-hij"
    );

    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.some(([url]) => String(url).endsWith("soulplace.api.reapply_doctor"))).toBe(true);
    const manualMeet = calls.find(([url]) =>
      String(url).endsWith("soulplace.api.save_manual_google_meet_session")
    );
    expect(JSON.parse(String(manualMeet?.[1]?.body))).toEqual({
      appointment: "APT-VIDEO",
      meeting_link: "https://meet.google.com/abc-defg-hij"
    });
  });

  it("loads doctors, appointments, and consultations through scoped RPCs", async () => {
    await doctorsApi.list({ limitPageLength: 25 });
    await doctorsApi.get("DOC-1");
    await appointmentsApi.list({ limitPageLength: 25 });
    await appointmentsApi.get("APT-1");
    await consultationsApi.list({ limitPageLength: 25 });
    await consultationsApi.get("CON-1");
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.endsWith("soulplace.api.list_portal_doctors"))).toBe(true);
    expect(urls.some((url) => url.endsWith("soulplace.api.get_portal_doctor"))).toBe(true);
    expect(urls.some((url) => url.endsWith("soulplace.api.list_portal_appointments"))).toBe(true);
    expect(urls.some((url) => url.endsWith("soulplace.api.get_portal_appointment"))).toBe(true);
    expect(urls.some((url) => url.endsWith("soulplace.api.list_portal_consultations"))).toBe(true);
    expect(urls.some((url) => url.endsWith("soulplace.api.get_portal_consultation"))).toBe(true);
  });

  it("keeps profile and schedule-exception writes behind owned RPCs", async () => {
    await patientsApi.update("PAT-IGNORED", { preferred_language: "Hindi" });
    await doctorsApi.update("DOC-IGNORED", { specialty: "Trauma care" });
    await doctorsApi.createScheduleException({
      practitioner: "DOC-IGNORED",
      exception_type: "Block",
      from_datetime: "2026-09-01 09:00:00",
      to_datetime: "2026-09-01 10:00:00",
      active: 1
    });
    await doctorsApi.deleteScheduleException("EX-1");
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.endsWith("soulplace.api.update_patient_profile"))).toBe(true);
    expect(urls.some((url) => url.endsWith("soulplace.api.update_doctor_profile"))).toBe(true);
    expect(urls.some((url) => url.endsWith("soulplace.api.create_schedule_exception"))).toBe(true);
    expect(urls.some((url) => url.endsWith("soulplace.api.delete_schedule_exception"))).toBe(true);
  });

  it("loads pre-aggregated administrator dashboard metrics", async () => {
    vi.mocked(fetch).mockImplementation((input) =>
      String(input).includes("get_csrf_token")
        ? ok("csrf-token")
        : ok({
            totalPatients: 10,
            totalDoctors: 3,
            pendingDoctors: 1,
            todayAppointments: 2,
            activeConsultations: 8,
            cancelledAppointments: 1,
            appointmentStatuses: { Confirmed: 2 },
            appointmentTrend: [],
            doctorApprovals: { Pending: 1, Approved: 2 }
          })
    );
    await expect(adminApi.dashboardStats()).resolves.toMatchObject({
      totalPatients: 10,
      pendingDoctors: 1,
      appointmentStatuses: { Confirmed: 2 }
    });
  });

  it("loads administrator doctor lists through the privileged RPC", async () => {
    await adminApi.doctors();
    await adminApi.pendingDoctors();

    const adminCalls = vi.mocked(fetch).mock.calls.filter(([url]) =>
      String(url).endsWith("soulplace.api.list_admin_doctors")
    );
    expect(adminCalls).toHaveLength(2);
    expect(JSON.parse(String(adminCalls[0][1]?.body))).toEqual({
      status: "",
      limit: 200
    });
    expect(JSON.parse(String(adminCalls[1][1]?.body))).toEqual({
      status: "Pending",
      limit: 200
    });
  });
});
