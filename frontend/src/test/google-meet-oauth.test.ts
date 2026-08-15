import { afterEach, describe, expect, it, vi } from "vitest";

const clientId = "123456789-test.apps.googleusercontent.com";
const meetSpace = {
  name: "spaces/space-1",
  meetingUri: "https://meet.google.com/abc-defg-hij",
  meetingCode: "abc-defg-hij"
};

function installGoogleIdentity({
  granted = true,
  popupError
}: {
  granted?: boolean;
  popupError?: "popup_closed" | "popup_failed_to_open";
} = {}) {
  const initTokenClient = vi.fn((config: {
    callback(response: { access_token?: string; scope?: string }): void;
    error_callback?(error: { type: string }): void;
  }) => ({
    requestAccessToken: () => {
      if (popupError) {
        config.error_callback?.({ type: popupError });
      } else {
        config.callback({
          access_token: "short-lived-token",
          scope: "https://www.googleapis.com/auth/meetings.space.created"
        });
      }
    }
  }));
  Object.defineProperty(window, "google", {
    configurable: true,
    value: {
      accounts: {
        oauth2: {
          hasGrantedAllScopes: () => granted,
          initTokenClient
        }
      }
    }
  });
  return initTokenClient;
}

describe("Google Meet OAuth", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
    Reflect.deleteProperty(window, "google");
  });

  it("creates a restricted room after the required scope is granted", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", clientId);
    const initTokenClient = installGoogleIdentity();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(meetSpace), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    const { googleMeetApi } = await import("../api/googleMeet");

    await expect(
      googleMeetApi.createSpace({ loginHint: "doctor@clinic.example" })
    ).resolves.toEqual(meetSpace);
    expect(initTokenClient).toHaveBeenCalledWith(
      expect.objectContaining({ login_hint: "doctor@clinic.example" })
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://meet.googleapis.com/v2/spaces",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer short-lived-token"
        })
      })
    );
  });

  it("rejects a token that does not include meeting creation permission", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", clientId);
    installGoogleIdentity({ granted: false });
    const { googleMeetApi } = await import("../api/googleMeet");

    await expect(googleMeetApi.createSpace()).rejects.toThrow(
      /permission was not granted/i
    );
  });

  it("turns popup failures into an actionable recovery message", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", clientId);
    installGoogleIdentity({ popupError: "popup_failed_to_open" });
    const { googleMeetApi } = await import("../api/googleMeet");

    await expect(googleMeetApi.createSpace()).rejects.toThrow(/allow popups/i);
  });
});
