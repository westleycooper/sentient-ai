import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { McpPage } from "./McpPage";
import { api } from "../api/client";
import type { McpStatus } from "../api/hooks";

vi.mock("../api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const STATUS: McpStatus = {
  mounted: true,
  mount_path: "/mcp",
  resources: [],
  tools: [],
  sme_template_count: 2,
  conversations_touched_count: 0,
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <McpPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("McpPage", () => {
  afterEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it("shows a loading spinner before the status resolves", () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders live stats and the mounted chip once status loads", async () => {
    vi.mocked(api.get).mockResolvedValue(STATUS);
    renderPage();

    await waitFor(() => expect(screen.getByText("Mounted (local only)")).toBeInTheDocument());
    expect(screen.getByText("2")).toBeInTheDocument(); // sme_template_count stat tile
  });

  it("shows the not-mounted chip when the server isn't live", async () => {
    vi.mocked(api.get).mockResolvedValue({ ...STATUS, mounted: false });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Not mounted — production")).toBeInTheDocument()
    );
  });
});
