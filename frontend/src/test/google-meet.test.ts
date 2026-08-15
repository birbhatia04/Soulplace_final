import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGoogleMeetSpaceWithToken,
  isGoogleMeetLink
} from "../api/googleMeet";

describe("Google Meet API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("creates a Meet space with an in-memory bearer token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: "spaces/space-1",
          meetingUri: "https://meet.google.com/abc-defg-hij",
          meetingCode: "abc-defg-hij"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(createGoogleMeetSpaceWithToken("short-lived-token")).resolves.toMatchObject({
      name: "spaces/space-1",
      meetingUri: "https://meet.google.com/abc-defg-hij"
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://meet.googleapis.com/v2/spaces",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer short-lived-token"
        }),
        body: JSON.stringify({})
      })
    );
  });

  it("rejects malformed or inconsistent Google space responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: "not-a-space",
          meetingUri: "https://meet.google.com/abc-defg-hij"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(createGoogleMeetSpaceWithToken("token")).rejects.toThrow(
      /incomplete meeting space/i
    );
  });

  it("surfaces actionable Google API errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("{}", { status: 429, headers: { "Content-Type": "application/json" } })
    );

    await expect(createGoogleMeetSpaceWithToken("token")).rejects.toThrow(
      /rate-limited/i
    );
  });

  it("does not expose Google account-policy implementation errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: "updateAccessType is not available to the user." }
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(createGoogleMeetSpaceWithToken("token")).rejects.toThrow(
      /cannot override its Meet access policy/i
    );
  });

  it("accepts only secure Google Meet join links", () => {
    expect(isGoogleMeetLink("https://meet.google.com/abc-defg-hij")).toBe(true);
    expect(isGoogleMeetLink("http://meet.google.com/abc-defg-hij")).toBe(false);
    expect(isGoogleMeetLink("https://meet.google.com.evil.test/abc-defg-hij")).toBe(false);
    expect(isGoogleMeetLink("https://meet.google.com/not-a-code")).toBe(false);
    expect(isGoogleMeetLink("https://meet.google.com/abc-defg-hij?redirect=1")).toBe(false);
    expect(isGoogleMeetLink("not a URL")).toBe(false);
  });
});
