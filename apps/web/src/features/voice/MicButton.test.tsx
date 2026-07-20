import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MicButton } from "./MicButton";

describe("MicButton", () => {
  it("shows a start-recording label and calls onStart when idle", async () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    render(<MicButton state="idle" onStart={onStart} onStop={onStop} />);

    const button = screen.getByRole("button", { name: "Start recording" });
    await userEvent.click(button);
    expect(onStart).toHaveBeenCalledOnce();
    expect(onStop).not.toHaveBeenCalled();
  });

  it("shows a stop-recording label and calls onStop when recording", async () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    render(<MicButton state="recording" onStart={onStart} onStop={onStop} />);

    const button = screen.getByRole("button", { name: "Stop recording" });
    await userEvent.click(button);
    expect(onStop).toHaveBeenCalledOnce();
    expect(onStart).not.toHaveBeenCalled();
  });

  it("is disabled when the disabled prop is set", () => {
    render(<MicButton state="idle" onStart={vi.fn()} onStop={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: "Start recording" })).toBeDisabled();
  });

  it("is disabled in the error state", () => {
    render(<MicButton state="error" onStart={vi.fn()} onStop={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Start recording" })).toBeDisabled();
  });
});
