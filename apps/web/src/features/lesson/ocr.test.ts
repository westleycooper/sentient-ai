import { describe, expect, it, vi } from "vitest";
import { matchesAnswer, recognizeText } from "./ocr";

vi.mock("tesseract.js", () => ({
  recognize: vi.fn().mockResolvedValue({ data: { text: "WHALE\n" } }),
}));

describe("matchesAnswer", () => {
  it("matches case-insensitively", () => {
    expect(matchesAnswer("whale", "WHALE")).toBe(true);
  });

  it("ignores whitespace and punctuation", () => {
    expect(matchesAnswer("W H A L E.", "whale")).toBe(true);
  });

  it("matches when the recognized text contains extra noise around the answer", () => {
    expect(matchesAnswer("  whale\n", "whale")).toBe(true);
  });

  it("does not match a different word", () => {
    expect(matchesAnswer("snail", "whale")).toBe(false);
  });

  it("does not match against an empty expected answer", () => {
    expect(matchesAnswer("whale", "")).toBe(false);
  });
});

describe("recognizeText", () => {
  it("delegates to tesseract.js and returns the recognized text", async () => {
    const canvas = document.createElement("canvas");
    const text = await recognizeText(canvas);
    expect(text).toBe("WHALE\n");
  });
});
