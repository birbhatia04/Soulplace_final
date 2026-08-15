import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileHeart,
  FileText,
  Search,
  ShieldAlert,
  Stethoscope,
  UserRound,
  XCircle
} from "lucide-react";
import { adminApi } from "../api/admin";
import { absoluteFrappeUrl, normalizeApiError } from "../api/client";
import { doctorsApi } from "../api/doctors";
import {
  ConfirmDialog,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  FormField,
  LoadingSkeleton,
  PageHeader,
  Pagination,
  SearchFilterBar,
  SelectField,
  StatCard,
  StatusBadge,
  TextAreaField,
  Button,
  type Column,
  useToast
} from "../components/ui";
import { ScheduleExceptionsPage } from "./doctor";
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

const AdminCharts = lazy(() => import("../components/AdminCharts"));

export function AdminDashboardPage() {
  const stats = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: adminApi.dashboardStats
  });
  const pending = useQuery({
    queryKey: ["admin", "pending-doctors"],
    queryFn: adminApi.pendingDoctors
  });
  if (stats.isLoading) return <LoadingSkeleton rows={8} />;
  if (stats.isError) return <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />;
  const value = stats.data!;
  const statusData = Object.entries(value.appointmentStatuses).map(([name, count]) => ({ name, count }));
  const appointmentTrend = value.appointmentTrend
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-14)
    .map(({ date, count }) => ({ date: String(date).slice(5), count }));
  const approvalData = ["Pending", "Approved", "Rejected"].map((name) => ({
    name,
    count: value.doctorApprovals[name] || 0
  }));

  return (
    <>
      <PageHeader
        eyebrow="Operations overview"
        title="Care delivery at a glance"
        description="Live metrics from the configured SoulPlace Frappe records."
        actions={<Button variant="secondary" onClick={() => void stats.refetch()}>Refresh data</Button>}
      />
      <div className="stat-grid admin-stat-grid">
        <StatCard label="Total patients" value={value.totalPatients} icon={<UserRound />} />
        <StatCard label="Total doctors" value={value.totalDoctors} icon={<Stethoscope />} tone="blue" />
        <StatCard label="Pending doctor approvals" value={value.pendingDoctors} icon={<ClipboardCheck />} tone="gold" />
        <StatCard label="Today’s appointments" value={value.todayAppointments} icon={<CalendarDays />} />
        <StatCard label="Consultation records" value={value.activeConsultations} icon={<FileHeart />} tone="blue" />
        <StatCard label="Cancelled appointments" value={value.cancelledAppointments} icon={<XCircle />} tone="rose" />
      </div>
      <div className="chart-grid">
        <Suspense fallback={<LoadingSkeleton rows={6} />}><AdminCharts appointmentTrend={appointmentTrend} statusData={statusData} approvalData={approvalData} /></Suspense>
        <section className="panel approval-queue">
          <div className="panel-header"><div><p className="eyebrow">Quick action</p><h2>Approval queue</h2></div><Link to="/admin/doctors?status=Pending">Open all</Link></div>
          {pending.isLoading ? <LoadingSkeleton rows={4} compact /> :
            pending.isError ? <ErrorState error={pending.error} onRetry={() => void pending.refetch()} /> :
            pending.data!.data.length ? <div className="summary-list">{pending.data!.data.slice(0, 5).map((doctor) => <Link key={doctor.name} to={`/admin/doctors/${doctor.name}`}><span className="avatar avatar-small">{doctor.full_name?.charAt(0) || "D"}</span><span><strong>{doctor.full_name}</strong><small>{doctor.specialty}</small></span><ArrowRight /></Link>)}</div> :
            <EmptyState title="Queue is clear" description="No doctor applications are waiting." icon={<CheckCircle2 />} />}
        </section>
      </div>
      <section className="panel">
        <div className="panel-header"><div><p className="eyebrow">System health</p><h2>Recent operational activity</h2></div><Link to="/admin/audit">View audit timeline</Link></div>
        <div className="activity-strip">
          <div><span className="shortcut-icon sage"><UserRound /></span><p><strong>{value.totalPatients}</strong> patient profiles</p></div>
          <div><span className="shortcut-icon gold"><Stethoscope /></span><p><strong>{value.pendingDoctors}</strong> doctor approvals waiting</p></div>
          <div><span className="shortcut-icon rose"><ShieldAlert /></span><p><strong>{value.cancelledAppointments}</strong> cancellations to review</p></div>
        </div>
      </section>
    </>
  );
}

function AdminTablePage<T extends { name: string }>({
  eyebrow,
  title,
  description,
  queryKey,
  queryFn,
  columns,
  searchText,
  statusKey,
  statuses,
  initialStatus = "",
  toolbar,
  additionalFilter,
  onRowClick
}: {
  eyebrow: string;
  title: string;
  description: string;
  queryKey: string;
  queryFn: () => Promise<{ data: T[] }>;
  columns: Column<T>[];
  searchText(row: T): string;
  statusKey?: keyof T;
  statuses?: string[];
  initialStatus?: string;
  toolbar?: ReactNode;
  additionalFilter?: (row: T) => boolean;
  onRowClick?: (row: T) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const query = useQuery({ queryKey: ["admin", queryKey], queryFn });
  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();
    return (query.data?.data || []).filter((row) =>
      (!search || searchText(row).toLowerCase().includes(searchLower)) &&
      (!status || !statusKey || String(row[statusKey]) === status) &&
      (!additionalFilter || additionalFilter(row))
    );
  }, [query.data, search, status, statusKey, searchText, additionalFilter]);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description} actions={<Button variant="secondary" onClick={() => window.print()}>Export / print</Button>} />
      <SearchFilterBar value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={`Search ${title.toLowerCase()}`}>
        {statuses && statusKey && <SelectField label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</SelectField>}
        {toolbar}
      </SearchFilterBar>
      {query.isLoading ? <LoadingSkeleton rows={8} /> :
        query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> :
        paged.length ? <><DataTable rows={paged} columns={columns} caption={title} onRowClick={onRowClick} /><Pagination page={page} hasNext={page * pageSize < filtered.length} onPage={setPage} /></> :
        <EmptyState title={`No ${title.toLowerCase()} found`} description="Try changing the search or status filter." icon={<Search />} />}
    </>
  );
}

export function AdminPatientsPage() {
  const [selected, setSelected] = useState<PatientUser>();
  const queryClient = useQueryClient();
  const toast = useToast();

  const deletePat = useMutation({
    mutationFn: () => adminApi.deletePatient(selected?.name || ""),
    onSuccess: () => {
      toast.notify("Patient deleted.");
      setSelected(undefined);
      void queryClient.invalidateQueries({ queryKey: ["admin", "patients"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    }
  });

  const columns: Column<PatientUser>[] = [
    { key: "name", header: "Patient", render: (row) => <span><strong>{row.name1}</strong><small className="table-subtext">{row.name}</small></span> },
    { key: "phone", header: "Phone", render: (row) => row.phoneno },
    { key: "age", header: "Age", render: (row) => row.age },
    { key: "language", header: "Language", render: (row) => row.preferred_language || "—" },
    { key: "consent", header: "Consent record", render: (row) => <StatusBadge status={row.consent_status || "Not recorded"} /> }
  ];
  return <><AdminTablePage eyebrow="People" title="Patients" description="Patients are active immediately after registration. There is no patient approval workflow." queryKey="patients" queryFn={adminApi.patients} columns={columns} searchText={(row) => `${row.name1} ${row.phoneno} ${row.name}`} onRowClick={setSelected} /><Drawer open={Boolean(selected)} title="Patient details" onClose={() => setSelected(undefined)}>{selected && <div className="drawer-content"><dl className="detail-list drawer-details"><div><dt>Name</dt><dd>{selected.name1}</dd></div><div><dt>Phone</dt><dd>{selected.phoneno}</dd></div><div><dt>Age / gender</dt><dd>{selected.age} · {selected.gender}</dd></div><div><dt>Account</dt><dd>Active · no approval required</dd></div><div><dt>App user</dt><dd>{selected.app_user || "Not linked"}</dd></div><div><dt>Emergency contact</dt><dd>{selected.emergency_contact_name || "Not set"} {selected.emergency_contact_phone || ""}</dd></div><div><dt>Consent record</dt><dd><StatusBadge status={selected.consent_status || "Not recorded"} /></dd></div></dl><div className="drawer-danger-actions"><Button variant="danger" disabled={deletePat.isPending} onClick={() => { if(confirm("Are you sure you want to delete this patient? This action cannot be undone.")) deletePat.mutate(); }}>{deletePat.isPending ? "Deleting..." : "Delete patient"}</Button></div></div>}</Drawer></>;
}

export function AdminDoctorsPage() {
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get("status");
  const [selected, setSelected] = useState<Doctor>();
  const queryClient = useQueryClient();
  const toast = useToast();

  const deleteDoc = useMutation({
    mutationFn: () => adminApi.deleteDoctor(selected?.name || ""),
    onSuccess: () => {
      toast.notify("Doctor deleted.");
      setSelected(undefined);
      void queryClient.invalidateQueries({ queryKey: ["admin", "doctors"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    },
    onError: (e) => {
      toast.notify(`Failed to delete doctor: ${normalizeApiError(e).message}`, "error");
    }
  });

  const columns: Column<Doctor>[] = [
    { key: "name", header: "Doctor", render: (row) => <span><strong>{row.full_name}</strong><small className="table-subtext">{row.specialty}</small></span> },
    { key: "email", header: "Email / Mobile", render: (row) => <span>{row.email}<small className="table-subtext">{row.mobile_number}</small></span> },
    { key: "fee", header: "Fee", render: (row) => `₹${Number(row.consultation_fee || 0).toLocaleString()}` },
    { key: "availability", header: "Availability", render: (row) => <StatusBadge status={row.status} /> },
    { key: "approval", header: "Approval", render: (row) => <StatusBadge status={row.approval_status} /> },
    { key: "action", header: "", render: (row) => <Link className="text-link" to={`/admin/doctors/${row.name}`}>Review <ArrowRight /></Link> }
  ];
  return <><AdminTablePage eyebrow="Care network" title="Doctors" description={`Review professional profiles and approvals${initialStatus ? ` · ${initialStatus}` : ""}.`} queryKey="doctors" queryFn={adminApi.doctors} columns={columns} searchText={(row) => `${row.full_name} ${row.email} ${row.specialty} ${row.specialization_tags}`} statusKey="approval_status" statuses={["Pending", "Approved", "Rejected"]} initialStatus={initialStatus || ""} onRowClick={setSelected} /><Drawer open={Boolean(selected)} title="Doctor preview" onClose={() => setSelected(undefined)}>{selected && <div className="drawer-profile"><span className="avatar avatar-profile">{selected.full_name.charAt(0)}</span><h2>{selected.full_name}</h2><p>{selected.specialty}</p><StatusBadge status={selected.approval_status} /><div className="drawer-actions"><Link className="button button-primary" to={`/admin/doctors/${selected.name}`}>Open full review</Link><Button variant="danger" disabled={deleteDoc.isPending} onClick={() => { if(confirm("Are you sure you want to delete this doctor? This action cannot be undone.")) deleteDoc.mutate(); }}>Delete</Button></div></div>}</Drawer></>;
}

export function AdminDoctorDetailPage() {
  const { doctorId } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const doctor = useQuery({ queryKey: ["admin", "doctor", doctorId], queryFn: () => doctorsApi.get(doctorId || ""), enabled: Boolean(doctorId) });
  const approve = useMutation({
    mutationFn: () => adminApi.approveDoctor(doctorId || ""),
    onSuccess: () => { toast.notify("Doctor approved."); void queryClient.invalidateQueries({ queryKey: ["admin"] }); }
  });
  const reject = useMutation({
    mutationFn: () => adminApi.rejectDoctor(doctorId || "", reason),
    onSuccess: () => { toast.notify("Doctor application rejected with the review reason recorded."); setRejectOpen(false); void queryClient.invalidateQueries({ queryKey: ["admin"] }); void doctor.refetch(); }
  });
  if (doctor.isLoading) return <LoadingSkeleton rows={8} />;
  if (doctor.isError) return <ErrorState error={doctor.error} onRetry={() => void doctor.refetch()} />;
  if (!doctor.data) return <EmptyState title="Doctor not found" description="This Doctor record is unavailable." />;
  const item = doctor.data;
  return (
    <>
      <PageHeader eyebrow="Credential review" title={item.full_name} description={`${item.specialty} · ${item.email}`} actions={<StatusBadge status={item.approval_status} />} />
      <div className="approval-layout">
        <section className="panel">
          <h2>Professional profile</h2>
          <dl className="detail-list"><div><dt>Full name</dt><dd>{item.full_name}</dd></div><div><dt>Email</dt><dd>{item.email}</dd></div><div><dt>Mobile</dt><dd>{item.mobile_number}</dd></div><div><dt>Specialty</dt><dd>{item.specialty}</dd></div><div><dt>Medical registration</dt><dd>{item.medical_registration || "Not provided"}</dd></div><div><dt>Specialization tags</dt><dd>{item.specialization_tags || "Not provided"}</dd></div><div><dt>Consultation fee</dt><dd>₹{Number(item.consultation_fee || 0).toLocaleString()}</dd></div><div><dt>Average duration</dt><dd>{item.avg_consult_duration_mins || 30} minutes</dd></div><div><dt>Teleconsult</dt><dd>{item.teleconsult_enabled ? "Enabled" : "Disabled"}</dd></div>{item.rejection_reason && <div><dt>Previous rejection reason</dt><dd>{item.rejection_reason}</dd></div>}</dl>
        </section>
        <aside className="panel verification-panel">
          <h2>Verification document</h2>
          {item.verification_proof ? <a className="verification-file" href={absoluteFrappeUrl(item.verification_proof)} target="_blank" rel="noreferrer"><FileText /><span><strong>Open verification proof</strong><small>Private Frappe file · authentication required</small></span><ArrowRight /></a> : <EmptyState title="No document attached" description="No verification proof is attached to this Doctor record." />}
          <div className="approval-actions">
            <Button onClick={() => approve.mutate()} disabled={approve.isPending || item.approval_status === "Approved"}><CheckCircle2 /> {approve.isPending ? "Approving…" : "Approve"}</Button>
            <Button variant="danger" onClick={() => setRejectOpen(true)} disabled={item.approval_status === "Rejected"}><XCircle /> Reject</Button>
          </div>
        </aside>
      </div>
  <ConfirmDialog open={rejectOpen} title="Reject this doctor?" description="The reason is stored with the reviewer and review time, and shown to the doctor." confirmLabel="Reject doctor" destructive busy={reject.isPending} confirmDisabled={!reason.trim()} onCancel={() => setRejectOpen(false)} onConfirm={() => reject.mutate()}>
        <TextAreaField label="Rejection reason" value={reason} onChange={(event) => setReason(event.target.value)} required />
      </ConfirmDialog>
    </>
  );
}

export function AdminAppointmentsPage() {
  const [date, setDate] = useState("");
  const [doctor, setDoctor] = useState("");
  const [patient, setPatient] = useState("");
  const columns: Column<Appointment>[] = [
    { key: "id", header: "Appointment", render: (row) => <strong>{row.name}</strong>, sortValue: (row) => row.name },
    { key: "patient", header: "Patient", render: (row) => row.patient_name || row.patient, sortValue: (row) => row.patient_name || row.patient },
    { key: "doctor", header: "Doctor", render: (row) => row.doctor_name || row.doctor, sortValue: (row) => row.doctor_name || row.doctor },
    { key: "date", header: "Date & time", render: (row) => <span>{row.appointment_date}<small className="table-subtext">{row.appointment_time}</small></span>, sortValue: (row) => `${row.appointment_date} ${row.appointment_time}` },
    { key: "format", header: "Format", render: (row) => row.is_teleconsult ? "Teleconsult" : "In-person" },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} />, sortValue: (row) => row.status }
  ];
  return <AdminTablePage
    eyebrow="Operations"
    title="Appointments"
    description="Filter care requests across date, doctor, patient, and status using live backend records."
    queryKey="appointments"
    queryFn={adminApi.appointments}
    columns={columns}
    searchText={(row) => `${row.name} ${row.patient_name || ""} ${row.patient} ${row.doctor_name || ""} ${row.doctor} ${row.appointment_date} ${row.symptoms}`}
    statusKey="status"
    statuses={["Pending", "Confirmed", "Completed", "Cancelled"]}
    additionalFilter={(row) =>
      (!date || row.appointment_date === date) &&
      (!doctor || `${row.doctor_name || ""} ${row.doctor}`.toLowerCase().includes(doctor.toLowerCase())) &&
      (!patient || `${row.patient_name || ""} ${row.patient}`.toLowerCase().includes(patient.toLowerCase()))
    }
    toolbar={
      <>
        <FormField label="Date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <FormField label="Doctor" value={doctor} onChange={(event) => setDoctor(event.target.value)} placeholder="Doctor name" />
        <FormField label="Patient" value={patient} onChange={(event) => setPatient(event.target.value)} placeholder="Patient name" />
      </>
    }
  />;
}

export function AdminConsultationsPage() {
  const columns: Column<Consultation>[] = [
    { key: "id", header: "Consultation", render: (row) => <strong>{row.name}</strong> },
    { key: "appointment", header: "Appointment", render: (row) => row.appointment },
    { key: "doctor", header: "Doctor", render: (row) => row.doctor },
    { key: "complaint", header: "Chief complaint", render: (row) => row.chief_complaint || "—" },
    { key: "followup", header: "Follow-up", render: (row) => row.follow_up_date || "—" }
  ];
  return <AdminTablePage eyebrow="Clinical operations" title="Consultations" description="Review consultation records and follow-up coverage." queryKey="consultations" queryFn={adminApi.consultations} columns={columns} searchText={(row) => `${row.name} ${row.appointment} ${row.doctor} ${row.chief_complaint} ${row.diagnosis}`} />;
}

export function AdminPrescriptionsPage() {
  const columns: Column<Prescription>[] = [
    { key: "medicine", header: "Medicine", render: (row) => <strong>{row.medicine_name}</strong> },
    { key: "dosage", header: "Dosage", render: (row) => row.dosage },
    { key: "consultation", header: "Consultation", render: (row) => row.consultation },
    { key: "instructions", header: "Instructions", render: (row) => row.instructions || "—" }
  ];
  return <AdminTablePage eyebrow="Clinical operations" title="Prescriptions" description="Search prescription records across consultations." queryKey="prescriptions" queryFn={adminApi.prescriptions} columns={columns} searchText={(row) => `${row.medicine_name} ${row.dosage} ${row.consultation} ${row.instructions}`} />;
}

export function AdminConsentsPage() {
  const columns: Column<PatientConsentRecord>[] = [
    { key: "patient", header: "Patient", render: (row) => <strong>{row.patient}</strong> },
    { key: "type", header: "Consent type", render: (row) => row.consent_type },
    { key: "version", header: "Version", render: (row) => row.consent_version || "—" },
    { key: "source", header: "Source", render: (row) => row.capture_source },
    { key: "date", header: "Granted / revoked", render: (row) => row.granted_on || row.revoked_on || "—" },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> }
  ];
  return <AdminTablePage eyebrow="Governance" title="Consent records" description="Audit consent type, version, capture source, and status." queryKey="consents" queryFn={adminApi.consents} columns={columns} searchText={(row) => `${row.patient} ${row.consent_type} ${row.consent_version} ${row.capture_source}`} statusKey="status" statuses={["Granted", "Revoked"]} />;
}

export function AdminAuditPage() {
  const columns: Column<AppointmentAuditTimeline>[] = [
    { key: "appointment", header: "Appointment", render: (row) => <strong>{row.appointment}</strong> },
    { key: "event", header: "Event", render: (row) => row.event_type },
    { key: "change", header: "Status change", render: (row) => `${row.previous_status || "—"} → ${row.new_status || "—"}` },
    { key: "actor", header: "Actor", render: (row) => <span>{row.actor_user || "Unknown"}<small className="table-subtext">{row.actor_role}</small></span> },
    { key: "reason", header: "Reason", render: (row) => row.reason || "—" },
    { key: "time", header: "Event time", render: (row) => row.event_time || "—" }
  ];
  return <AdminTablePage eyebrow="Governance" title="Audit timeline" description="Review appointment lifecycle events and actors." queryKey="audit" queryFn={adminApi.timelines} columns={columns} searchText={(row) => `${row.appointment} ${row.event_type} ${row.actor_user} ${row.reason}`} />;
}

export function AdminTeleconsultsPage() {
  const columns: Column<TeleconsultSession>[] = [
    { key: "session", header: "Session", render: (row) => <strong>{row.name}</strong> },
    { key: "appointment", header: "Appointment", render: (row) => row.appointment },
    { key: "people", header: "Doctor / patient", render: (row) => <span>{row.practitioner}<small className="table-subtext">{row.patient}</small></span> },
    { key: "provider", header: "Provider", render: (row) => row.provider },
    { key: "time", header: "Start", render: (row) => row.start_time || "—" },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.session_status} /> }
  ];
  return <AdminTablePage eyebrow="Remote care" title="Teleconsult sessions" description="Monitor created, live, failed, completed, and cancelled sessions." queryKey="teleconsults" queryFn={adminApi.sessions} columns={columns} searchText={(row) => `${row.name} ${row.appointment} ${row.practitioner} ${row.patient} ${row.provider}`} statusKey="session_status" statuses={["Created", "Live", "Completed", "Failed", "Cancelled"]} />;
}

export function AdminScheduleExceptionsPage() {
  return <ScheduleExceptionsPage admin />;
}
