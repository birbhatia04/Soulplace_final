export type FrappeName = string;

export interface FrappeDocument {
  name: FrappeName;
  owner?: string;
  creation?: string;
  modified?: string;
  modified_by?: string;
  docstatus?: 0 | 1 | 2;
}

export type Gender = string;
export type ConsentStatus = "Pending" | "Granted" | "Revoked";

export interface PatientUser extends FrappeDocument {
  phoneno: string;
  email?: string;
  name1: string;
  age: number;
  gender: Gender;
  livingstatus: 0 | 1;
  therapyexp: string;
  app_user?: string;
  mobile_no_verified: 0 | 1;
  preferred_language?: "English" | "Hindi" | "Marathi";
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  consent_status?: ConsentStatus;
}

export type DoctorApprovalStatus = "Pending" | "Approved" | "Rejected";
export type DoctorStatus = "Active" | "Inactive";

export interface Doctor extends FrappeDocument {
  full_name: string;
  app_user?: string;
  specialty: string;
  medical_registration?: string;
  mobile_number: string;
  email: string;
  consultation_fee: number;
  availability?: string;
  schedule_json?: string;
  status: DoctorStatus;
  teleconsult_enabled: 0 | 1;
  avg_consult_duration_mins?: number;
  specialization_tags?: string;
  approval_status: DoctorApprovalStatus;
  verification_proof?: string;
  professional_consent?: 0 | 1;
  professional_consent_version?: string;
  professional_consent_on?: string;
  rejection_reason?: string;
  reviewed_by?: string;
  reviewed_on?: string;
}

export type AppointmentStatus =
  | "Pending"
  | "Confirmed"
  | "Completed"
  | "Cancelled";

export interface Appointment extends FrappeDocument {
  patient: FrappeName;
  patient_name?: string;
  doctor: FrappeName;
  doctor_name?: string;
  appointment_date: string;
  appointment_time: string;
  status: AppointmentStatus;
  symptoms?: string;
  notes?: string;
  booking_source?: "Mobile" | "Web" | "Admin";
  is_teleconsult?: 0 | 1;
  teleconsult_session_id?: string;
  cancel_reason?: string;
  rescheduled_from?: FrappeName;
}

export interface Consultation extends FrappeDocument {
  appointment: FrappeName;
  doctor: FrappeName;
  diagnosis?: string;
  notes?: string;
  follow_up_date?: string;
  chief_complaint?: string;
  soap_subjective?: string;
  soap_objective?: string;
  soap_assessment?: string;
  soap_plan?: string;
  patient_friendly_summary?: string;
}

export interface Prescription extends FrappeDocument {
  consultation: FrappeName;
  medicine_name: string;
  dosage: string;
  instructions?: string;
}

export interface TeleconsultSession extends FrappeDocument {
  appointment: FrappeName;
  practitioner: FrappeName;
  patient: FrappeName;
  provider: "Google Meet" | "Zoom" | "Jitsi" | "Custom";
  meeting_id?: string;
  meeting_link?: string;
  start_time?: string;
  end_time?: string;
  session_status: "Created" | "Live" | "Completed" | "Failed" | "Cancelled";
  recording_link?: string;
}

export interface PatientConsentRecord extends FrappeDocument {
  patient: FrappeName;
  consent_type: "Telemedicine" | "Privacy" | "Treatment";
  consent_version?: string;
  status: "Granted" | "Revoked";
  granted_on?: string;
  revoked_on?: string;
  capture_source: "Mobile" | "Web" | "Admin";
  ip_address?: string;
}

export interface AppointmentAuditTimeline extends FrappeDocument {
  appointment: FrappeName;
  event_type: string;
  previous_status?: string;
  new_status?: string;
  actor_user?: string;
  actor_role?: string;
  reason?: string;
  event_time?: string;
}

export interface DoctorScheduleException extends FrappeDocument {
  practitioner: FrappeName;
  exception_type: "Block" | "Override" | "Add Slots";
  from_datetime: string;
  to_datetime: string;
  reason?: string;
  active: 0 | 1;
}

export interface MobileDeviceToken extends FrappeDocument {
  user?: string;
  patient?: FrappeName;
  practitioner?: FrappeName;
  platform: "iOS" | "Android";
  push_token: string;
  is_active: 0 | 1;
  last_seen_on?: string;
}

export type PortalRole = "patient" | "doctor" | "admin";
export type AuthStatus = "restoring" | "authenticated" | "anonymous";

export interface AuthSession {
  status: AuthStatus;
  username?: string;
  fullName?: string;
  portal?: PortalRole;
  roles: string[];
  patient?: PatientUser;
  doctor?: Doctor;
}

export interface ListOptions<T> {
  fields?: (keyof T | string)[];
  filters?: Array<[keyof T | string, string, unknown]>;
  orFilters?: Array<[keyof T | string, string, unknown]>;
  orderBy?: string;
  limitStart?: number;
  limitPageLength?: number;
}

export interface Paginated<T> {
  data: T[];
  total?: number;
}

export interface ApiErrorShape {
  message: string;
  status: number;
  code:
    | "AUTHENTICATION"
    | "PERMISSION"
    | "VALIDATION"
    | "NETWORK"
    | "SERVER"
    | "UNKNOWN";
  details?: string[];
}
