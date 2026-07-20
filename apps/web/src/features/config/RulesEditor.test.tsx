import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RulesEditor } from "./RulesEditor";
import type { SmeRule } from "../../api/hooks";

describe("RulesEditor", () => {
  it("shows an empty state with an 'Add first rule' button when there are no rules", () => {
    render(<RulesEditor rules={[]} onChange={vi.fn()} />);
    expect(screen.getByText("No rules yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add first rule" })).toBeInTheDocument();
  });

  it("adds a new blank enabled rule via the empty-state button", async () => {
    const onChange = vi.fn();
    render(<RulesEditor rules={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Add first rule" }));

    expect(onChange).toHaveBeenCalledOnce();
    const [added] = onChange.mock.calls[0][0] as SmeRule[];
    expect(added.description).toBe("");
    expect(added.enabled).toBe(true);
  });

  it("adds a new rule via the header 'Add rule' button when rules already exist", async () => {
    const rule: SmeRule = { id: "r1", description: "Existing", enabled: true };
    const onChange = vi.fn();
    render(<RulesEditor rules={[rule]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Add rule" }));

    const result = onChange.mock.calls[0][0] as SmeRule[];
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(rule);
  });

  it("renders each rule's description and enabled state", () => {
    const rules: SmeRule[] = [
      { id: "r1", description: "Cite sources", enabled: true },
      { id: "r2", description: "No advice", enabled: false },
    ];
    render(<RulesEditor rules={rules} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Rule 1 description")).toHaveValue("Cite sources");
    expect(screen.getByLabelText("Enable rule 1")).toBeChecked();
    expect(screen.getByLabelText("Rule 2 description")).toHaveValue("No advice");
    expect(screen.getByLabelText("Enable rule 2")).not.toBeChecked();
  });

  it("toggling the switch updates only that rule's enabled flag", async () => {
    const rules: SmeRule[] = [{ id: "r1", description: "Cite sources", enabled: true }];
    const onChange = vi.fn();
    render(<RulesEditor rules={rules} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("Enable rule 1"));

    expect(onChange).toHaveBeenCalledWith([{ id: "r1", description: "Cite sources", enabled: false }]);
  });

  it("editing the description updates only that rule", async () => {
    const rules: SmeRule[] = [{ id: "r1", description: "", enabled: true }];
    const onChange = vi.fn();
    render(<RulesEditor rules={rules} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Rule 1 description"), "X");

    expect(onChange).toHaveBeenLastCalledWith([{ id: "r1", description: "X", enabled: true }]);
  });

  it("removing a rule drops only that entry", async () => {
    const rules: SmeRule[] = [
      { id: "r1", description: "First", enabled: true },
      { id: "r2", description: "Second", enabled: true },
    ];
    const onChange = vi.fn();
    render(<RulesEditor rules={rules} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("Remove rule 1"));

    expect(onChange).toHaveBeenCalledWith([rules[1]]);
  });
});
