import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCameraCapture } from "./useCameraCapture";

class FakeTrack {
  stop = vi.fn();
}

class FakeMediaStream {
  private tracks = [new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
}

describe("useCameraCapture", () => {
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getUserMedia = vi.fn().mockResolvedValue(new FakeMediaStream());
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts in the idle state", () => {
    const { result } = renderHook(() => useCameraCapture());
    expect(result.current.state).toBe("idle");
  });

  it("start() requests the camera and transitions to active", async () => {
    const { result } = renderHook(() => useCameraCapture());
    await act(async () => {
      await result.current.start();
    });
    expect(getUserMedia).toHaveBeenCalledWith({ video: true });
    expect(result.current.state).toBe("active");
  });

  it("start() transitions to error when getUserMedia rejects", async () => {
    getUserMedia.mockRejectedValue(new Error("permission denied"));
    const { result } = renderHook(() => useCameraCapture());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe("error");
  });

  it("stop() releases tracks and returns to idle", async () => {
    const { result } = renderHook(() => useCameraCapture());
    await act(async () => {
      await result.current.start();
    });
    const stream = await getUserMedia.mock.results[0].value;
    act(() => result.current.stop());

    expect(stream.getTracks()[0].stop).toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
  });

  it("captureFrame() returns null when not active", () => {
    const { result } = renderHook(() => useCameraCapture());
    expect(result.current.captureFrame()).toBeNull();
  });
});
