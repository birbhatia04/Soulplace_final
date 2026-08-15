import type {
  Appointment,
  AppointmentAuditTimeline,
  AuthSession,
  Consultation,
  Doctor,
  DoctorScheduleException,
  FrappeDocument,
  ListOptions,
  PatientConsentRecord,
  PatientUser,
  PortalRole,
  Prescription,
  TeleconsultSession
} from "../types/domain";

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

const localDate = (offsetDays = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
};

const timestamp = (offsetDays = 0, hour = 9) =>
  `${localDate(offsetDays)} ${String(hour).padStart(2, "0")}:00:00`;

const patients: PatientUser[] = [
  {
    name: "PAT-DEMO-001",
    phoneno: "9000000001",
    email: "aarav@example.com",
    name1: "Aarav Mehta",
    age: 29,
    gender: "Male",
    livingstatus: 1,
    therapyexp: "Some previous experience",
    app_user: "aarav@example.com",
    mobile_no_verified: 1,
    preferred_language: "English",
    emergency_contact_name: "Nisha Mehta",
    emergency_contact_phone: "9000000011",
    consent_status: "Granted",
    creation: timestamp(-45)
  },
  {
    name: "PAT-DEMO-002",
    phoneno: "9000000002",
    email: "maya@example.com",
    name1: "Maya Shah",
    age: 34,
    gender: "Female",
    livingstatus: 0,
    therapyexp: "Currently in therapy",
    app_user: "maya@example.com",
    mobile_no_verified: 1,
    preferred_language: "Hindi",
    emergency_contact_name: "Rohan Shah",
    emergency_contact_phone: "9000000012",
    consent_status: "Granted",
    creation: timestamp(-28)
  }
];

const doctors: Doctor[] = [
  {
    name: "DOC-DEMO-001",
    full_name: "Dr. Ananya Rao",
    specialty: "Clinical Psychology",
    mobile_number: "9111111111",
    email: "doctor@soulplace.demo",
    consultation_fee: 1400,
    availability: "Mon–Fri · 09:00–17:00",
    status: "Active",
    teleconsult_enabled: 1,
    avg_consult_duration_mins: 45,
    specialization_tags: "Anxiety, Stress, Mindfulness",
    approval_status: "Approved",
    verification_proof: "#demo-verification",
    creation: timestamp(-90)
  },
  {
    name: "DOC-DEMO-002",
    full_name: "Dr. Kabir Malhotra",
    specialty: "Psychiatry",
    mobile_number: "9222222222",
    email: "kabir@soulplace.demo",
    consultation_fee: 1800,
    availability: "Tue–Sat · 10:00–18:00",
    status: "Active",
    teleconsult_enabled: 1,
    avg_consult_duration_mins: 30,
    specialization_tags: "Depression, Sleep, Medication management",
    approval_status: "Approved",
    creation: timestamp(-80)
  },
  {
    name: "DOC-DEMO-003",
    full_name: "Dr. Isha Verma",
    specialty: "Counselling Psychology",
    mobile_number: "9333333333",
    email: "pending.doctor@soulplace.demo",
    consultation_fee: 1100,
    availability: "Weekdays · 11:00–16:00",
    status: "Inactive",
    teleconsult_enabled: 1,
    avg_consult_duration_mins: 50,
    specialization_tags: "Relationships, Grief, Self-esteem",
    approval_status: "Pending",
    verification_proof: "#demo-pending-verification",
    creation: timestamp(-2)
  }
];

const appointments: Appointment[] = [
  {
    name: "APT-DEMO-001",
    patient: "PAT-DEMO-001",
    doctor: "DOC-DEMO-001",
    appointment_date: localDate(1),
    appointment_time: "10:30",
    status: "Confirmed",
    symptoms: "Work-related anxiety and difficulty sleeping",
    booking_source: "Web",
    is_teleconsult: 1,
    creation: timestamp(-3)
  },
  {
    name: "APT-DEMO-002",
    patient: "PAT-DEMO-002",
    doctor: "DOC-DEMO-001",
    appointment_date: localDate(0),
    appointment_time: "14:00",
    status: "Pending",
    symptoms: "Stress and low mood",
    booking_source: "Web",
    is_teleconsult: 0,
    creation: timestamp(-1)
  },
  {
    name: "APT-DEMO-003",
    patient: "PAT-DEMO-001",
    doctor: "DOC-DEMO-001",
    appointment_date: localDate(-7),
    appointment_time: "11:15",
    status: "Completed",
    symptoms: "Follow-up for anxiety management",
    notes: "Consultation completed successfully.",
    booking_source: "Web",
    is_teleconsult: 1,
    creation: timestamp(-12)
  },
  {
    name: "APT-DEMO-004",
    patient: "PAT-DEMO-002",
    doctor: "DOC-DEMO-002",
    appointment_date: localDate(-2),
    appointment_time: "16:00",
    status: "Cancelled",
    symptoms: "Sleep concerns",
    cancel_reason: "Patient schedule conflict",
    booking_source: "Admin",
    is_teleconsult: 0,
    creation: timestamp(-6)
  },
  {
    name: "APT-DEMO-005",
    patient: "PAT-DEMO-001",
    doctor: "DOC-DEMO-001",
    appointment_date: localDate(2),
    appointment_time: "15:30",
    status: "Confirmed",
    symptoms: "Follow-up video consultation",
    booking_source: "Web",
    is_teleconsult: 1,
    teleconsult_session_id: "TEL-DEMO-005",
    creation: timestamp(-2)
  }
];

const consultations: Consultation[] = [
  {
    name: "CON-DEMO-001",
    appointment: "APT-DEMO-003",
    doctor: "DOC-DEMO-001",
    diagnosis: "Generalized anxiety symptoms",
    chief_complaint: "Persistent worry and interrupted sleep",
    soap_subjective: "Patient reports improved awareness of anxiety triggers.",
    soap_objective: "Calm, engaged, and oriented throughout the session.",
    soap_assessment: "Symptoms are improving with structured coping strategies.",
    soap_plan: "Continue breathing practice and weekly thought journaling.",
    follow_up_date: localDate(7),
    patient_friendly_summary:
      "You are making steady progress. Continue the breathing and journaling exercises we practiced.",
    creation: timestamp(-7, 12)
  }
];

const prescriptions: Prescription[] = [
  {
    name: "RX-DEMO-001",
    consultation: "CON-DEMO-001",
    medicine_name: "No medication prescribed",
    dosage: "Not applicable",
    instructions: "Continue the agreed self-care plan and follow-up schedule.",
    creation: timestamp(-7, 12)
  }
];

const teleconsults: TeleconsultSession[] = [
  {
    name: "TEL-DEMO-003",
    appointment: "APT-DEMO-003",
    practitioner: "DOC-DEMO-001",
    patient: "PAT-DEMO-001",
    provider: "Custom",
    meeting_id: "spaces/demo-completed-consultation",
    meeting_link: "https://meet.google.com/abc-defg-hij",
    start_time: timestamp(-7, 11),
    end_time: timestamp(-7, 12),
    session_status: "Completed",
    creation: timestamp(-12)
  },
  {
    name: "TEL-DEMO-005",
    appointment: "APT-DEMO-005",
    practitioner: "DOC-DEMO-001",
    patient: "PAT-DEMO-001",
    provider: "Custom",
    meeting_id: "spaces/demo-upcoming-consultation",
    meeting_link: "https://meet.google.com/abc-defg-hij",
    start_time: timestamp(2, 15),
    session_status: "Created",
    creation: timestamp(-2)
  }
];

const consents: PatientConsentRecord[] = [
  {
    name: "CR-DEMO-0001",
    patient: "PAT-DEMO-001",
    consent_type: "Privacy",
    consent_version: "1.0",
    status: "Granted",
    granted_on: timestamp(-45),
    capture_source: "Web",
    creation: timestamp(-45)
  },
  {
    name: "CR-DEMO-0002",
    patient: "PAT-DEMO-001",
    consent_type: "Treatment",
    consent_version: "1.0",
    status: "Granted",
    granted_on: timestamp(-45),
    capture_source: "Web",
    creation: timestamp(-45)
  },
  {
    name: "CR-DEMO-0003",
    patient: "PAT-DEMO-001",
    consent_type: "Telemedicine",
    consent_version: "1.0",
    status: "Granted",
    granted_on: timestamp(-3),
    capture_source: "Web",
    creation: timestamp(-3)
  }
];

const timeline: AppointmentAuditTimeline[] = [
  {
    name: "AUD-DEMO-001",
    appointment: "APT-DEMO-001",
    event_type: "Created",
    new_status: "Pending",
    actor_user: "9000000001@soulplace.demo",
    actor_role: "Patient App User",
    event_time: timestamp(-3)
  },
  {
    name: "AUD-DEMO-002",
    appointment: "APT-DEMO-001",
    event_type: "Status Change",
    previous_status: "Pending",
    new_status: "Confirmed",
    actor_user: "doctor@soulplace.demo",
    actor_role: "Doctor App User",
    event_time: timestamp(-2)
  }
];

const scheduleExceptions: DoctorScheduleException[] = [
  {
    name: "DSE-DEMO-001",
    practitioner: "DOC-DEMO-001",
    exception_type: "Block",
    from_datetime: `${localDate(3)} 13:00:00`,
    to_datetime: `${localDate(3)} 15:00:00`,
    reason: "Clinical supervision",
    active: 1,
    creation: timestamp(-4)
  }
];

const records: Record<string, FrappeDocument[]> = {
  PatientUser: patients,
  Doctor: doctors,
  Appointment: appointments,
  Consultation: consultations,
  Prescription: prescriptions,
  "Teleconsult Session": teleconsults,
  "Patient Consent Record": consents,
  "Appointment Audit Timeline": timeline,
  "Doctor Schedule Exception": scheduleExceptions
};

const recordValue = (record: FrappeDocument, field: string) =>
  (record as unknown as Record<string, unknown>)[field];

const matchesFilter = (
  record: FrappeDocument,
  [field, operator, expected]: [string, string, unknown]
) => {
  const actual = recordValue(record, field);
  if (operator === "=") return actual === expected;
  if (operator === "!=") return actual !== expected;
  if (operator.toLowerCase() === "in" && Array.isArray(expected)) {
    return expected.includes(actual);
  }
  if (operator.toLowerCase() === "like") {
    return String(actual ?? "")
      .toLowerCase()
      .includes(String(expected ?? "").replaceAll("%", "").toLowerCase());
  }
  return true;
};

export function demoListRecords<T extends FrappeDocument>(
  doctype: string,
  options: ListOptions<T> = {}
) {
  let result = [...(records[doctype] ?? [])];
  if (options.filters?.length) {
    result = result.filter((record) =>
      options.filters!.every((filter) =>
        matchesFilter(record, filter as [string, string, unknown])
      )
    );
  }
  if (options.orFilters?.length) {
    result = result.filter((record) =>
      options.orFilters!.some((filter) =>
        matchesFilter(record, filter as [string, string, unknown])
      )
    );
  }
  if (options.orderBy) {
    const [field, direction = "asc"] = options.orderBy.split(/\s+/);
    result.sort((left, right) => {
      const comparison = String(recordValue(left, field) ?? "").localeCompare(
        String(recordValue(right, field) ?? "")
      );
      return direction.toLowerCase() === "desc" ? -comparison : comparison;
    });
  }
  const total = result.length;
  const start = options.limitStart ?? 0;
  const end = start + (options.limitPageLength ?? 20);
  return { data: result.slice(start, end) as T[], total };
}

export function demoGetRecord<T extends FrappeDocument>(
  doctype: string,
  name: string
) {
  const record = records[doctype]?.find((item) => item.name === name);
  if (!record) throw new Error(`${doctype} ${name} was not found in demo data.`);
  return record as T;
}

const prefixFor = (doctype: string) =>
  ({
    Appointment: "APT",
    Consultation: "CON",
    Prescription: "RX",
    "Patient Consent Record": "CR",
    "Doctor Schedule Exception": "DSE"
  })[doctype] ?? "DEMO";

export function demoCreateRecord<T extends FrappeDocument>(
  doctype: string,
  payload: Omit<Partial<T>, keyof FrappeDocument>
) {
  const collection = (records[doctype] ??= []);
  const record = {
    ...payload,
    name: `${prefixFor(doctype)}-DEMO-${String(collection.length + 1).padStart(3, "0")}`,
    creation: timestamp(0, new Date().getHours())
  } as T;
  collection.push(record);

  if (doctype === "Patient Appointment") {
    const appointment = record as unknown as Appointment;
    const auditEvent: AppointmentAuditTimeline = {
      name: `AUD-DEMO-${String(records["Appointment Audit Timeline"].length + 1).padStart(3, "0")}`,
      appointment: appointment.name,
      event_type: "Created",
      new_status: appointment.status,
      actor_user: "demo.user@soulplace.demo",
      actor_role: "Demo User",
      event_time: timestamp(0, new Date().getHours())
    };
    records["Appointment Audit Timeline"].push(auditEvent);
  }
  return record;
}

export function demoUpdateRecord<T extends FrappeDocument>(
  doctype: string,
  name: string,
  payload: Partial<T>
) {
  const collection = records[doctype] ?? [];
  const index = collection.findIndex((item) => item.name === name);
  if (index < 0) throw new Error(`${doctype} ${name} was not found in demo data.`);
  const previous = collection[index] as T;
  const updated = { ...previous, ...payload, modified: timestamp() } as T;
  collection[index] = updated;

  if (
    doctype === "Appointment" &&
    recordValue(previous, "status") !== recordValue(updated, "status")
  ) {
    const auditEvent: AppointmentAuditTimeline = {
      name: `AUD-DEMO-${String(records["Appointment Audit Timeline"].length + 1).padStart(3, "0")}`,
      appointment: name,
      event_type: "Status Change",
      previous_status: String(recordValue(previous, "status") ?? ""),
      new_status: String(recordValue(updated, "status") ?? ""),
      actor_user: "demo.user@soulplace.demo",
      actor_role: "Demo User",
      event_time: timestamp(0, new Date().getHours())
    };
    records["Appointment Audit Timeline"].push(auditEvent);
  }
  return updated;
}

export function demoDeleteRecord(doctype: string, name: string) {
  const collection = records[doctype] ?? [];
  const index = collection.findIndex((item) => item.name === name);
  if (index >= 0) collection.splice(index, 1);
}

type DemoAccount = {
  portal: PortalRole;
  username: string;
  password: string;
  profileName?: string;
  fullName: string;
  roles: string[];
};

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    portal: "patient",
    username: "aarav@example.com",
    password: "Demo1234!",
    profileName: "PAT-DEMO-001",
    fullName: "Aarav Mehta",
    roles: ["Patient App User"]
  },
  {
    portal: "doctor",
    username: "doctor@soulplace.demo",
    password: "Demo1234!",
    profileName: "DOC-DEMO-001",
    fullName: "Dr. Ananya Rao",
    roles: ["Doctor App User"]
  },
  {
    portal: "doctor",
    username: "pending.doctor@soulplace.demo",
    password: "Demo1234!",
    profileName: "DOC-DEMO-003",
    fullName: "Dr. Isha Verma",
    roles: ["Doctor App User"]
  },
  {
    portal: "admin",
    username: "admin@soulplace.demo",
    password: "Demo1234!",
    fullName: "SoulPlace Demo Admin",
    roles: ["System Manager"]
  }
];

const sessionKey = "soulplace-demo-session";

type StoredDemoSession = Pick<DemoAccount, "portal" | "username" | "profileName">;

const storeSession = (account: StoredDemoSession) => {
  sessionStorage.setItem(sessionKey, JSON.stringify(account));
};

export function demoLogin(
  portal: PortalRole,
  username: string,
  password: string
) {
  const normalizedUsername = username.trim();
  const account = DEMO_ACCOUNTS.find(
    (candidate) =>
      candidate.portal === portal &&
      candidate.username.toLowerCase() === normalizedUsername.toLowerCase() &&
      candidate.password === password
  );
  if (!account) {
    throw new Error("Use the demo credentials shown on this sign-in page.");
  }
  storeSession(account);
  return account;
}

export function demoLogout() {
  sessionStorage.removeItem(sessionKey);
}

export function demoRestoreSession(): AuthSession {
  const raw = sessionStorage.getItem(sessionKey);
  if (!raw) return { status: "anonymous", roles: [] };
  try {
    const stored = JSON.parse(raw) as StoredDemoSession;
    const account = DEMO_ACCOUNTS.find(
      (candidate) =>
        candidate.portal === stored.portal &&
        candidate.username === stored.username
    );
    const patient =
      stored.portal === "patient" && stored.profileName
        ? demoGetRecord<PatientUser>("PatientUser", stored.profileName)
        : undefined;
    const doctor =
      stored.portal === "doctor" && stored.profileName
        ? demoGetRecord<Doctor>("Doctor", stored.profileName)
        : undefined;
    return {
      status: "authenticated",
      portal: stored.portal,
      username: stored.username,
      fullName: account?.fullName ?? patient?.name1 ?? doctor?.full_name,
      roles: account?.roles ?? (stored.portal === "patient" ? ["Patient App User"] : []),
      patient,
      doctor
    };
  } catch {
    demoLogout();
    return { status: "anonymous", roles: [] };
  }
}

export function demoRegisterPatient(input: {
  phoneno?: string;
  email: string;
  name1: string;
  age: number;
  gender: string;
  livingstatus: string;
  therapyexp: string;
  preferred_language: "English" | "Hindi" | "Marathi";
  emergency_contact_name: string;
  emergency_contact_phone: string;
}) {
  const phone = (input.phoneno || "").replace(/\D/g, "");
  const patient = demoCreateRecord<PatientUser>("PatientUser", {
    phoneno: phone,
    email: input.email,
    name1: input.name1,
    age: input.age,
    gender: input.gender,
    livingstatus: input.livingstatus === "With family" ? 1 : 0,
    therapyexp: input.therapyexp,
    app_user: input.email,
    mobile_no_verified: phone ? 1 : 0,
    preferred_language: input.preferred_language,
    emergency_contact_name: input.emergency_contact_name,
    emergency_contact_phone: input.emergency_contact_phone,
    consent_status: "Granted"
  });
  for (const consentType of ["Privacy", "Treatment"] as const) {
    demoCreateRecord<PatientConsentRecord>("Patient Consent Record", {
      patient: patient.name,
      consent_type: consentType,
      consent_version: "1.0",
      status: "Granted",
      granted_on: timestamp(),
      capture_source: "Web"
    });
  }
  storeSession({
    portal: "patient",
    username: input.email,
    profileName: patient.name
  });
  return patient;
}
