/**
 * Pragmatic scope (agreed): jsdom has no canvas 2D or WebGL implementation
 * at all (canvas.getContext() returns undefined here — verified directly),
 * so every kind's render effect would throw on a real mount. We cover:
 *   - the pure colour/luminance math (hexToRgb/bgLuminance/hexToInt), and
 *   - mount/unmount for the two 2D-canvas kinds (wave, wavecircle) behind a
 *     minimal fake CanvasRenderingContext2D — enough to prove the component
 *     doesn't crash and respects its prop contract, not pixel-perfect output.
 * wave3d/wave3dgrid/wavehead (real Three.js WebGLRenderer) are out of scope
 * here — mocking the WebGL pipeline for uncertain value isn't worth it; this
 * file will sit well under the 80% coverage line by design.
 */
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bgLuminance, hexToInt, hexToRgb, Waveform } from "./Waveform";

describe("hexToRgb", () => {
  it("converts a hex colour to its r/g/b components", () => {
    expect(hexToRgb("#00b4c8")).toEqual({ r: 0, g: 180, b: 200 });
  });

  it("handles hex without a leading #", () => {
    expect(hexToRgb("ff0000")).toEqual({ r: 255, g: 0, b: 0 });
  });
});

describe("hexToInt", () => {
  it("converts a hex colour to its integer value", () => {
    expect(hexToInt("#ffffff")).toBe(0xffffff);
    expect(hexToInt("#000000")).toBe(0);
  });
});

describe("bgLuminance", () => {
  it("returns a high value for white", () => {
    expect(bgLuminance("#ffffff")).toBeCloseTo(255);
  });

  it("returns 0 for black", () => {
    expect(bgLuminance("#000000")).toBe(0);
  });

  it("classifies a typical dark theme background as dark (< 128)", () => {
    expect(bgLuminance("#0e1013")).toBeLessThan(128);
  });

  it("classifies a typical light theme background as light (>= 128)", () => {
    expect(bgLuminance("#f5f7fa")).toBeGreaterThanOrEqual(128);
  });
});

class FakeCanvasRenderingContext2D {
  clearRect = vi.fn();
  beginPath = vi.fn();
  moveTo = vi.fn();
  lineTo = vi.fn();
  stroke = vi.fn();
  closePath = vi.fn();
  arc = vi.fn();
  createLinearGradient = vi.fn(() => ({ addColorStop: vi.fn() }));
  strokeStyle = "";
  lineWidth = 0;
  lineCap = "";
  lineJoin = "";
  globalAlpha = 1;
}

describe("Waveform (2D canvas kinds only — see file header)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      }
    );
    HTMLCanvasElement.prototype.getContext = vi
      .fn()
      .mockReturnValue(new FakeCanvasRenderingContext2D()) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("mounts and unmounts the line-wave kind without throwing", () => {
    const { unmount } = render(<Waveform amplitude={new Float32Array(256)} kind="wave" />);
    expect(() => unmount()).not.toThrow();
  });

  it("mounts and unmounts the circle-wave kind without throwing", () => {
    const { unmount } = render(<Waveform amplitude={new Float32Array(256)} kind="wavecircle" />);
    expect(() => unmount()).not.toThrow();
  });

  it("is decorative — the outer wrapper is aria-hidden", () => {
    const { container } = render(<Waveform amplitude={new Float32Array(256)} kind="wave" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden");
  });

  it("re-running the render effect on a kind change doesn't throw", () => {
    const { rerender } = render(<Waveform amplitude={new Float32Array(256)} kind="wave" />);
    expect(() => rerender(<Waveform amplitude={new Float32Array(256)} kind="wavecircle" />)).not.toThrow();
  });
});
