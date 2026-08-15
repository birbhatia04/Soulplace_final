import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Heart,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { authApi } from "../api/auth";
import { normalizeApiError } from "../api/client";
import { DEMO_ACCOUNTS, DEMO_MODE } from "../api/demo";
import {
  Brand,
  Button,
  FileUpload,
  FormField,
  IntegrationNotice,
  PasswordField,
  SelectField,
  TextAreaField,
  useToast
} from "../components/ui";
import type { PortalRole } from "../types/domain";

function AuthFrame({
  portal,
  eyebrow,
  title,
  description,
  children
}: {
  portal: PortalRole;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const highlights = {
    patient: [
      "Private, compassionate support",
      "Appointments and care plans in one place",
      "A gentle space for your wellbeing"
    ],
    doctor: [
      "A focused clinical workspace",
      "Secure appointment and consultation records",
      "Built around your daily schedule"
    ],
    admin: [
      "Operational visibility across care",
      "Protected approval workflows",
      "Auditable decisions and activity"
    ]
  }[portal];
  return (
    <main id="main-content" className={`auth-page auth-${portal}`}>
      <section className="auth-story">
        <Brand />
        <div className="auth-story-copy">
          <span className="auth-kicker">
            <Sparkles /> Mental health, thoughtfully supported
          </span>
          <h1>A calmer place to care, connect, and feel understood.</h1>
          <p>
            SoulPlace brings people and care teams together through private,
            human-centered mental-health support.
          </p>
          <ul>
            {highlights.map((highlight) => (
              <li key={highlight}>
                <CheckCircle2 aria-hidden="true" /> {highlight}
              </li>
            ))}
          </ul>
        </div>
        <p className="auth-privacy">
          <ShieldCheck /> Protected by role-based access and secure Frappe
          sessions.
        </p>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-icon" aria-hidden="true">
            {portal === "patient" ? (
              <Heart />
            ) : portal === "doctor" ? (
              <Stethoscope />
            ) : (
              <LockKeyhole />
            )}
          </div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p className="auth-description">{description}</p>
          {children}
        </div>
      </section>
    </main>
  );
}

export function PortalLogin({ portal }: { portal: PortalRole }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const labels = {
    patient: {
      eyebrow: "Patient sign in",
      title: "Welcome back",
      description: "Continue to your personal care space.",
      userLabel: "Email address",
      placeholder: "patient@example.com"
    },
    doctor: {
      eyebrow: "Doctor portal",
      title: "Welcome, doctor",
      description: "Sign in to review requests and manage care.",
      userLabel: "Professional email",
      placeholder: "doctor@clinic.com"
    },
    admin: {
      eyebrow: "Administration",
      title: "Operations sign in",
      description: "Restricted to authorized administrative roles.",
      userLabel: "Work email",
      placeholder: "admin@soulplace.com"
    }
  }[portal];
  const demoAccount = DEMO_ACCOUNTS.find(
    (account) =>
      account.portal === portal &&
      (portal !== "doctor" || account.username === "doctor@soulplace.demo")
  );
  const pendingDoctorAccount =
    portal === "doctor"
      ? DEMO_ACCOUNTS.find(
          (account) => account.username === "pending.doctor@soulplace.demo"
        )
      : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const session = await auth.login({ username, password, portal });
      if (
        portal === "doctor" &&
        session.doctor?.approval_status !== "Approved"
      ) {
        navigate("/doctor/pending", { replace: true });
      } else {
        navigate(`/${portal}/dashboard`, { replace: true });
      }
    } catch (unknownError) {
      setError(normalizeApiError(unknownError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame portal={portal} {...labels}>
      {DEMO_MODE && demoAccount && (
        <IntegrationNotice title="Frontend demo mode">
          No Frappe requests are made. Use{" "}
          <strong>{demoAccount.username}</strong> with password{" "}
          <strong>{demoAccount.password}</strong>
          {pendingDoctorAccount && (
            <>
              . To test approval blocking, use{" "}
              <strong>{pendingDoctorAccount.username}</strong> with the same
              password
            </>
          )}
          .
        </IntegrationNotice>
      )}
      <form className="auth-form" onSubmit={submit} noValidate>
        <FormField
          label={labels.userLabel}
          type="email"
          autoComplete="username"
          placeholder={labels.placeholder}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <div className="form-between">
          <label className="check-field">
            <input type="checkbox" /> <span>Keep me signed in</span>
          </label>
          <Link to={`/${portal}/forgot-password`}>Forgot password?</Link>
        </div>
        {error && (
          <p className="form-alert" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || !username || !password}>
          {busy ? "Signing in…" : "Sign in securely"} <ArrowRight />
        </Button>
      </form>
      {portal !== "admin" && (
        <p className="auth-switch">
          New to SoulPlace?{" "}
          <Link to={`/${portal}/register`}>
            {portal === "doctor" ? "Apply as a doctor" : "Create an account"}
          </Link>
        </p>
      )}
      <nav className="portal-switcher" aria-label="Switch portal">
        {portal !== "patient" && <Link to="/patient/login">Patient</Link>}
        {portal !== "doctor" && <Link to="/doctor/login">Doctor</Link>}
        {portal !== "admin" && <Link to="/admin/login">Admin</Link>}
      </nav>
    </AuthFrame>
  );
}

interface PatientRegistrationState {
  name1: string;
  phoneno: string;
  email: string;
  password: string;
  age: string;
  gender: string;
  livingstatus: string;
  therapyexp: string;
  preferred_language: "English" | "Hindi" | "Marathi";
  emergency_contact_name: string;
  emergency_contact_phone: string;
  consent: boolean;
}

export function PatientRegisterPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<PatientRegistrationState>({
    name1: "",
    phoneno: "",
    email: "",
    password: "",
    age: "",
    gender: "",
    livingstatus: "",
    therapyexp: "",
    preferred_language: "English",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    consent: false
  });
  const set = <K extends keyof PatientRegistrationState>(
    key: K,
    value: PatientRegistrationState[K]
  ) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (step < 2) {
      setStep(2);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await authApi.registerPatient({
        phoneno: form.phoneno,
        email: form.email,
        password: form.password,
        name1: form.name1,
        age: Number(form.age),
        gender: form.gender,
        livingstatus: form.livingstatus,
        therapyexp: form.therapyexp,
        preferred_language: form.preferred_language,
        emergency_contact_name: form.emergency_contact_name,
        emergency_contact_phone: form.emergency_contact_phone,
        consent_accepted: form.consent,
        consent_version: import.meta.env.VITE_CONSENT_VERSION || "1.0"
      });
      if (!result.patient?.name) {
        throw new Error("Patient profile was not returned by the backend.");
      }
      const session = await auth.restore();
      if (session.portal !== "patient") {
        throw new Error(
          "Account created, but the backend did not assign or link the Patient App User role. An administrator must correct the account before sign-in."
        );
      }
      toast.notify("Your SoulPlace account has been created.");
      navigate("/patient/dashboard", { replace: true });
    } catch (unknownError) {
      setError(normalizeApiError(unknownError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      portal="patient"
      eyebrow={`Create account · Step ${step} of 2`}
      title={step === 1 ? "Let’s start with you" : "Your care preferences"}
      description="We only ask for details configured in your SoulPlace patient profile."
    >
      <div className="progress-track" aria-label={`Step ${step} of 2`}>
        <span style={{ transform: `scaleX(${step / 2})` }} />
      </div>
      <form className="auth-form" onSubmit={submit}>
        {step === 1 ? (
          <>
            <FormField
              label="Name"
              autoComplete="name"
              value={form.name1}
              onChange={(event) => set("name1", event.target.value)}
              required
            />
            <FormField
              label="Phone number (optional)"
              type="tel"
              autoComplete="tel"
              value={form.phoneno}
              onChange={(event) => set("phoneno", event.target.value)}
            />
            <FormField
              label="Email address"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => set("email", event.target.value)}
              hint="We’ll send appointment updates here."
              required
            />
            <PasswordField
              label="Password"
              autoComplete="new-password"
              minLength={8}
              value={form.password}
              onChange={(event) => set("password", event.target.value)}
              hint="Use at least 8 characters."
              required
            />
            <div className="form-grid two-column">
              <FormField
                label="Age"
                type="number"
                min={13}
                max={120}
                value={form.age}
                onChange={(event) => set("age", event.target.value)}
                required
              />
              <SelectField
                label="Gender"
                value={form.gender}
                onChange={(event) => set("gender", event.target.value)}
                required
              >
                <option value="">Select</option>
                <option>Male</option>
                <option>Female</option>
              </SelectField>
            </div>
          </>
        ) : (
          <>
            <SelectField
              label="Living status"
              value={form.livingstatus}
              onChange={(event) => set("livingstatus", event.target.value)}
              required
            >
              <option value="">Select</option>
              <option>With family</option>
              <option>Independently</option>
            </SelectField>
            <SelectField
              label="Therapy experience"
              value={form.therapyexp}
              onChange={(event) => set("therapyexp", event.target.value)}
              required
            >
              <option value="">Select</option>
              <option>New to therapy</option>
              <option>Some previous experience</option>
              <option>Currently in therapy</option>
            </SelectField>
            <SelectField
              label="Preferred language"
              value={form.preferred_language}
              onChange={(event) =>
                set(
                  "preferred_language",
                  event.target.value as PatientRegistrationState["preferred_language"]
                )
              }
            >
              <option>English</option>
              <option>Hindi</option>
              <option>Marathi</option>
            </SelectField>
            <div className="form-grid two-column">
              <FormField
                label="Emergency contact name"
                value={form.emergency_contact_name}
                onChange={(event) =>
                  set("emergency_contact_name", event.target.value)
                }
              />
              <FormField
                label="Emergency contact phone"
                type="tel"
                value={form.emergency_contact_phone}
                onChange={(event) =>
                  set("emergency_contact_phone", event.target.value)
                }
              />
            </div>
            <label className="consent-check">
              <input
                type="checkbox"
                checked={form.consent}
                onChange={(event) => set("consent", event.target.checked)}
                required
              />
              <span>
                <strong>I accept privacy and treatment consent.</strong>
                I understand how SoulPlace processes my care information and that
                I can review or revoke consent later.
              </span>
            </label>
          </>
        )}
        {error && (
          <p className="form-alert" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          {step === 2 && (
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
          )}
          <Button
            type="submit"
            disabled={
              busy ||
              !form.name1 ||
              !form.email ||
              !form.password ||
              !form.age ||
              !form.gender ||
              (step === 2 && (!form.livingstatus || !form.therapyexp || !form.consent))
            }
          >
            {step === 1 ? "Continue" : busy ? "Creating account…" : "Create account"}
          </Button>
        </div>
      </form>
      <p className="auth-switch">
        Already registered? <Link to="/patient/login">Sign in</Link>
      </p>
    </AuthFrame>
  );
}

export function DoctorRegisterPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [verification, setVerification] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    mobile_number: "",
    password: "",
    specialty: "",
    medical_registration: "",
    consultation_fee: "",
    avg_consult_duration_mins: "30",
    specialization_tags: "",
    teleconsult_enabled: true,
    professional_consent: false
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!verification) {
      setError("Attach a PDF, PNG, or JPEG verification document.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await authApi.registerDoctor({
        ...form,
        consultation_fee: Number(form.consultation_fee),
        avg_consult_duration_mins: Number(form.avg_consult_duration_mins),
        consent_version: import.meta.env.VITE_CONSENT_VERSION || "1.0",
        verification
      });
      await auth.restore();
      toast.notify("Application submitted for review.");
      navigate("/doctor/pending", { replace: true });
    } catch (unknownError) {
      setError(normalizeApiError(unknownError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      portal="doctor"
      eyebrow="Doctor application"
      title="Join the SoulPlace care network"
      description="Applications are reviewed before clinical access is enabled."
    >
      <form className="auth-form" onSubmit={submit}>
        <FormField label="Full name" autoComplete="name" value={form.full_name} onChange={(event) => set("full_name", event.target.value)} required />
        <FormField label="Professional email" type="email" autoComplete="email" value={form.email} onChange={(event) => set("email", event.target.value)} required />
        <div className="form-grid two-column">
          <FormField label="Mobile number" type="tel" autoComplete="tel" value={form.mobile_number} onChange={(event) => set("mobile_number", event.target.value)} required />
          <PasswordField label="Password" autoComplete="new-password" minLength={8} value={form.password} onChange={(event) => set("password", event.target.value)} required />
        </div>
        <FormField label="Specialty" value={form.specialty} onChange={(event) => set("specialty", event.target.value)} required />
        <FormField label="Medical registration number" value={form.medical_registration} onChange={(event) => set("medical_registration", event.target.value)} required />
        <div className="form-grid two-column">
          <FormField label="Consultation fee" type="number" min={0} value={form.consultation_fee} onChange={(event) => set("consultation_fee", event.target.value)} required />
          <FormField
            label="Average duration (minutes)"
            type="number"
            min={5}
            max={240}
            step={5}
            value={form.avg_consult_duration_mins}
            onChange={(event) => set("avg_consult_duration_mins", event.target.value)}
            required
          />
        </div>
        <TextAreaField
          label="Specialization tags"
          hint="Comma-separated, for example: anxiety, trauma, adolescent care."
          value={form.specialization_tags}
          onChange={(event) => set("specialization_tags", event.target.value)}
        />
        <FileUpload
          label="Verification document"
          accept=".pdf,image/png,image/jpeg"
          onFile={(file) => {
            if (file.size > 5 * 1024 * 1024) {
              setError("Verification documents must be 5 MB or smaller.");
              setVerification(undefined);
              return;
            }
            setError("");
            setVerification(file);
          }}
          value={verification?.name}
        />
        <label className="check-field">
          <input type="checkbox" checked={form.teleconsult_enabled} onChange={(event) => set("teleconsult_enabled", event.target.checked)} /> <span>Available for teleconsultation</span>
        </label>
        <label className="consent-check">
          <input type="checkbox" checked={form.professional_consent} onChange={(event) => set("professional_consent", event.target.checked)} required />
          <span>
            <strong>Professional terms and consent</strong>I confirm the
            information supplied is accurate and agree to clinical standards.
          </span>
        </label>
  {error && <p className="form-alert" role="alert">{error}</p>}
  <Button type="submit" disabled={busy || !verification || !form.professional_consent}>
          {busy ? "Submitting application…" : "Submit application"}
        </Button>
      </form>
      <p className="auth-switch">
        Already applied? <Link to="/doctor/login">Sign in</Link>
      </p>
    </AuthFrame>
  );
}

export function DoctorPendingPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [reapplyFile, setReapplyFile] = useState<File | null>(null);
  const status = auth.doctor?.approval_status ?? "Pending";
  const toast = useToast();
  if (auth.status === "anonymous") return <Navigate to="/doctor/login" replace />;
  if (status === "Approved") return <Navigate to="/doctor/dashboard" replace />;

  const refresh = async () => {
    setBusy(true);
    const session = await auth.restore();
    setBusy(false);
    if (session.doctor?.approval_status === "Approved") {
      navigate("/doctor/dashboard", { replace: true });
    }
  };

  const handleReapply = async () => {
    if (!reapplyFile) return;
    setBusy(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          await authApi.reapplyDoctor({
            verificationFileBase64: base64,
            verificationFileName: reapplyFile.name
          });
          toast.notify("Re-application submitted successfully.");
          setReapplyFile(null);
          await auth.restore();
        } catch (e) {
          toast.notify(`Failed to submit re-application: ${normalizeApiError(e).message}`, "error");
        } finally {
          setBusy(false);
        }
      };
      reader.onerror = () => {
        toast.notify("Failed to read the file", "error");
        setBusy(false);
      };
      reader.readAsDataURL(reapplyFile);
    } catch (e) {
      toast.notify(`Failed to process file: ${normalizeApiError(e).message}`, "error");
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      portal="doctor"
      eyebrow="Application status"
      title={status === "Rejected" ? "Application not approved" : "Application under review"}
      description={
        status === "Rejected"
          ? "Your current application status is Rejected."
          : "Your clinical workspace remains protected while our team verifies your application."
      }
    >
      <div className={`approval-state approval-${status.toLowerCase()}`}>
        {status === "Rejected" ? <LockKeyhole /> : <Clock3 />}
        <div>
          <StatusLine
            complete
            title="Application submitted"
            detail="Your Doctor record is on file."
          />
          <StatusLine
            complete={status === "Rejected"}
            active={status === "Pending"}
            title="Credential review"
            detail={
              status === "Rejected"
                ? "Review completed"
                : "Verification is in progress"
            }
          />
          <StatusLine
            active={status === "Rejected"}
            title={status === "Rejected" ? "Rejected" : "Access approval"}
            detail={
              status === "Rejected"
                ? auth.doctor?.rejection_reason || "Contact the care network team for next steps."
                : "Dashboard access unlocks after approval."
            }
          />
        </div>
      </div>
      {status === "Rejected" && (
        <section className="doctor-reapplication" aria-labelledby="doctor-reapplication-title">
          <div className="doctor-reapplication-heading">
            <p className="eyebrow">Verification required</p>
            <h3 id="doctor-reapplication-title">Upload a replacement document</h3>
            <p>
              Add a clear PDF, JPG or PNG. Your application will return to the review queue
              after submission.
            </p>
          </div>
          <FileUpload
            label="Verification proof"
            value={reapplyFile?.name}
            onFile={setReapplyFile}
            accept=".pdf,image/png,image/jpeg"
          />
          <div className="doctor-reapplication-actions">
            <Button
              disabled={!reapplyFile || busy}
              onClick={() => void handleReapply()}
            >
              {busy ? "Submitting…" : "Submit for review"}
            </Button>
          </div>
        </section>
      )}
      <div className="doctor-review-actions">
        <Button onClick={() => void refresh()} disabled={busy} icon={<RefreshCw />}>
          {busy ? "Refreshing…" : "Refresh approval status"}
        </Button>
        <Button variant="ghost" onClick={() => void auth.logout()}>
          Sign out
        </Button>
      </div>
    </AuthFrame>
  );
}

function StatusLine({
  complete,
  active,
  title,
  detail
}: {
  complete?: boolean;
  active?: boolean;
  title: string;
  detail: string;
}) {
  return (
    <div className={`status-line ${complete ? "complete" : ""} ${active ? "active" : ""}`}>
      <span>{complete ? <CheckCircle2 /> : active ? <Clock3 /> : null}</span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

export function OtpLoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!sent) {
        await authApi.requestPatientOtp(phone);
        setSent(true);
      } else {
        await authApi.verifyPatientOtp({ phoneno: phone, otp: code });
        await auth.restore();
        navigate("/patient/dashboard", { replace: true });
      }
    } catch (unknownError) {
      setError(normalizeApiError(unknownError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame
      portal="patient"
      eyebrow="One-time code"
      title="Sign in with your phone"
      description={sent ? "Enter the six-digit code sent to your phone." : "We’ll send a code that expires in five minutes."}
    >
      <form className="auth-form" onSubmit={submit}>
        <FormField label="Phone number" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={sent} required />
        {sent && <FormField label="Verification code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required />}
        {error && <p className="form-alert" role="alert">{error}</p>}
        <Button type="submit" disabled={busy || !phone || (sent && code.length !== 6)}>{busy ? "Please wait…" : sent ? "Verify and sign in" : "Send one-time code"}</Button>
        {sent && <Button type="button" variant="ghost" onClick={() => { setSent(false); setCode(""); }}>Use another number</Button>}
      </form>
      <p className="auth-switch"><Link to="/patient/login">Use password sign in</Link></p>
    </AuthFrame>
  );
}

export function ForgotPasswordPage({ portal }: { portal: PortalRole }) {
  const [identity, setIdentity] = useState("");
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (portal === "patient") {
        await authApi.requestPatientPasswordReset(identity);
      } else {
        await authApi.requestEmailPasswordReset(identity);
      }
      setComplete(true);
    } catch (unknownError) {
      setError(normalizeApiError(unknownError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame
      portal={portal}
      eyebrow="Account recovery"
      title="Reset your password"
      description="We’ll email reset instructions if the account exists."
    >
      {complete ? (
        <div className="auth-form" role="status">
          <p>If that email is registered, reset instructions are on the way.</p>
          <Link className="button button-primary" to={`/${portal}/login`}>Return to sign in</Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <FormField label="Account email" type="email" autoComplete="email" value={identity} onChange={(event) => setIdentity(event.target.value)} required />
          {error && <p className="form-alert" role="alert">{error}</p>}
          <Button type="submit" disabled={busy || !identity}>{busy ? "Please wait…" : "Send reset email"}</Button>
        </form>
      )}
    </AuthFrame>
  );
}

export function PatientResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const resetKey = searchParams.get("key") || "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [complete, setComplete] = useState(false);
  const [linkValidation, setLinkValidation] = useState<{
    key: string;
    status: "checking" | "valid" | "invalid" | "error";
  }>({
    key: resetKey,
    status: resetKey ? "checking" : "invalid"
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const linkStatus = !resetKey
    ? "invalid"
    : linkValidation.key === resetKey
      ? linkValidation.status
      : "checking";

  useEffect(() => {
    if (!resetKey) return;

    let active = true;
    authApi.validatePatientPasswordResetKey(resetKey)
      .then(({ valid }) => {
        if (active) {
          setLinkValidation({
            key: resetKey,
            status: valid ? "valid" : "invalid"
          });
        }
      })
      .catch(() => {
        if (active) setLinkValidation({ key: resetKey, status: "error" });
      });

    return () => {
      active = false;
    };
  }, [resetKey]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await authApi.completePasswordReset(resetKey, password);
      setComplete(true);
    } catch (unknownError) {
      const normalizedError = normalizeApiError(unknownError);
      if (
        normalizedError.status === 410 ||
        normalizedError.message.trim().toUpperCase() === "GONE"
      ) {
        setLinkValidation({ key: resetKey, status: "invalid" });
      } else {
        setError(normalizedError.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      portal="patient"
      eyebrow="Account recovery"
      title="Choose a new password"
      description="Create a new password for your SoulPlace patient account."
    >
      {linkStatus === "checking" ? (
        <div className="auth-form" role="status">
          <p>Checking your password-reset link…</p>
        </div>
      ) : linkStatus === "invalid" ? (
        <div className="auth-form" role="alert">
          <p>
            This password-reset link is invalid or has expired. Please request
            a new link to continue.
          </p>
          <Link className="button button-primary" to="/patient/forgot-password">
            Request another link
          </Link>
        </div>
      ) : linkStatus === "error" ? (
        <div className="auth-form" role="alert">
          <p>We couldn’t verify this password-reset link. Please try again.</p>
          <Button type="button" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      ) : complete ? (
        <div className="auth-form" role="status">
          <p>Your password has been updated successfully.</p>
          <Link className="button button-primary" to="/patient/login">
            Continue to sign in
          </Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <PasswordField
            label="New password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            hint="Use at least 8 characters."
            required
          />
          <PasswordField
            label="Confirm new password"
            autoComplete="new-password"
            minLength={8}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />
          {error && <p className="form-alert" role="alert">{error}</p>}
          <Button
            type="submit"
            disabled={busy || password.length < 8 || confirmation.length < 8}
          >
            {busy ? "Updating password…" : "Update password"}
          </Button>
        </form>
      )}
    </AuthFrame>
  );
}
