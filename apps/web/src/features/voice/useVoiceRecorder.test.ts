import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceRecorder } from "./useVoiceRecorder";

class FakeTrack {
  stop = vi.fn();
}

class FakeMediaStream {
  private tracks = [new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
}

class FakeAnalyser {
  fftSize = 0;
  frequencyBinCount = 4;
  getFloatTimeDomainData = vi.fn();
}

class FakeAudioContext {
  createMediaStreamSource() {
    return { connect: vi.fn() };
  }
  createAnalyser() {
    return new FakeAnalyser();
  }
}

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  stream: FakeMediaStream;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onstop?.());

  constructor(stream: FakeMediaStream) {
    this.stream = stream;
    FakeMediaRecorder.instances.push(this);
  }
}

describe("useVoiceRecorder", () => {
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    FakeMediaRecorder.instances = [];
    getUserMedia = vi.fn().mockResolvedValue(new FakeMediaStream());
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts in the idle state", () => {
    const { result } = renderHook(() => useVoiceRecorder());
    expect(result.current.state).toBe("idle");
  });

  it("start() requests the microphone and transitions to recording", async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(result.current.state).toBe("recording");
  });

  it("start() transitions to error when getUserMedia rejects", async () => {
    getUserMedia.mockRejectedValue(new Error("permission denied"));
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe("error");
  });

  it("invokes onChunk with amplitude data while recording", async () => {
    const onChunk = vi.fn();
    const { result } = renderHook(() => useVoiceRecorder(onChunk));
    await act(async () => {
      await result.current.start();
    });
    expect(onChunk).toHaveBeenCalledWith(expect.any(Float32Array));
  });

  it("stop() with no active recording resolves an empty blob without throwing", async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    let blob: Blob | undefined;
    await act(async () => {
      blob = await result.current.stop();
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.size).toBe(0);
  });

  it("stop() stops the recorder, releases tracks, and returns to idle", async () => {
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });

    const recorder = FakeMediaRecorder.instances[0];
    await act(async () => {
      await result.current.stop();
    });

    expect(recorder.stop).toHaveBeenCalled();
    expect(recorder.stream.getTracks()[0].stop).toHaveBeenCalled();
    await waitFor(() => expect(result.current.state).toBe("idle"));
  });
});
