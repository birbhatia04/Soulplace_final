import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GoogleMeetCard } from "../components/GoogleMeetCard";

const session = {
  name: "TEL-1",
  appointment: "APT-1",
  practitioner: "DOC-1",
  patient: "PAT-1",
  provider: "Custom" as const,
  meeting_id: "spaces/space-1",
  meeting_link: "https://meet.google.com/abc-defg-hij",
  session_status: "Created" as const
};

describe("GoogleMeetCard", () => {
  it("shows a confirmed patient the saved Meet link", () => {
    render(
      <GoogleMeetCard
        audience="patient"
        appointmentStatus="Confirmed"
        session={session}
      />
    );

    const link = screen.getByRole("link", { name: /Join consultation/i });
    expect(link).toHaveAttribute("href", session.meeting_link);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/wait for your doctor to admit you/i)).toBeInTheDocument();
  });

  it("does not expose a join action before confirmation", () => {
    render(
      <GoogleMeetCard
        audience="patient"
        appointmentStatus="Pending"
        session={session}
      />
    );

    expect(screen.queryByRole("link", { name: /Join/i })).not.toBeInTheDocument();
    expect(screen.getByText(/after the doctor confirms/i)).toBeInTheDocument();
  });

  it("lets a doctor create a room for a confirmed appointment", () => {
    const onCreate = vi.fn();
    render(
      <GoogleMeetCard
        audience="doctor"
        appointmentStatus="Confirmed"
        doctorEmail="doctor@clinic.example"
        onCreate={onCreate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Create Google Meet/i }));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(screen.getByText(/Gmail address is not required/i)).toBeInTheDocument();
    expect(screen.getByText(/doctor@clinic\.example/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Set up a Google Account/i })).toHaveAttribute(
      "href",
      "https://accounts.google.com/signup"
    );
  });

  it("disables creation when OAuth is not configured", () => {
    render(
      <GoogleMeetCard
        audience="doctor"
        appointmentStatus="Confirmed"
        configured={false}
        onCreate={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /Create Google Meet/i })).toBeDisabled();
    expect(screen.getByText(/needs a Google OAuth web client/i)).toBeInTheDocument();
  });

  it("keeps automated creation hidden when manual Meet entry is active", () => {
    render(
      <GoogleMeetCard
        audience="doctor"
        appointmentStatus="Confirmed"
        automaticCreationEnabled={false}
        onCreate={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /Create Google Meet/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Add a Google Meet link from the appointment actions/i)).toBeInTheDocument();
  });

  it("hides join actions after a consultation is completed", () => {
    render(
      <GoogleMeetCard
        audience="doctor"
        appointmentStatus="Completed"
        session={{ ...session, session_status: "Completed" }}
      />
    );

    expect(screen.queryByRole("link", { name: /Join/i })).not.toBeInTheDocument();
    expect(screen.getByText(/consultation has ended/i)).toBeInTheDocument();
  });

  it("refuses to open an invalid saved meeting link", () => {
    render(
      <GoogleMeetCard
        audience="patient"
        appointmentStatus="Confirmed"
        session={{ ...session, meeting_link: "https://example.com/meeting" }}
      />
    );

    expect(screen.queryByRole("link", { name: /Join/i })).not.toBeInTheDocument();
    expect(screen.getByText(/will not open it/i)).toBeInTheDocument();
  });
});
