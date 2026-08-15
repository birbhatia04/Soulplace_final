import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileHeart,
  IndianRupee,
  Pill,
  Plus,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { isUpcomingAppointment } from "../appointmentStatus";
import { appointmentsApi } from "../api/appointments";
import { syncAppointmentCache } from "../api/appointmentCache";
import { normalizeApiError } from "../api/client";
import { consultationsApi } from "../api/consultations";
import { doctorsApi } from "../api/doctors";
import { patientsApi } from "../api/patients";
import { prescriptionsApi } from "../api/prescriptions";
import { teleconsultApi } from "../api/teleconsult";
import { googleMeetApi, isGoogleMeetLink } from "../api/googleMeet";
import { GoogleMeetCard } from "../components/GoogleMeetCard";
import {
  AppointmentCard,
  Breadcrumbs,
  Button,
  ConfirmDialog,
  ConsultationEditor,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  LoadingSkeleton,
  PageHeader,
  PrescriptionForm,
  SearchFilterBar,
  SelectField,
  StatCard,
  StatusBadge,
  TextAreaField,
  useToast,
  type Column
} from "../components/ui";
import { UtilityLinks } from "../components/Shells";
import type {
  Appointment,
  Consultation,
  DoctorScheduleException,
  Prescription
} from "../types/domain";

function useDoctorAppointments() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["appointments", "doctor", auth.doctor?.name],
    queryFn: () =>
      appointmentsApi.list({
        filters: [["doctor", "=", auth.doctor?.name || ""]],
        orderBy: "appointment_date asc, appointment_time asc",
        limitPageLength: 200
      }),
    enabled: Boolean(auth.doctor?.name)
  });
}

export function doctorGreetingName(fullName = "") {
  const nameWithoutTitle = fullName.trim().replace(/^dr\.?\s*/i, "");
  return nameWithoutTitle.split(/\s+/)[0] || "Doctor";
}

export function DoctorDashboardPage() {
  const auth = useAuth();
  const query = useDoctorAppointments();
  const consultations = useQuery({
    queryKey: ["consultations", "doctor", auth.doctor?.name],
    queryFn: () =>
      consultationsApi.list({
        filters: [["doctor", "=", auth.doctor?.name || ""]],
        orderBy: "creation desc",
        limitPageLength: 100
      }),
    enabled: Boolean(auth.doctor?.name)
  });
  const today = new Date().toISOString().slice(0, 10);
  const rows = query.data?.data || [];
  const todays = rows.filter((item) => item.appointment_date === today);
  const confirmed = rows.filter((item) => item.status === "Confirmed");
  const pending = rows.filter((item) => item.status === "Pending");
  const completed = rows.filter((item) => item.status === "Completed");
  const upcoming = rows.filter((item) => isUpcomingAppointment(item, today));
  const earnings = completed.length * Number(auth.doctor?.consultation_fee || 0);

  return (
    <>
      <section className="doctor-welcome">
        <div>
          <p className="eyebrow">Clinical workspace</p>
          <h1>Good day, Dr. {doctorGreetingName(auth.doctor?.full_name)}</h1>
          <p>Here’s what needs your attention today.</p>
        </div>
        <div className="availability-pill">
          <span className={auth.doctor?.status === "Active" ? "online" : ""} />
          <div><small>Current status</small><strong>{auth.doctor?.status || "Unknown"}</strong></div>
          <Link to="/doctor/availability">Change</Link>
        </div>
      </section>
      <div className="stat-grid">
        <StatCard label="Today’s appointments" value={todays.length} icon={<CalendarDays />} trend={`${confirmed.length} confirmed`} />
        <StatCard label="Pending requests" value={pending.length} icon={<Clock3 />} tone="gold" trend="Needs review" />
        <StatCard label="Completed care" value={consultations.data?.data.length || completed.length} icon={<CheckCircle2 />} tone="blue" trend="Consultations recorded" />
        <StatCard label="Consultation value" value={`₹${earnings.toLocaleString()}`} icon={<IndianRupee />} tone="rose" trend="Calculated from completed appointments" />
      </div>
      <div className="quick-actions">
        <Link to="/doctor/requests"><span className="shortcut-icon gold"><Clock3 /></span><span><strong>Review patient requests</strong><small>{pending.length} waiting</small></span><ArrowRight /></Link>
        <Link to="/doctor/availability"><span className="shortcut-icon sage"><CalendarCheck /></span><span><strong>Set availability</strong><small>{auth.doctor?.availability || "Not configured"}</small></span><ArrowRight /></Link>
        <Link to="/doctor/consultations"><span className="shortcut-icon blue"><FileHeart /></span><span><strong>Clinical notes</strong><small>Open consultation workspace</small></span><ArrowRight /></Link>
      </div>
      <section className="panel">
        <div className="panel-header"><div><p className="eyebrow">Schedule</p><h2>Upcoming consultations</h2></div><Link to="/doctor/appointments">View calendar</Link></div>
        {query.isLoading ? <LoadingSkeleton rows={4} /> :
          query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> :
          upcoming.length ? (
            <div className="appointment-list compact">
              {upcoming.slice(0, 5).map((item) => (
                <AppointmentCard key={item.name} appointment={item} patientName={item.patient_name || item.patient} actions={<Link className="text-link" to={`/doctor/appointments/${item.name}`}>Open <ArrowRight /></Link>} />
              ))}
            </div>
          ) : <EmptyState title="Your schedule is clear" description="Confirmed and pending appointments will appear here." />}
      </section>
    </>
  );
}

export function DoctorRequestsPage() {
  const appointments = useDoctorAppointments();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [declineTarget, setDeclineTarget] = useState<Appointment>();
  const [confirmTarget, setConfirmTarget] = useState<Appointment>();
  const [meetingLink, setMeetingLink] = useState("");
  const [reason, setReason] = useState("");
  const patients = useQuery({
    queryKey: ["patients", "request-context", appointments.data?.data.map((item) => item.patient)],
    queryFn: async () => {
      const ids = Array.from(new Set((appointments.data?.data || []).map((item) => item.patient)));
      const rows = await Promise.all(ids.map((id) => patientsApi.get(id)));
      return Object.fromEntries(rows.map((patient) => [patient.name, patient]));
    },
    enabled: Boolean(appointments.data?.data.length)
  });
  const confirm = useMutation({
    mutationFn: () =>
      appointmentsApi.confirm(
        confirmTarget?.name || "",
        confirmTarget?.is_teleconsult ? meetingLink.trim() : ""
      ),
    onSuccess: () => {
      toast.notify("Appointment confirmed.");
      setConfirmTarget(undefined);
      setMeetingLink("");
      void queryClient.invalidateQueries({ queryKey: ["appointments", "doctor"] });
    },
    onError: (error) => toast.notify(normalizeApiError(error).message)
  });
  const decline = useMutation({
    mutationFn: () => appointmentsApi.reject(declineTarget?.name || "", reason),
    onSuccess: () => {
      toast.notify("Appointment request declined.");
      setDeclineTarget(undefined);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["appointments", "doctor"] });
    }
  });
  const pending = appointments.data?.data.filter((item) => item.status === "Pending") || [];
  return (
    <>
      <PageHeader eyebrow="Appointment queue" title="Patient requests" description="Review requests assigned only to your Doctor record." />
      {appointments.isLoading ? <LoadingSkeleton rows={6} /> :
        appointments.isError ? <ErrorState error={appointments.error} onRetry={() => void appointments.refetch()} /> :
        pending.length ? (
          <div className="request-list">
            {pending.map((item) => {
              const patient = patients.data?.[item.patient];
              return (
                <article className="request-card" key={item.name}>
                  <div className="request-head">
                    <div className="patient-card-inline"><span className="avatar">{patient?.name1?.charAt(0) || item.patient_name?.charAt(0) || "P"}</span><span><strong>{patient?.name1 || item.patient_name || item.patient}</strong><small>{patient ? `${patient.age} years · ${patient.gender}` : "Patient details loading"}</small></span></div>
                    <StatusBadge status={item.status} />
                  </div>
                  <dl><div><dt>Date</dt><dd>{item.appointment_date}</dd></div><div><dt>Time</dt><dd>{item.appointment_time}</dd></div><div><dt>Format</dt><dd>{item.is_teleconsult ? "Teleconsult" : "In-person"}</dd></div></dl>
                  <div className="request-reason"><small>Reason for consultation</small><p>{item.symptoms || "Not provided"}</p></div>
                  <div className="card-actions">
                    <Button disabled={confirm.isPending} onClick={() => { setConfirmTarget(item); setMeetingLink(""); }}><CheckCircle2 /> Confirm request</Button>
                    <Button variant="secondary" onClick={() => setDeclineTarget(item)}>Decline</Button>
                    <Link className="text-link" to={`/doctor/appointments/${item.name}`}>View details</Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : <EmptyState title="No requests waiting" description="New patient appointment requests will appear here." icon={<CheckCircle2 />} />}
      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title="Confirm appointment request?"
        description={confirmTarget?.is_teleconsult ? "Enter the Google Meet link that the patient will use, then confirm the appointment." : "Confirm this in-person appointment request."}
        confirmLabel="Confirm appointment"
        busy={confirm.isPending}
        confirmDisabled={Boolean(confirmTarget?.is_teleconsult) && !isGoogleMeetLink(meetingLink.trim())}
        onCancel={() => { setConfirmTarget(undefined); setMeetingLink(""); }}
        onConfirm={() => confirm.mutate()}
      >
        {confirmTarget?.is_teleconsult ? (
          <FormField
            label="Google Meet link"
            type="url"
            value={meetingLink}
            onChange={(event) => setMeetingLink(event.target.value)}
            placeholder="https://meet.google.com/abc-defg-hij"
            hint="Create the room in Google Meet, then paste its complete link here."
            required
          />
        ) : null}
      </ConfirmDialog>
      <ConfirmDialog open={Boolean(declineTarget)} title="Decline this request?" description="A cancellation reason is required and will be written to Appointment.cancel_reason." confirmLabel="Decline request" destructive busy={decline.isPending} confirmDisabled={!reason.trim()} onCancel={() => setDeclineTarget(undefined)} onConfirm={() => decline.mutate()}>
        <TextAreaField label="Reason for declining" value={reason} onChange={(event) => setReason(event.target.value)} required />
      </ConfirmDialog>
    </>
  );
}

export function DoctorAppointmentsPage() {
  const query = useDoctorAppointments();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const rows = (query.data?.data || []).filter((item) =>
    (!search || `${item.patient_name || ""} ${item.patient} ${item.symptoms}`.toLowerCase().includes(search.toLowerCase())) &&
    (!status || item.status === status)
  );
  const columns: Column<Appointment>[] = [
    { key: "patient", header: "Patient", render: (row) => <strong>{row.patient_name || row.patient}</strong> },
    { key: "date", header: "Date & time", render: (row) => <span>{row.appointment_date}<small className="table-subtext">{row.appointment_time}</small></span> },
    { key: "type", header: "Format", render: (row) => row.is_teleconsult ? "Teleconsult" : "In-person" },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "action", header: "", render: (row) => <Link className="text-link" to={`/doctor/appointments/${row.name}`}>Open <ArrowRight /></Link> }
  ];
  return (
    <>
      <PageHeader eyebrow="Clinical calendar" title="Appointments" description="All requests and scheduled care assigned to you." />
      <SearchFilterBar value={search} onChange={setSearch} placeholder="Search patient or reason">
        <SelectField label="Status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option>Pending</option><option>Confirmed</option><option>Completed</option><option>Cancelled</option></SelectField>
      </SearchFilterBar>
      {query.isLoading ? <LoadingSkeleton rows={7} /> :
        query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> :
        rows.length ? <DataTable rows={rows} columns={columns} caption="Doctor appointments" /> :
        <EmptyState title="No appointments found" description="Try changing the search or status filter." />}
    </>
  );
}

export function DoctorAppointmentDetailPage() {
  const auth = useAuth();
  const { appointmentId } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [manualMeetOpen, setManualMeetOpen] = useState(false);
  const [meetingLink, setMeetingLink] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const appointment = useQuery({ queryKey: ["appointment", appointmentId], queryFn: () => appointmentsApi.get(appointmentId || ""), enabled: Boolean(appointmentId) });
  const patient = useQuery({ queryKey: ["patient", appointment.data?.patient], queryFn: () => patientsApi.get(appointment.data?.patient || ""), enabled: Boolean(appointment.data?.patient) });
  const session = useQuery({ queryKey: ["teleconsult", appointmentId], queryFn: () => teleconsultApi.list({ filters: [["appointment", "=", appointmentId || ""]], fields: ["*"], limitPageLength: 1 }), enabled: Boolean(appointment.data?.is_teleconsult) });
  const confirmMutation = useMutation({
    mutationFn: () =>
      appointmentsApi.confirm(
        appointmentId || "",
        appointment.data?.is_teleconsult ? meetingLink.trim() : ""
      ),
    onSuccess: (updated) => {
      toast.notify("Appointment confirmed.");
      setConfirmOpen(false);
      setMeetingLink("");
      void syncAppointmentCache(queryClient, updated);
      void queryClient.invalidateQueries({ queryKey: ["teleconsult", appointmentId] });
    },
    onError: (error) => toast.notify(normalizeApiError(error).message)
  });
  const completeMutation = useMutation({
    mutationFn: () => appointmentsApi.complete(appointmentId || ""),
    onSuccess: (updated) => {
      toast.notify("Appointment marked completed.");
      void syncAppointmentCache(queryClient, updated);
    },
    onError: (error) => toast.notify(normalizeApiError(error).message)
  });
  const saveManualMeet = useMutation({
    mutationFn: () =>
      teleconsultApi.saveManualGoogleMeet(appointmentId || "", meetingLink.trim()),
    onSuccess: () => {
      toast.notify("Google Meet link saved.");
      setManualMeetOpen(false);
      setMeetingLink("");
      void queryClient.invalidateQueries({ queryKey: ["teleconsult", appointmentId] });
      void queryClient.invalidateQueries({ queryKey: ["appointment", appointmentId] });
    },
    onError: (error) => toast.notify(normalizeApiError(error).message)
  });
  const rejectMutation = useMutation({
    mutationFn: () => appointmentsApi.reject(appointmentId || "", rejectReason),
    onSuccess: (updated) => {
      toast.notify("Appointment request declined. The patient has been asked to book a new appointment.");
      setRejectOpen(false);
      setRejectReason("");
      void syncAppointmentCache(queryClient, updated);
    },
    onError: (error) => toast.notify(normalizeApiError(error).message)
  });
  const createMeet = useMutation({
    mutationFn: async () => {
      const item = appointment.data;
      if (!item || !auth.doctor) throw new Error("The appointment is not ready yet.");
      if (!item.is_teleconsult) throw new Error("This is not a video consultation.");
      if (item.status !== "Confirmed") {
        throw new Error("Confirm the appointment before creating its Meet room.");
      }

      const space = await googleMeetApi.createSpace({ loginHint: auth.doctor.email });
      return teleconsultApi.saveGoogleMeet(item.name, space.name, space.meetingUri);
    },
    onSuccess: () => {
      toast.notify("Google Meet room created. You and the patient can now join.");
      void queryClient.invalidateQueries({ queryKey: ["teleconsult", appointmentId] });
      void queryClient.invalidateQueries({ queryKey: ["appointment", appointmentId] });
      void queryClient.invalidateQueries({ queryKey: ["appointments", "doctor"] });
    }
  });
  if (appointment.isLoading) return <LoadingSkeleton rows={7} />;
  if (appointment.isError) return <ErrorState error={appointment.error} onRetry={() => void appointment.refetch()} />;
  if (!appointment.data || appointment.data.doctor !== auth.doctor?.name) return <ErrorState error={new Error("This appointment is not assigned to your Doctor record.")} />;
  const item = appointment.data;
  return (
    <>
      <Breadcrumbs items={[{ label: "Appointments", to: "/doctor/appointments" }, { label: item.name }]} />
      <PageHeader title="Appointment workspace" description={`${item.appointment_date} at ${item.appointment_time}`} actions={<StatusBadge status={item.status} />} />
      {item.is_teleconsult ? (
        <GoogleMeetCard
          audience="doctor"
          appointmentStatus={item.status}
          session={session.data?.data[0]}
          loading={session.isLoading}
          configured={googleMeetApi.isConfigured()}
          doctorEmail={auth.doctor.email}
          creating={createMeet.isPending}
          error={session.error || createMeet.error}
          automaticCreationEnabled={googleMeetApi.isAutomaticCreationEnabled()}
          onCreate={googleMeetApi.isAutomaticCreationEnabled() ? () => createMeet.mutate() : undefined}
        />
      ) : null}
      <div className="clinical-layout">
        <section className="panel">
          <div className="patient-header"><span className="avatar avatar-profile">{patient.data?.name1?.charAt(0) || item.patient_name?.charAt(0) || "P"}</span><div><p className="eyebrow">Patient</p><h2>{patient.data?.name1 || item.patient_name || item.patient}</h2><p>{patient.data ? `${patient.data.age} years · ${patient.data.gender}` : "Loading profile"}</p></div></div>
          <dl className="detail-list"><div><dt>Reason</dt><dd>{item.symptoms || "Not provided"}</dd></div><div><dt>Format</dt><dd>{item.is_teleconsult ? "Teleconsult" : "In-person"}</dd></div><div><dt>Notes</dt><dd>{item.notes || "None"}</dd></div></dl>
          <div className="card-actions">
            {item.status === "Pending" && (
              <>
                <Button disabled={confirmMutation.isPending || rejectMutation.isPending} onClick={() => { setMeetingLink(""); setConfirmOpen(true); }}>{confirmMutation.isPending ? "Confirming…" : "Accept request"}</Button>
                <Button variant="secondary" disabled={confirmMutation.isPending || rejectMutation.isPending} onClick={() => setRejectOpen(true)}>Reject request</Button>
              </>
            )}
            {item.status === "Confirmed" && <Button disabled={completeMutation.isPending} onClick={() => completeMutation.mutate()}>{completeMutation.isPending ? "Updating…" : "Mark completed"}</Button>}
            {item.status === "Confirmed" && item.is_teleconsult && !session.data?.data[0] && (
              <Button variant="secondary" onClick={() => { setMeetingLink(""); setManualMeetOpen(true); }}>Add Google Meet link</Button>
            )}
          </div>
        </section>
        <aside className="panel">
          <h2>Clinical actions</h2>
          <Link className="action-tile" to={`/doctor/consultations/new?appointment=${encodeURIComponent(item.name)}`}><FileHeart /><span><strong>Open consultation note</strong><small>Diagnosis, SOAP notes, summary</small></span><ArrowRight /></Link>
          <p className="text-secondary">Patient records in this workspace are limited to appointments assigned to you.</p>
        </aside>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Confirm appointment?"
        description={item.is_teleconsult ? "Enter the Google Meet link that the patient will use, then confirm the appointment." : "Confirm this in-person appointment."}
        confirmLabel="Confirm appointment"
        busy={confirmMutation.isPending}
        confirmDisabled={Boolean(item.is_teleconsult) && !isGoogleMeetLink(meetingLink.trim())}
        onCancel={() => { setConfirmOpen(false); setMeetingLink(""); }}
        onConfirm={() => confirmMutation.mutate()}
      >
        {item.is_teleconsult ? (
          <FormField label="Google Meet link" type="url" value={meetingLink} onChange={(event) => setMeetingLink(event.target.value)} placeholder="https://meet.google.com/abc-defg-hij" hint="Create the room in Google Meet, then paste its complete link here." required />
        ) : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={manualMeetOpen}
        title="Add Google Meet link"
        description="Paste the Google Meet link for this confirmed teleconsult appointment."
        confirmLabel="Save Meet link"
        busy={saveManualMeet.isPending}
        confirmDisabled={!isGoogleMeetLink(meetingLink.trim())}
        onCancel={() => { setManualMeetOpen(false); setMeetingLink(""); }}
        onConfirm={() => saveManualMeet.mutate()}
      >
        <FormField label="Google Meet link" type="url" value={meetingLink} onChange={(event) => setMeetingLink(event.target.value)} placeholder="https://meet.google.com/abc-defg-hij" required />
      </ConfirmDialog>
      <ConfirmDialog
        open={rejectOpen}
        title="Reject this appointment request?"
        description="The appointment will be cancelled and the patient will be asked to create a new appointment. A reason is required."
        confirmLabel="Reject and cancel"
        destructive
        busy={rejectMutation.isPending}
        confirmDisabled={!rejectReason.trim()}
        onCancel={() => setRejectOpen(false)}
        onConfirm={() => rejectMutation.mutate()}
      >
        <TextAreaField label="Reason for rejecting" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} required />
        {rejectMutation.isError && <ErrorState error={rejectMutation.error} />}
      </ConfirmDialog>
    </>
  );
}

type ScheduleData = {
  [day: string]: {
    [category: string]: string[];
  };
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const CATEGORIES = ["Morning", "Afternoon", "Evening", "Night"];
const TIME_OPTIONS = {
  Morning: ["06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30"],
  Afternoon: ["12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"],
  Evening: ["18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30"],
  Night: ["22:00", "22:30", "23:00", "23:30", "00:00", "00:30", "01:00", "01:30", "02:00", "02:30", "03:00", "03:30", "04:00", "04:30", "05:00", "05:30"]
};

function ScheduleEditor({ value, onChange }: { value: ScheduleData; onChange: (v: ScheduleData) => void }) {
  const [activeDay, setActiveDay] = useState(DAYS[0]);
  
  const toggleTime = (category: string, time: string) => {
    const dayData = value[activeDay] || {};
    const catData = dayData[category] || [];
    const newCatData = catData.includes(time) ? catData.filter(t => t !== time) : [...catData, time].sort();
    onChange({ ...value, [activeDay]: { ...dayData, [category]: newCatData } });
  };
  
  return (
    <div className="schedule-editor">
      <div className="schedule-days">
        {DAYS.map(day => {
          const isActive = Object.values(value[day] || {}).flat().length > 0;
          return (
            <button key={day} type="button" className={`day-pill ${activeDay === day ? "active" : ""} ${isActive ? "has-slots" : ""}`} onClick={() => setActiveDay(day)}>
              {day.slice(0, 3)}
              {isActive && <span className="indicator" />}
            </button>
          );
        })}
      </div>
      <div className="schedule-categories">
        {CATEGORIES.map(cat => (
          <div key={cat} className="schedule-category">
            <h4>{cat}</h4>
            <div className="time-grid">
              {TIME_OPTIONS[cat as keyof typeof TIME_OPTIONS].map(time => {
                const selected = (value[activeDay]?.[cat] || []).includes(time);
                return (
                  <button key={time} type="button" className={`time-pill ${selected ? "selected" : ""}`} onClick={() => toggleTime(cat, time)}>
                    {time}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DoctorAvailabilityPage() {
  const auth = useAuth();
  const toast = useToast();
  const [availability, setAvailability] = useState(auth.doctor?.availability || "");
  const [status, setStatus] = useState(auth.doctor?.status || "Inactive");
  const [teleconsult, setTeleconsult] = useState(Boolean(auth.doctor?.teleconsult_enabled));
  const [duration, setDuration] = useState(String(auth.doctor?.avg_consult_duration_mins || 30));
  
  const [scheduleData, setScheduleData] = useState<ScheduleData>(() => {
    try {
      return JSON.parse(auth.doctor?.schedule_json || "{}");
    } catch {
      return {};
    }
  });

  const mutation = useMutation({
    mutationFn: async () => {
      await doctorsApi.saveSchedule({
        schedule_json: JSON.stringify(scheduleData),
        availability,
        status,
        teleconsult_enabled: teleconsult ? 1 : 0,
        avg_consult_duration_mins: Number(duration)
      });
    },
    onSuccess: () => { toast.notify("Availability updated."); void auth.restore(); }
  });
  return (
    <>
      <PageHeader eyebrow="Your schedule" title="Availability" description="Control whether patients can discover and request time with you." />
      <div className="availability-layout">
        <section className="panel">
          <div className="availability-status"><div><span className={status === "Active" ? "online" : ""} /><div><small>Booking status</small><strong>{status}</strong></div></div><label className="toggle-field"><input type="checkbox" checked={status === "Active"} onChange={(event) => setStatus(event.target.checked ? "Active" : "Inactive")} /><span /></label></div>
          <form className="form-grid" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
            <div className="form-grid two-column"><FormField label="Consultation duration (minutes)" type="number" min={5} step={5} value={duration} onChange={(event) => setDuration(event.target.value)} /><label className="toggle-field" style={{marginTop: "2rem"}}><input type="checkbox" checked={teleconsult} onChange={(event) => setTeleconsult(event.target.checked)} /><span /> Enable teleconsultations</label></div>
            
            <div className="schedule-section" style={{ marginTop: "1rem" }}>
              <h3>Structured Schedule</h3>
              <p className="text-secondary" style={{ marginBottom: "1rem" }}>Select the exact times you are available for consultations.</p>
              <ScheduleEditor value={scheduleData} onChange={setScheduleData} />
            </div>

            <TextAreaField label="Availability note (Optional)" value={availability} onChange={(event) => setAvailability(event.target.value)} placeholder="Example: Out of office on public holidays" hint="This is a free text field shown to patients." />
            
            {mutation.isError && <ErrorState error={mutation.error} />}
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save availability"}</Button>
          </form>
        </section>
        <aside className="panel effective-calendar">
          <h2>Effective availability</h2>
          <div className="calendar-placeholder"><CalendarDays /><strong>{availability || "Schedule configured via slots"}</strong><p>Schedule exceptions are evaluated separately.</p></div>
        </aside>
      </div>
    </>
  );
}

export function ScheduleExceptionsPage({ admin = false }: { admin?: boolean }) {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ practitioner: admin ? "" : auth.doctor?.name || "", exception_type: "Block" as DoctorScheduleException["exception_type"], from_datetime: "", to_datetime: "", reason: "", active: 1 as 0 | 1 });
  const query = useQuery({
    queryKey: ["schedule-exceptions", admin ? "admin" : auth.doctor?.name],
    queryFn: () => doctorsApi.listScheduleExceptions({
      ...(admin ? {} : { filters: [["practitioner", "=", auth.doctor?.name || ""]] }),
      fields: ["*"],
      orderBy: "from_datetime asc",
      limitPageLength: 200
    })
  });
  const create = useMutation({
    mutationFn: () => doctorsApi.createScheduleException(form),
    onSuccess: () => { toast.notify("Schedule exception added."); setOpen(false); void queryClient.invalidateQueries({ queryKey: ["schedule-exceptions"] }); }
  });
  return (
    <>
      <PageHeader eyebrow="Calendar controls" title="Schedule exceptions" description="Block time, override your regular schedule, or add extra slots." actions={<Button onClick={() => setOpen((value) => !value)}><Plus /> Add exception</Button>} />
      {open && <section className="panel"><form className="form-grid" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
        {admin && <FormField label="Practitioner record name" value={form.practitioner} onChange={(event) => setForm((current) => ({ ...current, practitioner: event.target.value }))} required />}
        <SelectField label="Exception type" value={form.exception_type} onChange={(event) => setForm((current) => ({ ...current, exception_type: event.target.value as DoctorScheduleException["exception_type"] }))}><option>Block</option><option>Override</option><option>Add Slots</option></SelectField>
        <div className="form-grid two-column"><FormField label="From" type="datetime-local" value={form.from_datetime} onChange={(event) => setForm((current) => ({ ...current, from_datetime: event.target.value }))} required /><FormField label="To" type="datetime-local" value={form.to_datetime} onChange={(event) => setForm((current) => ({ ...current, to_datetime: event.target.value }))} required /></div>
        <TextAreaField label="Reason" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
        {create.isError && <ErrorState error={create.error} />}
        <div className="dialog-actions"><Button variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending}>{create.isPending ? "Adding…" : "Add exception"}</Button></div>
      </form></section>}
      {query.isLoading ? <LoadingSkeleton rows={5} /> :
        query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> :
        query.data!.data.length ? <div className="exception-list">{query.data!.data.map((item) => <article className="exception-card" key={item.name}><span className={`exception-type type-${item.exception_type.toLowerCase().replace(" ", "-")}`}>{item.exception_type}</span><div><strong>{item.from_datetime}</strong><p>to {item.to_datetime}</p><small>{item.reason || "No reason provided"}</small></div><StatusBadge status={item.active ? "Active" : "Inactive"} /></article>)}</div> :
        <EmptyState title="No schedule exceptions" description="Blocked time, overrides, and extra slots will appear here." />}
    </>
  );
}

export function DoctorConsultationsPage() {
  const auth = useAuth();
  const query = useQuery({
    queryKey: ["consultations", "doctor", auth.doctor?.name],
    queryFn: () => consultationsApi.list({ filters: [["doctor", "=", auth.doctor?.name || ""]], fields: ["*"], orderBy: "creation desc", limitPageLength: 200 }),
    enabled: Boolean(auth.doctor?.name)
  });
  const columns: Column<Consultation>[] = [
    { key: "appointment", header: "Appointment", render: (row) => <strong>{row.appointment}</strong> },
    { key: "complaint", header: "Chief complaint", render: (row) => row.chief_complaint || "Not recorded" },
    { key: "diagnosis", header: "Diagnosis", render: (row) => row.diagnosis || "In progress" },
    { key: "followup", header: "Follow-up", render: (row) => row.follow_up_date || "—" },
    { key: "action", header: "", render: (row) => <Link className="text-link" to={`/doctor/consultations/${row.name}`}>Open note <ArrowRight /></Link> }
  ];
  return (
    <>
      <PageHeader eyebrow="Clinical documentation" title="Consultations" description="Create and review notes linked to your appointments." />
      {query.isLoading ? <LoadingSkeleton rows={6} /> :
        query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> :
        query.data!.data.length ? <DataTable rows={query.data!.data} columns={columns} caption="Doctor consultations" /> :
        <EmptyState title="No consultation notes" description="Open a confirmed appointment to start documenting care." icon={<FileHeart />} />}
    </>
  );
}

export function ConsultationWorkspacePage() {
  const auth = useAuth();
  const { consultationId } = useParams();
  const params = new URLSearchParams(window.location.search);
  const appointmentId = params.get("appointment") || "";
  const isNew = consultationId === "new";
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["consultation", consultationId], queryFn: () => consultationsApi.get(consultationId || ""), enabled: Boolean(consultationId && !isNew) });
  const [form, setForm] = useState<Partial<Consultation>>({ appointment: appointmentId, doctor: auth.doctor?.name || "" });
  const current = isNew ? form : query.data ? { ...query.data, ...form } : form;
  const save = useMutation({
    mutationFn: () => isNew ? consultationsApi.create(current) : consultationsApi.update(consultationId || "", current),
    onSuccess: (saved) => { toast.notify("Consultation saved."); void queryClient.invalidateQueries({ queryKey: ["consultations", "doctor"] }); if (isNew) window.history.replaceState({}, "", `/doctor/consultations/${saved.name}`); }
  });
  const prescriptions = useQuery({ queryKey: ["prescriptions", consultationId], queryFn: () => prescriptionsApi.list({ filters: [["consultation", "=", consultationId || ""]], fields: ["*"], limitPageLength: 100 }), enabled: Boolean(consultationId && !isNew) });
  const addPrescription = useMutation({
    mutationFn: (value: Omit<Prescription, "name">) => prescriptionsApi.create({ ...value, consultation: consultationId || "" }),
    onSuccess: () => { toast.notify("Prescription added."); void queryClient.invalidateQueries({ queryKey: ["prescriptions", consultationId] }); }
  });
  if (!isNew && query.isLoading) return <LoadingSkeleton rows={8} />;
  if (!isNew && query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return (
    <>
      <Breadcrumbs items={[{ label: "Consultations", to: "/doctor/consultations" }, { label: isNew ? "New consultation" : consultationId || "" }]} />
      <PageHeader eyebrow="Clinical note" title={isNew ? "New consultation" : "Consultation workspace"} description="Record clinical details and a separate patient-friendly summary." />
      {!current.appointment && <div className="notice warning"><p><strong>Appointment required:</strong> Open this workspace from an appointment so the Consultation is correctly linked.</p></div>}
      <ConsultationEditor value={current} onChange={setForm} onSave={() => save.mutate()} busy={save.isPending} />
      {save.isError && <ErrorState error={save.error} />}
      {!isNew && <section className="panel prescription-section"><div className="panel-header"><div><p className="eyebrow">Medication</p><h2>Prescriptions</h2></div></div>
        <PrescriptionForm onSubmit={(value) => addPrescription.mutate(value)} busy={addPrescription.isPending} />
        {prescriptions.data?.data.length ? <div className="prescription-list">{prescriptions.data.data.map((item) => <article key={item.name}><span className="shortcut-icon gold"><Pill /></span><div><strong>{item.medicine_name}</strong><p>{item.dosage}</p><small>{item.instructions}</small></div></article>)}</div> : null}
      </section>}
    </>
  );
}

export function DoctorPrescriptionsPage() {
  const query = useQuery({ queryKey: ["prescriptions", "doctor"], queryFn: () => prescriptionsApi.list({ fields: ["*"], orderBy: "creation desc", limitPageLength: 200 }) });
  const columns: Column<Prescription>[] = [
    { key: "medicine", header: "Medicine", render: (row) => <strong>{row.medicine_name}</strong> },
    { key: "dosage", header: "Dosage", render: (row) => row.dosage },
    { key: "consultation", header: "Consultation", render: (row) => row.consultation },
    { key: "instructions", header: "Instructions", render: (row) => row.instructions || "—" }
  ];
  return (
    <>
      <PageHeader eyebrow="Medication records" title="Prescriptions" description="Review medicines created through your consultations." />
      {query.isLoading ? <LoadingSkeleton rows={6} /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : query.data!.data.length ? <DataTable rows={query.data!.data} columns={columns} caption="Prescriptions" /> : <EmptyState title="No prescriptions" description="Created prescriptions will appear here." />}
    </>
  );
}

export function DoctorProfilePage() {
  const auth = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(() => ({ ...auth.doctor }));
  const mutation = useMutation({
    mutationFn: () => doctorsApi.update(auth.doctor?.name || "", form),
    onSuccess: () => { toast.notify("Professional profile updated."); void auth.restore(); }
  });
  if (!auth.doctor) return <ErrorState error={new Error("No Doctor profile is linked.")} />;
  return (
    <>
      <PageHeader eyebrow="Professional identity" title="Doctor profile" description="Information patients see when discovering care." />
      <div className="profile-layout">
        <aside className="panel profile-aside"><div className="avatar avatar-profile avatar-doctor">{auth.doctor.full_name.charAt(0)}</div><h2>{auth.doctor.full_name}</h2><p>{auth.doctor.specialty}</p><StatusBadge status={auth.doctor.approval_status} /><UtilityLinks portal="doctor" /></aside>
        <section className="panel"><form className="form-grid" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
          <FormField label="Full name" value={form.full_name || ""} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} />
          <div className="form-grid two-column"><FormField label="Professional email" type="email" value={form.email || ""} disabled /><FormField label="Mobile number" type="tel" value={form.mobile_number || ""} onChange={(event) => setForm((current) => ({ ...current, mobile_number: event.target.value }))} /></div>
          <FormField label="Specialty" value={form.specialty || ""} onChange={(event) => setForm((current) => ({ ...current, specialty: event.target.value }))} />
          <TextAreaField label="Specialization tags" value={form.specialization_tags || ""} onChange={(event) => setForm((current) => ({ ...current, specialization_tags: event.target.value }))} />
          <div className="form-grid two-column"><FormField label="Consultation fee" type="number" value={form.consultation_fee || ""} onChange={(event) => setForm((current) => ({ ...current, consultation_fee: Number(event.target.value) }))} /><FormField label="Average duration" type="number" value={form.avg_consult_duration_mins || ""} onChange={(event) => setForm((current) => ({ ...current, avg_consult_duration_mins: Number(event.target.value) }))} /></div>
          <label className="toggle-field profile-toggle-row"><input type="checkbox" checked={form.teleconsult_enabled === 1} onChange={(event) => setForm((current) => ({ ...current, teleconsult_enabled: event.target.checked ? 1 : 0 }))} /><span /> Enable teleconsultations</label>
          {mutation.isError && <ErrorState error={mutation.error} />}
          <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save profile"}</Button>
        </form></section>
      </div>
    </>
  );
}

export function DoctorSettingsPage() {
  const auth = useAuth();
  return (
    <>
      <PageHeader eyebrow="Workspace preferences" title="Settings" description="Review account access and clinical configuration." />
      <div className="settings-list">
        <section className="panel"><h2>Account access</h2><div className="setting-row"><span><strong>Approval status</strong><small>Controlled by an administrator.</small></span><StatusBadge status={auth.doctor?.approval_status} /></div><div className="setting-row"><span><strong>Authentication</strong><small>Secure Frappe session cookie.</small></span><CheckCircle2 /></div></section>
  <section className="panel"><h2>Clinical safeguards</h2><div className="setting-row"><span><strong>Record access</strong><small>Limited server-side to your assigned appointments and clinical records.</small></span><CheckCircle2 /></div></section>
      </div>
    </>
  );
}
