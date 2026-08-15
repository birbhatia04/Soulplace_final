import {
  createRecord,
  callRpc,
  getRecord,
  listRecords,
  updateRecord
} from "./client";
import { DEMO_MODE } from "./demo";
import type { ListOptions, Prescription } from "../types/domain";
import { validatePrescription } from "../validation";

export const prescriptionsApi = {
  list(options?: ListOptions<Prescription>) {
    return listRecords<Prescription>("Prescription", {
      fields: ["*"],
      ...options
    });
  },
  get(name: string) {
    return getRecord<Prescription>("Prescription", name);
  },
  create(values: Omit<Partial<Prescription>, "name">) {
    const validated = validatePrescription(values as Record<string, unknown>) as Partial<Prescription>;
    if (DEMO_MODE) return createRecord<Prescription>("Prescription", validated);
    return callRpc<Prescription>("soulplace.api.save_prescription", { values: validated });
  },
  update(name: string, values: Partial<Prescription>) {
    const validated = validatePrescription({ ...values, name }) as Partial<Prescription>;
    if (DEMO_MODE) return updateRecord<Prescription>("Prescription", name, validated);
    return callRpc<Prescription>("soulplace.api.save_prescription", { values: validated });
  }
};
