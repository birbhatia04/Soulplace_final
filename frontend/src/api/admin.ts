import { callRpc, listRecords } from "./client";
import { DEMO_MODE } from "./demo";
import type {
  Appointment,
  AppointmentAuditTimeline,
  Consultation,
  Doctor,
  PatientConsentRecord,
  PatientUser,
  Prescription,
  TeleconsultSession
} from "../types/domain";

function listAdminDoctors(status = "") {
  return callRpc<Doctor[]>("soulplace.api.list_admin_doctors", {
    status,
    limit: 200
  }).then((data) => ({ data }));
}

export const adminApi = {
  async dashboardStats() {
    if (!DEMO_MODE) {
      return callRpc<{
        totalPatients: number;
        totalDoctors: number;
        pendingDoctors: number;
        todayAppointments: number;
        activeConsultations: number;
        cancelledAppointments: number;
        appointmentStatuses: Record<string, number>;
        appointmentTrend: Array<{ date: string; count: number }>;
        doctorApprovals: Record<string, number>;
      }>("soulplace.api.dashboard_stats");
    }
    const [patients, doctors, appointments, consultations] = await Promise.all([
      listRecords<PatientUser>("PatientUser", {
        fields: ["name"],
        limitPageLength: 1000
      }),
      listRecords<Doctor>("Doctor", {
        fields: ["name", "approval_status"],
        limitPageLength: 1000
      }),
      listRecords<Appointment>("Patient Appointment", {
        fields: ["name", "appointment_date", "status"],
        limitPageLength: 1000
      }),
      listRecords<Consultation>("Consultation", {
        fields: ["name", "creation"],
        limitPageLength: 1000
      })
    ]);
    const today = new Date().toISOString().slice(0, 10);
    return {
      totalPatients: patients.data.length,
      totalDoctors: doctors.data.length,
      pendingDoctors: doctors.data.filter(
        (doctor) => doctor.approval_status === "Pending"
      ).length,
      todayAppointments: appointments.data.filter(
        (appointment) => appointment.appointment_date === today
      ).length,
      activeConsultations: consultations.data.length,
      cancelledAppointments: appointments.data.filter(
        (appointment) => appointment.status === "Cancelled"
      ).length,
      appointmentStatuses: appointments.data.reduce<Record<string, number>>((result, appointment) => {
        result[appointment.status] = (result[appointment.status] || 0) + 1;
        return result;
      }, {}),
      appointmentTrend: Object.entries(
        appointments.data.reduce<Record<string, number>>((result, appointment) => {
          result[appointment.appointment_date] = (result[appointment.appointment_date] || 0) + 1;
          return result;
        }, {})
      ).map(([date, count]) => ({ date, count })),
      doctorApprovals: doctors.data.reduce<Record<string, number>>((result, doctor) => {
        result[doctor.approval_status] = (result[doctor.approval_status] || 0) + 1;
        return result;
      }, {})
    };
  },
  pendingDoctors() {
    if (!DEMO_MODE) return listAdminDoctors("Pending");
    return listRecords<Doctor>("Doctor", {
      fields: ["*"],
      filters: [["approval_status", "=", "Pending"]],
      orderBy: "creation asc",
      limitPageLength: 100
    });
  },
  approveDoctor(name: string) {
    if (DEMO_MODE) return Promise.resolve({ name, approval_status: "Approved", status: "Active" } as Doctor);
    return callRpc<Doctor>("soulplace.api.review_doctor", { name, decision: "Approved" });
  },
  rejectDoctor(name: string, reason: string) {
    if (DEMO_MODE) return Promise.resolve({ name, approval_status: "Rejected", status: "Inactive", rejection_reason: reason } as Doctor);
    return callRpc<Doctor>("soulplace.api.review_doctor", { name, decision: "Rejected", reason });
  },
  deleteDoctor(name: string) {
    return callRpc<{ success: boolean }>("soulplace.api.admin_delete_doctor", { doctor_name: name });
  },
  deletePatient(name: string) {
    return callRpc<{ success: boolean }>("soulplace.api.admin_delete_patient", { patient_name: name });
  },
  patients() {
    return listRecords<PatientUser>("PatientUser", {
      fields: ["*"],
      limitPageLength: 100
    });
  },
  doctors() {
    if (!DEMO_MODE) return listAdminDoctors();
    return listRecords<Doctor>("Doctor", {
      fields: ["*"],
      limitPageLength: 100
    });
  },
  appointments() {
    if (!DEMO_MODE) {
      return callRpc<Appointment[]>("soulplace.api.list_admin_appointments", {
        limit: 200
      }).then((data) => ({ data }));
    }
    return listRecords<Appointment>("Appointment", { fields: ["*"], limitPageLength: 100 });
  },
  consultations() {
    return listRecords<Consultation>("Consultation", {
      fields: ["*"],
      limitPageLength: 100
    });
  },
  prescriptions() {
    return listRecords<Prescription>("Prescription", {
      fields: ["*"],
      limitPageLength: 100
    });
  },
  consents() {
    return listRecords<PatientConsentRecord>("Patient Consent Record", {
      fields: ["*"],
      limitPageLength: 100
    });
  },
  timelines() {
    return listRecords<AppointmentAuditTimeline>(
      "Appointment Audit Timeline",
      { fields: ["*"], orderBy: "event_time desc", limitPageLength: 100 }
    );
  },
  sessions() {
    return listRecords<TeleconsultSession>("Teleconsult Session", {
      fields: ["*"],
      limitPageLength: 100
    });
  }
};
