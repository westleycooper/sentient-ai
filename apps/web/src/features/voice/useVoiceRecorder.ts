/**
 * useVoiceRecorder — captures audio from the microphone as a webm blob.
 * Returns the blob when recording stops.
 */
import { useCallback, useRef, useState } from "react";

export type RecordingState = "idle" | "recording" | "error";

export function useVoiceRecorder(onChunk?: (amplitude: Float32Array) => void) {
  const [state, setState] = useState<RecordingState>("idle");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      if (onChunk) {
        const buf = new Float32Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getFloatTimeDomainData(buf);
          onChunk(buf);
          animFrameRef.current = requestAnimationFrame(tick);
        };
        tick();
      }

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.start(100);
      mediaRef.current = recorder;
      setState("recording");
    } catch {
      setState("error");
    }
  }, [onChunk]);

  const stop = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      cancelAnimationFrame(animFrameRef.current);
      const recorder = mediaRef.current;
      if (!recorder) {
        resolve(new Blob());
        return;
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        recorder.stream.getTracks().forEach((t) => t.stop());
        setState("idle");
        resolve(blob);
      };
      recorder.stop();
    });
  }, []);

  return { state, start, stop };
}
