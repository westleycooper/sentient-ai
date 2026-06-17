/**
 * Canvas 2D sound-wave visualisation. ISOLATED feature (CLAUDE.md §6).
 * Stable prop contract — callers unchanged when swapped for the 3D AI head.
 *
 * Gradient: each segment is coloured by its amplitude — quiet segments use
 * `color`, loud peaks shift toward `peakColor`. Since audio is near-silent at
 * the edges, the line naturally starts and ends with the same base colour.
 */
import { useEffect, useRef } from "react";

export interface WaveformProps {
  amplitude: Float32Array;
  color?: string;
  peakColor?: string;
  active?: boolean;
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function Waveform({
  amplitude,
  color = "#4f9cff",
  peakColor = "#c084fc",
  active = true,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ampRef = useRef(amplitude);
  const activeRef = useRef(active);
  ampRef.current = amplitude;
  activeRef.current = active;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const c1 = hexToRgb(color);
    const c2 = hexToRgb(peakColor);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };
    resize();

    let raf = 0;

    const render = () => {
      const { width, height } = canvas;
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, width, height);

      const amp = ampRef.current;
      const N = amp.length || 256;
      const cy = height / 2;

      if (!activeRef.current) {
        // Idle flat line — same thickness as active waveform
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3.5 * dpr;
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.25;
        ctx.moveTo(0, cy);
        ctx.lineTo(width, cy);
        ctx.stroke();
        ctx.globalAlpha = 1;
        raf = requestAnimationFrame(render);
        return;
      }

      ctx.lineWidth = 3.5 * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let i = 1; i < N; i++) {
        const x0 = ((i - 1) / (N - 1)) * width;
        const x1 = (i / (N - 1)) * width;
        const a0 = amp[i - 1];
        const a1 = amp[i];
        const y0 = cy - a0 * cy * 0.82;
        const y1 = cy - a1 * cy * 0.82;

        // Colour driven by amplitude magnitude: 0 = base, 1 = peak
        const t = Math.min(1, Math.abs(a1) * 3.0);
        const r = Math.round(c1.r + (c2.r - c1.r) * t);
        const g = Math.round(c1.g + (c2.g - c1.g) * t);
        const b = Math.round(c1.b + (c2.b - c1.b) * t);

        ctx.beginPath();
        ctx.strokeStyle = `rgb(${r},${g},${b})`;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }

      raf = requestAnimationFrame(render);
    };

    render();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [color, peakColor]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
      aria-hidden
    />
  );
}
