import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PermissionCard } from "./PermissionCard";
import type { ToolPermission } from "./useAgentSession";

function makePermission(overrides: Partial<ToolPermission> = {}): ToolPermission {
  return { request_id: "req-1", tool: "bash", display: "ls -la\nsecond line", input: {}, ...overrides };
}

describe("PermissionCard", () => {
  it("shows the friendly label for a known tool", () => {
    render(<PermissionCard permission={makePermission()} onApprove={vi.fn()} onDeny={vi.fn()} />);
    expect(screen.getByText("Run command")).toBeInTheDocument();
  });

  it("falls back to the raw tool name for an unknown tool", () => {
    render(
      <PermissionCard
        permission={makePermission({ tool: "custom_tool" })}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />
    );
    expect(screen.getByText("custom_tool")).toBeInTheDocument();
  });

  it("renders the full display text in the preview", () => {
    const { container } = render(
      <PermissionCard permission={makePermission()} onApprove={vi.fn()} onDeny={vi.fn()} />
    );
    expect(container.querySelector("pre")).toHaveTextContent("ls -la second line");
  });

  it("Allow calls onApprove with always=false", async () => {
    const onApprove = vi.fn();
    render(<PermissionCard permission={makePermission()} onApprove={onApprove} onDeny={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Allow this once" }));
    expect(onApprove).toHaveBeenCalledWith("req-1", false);
  });

  it("Allow Always calls onApprove with always=true", async () => {
    const onApprove = vi.fn();
    render(<PermissionCard permission={makePermission()} onApprove={onApprove} onDeny={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Always allow/ }));
    expect(onApprove).toHaveBeenCalledWith("req-1", true);
  });

  it("Deny calls onDeny with the request id", async () => {
    const onDeny = vi.fn();
    render(<PermissionCard permission={makePermission()} onApprove={vi.fn()} onDeny={onDeny} />);
    await userEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(onDeny).toHaveBeenCalledWith("req-1");
  });

  it("uses only the first line of display in the dialog's accessible name", () => {
    render(<PermissionCard permission={makePermission()} onApprove={vi.fn()} onDeny={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Approve Run command: ls -la" })).toBeInTheDocument();
  });
});
