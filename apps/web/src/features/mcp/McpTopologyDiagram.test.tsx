import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { McpTopologyDiagram } from "./McpTopologyDiagram";
import { api } from "../../api/client";
import type { McpStatus } from "../../api/hooks";

vi.mock("../../api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const status: McpStatus = {
  mounted: true,
  mount_path: "/mcp",
  resources: [
    {
      uri_template: "sentient://sme-templates",
      name: "list_sme_templates",
      description: "All SME templates, summary fields.",
      wraps: "GetSmeTemplatesUseCase",
      params: [],
    },
    {
      uri_template: "sentient://sme-templates/{template_id}",
      name: "get_sme_template",
      description: "Full SME template definition.",
      wraps: "GetSmeTemplatesUseCase",
      params: ["template_id"],
    },
  ],
  tools: [
    {
      name: "start_conversation",
      description: "Start a new conversation for an SME template.",
      wraps: "StartConversationUseCase",
      input_schema: {
        properties: { sme_id: { type: "string", title: "Sme Id" } },
        required: ["sme_id"],
      },
    },
  ],
  sme_template_count: 3,
  conversations_touched_count: 1,
};

function renderDiagram(s: McpStatus = status) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <McpTopologyDiagram status={s} />
    </QueryClientProvider>
  );
}

describe("McpTopologyDiagram", () => {
  afterEach(() => {
    vi.mocked(api.post).mockReset();
  });

  it("renders the server card with mount path and mounted state", () => {
    renderDiagram();
    expect(screen.getByText("Sentient AI MCP Server")).toBeInTheDocument();
    expect(screen.getByText(/\/mcp — mounted, local only/)).toBeInTheDocument();
  });

  it("renders each resource with its uri template and wrapped use case", () => {
    renderDiagram();
    expect(screen.getByText("list_sme_templates")).toBeInTheDocument();
    expect(screen.getByText("sentient://sme-templates")).toBeInTheDocument();
    expect(screen.getAllByText("→ GetSmeTemplatesUseCase").length).toBeGreaterThan(0);
  });

  it("renders each tool with its wrapped use case", () => {
    renderDiagram();
    expect(screen.getByText("start_conversation")).toBeInTheDocument();
    expect(screen.getByText("→ StartConversationUseCase")).toBeInTheDocument();
  });

  it("shows not-mounted state when the server isn't live", () => {
    renderDiagram({ ...status, mounted: false });
    expect(screen.getByText(/\/mcp — not mounted/)).toBeInTheDocument();
  });

  describe("resource explorer", () => {
    it("a param-free resource's Read button is enabled immediately and reads the raw URI", async () => {
      vi.mocked(api.post).mockResolvedValue({ content: [{ id: "a" }] });
      renderDiagram();
      const readButtons = screen.getAllByRole("button", { name: "Read" });
      expect(readButtons[0]).toBeEnabled();

      await userEvent.click(readButtons[0]);
      expect(api.post).toHaveBeenCalledWith("/mcp-status/resources/read", { uri: "sentient://sme-templates" });
      expect(await screen.findByText(/"id": "a"/)).toBeInTheDocument();
    });

    it("a templated resource's Read button is disabled until the param is filled, then substitutes it into the URI", async () => {
      vi.mocked(api.post).mockResolvedValue({ content: { id: "ftse100-analyst" } });
      renderDiagram();
      const readButtons = screen.getAllByRole("button", { name: "Read" });
      const templatedRead = readButtons[1];
      expect(templatedRead).toBeDisabled();

      await userEvent.type(screen.getByLabelText("get_sme_template template_id"), "ftse100-analyst");
      expect(templatedRead).toBeEnabled();

      await userEvent.click(templatedRead);
      expect(api.post).toHaveBeenCalledWith("/mcp-status/resources/read", {
        uri: "sentient://sme-templates/ftse100-analyst",
      });
    });

    it("shows an error alert when the read fails", async () => {
      vi.mocked(api.post).mockRejectedValue(new Error("Resource not found"));
      renderDiagram();
      await userEvent.click(screen.getAllByRole("button", { name: "Read" })[0]);
      expect(await screen.findByText("Resource not found")).toBeInTheDocument();
    });
  });

  describe("tool explorer", () => {
    it("Invoke is disabled until required fields are filled, then calls the tool with typed arguments", async () => {
      vi.mocked(api.post).mockResolvedValue({ content: { conversation_id: "c1" } });
      renderDiagram();
      const invoke = screen.getByRole("button", { name: "Invoke" });
      expect(invoke).toBeDisabled();

      await userEvent.type(screen.getByLabelText("start_conversation sme_id"), "ftse100-analyst");
      expect(invoke).toBeEnabled();

      await userEvent.click(invoke);
      expect(api.post).toHaveBeenCalledWith("/mcp-status/tools/call", {
        name: "start_conversation",
        arguments: { sme_id: "ftse100-analyst" },
      });
      expect(await screen.findByText(/"conversation_id": "c1"/)).toBeInTheDocument();
    });

    it("coerces number-typed schema fields before invoking", async () => {
      const numericStatus: McpStatus = {
        ...status,
        tools: [
          {
            name: "example_tool",
            description: "d",
            wraps: "X",
            input_schema: { properties: { count: { type: "integer", title: "Count" } }, required: ["count"] },
          },
        ],
      };
      vi.mocked(api.post).mockResolvedValue({ content: {} });
      renderDiagram(numericStatus);

      await userEvent.type(screen.getByLabelText("example_tool count"), "5");
      await userEvent.click(screen.getByRole("button", { name: "Invoke" }));

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith("/mcp-status/tools/call", {
          name: "example_tool",
          arguments: { count: 5 },
        })
      );
    });

    it("shows an error alert when the tool call fails", async () => {
      vi.mocked(api.post).mockRejectedValue(new Error("SME template 'bad' not found."));
      renderDiagram();
      await userEvent.type(screen.getByLabelText("start_conversation sme_id"), "bad");
      await userEvent.click(screen.getByRole("button", { name: "Invoke" }));
      expect(await screen.findByText("SME template 'bad' not found.")).toBeInTheDocument();
    });
  });
});
