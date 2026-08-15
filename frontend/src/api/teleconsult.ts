import { callRpc, createRecord, getRecord, listRecords, updateRecord } from "./client";
import { DEMO_MODE } from "./demo";
import type { ListOptions, TeleconsultSession } from "../types/domain";
import { validateGoogleMeet } from "../validation";

export const teleconsultApi = {
  list(options?: ListOptions<TeleconsultSession>) {
    return listRecords<TeleconsultSession>("Teleconsult Session", {
      fields: ["*"],
      ...options
    });
  },
  get(name: string) {
    return getRecord<TeleconsultSession>("Teleconsult Session", name);
  },
  create(values: Omit<Partial<TeleconsultSession>, "name">) {
    return createRecord<TeleconsultSession>("Teleconsult Session", values);
  },
  update(name: string, values: Partial<TeleconsultSession>) {
    return updateRecord<TeleconsultSession>(
      "Teleconsult Session",
      name,
      values
    );
  },
  saveGoogleMeet(appointment: string, meeting_id: string, meeting_link: string) {
    const validated = validateGoogleMeet(appointment, meeting_id, meeting_link);
    if (DEMO_MODE) {
      return createRecord<TeleconsultSession>("Teleconsult Session", {
        appointment: validated.appointment,
        practitioner: "DOC-DEMO-001",
        patient: "PAT-DEMO-001",
        provider: "Google Meet",
        meeting_id: validated.meeting_id,
        meeting_link: validated.meeting_link,
        session_status: "Created"
      });
    }
    return callRpc<TeleconsultSession>("soulplace.api.save_google_meet_session", {
      ...validated
    });
  },
  saveManualGoogleMeet(appointment: string, meeting_link: string) {
    const checked = validateGoogleMeet(appointment, "spaces/manual", meeting_link);
    const code = new URL(checked.meeting_link).pathname.slice(1);
    const validated = { ...checked, meeting_id: `spaces/${code}` };
    if (DEMO_MODE) {
      return this.saveGoogleMeet(
        validated.appointment,
        validated.meeting_id,
        validated.meeting_link
      );
    }
    return callRpc<TeleconsultSession>("soulplace.api.save_manual_google_meet_session", {
      appointment: validated.appointment,
      meeting_link: validated.meeting_link
    });
  }
};
