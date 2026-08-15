import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GuestOnly,
  RequireAdmin,
  RequireApprovedDoctor,
  RequirePatient
} from "../auth/guards";
import { useAuth } from "../auth/AuthProvider";

vi.mock("../auth/AuthProvider", () => ({
  useAuth: vi.fn()
}));

const mockedUseAuth = vi.mocked(useAuth);

function session(overrides: Record<string, unknown> = {}) {
  return {
    status: "authenticated",
    username: "person@example.com",
    fullName: "Person",
    roles: [],
    portal: "patient",
    login: vi.fn(),
    logout: vi.fn(),
    restore: vi.fn(),
    ...overrides
  } as ReturnType<typeof useAuth>;
}

function renderRoutes(initial: string, element: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path={initial} element={element} />
        <Route path="/patient/dashboard" element={<div>patient home</div>} />
        <Route path="/doctor/dashboard" element={<div>doctor home</div>} />
        <Route path="/doctor/pending" element={<div>approval status</div>} />
        <Route path="/admin/dashboard" element={<div>admin home</div>} />
        <Route path="/admin/login" element={<div>admin login</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("portal route guards", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows a patient through a patient-only route", () => {
    mockedUseAuth.mockReturnValue(session());
    renderRoutes(
      "/patient/profile",
      <RequirePatient><div>patient profile</div></RequirePatient>
    );
    expect(screen.getByText("patient profile")).toBeInTheDocument();
  });

  it("redirects a doctor away from patient-only routes", () => {
    mockedUseAuth.mockReturnValue(session({ portal: "doctor" }));
    renderRoutes(
      "/patient/profile",
      <RequirePatient><div>patient profile</div></RequirePatient>
    );
    expect(screen.getByText("doctor home")).toBeInTheDocument();
  });

  it("redirects non-admin users away from admin routes", () => {
    mockedUseAuth.mockReturnValue(session({ portal: "patient" }));
    renderRoutes(
      "/admin/dashboard",
      <RequireAdmin><div>private admin data</div></RequireAdmin>
    );
    expect(screen.getByText("patient home")).toBeInTheDocument();
    expect(screen.queryByText("private admin data")).not.toBeInTheDocument();
  });

  it("blocks a pending doctor from approved doctor routes", () => {
    mockedUseAuth.mockReturnValue(
      session({
        portal: "doctor",
        doctor: { approval_status: "Pending" }
      })
    );
    renderRoutes(
      "/doctor/appointments",
      <RequireApprovedDoctor><div>doctor appointments</div></RequireApprovedDoctor>
    );
    expect(screen.getByText("approval status")).toBeInTheDocument();
  });

  it("allows an approved doctor into the doctor workspace", () => {
    mockedUseAuth.mockReturnValue(
      session({
        portal: "doctor",
        doctor: { approval_status: "Approved" }
      })
    );
    renderRoutes(
      "/doctor/appointments",
      <RequireApprovedDoctor><div>doctor appointments</div></RequireApprovedDoctor>
    );
    expect(screen.getByText("doctor appointments")).toBeInTheDocument();
  });

  it("routes an already authenticated doctor to the doctor portal at login", () => {
    mockedUseAuth.mockReturnValue(
      session({
        portal: "doctor",
        doctor: { approval_status: "Approved" }
      })
    );
    renderRoutes(
      "/doctor/login",
      <GuestOnly portal="doctor"><div>login form</div></GuestOnly>
    );
    expect(screen.getByText("doctor home")).toBeInTheDocument();
  });
});
