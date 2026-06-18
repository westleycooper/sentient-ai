import { useEffect, useRef, useState } from "react";
import {
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SendIcon from "@mui/icons-material/Send";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import PersonIcon from "@mui/icons-material/Person";
import PsychologyIcon from "@mui/icons-material/Psychology";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Markdown from "react-markdown";
import type { Message, StepEvent } from "../../api/hooks";

const DRAWER_WIDTH = 400;

interface TranscriptDrawerProps {
  open: boolean;
  onClose: () => void;
  messages: Message[];
  steps: StepEvent[];
  stepsByMsgId: Record<string, StepEvent[]>;
  isStreaming: boolean;
  onSendText: (text: string) => void;
}

export function TranscriptDrawer({ open, onClose, messages, steps, stepsByMsgId, isStreaming, onSendText }: TranscriptDrawerProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, steps]);

  const submit = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    onSendText(text);
  };

  const isLastMsg = (idx: number) => idx === messages.length - 1;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      variant="persistent"
      sx={{
        width: open ? DRAWER_WIDTH : 0,
        flexShrink: 0,
        transition: "width 0.25s",
        "& .MuiDrawer-paper": {
          width: DRAWER_WIDTH,
          bgcolor: "background.paper",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          height: "100%",
          border: "none",
          borderLeft: "1px solid",
          borderColor: "divider",
        },
      }}
    >
      <Toolbar
        sx={{
          display: "flex",
          justifyContent: "space-between",
          borderBottom: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <Typography variant="h6" component="h2">
          Transcript
        </Typography>
        <Tooltip title="Close transcript">
          <IconButton onClick={onClose} aria-label="Close transcript drawer">
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </Toolbar>

      <Box
        role="log"
        aria-label="Conversation transcript"
        aria-live="polite"
        sx={{ flex: 1, overflowY: "auto", p: 2 }}
      >
        {messages.length === 0 && !isStreaming ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 4 }}>
            No messages yet. Speak or type below.
          </Typography>
        ) : (
          <Stack spacing={2} divider={<Divider />}>
            {messages.map((msg, idx) => (
              <Box key={msg.id}>
                {/* Steps for this assistant response, shown before the bubble */}
                {msg.role === "assistant" && stepsByMsgId[msg.id]?.length > 0 && (
                  <Box sx={{ mb: 1.5 }}>
                    <StepsBlock steps={stepsByMsgId[msg.id]} isStreaming={false} />
                  </Box>
                )}

                {/* Live steps after the last user message while streaming */}
                {msg.role === "user" && isLastMsg(idx) && isStreaming && (
                  <Box sx={{ mt: 1.5 }}>
                    {steps.length > 0 ? (
                      <StepsBlock steps={steps} isStreaming={isStreaming} />
                    ) : (
                      <Stack sx={{ alignItems: "center" }} spacing={1}>
                        <CircularProgress size={20} />
                        <Typography variant="caption" color="text.secondary">Thinking…</Typography>
                      </Stack>
                    )}
                  </Box>
                )}

                <MessageBubble message={msg} />
              </Box>
            ))}
          </Stack>
        )}
        <div ref={bottomRef} />
      </Box>

      <Box sx={{ p: 1.5, borderTop: "1px solid", borderColor: "divider", flexShrink: 0 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Type a message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          disabled={isStreaming}
          aria-label="Type a message"
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  {isStreaming ? (
                    <CircularProgress size={20} />
                  ) : (
                    <Tooltip title="Send (Enter)">
                      <span>
                        <IconButton size="small" onClick={submit} disabled={!input.trim()} aria-label="Send message">
                          <SendIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>
    </Drawer>
  );
}

function StepsBlock({ steps, isStreaming }: { steps: StepEvent[]; isStreaming: boolean }) {
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!isStreaming) {
      const t = setTimeout(() => setExpanded(false), 1500);
      return () => clearTimeout(t);
    } else {
      setExpanded(true);
    }
  }, [isStreaming]);

  const totalTokens = steps.reduce((s, e) => s + (e.total_tokens ?? 0), 0);
  const totalMs = steps.reduce((s, e) => s + (e.latency_ms ?? 0), 0);

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, overflow: "hidden", bgcolor: "background.default" }}>
      <Stack
        direction="row"
        sx={{ px: 1.5, py: 0.75, alignItems: "center", cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
      >
        <PsychologyIcon sx={{ fontSize: 16, mr: 0.75, color: "text.secondary" }} />
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, fontWeight: 600 }}>
          {isStreaming
            ? `Reasoning… (${steps.length} step${steps.length !== 1 ? "s" : ""})`
            : `${steps.length} reasoning step${steps.length !== 1 ? "s" : ""}`}
        </Typography>
        {!isStreaming && totalTokens > 0 && (
          <Typography variant="caption" color="text.disabled" sx={{ mr: 1 }}>
            {totalTokens} tokens · {Math.round(totalMs)}ms
          </Typography>
        )}
        {isStreaming ? (
          <CircularProgress size={12} />
        ) : (
          <ExpandMoreIcon
            sx={{ fontSize: 16, color: "text.secondary", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
          />
        )}
      </Stack>

      <Collapse in={expanded}>
        <Stack spacing={0} divider={<Divider />}>
          {steps.map((step) => <StepRow key={step.step_id} step={step} />)}
        </Stack>
      </Collapse>
    </Box>
  );
}

function StepRow({ step }: { step: StepEvent }) {
  return (
    <Stack direction="row" sx={{ px: 1.5, py: 0.75, alignItems: "flex-start" }} spacing={1}>
      <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "primary.main", mt: 0.75, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography variant="caption" sx={{ fontWeight: 600 }}>{step.step_name}</Typography>
          {step.latency_ms != null && (
            <Typography variant="caption" color="text.disabled">{Math.round(step.latency_ms)}ms</Typography>
          )}
          {step.total_tokens > 0 && (
            <Chip
              label={`${step.total_tokens} tokens`}
              size="small"
              variant="outlined"
              sx={{ height: 16, fontSize: "0.65rem", "& .MuiChip-label": { px: 0.75 } }}
            />
          )}
        </Stack>
        {step.output_preview && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
            {step.output_preview}
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <Stack direction={isUser ? "row-reverse" : "row"} spacing={1} sx={{ alignItems: "flex-start" }}>
      <Avatar sx={{ width: 28, height: 28, bgcolor: isUser ? "#005a64" : "secondary.main" }}>
        {isUser ? <PersonIcon sx={{ fontSize: 16 }} /> : <SmartToyIcon sx={{ fontSize: 16 }} />}
      </Avatar>
      <Box
        sx={{
          flex: 1,
          bgcolor: isUser ? "#00454d" : "background.default",
          borderRadius: 2,
          p: 1.5,
          maxWidth: "85%",
          "& p": { m: 0, mb: 0.5, fontSize: "0.875rem", lineHeight: 1.6 },
          "& p:last-child": { mb: 0 },
          "& h1,& h2,& h3": { mt: 1, mb: 0.5, fontSize: "0.875rem", fontWeight: 700 },
          "& ul,& ol": { pl: 2.5, mb: 0.5, fontSize: "0.875rem" },
          "& li": { mb: 0.25 },
          "& code": { fontFamily: "monospace", fontSize: "0.8rem", bgcolor: "action.hover", borderRadius: 0.5, px: 0.5 },
          "& pre": { bgcolor: "action.hover", borderRadius: 1, p: 1, overflow: "auto", fontSize: "0.8rem" },
        }}
      >
        {isUser ? (
          <Typography variant="body2">{message.content}</Typography>
        ) : (
          <Markdown>{message.content}</Markdown>
        )}
        {message.token_count > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
            {message.token_count.toLocaleString()} tokens
          </Typography>
        )}
      </Box>
    </Stack>
  );
}
