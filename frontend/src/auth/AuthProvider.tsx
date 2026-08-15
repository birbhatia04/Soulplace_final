import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authApi } from "../api/auth";
import { AUTH_EXPIRED_EVENT, normalizeApiError } from "../api/client";
import type { AuthSession, PortalRole } from "../types/domain";

interface LoginCredentials {
  username: string;
  password: string;
  portal: PortalRole;
}

interface AuthContextValue extends AuthSession {
  error?: string;
  login(credentials: LoginCredentials): Promise<AuthSession>;
  logout(): Promise<void>;
  restore(): Promise<AuthSession>;
}

const anonymousSession: AuthSession = { status: "anonymous", roles: [] };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession>({
    status: "restoring",
    roles: []
  });
  const [error, setError] = useState<string>();

  const restore = useCallback(async () => {
    try {
      setError(undefined);
      const restored = await authApi.restore();
      setSession(restored);
      return restored;
    } catch (unknownError) {
      const normalized = normalizeApiError(unknownError);
      if (
        normalized.code === "AUTHENTICATION" ||
        normalized.status === 403
      ) {
        setSession(anonymousSession);
      } else {
        setSession(anonymousSession);
        setError(normalized.message);
      }
      return anonymousSession;
    }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => void restore(), 0);
    return () => window.clearTimeout(task);
  }, [restore]);

  useEffect(() => {
    const handleExpiredSession = () => {
      queryClient.clear();
      setSession(anonymousSession);
      setError("Your session expired. Please sign in again.");
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpiredSession);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpiredSession);
  }, [queryClient]);

  const login = useCallback(
    async ({ username, password, portal }: LoginCredentials) => {
      setError(undefined);
      if (portal === "patient") {
        await authApi.loginPatient(username, password);
      } else {
        await authApi.loginPortal(username, password, portal);
      }
      const restored = await authApi.restore();
      if (restored.portal !== portal) {
        await authApi.logout();
        throw new Error(
          `This account belongs to the ${restored.portal ?? "unknown"} portal.`
        );
      }
      setSession(restored);
      return restored;
    },
    []
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    queryClient.clear();
    setSession(anonymousSession);
    setError(undefined);
  }, [queryClient]);

  const value = useMemo(
    () => ({ ...session, error, login, logout, restore }),
    [session, error, login, logout, restore]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
