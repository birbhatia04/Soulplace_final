import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_EXPIRED_EVENT,
  ApiError,
  clearSessionTokens,
  listRecords,
  normalizeApiError,
  request,
  uploadFile
} from "../api/client";

function jsonResponse(payload: unknown, status = 200, statusText = "OK") {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      statusText,
      headers: { "Content-Type": "application/json" }
    })
  );
}

describe("Frappe HTTP client", () => {
  beforeEach(() => {
    clearSessionTokens();
    vi.restoreAllMocks();
  });

  it("adds a CSRF token and credentials to state-changing requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).includes("get_csrf_token")) {
        return jsonResponse({ message: "csrf-value" });
      }
      return jsonResponse({ data: { name: "APT-1" } });
    });

    await request("/api/resource/Appointment", {
      method: "POST",
      body: { status: "Pending" }
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, mutationOptions] = fetchMock.mock.calls[1];
    const headers = new Headers(mutationOptions?.headers);
    expect(mutationOptions).toMatchObject({
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ status: "Pending" })
    });
    expect(headers.get("X-Frappe-CSRF-Token")).toBe("csrf-value");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("does not fetch a CSRF token for read-only requests", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: { name: "PAT-1" } }), {
          status: 200
        })
      );

    await expect(request<{ name: string }>("/api/resource/PatientUser/PAT-1"))
      .resolves.toEqual({ name: "PAT-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "GET",
      credentials: "include"
    });
  });

  it("preserves all decoded Frappe validation messages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          _server_messages: JSON.stringify([
            JSON.stringify({ message: "Appointment overlaps another slot" }),
            JSON.stringify({ message: "Choose another time" })
          ])
        }),
        { status: 422, statusText: "Unprocessable Entity" }
      )
    );

    await expect(request("/api/resource/Appointment"))
      .rejects.toMatchObject({
        name: "ApiError",
        status: 422,
        code: "VALIDATION",
        message: "Appointment overlaps another slot",
        details: ["Appointment overlaps another slot", "Choose another time"]
      } satisfies Partial<ApiError>);
  });

  it("treats Frappe's guest-only permission response as an expired session", async () => {
    const expired = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, expired, { once: true });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          _server_messages: JSON.stringify([
            JSON.stringify({
              message:
                "You are not permitted to access this resource. Login to access Function <strong>soulplace.api.list_portal_appointments</strong> is not whitelisted."
            })
          ])
        }),
        { status: 403, statusText: "Forbidden" }
      )
    );

    await expect(request("/api/method/soulplace.api.list_portal_appointments"))
      .rejects.toMatchObject({
        status: 403,
        code: "AUTHENTICATION",
        message: "Your session expired. Please sign in again."
      } satisfies Partial<ApiError>);
    expect(expired).toHaveBeenCalledOnce();
  });

  it("removes server HTML from permission errors without logging the user out", async () => {
    const expired = vi.fn();
    window.addEventListener(AUTH_EXPIRED_EVENT, expired, { once: true });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          _server_messages: JSON.stringify([
            JSON.stringify({ message: "Insufficient Permission for <strong>Doctor</strong>" })
          ])
        }),
        { status: 403, statusText: "Forbidden" }
      )
    );

    await expect(request("/api/method/soulplace.api.list_admin_doctors"))
      .rejects.toMatchObject({
        code: "PERMISSION",
        message: "Insufficient Permission for Doctor"
      } satisfies Partial<ApiError>);
    expect(expired).not.toHaveBeenCalled();
    window.removeEventListener(AUTH_EXPIRED_EVENT, expired);
  });

  it("normalizes network failures without leaking implementation details", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(request("/api/resource/Doctor"))
      .rejects.toMatchObject({ status: 0, code: "NETWORK" });
    expect(normalizeApiError("unknown")).toMatchObject({
      status: 0,
      code: "NETWORK",
      message: "Something went wrong."
    });
  });

  it("encodes filters, fields, ordering, and pagination for Frappe lists", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 })
    );

    await listRecords("Patient Consent Record", {
      fields: ["name", "status"],
      filters: [["patient", "=", "PAT-1"]],
      orderBy: "creation desc",
      limitStart: 20,
      limitPageLength: 10
    });

    const url = new URL(String(fetchMock.mock.calls[0][0]), "http://local.test");
    expect(url.pathname).toBe("/api/resource/Patient%20Consent%20Record");
    expect(JSON.parse(url.searchParams.get("fields") || "[]")).toEqual([
      "name",
      "status"
    ]);
    expect(JSON.parse(url.searchParams.get("filters") || "[]")).toEqual([
      ["patient", "=", "PAT-1"]
    ]);
    expect(url.searchParams.get("order_by")).toBe("creation desc");
    expect(url.searchParams.get("limit_start")).toBe("20");
    expect(url.searchParams.get("limit_page_length")).toBe("10");
  });

  it("uploads private files as multipart data without forcing a JSON content type", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      if (String(input).includes("get_csrf_token")) {
        return jsonResponse({ message: "csrf-value" });
      }
      return jsonResponse({
        message: { file_url: "/private/files/proof.pdf", name: "proof.pdf" }
      });
    });
    const file = new File(["proof"], "proof.pdf", { type: "application/pdf" });

    await uploadFile(file, true);

    const [, uploadOptions] = fetchMock.mock.calls[1];
    const headers = new Headers(uploadOptions?.headers);
    expect(uploadOptions?.body).toBeInstanceOf(FormData);
    expect(headers.has("Content-Type")).toBe(false);
    expect((uploadOptions?.body as FormData).get("is_private")).toBe("1");
  });
});
