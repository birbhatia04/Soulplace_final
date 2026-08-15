const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const MEET_PATH_PATTERN = /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/;

export const FILE_LIMIT_BYTES = 5 * 1024 * 1024;
export const VERIFICATION_FILE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png"
]);

export class InputValidationError extends Error {
  readonly fieldErrors: Record<string, string>;

  constructor(fieldErrors: Record<string, string>) {
    super(Object.values(fieldErrors)[0] || "Please review the highlighted fields.");
    this.name = "InputValidationError";
    this.fieldErrors = fieldErrors;
  }
}

function fail(field: string, message: string): never {
  throw new InputValidationError({ [field]: message });
}

function text(
  value: unknown,
  field: string,
  label: string,
  options: { required?: boolean; min?: number; max: number }
) {
  const cleaned = String(value ?? "").trim().replace(/\s+/g, " ");
  if (options.required && !cleaned) fail(field, `${label} is required.`);
  if (cleaned && options.min && cleaned.length < options.min) {
    fail(field, `${label} must contain at least ${options.min} characters.`);
  }
  if (cleaned.length > options.max) {
    fail(field, `${label} must be ${options.max} characters or fewer.`);
  }
  return cleaned;
}

function finiteNumber(
  value: unknown,
  field: string,
  label: string,
  minimum: number,
  maximum: number
) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    fail(field, `${label} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

export function normalizeIndianPhone(value: unknown, field = "phoneno") {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length !== 10) fail(field, "Enter a valid 10-digit Indian phone number.");
  return digits;
}

export function optionalIndianPhone(value: unknown, field: string) {
  if (!String(value ?? "").trim()) return "";
  return normalizeIndianPhone(value, field);
}

export function normalizeEmail(value: unknown, field = "email") {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    fail(field, "Enter a valid email address.");
  }
  return email;
}

function password(value: unknown) {
  const result = String(value ?? "");
  if (result.length < 8) fail("password", "Password must contain at least 8 characters.");
  if (result.length > 128) fail("password", "Password must be 128 characters or fewer.");
  return result;
}

function isoDate(value: unknown, field: string) {
  const result = String(value ?? "").trim();
  if (!ISO_DATE_PATTERN.test(result)) fail(field, "Enter a valid date.");
  const parsed = new Date(`${result}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) {
    fail(field, "Enter a valid date.");
  }
  return result;
}

function time(value: unknown, field: string) {
  const result = String(value ?? "").trim();
  if (!TIME_PATTERN.test(result)) fail(field, "Enter a valid time.");
  return result;
}

function boundedText(value: unknown, field: string, label: string, maximum: number) {
  const cleaned = String(value ?? "").trim();
  if (cleaned.length > maximum) fail(field, `${label} must be ${maximum} characters or fewer.`);
  return cleaned;
}

export function validatePatientRegistration<T extends {
  phoneno?: string;
  email: string;
  password: string;
  name1: string;
  age: number;
  gender: string;
  livingstatus: string;
  therapyexp: string;
  preferred_language: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  consent_accepted: boolean;
  consent_version: string;
}>(input: T): T {
  const genders = new Set(["Male", "Female"]);
  const languages = new Set(["English", "Hindi", "Marathi"]);
  const therapy = new Set([
    "New to therapy",
    "Some previous experience",
    "Currently in therapy"
  ]);
  if (!genders.has(input.gender)) fail("gender", "Select a supported gender.");
  if (!languages.has(input.preferred_language)) {
    fail("preferred_language", "Select a supported preferred language.");
  }
  if (!therapy.has(input.therapyexp)) {
    fail("therapyexp", "Select a supported therapy experience.");
  }
  if (!input.consent_accepted) fail("consent_accepted", "Privacy and treatment consent is required.");

  return {
    ...input,
    phoneno: optionalIndianPhone(input.phoneno, "phoneno"),
    email: normalizeEmail(input.email),
    password: password(input.password),
    name1: text(input.name1, "name1", "Name", { required: true, min: 2, max: 140 }),
    age: finiteNumber(input.age, "age", "Age", 13, 120),
    emergency_contact_name: text(
      input.emergency_contact_name,
      "emergency_contact_name",
      "Emergency contact name",
      { max: 140 }
    ),
    emergency_contact_phone: optionalIndianPhone(
      input.emergency_contact_phone,
      "emergency_contact_phone"
    ),
    consent_version: text(input.consent_version, "consent_version", "Consent version", {
      required: true,
      max: 50
    })
  };
}

export function validateDoctorRegistration<T extends {
  full_name: string;
  email: string;
  mobile_number: string;
  password: string;
  specialty: string;
  medical_registration: string;
  consultation_fee: number;
  avg_consult_duration_mins: number;
  specialization_tags: string;
  professional_consent: boolean;
  consent_version: string;
  verification: File;
}>(input: T): T {
  if (!input.professional_consent) {
    fail("professional_consent", "Professional terms must be accepted.");
  }
  if (!(input.verification instanceof File)) {
    fail("verification", "Attach a verification document.");
  }
  if (!VERIFICATION_FILE_TYPES.has(input.verification.type)) {
    fail("verification", "Verification must be a PDF, PNG, or JPEG.");
  }
  if (!input.verification.size || input.verification.size > FILE_LIMIT_BYTES) {
    fail("verification", "Verification documents must be 5 MB or smaller.");
  }
  return {
    ...input,
    full_name: text(input.full_name, "full_name", "Name", {
      required: true,
      min: 2,
      max: 140
    }),
    email: normalizeEmail(input.email),
    mobile_number: normalizeIndianPhone(input.mobile_number, "mobile_number"),
    password: password(input.password),
    specialty: text(input.specialty, "specialty", "Specialty", {
      required: true,
      min: 2,
      max: 140
    }),
    medical_registration: text(
      input.medical_registration,
      "medical_registration",
      "Medical registration",
      { required: true, min: 2, max: 200 }
    ),
    consultation_fee: finiteNumber(
      input.consultation_fee,
      "consultation_fee",
      "Consultation fee",
      0,
      1_000_000
    ),
    avg_consult_duration_mins: finiteNumber(
      input.avg_consult_duration_mins,
      "avg_consult_duration_mins",
      "Consultation duration",
      5,
      240
    ),
    specialization_tags: text(
      input.specialization_tags,
      "specialization_tags",
      "Specialization tags",
      { max: 1000 }
    ),
    consent_version: text(input.consent_version, "consent_version", "Consent version", {
      required: true,
      max: 50
    })
  };
}

export function validateAppointmentBooking<T extends {
  doctor?: string;
  appointment_date?: string;
  appointment_time?: string;
  symptoms?: string;
  is_teleconsult?: number;
}>(values: T, consents: { privacy: boolean; telemedicine: boolean; version: string }): T {
  if (!consents.privacy) fail("privacy", "Privacy consent is required to book.");
  if (values.is_teleconsult === 1 && !consents.telemedicine) {
    fail("telemedicine", "Telemedicine consent is required for a video appointment.");
  }
  if (![0, 1, undefined].includes(values.is_teleconsult)) {
    fail("is_teleconsult", "Select a valid appointment type.");
  }
  text(consents.version, "consent_version", "Consent version", { required: true, max: 50 });
  return {
    ...values,
    doctor: text(values.doctor, "doctor", "Doctor", { required: true, max: 140 }),
    appointment_date: isoDate(values.appointment_date, "appointment_date"),
    appointment_time: time(values.appointment_time, "appointment_time"),
    symptoms: text(values.symptoms, "symptoms", "Reason for visit", {
      required: true,
      min: 3,
      max: 4000
    })
  };
}

export function validateCancellation(name: unknown, reason: unknown) {
  return {
    name: text(name, "name", "Appointment", { required: true, max: 140 }),
    reason: text(reason, "reason", "Cancellation reason", {
      required: true,
      min: 3,
      max: 500
    })
  };
}

export function validateReschedule(
  name: unknown,
  appointmentDate: unknown,
  appointmentTime: unknown,
  reason: unknown
) {
  return {
    name: text(name, "name", "Appointment", { required: true, max: 140 }),
    appointment_date: isoDate(appointmentDate, "appointment_date"),
    appointment_time: time(appointmentTime, "appointment_time"),
    reason: text(reason, "reason", "Reschedule reason", { max: 1000 })
  };
}

export function validatePatientProfile(values: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  if ("name1" in values) result.name1 = text(values.name1, "name1", "Name", { required: true, min: 2, max: 140 });
  if ("email" in values) result.email = normalizeEmail(values.email);
  if ("age" in values) result.age = finiteNumber(values.age, "age", "Age", 13, 120);
  if ("gender" in values) {
    if (!new Set(["Male", "Female"]).has(String(values.gender))) fail("gender", "Select a supported gender.");
    result.gender = values.gender;
  }
  if ("preferred_language" in values) {
    if (!new Set(["English", "Hindi", "Marathi"]).has(String(values.preferred_language))) {
      fail("preferred_language", "Select a supported preferred language.");
    }
    result.preferred_language = values.preferred_language;
  }
  if ("therapyexp" in values) {
    if (!new Set(["New to therapy", "Some previous experience", "Currently in therapy"]).has(String(values.therapyexp))) {
      fail("therapyexp", "Select a supported therapy experience.");
    }
    result.therapyexp = values.therapyexp;
  }
  if ("livingstatus" in values) {
    if (![0, 1, false, true].includes(values.livingstatus as never)) fail("livingstatus", "Select a valid living status.");
    result.livingstatus = values.livingstatus ? 1 : 0;
  }
  if ("emergency_contact_name" in values) {
    result.emergency_contact_name = text(values.emergency_contact_name, "emergency_contact_name", "Emergency contact name", { max: 140 });
  }
  if ("emergency_contact_phone" in values) {
    result.emergency_contact_phone = optionalIndianPhone(values.emergency_contact_phone, "emergency_contact_phone");
  }
  return result;
}

export function validateDoctorProfile(values: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  if ("full_name" in values) result.full_name = text(values.full_name, "full_name", "Name", { required: true, min: 2, max: 140 });
  if ("specialty" in values) result.specialty = text(values.specialty, "specialty", "Specialty", { required: true, min: 2, max: 140 });
  if ("mobile_number" in values) result.mobile_number = optionalIndianPhone(values.mobile_number, "mobile_number");
  if ("specialization_tags" in values) result.specialization_tags = text(values.specialization_tags, "specialization_tags", "Specialization tags", { max: 1000 });
  if ("consultation_fee" in values) result.consultation_fee = finiteNumber(values.consultation_fee, "consultation_fee", "Consultation fee", 0, 1_000_000);
  if ("avg_consult_duration_mins" in values) result.avg_consult_duration_mins = finiteNumber(values.avg_consult_duration_mins, "avg_consult_duration_mins", "Consultation duration", 5, 240);
  return result;
}

export function validateSchedule(values: {
  schedule_json: string;
  availability?: string;
  status?: string;
  teleconsult_enabled?: number;
  avg_consult_duration_mins?: number;
}) {
  let schedule: unknown;
  try {
    schedule = JSON.parse(values.schedule_json || "{}");
  } catch {
    fail("schedule_json", "Schedule must be valid JSON.");
  }
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) {
    fail("schedule_json", "Schedule must be an object.");
  }
  const days = new Set(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
  const categories = new Set(["Morning", "Afternoon", "Evening"]);
  let total = 0;
  for (const [day, groups] of Object.entries(schedule as Record<string, unknown>)) {
    if (!days.has(day) || !groups || typeof groups !== "object" || Array.isArray(groups)) {
      fail("schedule_json", "Schedule contains an invalid day.");
    }
    for (const [category, slots] of Object.entries(groups as Record<string, unknown>)) {
      if (!categories.has(category) || !Array.isArray(slots) || slots.some((slot) => typeof slot !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot))) {
        fail("schedule_json", "Schedule contains an invalid time group.");
      }
      if (new Set(slots).size !== slots.length || slots.length > 96) {
        fail("schedule_json", "Schedule contains too many or duplicate times.");
      }
      total += slots.length;
    }
  }
  if (total > 672) fail("schedule_json", "Schedule contains too many appointment times.");
  if (values.status !== undefined && !new Set(["Active", "Inactive"]).has(values.status)) fail("status", "Select a valid doctor status.");
  if (values.teleconsult_enabled !== undefined && ![0, 1].includes(values.teleconsult_enabled)) fail("teleconsult_enabled", "Select a valid teleconsult setting.");
  return {
    ...values,
    schedule_json: JSON.stringify(schedule),
    availability: text(values.availability, "availability", "Availability note", { max: 1000 }),
    avg_consult_duration_mins: values.avg_consult_duration_mins === undefined
      ? undefined
      : finiteNumber(values.avg_consult_duration_mins, "avg_consult_duration_mins", "Consultation duration", 5, 240)
  };
}

export function validateGoogleMeet(appointment: unknown, meetingId: unknown, meetingLink: unknown) {
  const link = String(meetingLink ?? "").trim();
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    fail("meeting_link", "Enter a valid Google Meet link.");
  }
  if (url.protocol !== "https:" || url.hostname !== "meet.google.com" || url.username || url.password || url.port || !MEET_PATH_PATTERN.test(url.pathname)) {
    fail("meeting_link", "Enter a valid https://meet.google.com meeting link.");
  }
  return {
    appointment: text(appointment, "appointment", "Appointment", { required: true, max: 140 }),
    meeting_id: text(meetingId, "meeting_id", "Meeting identifier", { required: true, max: 500 }),
    meeting_link: link
  };
}

export function validateConsultation(values: Record<string, unknown>) {
  const allowed = [
    "diagnosis",
    "notes",
    "chief_complaint",
    "soap_subjective",
    "soap_objective",
    "soap_assessment",
    "soap_plan",
    "patient_friendly_summary"
  ];
  const result: Record<string, unknown> = {};
  if ("name" in values) result.name = text(values.name, "name", "Consultation", { required: true, max: 140 });
  if ("appointment" in values) result.appointment = text(values.appointment, "appointment", "Appointment", { required: true, max: 140 });
  if (!result.name && !result.appointment) fail("appointment", "Appointment is required.");
  for (const field of allowed) {
    if (field in values) result[field] = boundedText(values[field], field, field.replaceAll("_", " "), 10_000);
  }
  if ("follow_up_date" in values) {
    result.follow_up_date = values.follow_up_date ? isoDate(values.follow_up_date, "follow_up_date") : "";
  }
  return result;
}

export function validatePrescription(values: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  if ("name" in values) result.name = text(values.name, "name", "Prescription", { required: true, max: 140 });
  if ("consultation" in values) result.consultation = text(values.consultation, "consultation", "Consultation", { required: true, max: 140 });
  if (!result.name && !result.consultation) fail("consultation", "Consultation is required.");
  result.medicine_name = text(values.medicine_name, "medicine_name", "Medicine name", { required: true, max: 500 });
  result.dosage = text(values.dosage, "dosage", "Dosage", { required: true, max: 500 });
  result.instructions = boundedText(values.instructions, "instructions", "Instructions", 4000);
  return result;
}

function dateTime(value: unknown, field: string) {
  const result = String(value ?? "").trim();
  if (!result || Number.isNaN(new Date(result).getTime())) fail(field, "Enter a valid date and time.");
  return result;
}

export function validateScheduleException(values: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  if ("practitioner" in values) result.practitioner = text(values.practitioner, "practitioner", "Practitioner", { max: 140 });
  if ("exception_type" in values) {
    if (!new Set(["Block", "Override", "Add Slots"]).has(String(values.exception_type))) fail("exception_type", "Select a valid schedule exception type.");
    result.exception_type = values.exception_type;
  }
  if ("from_datetime" in values) result.from_datetime = dateTime(values.from_datetime, "from_datetime");
  if ("to_datetime" in values) result.to_datetime = dateTime(values.to_datetime, "to_datetime");
  if (result.from_datetime && result.to_datetime && new Date(String(result.to_datetime)) <= new Date(String(result.from_datetime))) {
    fail("to_datetime", "The end must be after the start.");
  }
  if ("reason" in values) result.reason = boundedText(values.reason, "reason", "Reason", 1000);
  if ("active" in values) {
    if (![0, 1].includes(values.active as number)) fail("active", "Select a valid active status.");
    result.active = values.active;
  }
  return result;
}
