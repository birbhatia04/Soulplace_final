import { describe, expect, it } from "vitest";
import { doctorGreetingName } from "../pages/doctor";

describe("doctorGreetingName", () => {
  it.each([
    ["Bir Bhatia", "Bir"],
    ["Dr. Bir Bhatia", "Bir"],
    ["Dr Bir Bhatia", "Bir"],
    ["dr. Bir Bhatia", "Bir"],
  ])("formats %s for the dashboard greeting", (fullName, expected) => {
    expect(doctorGreetingName(fullName)).toBe(expected);
  });
});
