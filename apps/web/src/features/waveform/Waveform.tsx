/**
 * Sound-wave visualisation. ISOLATED feature (CLAUDE.md §6).
 * Stable prop contract — callers unchanged when swapped for the 3D AI head.
 *
 * kind="wave"       — classic 2D oscilloscope line with hill-shaped opacity fade
 * kind="wave3d"     — Three.js WebGL: dot-cloud waterfall along the Z axis
 * kind="wave3dgrid" — Three.js WebGL: polygon terrain mesh where amplitude
 *                     raises vertices, with additive wireframe overlay
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";

export type WaveformKind = "wave" | "wave3d" | "wave3dgrid";

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

// ── wave3d (dot waterfall) constants ─────────────────────────────────────────
const N_ROWS      = 20;
const N_COLS      = 64;
const Z_SPACING   = 1.10;
const TOTAL_DEPTH = N_ROWS * Z_SPACING;
const SCROLL_SPEED = 0.105;
const X_HALF      = 14;
const AMP_SCALE   = 4.0;
const BG          = 0x0e1013;

// ── wave3dgrid (static square-cell mesh) constants ───────────────────────────
const G_X      = 28;    // vertex columns across X  (~half original cell count)
const G_Z      = 20;    // vertex rows along Z
const G_XHALF  = 8;     // half-width (world units) — cell width = 16/27 ≈ 0.593
const G_ZSPACE = 0.60;  // row spacing ≈ cell width → square cells
const G_AMP    = 6.75;  // amplitude → Y displacement

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
      // Size the container as a perfect square using parent dimensions
      const parent = container.parentElement!;
      const squarePx = () => Math.round(Math.min(parent.clientWidth || 400, parent.clientHeight || 400) * 0.72);
      const S = squarePx();
      container.style.width  = S + "px";
      container.style.height = S + "px";

      // Renderer — transparent background so only dots are drawn
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(S, S);
      renderer.setClearColor(0, 0);
      renderer.domElement.style.cssText = "display:block;width:100%;height:100%;position:absolute;top:0;left:0;";
      container.appendChild(renderer.domElement);

      // Gradient overlay — fades the front rows into the background colour
      const gradEl = document.createElement("div");
      gradEl.style.cssText = "position:absolute;bottom:10%;left:0;right:0;height:22%;background:linear-gradient(to top,#0e1013 0%,transparent 100%);pointer-events:none;z-index:1;";
      container.appendChild(gradEl);

      // Scene — no background; canvas corners are transparent
      const scene = new THREE.Scene();

      // Camera — square aspect (1:1); angled view from above and in front
      const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 60);
      camera.position.set(0, 7, 11);
      camera.lookAt(0, 5, 3);

      // ── Geometry: N_ROWS × N_COLS Points (one per dot, simpler than LineSegments) ──
      const nVerts    = N_ROWS * N_COLS;
      const positions = new Float32Array(nVerts * 3);
      const colors    = new Float32Array(nVerts * 3);

      const geo     = new THREE.BufferGeometry();
      const posAttr = new THREE.BufferAttribute(positions, 3);
      const colAttr = new THREE.BufferAttribute(colors, 3);
      geo.setAttribute("position", posAttr);
      geo.setAttribute("color",    colAttr);

      // Sharp 4×4 square pixel texture — NearestFilter prevents circular anti-aliasing
      const pxCanvas = document.createElement("canvas");
      pxCanvas.width = pxCanvas.height = 4;
      const pxCtx = pxCanvas.getContext("2d")!;
      pxCtx.fillStyle = "white";
      pxCtx.fillRect(0, 0, 4, 4);
      const squareTex = new THREE.CanvasTexture(pxCanvas);
      squareTex.magFilter = THREE.NearestFilter;
      squareTex.minFilter = THREE.NearestFilter;
      squareTex.generateMipmaps = false;

      const mat = new THREE.PointsMaterial({
        vertexColors: true,
        size: 0.28,
        sizeAttenuation: true,
        map: squareTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
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
        const s = squarePx();
        if (!s) return;
        container.style.width  = s + "px";
        container.style.height = s + "px";
        renderer.setSize(s, s);
        camera.aspect = 1;
        camera.updateProjectionMatrix();
      });
      ro.observe(parent);

      return () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        geo.dispose();
        mat.dispose();
        squareTex.dispose();
        renderer.dispose();
      };
    }

    // ════════════════════════════════════ THREE.JS 3D GRID TERRAIN ══════════
    if (kind === "wave3dgrid") {
      const W = container.clientWidth  || 800;
      const H = container.clientHeight || 400;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W, H);
      renderer.setClearColor(BG, 1);
      renderer.domElement.style.cssText = "display:block;width:100%;height:100%;";
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(BG);

      const camera = new THREE.PerspectiveCamera(52, W / H, 0.1, 80);
      camera.position.set(0, 7, 12);
      camera.lookAt(0, 0, -3);

      // ── Shared vertex buffer ──────────────────────────────────────────────
      const nVerts  = G_X * G_Z;
      const positions = new Float32Array(nVerts * 3);
      const colors    = new Float32Array(nVerts * 3);

      // ── Edge index buffer: horizontal + vertical lines only (no diagonals) ─
      const nHEdges    = G_Z * (G_X - 1);
      const nVEdges    = G_X * (G_Z - 1);
      const lineIdx    = new Uint32Array((nHEdges + nVEdges) * 2);
      {
        let ei = 0;
        for (let z = 0; z < G_Z; z++)
          for (let x = 0; x < G_X - 1; x++) {
            lineIdx[ei++] = z * G_X + x;
            lineIdx[ei++] = z * G_X + x + 1;
          }
        for (let z = 0; z < G_Z - 1; z++)
          for (let x = 0; x < G_X; x++) {
            lineIdx[ei++] =  z      * G_X + x;
            lineIdx[ei++] = (z + 1) * G_X + x;
          }
      }

      const geo     = new THREE.BufferGeometry();
      const posAttr = new THREE.BufferAttribute(positions, 3);
      const colAttr = new THREE.BufferAttribute(colors, 3);
      geo.setAttribute("position", posAttr);
      geo.setAttribute("color",    colAttr);
      geo.setIndex(new THREE.BufferAttribute(lineIdx, 1));

      // Bake X and Z once
      {
        let vi = 0;
        for (let z = 0; z < G_Z; z++)
          for (let x = 0; x < G_X; x++) {
            positions[vi * 3]     = -G_XHALF + (x / (G_X - 1)) * G_XHALF * 2;
            positions[vi * 3 + 1] = 0;
            positions[vi * 3 + 2] = -z * G_ZSPACE;
            vi++;
          }
        posAttr.needsUpdate = true;
      }

      const c1n = { r: c1.r / 255, g: c1.g / 255, b: c1.b / 255 };
      const c2n = { r: c2.r / 255, g: c2.g / 255, b: c2.b / 255 };

      const lineMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      scene.add(new THREE.LineSegments(geo, lineMat));

      const renderGrid = () => {
        const amp    = ampRef.current;
        const N      = amp.length || 256;
        const active = activeRef.current;
        let vi       = 0;

        for (let z = 0; z < G_Z; z++) {
          // cosine envelope along Z: 1 at centre row, 0 at front/back edges
          const dz = Math.abs(z / (G_Z - 1) - 0.5) * 2;
          const fz = 0.5 * (1 + Math.cos(Math.PI * dz));
          // depth dim: front 100%, back 35%
          const dim = 1 - (z / (G_Z - 1)) * 0.65;

          for (let x = 0; x < G_X; x++) {
            // cosine envelope along X: 1 at centre column, 0 at left/right edges
            const dx  = Math.abs(x / (G_X - 1) - 0.5) * 2;
            const fx  = 0.5 * (1 + Math.cos(Math.PI * dx));
            const env = fx * fz; // 2D dome: 1 at grid centre, 0 at all four edges

            const si = Math.min(N - 1, Math.floor((x / (G_X - 1)) * (N - 1)));
            const a  = active ? (amp[si] || 0) : 0;
            const t  = Math.min(1, Math.abs(a) * 3.5);

            positions[vi * 3 + 1] = a * G_AMP * env;

            // peak brightness scales with amplitude * dome; floor glow at rest
            const f = dim * (t * env + 0.15 * env);
            colors[vi * 3]     = (c1n.r + (c2n.r - c1n.r) * t) * f;
            colors[vi * 3 + 1] = (c1n.g + (c2n.g - c1n.g) * t) * f;
            colors[vi * 3 + 2] = (c1n.b + (c2n.b - c1n.b) * t) * f;
            vi++;
          }
        }

        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(renderGrid);
      };
      renderGrid();

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
        lineMat.dispose();
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
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: kind === "wave3d" ? "#0e1013" : undefined,
      }}
      aria-hidden
    >
      <div
        ref={containerRef}
        style={{
          ...(kind === "wave3d" ? {
            flexShrink: 0,
            borderRadius: "50%",
            overflow: "hidden",
            border: "1px solid rgba(0,180,200,0.25)",
            position: "relative",
          } : {
            width: "100%",
            height: "100%",
            position: "relative",
          }),
        }}
      />
    </div>
  );
}
