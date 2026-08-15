import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { useAuth } from "../auth/AuthProvider";
import { ToastProvider } from "../components/ui";

vi.mock("../auth/AuthProvider", () => ({
  useAuth: vi.fn()
}));

const mockedUseAuth = vi.mocked(useAuth);

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("public route smoke coverage", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({
      status: "anonymous",
      roles: [],
      login: vi.fn(),
      logout: vi.fn(),
      restore: vi.fn()
    });
  });

  it.each([
    ["/", "Welcome to a calmer way to care."],
    ["/patient/login", "Welcome back"],
    ["/patient/register", "Let’s start with you"],
    ["/patient/otp-login", "Sign in with your phone"],
    ["/patient/forgot-password", "Reset your password"],
    ["/patient/reset-password?key=test-key", "Choose a new password"],
    ["/doctor/login", "Welcome, doctor"],
    ["/doctor/register", "Join the SoulPlace care network"],
    ["/doctor/forgot-password", "Reset your password"],
    ["/admin/login", "Operations sign in"],
    ["/admin/forgot-password", "Reset your password"],
    ["/not-a-real-route", "That page isn’t here"]
  ])("renders %s without crashing", async (path, heading) => {
    renderRoute(path);
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("redirects anonymous protected routes to the correct portal login", async () => {
    renderRoute("/doctor/consultations/CON-1");
    expect(await screen.findByRole("heading", { name: "Welcome, doctor" }))
      .toBeInTheDocument();
  });
});
