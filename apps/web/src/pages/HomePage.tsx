/**
 * HomePage — the primary voice agent interface.
 *
 * Layout: full-screen dark canvas with:
 * - Three.js waveform (centre)
 * - Mic button (bottom-centre)
 * - Reasoning steps overlay (fades in during a turn)
 * - Toolbar: SME selector, transcript drawer toggle, config link
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  AppBar,
  Box,
  Chip,
  Divider,
  IconButton,
  MenuItem,
  Popover,
  Select,
  Snackbar,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ChatIcon from "@mui/icons-material/Chat";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HistoryIcon from "@mui/icons-material/History";
import SettingsIcon from "@mui/icons-material/Settings";

import { Waveform } from "../features/waveform/Waveform";
import { MicButton } from "../features/voice/MicButton";
import { useVoiceRecorder } from "../features/voice/useVoiceRecorder";
import { TranscriptDrawer } from "../features/transcript/TranscriptDrawer";
import { ReasoningSteps } from "../features/reasoning/ReasoningSteps";
import { useUiStore } from "../store/uiStore";
import {
  useSmeTemplates,
  useStartConversation,
  useConversation,
  type StepEvent,
  type Message,
} from "../api/hooks";
import { streamAudioTurn, streamEvents } from "../api/client";
import type { TurnEvent, TranscriptEvent } from "../api/hooks";

export function HomePage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { drawerOpen, toggleDrawer, selectedSmeId, defaultSmeId, selectSme, recording, setRecording } =
    useUiStore();

  const [amplitude, setAmplitude] = useState<Float32Array>(new Float32Array(256));
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [stepHistory, setStepHistory] = useState<StepEvent[][]>([]);
  const [stepsByMsgId, setStepsByMsgId] = useState<Record<string, StepEvent[]>>({});
  const stepsRef = useRef<StepEvent[]>([]);
  const [historyAnchor, setHistoryAnchor] = useState<HTMLElement | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);

  // Keep a ref so archive-on-clear in callbacks always sees fresh steps
  stepsRef.current = steps;

  const stopStreamRef = useRef<(() => void) | null>(null);
  const ttsAnimRef = useRef<number>(0);
  // AudioContext created once on first mic click so it's inside a user gesture
  const ttsCtxRef = useRef<AudioContext | null>(null);

  // VAD (voice activity detection) refs — all mutable, no re-render on change
  const vadHasSpeechRef = useRef(false);
  const vadSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadIsActiveRef = useRef(false);      // true only while mic is recording
  const vadMicStopRef = useRef<(() => void) | null>(null);  // set after handleMicStop defined

  const { data: templates = [] } = useSmeTemplates();
  const { data: conversation } = useConversation(conversationId);
  const startConvMutation = useStartConversation();

  const activeSmeId = selectedSmeId ?? defaultSmeId ?? templates[0]?.id ?? "";
  const activeSme = templates.find((t) => t.id === activeSmeId) ?? templates[0] ?? null;

  const handleAmplitudeChunk = useCallback((buf: Float32Array) => {
    setAmplitude(new Float32Array(buf));

    if (!vadIsActiveRef.current) return;

    // RMS of time-domain signal: 0 = silence, ~0.02+ = speech
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

  const ensureConversation = useCallback(async () => {
    if (conversationId) return conversationId;
    const res = await startConvMutation.mutateAsync(activeSmeId);
    setConversationId(res.conversation_id);
    return res.conversation_id;
  }, [conversationId, activeSmeId, startConvMutation]);

  // --- Greeting ---
  // Re-runs whenever the active SME changes (including initial load).
  // Always resets conversation + steps so the new SME gets a fresh thread.
  const greetingPlayedRef = useRef(false);

  useEffect(() => {
    if (!activeSme) return;

    // Reset conversation binding — ensureConversation will create a new one
    // for the selected SME on the next user turn.
    setConversationId(null);
    setSteps([]);
    setStepHistory([]);
    setStepsByMsgId({});
    setIsStreaming(false);
    greetingPlayedRef.current = false;

    const greetingText = `Hello, I'm Sentinel, your ${activeSme.name}. How can I help?`;

    // Show text immediately
    setLocalMessages([{
      id: "greeting",
      role: "assistant",
      content: greetingText,
      created_at: new Date().toISOString(),
      token_count: 0,
      citations: [],
    }]);

    // cancelled = true when the effect cleans up (i.e. SME changed again before
    // the user interacted), so the stale speak closure never fires.
    let cancelled = false;

    // Speak on first interaction (browser requires a user gesture for AudioContext)
    const speak = async () => {
      if (cancelled || greetingPlayedRef.current) return;
      greetingPlayedRef.current = true;
      try {
        if (!ttsCtxRef.current || ttsCtxRef.current.state === "closed") {
          ttsCtxRef.current = new AudioContext();
        }
        await ttsCtxRef.current.resume();
        const res = await fetch("/api/tts/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: greetingText }),
        });
        if (!res.ok || !res.body) return;

        const chunks: Uint8Array[] = [];
        const reader = res.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        const totalLen = chunks.reduce((n, c) => n + c.byteLength, 0);
        const merged = new Uint8Array(totalLen);
        let offset = 0;
        for (const c of chunks) { merged.set(c, offset); offset += c.byteLength; }
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
      } catch { /* non-fatal — text greeting still visible */ }
    };

    document.addEventListener("click", speak, { once: true });
    document.addEventListener("keydown", speak, { once: true });
    return () => {
      cancelled = true;
      document.removeEventListener("click", speak);
      document.removeEventListener("keydown", speak);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSme?.id]);

  const playTts = useCallback(async (convId: string, text: string) => {
    cancelAnimationFrame(ttsAnimRef.current);
    const ctx = ttsCtxRef.current!;
    await ctx.resume();

    try {
      const res = await fetch(`/api/conversations/${convId}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_text: text }),
      });
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => res.statusText);
        setErrorMsg(`TTS failed (${res.status}): ${detail}`);
        return;
      }

      // Collect the full stream then decode — MediaSource streaming of MP3 is
      // unreliable across browsers; buffering is the stable cross-browser path.
      const chunks: Uint8Array[] = [];
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const totalLen = chunks.reduce((n, c) => n + c.byteLength, 0);
      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (const c of chunks) { merged.set(c, offset); offset += c.byteLength; }

      if (!merged.byteLength) { setErrorMsg("TTS returned empty audio"); return; }
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
    } catch (e) {
      setErrorMsg(`TTS error: ${(e as Error).message}`);
    }
  }, []);

  const handleMicStop = useCallback(async () => {
    // Cancel VAD timer so it can't fire again after manual stop
    vadIsActiveRef.current = false;
    if (vadSilenceTimerRef.current) {
      clearTimeout(vadSilenceTimerRef.current);
      vadSilenceTimerRef.current = null;
    }
    setRecording(false);
    const blob = await stopRec();
    setAmplitude(new Float32Array(256));

    const convId = await ensureConversation();
    const userMsgId = crypto.randomUUID();

    const userMsg: Message = {
      id: userMsgId,
      role: "user",
      content: "…",
      created_at: new Date().toISOString(),
      token_count: 0,
      citations: [],
    };
    setLocalMessages((prev) => [...prev, userMsg]);
    if (stepsRef.current.length > 0) setStepHistory((prev) => [...prev, stepsRef.current]);
    setSteps([]);
    setIsStreaming(true);

    const stopStream = streamAudioTurn(
      `/conversations/${convId}/audio-turn`,
      blob,
      (raw) => {
        const ev = raw as TurnEvent;
        if (ev.type === "transcript") {
          const te = ev as TranscriptEvent;
          setLocalMessages((prev) =>
            prev.map((m) => (m.id === userMsgId ? { ...m, content: te.text } : m))
          );
        } else if (ev.type === "step") {
          setSteps((prev) => [...prev, ev as StepEvent]);
        } else if (ev.type === "complete") {
          const assistantMsgId = crypto.randomUUID();
          setStepsByMsgId((prev) => ({ ...prev, [assistantMsgId]: stepsRef.current }));
          const assistantMsg: Message = {
            id: assistantMsgId,
            role: "assistant",
            content: ev.answer,
            created_at: new Date().toISOString(),
            token_count: ev.total_tokens,
            citations: ev.citations,
          };
          setLocalMessages((prev) => [...prev, assistantMsg]);
          setIsStreaming(false);
          playTts(convId, ev.answer);
        } else if (ev.type === "error") {
          setErrorMsg(`Agent error: ${(ev as { type: "error"; message: string }).message}`);
          setIsStreaming(false);
        }
      },
      (err) => {
        setErrorMsg(`Request failed: ${err.message}`);
        setIsStreaming(false);
      }
    );
    stopStreamRef.current = stopStream;
  }, [stopRec, ensureConversation, setRecording, playTts]);

  // Keep VAD ref pointing at the latest handleMicStop (safe forward ref pattern)
  vadMicStopRef.current = handleMicStop;

  const handleSendText = useCallback(async (text: string) => {
    const convId = await ensureConversation();
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
      token_count: 0,
      citations: [],
    };
    setLocalMessages((prev) => [...prev, userMsg]);
    if (stepsRef.current.length > 0) setStepHistory((prev) => [...prev, stepsRef.current]);
    setSteps([]);
    setIsStreaming(true);

    if (!ttsCtxRef.current || ttsCtxRef.current.state === "closed") {
      ttsCtxRef.current = new AudioContext();
    }

    streamEvents(
      `/conversations/${convId}/turn`,
      { user_text: text },
      (raw) => {
        const ev = raw as TurnEvent;
        if (ev.type === "step") {
          setSteps((prev) => [...prev, ev as StepEvent]);
        } else if (ev.type === "complete") {
          const assistantMsgId = crypto.randomUUID();
          setStepsByMsgId((prev) => ({ ...prev, [assistantMsgId]: stepsRef.current }));
          const assistantMsg: Message = {
            id: assistantMsgId,
            role: "assistant",
            content: ev.answer,
            created_at: new Date().toISOString(),
            token_count: ev.total_tokens,
            citations: ev.citations,
          };
          setLocalMessages((prev) => [...prev, assistantMsg]);
          setIsStreaming(false);
          playTts(convId, ev.answer);
        } else if (ev.type === "error") {
          setErrorMsg(`Agent error: ${(ev as { type: "error"; message: string }).message}`);
          setIsStreaming(false);
        }
      },
      (err) => {
        setErrorMsg(`Request failed: ${err.message}`);
        setIsStreaming(false);
      }
    );
  }, [ensureConversation, playTts]);

  const handleMicStart = useCallback(async () => {
    // Create (or reuse) AudioContext here — inside a user gesture so autoplay policy is satisfied
    if (!ttsCtxRef.current || ttsCtxRef.current.state === "closed") {
      ttsCtxRef.current = new AudioContext();
    }
    // Reset VAD state for this recording session
    vadHasSpeechRef.current = false;
    vadIsActiveRef.current = true;
    if (vadSilenceTimerRef.current) {
      clearTimeout(vadSilenceTimerRef.current);
      vadSilenceTimerRef.current = null;
    }
    setRecording(true);
    await startRec();
  }, [startRec, setRecording]);

  // Prefer localMessages when present — they're updated immediately on each turn.
  // Fall back to server-fetched messages only on initial load (e.g. page refresh).
  const messages = localMessages.length > 0 ? localMessages : (conversation?.messages ?? []);

  return (
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
          p: { xs: 2, md: 4 },
          pb: { xs: 2, md: 4 },
          gap: 2,
        }}
      >
        {/* Top bar */}
        <AppBar
          position="static"
          color="transparent"
          elevation={0}
          sx={{ flexShrink: 0 }}
        >
          <Toolbar variant="dense" disableGutters sx={{ pl: "10px" }}>
            <Typography variant="h6" sx={{ flex: 1, fontWeight: 700, letterSpacing: "-0.02em" }}>
              Sentinel
            </Typography>

            {templates.length > 0 && (
              <Select
                size="small"
                value={activeSmeId}
                onChange={(e) => selectSme(e.target.value)}
                sx={{ mr: 1, minWidth: 180 }}
                aria-label="Select subject matter expert"
              >
                {templates.map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name}
                  </MenuItem>
                ))}
              </Select>
            )}

            <Tooltip title={drawerOpen ? "Hide transcript" : "Show transcript"}>
              <IconButton onClick={toggleDrawer} aria-label="Toggle transcript drawer">
                <ChatIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Configure SMEs">
              <IconButton onClick={() => navigate("/config")} aria-label="Go to configuration">
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          </Toolbar>
        </AppBar>

        {/* Waveform */}
        <Box
          sx={{
            flex: 1,
            position: "relative",
            borderRadius: 3,
            overflow: "hidden",
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <Waveform
            amplitude={amplitude}
            active={recording || isTtsPlaying}
            color={theme.palette.primary.main}
            peakColor={theme.palette.secondary.light}
            kind={activeSme?.visualisation_kind ?? "wave"}
          />

          {/* Reasoning steps overlay — most recent run only */}
          <Box
            sx={{
              position: "absolute",
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 10,
            }}
          >
            <ReasoningSteps steps={steps} isStreaming={isStreaming} />
          </Box>

          {/* Step history button — bottom-left */}
          {stepHistory.length > 0 && (
            <Box sx={{ position: "absolute", bottom: 16, left: 16, zIndex: 10 }}>
              <Tooltip title="Step history">
                <IconButton
                  size="small"
                  onClick={(e) => setHistoryAnchor(e.currentTarget)}
                  aria-label="Show step history"
                  sx={{
                    bgcolor: "background.paper",
                    border: "1px solid",
                    borderColor: "divider",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <HistoryIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>

        {/* Step history popover */}
        <Popover
          open={Boolean(historyAnchor)}
          anchorEl={historyAnchor}
          onClose={() => setHistoryAnchor(null)}
          anchorOrigin={{ vertical: "top", horizontal: "right" }}
          transformOrigin={{ vertical: "bottom", horizontal: "left" }}
          slotProps={{
            paper: {
              sx: {
                p: 2,
                width: 340,
                maxHeight: 420,
                overflowY: "auto",
                bgcolor: "background.paper",
                border: "1px solid",
                borderColor: "divider",
              },
            },
          }}
        >
          <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>
            Step History
          </Typography>
          {[...stepHistory].reverse().map((run, i) => {
            const runNumber = stepHistory.length - i;
            return (
              <Box key={runNumber}>
                <Typography
                  variant="caption"
                  color="text.disabled"
                  sx={{ display: "block", mb: 0.5, fontWeight: 600 }}
                >
                  Run {runNumber}
                </Typography>
                <Stack spacing={0.25} sx={{ mb: 0.75 }}>
                  {run.map((step) => (
                    <Stack
                      key={step.step_id}
                      direction="row"
                      spacing={0.75}
                      sx={{ alignItems: "center" }}
                    >
                      <CheckCircleIcon sx={{ fontSize: 12, color: "text.disabled", flexShrink: 0 }} />
                      <Typography variant="caption" color="text.disabled" sx={{ flex: 1 }}>
                        {step.step_name}
                      </Typography>
                      {step.latency_ms != null && (
                        <Chip
                          label={`${Math.round(step.latency_ms)} ms`}
                          size="small"
                          variant="outlined"
                          sx={{ height: 16, fontSize: 9, opacity: 0.7 }}
                        />
                      )}
                    </Stack>
                  ))}
                </Stack>
                {i < stepHistory.length - 1 && <Divider sx={{ mb: 0.75 }} />}
              </Box>
            );
          })}
        </Popover>

        {/* Mic button */}
        <Stack sx={{ alignItems: "center", flexShrink: 0 }}>
          <MicButton
            state={recState}
            onStart={handleMicStart}
            onStop={handleMicStop}
            disabled={isStreaming}
          />
        </Stack>
      </Box>

      {/* Persistent transcript panel */}
      <TranscriptDrawer
        open={drawerOpen}
        onClose={toggleDrawer}
        messages={messages}
        steps={steps}
        stepsByMsgId={stepsByMsgId}
        onSendText={handleSendText}
        isStreaming={isStreaming}
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
  );
}
