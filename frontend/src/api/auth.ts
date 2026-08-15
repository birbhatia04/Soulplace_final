import { callRpc, clearSessionTokens, request } from "./client";
import type { AuthSession, Doctor } from "../types/domain";
import {
  normalizeEmail,
  normalizeIndianPhone,
  validateDoctorRegistration,
  validatePatientRegistration
} from "../validation";
import {
  DEMO_MODE,
  demoLogin,
  demoLogout,
  demoRegisterPatient,
  demoRestoreSession
} from "./demo";

interface LoginResponse {
  home_page?: string;
  full_name?: string;
  message?: string;
}

interface PatientLoginResponse {
  success: boolean;
  user: { name: string; full_name: string };
  patient?: {
    name: string;
    phoneno: string;
    first_name: string;
    age: number;
    gender: string;
  };
}

export { normalizeIndianPhone } from "../validation";

export interface RegisterDoctorParams {
  fullName: string;
  email: string;
  mobileNumber: string;
  password?: string;
  specialization: string;
  consultationFee: number;
  avgConsultDurationMins: number;
  specializationTags: string;
  teleconsultEnabled: boolean;
  professionalTermsConsent: boolean;
  medicalRegistrationInfo: string;
  verificationFileBase64?: string;
  verificationFileName?: string;
}

export const authApi = {
  loginPatient(email: string, password: string) {
    const normalizedEmail = normalizeEmail(email);
    if (DEMO_MODE) {
      const account = demoLogin("patient", normalizedEmail, password);
      const session = demoRestoreSession();
      return Promise.resolve({
        success: true,
        user: { name: account.username, full_name: account.fullName },
        patient: session.patient
          ? {
              name: session.patient.name,
              phoneno: session.patient.phoneno,
              first_name: session.patient.name1,
              age: session.patient.age,
              gender: session.patient.gender
            }
          : undefined
      } satisfies PatientLoginResponse);
    }
    return callRpc<PatientLoginResponse>(
      "soulplace.auth.patient_login",
      { usr: normalizedEmail, pwd: password },
      true
    );
  },

  loginPortal(
    username: string,
    password: string,
    portal: "doctor" | "admin" = "doctor"
  ) {
    if (DEMO_MODE) {
      const account = demoLogin(portal, username, password);
      return Promise.resolve({
        full_name: account.fullName,
        message: "Logged In"
      } satisfies LoginResponse);
    }
    return request<LoginResponse>("/api/method/login", {
      method: "POST",
      body: { usr: username, pwd: password },
      skipCsrf: true
    });
  },

  async logout() {
    if (DEMO_MODE) {
      demoLogout();
      clearSessionTokens();
      return;
    }
    try {
      await request("/api/method/logout", { method: "POST" });
    } finally {
      clearSessionTokens();
    }
  },

  getLoggedUser() {
    if (DEMO_MODE) {
      return Promise.resolve(demoRestoreSession().username ?? "Guest");
    }
    return callRpc<any>("soulplace.api.get_portal_identity", {}, true).then(res => res.username || "Guest").catch(() => "Guest");
  },

  registerPatient(input: {
    phoneno?: string;
    email: string;
    password: string;
    name1: string;
    age: number;
    gender: string;
    livingstatus: string;
    therapyexp: string;
    preferred_language: "English" | "Hindi" | "Marathi";
    emergency_contact_name: string;
    emergency_contact_phone: string;
    consent_accepted: boolean;
    consent_version: string;
  }) {
    const validated = validatePatientRegistration(input);
    if (DEMO_MODE) {
      const patient = demoRegisterPatient(validated);
      return Promise.resolve({
        success: true,
        user: {
          name: patient.app_user || patient.phoneno,
          full_name: patient.name1
        },
        patient: {
          name: patient.name,
          phoneno: patient.phoneno,
          first_name: patient.name1,
          age: patient.age,
          gender: patient.gender
        }
      } satisfies PatientLoginResponse);
    }
    return callRpc<PatientLoginResponse>(
      "soulplace.auth.register_patient",
      validated,
      true
    );
  },

  registerDoctor(input: {
    full_name: string;
    email: string;
    mobile_number: string;
    password: string;
    specialty: string;
    medical_registration: string;
    consultation_fee: number;
    avg_consult_duration_mins: number;
    specialization_tags: string;
    teleconsult_enabled: boolean;
    professional_consent: boolean;
    consent_version: string;
    verification: File;
  }) {
    const validated = validateDoctorRegistration(input);
    const body = new FormData();
    Object.entries(validated).forEach(([key, value]) => {
      if (key === "verification") {
        body.append(key, value as File);
      } else {
        body.append(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
      }
    });
    return request<{ success: boolean; status: "Pending" }>(
      "/api/method/soulplace.api.register_doctor",
      { method: "POST", body, skipCsrf: true }
    );
  },

  requestPatientOtp(phoneno: string, purpose: "login" | "reset" = "login") {
    return callRpc<{ sent: boolean; expires_in: number }>(
      "soulplace.auth.request_patient_otp",
      { phoneno: normalizeIndianPhone(phoneno), purpose },
      true
    );
  },

  verifyPatientOtp(input: {
    phoneno: string;
    otp: string;
    purpose?: "login" | "reset";
    new_password?: string;
  }) {
    return callRpc<PatientLoginResponse & { password_reset?: boolean }>(
      "soulplace.auth.verify_patient_otp",
      { ...input, phoneno: normalizeIndianPhone(input.phoneno) },
      true
    );
  },

  requestEmailPasswordReset(email: string) {
    if (DEMO_MODE) return Promise.resolve();
    return callRpc<void>(
      "frappe.core.doctype.user.user.reset_password",
      { user: normalizeEmail(email) },
      true
    );
  },
  requestPatientPasswordReset(email: string) {
    if (DEMO_MODE) return Promise.resolve({ sent: true });
    return callRpc<{ sent: boolean }>(
      "soulplace.auth.request_patient_password_reset",
      { email: normalizeEmail(email) },
      true
    );
  },

  validatePatientPasswordResetKey(key: string) {
    if (DEMO_MODE) return Promise.resolve({ valid: true });
    return callRpc<{ valid: boolean }>(
      "soulplace.auth.validate_patient_password_reset_key",
      { key },
      true
    );
  },

  completePasswordReset(key: string, newPassword: string) {
    if (DEMO_MODE) return Promise.resolve("/patient/login");
    return callRpc<string>(
      "frappe.core.doctype.user.user.update_password",
      { key, new_password: newPassword, logout_all_sessions: 1 },
      true
    );
  },

  reapplyDoctor(input: { verificationFileBase64: string; verificationFileName: string }) {
    return callRpc<{ success: boolean; message: string; doctor: Doctor }>(
      "soulplace.api.reapply_doctor",
      input,
    );
  },

  async restore(): Promise<AuthSession> {
    if (DEMO_MODE) return demoRestoreSession();
    try {
      const identity = await callRpc<any>("soulplace.api.get_portal_identity", {}, true);
      
      if (identity.status === "anonymous" || !identity.username || identity.username === "Guest") {
        return { status: "anonymous", roles: [] };
      }
      
      return {
        status: "authenticated",
        username: identity.username,
        fullName: identity.fullName,
        roles: identity.roles || [],
        portal: identity.portal,
        patient: identity.patient,
        doctor: identity.doctor
      };
    } catch {
      return { status: "anonymous", roles: [] };
    }
  }
};
