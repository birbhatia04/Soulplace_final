import { callRpc, createRecord, listRecords, updateRecord } from "./client";
import { DEMO_MODE } from "./demo";
import type {
  ListOptions,
  PatientConsentRecord
} from "../types/domain";

export const consentsApi = {
  list(options?: ListOptions<PatientConsentRecord>) {
    return listRecords<PatientConsentRecord>("Patient Consent Record", {
      fields: ["*"],
      ...options
    });
  },
  grant(
    patient: string,
    consentType: PatientConsentRecord["consent_type"]
  ) {
    if (!DEMO_MODE) {
      return callRpc<PatientConsentRecord>("soulplace.api.grant_consent", {
        consent_type: consentType,
        consent_version: import.meta.env.VITE_CONSENT_VERSION || "1.0"
      });
    }
    return createRecord<PatientConsentRecord>("Patient Consent Record", {
      patient,
      consent_type: consentType,
      consent_version: import.meta.env.VITE_CONSENT_VERSION || "1.0",
      status: "Granted",
      granted_on: new Date().toISOString().slice(0, 19).replace('T', ' '),
      capture_source: "Web"
    });
  },
  revoke(name: string) {
    if (!DEMO_MODE) {
      return callRpc<PatientConsentRecord>("soulplace.api.revoke_consent", { name });
    }
    return updateRecord<PatientConsentRecord>(
      "Patient Consent Record",
      name,
      {
        status: "Revoked",
        revoked_on: new Date().toISOString().slice(0, 19).replace('T', ' ')
      }
    );
  }
};
