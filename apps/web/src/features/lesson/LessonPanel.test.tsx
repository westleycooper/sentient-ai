import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonPanel } from "./LessonPanel";
import type { LessonConfig } from "../../api/hooks";

const mockStart = vi.fn().mockResolvedValue(undefined);
const mockStop = vi.fn();
const mockCaptureFrame = vi.fn();
let cameraState: "idle" | "active" | "error" = "active";

vi.mock("./useCameraCapture", () => ({
  useCameraCapture: () => ({
    state: cameraState,
    videoRef: { current: null },
    start: mockStart,
    stop: mockStop,
    captureFrame: mockCaptureFrame,
  }),
}));

vi.mock("./ocr", () => ({
  recognizeText: vi.fn(),
  matchesAnswer: vi.fn(),
}));

import { matchesAnswer, recognizeText } from "./ocr";

const QUESTIONS: LessonConfig["questions"] = [
  { id: "q1", title: "Whale", question: "Spell: whale", answer: "whale", image_url: null },
  { id: "q2", title: "Cat", question: "Spell: cat", answer: "cat", image_url: "https://example.com/cat.png" },
];

describe("LessonPanel", () => {
  beforeEach(() => {
    cameraState = "active";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows a close-only empty state when there are no questions", () => {
    const onFinish = vi.fn();
    render(<LessonPanel lesson={{ enabled: true, visual_verify: true, questions: [] }} onFinish={onFinish} />);
    expect(screen.getByText(/no questions configured/i)).toBeInTheDocument();
  });

  it("shows progress and the first question's title/prompt", () => {
    render(<LessonPanel lesson={{ enabled: true, visual_verify: false, questions: QUESTIONS }} onFinish={vi.fn()} />);
    expect(screen.getByText("Question 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Whale")).toBeInTheDocument();
    expect(screen.getByText("Spell: whale")).toBeInTheDocument();
  });

  it("flashcard mode: reveal then self-report advances to the next question", async () => {
    render(<LessonPanel lesson={{ enabled: true, visual_verify: false, questions: QUESTIONS }} onFinish={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
    expect(screen.getByText("whale")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "I got it right" }));
    expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();
  });

  it("flashcard mode: finishing the last question shows the score summary", async () => {
    const onFinish = vi.fn();
    render(<LessonPanel lesson={{ enabled: true, visual_verify: false, questions: QUESTIONS }} onFinish={onFinish} />);

    await userEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
    await userEvent.click(screen.getByRole("button", { name: "I got it right" }));
    await userEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
    await userEvent.click(screen.getByRole("button", { name: "I got it wrong" }));

    expect(screen.getByText("Lesson complete: 1 / 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(onFinish).toHaveBeenCalledOnce();
  });

  it("visual_verify mode: starts the camera on mount", () => {
    render(<LessonPanel lesson={{ enabled: true, visual_verify: true, questions: QUESTIONS }} onFinish={vi.fn()} />);
    expect(mockStart).toHaveBeenCalled();
  });

  it("visual_verify mode: capturing a correct spelling shows success feedback and advances on Next", async () => {
    mockCaptureFrame.mockReturnValue(document.createElement("canvas"));
    vi.mocked(recognizeText).mockResolvedValue("whale");
    vi.mocked(matchesAnswer).mockReturnValue(true);

    await act(async () => {
      render(<LessonPanel lesson={{ enabled: true, visual_verify: true, questions: QUESTIONS }} onFinish={vi.fn()} />);
    });
    await userEvent.click(screen.getByRole("button", { name: "Check my spelling" }));

    expect(screen.getByText(/that's correct/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(screen.getByText("Question 2 of 2")).toBeInTheDocument();
  });

  it("visual_verify mode: capturing an incorrect spelling shows the expected answer", async () => {
    mockCaptureFrame.mockReturnValue(document.createElement("canvas"));
    vi.mocked(recognizeText).mockResolvedValue("wale");
    vi.mocked(matchesAnswer).mockReturnValue(false);

    await act(async () => {
      render(<LessonPanel lesson={{ enabled: true, visual_verify: true, questions: QUESTIONS }} onFinish={vi.fn()} />);
    });
    await userEvent.click(screen.getByRole("button", { name: "Check my spelling" }));

    expect(screen.getByText(/the answer is "whale"/i)).toBeInTheDocument();
  });

  it("visual_verify mode: the capture button is disabled until the camera is active", () => {
    cameraState = "idle";
    render(<LessonPanel lesson={{ enabled: true, visual_verify: true, questions: QUESTIONS }} onFinish={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Check my spelling" })).toBeDisabled();
  });

  it("visual_verify mode: shows a warning alert when the camera errors", () => {
    cameraState = "error";
    render(<LessonPanel lesson={{ enabled: true, visual_verify: true, questions: QUESTIONS }} onFinish={vi.fn()} />);
    expect(screen.getByText(/camera access was denied/i)).toBeInTheDocument();
  });
});
