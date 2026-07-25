/**
 * McpPage — MCP server topology view (ADR-0004). Shows what Sentient exposes
 * to external MCP clients and live counts, pulled from GET /mcp-status.
 * Not the MCP protocol endpoint itself (that's /mcp, local-only) — this page
 * always renders, including in production, showing an honest "not mounted"
 * state when the protocol endpoint isn't live.
 */
import { useNavigate } from "react-router-dom";
import { AppBar, Box, Chip, CircularProgress, IconButton, Toolbar, Tooltip, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useMcpStatus } from "../api/hooks";
import { McpLiveStats } from "../features/mcp/McpLiveStats";
import { McpTopologyDiagram } from "../features/mcp/McpTopologyDiagram";

export function McpPage() {
  const navigate = useNavigate();
  const { data: status, isLoading } = useMcpStatus();

  return (
    <Box sx={{ height: "100dvh", display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
        <Toolbar>
          <Tooltip title="Back to voice agent">
            <IconButton edge="start" onClick={() => navigate("/")} aria-label="Back to voice agent" sx={{ mr: 1 }}>
              <ArrowBackIcon />
            </IconButton>
          </Tooltip>
          <Typography variant="h6" sx={{ flex: 1 }}>
            MCP Server
          </Typography>
          {status && (
            <Chip
              size="small"
              variant="outlined"
              color={status.mounted ? "success" : "default"}
              label={status.mounted ? "Mounted (local only)" : "Not mounted — production"}
            />
          )}
        </Toolbar>
      </AppBar>
      <Box sx={{ flex: 1, overflowY: "auto", p: 3 }}>
        {isLoading || !status ? (
          <Box sx={{ display: "flex", justifyContent: "center", pt: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <McpLiveStats status={status} />
            <McpTopologyDiagram status={status} />
          </>
        )}
      </Box>
    </Box>
  );
}
