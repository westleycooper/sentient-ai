/**
 * HomePage — the primary voice agent interface.
 *
 * Layout: full-screen dark canvas with:
 * - Three.js waveform (centre)
 * - Mic button (bottom-centre)
 * - Reasoning steps overlay (fades in during a turn)
 * - Toolbar: SME selector, transcript drawer toggle, config link
 */
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  AppBar,
  Box,
  IconButton,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import ChatIcon from "@mui/icons-material/Chat";
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
  const navigate = useNavigate();
  const { drawerOpen, toggleDrawer, selectedSmeId, selectSme, recording, setRecording } =
    useUiStore();

  const [amplitude, setAmplitude] = useState<Float32Array>(new Float32Array(256));
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);

  const stopStreamRef = useRef<(() => void) | null>(null);
  const ttsAnimRef = useRef<number>(0);
  // AudioContext created once on first mic click so it's inside a user gesture
  const ttsCtxRef = useRef<AudioContext | null>(null);

  const { data: templates = [] } = useSmeTemplates();
  const { data: conversation } = useConversation(conversationId);
  const startConvMutation = useStartConversation();

  const activeSmeId = selectedSmeId ?? templates[0]?.id ?? "";

  const handleAmplitudeChunk = useCallback((buf: Float32Array) => {
    setAmplitude(new Float32Array(buf));
  }, []);

  const { state: recState, start: startRec, stop: stopRec } = useVoiceRecorder(handleAmplitudeChunk);

  const ensureConversation = useCallback(async () => {
    if (conversationId) return conversationId;
    const res = await startConvMutation.mutateAsync(activeSmeId);
    setConversationId(res.conversation_id);
    return res.conversation_id;
  }, [conversationId, activeSmeId, startConvMutation]);

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
          const assistantMsg: Message = {
            id: crypto.randomUUID(),
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
          const assistantMsg: Message = {
            id: crypto.randomUUID(),
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
        flexDirection: "column",
        bgcolor: "background.default",
        overflow: "hidden",
      }}
    >
      {/* Top bar */}
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
        <Toolbar variant="dense">
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

          <Tooltip title="Transcript">
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
      <Box sx={{ flex: 1, position: "relative" }}>
        <Waveform amplitude={amplitude} active={recording || isTtsPlaying} />

        {/* Reasoning steps overlay */}
        <Box
          sx={{
            position: "absolute",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
          }}
        >
          <ReasoningSteps steps={steps} isStreaming={isStreaming} />
        </Box>
      </Box>

      {/* Mic button */}
      <Stack sx={{ alignItems: "center", pb: 5, pt: 2 }}>
        <MicButton
          state={recState}
          onStart={handleMicStart}
          onStop={handleMicStop}
          disabled={isStreaming}
        />
      </Stack>

      {/* Transcript drawer */}
      <TranscriptDrawer
        open={drawerOpen}
        onClose={toggleDrawer}
        messages={messages}
        steps={steps}
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
