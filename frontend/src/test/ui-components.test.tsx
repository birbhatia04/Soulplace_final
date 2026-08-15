import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  DataTable,
  FormField,
  Modal,
  TextAreaField,
  TimeSlotPicker,
  type Column
} from "../components/ui";

describe("shared UI behavior", () => {
  it("connects validation copy to its form field", () => {
    render(<FormField label="Phone number" error="Enter a valid phone number" />);

    const input = screen.getByRole("textbox", { name: /Phone number/ });
    const error = screen.getByText("Enter a valid phone number");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", error.id);
  });

  it("labels a modal and closes it with Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Cancel appointment?" onClose={onClose}>
        <p>Review this action.</p>
      </Modal>
    );

    expect(screen.getByRole("dialog", { name: "Cancel appointment?" }))
      .toHaveAttribute("aria-modal", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps a modal field focused when its controlled value changes", async () => {
    function ModalForm() {
      const [reason, setReason] = useState("");
      return (
        <Modal open title="Cancel appointment?" onClose={() => undefined}>
          <TextAreaField
            label="Cancellation reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Modal>
      );
    }

    render(<ModalForm />);
    const field = screen.getByRole("textbox", { name: "Cancellation reason" });
    field.focus();
    fireEvent.change(field, { target: { value: "No longer available" } });
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveValue("No longer available");
  });

  it("sorts data tables in both directions", () => {
    const rows = [
      { name: "2", patient: "Zara" },
      { name: "1", patient: "Aarav" }
    ];
    const columns: Column<(typeof rows)[number]>[] = [
      {
        key: "patient",
        header: "Patient",
        render: (row) => row.patient,
        sortValue: (row) => row.patient
      }
    ];
    const { container } = render(
      <DataTable rows={rows} columns={columns} caption="Patients" />
    );
    const names = () =>
      Array.from(container.querySelectorAll("tbody td")).map((cell) => cell.textContent);

    fireEvent.click(screen.getByRole("button", { name: "Sort by Patient" }));
    expect(names()).toEqual(["Aarav", "Zara"]);
    fireEvent.click(screen.getByRole("button", { name: /currently ascending/ }));
    expect(names()).toEqual(["Zara", "Aarav"]);
  });

  it("opens clickable table rows from the keyboard", () => {
    const open = vi.fn();
    render(
      <DataTable
        rows={[{ name: "PAT-1" }]}
        columns={[{ key: "name", header: "Patient", render: (row) => row.name }]}
        caption="Patients"
        onRowClick={open}
      />
    );
    fireEvent.keyDown(screen.getByRole("row", { name: "Open PAT-1" }), { key: "Enter" });
    expect(open).toHaveBeenCalledWith({ name: "PAT-1" });
  });

  it("announces the selected time slot as a pressed button", () => {
    const onChange = vi.fn();
    render(
      <TimeSlotPicker
        slots={["09:00", "09:30"]}
        value="09:30"
        onChange={onChange}
      />
    );

    expect(screen.getByRole("button", { name: "09:30" }))
      .toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "09:00" }));
    expect(onChange).toHaveBeenCalledWith("09:00");
  });
});
