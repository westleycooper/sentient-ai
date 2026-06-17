/**
 * Sound-wave visualisation. ISOLATED feature (CLAUDE.md §6).
 * Stable prop contract — callers unchanged when swapped for the 3D AI head.
 *
 * kind="wave"   — classic 2D oscilloscope line with hill-shaped opacity fade
 * kind="wave3d" — Three.js WebGL: N_ROWS horizontal waveform rows stacked
 *                 along the Z axis (waterfall) with depth fog, vertex colours,
 *                 and exponential fade to background
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";

export type WaveformKind = "wave" | "wave3d";

export interface WaveformProps {
  amplitude: Float32Array;
  color?: string;
  peakColor?: string;
  active?: boolean;
  kind?: WaveformKind;
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// ── 3D constants ─────────────────────────────────────────────────────────────
const N_ROWS      = 20;   // rows kept in the waterfall
const N_COLS      = 128;  // samples per row (resampled from analyser buffer)
const Z_SPACING   = 0.55; // world-unit gap between rows
const TOTAL_DEPTH = N_ROWS * Z_SPACING;          // ~11 units
const SCROLL_SPEED = 0.07; // world units advanced per RAF (~4.2 u/s at 60 fps)
const X_HALF      = 7;    // half-width of the grid (units)
const AMP_SCALE   = 4.0;  // amplitude → vertical displacement scale
const BG          = 0x18151f;

export function Waveform({
  amplitude,
  color    = "#4f9cff",
  peakColor = "#c084fc",
  active   = true,
  kind     = "wave",
}: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ampRef       = useRef(amplitude);
  const activeRef    = useRef(active);
  const historyRef   = useRef<Float32Array[]>([]);

  ampRef.current    = amplitude;
  activeRef.current = active;

  useEffect(() => {
    historyRef.current = [];

    const container = containerRef.current!;
    while (container.firstChild) container.removeChild(container.firstChild);

    const c1 = hexToRgb(color);
    const c2 = hexToRgb(peakColor);
    let raf = 0;

    // ════════════════════════════════════════ THREE.JS 3D WAVE ══════════════
    if (kind === "wave3d") {
      const W = container.clientWidth  || 800;
      const H = container.clientHeight || 400;

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W, H);
      renderer.setClearColor(BG, 1);
      renderer.domElement.style.cssText = "display:block;width:100%;height:100%;";
      container.appendChild(renderer.domElement);

      // Scene — no fog; vertex colour fade handles depth
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(BG);

      // Camera — angled view from above and in front of the grid
      const camera = new THREE.PerspectiveCamera(52, W / H, 0.1, 60);
      camera.position.set(0, 7, 11);
      camera.lookAt(0, 0, -3);

      // ── Soft glow circle texture (built once on canvas, then handed to GPU) ──
      const texCanvas = document.createElement("canvas");
      texCanvas.width = texCanvas.height = 64;
      const tc = texCanvas.getContext("2d")!;
      const radGrad = tc.createRadialGradient(32, 32, 0, 32, 32, 32);
      radGrad.addColorStop(0,   "rgba(255,255,255,1)");
      radGrad.addColorStop(0.35,"rgba(255,255,255,0.8)");
      radGrad.addColorStop(1,   "rgba(255,255,255,0)");
      tc.fillStyle = radGrad;
      tc.fillRect(0, 0, 64, 64);
      const pointTex = new THREE.CanvasTexture(texCanvas);

      // ── Geometry: N_ROWS × N_COLS Points (one per dot, simpler than LineSegments) ──
      const nVerts    = N_ROWS * N_COLS;
      const positions = new Float32Array(nVerts * 3);
      const colors    = new Float32Array(nVerts * 3);

      const geo     = new THREE.BufferGeometry();
      const posAttr = new THREE.BufferAttribute(positions, 3);
      const colAttr = new THREE.BufferAttribute(colors, 3);
      geo.setAttribute("position", posAttr);
      geo.setAttribute("color",    colAttr);

      const mat = new THREE.PointsMaterial({
        vertexColors: true,
        size: 0.14,
        sizeAttenuation: true,   // closer dots appear larger — free depth cue
        map: pointTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending, // peaks bloom brighter
      });

      const dotCloud = new THREE.Points(geo, mat);
      scene.add(dotCloud);

      // Normalised colour helpers
      const c1n = { r: c1.r / 255, g: c1.g / 255, b: c1.b / 255 };
      const c2n = { r: c2.r / 255, g: c2.g / 255, b: c2.b / 255 };

      // ── Bake static x and z positions once; y starts at 0 ────────────────
      {
        let vi = 0;
        for (let row = 0; row < N_ROWS; row++) {
          const z = -row * Z_SPACING;
          for (let col = 0; col < N_COLS; col++) {
            positions[vi * 3]     = -X_HALF + (col / (N_COLS - 1)) * X_HALF * 2;
            positions[vi * 3 + 1] = 0;
            positions[vi * 3 + 2] = z;
            vi++;
          }
        }
        posAttr.needsUpdate = true;
      }

      // Pre-fill history with silence so idle dots are visible immediately
      const silence = new Float32Array(N_COLS);
      for (let i = 0; i < N_ROWS; i++) historyRef.current.push(new Float32Array(silence));

      // updateGeo — only y + colour per dot; called ~7 Hz on frame push
      const updateGeo = () => {
        const hist = historyRef.current;
        const L    = Math.min(hist.length, N_ROWS);
        let vi     = 0;

        for (let row = 0; row < L; row++) {
          const frame     = hist[row];
          const srcLen    = frame.length || N_COLS;
          const dimFactor = Math.max(0, 1 - (row * Z_SPACING) / TOTAL_DEPTH);

          for (let col = 0; col < N_COLS; col++) {
            const si = Math.min(srcLen - 1, Math.floor((col / (N_COLS - 1)) * (srcLen - 1)));
            const a  = frame[si] || 0;

            // Hill brightness: full at centre column, 30 % at edges
            const h = 1 - 0.70 * (Math.abs(col / (N_COLS - 1) - 0.5) * 2) ** 2;

            positions[vi * 3 + 1] = a * AMP_SCALE;

            const t = Math.min(1, Math.abs(a) * 4.5);
            const f = dimFactor * h;
            colors[vi * 3]     = (c1n.r + (c2n.r - c1n.r) * t) * f;
            colors[vi * 3 + 1] = (c1n.g + (c2n.g - c1n.g) * t) * f;
            colors[vi * 3 + 2] = (c1n.b + (c2n.b - c1n.b) * t) * f;
            vi++;
          }
        }

        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
      };

      updateGeo(); // initial draw with silence

      let scrollOffset = 0;

      const render3D = () => {
        scrollOffset += SCROLL_SPEED;

        if (scrollOffset >= Z_SPACING) {
          scrollOffset -= Z_SPACING;
          const frame = new Float32Array(ampRef.current);
          historyRef.current.unshift(frame);
          if (historyRef.current.length > N_ROWS) historyRef.current.pop();
          updateGeo(); // ~7 Hz — heavy work stays off the 60 Hz path
        }

        dotCloud.position.z = -scrollOffset; // one float write per frame
        renderer.render(scene, camera);
        raf = requestAnimationFrame(render3D);
      };
      render3D();

      const ro = new ResizeObserver(() => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      });
      ro.observe(container);

      return () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        geo.dispose();
        mat.dispose();
        pointTex.dispose();
        renderer.dispose();
      };
    }

    // ════════════════════════════════════════════ 2D WAVE ══════════════════
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%;";
    container.appendChild(canvas);
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = (container.clientWidth  || canvas.offsetWidth)  * dpr;
      canvas.height = (container.clientHeight || canvas.offsetHeight) * dpr;
    };
    resize();

    const renderWave = () => {
      const { width, height } = canvas;
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, width, height);

      const amp = ampRef.current;
      const N   = amp.length || 256;
      const cy  = height / 2;

      ctx.lineWidth  = 3.5 * dpr;
      ctx.lineCap    = "round";
      ctx.lineJoin   = "round";

      if (!activeRef.current) {
        // Idle: hill-shaped gradient flat line
        const grad = ctx.createLinearGradient(0, 0, width, 0);
        grad.addColorStop(0,   `rgba(${c1.r},${c1.g},${c1.b},0.2)`);
        grad.addColorStop(0.5, `rgba(${c1.r},${c1.g},${c1.b},1)`);
        grad.addColorStop(1,   `rgba(${c1.r},${c1.g},${c1.b},0.2)`);
        ctx.beginPath();
        ctx.strokeStyle = grad;
        ctx.moveTo(0, cy);
        ctx.lineTo(width, cy);
        ctx.stroke();
        raf = requestAnimationFrame(renderWave);
        return;
      }

      for (let i = 1; i < N; i++) {
        const x0 = ((i - 1) / (N - 1)) * width;
        const x1 = (i     / (N - 1)) * width;
        const a0 = amp[i - 1];
        const a1 = amp[i];
        const y0 = cy - a0 * cy * 0.82;
        const y1 = cy - a1 * cy * 0.82;

        // Hill opacity: 1.0 at centre, 0.2 at edges
        const pos   = (i - 0.5) / (N - 1);
        const d     = Math.abs(pos - 0.5) * 2;
        const alpha = 1.0 - 0.8 * d * d;

        const t = Math.min(1, Math.abs(a1) * 3.0);
        const r = Math.round(c1.r + (c2.r - c1.r) * t);
        const g = Math.round(c1.g + (c2.g - c1.g) * t);
        const b = Math.round(c1.b + (c2.b - c1.b) * t);

        ctx.globalAlpha  = alpha;
        ctx.beginPath();
        ctx.strokeStyle  = `rgb(${r},${g},${b})`;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(renderWave);
    };
    renderWave();

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [color, peakColor, kind]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative" }}
      aria-hidden
    />
  );
}
