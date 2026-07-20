import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

import { AppHeader } from "./AppHeader";

describe("AppHeader", () => {
  it("renders the title and drawer toggle", async () => {
    const onToggleDrawer = vi.fn();
    render(
      <MemoryRouter>
        <AppHeader mode="voice" drawerOpen={true} onToggleDrawer={onToggleDrawer} />
      </MemoryRouter>
    );
    expect(screen.getByText("Sentinel")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Toggle transcript drawer" }));
    expect(onToggleDrawer).toHaveBeenCalledOnce();
  });

  it("shows 'Hide transcript' tooltip label when the drawer is open", () => {
    render(
      <MemoryRouter>
        <AppHeader mode="voice" drawerOpen={true} onToggleDrawer={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByLabelText("Toggle transcript drawer")).toBeInTheDocument();
  });

  it("navigates to / when the Voice toggle is selected", async () => {
    render(
      <MemoryRouter>
        <AppHeader mode="code" drawerOpen={true} onToggleDrawer={vi.fn()} />
      </MemoryRouter>
    );
    await userEvent.click(screen.getByRole("button", { name: /voice agent/i }));
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("navigates to /agent when the Code toggle is selected", async () => {
    render(
      <MemoryRouter>
        <AppHeader mode="voice" drawerOpen={true} onToggleDrawer={vi.fn()} />
      </MemoryRouter>
    );
    await userEvent.click(screen.getByRole("button", { name: /coding agent/i }));
    expect(navigateMock).toHaveBeenCalledWith("/agent");
  });

  it("shows the Code toggle by default", () => {
    render(
      <MemoryRouter>
        <AppHeader mode="voice" drawerOpen={true} onToggleDrawer={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByRole("button", { name: /coding agent/i })).toBeInTheDocument();
  });

  it("hides the Code toggle when showCodeToggle is false", () => {
    render(
      <MemoryRouter>
        <AppHeader mode="voice" drawerOpen={true} onToggleDrawer={vi.fn()} showCodeToggle={false} />
      </MemoryRouter>
    );
    expect(screen.queryByRole("button", { name: /coding agent/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /voice agent/i })).toBeInTheDocument();
  });

  it("renders mode-specific children between the spacer and chat icon", () => {
    render(
      <MemoryRouter>
        <AppHeader mode="voice" drawerOpen={true} onToggleDrawer={vi.fn()}>
          <button>Custom control</button>
        </AppHeader>
      </MemoryRouter>
    );
    expect(screen.getByRole("button", { name: "Custom control" })).toBeInTheDocument();
  });
});
