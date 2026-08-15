import { callRpc, getRecord, listRecords, updateRecord } from "./client";
import { DEMO_MODE } from "./demo";
import type { ListOptions, PatientUser } from "../types/domain";
import { validatePatientProfile } from "../validation";

export const patientsApi = {
  list(options?: ListOptions<PatientUser>) {
    return listRecords<PatientUser>("PatientUser", {
      fields: ["*"],
      ...options
    });
  },
  get(name: string) {
    return getRecord<PatientUser>("PatientUser", name);
  },
  update(name: string, values: Partial<PatientUser>) {
    const validated = validatePatientProfile(values as Record<string, unknown>) as Partial<PatientUser>;
    if (DEMO_MODE) return updateRecord<PatientUser>("PatientUser", name, validated);
    return callRpc<PatientUser>("soulplace.api.update_patient_profile", { values: validated });
  }
};
