import {
  createRecord,
  callRpc,
  getRecord,
  listRecords,
  updateRecord
} from "./client";
import { DEMO_MODE } from "./demo";
import type { Consultation, ListOptions } from "../types/domain";
import { validateConsultation } from "../validation";

export const consultationsApi = {
  list(options?: ListOptions<Consultation>) {
    if (!DEMO_MODE) {
      return callRpc<Consultation[]>("soulplace.api.list_portal_consultations", {
        limit: options?.limitPageLength ?? 100
      }).then((data) => ({ data }));
    }
    return listRecords<Consultation>("Consultation", {
      fields: ["*"],
      ...options
    });
  },
  get(name: string) {
    if (!DEMO_MODE) {
      return callRpc<Consultation>("soulplace.api.get_portal_consultation", { name });
    }
    return getRecord<Consultation>("Consultation", name);
  },
  create(values: Omit<Partial<Consultation>, "name">) {
    const validated = validateConsultation(values as Record<string, unknown>) as Partial<Consultation>;
    if (DEMO_MODE) return createRecord<Consultation>("Consultation", validated);
    return callRpc<Consultation>("soulplace.api.save_consultation", { values: validated });
  },
  update(name: string, values: Partial<Consultation>) {
    const validated = validateConsultation({ ...values, name }) as Partial<Consultation>;
    if (DEMO_MODE) return updateRecord<Consultation>("Consultation", name, validated);
    return callRpc<Consultation>("soulplace.api.save_consultation", { values: validated });
  }
};
