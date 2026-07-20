import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RagSourcesEditor } from "./RagSourcesEditor";
import type { RetrievalSource } from "../../api/hooks";

function makeHttpSource(overrides: Partial<RetrievalSource> = {}): RetrievalSource {
  return {
    id: "src1",
    name: "Yahoo Finance",
    kind: "http_api",
    config: { url: "https://example.com", method: "GET", auth_header: "", auth_value: "", params: {} },
    ...overrides,
  };
}

describe("RagSourcesEditor", () => {
  it("shows an empty state with both add options when there are no sources", () => {
    render(<RagSourcesEditor sources={[]} onChange={vi.fn()} />);
    expect(screen.getByText("No retrieval sources configured.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add HTTP API endpoint" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add JSON document set" })).toBeInTheDocument();
  });

  it("adds a blank HTTP API source via the header 'Add API' button", async () => {
    const onChange = vi.fn();
    render(<RagSourcesEditor sources={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Add API" }));

    const [added] = onChange.mock.calls[0][0] as RetrievalSource[];
    expect(added.kind).toBe("http_api");
    expect(added.name).toBe("New API Source");
  });

  it("adds a blank JSON source via the header 'Add JSON' button", async () => {
    const onChange = vi.fn();
    render(<RagSourcesEditor sources={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Add JSON" }));

    const [added] = onChange.mock.calls[0][0] as RetrievalSource[];
    expect(added.kind).toBe("json_set");
  });

  it("renders the source name and url in the accordion summary", () => {
    render(<RagSourcesEditor sources={[makeHttpSource()]} onChange={vi.fn()} />);
    expect(screen.getByText("Yahoo Finance")).toBeInTheDocument();
    expect(screen.getByText("https://example.com")).toBeInTheDocument();
  });

  it("shows '(unnamed)' when the source has no name", () => {
    render(<RagSourcesEditor sources={[makeHttpSource({ name: "" })]} onChange={vi.fn()} />);
    expect(screen.getByText("(unnamed)")).toBeInTheDocument();
  });

  it("editing the source name updates only that source (first source auto-expanded)", async () => {
    const source = makeHttpSource();
    const onChange = vi.fn();
    render(<RagSourcesEditor sources={[source]} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Source name"), "X");
    expect(onChange).toHaveBeenLastCalledWith([{ ...source, name: `${source.name}X` }]);
  });

  it("editing the endpoint URL updates only the config", async () => {
    const source = makeHttpSource({ config: { url: "", method: "GET", auth_header: "", auth_value: "", params: {} } });
    const onChange = vi.fn();
    render(<RagSourcesEditor sources={[source]} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Endpoint URL"), "a");
    const [result] = onChange.mock.calls.at(-1)![0] as RetrievalSource[];
    expect((result.config as { url: string }).url).toBe("a");
  });

  it("removing a source drops it and clears expansion", async () => {
    const source = makeHttpSource();
    const onChange = vi.fn();
    render(<RagSourcesEditor sources={[source]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove source" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("renders JSON-set-specific fields for json_set sources", () => {
    const source: RetrievalSource = {
      id: "src2", name: "Docs", kind: "json_set", config: { documents: [{ id: "d1", text: "hello" }] },
    };
    render(<RagSourcesEditor sources={[source]} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Documents (JSON array)")).toHaveValue(
      JSON.stringify([{ id: "d1", text: "hello" }], null, 2)
    );
  });
});
