import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SmeTemplateCard } from "./SmeTemplateCard";
import type { SmeTemplate } from "../../api/hooks";

function makeTemplate(overrides: Partial<SmeTemplate> = {}): SmeTemplate {
  return {
    id: "ftse100-analyst",
    name: "FTSE 100 Analyst",
    soul: "A measured equity analyst.",
    steps: [{ id: "s1", name: "Reason", kind: "reason", config: {}, next_default: null, next_on: {} }],
    sources: [{ id: "src1", name: "Yahoo Finance", kind: "http_api", config: {} }],
    rules: [{ id: "r1", description: "Cite sources", enabled: true }],
    is_default: false,
    visualisation_kind: "wave",
    user_visualisation_kind: "wave",
    theme_id: "dark-teal",
    lesson: { enabled: false, visual_verify: true, questions: [] },
    use_step_models: false,
    ...overrides,
  };
}

describe("SmeTemplateCard", () => {
  it("renders the template name, soul, and step/source/rule counts", () => {
    render(<SmeTemplateCard template={makeTemplate()} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText("FTSE 100 Analyst")).toBeInTheDocument();
    expect(screen.getByText("A measured equity analyst.")).toBeInTheDocument();
    expect(screen.getByText("1 steps · 1 sources · 1 rules")).toBeInTheDocument();
  });

  it("calls onSelect with the template id when clicked", async () => {
    const onSelect = vi.fn();
    render(<SmeTemplateCard template={makeTemplate()} selected={false} onSelect={onSelect} />);
    await userEvent.click(screen.getByText("FTSE 100 Analyst"));
    expect(onSelect).toHaveBeenCalledWith("ftse100-analyst");
  });

  it("shows a Locked chip for default (non-editable) templates", () => {
    render(<SmeTemplateCard template={makeTemplate({ is_default: true })} selected={false} onSelect={vi.fn()} />);
    expect(screen.getByText("Locked")).toBeInTheDocument();
  });

  it("does not show a Locked chip for user-created templates", () => {
    render(<SmeTemplateCard template={makeTemplate({ is_default: false })} selected={false} onSelect={vi.fn()} />);
    expect(screen.queryByText("Locked")).not.toBeInTheDocument();
  });

  it("shows a Default chip when isStartupDefault is set", () => {
    render(<SmeTemplateCard template={makeTemplate()} selected={false} isStartupDefault onSelect={vi.fn()} />);
    expect(screen.getByText("Default")).toBeInTheDocument();
  });
});
