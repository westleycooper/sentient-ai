/**
 * Three.js sound-wave visualisation. ISOLATED feature (CLAUDE.md §6).
 * No Three.js imports leak outside this folder. Stable prop contract so the
 * future 3D AI head is a drop-in replacement: same props, same callers.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";

export interface WaveformProps {
  /** Amplitude samples 0..1, updated in time with the TTS playback. */
  amplitude: Float32Array;
  /** Visual config (colour, line count) — persisted per-user. */
  color?: string;
  active?: boolean;
}

export function Waveform({ amplitude, color = "#4f9cff", active = true }: WaveformProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const ampRef = useRef(amplitude);
  ampRef.current = amplitude;

  useEffect(() => {
    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const N = 256;
    const positions = new Float32Array(N * 3);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color }));
    scene.add(line);

    let raf = 0;
    const render = () => {
      const amp = ampRef.current;
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * 2 - 1;
        const a = amp.length ? amp[Math.floor((i / N) * amp.length)] : 0;
        positions[i * 3] = x;
        positions[i * 3 + 1] = active ? (a - 0.5) * 1.6 : 0;
        positions[i * 3 + 2] = 0;
      }
      geom.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };
    render();

    const onResize = () => renderer.setSize(mount.clientWidth, mount.clientHeight);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [color, active]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} aria-hidden />;
}
