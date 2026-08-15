import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminShell, DoctorShell, PatientShell } from "../components/Shells";
import { useAuth } from "../auth/AuthProvider";

vi.mock("../auth/AuthProvider", () => ({
  useAuth: vi.fn()
}));

const mockedUseAuth = vi.mocked(useAuth);

const portals = [
  { label: "patient", path: "/patient/dashboard", Shell: PatientShell },
  { label: "doctor", path: "/doctor/dashboard", Shell: DoctorShell },
  { label: "admin", path: "/admin/dashboard", Shell: AdminShell }
] as const;

function fireTouchPointer(
  target: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  { pointerId, clientX, clientY }: { pointerId: number; clientX: number; clientY: number }
) {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: "touch" }
  });
  fireEvent(target, event);
}

describe("touch sidebar gestures", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({
      status: "authenticated",
      username: "demo@soulplace.test",
      fullName: "Demo User",
      roles: [],
      portal: "patient",
      login: vi.fn(),
      logout: vi.fn(),
      restore: vi.fn()
    } as ReturnType<typeof useAuth>);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(max-width: 820px)",
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it.each(portals)("opens the $label drawer from an edge swipe", ({ label, path, Shell }) => {
    const { container } = render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path} element={<Shell />}>
            <Route index element={<div>Portal content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    const shell = container.querySelector(".app-shell");
    const sidebar = screen.getByRole("complementary", { name: `${label} portal navigation` });
    expect(shell).not.toBeNull();

    fireTouchPointer(shell!, "pointerdown", { pointerId: 1, clientX: 10, clientY: 80 });
    fireTouchPointer(shell!, "pointermove", { pointerId: 1, clientX: 132, clientY: 82 });
    expect(sidebar).toHaveClass("is-dragging");
    fireTouchPointer(shell!, "pointerup", { pointerId: 1, clientX: 132, clientY: 82 });

    expect(sidebar).toHaveClass("is-open");
  });

  it("keeps the drawer open after a short closing drag", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/patient/dashboard"]}>
        <Routes>
          <Route path="/patient/dashboard" element={<PatientShell />}>
            <Route index element={<div>Portal content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    const shell = container.querySelector(".app-shell");
    const sidebar = screen.getByRole("complementary", { name: "patient portal navigation" });

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    fireTouchPointer(shell!, "pointerdown", { pointerId: 2, clientX: 220, clientY: 80 });
    fireTouchPointer(shell!, "pointermove", { pointerId: 2, clientX: 176, clientY: 82 });
    fireTouchPointer(shell!, "pointerup", { pointerId: 2, clientX: 176, clientY: 82 });

    expect(sidebar).toHaveClass("is-open");
  });

  it("closes the drawer after a committed leftward drag", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/patient/dashboard"]}>
        <Routes>
          <Route path="/patient/dashboard" element={<PatientShell />}>
            <Route index element={<div>Portal content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    const shell = container.querySelector(".app-shell");
    const sidebar = screen.getByRole("complementary", { name: "patient portal navigation" });

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    fireTouchPointer(shell!, "pointerdown", { pointerId: 3, clientX: 220, clientY: 80 });
    fireTouchPointer(shell!, "pointermove", { pointerId: 3, clientX: 92, clientY: 82 });
    fireTouchPointer(shell!, "pointerup", { pointerId: 3, clientX: 92, clientY: 82 });

    expect(sidebar).not.toHaveClass("is-open");
  });

  it("does not treat vertical scrolling from the edge as a drawer gesture", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/patient/dashboard"]}>
        <Routes>
          <Route path="/patient/dashboard" element={<PatientShell />}>
            <Route index element={<div>Portal content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    const shell = container.querySelector(".app-shell");
    const sidebar = screen.getByRole("complementary", { name: "patient portal navigation" });

    fireTouchPointer(shell!, "pointerdown", { pointerId: 4, clientX: 10, clientY: 80 });
    fireTouchPointer(shell!, "pointermove", { pointerId: 4, clientX: 14, clientY: 190 });
    fireTouchPointer(shell!, "pointerup", { pointerId: 4, clientX: 14, clientY: 190 });

    expect(sidebar).not.toHaveClass("is-open");
  });
});
