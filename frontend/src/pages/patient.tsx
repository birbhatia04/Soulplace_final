import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookHeart,
  BookOpen,
  Brain,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  HeartHandshake,
  LifeBuoy,
  MessageCircleHeart,
  PhoneCall,
  Pill,
  PlayCircle,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Video,
  WalletCards
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { isPastAppointment, isUpcomingAppointment, wasRejectedByDoctor } from "../appointmentStatus";
import { appointmentsApi } from "../api/appointments";
import { consentsApi } from "../api/consents";
import { consultationsApi } from "../api/consultations";
import { doctorsApi } from "../api/doctors";
import { patientsApi } from "../api/patients";
import { prescriptionsApi } from "../api/prescriptions";
import { teleconsultApi } from "../api/teleconsult";
import { GoogleMeetCard } from "../components/GoogleMeetCard";
import { createRecord, listRecords, deleteRecord } from "../api/client";
import {
  AppointmentCard,
  AppointmentTimeline,
  Breadcrumbs,
  Button,
  Calendar,
  ConsentBanner,
  ConfirmDialog,
  DoctorCard,
  EmptyState,
  ErrorState,
  FormField,
  LoadingSkeleton,
  PageHeader,
  SearchFilterBar,
  SelectField,
  StatusBadge,
  TextAreaField,
  useToast
} from "../components/ui";
import { UtilityLinks } from "../components/Shells";
import type {
  Appointment,
} from "../types/domain";

function usePatientAppointments() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["appointments", "patient", auth.patient?.name],
    queryFn: () =>
      appointmentsApi.list({
        filters: [["patient", "=", auth.patient?.name || ""]],
        orderBy: "appointment_date asc, appointment_time asc",
        limitPageLength: 100
      }),
    enabled: Boolean(auth.patient?.name)
  });
}

export function PatientDashboardPage() {
  const auth = useAuth();
  const appointments = usePatientAppointments();
  const consultations = useQuery({
    queryKey: ["consultations", "patient-dashboard", auth.patient?.name],
    queryFn: () =>
      consultationsApi.list({
        orderBy: "creation desc",
        limitPageLength: 3
      }),
    enabled: Boolean(auth.patient?.name)
  });
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const upcoming = appointments.data?.data.find((appointment) =>
    isUpcomingAppointment(appointment, today)
  );
  const firstName = auth.patient?.name1?.split(" ")[0] || "there";
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <section className="patient-hero">
        <div>
          <p className="eyebrow">{greeting}, {firstName}</p>
          <h1>How are you feeling today?</h1>
          <p>Your care space is ready whenever you are.</p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/patient/mood-check">
              <MessageCircleHeart /> Check in with yourself
            </Link>
            <Link className="button button-secondary" to="/patient/doctors">
              Find a doctor <ArrowRight />
            </Link>
          </div>
        </div>
        <div className="hero-orb" aria-hidden="true">
          <span />
          <HeartHandshake />
        </div>
      </section>

      <div className="shortcut-grid">
        <Link className="shortcut-card" to="/patient/mood-check">
          <span className="shortcut-icon sage"><Brain /></span>
          <strong>Mood check</strong>
          <small>A gentle 2-minute reflection</small>
        </Link>
        <Link className="shortcut-card" to="/patient/doctors">
          <span className="shortcut-icon gold"><Stethoscope /></span>
          <strong>Find a doctor</strong>
          <small>Explore approved professionals</small>
        </Link>
        <Link className="shortcut-card" to="/patient/resources">
          <span className="shortcut-icon blue"><BookOpen /></span>
          <strong>Wellness library</strong>
          <small>Guides for everyday support</small>
        </Link>
        <Link className="shortcut-card crisis" to="/patient/safety">
          <span className="shortcut-icon rose"><LifeBuoy /></span>
          <strong>Emergency support</strong>
          <small>Immediate safety resources</small>
        </Link>
      </div>

      <div className="dashboard-grid patient-dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Next in your care</p>
              <h2>Upcoming appointment</h2>
            </div>
            <Link to="/patient/appointments">View all</Link>
          </div>
          {appointments.isLoading ? (
            <LoadingSkeleton rows={2} />
          ) : appointments.isError ? (
            <ErrorState error={appointments.error} onRetry={() => void appointments.refetch()} />
          ) : upcoming ? (
            <AppointmentCard
              appointment={upcoming}
              doctorName={upcoming.doctor_name}
              actions={
                <>
                  <Link className="text-link" to={`/patient/appointments/${upcoming.name}`}>
                    View details <ArrowRight />
                  </Link>
                  {upcoming.is_teleconsult ? (
                    <Link className="button button-secondary" to={`/patient/appointments/${upcoming.name}`}>
                      <Video /> Join when ready
                    </Link>
                  ) : null}
                </>
              }
            />
          ) : (
            <EmptyState
              title="Nothing scheduled yet"
              description="When you’re ready, find a doctor who feels right for you."
              action={<Link className="button button-primary" to="/patient/doctors">Find a doctor</Link>}
              icon={<CalendarDays />}
            />
          )}
        </section>

        <aside className="panel care-note">
          <span className="shortcut-icon gold"><Sparkles /></span>
          <p className="eyebrow">A note for today</p>
          <blockquote>
            “You don’t have to have everything figured out to take one kind step
            toward yourself.”
          </blockquote>
          <Link to="/patient/resources">Explore a 5-minute reset <ArrowRight /></Link>
        </aside>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Your care journey</p>
            <h2>Recent consultation summary</h2>
          </div>
        </div>
        {consultations.isLoading ? (
          <LoadingSkeleton rows={2} compact />
        ) : consultations.isError ? (
          <ErrorState error={consultations.error} onRetry={() => void consultations.refetch()} />
        ) : consultations.data?.data.length ? (
          <div className="summary-list">
            {consultations.data.data.map((consultation) => (
              <Link key={consultation.name} to={`/patient/consultations/${consultation.name}`}>
                <span className="shortcut-icon sage"><BookHeart /></span>
                <span>
                  <strong>{consultation.patient_friendly_summary || "Consultation summary"}</strong>
                  <small>{consultation.follow_up_date ? `Follow-up ${consultation.follow_up_date}` : "Open summary"}</small>
                </span>
                <ArrowRight />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No consultation summaries"
            description="Patient-friendly notes will appear here after a completed consultation."
          />
        )}
      </section>
    </>
  );
}

export function DoctorDiscoveryPage() {
  const [search, setSearch] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [teleconsult, setTeleconsult] = useState(false);
  const [maxFee, setMaxFee] = useState("");
  const doctors = useQuery({
    queryKey: ["doctors", "discovery"],
    queryFn: () =>
      doctorsApi.list({
        filters: [
          ["approval_status", "=", "Approved"]
        ],
        orderBy: "full_name asc",
        limitPageLength: 200
      })
  });
  const specialties = useMemo(
    () =>
      Array.from(new Set(doctors.data?.data.map((doctor) => doctor.specialty).filter(Boolean))).sort(),
    [doctors.data]
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (doctors.data?.data || []).filter((doctor) => {
      const matchesSearch =
        !query ||
        doctor.full_name.toLowerCase().includes(query) ||
        doctor.specialty.toLowerCase().includes(query) ||
        doctor.specialization_tags?.toLowerCase().includes(query);
      return (
        matchesSearch &&
        (!specialty || doctor.specialty === specialty) &&
        (!teleconsult || Boolean(doctor.teleconsult_enabled)) &&
        (!maxFee || Number(doctor.consultation_fee) <= Number(maxFee))
      );
    });
  }, [doctors.data, search, specialty, teleconsult, maxFee]);

  return (
    <>
      <PageHeader
        eyebrow="Find the right support"
        title="Doctors who listen"
        description="Explore approved SoulPlace professionals by specialty, fee, and consultation format."
      />
      <SearchFilterBar value={search} onChange={setSearch} placeholder="Search by name, specialty, or focus area">
        <SelectField label="Specialty" value={specialty} onChange={(event) => setSpecialty(event.target.value)}>
          <option value="">All specialties</option>
          {specialties.map((item) => <option key={item}>{item}</option>)}
        </SelectField>
        <FormField label="Maximum fee" type="number" min={0} value={maxFee} onChange={(event) => setMaxFee(event.target.value)} placeholder="₹ Any" />
        <label className="toggle-field">
          <input type="checkbox" checked={teleconsult} onChange={(event) => setTeleconsult(event.target.checked)} />
          <span />
          Video available
        </label>
      </SearchFilterBar>
      {doctors.isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : doctors.isError ? (
        <ErrorState error={doctors.error} onRetry={() => void doctors.refetch()} />
      ) : filtered.length ? (
        <div className="doctor-grid">
          {filtered.map((doctor) => <DoctorCard doctor={doctor} key={doctor.name} />)}
        </div>
      ) : (
        <EmptyState
          title="No doctors match those filters"
          description="Try a broader specialty, fee range, or search term."
          action={<Button variant="secondary" onClick={() => { setSearch(""); setSpecialty(""); setMaxFee(""); setTeleconsult(false); }}>Clear filters</Button>}
          icon={<Search />}
        />
      )}
    </>
  );
}

export function DoctorDetailPage() {
  const { doctorId } = useParams();
  const doctor = useQuery({
    queryKey: ["doctor", doctorId],
    queryFn: () => doctorsApi.get(doctorId || ""),
    enabled: Boolean(doctorId)
  });
  if (doctor.isLoading) return <LoadingSkeleton rows={7} />;
  if (doctor.isError) return <ErrorState error={doctor.error} onRetry={() => void doctor.refetch()} />;
  if (!doctor.data) return <EmptyState title="Doctor not found" description="This doctor profile may no longer be available." />;
  const item = doctor.data;
  const tags = item.specialization_tags?.split(",").map((tag) => tag.trim()).filter(Boolean) || [];
  return (
    <>
      <Breadcrumbs items={[{ label: "Doctors", to: "/patient/doctors" }, { label: item.full_name }]} />
      <section className="doctor-profile-hero">
        <div className="avatar avatar-profile">{item.full_name.charAt(0)}</div>
        <div>
          <div className="profile-title">
            <div>
              <p className="eyebrow">{item.specialty}</p>
              <h1>{item.full_name}</h1>
            </div>
            <StatusBadge status={item.status} />
          </div>
          <div className="tag-list">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          <p className="profile-intro">A verified SoulPlace professional offering thoughtful, confidential support.</p>
        </div>
        <div className="booking-summary-card">
          <p>Consultation fee</p>
          <strong>₹{Number(item.consultation_fee || 0).toLocaleString()}</strong>
          <ul>
            <li><Clock3 /> {item.avg_consult_duration_mins || 30} minutes</li>
            <li><Video /> {item.teleconsult_enabled ? "Teleconsult available" : "In-person consultation"}</li>
            <li><CalendarCheck /> {item.availability || "Availability not configured"}</li>
          </ul>
          <Link className="button button-primary" to={`/patient/book?doctor=${encodeURIComponent(item.name)}`}>
            Book consultation
          </Link>
        </div>
      </section>
      <div className="detail-grid">
        <section className="panel">
          <h2>About this practice</h2>
          <p>Specialty: {item.specialty}</p>
          <p>Professional availability is read directly from the Doctor record.</p>
        </section>
        <section className="panel">
          <h2>Available slots</h2>
          <p className="text-secondary" style={{ marginBottom: "1rem" }}>
            The doctor's actual availability will be calculated during the booking process based on their schedule and existing appointments.
          </p>
          <Link className="button button-secondary" to={`/patient/book?doctor=${encodeURIComponent(item.name)}`}>
            Check times and book <ArrowRight />
          </Link>
        </section>
      </div>
    </>
  );
}

interface BookingForm {
  doctor: string;
  date: string;
  time: string;
  type: "teleconsult" | "in-person";
  symptoms: string;
  privacyConsent: boolean;
  telemedicineConsent: boolean;
}

export function AvailableSlots({
  doctor,
  date,
  value,
  onChange,
  heading = "Available times",
  emptyDescription = "This doctor has no available time slots on this date."
}: {
  doctor: string;
  date: string;
  value: string;
  onChange: (value: string) => void;
  heading?: string;
  emptyDescription?: string;
}) {
  const query = useQuery({
    queryKey: ["doctor-slots", doctor, date],
    queryFn: () => doctorsApi.getSlots(doctor, date),
    enabled: Boolean(doctor && date)
  });

  if (query.isLoading) return <div className="slots-container"><LoadingSkeleton rows={2} /></div>;
  if (query.isError) return <div className="slots-container"><ErrorState error={query.error} onRetry={() => void query.refetch()} /></div>;

  const slots = query.data || [];

  return (
    <div className="slots-container">
      <h3 style={{ margin: "1rem 0 0.5rem" }}>{heading}</h3>
      {slots.length ? (
        <div className="time-grid">
          {slots.map((time: string) => (
            <button
              key={time}
              type="button"
              className={`time-pill ${value === time ? "selected" : ""}`}
              aria-pressed={value === time}
              onClick={() => onChange(time)}
            >
              {time.substring(0, 5)}
            </button>
          ))}
        </div>
      ) : (
        <EmptyState title="No slots available" description={emptyDescription} />
      )}
    </div>
  );
}

const BOOKING_STEPS = [
  { label: "Pick a time", short: "Time" },
  { label: "Your details", short: "Details" },
  { label: "Review & confirm", short: "Review" },
];

function BookingStepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="booking-step-indicator" aria-label={`Step ${current} of ${total}`}>
      {BOOKING_STEPS.map((s, i) => {
        const num = i + 1;
        const done = num < current;
        const active = num === current;
        return (
          <div key={num} className={`bsi-step ${done ? "bsi-done" : active ? "bsi-active" : "bsi-upcoming"}`}>
            <span className="bsi-bubble">
              {done ? <CheckCircle2 /> : <span>{num}</span>}
            </span>
            <span className="bsi-label">{s.label}</span>
            {num < total && <span className="bsi-line" aria-hidden="true" />}
          </div>
        );
      })}
    </div>
  );
}

export function BookingPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<BookingForm>({
    doctor: params.get("doctor") || "",
    date: "",
    time: "",
    type: "teleconsult",
    symptoms: "",
    privacyConsent: false,
    telemedicineConsent: false
  });
  const doctors = useQuery({
    queryKey: ["doctors", "booking"],
    queryFn: () => doctorsApi.list({
      filters: [["approval_status", "=", "Approved"], ["status", "=", "Active"]],
      fields: ["*"],
      limitPageLength: 200
    })
  });

  const effectiveDoctor = form.doctor;
  const selectedDoctor = doctors.data?.data.find((doctor) => doctor.name === effectiveDoctor);
  const create = useMutation({
    mutationFn: async () => {
      if (!auth.patient?.name) throw new Error("No patient profile is linked.");
      return appointmentsApi.book({
        doctor: effectiveDoctor,
        appointment_date: form.date,
        appointment_time: form.time,
        symptoms: form.symptoms,
        booking_source: "Web",
        is_teleconsult: form.type === "teleconsult" ? 1 : 0
      }, {
        privacy: form.privacyConsent,
        telemedicine: form.telemedicineConsent,
        version: import.meta.env.VITE_CONSENT_VERSION || "1.0"
      });
    },
    onSuccess: (appointment) => {
      void queryClient.invalidateQueries({ queryKey: ["appointments", "patient"] });
      toast.notify("Appointment request sent.");
      navigate("/patient/booking-confirmed", {
        replace: true,
        state: { appointment }
      });
    }
  });
  const set = <K extends keyof BookingForm>(key: K, value: BookingForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const minDate = new Date().toISOString().slice(0, 10);
  const canContinue =
    step === 1
      ? Boolean(effectiveDoctor && form.date && form.time)
      : step === 2
        ? Boolean(form.symptoms.trim() && form.privacyConsent && (form.type !== "teleconsult" || form.telemedicineConsent))
        : true;

  const stepTitles = ["Choose a time", "Tell us what you need", "Review your request"];

  return (
    <>
      <Breadcrumbs items={[{ label: "Doctors", to: "/patient/doctors" }, { label: "Book consultation" }]} />
      <div className="booking-page-header">
        <div>
          <p className="eyebrow">Book consultation</p>
          <h1>{stepTitles[step - 1]}</h1>
          <p className="booking-subtitle">Your request is sent to the doctor for confirmation.</p>
        </div>
      </div>
      <div className="booking-layout">
        <section className="panel booking-form-panel">
          <BookingStepIndicator current={step} total={3} />
          {step === 1 && (
            <>
              {doctors.isLoading ? (
                <LoadingSkeleton rows={2} />
              ) : doctors.isError ? (
                <ErrorState error={doctors.error} onRetry={() => void doctors.refetch()} />
              ) : selectedDoctor ? (
                <>
                  <div className="booking-doctor-summary" aria-label={`Selected doctor: ${selectedDoctor.full_name}`}>
                    <div className="avatar avatar-doctor" aria-hidden="true">{selectedDoctor.full_name.charAt(0)}</div>
                    <span>
                      <small>Selected doctor</small>
                      <strong>{selectedDoctor.full_name}</strong>
                      <span>{selectedDoctor.specialty}</span>
                    </span>
                  </div>
                  <Calendar value={form.date} onChange={(value) => set("date", value)} min={minDate} />
                  {form.date && (
                    <AvailableSlots doctor={effectiveDoctor} date={form.date} value={form.time} onChange={(val) => set("time", val)} />
                  )}
                </>
              ) : (
                <EmptyState
                  title="Choose a doctor first"
                  description="Select a doctor from the directory before choosing an appointment time."
                  action={<Link className="button button-primary" to="/patient/doctors">Choose a doctor</Link>}
                />
              )}
            </>
          )}
          {step === 2 && (
            <>
              <fieldset className="choice-cards">
                <legend>Consultation type</legend>
                <label className={form.type === "teleconsult" ? "selected" : ""}>
                  <input type="radio" name="type" value="teleconsult" checked={form.type === "teleconsult"} onChange={() => set("type", "teleconsult")} disabled={!selectedDoctor?.teleconsult_enabled} />
                  <Video /><span><strong>Video consultation</strong><small>{selectedDoctor?.teleconsult_enabled ? "Join securely online" : "Not offered by this doctor"}</small></span>
                </label>
                <label className={form.type === "in-person" ? "selected" : ""}>
                  <input type="radio" name="type" value="in-person" checked={form.type === "in-person"} onChange={() => set("type", "in-person")} />
                  <Stethoscope /><span><strong>In-person</strong><small>Visit the care location</small></span>
                </label>
              </fieldset>
              <TextAreaField label="Symptoms or reason for consultation" value={form.symptoms} onChange={(event) => set("symptoms", event.target.value)} placeholder="Share what you’d like support with. This goes to your doctor." required />
              <label className="consent-check">
                <input type="checkbox" checked={form.privacyConsent} onChange={(event) => set("privacyConsent", event.target.checked)} />
                <span><strong>Privacy consent</strong>I agree to the processing of this appointment information.</span>
              </label>
              {form.type === "teleconsult" && (
                <label className="consent-check">
                  <input type="checkbox" checked={form.telemedicineConsent} onChange={(event) => set("telemedicineConsent", event.target.checked)} />
                  <span><strong>Telemedicine consent</strong>I understand the benefits and limitations of remote care.</span>
                </label>
              )}
            </>
          )}
          {step === 3 && (
            <div className="booking-review">
              <div className="avatar avatar-doctor">{selectedDoctor?.full_name?.charAt(0) || "D"}</div>
              <h2>{selectedDoctor?.full_name}</h2>
              <p>{selectedDoctor?.specialty}</p>
              <dl>
                <div><dt>Date</dt><dd>{form.date}</dd></div>
                <div><dt>Time</dt><dd>{form.time}</dd></div>
                <div><dt>Format</dt><dd>{form.type === "teleconsult" ? "Video consultation" : "In-person"}</dd></div>
                <div><dt>Fee</dt><dd>₹{Number(selectedDoctor?.consultation_fee || 0).toLocaleString()}</dd></div>
                <div><dt>Status</dt><dd><StatusBadge status="Pending" /></dd></div>
              </dl>
              <p className="review-symptoms"><strong>Your note</strong>{form.symptoms}</p>
            </div>
          )}
          {create.isError && <ErrorState error={create.error} title="Appointment could not be created" />}
          <div className="sticky-actions">
            {step > 1 && <Button variant="ghost" onClick={() => setStep((value) => value - 1)}>Back</Button>}
            {step < 3 ? (
              <Button disabled={!canContinue} onClick={() => setStep((value) => value + 1)}>Continue <ArrowRight /></Button>
            ) : (
              <Button disabled={create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? "Sending request…" : "Confirm appointment request"}
              </Button>
            )}
          </div>
        </section>
        <aside className="panel trust-panel">
          <ShieldCheck />
          <h2>Your privacy matters</h2>
          <p>Appointment details are sent directly to your configured Frappe site using its authenticated session.</p>
          <ul>
            <li><CheckCircle2 /> No medical data in localStorage</li>
            <li><CheckCircle2 /> Role-protected portal</li>
            <li><CheckCircle2 /> Explicit consent record</li>
          </ul>
        </aside>
      </div>
    </>
  );
}

export function BookingConfirmedPage() {
  const location = useLocation();
  const appointment = (location.state as { appointment?: Appointment } | null)?.appointment;
  if (!appointment) return <Navigate to="/patient/appointments" replace />;
  return (
    <section className="confirmation-page">
      <span className="confirmation-icon"><CheckCircle2 /></span>
      <p className="eyebrow">Request received</p>
      <h1>Your appointment is on its way</h1>
      <p>The doctor will review your request. You’ll see the status update in your appointments.</p>
      <div className="confirmation-card">
        <StatusBadge status={appointment.status} />
        <dl>
          <div><dt>Date</dt><dd>{appointment.appointment_date}</dd></div>
          <div><dt>Time</dt><dd>{appointment.appointment_time}</dd></div>
          <div><dt>Reference</dt><dd>{appointment.name}</dd></div>
        </dl>
      </div>
      <div className="hero-actions">
        <Link className="button button-primary" to={`/patient/appointments/${appointment.name}`}>View appointment</Link>
        <Link className="button button-secondary" to="/patient/dashboard">Back to dashboard</Link>
      </div>
    </section>
  );
}

export function PatientAppointmentsPage() {
  const query = usePatientAppointments();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const now = new Date().toISOString().slice(0, 10);
  const rows = (query.data?.data || []).filter((appointment) =>
    tab === "upcoming"
      ? isUpcomingAppointment(appointment, now)
      : isPastAppointment(appointment, now)
  );
  return (
    <>
      <PageHeader
        eyebrow="Your care calendar"
        title="Appointments"
        description="Review upcoming requests, completed care, and cancellations."
        actions={<Link className="button button-primary" to="/patient/doctors">Book a consultation</Link>}
      />
      <div className="tab-list" role="tablist">
        <button id="upcoming-tab" className={tab === "upcoming" ? "active" : ""} onClick={() => setTab("upcoming")} onKeyDown={(event) => { if (event.key === "ArrowRight") setTab("past"); }} role="tab" aria-selected={tab === "upcoming"} aria-controls="appointments-panel" tabIndex={tab === "upcoming" ? 0 : -1}>Upcoming</button>
        <button id="past-tab" className={tab === "past" ? "active" : ""} onClick={() => setTab("past")} onKeyDown={(event) => { if (event.key === "ArrowLeft") setTab("upcoming"); }} role="tab" aria-selected={tab === "past"} aria-controls="appointments-panel" tabIndex={tab === "past" ? 0 : -1}>Past</button>
      </div>
      <div id="appointments-panel" role="tabpanel" aria-labelledby={`${tab}-tab`}>
      {query.isLoading ? <LoadingSkeleton rows={5} /> :
        query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> :
        rows.length ? (
          <div className="appointment-list">
            {rows.map((appointment) => (
              <AppointmentCard
                key={appointment.name}
                appointment={appointment}
                doctorName={appointment.doctor_name}
                actions={<Link className="text-link" to={`/patient/appointments/${appointment.name}`}>View details <ArrowRight /></Link>}
              />
            ))}
          </div>
        ) : (
          <EmptyState title={tab === "upcoming" ? "No upcoming appointments" : "No past appointments"} description={tab === "upcoming" ? "Find a doctor when you’re ready to take the next step." : "Completed and cancelled appointments will appear here."} action={tab === "upcoming" ? <Link className="button button-primary" to="/patient/doctors">Find a doctor</Link> : undefined} icon={<CalendarDays />} />
        )}
      </div>
    </>
  );
}

export function PatientAppointmentDetailPage() {
  const auth = useAuth();
  const { appointmentId } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const appointment = useQuery({
    queryKey: ["appointment", appointmentId],
    queryFn: () => appointmentsApi.get(appointmentId || ""),
    enabled: Boolean(appointmentId)
  });
  const timeline = useQuery({
    queryKey: ["appointment-timeline", appointmentId],
    queryFn: () => appointmentsApi.timeline(appointmentId || ""),
    enabled: Boolean(appointmentId)
  });
  const teleconsult = useQuery({
    queryKey: ["teleconsult", appointmentId],
    queryFn: () => teleconsultApi.list({ filters: [["appointment", "=", appointmentId || ""]], fields: ["*"], limitPageLength: 1 }),
    enabled: Boolean(appointmentId && appointment.data?.is_teleconsult)
  });
  const cancel = useMutation({
    mutationFn: () => appointmentsApi.cancel(appointmentId || "", reason),
    onSuccess: () => {
      toast.notify("Appointment cancelled.");
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["appointment", appointmentId] });
      void queryClient.invalidateQueries({ queryKey: ["appointments", "patient"] });
    }
  });
  const reschedule = useMutation({
    mutationFn: () => appointmentsApi.reschedule(appointmentId || "", newDate, newTime, reason),
    onSuccess: () => {
      toast.notify("Reschedule request sent to your doctor for approval.");
      setRescheduleOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["appointment", appointmentId] });
      void queryClient.invalidateQueries({ queryKey: ["appointment-timeline", appointmentId] });
      void queryClient.invalidateQueries({ queryKey: ["appointments", "patient"] });
    }
  });
  if (appointment.isLoading) return <LoadingSkeleton rows={6} />;
  if (appointment.isError) return <ErrorState error={appointment.error} onRetry={() => void appointment.refetch()} />;
  if (!appointment.data || appointment.data.patient !== auth.patient?.name) {
    return <ErrorState error={new Error("You do not have access to this appointment.")} />;
  }
  const item = appointment.data;
  const session = teleconsult.data?.data[0];
  const doctorRejected = wasRejectedByDoctor(item);
  return (
    <>
      <Breadcrumbs items={[{ label: "Appointments", to: "/patient/appointments" }, { label: item.name }]} />
      <PageHeader title="Appointment details" description={`Reference ${item.name}`} actions={<StatusBadge status={item.status} />} />
      {item.status === "Pending" ? (
        <div className="integration-notice" role="status">
          <Clock3 />
          <div>
            <strong>Awaiting doctor approval</strong>
            <p>Your requested appointment time has been sent to the doctor. We’ll update this appointment after they accept or reject it.</p>
          </div>
        </div>
      ) : null}
      {doctorRejected ? (
        <div className="integration-notice appointment-rejected-notice" role="alert">
          <CalendarCheck />
          <div>
            <strong>The doctor could not accept this appointment request</strong>
            <p>The previous appointment has been cancelled. Choose a new time by creating a new appointment.</p>
            <Link className="button button-primary" to={`/patient/book?doctor=${encodeURIComponent(item.doctor)}`}>Create new appointment</Link>
          </div>
        </div>
      ) : null}
      {item.is_teleconsult ? (
        <GoogleMeetCard
          audience="patient"
          appointmentStatus={item.status}
          session={session}
          loading={teleconsult.isLoading}
          error={teleconsult.error}
        />
      ) : null}
      <div className="detail-grid">
        <section className="panel detail-card">
          <dl className="detail-list">
            <div><dt>Doctor</dt><dd>{item.doctor_name || item.doctor}</dd></div>
            <div><dt>Date</dt><dd>{item.appointment_date}</dd></div>
            <div><dt>Time</dt><dd>{item.appointment_time}</dd></div>
            <div><dt>Consultation type</dt><dd>{item.is_teleconsult ? "Teleconsult" : "In-person"}</dd></div>
            <div><dt>Reason</dt><dd>{item.symptoms || "Not provided"}</dd></div>
            {item.cancel_reason && <div><dt>Cancellation reason</dt><dd>{item.cancel_reason}</dd></div>}
          </dl>
          <div className="card-actions">
            {["Pending", "Confirmed"].includes(item.status) && (
              <>
                <Button variant="secondary" onClick={() => setConfirmOpen(true)}>Cancel appointment</Button>
                <Button variant="ghost" onClick={() => { setNewDate(item.appointment_date); setNewTime(""); setReason(""); setRescheduleOpen(true); }}>Reschedule</Button>
              </>
            )}
          </div>
        </section>
        <section className="panel">
          <h2>Appointment timeline</h2>
          {timeline.isLoading ? <LoadingSkeleton rows={3} compact /> :
            timeline.isError ? <ErrorState error={timeline.error} onRetry={() => void timeline.refetch()} /> :
            timeline.data?.data.length ? <AppointmentTimeline events={timeline.data.data} /> :
            <EmptyState title="No audit events" description="Timeline events will appear when the backend records them." />}
        </section>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Cancel this appointment?"
        description="This updates the appointment status to Cancelled. Add a reason before continuing."
        confirmLabel="Cancel appointment"
        destructive
        busy={cancel.isPending}
        confirmDisabled={!reason.trim()}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => cancel.mutate()}
      >
        <div className="dialog-inline-field">
          <TextAreaField label="Cancellation reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={rescheduleOpen}
        title="Reschedule appointment"
        description="Choose a new available date and time. Your doctor must accept the new request before it is confirmed."
        confirmLabel="Send reschedule request"
        busy={reschedule.isPending}
        confirmDisabled={!newDate || !newTime}
        onCancel={() => setRescheduleOpen(false)}
        onConfirm={() => reschedule.mutate()}
      >
        <div className="dialog-inline-field">
          <FormField
            label="New date"
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            value={newDate}
            onChange={(event) => {
              setNewDate(event.target.value);
              setNewTime("");
            }}
            required
          />
          {newDate ? (
            <AvailableSlots
              doctor={item.doctor}
              date={newDate}
              value={newTime}
              onChange={setNewTime}
              heading="Doctor’s available times"
              emptyDescription="The doctor has no unbooked availability on this date. Choose another date."
            />
          ) : null}
          <p className="text-secondary">Only times configured by the doctor and not already booked are shown.</p>
        </div>
        <TextAreaField label="Reason (optional)" value={reason} onChange={(event) => setReason(event.target.value)} />
        {reschedule.isError && <ErrorState error={reschedule.error} />}
      </ConfirmDialog>
    </>
  );
}

export function PatientConsultationPage() {
  const { consultationId } = useParams();
  const consultation = useQuery({
    queryKey: ["consultation", consultationId],
    queryFn: () => consultationsApi.get(consultationId || ""),
    enabled: Boolean(consultationId)
  });
  const prescriptions = useQuery({
    queryKey: ["prescriptions", consultationId],
    queryFn: () => prescriptionsApi.list({ filters: [["consultation", "=", consultationId || ""]], fields: ["*"], limitPageLength: 100 }),
    enabled: Boolean(consultationId)
  });
  if (consultation.isLoading) return <LoadingSkeleton rows={7} />;
  if (consultation.isError) return <ErrorState error={consultation.error} onRetry={() => void consultation.refetch()} />;
  if (!consultation.data) return <EmptyState title="Consultation not found" description="This consultation summary is unavailable." />;
  return (
    <>
      <Breadcrumbs items={[{ label: "Appointments", to: "/patient/appointments" }, { label: "Consultation summary" }]} />
      <PageHeader eyebrow="Your care summary" title="Consultation notes" description="A patient-friendly view shared by your doctor." />
      <div className="detail-grid">
        <section className="panel patient-summary">
          <span className="shortcut-icon sage"><BookHeart /></span>
          <h2>Summary from your doctor</h2>
          <p>{consultation.data.patient_friendly_summary || "Your doctor has not added a patient-friendly summary yet."}</p>
          <dl className="detail-list">
            <div><dt>Follow-up date</dt><dd>{consultation.data.follow_up_date || "Not scheduled"}</dd></div>
          </dl>
        </section>
        <section className="panel">
          <h2>Prescriptions</h2>
          {prescriptions.isLoading ? <LoadingSkeleton rows={3} compact /> :
            prescriptions.isError ? <ErrorState error={prescriptions.error} onRetry={() => void prescriptions.refetch()} /> :
            prescriptions.data?.data.length ? (
              <div className="prescription-list">
                {prescriptions.data.data.map((item) => (
                  <article key={item.name}><PillIcon /><div><strong>{item.medicine_name}</strong><p>{item.dosage}</p><small>{item.instructions}</small></div></article>
                ))}
              </div>
            ) : <EmptyState title="No prescriptions" description="No medicines are linked to this consultation." />}
        </section>
      </div>
    </>
  );
}

function PillIcon() {
  return <span className="shortcut-icon gold"><Pill /></span>;
}

export function PatientPrescriptionsPage() {
  const prescriptions = useQuery({
    queryKey: ["prescriptions", "patient"],
    queryFn: () => prescriptionsApi.list({ fields: ["*"], orderBy: "creation desc", limitPageLength: 100 })
  });
  return (
    <>
      <PageHeader eyebrow="Medication" title="Prescriptions" description="Medicines recorded by your care team." />
      {prescriptions.isLoading ? <LoadingSkeleton rows={5} /> :
        prescriptions.isError ? <ErrorState error={prescriptions.error} onRetry={() => void prescriptions.refetch()} /> :
        prescriptions.data!.data.length ? <div className="prescription-list">{prescriptions.data!.data.map((item) => <article key={item.name}><PillIcon /><div><strong>{item.medicine_name}</strong><p>{item.dosage}</p><small>{item.instructions || "No additional instructions"}</small></div></article>)}</div> :
        <EmptyState title="No prescriptions" description="Prescriptions from your consultations will appear here." />}
    </>
  );
}

const moodQuestions = [
  "Over the last two weeks, how often have you felt little interest or pleasure in doing things?",
  "How often have you felt down, low, or without hope?",
  "How often have worry or anxious thoughts felt difficult to control?",
  "How often have you had trouble relaxing or sleeping well?",
  "How supported and connected have you felt to people you trust?"
];
const moodOptions = [
  { label: "Not at all", value: 0 },
  { label: "Several days", value: 1 },
  { label: "More than half the days", value: 2 },
  { label: "Nearly every day", value: 3 }
];

export function MoodCheckPage() {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const answer = (value: number) => {
    const next = [...answers];
    next[index] = value;
    setAnswers(next);
    if (index === moodQuestions.length - 1) {
      navigate("/patient/mood-check/results", { state: { score: next.reduce((sum, item) => sum + item, 0) } });
    } else setIndex(index + 1);
  };
  return (
    <section className="assessment-page">
      <Link className="back-link" to="/patient/dashboard"><ArrowLeft /> Leave check-in</Link>
      <div className="assessment-card">
        <div className="assessment-head">
          <span className="shortcut-icon sage"><Brain /></span>
          <p className="eyebrow">A private moment for you</p>
          <h1>Mood check-in</h1>
          <p>Choose the answer that feels closest. This is a wellness reflection, not a diagnosis.</p>
        </div>
        <div className="assessment-progress">
          <span>Question {index + 1} of {moodQuestions.length}</span>
          <div className="progress-track"><span style={{ transform: `scaleX(${(index + 1) / moodQuestions.length})` }} /></div>
        </div>
        <h2>{moodQuestions[index]}</h2>
        <div className="answer-list">
          {moodOptions.map((option) => (
            <button key={option.value} onClick={() => answer(option.value)}>
              <span>{option.label}</span><ArrowRight />
            </button>
          ))}
        </div>
        {index > 0 && <Button variant="ghost" onClick={() => setIndex(index - 1)}><ArrowLeft /> Previous question</Button>}
      </div>
    </section>
  );
}

export function MoodResultsPage() {
  const location = useLocation();
  const score = (location.state as { score?: number } | null)?.score;
  if (score === undefined) return <Navigate to="/patient/mood-check" replace />;
  const level = score <= 4 ? "Steady" : score <= 9 ? "Some strain" : "Extra support may help";
  const description = score <= 4 ? "Your responses suggest things feel fairly manageable right now." : score <= 9 ? "Your responses suggest some difficult moments. Small acts of care and connection may help." : "Your responses suggest you may be carrying a lot. Consider reaching out to a trusted person or professional.";
  return (
    <section className="results-page">
      <span className="results-orb"><Sparkles /></span>
      <p className="eyebrow">Your check-in</p>
      <h1>{level}</h1>
      <p>{description}</p>
      <div className="result-meter" aria-label={`Wellness reflection score ${score} out of 15`}>
        <span style={{ transform: `scaleX(${Math.max(0.12, score / 15)})` }} />
      </div>
      <small>Reflection score {score}/15 · not a clinical diagnosis</small>
      <div className="recommendation-grid">
        <article><span className="shortcut-icon sage"><BookOpen /></span><h2>Try a gentle reset</h2><p>Explore breathing, grounding, and sleep resources.</p><Link to="/patient/resources">Open library <ArrowRight /></Link></article>
        <article><span className="shortcut-icon gold"><Stethoscope /></span><h2>Talk with a professional</h2><p>Find an approved SoulPlace doctor.</p><Link to="/patient/doctors">Find support <ArrowRight /></Link></article>
        <article className="crisis-card"><span className="shortcut-icon rose"><LifeBuoy /></span><h2>Need urgent help?</h2><p>Open immediate safety guidance and local emergency options.</p><Link to="/patient/safety">Safety support <ArrowRight /></Link></article>
      </div>
      <Link className="button button-secondary" to="/patient/dashboard">Return to dashboard</Link>
    </section>
  );
}

type WellnessResource = {
  id: string;
  title: string;
  category: string;
  format: "Article" | "Practice";
  duration: string;
  summary: string;
  sections: Array<{ heading: string; paragraphs: string[]; steps?: string[] }>;
  source: { label: string; url: string };
};

const wellnessResources: WellnessResource[] = [
  {
    id: "grounding-54321",
    title: "The 5–4–3–2–1 grounding practice",
    category: "Anxiety",
    format: "Practice",
    duration: "6 min read",
    summary: "A step-by-step sensory practice for reconnecting with the present when thoughts or feelings become overwhelming.",
    sections: [
      { heading: "What grounding means", paragraphs: ["Grounding is a way of deliberately bringing attention back to what is happening around you right now. It does not require you to argue with a thought, force yourself to relax, or pretend that a difficult feeling has disappeared.", "The aim is smaller: notice that the feeling is present while also noticing the room, your body, and the choices available in this moment. Some people use grounding during stress, anxious thoughts, or a sense of being emotionally flooded."] },
      { heading: "Prepare without pressure", paragraphs: ["Choose a place where you feel reasonably safe. Sit, stand, or walk slowly—whichever feels more comfortable. Let your breathing remain natural. If closing your eyes feels unsafe or uncomfortable, keep them open.", "Remind yourself that this is a practice, not a test. You can pause, repeat a step, name fewer items, or stop at any time."] },
      { heading: "Move through your five senses", paragraphs: ["Take a little time with each item. Describe ordinary details such as colour, temperature, distance, shape, texture, or volume."], steps: ["Name five things you can see. Look for details you had not noticed before.", "Notice four things you can physically feel, such as your feet on the floor, fabric against your skin, or an object in your hand.", "Listen for three sounds. Include quiet or distant sounds if you can.", "Identify two scents. If none are noticeable, remember two familiar, neutral scents.", "Notice one taste, or take a slow sip of water and describe it."] },
      { heading: "Return to your next small action", paragraphs: ["When you finish, name where you are, the approximate time, and one manageable thing you will do next. That might be drinking water, opening a window, messaging someone, or returning to a task for five minutes.", "Grounding may not remove distress immediately. If the exercise makes you feel worse, stop and try another anchor such as listening to music, moving your body, or speaking to someone you trust. Seek urgent help if you feel unable to keep yourself or someone else safe."] }
    ],
    source: { label: "WHO — Doing What Matters in Times of Stress", url: "https://www.who.int/publications/i/item/9789240003927" }
  },
  {
    id: "gentle-sleep",
    title: "A gentler wind-down for sleep",
    category: "Sleep",
    format: "Article",
    duration: "8 min read",
    summary: "Build a realistic evening routine that supports rest without turning sleep into another task to perform perfectly.",
    sections: [
      { heading: "Why a wind-down helps", paragraphs: ["Sleep rarely begins the moment the day ends. A repeated wind-down routine can act as a transition between activity and rest. It gives your mind fewer new demands and helps your body recognise that the active part of the day is ending.", "The routine does not have to be long or elaborate. Consistency is usually more useful than trying a completely different solution every night."] },
      { heading: "Create a simple evening sequence", paragraphs: ["Choose two or three quiet actions that are realistic in your home. Begin at roughly the same time and keep the lights softer when possible."], steps: ["Set a reminder to begin winding down rather than only setting a morning alarm.", "Finish urgent tasks, then write down anything that can wait until tomorrow.", "Choose a low-stimulation activity such as reading, gentle stretching, a warm shower, or quiet audio.", "Keep phones and bright screens away from the bed when practical.", "Aim for reasonably consistent sleeping and waking times, including weekends."] },
      { heading: "Make the room work for you", paragraphs: ["Many people sleep more comfortably in a room that is quiet, dark, and not too warm, but personal needs differ. Try one change at a time so you can notice what actually helps.", "If noise is unavoidable, neutral background sound may be useful. Turn clocks away if checking the time increases pressure. Consider how caffeine, nicotine, alcohol, heavy late meals, and vigorous exercise close to bedtime affect your own sleep."] },
      { heading: "When you are awake in bed", paragraphs: ["Trying to force sleep can make the bed feel like a place of effort. If you are comfortable resting, allow yourself to rest. If you become frustrated and remain awake, get up when safe, sit somewhere comfortable, and do something quiet until you feel sleepier.", "One difficult night is not a failure. Speak with a qualified healthcare professional if sleep problems are persistent, significantly affect daily life, or occur alongside severe low mood, anxiety, breathing problems, or other concerning symptoms."] }
    ],
    source: { label: "NHS Every Mind Matters — Sleep guidance", url: "https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/how-to-fall-asleep-faster-and-sleep-better/" }
  },
  {
    id: "name-the-feeling",
    title: "Name what you’re feeling",
    category: "Emotions",
    format: "Article",
    duration: "7 min read",
    summary: "Use plain, non-judgmental language to understand an emotion and choose what you need next.",
    sections: [
      { heading: "Start with observation", paragraphs: ["Emotions can arrive as body sensations, thoughts, urges, or changes in energy before we have words for them. Begin by noticing rather than explaining. You may detect a tight jaw, heavy chest, restless hands, fast thoughts, tiredness, or an urge to avoid something.", "Try describing what is present as information: ‘My shoulders are tense’ or ‘My thoughts are moving quickly.’ This can be gentler than immediately deciding that the feeling is wrong or that it must go away."] },
      { heading: "Choose an approximate word", paragraphs: ["You do not need the perfect label. Start broad—sad, worried, angry, ashamed, lonely, relieved, numb, hopeful—and refine it only if that is useful. More than one emotion can be present at the same time.", "Add a phrase such as ‘I notice…’ or ‘A part of me feels…’. This creates a little distance between you and the experience: the emotion is something you are noticing, not your entire identity."] },
      { heading: "Use four gentle prompts", paragraphs: ["Write or say one sentence for each prompt. Leave a prompt blank if you are unsure."], steps: ["I notice that I feel…", "This may have been influenced by…", "I notice it most strongly in…", "What I may need in the next hour is…"] },
      { heading: "Respond instead of judging", paragraphs: ["A feeling can be understandable without controlling your next action. After naming it, choose one small response: drink water, eat something, rest, move, write down a concern, set a boundary, or contact someone supportive.", "If intense or distressing emotions continue, interfere with everyday life, or make you feel unsafe, consider speaking with a qualified mental-health professional. Use urgent or emergency support if you may harm yourself or someone else."] }
    ],
    source: { label: "WHO — Doing What Matters in Times of Stress", url: "https://www.who.int/publications/i/item/9789240003927" }
  },
  {
    id: "breathing-space",
    title: "A three-minute breathing space",
    category: "Stress",
    format: "Practice",
    duration: "5 min read",
    summary: "A brief, flexible pause that moves from noticing your experience to choosing your next action.",
    sections: [
      { heading: "Set up the pause", paragraphs: ["This practice can be done sitting, standing, or walking slowly. Choose a position that feels supported. Keep your eyes open if that feels safer. There is no need to create a special mood before beginning.", "Breathing exercises are not comfortable for everyone. You may use the sounds around you, the feeling of your feet, or an object in your hand as the centre of attention instead."] },
      { heading: "Minute one: notice what is here", paragraphs: ["Ask yourself: ‘What am I noticing right now?’ Include thoughts, emotions, and body sensations. Try to observe them without deciding whether you are doing well or badly.", "If the answer is unclear, notice one concrete fact: the position of your body, a sound in the room, or the temperature of the air."] },
      { heading: "Minute two: gather attention", paragraphs: ["Bring attention to one place where natural breathing is easy to feel—the nose, chest, or abdomen. Do not force a deep breath, hold your breath, or aim for a particular rhythm. When attention wanders, gently return.", "If breath awareness increases discomfort, switch immediately to another neutral anchor such as sounds or contact with the chair."] },
      { heading: "Minute three: widen and choose", paragraphs: ["Expand attention to include your whole body and the space around you. Notice that difficult thoughts or sensations can be present within a wider field of experience.", "Finish by choosing one deliberate next action. It can be very small: stand up, take a sip of water, reply to one message, ask for help, or pause a demanding task. Stop the exercise and seek appropriate support if you feel increasingly distressed or unsafe."] }
    ],
    source: { label: "WHO — Doing What Matters in Times of Stress", url: "https://www.who.int/publications/i/item/9789240003927" }
  },
  {
    id: "support-conversation",
    title: "Starting a support conversation",
    category: "Connection",
    format: "Article",
    duration: "8 min read",
    summary: "Plan what to say, ask for the kind of support you need, and decide what to do if the first conversation is difficult.",
    sections: [
      { heading: "Decide who might feel safe enough", paragraphs: ["Think of someone who usually listens respectfully and can keep appropriate confidence. This could be a friend, relative, colleague, teacher, community member, or healthcare professional. The closest person is not always the easiest person to speak with.", "Choose a setting that lowers pressure. Some people prefer walking, travelling in a car, cooking, texting first, or speaking by phone rather than sitting face-to-face."] },
      { heading: "Plan only the opening", paragraphs: ["You do not need to prepare your entire story. Write down two or three points: what has been difficult, how it is affecting you, and what kind of response would help. Choose a time when neither person has to rush.", "It is okay to start by saying that the conversation feels difficult. You can share a little, pause, and return to it later."] },
      { heading: "Useful ways to begin", paragraphs: ["Adapt these examples so they sound like you."], steps: ["I have been having a difficult time and I would like to tell you about it.", "I do not need you to solve this; listening would help.", "I am not sure how to explain everything, but I do not want to handle it alone.", "Could you check in with me tomorrow?", "Would you help me find or contact a professional?"] },
      { heading: "Be specific about support", paragraphs: ["People may respond with advice when you mainly want company. Say whether you would like listening, practical help, distraction, regular check-ins, or help arranging care. The other person may also need to be honest about what they can provide.", "One unhelpful response does not mean your needs are unimportant. Try another person or a qualified professional. If you are in immediate danger, cannot keep yourself safe, or may harm someone else, contact local emergency services or urgent crisis support now."] }
    ],
    source: { label: "NHS Every Mind Matters — Talking about mental health", url: "https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/how-to-talk-about-your-mental-health/" }
  },
  {
    id: "self-compassion",
    title: "A self-compassion break",
    category: "Self-care",
    format: "Practice",
    duration: "6 min read",
    summary: "Practise responding to a difficult moment with honesty, steadiness, and one realistic act of care.",
    sections: [
      { heading: "Compassion is not pretending", paragraphs: ["Self-compassion does not mean claiming that everything is fine, avoiding responsibility, or forcing positive thoughts. It means recognising that something is difficult and choosing not to add unnecessary cruelty to the experience.", "You can acknowledge a mistake, repair harm, or make a difficult change while speaking to yourself in a steady and respectful way."] },
      { heading: "Step one: acknowledge the moment", paragraphs: ["Use a simple sentence that matches the facts: ‘This is difficult,’ ‘I feel overwhelmed,’ or ‘I am disappointed in what happened.’ Try not to turn one event into a judgement about your entire worth.", "Notice how self-criticism appears—in words, images, tension, or an urge to withdraw. You do not have to debate every thought before moving to the next step."] },
      { heading: "Step two: choose a steadier voice", paragraphs: ["Imagine how you would speak to someone you care about who faced the same situation. Choose a phrase that feels believable rather than overly positive."], steps: ["Difficulty is part of being human.", "I can be honest without attacking myself.", "I can take responsibility one step at a time.", "May I respond with patience in this moment."] },
      { heading: "Step three: make care concrete", paragraphs: ["Ask what would support the next hour—not what would solve your entire life. The answer may be food, water, rest, movement, a boundary, completing one small task, contacting someone, or arranging professional support.", "Self-care is personal and may take trial and error. If distress is severe, lasts for weeks, interferes with ordinary tasks, or includes thoughts of harm, reach out to a qualified professional or urgent support rather than relying on self-help alone."] }
    ],
    source: { label: "NIMH — Caring for Your Mental Health", url: "https://www.nimh.nih.gov/health/topics/caring-for-your-mental-health" }
  }
];

export function ResourcesPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const categories = Array.from(new Set(wellnessResources.map((item) => item.category)));
  const rows = wellnessResources.filter((item) =>
    (!search || `${item.title} ${item.summary}`.toLowerCase().includes(search.toLowerCase())) &&
    (!category || item.category === category)
  );
  
  const savedResourcesQuery = useQuery({
    queryKey: ["saved-resources", auth.patient?.name],
    queryFn: () => listRecords<{name: string, resource_id: string}>("Saved Resource", { filters: [["patient", "=", auth.patient?.name || ""]], fields: ["name", "resource_id"], limitPageLength: 100 }),
    enabled: Boolean(auth.patient?.name)
  });
  
  const toggleSave = useMutation({
    mutationFn: async (resourceId: string) => {
      const savedList = savedResourcesQuery.data?.data || [];
      const existing = savedList.find(r => r.resource_id === resourceId);
      if (existing) {
        await deleteRecord("Saved Resource", existing.name);
      } else {
        await createRecord("Saved Resource", { patient: auth.patient?.name, resource_id: resourceId });
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["saved-resources"] }); }
  });

  return (
    <>
      <PageHeader eyebrow="Wellness library" title="Support for everyday moments" description="Short, accessible practices you can return to at your own pace." />
      <SearchFilterBar value={search} onChange={setSearch} placeholder="Search the library">
        <SelectField label="Category" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}
        </SelectField>
      </SearchFilterBar>
      {rows.length ? <div className="resource-grid">{rows.map((item) => {
        const isSaved = (savedResourcesQuery.data?.data || []).some(r => r.resource_id === item.id);
        return (
        <article className="resource-card" key={item.id}>
          <div className={`resource-art art-${item.category.toLowerCase()}`}><span>{item.format === "Practice" ? <PlayCircle /> : <BookOpen />}</span></div>
          <div><p className="eyebrow">{item.category} · {item.format} · {item.duration}</p><h2>{item.title}</h2><p>{item.summary}</p><div className="card-actions"><Link className="text-link" to={`/patient/resources/${item.id}`}>Read full article <ArrowRight /></Link><Button variant={isSaved ? "secondary" : "ghost"} disabled={toggleSave.isPending} onClick={() => toggleSave.mutate(item.id)}><Save /> {isSaved ? "Saved" : "Save"}</Button></div></div>
        </article>
      )})}</div> : <EmptyState title="No resources found" description="Try a different keyword or category." />}
    </>
  );
}

export function ResourceDetailPage() {
  const { id } = useParams();
  const resource = wellnessResources.find((item) => item.id === id);
  if (!resource) return <EmptyState title="Resource not found" description="This wellness resource is unavailable." action={<Link className="button button-secondary" to="/patient/resources">Back to library</Link>} />;
  return (
    <article className="resource-detail">
      <Breadcrumbs items={[{ label: "Resources", to: "/patient/resources" }, { label: resource.title }]} />
      <p className="eyebrow">{resource.category} · {resource.format} · {resource.duration}</p>
      <h1>{resource.title}</h1>
      <p className="resource-lede">{resource.summary}</p>
      <div className={`resource-hero-art art-${resource.category.toLowerCase()}`}><BookHeart /></div>
      <section className="article-body">
        {resource.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.steps && <ol>{section.steps.map((step) => <li key={step}>{step}</li>)}</ol>}
          </section>
        ))}
        <aside><strong>Wellness information, not medical advice</strong><p>This resource supports general wellbeing but does not diagnose or treat a condition and does not replace professional or emergency care.</p></aside>
        <p><strong>Source:</strong> <a href={resource.source.url} target="_blank" rel="noreferrer">{resource.source.label}</a></p>
      </section>
      <div className="card-actions"><Link className="button button-secondary" to="/patient/resources"><ArrowLeft /> Back to library</Link><Button disabled variant="ghost"><Save /> Save resource</Button></div>
    </article>
  );
}

export function SafetyPage() {
  return (
    <section className="safety-page">
      <div className="safety-hero">
        <span><HeartHandshake /></span>
        <p className="eyebrow">Immediate support</p>
        <h1>You deserve help right now.</h1>
        <p>If you may hurt yourself or someone else, or you are in immediate danger, contact your local emergency services now or go to the nearest emergency department.</p>
        <a className="button button-danger" href="tel:112"><PhoneCall /> Call emergency services (112 in India)</a>
      </div>
      <div className="safety-grid">
        <article><h2>Move toward safety</h2><ol><li>Step away from anything you could use to hurt yourself.</li><li>Go where another trusted person is present.</li><li>Say clearly: “I’m not feeling safe and I need you to stay with me.”</li></ol></article>
        <article><h2>Ground in this minute</h2><p>Place both feet on the floor. Name five things you see. Breathe out longer than you breathe in. Keep another person with you.</p></article>
        <article><h2>Your emergency contact</h2><p>{/* Exact profile values only. */}Use the trusted contact saved in your profile, or call someone who can be physically present.</p><Link to="/patient/profile">Review emergency contact <ArrowRight /></Link></article>
      </div>
      <aside className="safety-note"><ShieldCheck /><p>SoulPlace is not an emergency response service and this page is not monitored. In urgent danger, use local emergency services.</p></aside>
    </section>
  );
}

export function PatientProfilePage() {
  const auth = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => ({ ...auth.patient }));
  const save = useMutation({
    mutationFn: () => patientsApi.update(auth.patient?.name || "", form),
    onSuccess: () => {
      toast.notify("Profile updated.");
      void auth.restore();
      void queryClient.invalidateQueries({ queryKey: ["patient"] });
    }
  });
  if (!auth.patient) return <ErrorState error={new Error("No patient profile is linked to this account.")} />;
  return (
    <>
      <PageHeader eyebrow="Personal details" title="Your profile" description="Keep your contact and care preferences current." />
      <div className="profile-layout">
        <aside className="panel profile-aside"><div className="avatar avatar-profile">{auth.patient.name1.charAt(0)}</div><h2>{auth.patient.name1}</h2><p>{auth.patient.phoneno}</p><StatusBadge status={auth.patient.consent_status || "Pending"} /><UtilityLinks portal="patient" /></aside>
        <section className="panel">
          <form className="form-grid" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
            <FormField label="Name" value={form.name1 || ""} onChange={(event) => setForm((current) => ({ ...current, name1: event.target.value }))} required />
            <div className="form-grid two-column">
              <FormField label="Phone number" value={form.phoneno || ""} disabled hint="Phone changes require identity verification." />
              <FormField label="Age" type="number" min={13} max={120} value={form.age || ""} onChange={(event) => setForm((current) => ({ ...current, age: Number(event.target.value) }))} />
            </div>
            <SelectField label="Preferred language" value={form.preferred_language || ""} onChange={(event) => setForm((current) => ({ ...current, preferred_language: event.target.value as "English" | "Hindi" | "Marathi" }))}>
              <option value="">Select</option><option>English</option><option>Hindi</option><option>Marathi</option>
            </SelectField>
            <div className="form-grid two-column">
              <FormField label="Emergency contact name" value={form.emergency_contact_name || ""} onChange={(event) => setForm((current) => ({ ...current, emergency_contact_name: event.target.value }))} />
              <FormField label="Emergency contact phone" type="tel" value={form.emergency_contact_phone || ""} onChange={(event) => setForm((current) => ({ ...current, emergency_contact_phone: event.target.value }))} />
            </div>
            {save.isError && <ErrorState error={save.error} />}
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save profile"}</Button>
          </form>
        </section>
      </div>
    </>
  );
}

export function PatientSettingsPage() {
  const auth = useAuth();
  const consents = useQuery({
    queryKey: ["consents", auth.patient?.name],
    queryFn: () => consentsApi.list({ filters: [["patient", "=", auth.patient?.name || ""]], fields: ["*"], orderBy: "creation desc", limitPageLength: 100 }),
    enabled: Boolean(auth.patient?.name)
  });
  const currentConsents = useMemo(() => {
    const seen = new Set<string>();
    return (consents.data?.data || []).filter((item) => {
      if (seen.has(item.consent_type)) return false;
      seen.add(item.consent_type);
      return true;
    });
  }, [consents.data?.data]);
  const granted = currentConsents.some((item) => item.status === "Granted");
  return (
    <>
      <PageHeader eyebrow="Preferences" title="Settings" description="Manage consent, language, and account preferences." />
      <div className="settings-list">
        <section className="panel"><h2>Consent and privacy</h2>{consents.isLoading ? <LoadingSkeleton rows={2} compact /> : consents.isError ? <ErrorState error={consents.error} onRetry={() => void consents.refetch()} /> : <><ConsentBanner granted={granted} /><div className="summary-list">{currentConsents.map((item) => <div className="setting-row" key={item.name}><span><strong>{item.consent_type}</strong><small>Version {item.consent_version || "not recorded"}</small></span><StatusBadge status={item.status} /></div>)}</div></>}</section>
      </div>
    </>
  );
}

export function PaymentMethodsPage() {
  return (
    <>
      <PageHeader eyebrow="Billing" title="Payment methods" description="Manage how consultation fees are paid." />
      <EmptyState title="Payments are not configured" description="The audited backend has no payment DocType or payment-gateway endpoint. No card details are collected or stored." icon={<WalletCards />} />
    </>
  );
}

export function HelpPage() {
  return (
    <>
      <PageHeader eyebrow="Support" title="How can we help?" description="Find guidance for appointments, accounts, and care access." />
      <div className="help-grid">
        <article className="panel"><CalendarDays /><h2>Appointments</h2><p>View status, cancellation, rescheduling, and teleconsult access.</p><Link to="/patient/appointments">Open appointments <ArrowRight /></Link></article>
        <article className="panel"><ShieldCheck /><h2>Privacy and consent</h2><p>Review your current consent records and session security.</p><Link to="/patient/settings">Open privacy settings <ArrowRight /></Link></article>
        <article className="panel crisis-card"><LifeBuoy /><h2>Urgent support</h2><p>Open immediate safety guidance if you or someone else may be at risk.</p><Link to="/patient/safety">Open safety support <ArrowRight /></Link></article>
      </div>
    </>
  );
}
