import { DEMO_MODE } from "./demo";

const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";
const GOOGLE_MEET_SPACES_ENDPOINT = "https://meet.googleapis.com/v2/spaces";
const GOOGLE_MEET_CREATE_SCOPE =
  "https://www.googleapis.com/auth/meetings.space.created";
const GOOGLE_MEET_CODE_PATTERN = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
const GOOGLE_MEET_SPACE_PATTERN = /^spaces\/[A-Za-z0-9_-]{1,128}$/;
const GOOGLE_REQUEST_TIMEOUT_MS = 15_000;
const GOOGLE_SCRIPT_TIMEOUT_MS = 10_000;
const GOOGLE_OAUTH_TIMEOUT_MS = 120_000;
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
const automatedCreationEnabled =
  import.meta.env.VITE_ENABLE_AUTOMATED_GOOGLE_MEET === "true";

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  scope?: string;
}

interface GoogleTokenClient {
  requestAccessToken(options?: { prompt?: string; login_hint?: string }): void;
}

interface GoogleOAuthError {
  type?: string;
  message?: string;
}

interface GoogleIdentityServices {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        login_hint?: string;
        callback(response: GoogleTokenResponse): void;
        error_callback?(error: GoogleOAuthError): void;
      }): GoogleTokenClient;
      hasGrantedAllScopes(
        response: GoogleTokenResponse,
        ...scopes: string[]
      ): boolean;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

export interface GoogleMeetSpace {
  name: string;
  meetingUri: string;
  meetingCode?: string;
}

export interface CreateGoogleMeetOptions {
  loginHint?: string;
}

let identityScriptPromise: Promise<void> | undefined;

function googleMeetConfigurationIssue() {
  if (!googleClientId) {
    return "Google Meet is not configured for this deployment.";
  }
  if (!googleClientId.endsWith(".apps.googleusercontent.com")) {
    return "The configured Google OAuth web client ID is invalid.";
  }
  return undefined;
}

function loadGoogleIdentityServices() {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  if (identityScriptPromise) return identityScriptPromise;

  identityScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_IDENTITY_SCRIPT}"]`
    );
    const script = existing ?? document.createElement("script");
    const timeout = window.setTimeout(() => {
      identityScriptPromise = undefined;
      reject(new Error("Google authorization took too long to load. Please try again."));
    }, GOOGLE_SCRIPT_TIMEOUT_MS);

    const finish = () => {
      window.clearTimeout(timeout);
      if (window.google?.accounts.oauth2) {
        resolve();
      } else {
        reject(new Error("Google authorization could not be initialized."));
      }
    };
    const fail = () => {
      window.clearTimeout(timeout);
      identityScriptPromise = undefined;
      reject(new Error("Google authorization could not be loaded. Check your connection and try again."));
    };

    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", fail, { once: true });
    if (!existing) {
      script.src = GOOGLE_IDENTITY_SCRIPT;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  return identityScriptPromise;
}

function normalizeLoginHint(value?: string) {
  const hint = value?.trim();
  if (!hint || hint.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hint)) {
    return undefined;
  }
  return hint;
}

async function requestGoogleAccessToken(loginHint?: string) {
  const configurationIssue = googleMeetConfigurationIssue();
  if (configurationIssue) throw new Error(configurationIssue);

  await loadGoogleIdentityServices();
  return new Promise<string>((resolve, reject) => {
    const oauth = window.google?.accounts.oauth2;
    if (!oauth) {
      reject(new Error("Google authorization is unavailable. Please refresh and try again."));
      return;
    }

    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      callback();
    };
    const timeout = window.setTimeout(
      () =>
        finish(() =>
          reject(
            new Error(
              "Google authorization did not finish in time. Close any stale Google popup and try again."
            )
          )
        ),
      GOOGLE_OAUTH_TIMEOUT_MS
    );
    const accountHint = normalizeLoginHint(loginHint);
    const client = oauth.initTokenClient({
      client_id: googleClientId!,
      scope: GOOGLE_MEET_CREATE_SCOPE,
      ...(accountHint ? { login_hint: accountHint } : {}),
      callback(response) {
        if (response.access_token) {
          if (!oauth.hasGrantedAllScopes(response, GOOGLE_MEET_CREATE_SCOPE)) {
            finish(() =>
              reject(
                new Error(
                  "Google Meet permission was not granted. Allow meeting creation and try again."
                )
              )
            );
            return;
          }
          finish(() => resolve(response.access_token!));
          return;
        }
        finish(() =>
          reject(
            new Error(
              response.error_description ||
                "Google Meet access was not granted. Choose a Google account and allow meeting creation."
            )
          )
        );
      },
      error_callback(error) {
        finish(() =>
          reject(
            new Error(
              error.message ||
                (error.type === "popup_closed"
                  ? "Google authorization was closed before it finished."
                  : error.type === "popup_failed_to_open"
                    ? "Google authorization could not open. Allow popups for SoulPlace and try again."
                    : "Google authorization could not be completed.")
            )
          )
        );
      }
    });
    client.requestAccessToken({ prompt: "select_account" });
  });
}

export async function createGoogleMeetSpaceWithToken(accessToken: string) {
  if (!accessToken.trim()) throw new Error("Google authorization is missing. Please try again.");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), GOOGLE_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(GOOGLE_MEET_SPACES_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      // Consumer Google accounts cannot update accessType or moderation while
      // creating a space. An empty Space request lets Google apply the
      // account's default: RESTRICTED for consumer accounts, or the policy
      // selected by a Google Workspace administrator.
      body: JSON.stringify({})
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Google Meet did not respond in time. Please try again.", {
        cause: error
      });
    }
    throw new Error("Google Meet could not be reached. Check your connection and try again.", {
      cause: error
    });
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      | { error?: { message?: string } }
      | undefined;
    const fallback =
      response.status === 401
        ? "Google authorization expired. Choose your Google account and try again."
        : response.status === 403
          ? "Google Meet creation is not allowed for this account. Check API access and OAuth consent."
          : response.status === 429
            ? "Google Meet creation is temporarily rate-limited. Wait a moment and try again."
            : response.status >= 500
              ? "Google Meet is temporarily unavailable. Please try again."
              : "Google Meet could not create the meeting. Confirm the Meet API is enabled and try again.";
    const googleMessage = payload?.error?.message || "";
    const accountPolicyMessage = /updateAccessType|updateModeration/i.test(
      googleMessage
    )
      ? "This Google account cannot override its Meet access policy. SoulPlace will use the account default instead. Please try again."
      : undefined;
    throw new Error(accountPolicyMessage || googleMessage || fallback);
  }

  const space = (await response.json()) as Partial<GoogleMeetSpace>;
  if (
    !space.name ||
    !GOOGLE_MEET_SPACE_PATTERN.test(space.name) ||
    !space.meetingUri ||
    !isGoogleMeetLink(space.meetingUri)
  ) {
    throw new Error("Google Meet created an incomplete meeting space. Please try again.");
  }
  const code = new URL(space.meetingUri).pathname.slice(1);
  if (space.meetingCode && space.meetingCode !== code) {
    throw new Error("Google Meet returned inconsistent meeting details. Please try again.");
  }
  return space as GoogleMeetSpace;
}

export function isGoogleMeetLink(value?: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "meet.google.com" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      GOOGLE_MEET_CODE_PATTERN.test(url.pathname.slice(1))
    );
  } catch {
    return false;
  }
}

export const googleMeetApi = {
  isAutomaticCreationEnabled: () => automatedCreationEnabled,
  isConfigured: () => DEMO_MODE || !googleMeetConfigurationIssue(),
  async createSpace(options: CreateGoogleMeetOptions = {}): Promise<GoogleMeetSpace> {
    if (DEMO_MODE) {
      return {
        name: `spaces/demo-${Date.now()}`,
        meetingCode: "abc-defg-hij",
        meetingUri: "https://meet.google.com/abc-defg-hij"
      };
    }
    const accessToken = await requestGoogleAccessToken(options.loginHint);
    return createGoogleMeetSpaceWithToken(accessToken);
  }
};
