import type { Appointment } from "./types/domain";

export function isUpcomingAppointment(
  appointment: Appointment,
  today: string
) {
  return (
    appointment.appointment_date >= today &&
    ["Pending", "Confirmed"].includes(appointment.status)
  );
}

export function isPastAppointment(appointment: Appointment, today: string) {
  return (
    appointment.appointment_date < today ||
    ["Completed", "Cancelled"].includes(appointment.status)
  );
}

export function wasRejectedByDoctor(appointment: Appointment) {
  return (
    appointment.status === "Cancelled" &&
    appointment.cancel_reason?.toLowerCase().includes("please create a new appointment") === true
  );
}
