import {
  Avatar,
  Box,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import PersonIcon from "@mui/icons-material/Person";
import type { Message } from "../../api/hooks";

const DRAWER_WIDTH = 380;

interface TranscriptDrawerProps {
  open: boolean;
  onClose: () => void;
  messages: Message[];
}

export function TranscriptDrawer({ open, onClose, messages }: TranscriptDrawerProps) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        "& .MuiDrawer-paper": {
          width: DRAWER_WIDTH,
          bgcolor: "background.paper",
          boxSizing: "border-box",
        },
      }}
    >
      <Toolbar
        sx={{
          display: "flex",
          justifyContent: "space-between",
          borderBottom: "1px solid",
          borderColor: "divider",
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
        {messages.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 4 }}>
            No messages yet. Start speaking!
          </Typography>
        ) : (
          <Stack spacing={2} divider={<Divider />}>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </Stack>
        )}
      </Box>
    </Drawer>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <Stack
      direction={isUser ? "row-reverse" : "row"}
      spacing={1}
      alignItems="flex-start"
    >
      <Avatar sx={{ width: 28, height: 28, bgcolor: isUser ? "primary.main" : "secondary.main" }}>
        {isUser ? <PersonIcon sx={{ fontSize: 16 }} /> : <SmartToyIcon sx={{ fontSize: 16 }} />}
      </Avatar>
      <Box
        sx={{
          flex: 1,
          bgcolor: isUser ? "primary.dark" : "background.default",
          borderRadius: 2,
          p: 1.5,
          maxWidth: "85%",
        }}
      >
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
          {message.content}
        </Typography>
        {message.token_count > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
            {message.token_count} tokens
          </Typography>
        )}
      </Box>
    </Stack>
  );
}
