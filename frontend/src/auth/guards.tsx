import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import type { PortalRole } from "../types/domain";
import { LoadingPage } from "../components/ui";

const portalHome = {
  patient: "/patient/dashboard",
  doctor: "/doctor/dashboard",
  admin: "/admin/dashboard"
} satisfies Record<PortalRole, string>;

export function RequireAuth({ children }: { children?: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === "restoring") return <LoadingPage label="Restoring session" />;
  if (auth.status !== "authenticated") {
    const portal = location.pathname.split("/")[1] || "patient";
    return (
      <Navigate
        to={`/${portal}/login`}
        replace
        state={{ from: location.pathname }}
      />
    );
  }
  return children ?? <Outlet />;
}

function RequirePortal({
  portal,
  children
}: {
  portal: PortalRole;
  children?: ReactNode;
}) {
  const auth = useAuth();
  if (auth.status === "restoring") return <LoadingPage label="Checking access" />;
  if (auth.status !== "authenticated") {
    return <Navigate to={`/${portal}/login`} replace />;
  }
  if (auth.portal !== portal) {
    return <Navigate to={portalHome[auth.portal ?? "patient"]} replace />;
  }
  return children ?? <Outlet />;
}

export function RequirePatient({ children }: { children?: ReactNode }) {
  return <RequirePortal portal="patient">{children}</RequirePortal>;
}

export function RequireDoctor({ children }: { children?: ReactNode }) {
  return <RequirePortal portal="doctor">{children}</RequirePortal>;
}

export function RequireApprovedDoctor({ children }: { children?: ReactNode }) {
  const auth = useAuth();
  if (auth.doctor?.approval_status !== "Approved") {
    return <Navigate to="/doctor/pending" replace />;
  }
  return children ?? <Outlet />;
}

export function RequireAdmin({ children }: { children?: ReactNode }) {
  return <RequirePortal portal="admin">{children}</RequirePortal>;
}

export function GuestOnly({
  portal,
  children
}: {
  portal: PortalRole;
  children: ReactNode;
}) {
  const auth = useAuth();
  if (auth.status === "restoring") return <LoadingPage label={`Checking ${portal} session`} />;
  if (auth.status === "authenticated" && auth.portal) {
    if (
      auth.portal === "doctor" &&
      auth.doctor?.approval_status !== "Approved"
    ) {
      return <Navigate to="/doctor/pending" replace />;
    }
    return <Navigate to={portalHome[auth.portal]} replace />;
  }
  return <>{children}</>;
}
