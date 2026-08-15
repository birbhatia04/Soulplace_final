import { beforeEach, describe, expect, it, vi } from "vitest";
import { authApi } from "../api/auth";
import { clearSessionTokens } from "../api/client";

function response(message: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify({ message }), {
      status,
      headers: { "Content-Type": "application/json" }
    })
  );
}

describe("authentication API contracts", () => {
  beforeEach(() => {
    clearSessionTokens();
    vi.restoreAllMocks();
  });

  it("restores the complete server-authorized portal identity", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: {
            status: "authenticated",
            username: "doctor@example.com",
            fullName: "Dr. Test",
            roles: ["Doctor App User"],
            portal: "doctor",
            doctor: {
              name: "DOC-1",
              full_name: "Dr. Test",
              approval_status: "Approved"
            }
          }
        }),
        { status: 200 }
      )
    );

    await expect(authApi.restore()).resolves.toMatchObject({
      status: "authenticated",
      username: "doctor@example.com",
      portal: "doctor",
      roles: ["Doctor App User"],
      doctor: { name: "DOC-1", approval_status: "Approved" }
    });
  });

  it("treats an explicit Guest identity as anonymous", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(() =>
      response({ status: "anonymous", username: "Guest" })
    );

    await expect(authApi.restore()).resolves.toEqual({
      status: "anonymous",
      roles: []
    });
  });

  it("normalizes email addresses before patient login", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementationOnce(() =>
      response({ success: true, user: { name: "patient@example.com" } })
    );

    await authApi.loginPatient(" Patient@Example.com ", "password");

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      usr: "patient@example.com",
      pwd: "password"
    });
  });

  it("requests standard password reset instructions using a normalized email", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementationOnce(() =>
      response(null)
    );

    await authApi.requestEmailPasswordReset(" Patient@Example.com ");

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      user: "patient@example.com"
    });
  });

  it("requests a patient reset link through the SoulPlace compatibility endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementationOnce(() =>
      response({ sent: true })
    );

    await authApi.requestPatientPasswordReset(" Patient@Example.com ");

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/api/method/soulplace.auth.request_patient_password_reset"
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      email: "patient@example.com"
    });
  });

  it("submits a reset key and new password to Frappe", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementationOnce(() =>
      response("/patient")
    );

    await authApi.completePasswordReset("reset-key", "NewPassword123!");

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/api/method/frappe.core.doctype.user.user.update_password"
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      key: "reset-key",
      new_password: "NewPassword123!",
      logout_all_sessions: 1
    });
  });

  it("validates a patient reset key before showing the password form", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementationOnce(() =>
      response({ valid: true })
    );

    await expect(authApi.validatePatientPasswordResetKey("reset-key"))
      .resolves.toEqual({ valid: true });

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/api/method/soulplace.auth.validate_patient_password_reset_key"
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      key: "reset-key"
    });
  });

  it("returns an anonymous session when restoration is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("offline"));

    await expect(authApi.restore()).resolves.toEqual({
      status: "anonymous",
      roles: []
    });
  });
});
