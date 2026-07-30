import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranscriptDrawer } from "./TranscriptDrawer";
import { useUiStore } from "../../store/uiStore";
import type { Message, StepEvent } from "../../api/hooks";

const INITIAL_UI_STATE = useUiStore.getState();

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1", role: "user", content: "Hello", created_at: new Date().toISOString(),
    token_count: 0, citations: [],
    ...overrides,
  };
}

function makeStep(overrides: Partial<StepEvent> = {}): StepEvent {
  return {
    type: "step", step_id: "s1", step_name: "Reason", phase: "finished",
    latency_ms: 120, prompt_tokens: 5, completion_tokens: 5, total_tokens: 10,
    model: "claude-sonnet-5", estimated_cost: 0, output_preview: null,
    ...overrides,
  };
}

const noop = () => {};

describe("TranscriptDrawer", () => {
  beforeEach(() => {
    useUiStore.setState(INITIAL_UI_STATE, true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows an empty-state prompt when there are no messages", () => {
    render(
      <TranscriptDrawer open messages={[]} steps={[]} stepsByMsgId={{}} isStreaming={false} onClose={noop} onSendText={noop} />
    );
    expect(screen.getByText("No messages yet. Speak or type below.")).toBeInTheDocument();
  });

  it("renders a user message as plain text", () => {
    render(
      <TranscriptDrawer
        open
        messages={[makeMessage({ content: "What is the FTSE 100?" })]}
        steps={[]}
        stepsByMsgId={{}}
        isStreaming={false}
        onClose={noop}
        onSendText={noop}
      />
    );
    expect(screen.getByText("What is the FTSE 100?")).toBeInTheDocument();
  });

  it("uses white text on a user bubble for contrast against its purple/dark accent background (regression)", () => {
    render(
      <TranscriptDrawer
        open
        messages={[makeMessage({ content: "What is the FTSE 100?" })]}
        steps={[]}
        stepsByMsgId={{}}
        isStreaming={false}
        onClose={noop}
        onSendText={noop}
      />
    );
    const bubble = screen.getByText("What is the FTSE 100?").closest("div");
    expect(bubble).toHaveStyle({ color: "#fff" });
  });

  it("renders an assistant message through markdown", () => {
    render(
      <TranscriptDrawer
        open
        messages={[makeMessage({ id: "m2", role: "assistant", content: "**bold answer**" })]}
        steps={[]}
        stepsByMsgId={{}}
        isStreaming={false}
        onClose={noop}
        onSendText={noop}
      />
    );
    expect(screen.getByText("bold answer").tagName).toBe("STRONG");
  });

  it("shows the token count for assistant messages that report one", () => {
    render(
      <TranscriptDrawer
        open
        messages={[makeMessage({ id: "m2", role: "assistant", content: "Answer", token_count: 1234 })]}
        steps={[]}
        stepsByMsgId={{}}
        isStreaming={false}
        onClose={noop}
        onSendText={noop}
      />
    );
    expect(screen.getByText("1,234 tokens")).toBeInTheDocument();
  });

  it("shows a play button for assistant messages when onPlayMessage is provided, calling it with the content", async () => {
    const onPlayMessage = vi.fn();
    render(
      <TranscriptDrawer
        open
        messages={[makeMessage({ id: "m2", role: "assistant", content: "Answer text" })]}
        steps={[]}
        stepsByMsgId={{}}
        isStreaming={false}
        onClose={noop}
        onSendText={noop}
        onPlayMessage={onPlayMessage}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Read message aloud" }));
    expect(onPlayMessage).toHaveBeenCalledWith("Answer text");
  });

  it("does not show a play button for user messages", () => {
    render(
      <TranscriptDrawer
        open
        messages={[makeMessage({ role: "user", content: "Hi" })]}
        steps={[]}
        stepsByMsgId={{}}
        isStreaming={false}
        onClose={noop}
        onSendText={noop}
        onPlayMessage={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Read message aloud" })).not.toBeInTheDocument();
  });

  it("shows the reasoning steps block for an assistant message with recorded steps", () => {
    render(
      <TranscriptDrawer
        open
        messages={[makeMessage({ id: "m2", role: "assistant", content: "Answer" })]}
        steps={[]}
        stepsByMsgId={{ m2: [makeStep({ step_name: "Retrieve market data" })] }}
        isStreaming={false}
        onClose={noop}
        onSendText={noop}
      />
    );
    expect(screen.getByText("1 reasoning step")).toBeInTheDocument();
    expect(screen.getByText("Retrieve market data")).toBeInTheDocument();
  });

  it("shows a thinking spinner after the last user message when streaming with no steps yet", () => {
    render(
      <TranscriptDrawer
        open
        messages={[makeMessage({ role: "user", content: "Hi" })]}
        steps={[]}
        stepsByMsgId={{}}
        isStreaming={true}
        onClose={noop}
        onSendText={noop}
      />
    );
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
  });

  it("shows the live steps block once steps start arriving while streaming", () => {
    render(
      <TranscriptDrawer
        open
        messages={[makeMessage({ role: "user", content: "Hi" })]}
        steps={[makeStep({ step_name: "Retrieve" })]}
        stepsByMsgId={{}}
        isStreaming={true}
        onClose={noop}
        onSendText={noop}
      />
    );
    expect(screen.getByText(/Reasoning… \(1 step\)/)).toBeInTheDocument();
  });

  it("shows a model icon per step, with a tooltip naming the model that step used", async () => {
    render(
      <TranscriptDrawer
        open
        messages={[makeMessage({ role: "user", content: "Hi" })]}
        steps={[
          makeStep({ step_id: "a", step_name: "Retrieve", model: "claude-sonnet-5" }),
          makeStep({ step_id: "b", step_name: "Analyse", model: "gpt-5.6-terra" }),
        ]}
        stepsByMsgId={{}}
        isStreaming={true}
        onClose={noop}
        onSendText={noop}
      />
    );
    const icons = screen.getAllByTestId("PsychologyAltOutlinedIcon");
    expect(icons).toHaveLength(2);
    await userEvent.hover(icons[1]);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Model: gpt-5.6-terra");
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <TranscriptDrawer open messages={[]} steps={[]} stepsByMsgId={{}} isStreaming={false} onClose={onClose} onSendText={noop} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Close transcript drawer" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  describe("message input", () => {
    it("Send is disabled when the input is empty", () => {
      render(
        <TranscriptDrawer open messages={[]} steps={[]} stepsByMsgId={{}} isStreaming={false} onClose={noop} onSendText={noop} />
      );
      expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    });

    it("typing and clicking Send submits the trimmed text and clears the input", async () => {
      const onSendText = vi.fn();
      render(
        <TranscriptDrawer open messages={[]} steps={[]} stepsByMsgId={{}} isStreaming={false} onClose={noop} onSendText={onSendText} />
      );
      const input = screen.getByLabelText("Type a message");
      await userEvent.type(input, "  Hello there  ");
      await userEvent.click(screen.getByRole("button", { name: "Send message" }));

      expect(onSendText).toHaveBeenCalledWith("Hello there");
      expect(input).toHaveValue("");
    });

    it("pressing Enter submits the message", async () => {
      const onSendText = vi.fn();
      render(
        <TranscriptDrawer open messages={[]} steps={[]} stepsByMsgId={{}} isStreaming={false} onClose={noop} onSendText={onSendText} />
      );
      await userEvent.type(screen.getByLabelText("Type a message"), "Hi{enter}");
      expect(onSendText).toHaveBeenCalledWith("Hi");
    });

    it("Shift+Enter does not submit (inserts a newline instead)", async () => {
      const onSendText = vi.fn();
      render(
        <TranscriptDrawer open messages={[]} steps={[]} stepsByMsgId={{}} isStreaming={false} onClose={noop} onSendText={onSendText} />
      );
      await userEvent.type(screen.getByLabelText("Type a message"), "Hi{shift>}{enter}{/shift}");
      expect(onSendText).not.toHaveBeenCalled();
    });

    it("the input and send button are disabled while streaming", () => {
      render(
        <TranscriptDrawer
          open
          messages={[]}
          steps={[]}
          stepsByMsgId={{}}
          isStreaming={true}
          onClose={noop}
          onSendText={noop}
        />
      );
      expect(screen.getByLabelText("Type a message")).toBeDisabled();
    });
  });
});
