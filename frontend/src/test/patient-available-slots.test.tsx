import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { doctorsApi } from "../api/doctors";
import { AvailableSlots } from "../pages/patient";

function renderSlots(onChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={queryClient}>
      <AvailableSlots
        doctor="DOC-1"
        date="2026-08-17"
        value="10:30:00"
        onChange={onChange}
        heading="Doctor’s available times"
      />
    </QueryClientProvider>
  );
  return onChange;
}

describe("patient availability selection", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows only slots returned by the doctor's availability API", async () => {
    vi.spyOn(doctorsApi, "getSlots").mockResolvedValue([
      "10:30:00",
      "14:00:00"
    ]);
    const onChange = renderSlots();

    expect(await screen.findByRole("button", { name: "10:30" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "14:00" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "11:00" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "14:00" }));
    expect(onChange).toHaveBeenCalledWith("14:00:00");
    expect(doctorsApi.getSlots).toHaveBeenCalledWith("DOC-1", "2026-08-17");
  });

  it("explains when the doctor has no availability on the selected date", async () => {
    vi.spyOn(doctorsApi, "getSlots").mockResolvedValue([]);
    renderSlots();

    expect(await screen.findByRole("heading", { name: "No slots available" }))
      .toBeInTheDocument();
  });
});
