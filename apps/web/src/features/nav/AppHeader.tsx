/**
 * AppHeader — shared top bar for all full-screen pages.
 *
 * Layout: [Title] [Voice|Code toggle]  ...spacer...  [children]  [Chat icon]
 *
 * Callers pass mode-specific controls as children (SME selector, settings icon,
 * connected chip, etc.). The Voice/Code toggle and chat icon are always present.
 */
import { Box, AppBar, IconButton, Toolbar, Tooltip, Typography } from "@mui/material";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { useNavigate } from "react-router-dom";
import ChatIcon from "@mui/icons-material/Chat";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import TerminalIcon from "@mui/icons-material/Terminal";

interface AppHeaderProps {
  mode: "voice" | "code";
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  /** Mode-specific controls rendered between the spacer and the chat icon. */
  children?: React.ReactNode;
  /**
   * Show the Code toggle. Defaults to true; callers should pass the
   * GET /mcp-status `mounted` flag — the coding agent (ADR-0003) and the MCP
   * server (ADR-0004) share the same `ENV != production` gate in main.py, so
   * that one signal is reused here rather than adding a second status field.
   */
  showCodeToggle?: boolean;
}

export function AppHeader({ mode, drawerOpen, onToggleDrawer, children, showCodeToggle = true }: AppHeaderProps) {
  const navigate = useNavigate();

  return (
    <AppBar position="static" color="transparent" elevation={0} sx={{ flexShrink: 0 }}>
      <Toolbar variant="dense" disableGutters>
        <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: "-0.02em", mr: 3 }}>
          Sentinel
        </Typography>

        <ToggleButtonGroup
          value={mode}
          exclusive
          size="small"
          onChange={(_, val) => {
            if (val === "voice") navigate("/");
            if (val === "code") navigate("/agent");
          }}
          aria-label="Switch mode"
        >
          <ToggleButton value="voice" aria-label="Voice agent" sx={{ px: 1.5 }}>
            <GraphicEqIcon sx={{ fontSize: 16, mr: 0.5 }} />
            Voice
          </ToggleButton>
          {showCodeToggle && (
            <ToggleButton value="code" aria-label="Coding agent" sx={{ px: 1.5 }}>
              <TerminalIcon sx={{ fontSize: 16, mr: 0.5 }} />
              Code
            </ToggleButton>
          )}
        </ToggleButtonGroup>

        <Box sx={{ flex: 1 }} />

        {children}

        <Tooltip title={drawerOpen ? "Hide transcript" : "Show transcript"}>
          <IconButton onClick={onToggleDrawer} aria-label="Toggle transcript drawer">
            <ChatIcon />
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}
