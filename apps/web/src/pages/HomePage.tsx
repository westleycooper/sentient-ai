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
  AppBar,
  Box,
  IconButton,
  MenuItem,
  Select,
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
import { streamEvents } from "../api/client";
import type { TurnEvent } from "../api/hooks";

export function HomePage() {
  const navigate = useNavigate();
  const { drawerOpen, toggleDrawer, selectedSmeId, selectSme, recording, setRecording } =
    useUiStore();

  const [amplitude, setAmplitude] = useState<Float32Array>(new Float32Array(256));
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);

  const stopStreamRef = useRef<(() => void) | null>(null);

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

  const handleMicStop = useCallback(async () => {
    setRecording(false);
    const blob = await stopRec();
    setAmplitude(new Float32Array(256));

    const text = "[voice input — STT not yet wired]";
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

    const stopStream = streamEvents(
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
        } else if (ev.type === "error") {
          setIsStreaming(false);
        }
      },
      () => setIsStreaming(false)
    );
    stopStreamRef.current = stopStream;
  }, [stopRec, ensureConversation, setRecording]);

  const handleMicStart = useCallback(async () => {
    setRecording(true);
    await startRec();
  }, [startRec, setRecording]);

  const messages = conversation?.messages ?? localMessages;

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
        <Waveform amplitude={amplitude} active={recording} />

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
      <Stack alignItems="center" sx={{ pb: 5, pt: 2 }}>
        <MicButton
          state={recState}
          onStart={handleMicStart}
          onStop={handleMicStop}
          disabled={isStreaming}
        />
      </Stack>

      {/* Transcript drawer */}
      <TranscriptDrawer open={drawerOpen} onClose={toggleDrawer} messages={messages} />
    </Box>
  );
}
