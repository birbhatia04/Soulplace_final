import {
  createRecord,
  callRpc,
  deleteRecord,
  getRecord,
  listRecords,
  updateRecord,
  request
} from "./client";
import { DEMO_MODE } from "./demo";
import type {
  Doctor,
  DoctorScheduleException,
  ListOptions
} from "../types/domain";
import {
  validateDoctorProfile,
  validateSchedule,
  validateScheduleException
} from "../validation";

export const doctorsApi = {
  list(options?: ListOptions<Doctor>) {
    if (DEMO_MODE) {
      return listRecords<Doctor>("Doctor", { fields: ["*"], ...options });
    }
    return callRpc<Doctor[]>("soulplace.api.list_portal_doctors", {
      limit: options?.limitPageLength ?? 100
    }).then((data) => ({ data }));
  },
  get(name: string) {
    if (DEMO_MODE) return getRecord<Doctor>("Doctor", name);
    return callRpc<Doctor>("soulplace.api.get_portal_doctor", { name });
  },
  update(name: string, values: Partial<Doctor>) {
    const validated = validateDoctorProfile(values as Record<string, unknown>) as Partial<Doctor>;
    if (DEMO_MODE) return updateRecord<Doctor>("Doctor", name, validated);
    return callRpc<Doctor>("soulplace.api.update_doctor_profile", { values: validated });
  },
  saveSchedule(values: {
    schedule_json: string;
    availability?: string;
    status?: Doctor["status"];
    teleconsult_enabled?: 0 | 1;
    avg_consult_duration_mins?: number;
  }) {
    const validated = validateSchedule(values);
    if (DEMO_MODE) {
      return updateRecord<Doctor>("Doctor", "DOC-DEMO-001", validated as Partial<Doctor>);
    }
    return callRpc<Doctor>("soulplace.api.save_doctor_schedule", validated);
  },
  getSlots(doctor: string, date: string) {
    return request<string[]>("/api/method/soulplace.api.get_doctor_slots", {
      method: "POST",
      body: { doctor, date }
    }).then((response): string[] => {
      if (Array.isArray(response)) return response;
      const wrapped = response as unknown as { message?: unknown };
      return Array.isArray(wrapped.message)
        ? wrapped.message.filter((value): value is string => typeof value === "string")
        : [];
    });
  },
  listScheduleExceptions(
    options?: ListOptions<DoctorScheduleException>
  ) {
    return listRecords<DoctorScheduleException>("Doctor Schedule Exception", {
      fields: ["*"],
      ...options
    });
  },
  createScheduleException(
    values: Omit<Partial<DoctorScheduleException>, "name">
  ) {
    const validated = validateScheduleException(values as Record<string, unknown>) as Omit<Partial<DoctorScheduleException>, "name">;
    if (!DEMO_MODE) {
      return callRpc<DoctorScheduleException>(
        "soulplace.api.create_schedule_exception",
        { values: validated }
      );
    }
    return createRecord<DoctorScheduleException>(
      "Doctor Schedule Exception",
      validated
    );
  },
  updateScheduleException(
    name: string,
    values: Partial<DoctorScheduleException>
  ) {
    const validated = validateScheduleException(values as Record<string, unknown>) as Partial<DoctorScheduleException>;
    if (!DEMO_MODE) {
      return callRpc<DoctorScheduleException>(
        "soulplace.api.update_schedule_exception",
        { name, values: validated }
      );
    }
    return updateRecord<DoctorScheduleException>(
      "Doctor Schedule Exception",
      name,
      validated
    );
  },
  deleteScheduleException(name: string) {
    if (!DEMO_MODE) {
      return callRpc<void>("soulplace.api.delete_schedule_exception", { name });
    }
    return deleteRecord("Doctor Schedule Exception", name);
  }
};
