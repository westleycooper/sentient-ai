/**
 * On-device OCR for Lesson visual verification. Runs entirely in-browser via
 * Tesseract.js (WASM) — no captured frame is ever sent to a server. Matching
 * is a simple case/whitespace/punctuation-insensitive exact comparison, not
 * fuzzy/edit-distance tolerant (v1 scope).
 */
import { recognize } from "tesseract.js";

export async function recognizeText(canvas: HTMLCanvasElement): Promise<string> {
  const { data } = await recognize(canvas, "eng");
  return data.text;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function matchesAnswer(recognized: string, expected: string): boolean {
  const normalizedRecognized = normalize(recognized);
  const normalizedExpected = normalize(expected);
  return normalizedExpected.length > 0 && normalizedRecognized.includes(normalizedExpected);
}
