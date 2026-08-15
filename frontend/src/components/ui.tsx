import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FormEvent,
  type InputHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  FileText,
  Search,
  Upload,
  Video,
  X
} from "lucide-react";
import type {
  Appointment,
  AppointmentAuditTimeline,
  Consultation,
  Doctor,
  PatientUser,
  Prescription
} from "../types/domain";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" to="/" aria-label="SoulPlace home">
      <span className="brand-mark" aria-hidden="true">
        S
      </span>
      {!compact && (
        <span>
          <strong>SoulPlace</strong>
          <small>Care, with calm</small>
        </span>
      )}
    </Link>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "gold";
  icon?: ReactNode;
};

export function Button({
  variant = "primary",
  icon,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`button button-${variant} ${className}`}
      {...props}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Breadcrumbs({
  items
}: {
  items: Array<{ label: string; to?: string }>;
}) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.to ? <Link to={item.to}>{item.label}</Link> : item.label}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function StatCard({
  label,
  value,
  icon,
  trend,
  tone = "sage"
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  trend?: string;
  tone?: "sage" | "gold" | "rose" | "blue";
}) {
  return (
    <article className={`stat-card stat-${tone}`}>
      <div className="stat-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {trend && <small>{trend}</small>}
      </div>
    </article>
  );
}

const statusClass = (status: string) =>
  status.toLowerCase().replaceAll(" ", "-");

export function StatusBadge({ status }: { status?: string }) {
  const value = status || "Unknown";
  return (
    <span className={`status-badge status-${statusClass(value)}`}>
      <span aria-hidden="true" />
      {value}
    </span>
  );
}

export function LoadingSkeleton({
  rows = 4,
  compact = false
}: {
  rows?: number;
  compact?: boolean;
}) {
  return (
    <div className={`skeleton-stack ${compact ? "compact" : ""}`} aria-busy="true">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <i />
          <span />
        </div>
      ))}
    </div>
  );
}

export function LoadingPage({ label = "Loading" }: { label?: string }) {
  return (
    <div id="main-content" className="state-page" role="status" aria-live="polite">
      <div className="loader" />
      <h1>{label}</h1>
      <p>Just a moment while we prepare your care space.</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon = <FileText aria-hidden="true" />
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  title = "We couldn’t load this"
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const message = error instanceof Error ? error.message : "Please try again.";
  return (
    <div className="error-state" role="alert">
      <AlertCircle aria-hidden="true" />
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
        {onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}

export function IntegrationNotice({
  title = "Backend setup required",
  children
}: PropsWithChildren<{ title?: string }>) {
  return (
    <aside className="integration-notice" role="status">
      <AlertCircle aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </aside>
  );
}

interface BaseFieldProps {
  label: string;
  error?: string;
  hint?: string;
}

export function FormField({
  label,
  error,
  hint,
  id,
  ...props
}: BaseFieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId();
  const inputId = id || generated;
  const descriptionId = `${inputId}-description`;
  return (
    <label className="field" htmlFor={inputId}>
      <span>{label}</span>
      <input
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? descriptionId : undefined}
        {...props}
      />
      {(error || hint) && (
        <small id={descriptionId} className={error ? "field-error" : ""}>
          {error || hint}
        </small>
      )}
    </label>
  );
}

export function PasswordField({
  label,
  error,
  hint,
  id,
  ...props
}: BaseFieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const generated = useId();
  const inputId = id || generated;
  const descriptionId = `${inputId}-description`;
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <span className="password-field">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? descriptionId : undefined}
          {...props}
        />
        <button
          type="button"
          className="password-toggle"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </span>
      {(error || hint) && (
        <small id={descriptionId} className={error ? "field-error" : ""}>
          {error || hint}
        </small>
      )}
    </div>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  id,
  ...props
}: BaseFieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generated = useId();
  const inputId = id || generated;
  const descriptionId = `${inputId}-description`;
  return (
    <label className="field" htmlFor={inputId}>
      <span>{label}</span>
      <textarea
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? descriptionId : undefined}
        {...props}
      />
      {(error || hint) && (
        <small id={descriptionId} className={error ? "field-error" : ""}>
          {error || hint}
        </small>
      )}
    </label>
  );
}

export function SelectField({
  label,
  error,
  hint,
  id,
  children,
  ...props
}: BaseFieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const generated = useId();
  const inputId = id || generated;
  const descriptionId = `${inputId}-description`;
  return (
    <label className="field" htmlFor={inputId}>
      <span>{label}</span>
      <select
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? descriptionId : undefined}
        {...props}
      >
        {children}
      </select>
      {(error || hint) && (
        <small id={descriptionId} className={error ? "field-error" : ""}>
          {error || hint}
        </small>
      )}
    </label>
  );
}

export const DatePicker = FormField;

export function FileUpload({
  label,
  accept,
  onFile,
  value
}: {
  label: string;
  accept?: string;
  onFile(file: File): void;
  value?: string;
}) {
  const id = useId();
  return (
    <label className="file-upload" htmlFor={id}>
      <Upload aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        <small>{value || "PDF, JPG or PNG · private upload · 5 MB maximum"}</small>
      </span>
      <input
        id={id}
        type="file"
        accept={accept}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer
}: PropsWithChildren<{
  open: boolean;
  title: string;
  onClose(): void;
  footer?: ReactNode;
}>) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = () =>
      Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) || []);
    window.requestAnimationFrame(() => focusable()[0]?.focus());
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", close);
      previouslyFocused?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
}

export function Drawer({
  open,
  title,
  onClose,
  children
}: PropsWithChildren<{
  open: boolean;
  title: string;
  onClose(): void;
}>) {
  const drawerRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const elements = () => Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(selector) || []);
    window.requestAnimationFrame(() => elements()[0]?.focus());
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key !== "Tab") return;
      const focusable = elements();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previouslyFocused?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        ref={drawerRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        <div>{children}</div>
      </aside>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy,
  confirmDisabled,
  destructive,
  onCancel,
  onConfirm,
  children
}: PropsWithChildren<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  confirmDisabled?: boolean;
  destructive?: boolean;
  onCancel(): void;
  onConfirm(): void;
}>) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Keep it
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="confirm-dialog-content">
        <p className="confirm-dialog-description">{description}</p>
        {children ? <div className="confirm-dialog-fields">{children}</div> : null}
      </div>
    </Modal>
  );
}

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}
const ToastContext = createContext<{
  notify(message: string, kind?: ToastKind): void;
} | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const value = useMemo(
    () => ({
      notify(message: string, kind: ToastKind = "success") {
        const id = Date.now();
        setToasts((current) => [...current, { id, message, kind }]);
        window.setTimeout(
          () => setToasts((current) => current.filter((item) => item.id !== id)),
          4200
        );
      }
    }),
    []
  );
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div className={`toast toast-${toast.kind}`} key={toast.id}>
            {toast.kind === "success" && <Check aria-hidden="true" />}
            {toast.kind === "error" && <AlertCircle aria-hidden="true" />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider.");
  return context;
}

export const ToastNotification = ToastProvider;

export interface Column<T> {
  key: string;
  header: string;
  render(row: T): ReactNode;
  sortValue?(row: T): string | number;
}

export function DataTable<T extends { name: string }>({
  rows,
  columns,
  caption,
  onRowClick
}: {
  rows: T[];
  columns: Column<T>[];
  caption: string;
  onRowClick?: (row: T) => void;
}) {
  const [sortKey, setSortKey] = useState<string>();
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const sortedRows = useMemo(() => {
    const column = columns.find((item) => item.key === sortKey);
    if (!column?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const left = column.sortValue!(a);
      const right = column.sortValue!(b);
      const result =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right));
      return sortDirection === "asc" ? result : -result;
    });
  }, [rows, columns, sortKey, sortDirection]);
  const changeSort = (column: Column<T>) => {
    if (!column.sortValue) return;
    if (sortKey === column.key) {
      setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(column.key);
      setSortDirection("asc");
    }
  };
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th scope="col" key={column.key}>
                {column.sortValue ? (
                  <button
                    className="table-sort"
                    onClick={() => changeSort(column)}
                    aria-label={`Sort by ${column.header}${
                      sortKey === column.key
                        ? `, currently ${sortDirection}ending`
                        : ""
                    }`}
                  >
                    {column.header}
                    <span aria-hidden="true">
                      {sortKey === column.key
                        ? sortDirection === "asc"
                          ? "↑"
                          : "↓"
                        : "↕"}
                    </span>
                  </button>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr
              key={row.name}
              className={onRowClick ? "clickable-row" : undefined}
              onClick={() => onRowClick?.(row)}
              onKeyDown={(event) => {
                if (!onRowClick || (event.key !== "Enter" && event.key !== " ")) return;
                event.preventDefault();
                onRowClick(row);
              }}
              tabIndex={onRowClick ? 0 : undefined}
              aria-label={onRowClick ? `Open ${row.name}` : undefined}
            >
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  page,
  hasNext,
  onPage
}: {
  page: number;
  hasNext: boolean;
  onPage(page: number): void;
}) {
  return (
    <nav className="pagination" aria-label="Pagination">
      <Button
        variant="ghost"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        icon={<ChevronLeft />}
      >
        Previous
      </Button>
      <span>Page {page}</span>
      <Button
        variant="ghost"
        disabled={!hasNext}
        onClick={() => onPage(page + 1)}
      >
        Next <ChevronRight />
      </Button>
    </nav>
  );
}

export function SearchFilterBar({
  value,
  onChange,
  placeholder = "Search",
  children
}: PropsWithChildren<{
  value: string;
  onChange(value: string): void;
  placeholder?: string;
}>) {
  return (
    <div className="filter-bar">
      <label className="search-input">
        <span className="sr-only">{placeholder}</span>
        <Search aria-hidden="true" />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      </label>
      {children}
    </div>
  );
}

export function TimeSlotPicker({
  slots,
  value,
  onChange
}: {
  slots: string[];
  value?: string;
  onChange(slot: string): void;
}) {
  return (
    <fieldset className="time-slot-picker">
      <legend>Select a time</legend>
      <div>
        {slots.map((slot) => (
          <button
            type="button"
            className={value === slot ? "selected" : ""}
            aria-pressed={value === slot}
            onClick={() => onChange(slot)}
            key={slot}
          >
            {slot}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Calendar({
  value,
  onChange,
  min
}: {
  value: string;
  onChange(value: string): void;
  min?: string;
}) {
  return (
    <div className="calendar-control">
      <FormField
        label="Appointment date"
        type="date"
        value={value}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </div>
  );
}

export function DoctorCard({ doctor }: { doctor: Doctor }) {
  const tags = doctor.specialization_tags
    ?.split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return (
    <article className="doctor-card">
      <div className="avatar avatar-doctor" aria-hidden="true">
        {doctor.full_name?.charAt(0) || "D"}
      </div>
      <div className="doctor-card-body">
        <div className="card-heading">
          <div>
            <h2>{doctor.full_name}</h2>
            <p>{doctor.specialty}</p>
          </div>
          <StatusBadge status={doctor.status} />
        </div>
        {tags && (
          <div className="tag-list">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        )}
        <div className="doctor-meta">
          <span>₹{Number(doctor.consultation_fee || 0).toLocaleString()}</span>
          <span>
            <Clock3 /> {doctor.avg_consult_duration_mins || 30} min
          </span>
          <span>
            <Video /> {doctor.teleconsult_enabled ? "Video available" : "In-person"}
          </span>
        </div>
        <div className="card-actions">
          <Link className="text-link" to={`/patient/doctors/${doctor.name}`}>
            View profile <ArrowRight />
          </Link>
          <Link
            className="button button-primary"
            to={`/patient/book?doctor=${encodeURIComponent(doctor.name)}`}
          >
            Book consultation
          </Link>
        </div>
      </div>
    </article>
  );
}

export function PatientCard({ patient }: { patient: PatientUser }) {
  return (
    <article className="patient-card">
      <div className="avatar">{patient.name1?.charAt(0) || "P"}</div>
      <div>
        <h3>{patient.name1}</h3>
        <p>
          {patient.age} years · {patient.gender || "Gender not set"}
        </p>
      </div>
      <StatusBadge status={patient.consent_status || "Pending"} />
    </article>
  );
}

export function AppointmentCard({
  appointment,
  doctorName,
  patientName,
  actions
}: {
  appointment: Appointment;
  doctorName?: string;
  patientName?: string;
  actions?: ReactNode;
}) {
  return (
    <article className="appointment-card">
      <div className="appointment-date">
        <strong>
          {new Date(`${appointment.appointment_date}T00:00:00`).toLocaleDateString(
            undefined,
            { day: "2-digit" }
          )}
        </strong>
        <span>
          {new Date(`${appointment.appointment_date}T00:00:00`).toLocaleDateString(
            undefined,
            { month: "short" }
          )}
        </span>
      </div>
      <div className="appointment-main">
        <div className="card-heading">
          <div>
            <h3>{doctorName || patientName || appointment.doctor_name || appointment.patient_name || appointment.doctor}</h3>
            <p>
              {appointment.is_teleconsult ? "Video consultation" : "In-person"} ·{" "}
              {appointment.appointment_time}
            </p>
          </div>
          <StatusBadge status={appointment.status} />
        </div>
        {appointment.symptoms && <p className="clamp">{appointment.symptoms}</p>}
        {actions && <div className="card-actions">{actions}</div>}
      </div>
    </article>
  );
}

export function AppointmentTimeline({
  events
}: {
  events: AppointmentAuditTimeline[];
}) {
  return (
    <ol className="timeline">
      {events.map((event) => (
        <li key={event.name}>
          <span aria-hidden="true" />
          <div>
            <strong>{event.event_type}</strong>
            <p>{event.reason || `${event.previous_status} → ${event.new_status}`}</p>
            <small>
              {event.event_time
                ? new Date(event.event_time).toLocaleString()
                : "Time unavailable"}{" "}
              {event.actor_role ? `· ${event.actor_role}` : ""}
            </small>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function SoapNotesForm({
  value,
  onChange
}: {
  value: Partial<Consultation>;
  onChange(value: Partial<Consultation>): void;
}) {
  const set = (key: keyof Consultation, next: string) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="soap-grid">
      <TextAreaField
        label="Subjective"
        value={value.soap_subjective || ""}
        onChange={(event) => set("soap_subjective", event.target.value)}
        placeholder="Patient-reported symptoms and history"
      />
      <TextAreaField
        label="Objective"
        value={value.soap_objective || ""}
        onChange={(event) => set("soap_objective", event.target.value)}
        placeholder="Observations and clinical findings"
      />
      <TextAreaField
        label="Assessment"
        value={value.soap_assessment || ""}
        onChange={(event) => set("soap_assessment", event.target.value)}
        placeholder="Clinical assessment"
      />
      <TextAreaField
        label="Plan"
        value={value.soap_plan || ""}
        onChange={(event) => set("soap_plan", event.target.value)}
        placeholder="Care plan and next steps"
      />
    </div>
  );
}

export function PrescriptionForm({
  onSubmit,
  busy
}: {
  onSubmit(value: Omit<Prescription, "name">): void;
  busy?: boolean;
}) {
  const [medicine, setMedicine] = useState("");
  const [dosage, setDosage] = useState("");
  const [instructions, setInstructions] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      consultation: "",
      medicine_name: medicine,
      dosage,
      instructions
    });
  };
  return (
    <form className="form-grid" onSubmit={submit}>
      <FormField
        label="Medicine name"
        value={medicine}
        onChange={(event) => setMedicine(event.target.value)}
        required
      />
      <FormField
        label="Dosage"
        value={dosage}
        onChange={(event) => setDosage(event.target.value)}
        required
      />
      <TextAreaField
        label="Instructions"
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
      />
      <Button disabled={busy || !medicine || !dosage}>
        {busy ? "Adding…" : "Add prescription"}
      </Button>
    </form>
  );
}

export function ConsultationEditor({
  value,
  onChange,
  onSave,
  busy
}: {
  value: Partial<Consultation>;
  onChange(value: Partial<Consultation>): void;
  onSave(): void;
  busy?: boolean;
}) {
  const set = (key: keyof Consultation, next: string) =>
    onChange({ ...value, [key]: next });
  return (
    <section className="clinical-editor">
      <div className="form-grid two-column">
        <TextAreaField
          label="Chief complaint"
          value={value.chief_complaint || ""}
          onChange={(event) => set("chief_complaint", event.target.value)}
        />
        <TextAreaField
          label="Diagnosis"
          value={value.diagnosis || ""}
          onChange={(event) => set("diagnosis", event.target.value)}
        />
      </div>
      <h2>SOAP notes</h2>
      <SoapNotesForm value={value} onChange={onChange} />
      <div className="form-grid two-column">
        <FormField
          label="Follow-up date"
          type="date"
          value={value.follow_up_date || ""}
          onChange={(event) => set("follow_up_date", event.target.value)}
        />
        <TextAreaField
          label="Patient-friendly summary"
          value={value.patient_friendly_summary || ""}
          onChange={(event) =>
            set("patient_friendly_summary", event.target.value)
          }
          hint="Patients can read this summary."
        />
      </div>
      <div className="sticky-actions">
        <Button onClick={onSave} disabled={busy}>
          {busy ? "Saving clinical note…" : "Save consultation"}
        </Button>
      </div>
    </section>
  );
}

export function ConsentBanner({
  granted,
  onReview
}: {
  granted: boolean;
  onReview?(): void;
}) {
  return (
    <aside className={`consent-banner ${granted ? "granted" : ""}`}>
      {granted ? <Check aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
      <div>
        <strong>{granted ? "Consent recorded" : "Consent needs attention"}</strong>
        <p>
          {granted
            ? "Your current privacy and treatment preferences are on file."
            : "Review and grant the required consent before continuing."}
        </p>
      </div>
      {onReview && (
        <Button variant="ghost" onClick={onReview}>
          Review
        </Button>
      )}
    </aside>
  );
}
