/**
 * useCameraCapture — requests the device camera and captures still frames
 * to an offscreen canvas for on-device OCR (see ocr.ts). No frame is ever
 * sent off-device; capture only produces a canvas the caller can inspect.
 */
import { useCallback, useRef, useState } from "react";

export type CameraState = "idle" | "active" | "error";

export function useCameraCapture() {
  const [state, setState] = useState<CameraState>("idle");
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setState("active");
    } catch {
      setState("error");
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState("idle");
  }, []);

  const captureFrame = useCallback((): HTMLCanvasElement | null => {
    const video = videoRef.current;
    if (!video || state !== "active") return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }, [state]);

  return { state, videoRef, start, stop, captureFrame };
}
