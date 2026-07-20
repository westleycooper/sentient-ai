import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { McpTopologyDiagram } from "./McpTopologyDiagram";
import type { McpStatus } from "../../api/hooks";

const status: McpStatus = {
  mounted: true,
  mount_path: "/mcp",
  resources: [
    {
      uri_template: "sentinel://sme-templates",
      name: "list_sme_templates",
      description: "All SME templates, summary fields.",
      wraps: "GetSmeTemplatesUseCase",
    },
  ],
  tools: [
    {
      name: "start_conversation",
      description: "Start a new conversation for an SME template.",
      wraps: "StartConversationUseCase",
    },
  ],
  sme_template_count: 3,
  conversations_touched_count: 1,
};

describe("McpTopologyDiagram", () => {
  it("renders the server card with mount path and mounted state", () => {
    render(<McpTopologyDiagram status={status} />);
    expect(screen.getByText("Sentinel MCP Server")).toBeInTheDocument();
    expect(screen.getByText(/\/mcp — mounted, local only/)).toBeInTheDocument();
  });

  it("renders each resource with its uri template and wrapped use case", () => {
    render(<McpTopologyDiagram status={status} />);
    expect(screen.getByText("list_sme_templates")).toBeInTheDocument();
    expect(screen.getByText("sentinel://sme-templates")).toBeInTheDocument();
    expect(screen.getByText("→ GetSmeTemplatesUseCase")).toBeInTheDocument();
  });

  it("renders each tool with its wrapped use case", () => {
    render(<McpTopologyDiagram status={status} />);
    expect(screen.getByText("start_conversation")).toBeInTheDocument();
    expect(screen.getByText("→ StartConversationUseCase")).toBeInTheDocument();
  });

  it("shows not-mounted state when the server isn't live", () => {
    render(<McpTopologyDiagram status={{ ...status, mounted: false }} />);
    expect(screen.getByText(/\/mcp — not mounted/)).toBeInTheDocument();
  });
});
