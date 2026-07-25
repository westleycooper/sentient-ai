import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./uiStore";

const INITIAL_STATE = useUiStore.getState();

describe("useUiStore", () => {
  beforeEach(() => {
    useUiStore.setState(INITIAL_STATE, true);
  });

  it("starts with the documented defaults", () => {
    const s = useUiStore.getState();
    expect(s.drawerOpen).toBe(true);
    expect(s.recording).toBe(false);
    expect(s.selectedSmeId).toBeNull();
    expect(s.defaultSmeId).toBeNull();
    expect(s.readAloud).toBe(false);
    expect(s.codeWaveKind).toBe("wave");
    expect(s.drawerWidth).toBe(400);
  });

  it("toggleDrawer flips drawerOpen", () => {
    useUiStore.getState().toggleDrawer();
    expect(useUiStore.getState().drawerOpen).toBe(false);
    useUiStore.getState().toggleDrawer();
    expect(useUiStore.getState().drawerOpen).toBe(true);
  });

  it("setDrawerWidth sets an exact value", () => {
    useUiStore.getState().setDrawerWidth(520);
    expect(useUiStore.getState().drawerWidth).toBe(520);
  });

  it("setRecording sets an exact value", () => {
    useUiStore.getState().setRecording(true);
    expect(useUiStore.getState().recording).toBe(true);
  });

  it("selectSme sets the selected id", () => {
    useUiStore.getState().selectSme("ftse100-analyst");
    expect(useUiStore.getState().selectedSmeId).toBe("ftse100-analyst");
  });

  it("setDefaultSme sets the default id", () => {
    useUiStore.getState().setDefaultSme("recruitment-agent");
    expect(useUiStore.getState().defaultSmeId).toBe("recruitment-agent");
  });

  it("toggleReadAloud flips readAloud", () => {
    useUiStore.getState().toggleReadAloud();
    expect(useUiStore.getState().readAloud).toBe(true);
    useUiStore.getState().toggleReadAloud();
    expect(useUiStore.getState().readAloud).toBe(false);
  });

  it("cycleCodeWaveKind cycles through all kinds and wraps around", () => {
    const seen: string[] = [useUiStore.getState().codeWaveKind];
    for (let i = 0; i < 5; i++) {
      useUiStore.getState().cycleCodeWaveKind();
      seen.push(useUiStore.getState().codeWaveKind);
    }
    expect(seen).toEqual(["wave", "wavecircle", "wave3d", "wave3dgrid", "wavehead", "wave"]);
  });
});
