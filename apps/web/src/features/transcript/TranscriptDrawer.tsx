import { useEffect, useRef, useState, useCallback, type ComponentProps } from "react";
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
import PsychologyAltOutlinedIcon from "@mui/icons-material/PsychologyAltOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import type { Message, StepEvent } from "../../api/hooks";
import { useUiStore } from "../../store/uiStore";
import { formatLatency } from "../../lib/formatLatency";

const LANG_ACCENT: Record<string, string> = {
  bash: "#22d3ee", sh: "#22d3ee",
  diff: "#fb923c",
  python: "#fbbf24", py: "#fbbf24",
  typescript: "#60a5fa", ts: "#60a5fa", tsx: "#60a5fa",
  javascript: "#facc15", js: "#facc15", jsx: "#facc15",
  json: "#86efac", yaml: "#86efac", yml: "#86efac",
};

function CustomPre({ children, ...props }: ComponentProps<"pre">) {
  // Extract language from child <code className="language-*">
  let lang = "";
  const child = Array.isArray(children) ? children[0] : children;
  if (child && typeof child === "object" && "props" in (child as object)) {
    const cls = ((child as { props?: { className?: string } }).props?.className) ?? "";
    if (cls.startsWith("language-")) lang = cls.replace("language-", "");
  }
  const accent = LANG_ACCENT[lang];
  return (
    <Box
      component="pre"
      {...(props as object)}
      sx={{
        bgcolor: "action.hover",
        borderRadius: 1,
        borderLeft: `3px solid ${accent ?? "transparent"}`,
        mt: 0.5, mb: 0.5,
        maxHeight: 300, overflowY: "auto", overflowX: "auto",
        fontSize: "0.78rem", lineHeight: 1.5,
        position: "relative",
        "& code": { wordBreak: "normal", bgcolor: "transparent", px: 0, fontSize: "inherit" },
      }}
    >
      {lang && (
        <Box
          component="span"
          sx={{
            position: "absolute", top: 4, right: 6,
            fontSize: "0.65rem", fontFamily: "monospace",
            color: accent ?? "text.disabled",
            opacity: 0.75, userSelect: "none",
          }}
        >
          {lang}
        </Box>
      )}
      <Box component="div" sx={{ p: 1 }}>
        {children}
      </Box>
    </Box>
  );
}

const MARKDOWN_COMPONENTS: Components = { pre: CustomPre };

const DRAWER_MIN = 280;
const DRAWER_MAX = 860;

interface TranscriptDrawerProps {
  open: boolean;
  onClose: () => void;
  messages: Message[];
  steps: StepEvent[];
  stepsByMsgId: Record<string, StepEvent[]>;
  isStreaming: boolean;
  onSendText: (text: string) => void;
  /** If provided, assistant bubbles show a play button that calls this with the message text. */
  onPlayMessage?: (text: string) => void;
}

export function TranscriptDrawer({ open, onClose, messages, steps, stepsByMsgId, isStreaming, onSendText, onPlayMessage }: TranscriptDrawerProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const { drawerWidth, setDrawerWidth } = useUiStore();
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(0);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartW.current = drawerWidth;
  }, [drawerWidth]);

  useEffect(() => {
    if (!isDragging) return;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    const onMove = (e: MouseEvent) => {
      const dx = dragStartX.current - e.clientX;
      setDrawerWidth(Math.max(DRAWER_MIN, Math.min(DRAWER_MAX, dragStartW.current + dx)));
    };
    const onUp = () => {
      setIsDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, setDrawerWidth]);

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
        width: open ? drawerWidth : 0,
        flexShrink: 0,
        transition: isDragging ? "none" : "width 0.25s",
        "& .MuiDrawer-paper": {
          width: drawerWidth,
          bgcolor: "background.paper",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          height: "100%",
          border: "none",
          borderLeft: "1px solid",
          borderColor: "divider",
          transition: isDragging ? "none" : "width 0.25s",
          overflow: "visible",
        },
      }}
    >
      {/* Drag-to-resize handle on the left edge */}
      <Box
        onMouseDown={handleResizeStart}
        sx={{
          position: "absolute",
          left: -4,
          top: 0,
          bottom: 0,
          width: 8,
          cursor: "ew-resize",
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          "&::after": {
            content: '""',
            display: "block",
            width: 2,
            height: "40%",
            borderRadius: 1,
            bgcolor: isDragging ? "primary.main" : "divider",
            transition: "background-color 0.15s",
          },
          "&:hover::after": { bgcolor: "primary.main" },
        }}
      />
      <Toolbar
        sx={{
          display: "flex",
          justifyContent: "space-between",
          borderBottom: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
          py: "26px",
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

                <MessageBubble
                  message={msg}
                  onPlay={
                    onPlayMessage && msg.role === "assistant" && msg.content
                      ? () => onPlayMessage(msg.content)
                      : undefined
                  }
                />
              </Box>
            ))}
          </Stack>
        )}
        <div ref={bottomRef} />
      </Box>

      <Box sx={{ pt: 1.5, px: 1.5, pb: "123px", borderTop: "1px solid", borderColor: "divider", flexShrink: 0 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Type a message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          disabled={isStreaming}
          slotProps={{
            htmlInput: { "aria-label": "Type a message" },
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
            {totalTokens} tokens · {formatLatency(totalMs)}
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
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "primary.main", flexShrink: 0 }} />
          <Typography variant="caption" sx={{ fontWeight: 600 }}>{step.step_name}</Typography>
          {step.model && (
            <Tooltip title={`Model: ${step.model}`}>
              <PsychologyAltOutlinedIcon sx={{ fontSize: 13, color: "text.disabled" }} />
            </Tooltip>
          )}
          {step.latency_ms != null && (
            <Typography variant="caption" color="text.disabled">{formatLatency(step.latency_ms)}</Typography>
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

function MessageBubble({ message, onPlay }: { message: Message; onPlay?: () => void }) {
  const isUser = message.role === "user";
  return (
    <Stack direction={isUser ? "row-reverse" : "row"} spacing={1} sx={{ alignItems: "flex-start" }}>
      <Avatar sx={{ width: 28, height: 28, bgcolor: isUser ? "primary.dark" : "secondary.main", flexShrink: 0 }}>
        {isUser ? <PersonIcon sx={{ fontSize: 16 }} /> : <SmartToyIcon sx={{ fontSize: 16 }} />}
      </Avatar>

      <Box
        sx={{
          flex: 1,
          bgcolor: isUser ? "primary.dark" : "background.default",
          // primary.dark is always a saturated, fairly dark accent in both
          // themes — white text reads reliably against it. (MUI's automatic
          // primary.contrastText is derived from primary.main, not .dark, so
          // it doesn't apply cleanly here.)
          color: isUser ? "#fff" : "text.primary",
          borderRadius: 2,
          p: 1.5,
          minWidth: 0,
          maxWidth: "85%",
          overflow: "hidden",
          "& p": { m: 0, mb: 0.5, fontSize: "0.875rem", lineHeight: 1.6 },
          "& p:last-child": { mb: 0 },
          "& h1,& h2,& h3": { mt: 1.5, mb: 0.5, fontSize: "0.875rem", fontWeight: 700 },
          "& ul,& ol": { pl: 2.5, mb: 0.5, fontSize: "0.875rem" },
          "& li": { mb: 0.25 },
          "& code": {
            fontFamily: "monospace",
            fontSize: "0.78rem",
            bgcolor: "action.hover",
            borderRadius: 0.5,
            px: 0.5,
            wordBreak: "break-all",
          },
          // pre styling lives in CustomPre component above
          "& blockquote": {
            borderLeft: "3px solid",
            borderColor: "divider",
            pl: 1.5,
            ml: 0,
            my: 0.5,
            color: "text.secondary",
          },
        }}
      >
        {isUser ? (
          <Typography variant="body2">{message.content}</Typography>
        ) : (
          <Markdown components={MARKDOWN_COMPONENTS}>{message.content}</Markdown>
        )}
        {message.token_count > 0 && (
          <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: "block" }}>
            {message.token_count.toLocaleString()} tokens
          </Typography>
        )}
      </Box>

      {/* Play button sits outside the bubble, to the right, aligned top */}
      {!isUser && onPlay && (
        <Tooltip title="Read aloud">
          <IconButton
            size="small"
            onClick={onPlay}
            aria-label="Read message aloud"
            sx={{ flexShrink: 0, mt: 0.25, color: "text.disabled", "&:hover": { color: "primary.main" } }}
          >
            <PlayArrowIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  );
}
