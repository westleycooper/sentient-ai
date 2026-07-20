/**
 * AgentPage — voice coding agent interface at /agent.
 *
 * Mirrors HomePage structure:
 *   - Three.js wave3d waveform (centre)
 *   - PermissionCard stack (above mic, appears on tool requests)
 *   - MicButton + VAD (bottom)
 *   - TranscriptDrawer (slide-out right)
 *   - AppBar with navigation back to the voice agent
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Chip,
  IconButton,
  Snackbar,
  Stack,
  Tooltip,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";

import { AppHeader } from "../features/nav/AppHeader";
import { SentinelThemeProvider } from "../themes/SentinelThemeProvider";
import { THEMES, DEFAULT_THEME_ID } from "../themes/index";

import { Waveform } from "../features/waveform/Waveform";
import { MicButton } from "../features/voice/MicButton";
import { useVoiceRecorder } from "../features/voice/useVoiceRecorder";
import { TranscriptDrawer } from "../features/transcript/TranscriptDrawer";
import { PermissionCard } from "../features/agent/PermissionCard";
import { useAgentSession, type AgentMessage } from "../features/agent/useAgentSession";
import { useUiStore } from "../store/uiStore";
import { useAgentConfig, useAgentModels, useMcpStatus, type Message } from "../api/hooks";
import type { WaveformKind } from "../features/waveform/Waveform";

const WAVE_LABELS: Record<WaveformKind, string> = {
  wave: "Line wave",
  wavecircle: "Circle wave",
  wave3d: "3D dots",
  wave3dgrid: "3D grid",
};

const SESSION_ID = crypto.randomUUID();

// Adapt AgentMessage → Message for TranscriptDrawer reuse
function toTranscriptMessage(m: AgentMessage): Message {
  if (m.kind === "text") {
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      created_at: new Date().toISOString(),
      token_count: 0,
      citations: [],
    };
  }
  // Tool messages: formatted as markdown with a fenced code block for the preview.
  const icon = m.denied ? "✗" : "✓";
  let preview = "";
  if (m.preview) {
    const lang = m.tool === "bash" ? "bash" : m.tool === "edit_file" ? "diff" : "";
    preview = `\n\`\`\`${lang}\n${m.preview}\n\`\`\``;
  }
  return {
    id: m.id,
    role: "assistant",
    content: `${icon} **${m.tool}**${preview}`,
    created_at: new Date().toISOString(),
    token_count: 0,
    citations: [],
  };
}

export function AgentPage() {
  const navigate = useNavigate();
  const { drawerOpen, toggleDrawer, recording, setRecording, readAloud, toggleReadAloud, codeWaveKind, cycleCodeWaveKind } = useUiStore();

  const { data: agentConfig } = useAgentConfig();
  const { data: agentModels = [] } = useAgentModels();
  // Coding agent (ADR-0003) and MCP server (ADR-0004) share the ENV != production
  // gate in main.py — reuse this one signal to hide both nav entry points in prod.
  const { data: mcpStatus } = useMcpStatus();
  const localFeaturesEnabled = mcpStatus?.mounted ?? false;
  const activeTokens = THEMES[agentConfig?.theme_id ?? DEFAULT_THEME_ID] ?? THEMES[DEFAULT_THEME_ID];
  const waveColor = activeTokens.mode === "light" ? activeTokens.primaryDark : activeTokens.primary;
  const wavePeakColor = activeTokens.mode === "light" ? activeTokens.primary : activeTokens.primaryLight;

  const modelLabel = agentModels.find((m) => m.id === agentConfig?.model)?.label ?? "Sonnet 5";
  const greetingText = `Hello, I'm Claude Code, powered by ${modelLabel}. Ask me to read, edit, or run anything in the project.`;
  // Ref so the TTS effect closure always reads the latest value after config loads.
  const greetingTextRef = useRef(greetingText);
  greetingTextRef.current = greetingText;

  const [amplitude, setAmplitude] = useState<Float32Array>(new Float32Array(256));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);

  const localMessages = useMemo<Message[]>(
    () => [
      {
        id: "greeting",
        role: "assistant",
        content: greetingText,
        created_at: new Date().toISOString(),
        token_count: 0,
        citations: [],
      },
    ],
    // Intentionally update only when the model label resolves — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modelLabel],
  );

  const readAloudRef = useRef(readAloud);
  readAloudRef.current = readAloud;

  const ttsCtxRef = useRef<AudioContext | null>(null);
  const ttsAnimRef = useRef<number>(0);
  const vadHasSpeechRef = useRef(false);
  const vadSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadIsActiveRef = useRef(false);
  const vadMicStopRef = useRef<(() => void) | null>(null);

  const { connected, messages, pendingPermissions, isThinking, handleSpeech, approve, deny } =
    useAgentSession(SESSION_ID);

  // ------------------------------------------------------------------
  // Greeting — play on first user interaction (browser autoplay policy)
  // ------------------------------------------------------------------

  const greetingPlayedRef = useRef(false);

  useEffect(() => {
    const speak = async () => {
      if (greetingPlayedRef.current) return;
      greetingPlayedRef.current = true;
      if (!readAloudRef.current) return;
      try {
        if (!ttsCtxRef.current || ttsCtxRef.current.state === "closed") {
          ttsCtxRef.current = new AudioContext();
        }
        await ttsCtxRef.current.resume();
        const res = await fetch("/api/tts/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: greetingTextRef.current }),
        });
        if (!res.ok || !res.body) return;
        const chunks: Uint8Array[] = [];
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        const total = chunks.reduce((n, c) => n + c.byteLength, 0);
        const merged = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) { merged.set(c, off); off += c.byteLength; }
        if (!merged.byteLength) return;
        const ctx = ttsCtxRef.current;
        const audioBuf = await ctx.decodeAudioData(merged.buffer);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        const source = ctx.createBufferSource();
        source.buffer = audioBuf;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        const freqBuf = new Float32Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getFloatTimeDomainData(freqBuf);
          setAmplitude(new Float32Array(freqBuf));
          ttsAnimRef.current = requestAnimationFrame(tick);
        };
        setIsTtsPlaying(true);
        tick();
        source.onended = () => {
          cancelAnimationFrame(ttsAnimRef.current);
          setIsTtsPlaying(false);
          setAmplitude(new Float32Array(256));
        };
        source.start();
      } catch { /* non-fatal */ }
    };

    document.addEventListener("click", speak, { once: true });
    document.addEventListener("keydown", speak, { once: true });
    return () => {
      document.removeEventListener("click", speak);
      document.removeEventListener("keydown", speak);
    };
  }, []);

  // ------------------------------------------------------------------
  // Amplitude / VAD
  // ------------------------------------------------------------------

  const handleAmplitudeChunk = useCallback((buf: Float32Array) => {
    setAmplitude(new Float32Array(buf));

    if (!vadIsActiveRef.current) return;

    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);

    const SPEECH_THRESHOLD = 0.015;
    const SILENCE_THRESHOLD = 0.008;
    const SILENCE_MS = 2000;

    if (rms > SPEECH_THRESHOLD) {
      vadHasSpeechRef.current = true;
      if (vadSilenceTimerRef.current) {
        clearTimeout(vadSilenceTimerRef.current);
        vadSilenceTimerRef.current = null;
      }
    } else if (vadHasSpeechRef.current && rms < SILENCE_THRESHOLD && !vadSilenceTimerRef.current) {
      vadSilenceTimerRef.current = setTimeout(() => {
        vadSilenceTimerRef.current = null;
        if (vadIsActiveRef.current) {
          vadIsActiveRef.current = false;
          vadHasSpeechRef.current = false;
          vadMicStopRef.current?.();
        }
      }, SILENCE_MS);
    }
  }, []);

  const { state: recState, start: startRec, stop: stopRec } = useVoiceRecorder(handleAmplitudeChunk);

  // ------------------------------------------------------------------
  // Mic handlers
  // ------------------------------------------------------------------

  const handleMicStop = useCallback(async () => {
    vadIsActiveRef.current = false;
    if (vadSilenceTimerRef.current) {
      clearTimeout(vadSilenceTimerRef.current);
      vadSilenceTimerRef.current = null;
    }
    setRecording(false);
    const blob = await stopRec();
    setAmplitude(new Float32Array(256));

    // STT — reuse the same /api/tts/speak+STT endpoint flow as HomePage
    // For the agent page we send to the conversations STT endpoint.
    // If STT_PROVIDER=stub the API returns placeholder text; real STT returns transcript.
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      const res = await fetch("/api/stt/transcribe", { method: "POST", body: formData });
      if (res.ok) {
        const { text } = await res.json() as { text: string };
        if (text?.trim()) {
          handleSpeech(text.trim());
        }
      } else {
        // Fallback: show an error (STT not configured)
        setErrorMsg("Speech-to-text not available. Check STT_PROVIDER in .env.local");
      }
    } catch (e) {
      setErrorMsg(`STT error: ${(e as Error).message}`);
    }
  }, [stopRec, setRecording, handleSpeech]);

  vadMicStopRef.current = handleMicStop;

  const handleMicStart = useCallback(async () => {
    if (!ttsCtxRef.current || ttsCtxRef.current.state === "closed") {
      ttsCtxRef.current = new AudioContext();
    }
    vadHasSpeechRef.current = false;
    vadIsActiveRef.current = true;
    if (vadSilenceTimerRef.current) {
      clearTimeout(vadSilenceTimerRef.current);
      vadSilenceTimerRef.current = null;
    }
    setRecording(true);
    await startRec();
  }, [startRec, setRecording]);

  // ------------------------------------------------------------------
  // Auto-activate mic when a permission card first appears
  // ------------------------------------------------------------------

  const prevPendingCountRef = useRef(0);
  useEffect(() => {
    const count = pendingPermissions.length;
    if (count > 0 && prevPendingCountRef.current === 0 && recState !== "recording") {
      handleMicStart();
    }
    prevPendingCountRef.current = count;
  }, [pendingPermissions.length, recState, handleMicStart]);

  // ------------------------------------------------------------------
  // TTS playback for agent responses
  // ------------------------------------------------------------------

  const playTts = useCallback(async (text: string) => {
    cancelAnimationFrame(ttsAnimRef.current);
    try {
      if (!ttsCtxRef.current || ttsCtxRef.current.state === "closed") {
        ttsCtxRef.current = new AudioContext();
      }
      await ttsCtxRef.current.resume();
      const res = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok || !res.body) return;

      const chunks: Uint8Array[] = [];
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const total = chunks.reduce((n, c) => n + c.byteLength, 0);
      const merged = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { merged.set(c, off); off += c.byteLength; }
      if (!merged.byteLength) return;

      const ctx = ttsCtxRef.current;
      const audioBuf = await ctx.decodeAudioData(merged.buffer);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      source.connect(analyser);
      analyser.connect(ctx.destination);

      const freqBuf = new Float32Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getFloatTimeDomainData(freqBuf);
        setAmplitude(new Float32Array(freqBuf));
        ttsAnimRef.current = requestAnimationFrame(tick);
      };
      setIsTtsPlaying(true);
      tick();
      source.onended = () => {
        cancelAnimationFrame(ttsAnimRef.current);
        setIsTtsPlaying(false);
        setAmplitude(new Float32Array(256));
      };
      source.start();
    } catch { /* non-fatal */ }
  }, []);

  // Auto-play TTS when readAloud is on
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    const newMsgs = messages.slice(prevMsgCountRef.current);
    prevMsgCountRef.current = messages.length;
    if (!readAloud) return;
    for (const m of newMsgs) {
      if (m.kind === "text" && m.role === "assistant" && m.content && ttsCtxRef.current) {
        playTts(m.content);
      }
    }
  }, [messages, readAloud, playTts]);

  // ------------------------------------------------------------------
  // Transcript — greeting + agent messages merged
  // ------------------------------------------------------------------

  const transcriptMessages: Message[] = [
    ...localMessages,
    ...messages.map(toTranscriptMessage),
  ];

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <SentinelThemeProvider themeId={agentConfig?.theme_id}>
    <Box
      sx={{
        height: "100dvh",
        display: "flex",
        bgcolor: "background.default",
        overflow: "hidden",
      }}
    >
      {/* Main panel */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          pt: { xs: 2, md: 4 },
          pb: { xs: 2, md: 4 },
          px: { xs: 3, md: 5 },
          gap: 2,
        }}
      >
        {/* Top bar */}
        <AppHeader
          mode="code"
          drawerOpen={drawerOpen}
          onToggleDrawer={toggleDrawer}
          showCodeToggle={localFeaturesEnabled}
          titleContent={null}
          leftContent={
            <Tooltip title="Code agent settings">
              <IconButton onClick={() => navigate("/config?tab=1")} aria-label="Code agent settings">
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          }
        >
          <Chip
            label={connected ? "connected" : "connecting…"}
            color={connected ? "success" : "default"}
            variant="outlined"
            sx={{ fontSize: "0.75rem" }}
          />
          <Tooltip title={`Visualisation: ${WAVE_LABELS[codeWaveKind]}`}>
            <IconButton onClick={cycleCodeWaveKind} aria-label="Cycle waveform visualisation">
              <GraphicEqIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={readAloud ? "Read aloud on" : "Read aloud off"}>
            <IconButton onClick={toggleReadAloud} aria-label="Toggle read aloud">
              {readAloud ? <VolumeUpIcon /> : <VolumeOffIcon />}
            </IconButton>
          </Tooltip>
        </AppHeader>

        {/* Waveform — fills all remaining height; mic + cards overlay at bottom */}
        <Box
          sx={{
            flex: 1,
            position: "relative",
            borderRadius: 3,
            overflow: "hidden",
            bgcolor: "background.paper",
          }}
        >
          <Waveform
            amplitude={amplitude}
            active={recording || isTtsPlaying || isThinking}
            color={waveColor}
            peakColor={wavePeakColor}
            bgColor={activeTokens.bgPaper}
            kind={codeWaveKind}
          />

          {/* Permission cards — absolute overlay at the bottom of the waveform */}
          {pendingPermissions.length > 0 && (
            <Stack
              sx={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                alignItems: "center",
                pb: 3,
                gap: 1,
                zIndex: 2,
              }}
            >
              {pendingPermissions.map((p) => (
                <PermissionCard
                  key={p.request_id}
                  permission={p}
                  onApprove={approve}
                  onDeny={deny}
                />
              ))}
            </Stack>
          )}
        </Box>

        {/* Mic button — below the visual, same layout as voice agent */}
        <Stack sx={{ alignItems: "center", flexShrink: 0 }}>
          <MicButton
            state={recState}
            onStart={handleMicStart}
            onStop={handleMicStop}
            disabled={isThinking && pendingPermissions.length === 0}
          />
        </Stack>
      </Box>

      {/* Transcript drawer */}
      <TranscriptDrawer
        open={drawerOpen}
        onClose={toggleDrawer}
        messages={transcriptMessages}
        steps={[]}
        stepsByMsgId={{}}
        onSendText={(text) => handleSpeech(text)}
        isStreaming={isThinking}
        onPlayMessage={readAloud ? undefined : playTts}
      />

      {/* Error toast */}
      <Snackbar
        open={Boolean(errorMsg)}
        autoHideDuration={6000}
        onClose={() => setErrorMsg(null)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity="error" onClose={() => setErrorMsg(null)} sx={{ width: "100%" }}>
          {errorMsg}
        </Alert>
      </Snackbar>
    </Box>
    </SentinelThemeProvider>
  );
}
