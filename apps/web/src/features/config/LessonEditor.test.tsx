import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LessonEditor } from "./LessonEditor";
import type { LessonConfig, LessonQuestion } from "../../api/hooks";

const BASE: LessonConfig = { enabled: false, visual_verify: true, questions: [] };

describe("LessonEditor", () => {
  it("shows an empty state with an 'Add first question' button when there are no questions", () => {
    render(<LessonEditor value={BASE} onChange={vi.fn()} />);
    expect(screen.getByText("No questions yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add first question" })).toBeInTheDocument();
  });

  it("adds a new blank question via the empty-state button", async () => {
    const onChange = vi.fn();
    render(<LessonEditor value={BASE} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Add first question" }));

    expect(onChange).toHaveBeenCalledOnce();
    const added = onChange.mock.calls[0][0] as LessonConfig;
    expect(added.questions).toHaveLength(1);
    expect(added.questions[0].title).toBe("");
    expect(added.questions[0].image_url).toBeNull();
  });

  it("adds a new question via the header 'Add question' button when questions already exist", async () => {
    const question: LessonQuestion = { id: "q1", title: "Whale", question: "Spell: whale", answer: "whale", image_url: null };
    const value: LessonConfig = { ...BASE, questions: [question] };
    const onChange = vi.fn();
    render(<LessonEditor value={value} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Add question" }));

    const result = (onChange.mock.calls[0][0] as LessonConfig).questions;
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(question);
  });

  it("toggling Enable Lesson and Visual verify updates the config", async () => {
    const onChange = vi.fn();
    render(<LessonEditor value={BASE} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("Enable Lesson"));
    expect(onChange).toHaveBeenLastCalledWith({ ...BASE, enabled: true });

    await userEvent.click(screen.getByLabelText("Visual verify"));
    expect(onChange).toHaveBeenLastCalledWith({ ...BASE, visual_verify: false });
  });

  it("renders each question's fields", () => {
    const question: LessonQuestion = {
      id: "q1", title: "Whale", question: "Spell: whale", answer: "whale",
      image_url: "https://example.com/whale.png",
    };
    render(<LessonEditor value={{ ...BASE, questions: [question] }} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Question 1 title")).toHaveValue("Whale");
    expect(screen.getByLabelText("Question 1 answer")).toHaveValue("whale");
    expect(screen.getByLabelText("Question 1 prompt")).toHaveValue("Spell: whale");
    expect(screen.getByLabelText("Question 1 image URL")).toHaveValue("https://example.com/whale.png");
  });

  it("editing a field updates only that question", async () => {
    const question: LessonQuestion = { id: "q1", title: "", question: "", answer: "", image_url: null };
    const onChange = vi.fn();
    render(<LessonEditor value={{ ...BASE, questions: [question] }} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Question 1 title"), "X");

    const lastCall = onChange.mock.calls.at(-1)?.[0] as LessonConfig;
    expect(lastCall.questions[0].title).toBe("X");
    expect(lastCall.questions[0].answer).toBe("");
  });

  it("removing a question drops only that entry", async () => {
    const q1: LessonQuestion = { id: "q1", title: "First", question: "", answer: "", image_url: null };
    const q2: LessonQuestion = { id: "q2", title: "Second", question: "", answer: "", image_url: null };
    const onChange = vi.fn();
    render(<LessonEditor value={{ ...BASE, questions: [q1, q2] }} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("Remove question 1"));

    expect(onChange).toHaveBeenCalledWith({ ...BASE, questions: [q2] });
  });
});
