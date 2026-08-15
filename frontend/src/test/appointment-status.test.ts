import { describe, expect, it } from "vitest";
import { isPastAppointment, isUpcomingAppointment } from "../appointmentStatus";
import type { Appointment } from "../types/domain";

const appointment: Appointment = {
  name: "APT-1",
  patient: "PAT-1",
  doctor: "DOC-1",
  appointment_date: "2026-08-16",
  appointment_time: "10:30:00",
  status: "Confirmed"
};

describe("appointment view classification", () => {
  it("moves a completed future-dated appointment from upcoming to past", () => {
    const completed = { ...appointment, status: "Completed" as const };

    expect(isUpcomingAppointment(completed, "2026-08-15")).toBe(false);
    expect(isPastAppointment(completed, "2026-08-15")).toBe(true);
  });

  it("keeps active future appointments in upcoming views", () => {
    expect(isUpcomingAppointment(appointment, "2026-08-15")).toBe(true);
    expect(isPastAppointment(appointment, "2026-08-15")).toBe(false);
  });
});
