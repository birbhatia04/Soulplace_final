import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { syncAppointmentCache } from "../api/appointmentCache";
import type { Appointment, Paginated } from "../types/domain";

const confirmed: Appointment = {
  name: "APT-1",
  patient: "PAT-1",
  doctor: "DOC-1",
  appointment_date: "2026-08-16",
  appointment_time: "10:30:00",
  status: "Confirmed"
};

describe("appointment cache synchronization", () => {
  it("updates detail and portal list caches immediately after completion", async () => {
    const queryClient = new QueryClient();
    const doctorKey = ["appointments", "doctor", "DOC-1"];
    const patientKey = ["appointments", "patient", "PAT-1"];
    queryClient.setQueryData<Appointment>(["appointment", confirmed.name], confirmed);
    queryClient.setQueryData<Paginated<Appointment>>(doctorKey, { data: [confirmed] });
    queryClient.setQueryData<Paginated<Appointment>>(patientKey, { data: [confirmed] });

    const completed = { ...confirmed, status: "Completed" as const };
    await syncAppointmentCache(queryClient, completed);

    expect(queryClient.getQueryData(["appointment", confirmed.name])).toEqual(completed);
    expect(queryClient.getQueryData<Paginated<Appointment>>(doctorKey)?.data[0]).toEqual(completed);
    expect(queryClient.getQueryData<Paginated<Appointment>>(patientKey)?.data[0]).toEqual(completed);
    expect(queryClient.getQueryState(doctorKey)?.isInvalidated).toBe(true);
  });
});
