import { describe, expect, it } from "vitest";
import { wasRejectedByDoctor } from "../appointmentStatus";
import type { Appointment } from "../types/domain";

const appointment = {
  name: "APT-1",
  patient: "PAT-1",
  doctor: "DOC-1",
  appointment_date: "2026-09-01",
  appointment_time: "11:30:00",
  status: "Cancelled"
} as Appointment;

describe("doctor appointment rejection", () => {
  it("recognizes the backend recovery guidance", () => {
    expect(wasRejectedByDoctor({
      ...appointment,
      cancel_reason: "Doctor declined this appointment request: unavailable. Please create a new appointment."
    })).toBe(true);
  });

  it("does not treat a patient cancellation as a doctor rejection", () => {
    expect(wasRejectedByDoctor({ ...appointment, cancel_reason: "Schedule conflict" })).toBe(false);
  });
});
