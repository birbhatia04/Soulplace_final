import {
  createRecord,
  callRpc,
  getRecord,
  listRecords,
  updateRecord
} from "./client";
import { DEMO_MODE } from "./demo";
import type {
  Appointment,
  AppointmentAuditTimeline,
  ListOptions
} from "../types/domain";
import {
  validateAppointmentBooking,
  validateCancellation,
  validateReschedule
} from "../validation";

export type AppointmentCreate = Pick<
  Appointment,
  | "patient"
  | "doctor"
  | "appointment_date"
  | "appointment_time"
  | "status"
  | "symptoms"
  | "booking_source"
  | "is_teleconsult"
>;

export const appointmentsApi = {
  list(options?: ListOptions<Appointment>) {
    if (!DEMO_MODE) {
      return callRpc<Appointment[]>("soulplace.api.list_portal_appointments", {
        limit: options?.limitPageLength ?? 100
      }).then((data) => ({ data }));
    }
    return listRecords<Appointment>("Appointment", {
      fields: ["*"],
      ...options
    });
  },
  get(name: string) {
    if (!DEMO_MODE) {
      return callRpc<Appointment>("soulplace.api.get_portal_appointment", { name });
    }
    return getRecord<Appointment>("Appointment", name);
  },
  create(values: Omit<Partial<Appointment>, "name">) {
    return createRecord<Appointment>("Appointment", values);
  },
  book(
    values: Omit<Partial<Appointment>, "name" | "patient" | "status">,
    consents: { privacy: boolean; telemedicine: boolean; version: string }
  ) {
    const validated = validateAppointmentBooking(values, consents);
    if (DEMO_MODE) {
      return createRecord<Appointment>("Appointment", {
        ...validated,
        patient: "PAT-DEMO-001",
        status: "Pending"
      });
    }
    return callRpc<Appointment>("soulplace.api.book_appointment", {
      doctor: validated.doctor,
      appointment_date: validated.appointment_date,
      appointment_time: validated.appointment_time,
      symptoms: validated.symptoms,
      is_teleconsult: validated.is_teleconsult,
      privacy_consent: consents.privacy,
      telemedicine_consent: consents.telemedicine,
      consent_version: consents.version
    });
  },
  cancel(name: string, reason: string) {
    const validated = validateCancellation(name, reason);
    if (DEMO_MODE) return updateRecord<Appointment>("Appointment", validated.name, { status: "Cancelled", cancel_reason: validated.reason });
    return callRpc<Appointment>("soulplace.api.update_appointment_status", { ...validated, status: "Cancelled" });
  },
  reject(name: string, reason: string) {
    const validated = validateCancellation(name, reason);
    if (DEMO_MODE) {
      return updateRecord<Appointment>("Appointment", validated.name, {
        status: "Cancelled",
        cancel_reason: `Doctor declined this appointment request: ${validated.reason}. Please create a new appointment.`
      });
    }
    return callRpc<Appointment>("soulplace.api.update_appointment_status", {
      ...validated,
      status: "Cancelled"
    });
  },
  confirm(name: string, meetingLink = "") {
    if (DEMO_MODE) return updateRecord<Appointment>("Appointment", name, { status: "Confirmed" });
    return callRpc<Appointment>("soulplace.api.update_appointment_status", {
      name,
      status: "Confirmed",
      ...(meetingLink ? { meeting_link: meetingLink } : {})
    });
  },
  complete(name: string) {
    if (DEMO_MODE) return updateRecord<Appointment>("Appointment", name, { status: "Completed" });
    return callRpc<Appointment>("soulplace.api.update_appointment_status", { name, status: "Completed" });
  },
  reschedule(name: string, appointment_date: string, appointment_time: string, reason = "") {
    const validated = validateReschedule(name, appointment_date, appointment_time, reason);
    if (DEMO_MODE) return updateRecord<Appointment>("Appointment", validated.name, {
      appointment_date: validated.appointment_date,
      appointment_time: validated.appointment_time,
      status: "Pending",
      cancel_reason: ""
    });
    return callRpc<Appointment>("soulplace.api.reschedule_appointment", validated);
  },
  timeline(appointment: string) {
    return listRecords<AppointmentAuditTimeline>(
      "Appointment Audit Timeline",
      {
        fields: ["*"],
        filters: [["appointment", "=", appointment]],
        orderBy: "event_time asc",
        limitPageLength: 100
      }
    );
  }
};
