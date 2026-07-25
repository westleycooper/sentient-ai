/**
 * Sound-wave visualisation. ISOLATED feature (CLAUDE.md §6).
 * Stable prop contract — callers unchanged when swapped for the 3D AI head.
 *
 * kind="wave"       — classic 2D oscilloscope line with hill-shaped opacity fade
 * kind="wavecircle" — 2D polar waveform: concentric ring history, newest outermost
 * kind="wave3d"     — Three.js WebGL: dot-cloud waterfall along the Z axis
 * kind="wave3dgrid" — Three.js WebGL: polygon terrain mesh where amplitude
 *                     raises vertices, with additive wireframe overlay
 * kind="wavehead"    — Three.js WebGL: face-on low-poly cel-shaded head built
 *                     from silhouette/depth profile curves (Dreamscape-poster
 *                     face, Virtua Fighter 1 faceting + painted features),
 *                     jaw opens with speech loudness via lips + black cavity
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";

export type WaveformKind = "wave" | "wavecircle" | "wave3d" | "wave3dgrid" | "wavehead";

export interface WaveformProps {
  amplitude: Float32Array;
  color?: string;
  peakColor?: string;
  /** Background colour for 3D views (and the outer div). Defaults to #0e1013. */
  bgColor?: string;
  active?: boolean;
  kind?: WaveformKind;
}

// Exported for unit testing — pure colour math with no canvas/WebGL dependency,
// unlike the rest of this file (see Waveform.test.tsx for why that's tested
// separately and pragmatically: jsdom has no canvas/WebGL implementation).
export function hexToRgb(hex: string) {
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
const DEFAULT_BG  = "#0e1013";

/** Perceived luminance 0–255; < 128 → dark background. */
export function bgLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function hexToInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

// ── wave3dgrid (static square-cell mesh) constants ───────────────────────────
const G_X      = 28;    // vertex columns across X  (~half original cell count)
const G_Z      = 20;    // vertex rows along Z
const G_XHALF  = 8;     // half-width (world units) — cell width = 16/27 ≈ 0.593
const G_ZSPACE = 0.60;  // row spacing ≈ cell width → square cells
const G_AMP    = 6.75;  // amplitude → Y displacement

// ── wavehead (face-on low-poly cel-shaded head, Dreamscape poster × VF1) ─────
// The head is NOT a sphere with bumps: it's built from two piecewise-linear
// profile curves sampled per row (silhouette half-width and skull half-depth,
// crown→chin), with facial features added as centreline displacements. The
// piecewise-linear kinks are deliberate — they're what gives the angular,
// faceted Virtua Fighter 1 silhouette under flat shading.
const GH_X         = 40;   // vertex columns across the face width
const GH_Z         = 36;   // vertex rows from crown to under-chin
const GH_THETA_MAX = 1.35; // rad — horizontal wrap half-angle (past ±90° = sides turn away)
const GH_HEAD_TOP  = 4.2, GH_HEAD_BOT = -4.4; // world y at crown / chin tip

// Head silhouette half-width by v (crown→chin): rounded cranium, temples,
// widest at the cheekbones, tapering jaw, narrow rounded chin.
const WIDTH_PROFILE: [number, number][] = [
  [0.00, 1.30], [0.08, 2.50], [0.22, 3.25], [0.45, 3.50],
  [0.62, 3.05], [0.80, 2.35], [0.93, 1.55], [1.00, 0.85],
];
// Skull half-depth by v — the base forward projection the features sit on.
// Dips slightly across the eye band (sockets) and again below the mouth.
const DEPTH_PROFILE: [number, number][] = [
  [0.00, 1.50], [0.10, 2.60], [0.30, 3.15], [0.40, 3.20], [0.46, 2.95],
  [0.55, 3.00], [0.66, 2.90], [0.72, 2.80], [0.82, 2.75], [0.92, 2.85], [1.00, 1.80],
];

// Akira-style painted-face palette (VF1). Every region is a SOLID colour cell
// with a hard edge — colours are assigned per TRIANGLE (at its centroid), not
// blended per vertex, which is what gives the authentic texture-less VF1 look.
// Skin is a fixed warm tone; the hair takes a heavily-darkened version of the
// theme `color` prop (near-black with a tint) so the SME identity survives.
const SKIN_COLOR    = { r: 0.89, g: 0.66, b: 0.50 };
const HEADBAND_COLOR = { r: 0.93, g: 0.93, b: 0.94 }; // Akira's white headband
const BROW_COLOR    = { r: 0.08, g: 0.06, b: 0.05 };
const EYE_WHITE     = { r: 0.96, g: 0.96, b: 0.97 };
const PUPIL_COLOR   = { r: 0.10, g: 0.07, b: 0.06 };
const LIP_COLOR     = { r: 0.72, g: 0.42, b: 0.36 };
const CAVITY_COLOR  = { r: 0.02, g: 0.02, b: 0.02 }; // solid black mouth interior

// Hair: everything above the headband, plus side panels down past the temples,
// plus a zigzag spike displacement at the crown (alternate columns push up).
const BAND_V0 = 0.155, BAND_V1 = 0.235, BAND_EXTRUDE = 0.10; // white headband wrap
const HAIR_SIDE_V1 = 0.34, HAIR_SIDE_THETA = 1.08;           // side hair above the ears
const SPIKE_V_END = 0.12, SPIKE_AMP = 0.55;                  // crown spikes

// Facial features: v ∈ [0,1] crown→chin, theta in radians (0 = centreline).
// Eyes at the vertical midpoint of the head, per the classic proportion rule.
const BROW_V0 = 0.345, BROW_V1 = 0.425, BROW_AMP = 0.25, BROW_W = 0.75; // ridge (geometry)
// Painted brows: hard bars, slanted stern — inner ends sit LOWER (toward the
// nose) by BROW_TILT × how far inboard of the eye centre the sample is.
const BROWP_V0 = 0.385, BROWP_V1 = 0.43, BROWP_HW = 0.21, BROW_TILT = 0.22;

const EYE_THETA = 0.42;                                    // eye centres at ±this angle
const SOCKET_V0 = 0.42, SOCKET_V1 = 0.53, SOCKET_W = 0.20, SOCKET_DEPTH = 0.22;
const EYEW_V0 = 0.445, EYEW_V1 = 0.515, EYEW_HW = 0.155;   // narrow VF1 eye, hard rect
const PUPIL_V0 = 0.45, PUPIL_V1 = 0.51, PUPIL_HW = 0.05;   // dark centre cell

const CHEEK_V0 = 0.44, CHEEK_V1 = 0.60, CHEEK_THETA = 0.62, CHEEK_W = 0.25, CHEEK_AMP = 0.18;

const NOSE_V0 = 0.43, NOSE_V1 = 0.65;                      // bridge → tip
const NOSE_AMP_TOP = 0.30, NOSE_AMP_TIP = 1.10;
const NOSE_W_TOP = 0.10, NOSE_W_TIP = 0.20;
const NOSTRIL_V0 = 0.60, NOSTRIL_V1 = 0.67, NOSTRIL_THETA = 0.17, NOSTRIL_W = 0.06, NOSTRIL_AMP = 0.15;
const PHIL_V0 = 0.65, PHIL_V1 = 0.69, PHIL_W = 0.18, PHIL_DEPTH = 0.12; // philtrum dip

// Mouth: static upper lip / thin black cavity that stretches open / lower lip
// riding the jaw. The cavity stretching is the visible "mouth opening".
const MOUTH_THETA_W = 0.42;
const LIP_V0 = 0.685, LIP_V1 = 0.74, LIP_AMP = 0.30;
const CAVITY_V0 = 0.74, CAVITY_V1 = 0.77;
const LOWER_LIP_V0 = 0.77, LOWER_LIP_V1 = 0.82, LOWER_LIP_AMP = 0.26;

const CHIN_V0 = 0.87, CHIN_V1 = 0.97, CHIN_W = 0.30, CHIN_AMP = 0.28;

// Jaw: a real hinge ROTATION about an axis at ear level, not a translation —
// the chin swings down and back along an arc while points near the pivot
// barely move, which is what makes the movement read as anatomical. The
// whole lower face rotates (full width): the black cavity opens as a mouth
// where it's painted, and the flesh beyond the mouth corners stretches like
// cheeks. Inside the mouth the static→moving transition is one thin band
// (sharp opening edge); outside it's feathered wide (gradual cheek stretch).
const JAW_PIVOT_Y = -0.3, JAW_PIVOT_Z = 0.0;  // hinge axis (x-axis) at ear level
const JAW_MAX_ANGLE = 0.24;                   // rad — full-open rotation
const JAW_CHEEK_FEATHER = 0.12;               // v-feather of the hinge line outside the mouth
const JAW_GAIN   = 7.0;  // RMS amplitude → openness gain
const JAW_SMOOTH = 0.25; // per-frame low-pass factor (higher = snappier)

/** Smooth 0→1→0 bump over [v0, v1]; 0 outside the band. */
function bellV(v: number, v0: number, v1: number): number {
  if (v < v0 || v > v1) return 0;
  return Math.sin(Math.PI * ((v - v0) / (v1 - v0)));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Flat-top band over [lo, hi] with feathered (smoothstep) edges of width `feather`. */
function flatBand(x: number, lo: number, hi: number, feather: number): number {
  const rise = smoothstep(lo, lo + feather, x);
  const fall = 1 - smoothstep(hi - feather, hi, x);
  return Math.min(rise, fall);
}

/** Sample a piecewise-linear profile: pts = [[v, value], …] sorted by v. */
function sampleProfile(pts: [number, number][], v: number): number {
  if (v <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (v <= pts[i][0]) {
      const t = (v - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
      return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
    }
  }
  return pts[pts.length - 1][1];
}

export function Waveform({
  amplitude,
  color     = "#4f9cff",
  peakColor = "#c084fc",
  bgColor   = DEFAULT_BG,
  active    = true,
  kind      = "wave",
}: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ampRef       = useRef(amplitude);
  const activeRef    = useRef(active);
  const historyRef   = useRef<Float32Array[]>([]);
  const { r: _cr, g: _cg, b: _cb } = hexToRgb(color);
  const c1Rgb = `${_cr},${_cg},${_cb}`;

  ampRef.current    = amplitude;
  activeRef.current = active;

  useEffect(() => {
    historyRef.current = [];

    const container = containerRef.current!;
    while (container.firstChild) container.removeChild(container.firstChild);

    const c1 = hexToRgb(color);
    const c2 = hexToRgb(peakColor);
    const bg = bgColor || DEFAULT_BG;
    const bgInt = hexToInt(bg);
    const isDarkBg = bgLuminance(bg) < 128;
    // Fade target: dark bg uses black (additive blend adds 0) ; light bg uses the
    // bg colour (normal blend paints the bg colour = invisible against itself).
    const bgRaw = hexToRgb(bg);
    const bgN = isDarkBg
      ? { r: 0, g: 0, b: 0 }
      : { r: bgRaw.r / 255, g: bgRaw.g / 255, b: bgRaw.b / 255 };
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
      gradEl.style.cssText = `position:absolute;bottom:10%;left:0;right:0;height:22%;background:linear-gradient(to top,${bg} 0%,transparent 100%);pointer-events:none;z-index:1;`;
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
        blending: isDarkBg ? THREE.AdditiveBlending : THREE.NormalBlending,
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
          const rawDim    = Math.max(0, 1 - (row * Z_SPACING) / TOTAL_DEPTH);
          // On light bg keep a high floor so the dot cloud stays dark across all depths;
          // only the horizontal hill (h) provides the edge fade to bg colour.
          const dimFactor = isDarkBg ? rawDim : Math.max(0.7, rawDim);

          for (let col = 0; col < N_COLS; col++) {
            const si = Math.min(srcLen - 1, Math.floor((col / (N_COLS - 1)) * (srcLen - 1)));
            const a  = frame[si] || 0;

            // Hill brightness: full at centre column, 30 % at edges
            const h = 1 - 0.70 * (Math.abs(col / (N_COLS - 1) - 0.5) * 2) ** 2;

            positions[vi * 3 + 1] = a * AMP_SCALE;

            const t = Math.min(1, Math.abs(a) * 4.5);
            const f = dimFactor * h;
            // lerp from bg colour → primary colour: dim particles match bg = invisible
            const pr = c1n.r + (c2n.r - c1n.r) * t;
            const pg = c1n.g + (c2n.g - c1n.g) * t;
            const pb = c1n.b + (c2n.b - c1n.b) * t;
            colors[vi * 3]     = bgN.r + (pr - bgN.r) * f;
            colors[vi * 3 + 1] = bgN.g + (pg - bgN.g) * f;
            colors[vi * 3 + 2] = bgN.b + (pb - bgN.b) * f;
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
      renderer.setClearColor(bgInt, 1);
      renderer.domElement.style.cssText = "display:block;width:100%;height:100%;";
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(bgInt);

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
        blending: isDarkBg ? THREE.AdditiveBlending : THREE.NormalBlending,
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

            // peak brightness scales with amplitude * dome; floor glow at rest.
            // Dark bg: low floor (0.15) — subtle additive glow looks good.
            // Light bg: high floor (0.90) — grid shows dark purple at rest; only
            //   geometric edges (env→0) fade to white. Clamp to 1 so f never
            //   overshoots primary and produces inverted colours via the lerp.
            const floorGlow = isDarkBg ? 0.15 : 0.90;
            const f = isDarkBg
              ? dim * (t * env + floorGlow * env)
              : Math.min(1, dim * (t * env + floorGlow * env));
            // lerp from bg colour → primary colour so dim lines fade to invisible
            const pr = c1n.r + (c2n.r - c1n.r) * t;
            const pg = c1n.g + (c2n.g - c1n.g) * t;
            const pb = c1n.b + (c2n.b - c1n.b) * t;
            colors[vi * 3]     = bgN.r + (pr - bgN.r) * f;
            colors[vi * 3 + 1] = bgN.g + (pg - bgN.g) * f;
            colors[vi * 3 + 2] = bgN.b + (pb - bgN.b) * f;
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

    // ═══════════════════════════════ WAVEHEAD (face-on wireframe head) ══════
    if (kind === "wavehead") {
      const W = container.clientWidth  || 800;
      const H = container.clientHeight || 400;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W, H);
      renderer.setClearColor(bgInt, 1);
      renderer.domElement.style.cssText = "display:block;width:100%;height:100%;";
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(bgInt);

      // Face-on: looking straight down Z, no top-down tilt (unlike wave3d/wave3dgrid).
      const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 80);
      camera.position.set(0, 0, 13);
      camera.lookAt(0, 0, 0);

      // Single hard key light + ambient fill — flat/faceted Lambert shading
      // under one directional light is the classic early-3D "arcade fighter"
      // look (Virtua Fighter 1). Ambient is high enough that the painted
      // colours (eye whites, lips) stay readable on the shadowed side.
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
      keyLight.position.set(-5, 6, 9);
      scene.add(keyLight);
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));

      const c1n = { r: c1.r / 255, g: c1.g / 255, b: c1.b / 255 };
      // Hair: theme colour crushed nearly to black — reads as dark hair with a tint.
      const hairColor = { r: 0.05 + c1n.r * 0.22, g: 0.05 + c1n.g * 0.22, b: 0.05 + c1n.b * 0.22 };

      // ── Pass 1: sculpt the vertex grid (positions + jaw weights) ─────────
      const gridN  = GH_X * GH_Z;
      const gX = new Float32Array(gridN), gY = new Float32Array(gridN), gZ = new Float32Array(gridN);
      const gJaw = new Float32Array(gridN);
      const gV = new Float32Array(gridN), gTheta = new Float32Array(gridN);
      {
        let gi = 0;
        for (let row = 0; row < GH_Z; row++) {
          const v     = row / (GH_Z - 1);
          const halfW = sampleProfile(WIDTH_PROFILE, v);
          const halfD = sampleProfile(DEPTH_PROFILE, v);
          let   y     = GH_HEAD_TOP + (GH_HEAD_BOT - GH_HEAD_TOP) * v;

          for (let col = 0; col < GH_X; col++) {
            const u     = col / (GH_X - 1);
            const theta = (u - 0.5) * 2 * GH_THETA_MAX;

            // Elliptical cross-section per row: silhouette width from one
            // profile, forward depth from the other. The headband band gets a
            // slight radial extrude so it wraps proud of the head.
            const bandBump = 1 + BAND_EXTRUDE * flatBand(v, BAND_V0, BAND_V1, 0.02);
            const x = halfW * Math.sin(theta) * bandBump;
            let z = halfD * Math.cos(theta) * bandBump;

            // Crown spikes: alternate columns push straight up, fading out by
            // SPIKE_V_END — Akira's zigzag hair silhouette.
            if (v < SPIKE_V_END) {
              const spike = (col % 2 === 0 ? 1 : 0.15) * (1 - v / SPIKE_V_END);
              y += SPIKE_AMP * spike;
            }

            // Brow ridge: forward shelf across the face above the eyes.
            z += BROW_AMP * bellV(v, BROW_V0, BROW_V1) * Math.exp(-((theta / BROW_W) ** 2));

            // Eye sockets: recesses at ±EYE_THETA (whites/pupils painted there).
            const sockL = Math.exp(-(((theta - EYE_THETA) / SOCKET_W) ** 2));
            const sockR = Math.exp(-(((theta + EYE_THETA) / SOCKET_W) ** 2));
            z -= SOCKET_DEPTH * bellV(v, SOCKET_V0, SOCKET_V1) * (sockL + sockR);

            // Cheekbones: forward bumps outboard of the eyes.
            const cheekL = Math.exp(-(((theta - CHEEK_THETA) / CHEEK_W) ** 2));
            const cheekR = Math.exp(-(((theta + CHEEK_THETA) / CHEEK_W) ** 2));
            z += CHEEK_AMP * bellV(v, CHEEK_V0, CHEEK_V1) * (cheekL + cheekR);

            // Nose: narrow bridge widening into a broader angular tip, plus
            // nostril wings, then a philtrum dip back under the tip.
            const noseBell = bellV(v, NOSE_V0, NOSE_V1);
            if (noseBell > 0) {
              const nt    = (v - NOSE_V0) / (NOSE_V1 - NOSE_V0);
              const noseW = NOSE_W_TOP + (NOSE_W_TIP - NOSE_W_TOP) * nt;
              const noseA = NOSE_AMP_TOP + (NOSE_AMP_TIP - NOSE_AMP_TOP) * nt;
              z += noseA * noseBell * Math.exp(-((theta / noseW) ** 2));
            }
            const nostrilBell = bellV(v, NOSTRIL_V0, NOSTRIL_V1);
            if (nostrilBell > 0) {
              const nosL = Math.exp(-(((theta - NOSTRIL_THETA) / NOSTRIL_W) ** 2));
              const nosR = Math.exp(-(((theta + NOSTRIL_THETA) / NOSTRIL_W) ** 2));
              z += NOSTRIL_AMP * nostrilBell * (nosL + nosR);
            }
            z -= PHIL_DEPTH * bellV(v, PHIL_V0, PHIL_V1) * Math.exp(-((theta / PHIL_W) ** 2));

            // Mouth: lip ridges gated to mouth width.
            const mouthGate = flatBand(theta, -MOUTH_THETA_W, MOUTH_THETA_W, 0.10);
            z += LIP_AMP * bellV(v, LIP_V0, LIP_V1) * mouthGate;               // static
            z += LOWER_LIP_AMP * bellV(v, LOWER_LIP_V0, LOWER_LIP_V1) * mouthGate; // rides the jaw

            // Chin: forward bump at the centre-bottom (moves with the jaw).
            z += CHIN_AMP * bellV(v, CHIN_V0, CHIN_V1) * Math.exp(-((theta / CHIN_W) ** 2));

            // Jaw hinge weight: full width (a real jaw spans the face), 0
            // above the cavity, 1 below. The transition is one thin band
            // inside the mouth (sharp opening edge) but feathered wide out
            // at the cheeks so flesh beyond the mouth corners stretches
            // gradually instead of creasing along one row.
            const inMouth = Math.abs(theta) < MOUTH_THETA_W;
            const rampW   = inMouth ? (CAVITY_V1 - CAVITY_V0) : JAW_CHEEK_FEATHER;
            gJaw[gi] = Math.min(1, Math.max(0, (v - CAVITY_V0) / rampW));

            gX[gi] = x; gY[gi] = y; gZ[gi] = z;
            gV[gi] = v; gTheta[gi] = theta;
            gi++;
          }
        }
      }

      // ── Solid-cell colour lookup (hard edges, VF1) ───────────────────────
      // Evaluated once per TRIANGLE at its centroid — every facet is exactly
      // one colour, no vertex blending. Priority: mouth > eyes > brows >
      // headband > hair > skin.
      const colourAt = (v: number, theta: number) => {
        const at = Math.abs(theta);
        const dEye = Math.min(Math.abs(theta - EYE_THETA), Math.abs(theta + EYE_THETA));
        if (v >= CAVITY_V0 && v <= CAVITY_V1 && at < MOUTH_THETA_W) return CAVITY_COLOR;
        if (((v >= LIP_V0 && v <= LIP_V1) || (v >= LOWER_LIP_V0 && v <= LOWER_LIP_V1)) && at < MOUTH_THETA_W) return LIP_COLOR;
        if (v >= PUPIL_V0 && v <= PUPIL_V1 && dEye < PUPIL_HW) return PUPIL_COLOR;
        if (v >= EYEW_V0 && v <= EYEW_V1 && dEye < EYEW_HW) return EYE_WHITE;
        const bv = v - BROW_TILT * Math.max(0, EYE_THETA - at); // stern slant
        if (bv >= BROWP_V0 && bv <= BROWP_V1 && dEye < BROWP_HW) return BROW_COLOR;
        if (v >= BAND_V0 && v <= BAND_V1) return HEADBAND_COLOR;
        if (v < BAND_V0 || (v < HAIR_SIDE_V1 && at > HAIR_SIDE_THETA)) return hairColor;
        return SKIN_COLOR;
      };

      // ── Pass 2: expand to non-indexed triangles, one solid colour each ───
      const nTris  = (GH_X - 1) * (GH_Z - 1) * 2;
      const nVerts = nTris * 3;
      const positions  = new Float32Array(nVerts * 3);
      const fillColors = new Float32Array(nVerts * 3);
      const restX = new Float32Array(nVerts), restY = new Float32Array(nVerts), restZ = new Float32Array(nVerts);
      const jawWeight = new Float32Array(nVerts);
      {
        let vo = 0;
        for (let row = 0; row < GH_Z - 1; row++)
          for (let col = 0; col < GH_X - 1; col++) {
            const a = row * GH_X + col, b = a + 1, c = a + GH_X, d = c + 1;
            for (const tri of [[a, b, c], [b, d, c]]) {
              const cv = (gV[tri[0]] + gV[tri[1]] + gV[tri[2]]) / 3;
              const ct = (gTheta[tri[0]] + gTheta[tri[1]] + gTheta[tri[2]]) / 3;
              const colr = colourAt(cv, ct);
              for (const gi of tri) {
                restX[vo] = gX[gi]; restY[vo] = gY[gi]; restZ[vo] = gZ[gi];
                jawWeight[vo] = gJaw[gi];
                fillColors[vo * 3] = colr.r; fillColors[vo * 3 + 1] = colr.g; fillColors[vo * 3 + 2] = colr.b;
                vo++;
              }
            }
          }
      }

      const posAttr = new THREE.BufferAttribute(positions, 3);
      const geoFill = new THREE.BufferGeometry();
      geoFill.setAttribute("position", posAttr);
      geoFill.setAttribute("color", new THREE.BufferAttribute(fillColors, 3));

      // Solid fill only, flat-shaded under the key light for the faceted
      // "early-3D fighter" look — no wireframe/outline overlay.
      geoFill.computeVertexNormals();
      const fillMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
      scene.add(new THREE.Mesh(geoFill, fillMat));

      let jawOpen = 0; // low-passed RMS-driven openness, 0..1

      const renderHead = () => {
        const amp    = ampRef.current;
        const N      = amp.length || 256;
        const active = activeRef.current;

        let sum = 0;
        for (let i = 0; i < N; i++) sum += amp[i] * amp[i];
        const rms    = Math.sqrt(sum / N);
        const target = active ? Math.min(1, rms * JAW_GAIN) : 0;
        jawOpen += (target - jawOpen) * JAW_SMOOTH;

        // Hinge rotation about the x-axis at ear level: chin swings down and
        // back along an arc; vertices near the pivot barely move. Per-vertex
        // weight scales the angle so the static→moving transition is smooth.
        for (let i = 0; i < nVerts; i++) {
          positions[i * 3] = restX[i];
          const w = jawWeight[i];
          if (w > 0 && jawOpen > 0.001) {
            const ang = w * jawOpen * JAW_MAX_ANGLE;
            const cA = Math.cos(ang), sA = Math.sin(ang);
            const sy = restY[i] - JAW_PIVOT_Y, sz = restZ[i] - JAW_PIVOT_Z;
            positions[i * 3 + 1] = JAW_PIVOT_Y + sy * cA - sz * sA;
            positions[i * 3 + 2] = JAW_PIVOT_Z + sy * sA + sz * cA;
          } else {
            positions[i * 3 + 1] = restY[i];
            positions[i * 3 + 2] = restZ[i];
          }
        }

        posAttr.needsUpdate = true;
        geoFill.computeVertexNormals(); // jaw movement changes local face normals each frame
        geoFill.attributes.normal.needsUpdate = true;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(renderHead);
      };
      renderHead();

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
        geoFill.dispose();
        fillMat.dispose();
        renderer.dispose();
      };
    }

    // ═══════════════════════════════════════ CIRCLE WAVE (2D polar) ════════
    if (kind === "wavecircle") {
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

      const N_RINGS_C = 8;
      const PUSH_EVERY = 2; // push a snapshot every 2 rAF frames (~30 Hz at 60 fps)
      let frameCount = 0;
      for (let i = 0; i < N_RINGS_C; i++) historyRef.current.push(new Float32Array(256));

      const renderCircle = () => {
        frameCount++;
        if (frameCount % PUSH_EVERY === 0) {
          historyRef.current.unshift(new Float32Array(ampRef.current));
          if (historyRef.current.length > N_RINGS_C) historyRef.current.pop();
        }

        const { width, height } = canvas;
        const dpr = window.devicePixelRatio || 1;
        ctx.clearRect(0, 0, width, height);

        const cx       = width  / 2;
        const cy       = height / 2;
        const maxR     = Math.min(cx, cy) * 0.92;
        const innerR   = maxR * 0.20;
        const outerR   = maxR * 0.78;
        const ampScale = maxR * 0.18;

        const hist   = historyRef.current;
        const nRings = Math.min(hist.length, N_RINGS_C);

        if (!activeRef.current) {
          // Idle: plain concentric circles fading inward
          for (let i = 0; i < N_RINGS_C; i++) {
            const frac    = i / (N_RINGS_C - 1);
            const r       = innerR + (outerR - innerR) * (1 - frac);
            const opacity = 0.05 + (1 - frac) * 0.35;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${c1.r},${c1.g},${c1.b},${opacity})`;
            ctx.lineWidth   = 1.5 * dpr;
            ctx.stroke();
          }
          raf = requestAnimationFrame(renderCircle);
          return;
        }

        // Draw innermost (oldest) first so outermost (newest) paints on top
        for (let ri = nRings - 1; ri >= 0; ri--) {
          const frame = hist[ri];
          const N     = frame.length || 256;
          // ri=0 → outermost / newest; ri=nRings-1 → innermost / oldest
          const frac    = ri / (N_RINGS_C - 1);
          const baseR   = outerR - (outerR - innerR) * frac;
          const opacity = 1 - frac * 0.85;

          if (ri === 0) {
            // Newest ring: per-segment colour gradient matching the 2D wave style
            const lw = 2.5 * dpr;
            for (let i = 1; i <= N; i++) {
              const angle0 = ((i - 1) / N) * Math.PI * 2 - Math.PI / 2;
              const angle1 = (i       / N) * Math.PI * 2 - Math.PI / 2;
              const a0 = frame[(i - 1) % N] || 0;
              const a1 = frame[i       % N] || 0;
              const r0 = Math.max(0, baseR + a0 * ampScale);
              const r1 = Math.max(0, baseR + a1 * ampScale);

              const t  = Math.min(1, Math.abs(a1) * 3.0);
              const cr = Math.round(c1.r + (c2.r - c1.r) * t);
              const cg = Math.round(c1.g + (c2.g - c1.g) * t);
              const cb = Math.round(c1.b + (c2.b - c1.b) * t);

              ctx.globalAlpha  = opacity;
              ctx.beginPath();
              ctx.strokeStyle  = `rgb(${cr},${cg},${cb})`;
              ctx.lineWidth    = lw;
              ctx.moveTo(cx + Math.cos(angle0) * r0, cy + Math.sin(angle0) * r0);
              ctx.lineTo(cx + Math.cos(angle1) * r1, cy + Math.sin(angle1) * r1);
              ctx.stroke();
            }
          } else {
            // Older rings: single closed path for performance
            ctx.beginPath();
            ctx.globalAlpha  = opacity;
            ctx.strokeStyle  = `rgb(${c1.r},${c1.g},${c1.b})`;
            ctx.lineWidth    = 1.5 * dpr;
            for (let i = 0; i <= N; i++) {
              const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
              const a     = frame[i % N] || 0;
              const r     = Math.max(0, baseR + a * ampScale);
              const x     = cx + Math.cos(angle) * r;
              const y     = cy + Math.sin(angle) * r;
              if (i === 0) ctx.moveTo(x, y);
              else         ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
          }
        }

        ctx.globalAlpha = 1;
        raf = requestAnimationFrame(renderCircle);
      };
      renderCircle();

      const ro = new ResizeObserver(resize);
      ro.observe(container);
      return () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
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
  }, [color, peakColor, bgColor, kind]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: (kind === "wave3d" || kind === "wave3dgrid" || kind === "wavehead") ? bgColor : undefined,
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
            border: `1px solid rgba(${c1Rgb},0.30)`,
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
