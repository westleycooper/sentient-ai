/**
 * McpTopologyDiagram — static architecture view of the MCP server (ADR-0004):
 * a "Sentinel MCP Server" card, with "Resources" and "Tools" columns below it,
 * each item rendered entirely from the backend-provided `wraps` field so the
 * diagram never hardcodes a frontend-side mapping that can drift from the
 * backend's actual resource/tool registration.
 */
import { Box, Chip, Divider, Paper, Stack, Typography } from "@mui/material";
import StorageIcon from "@mui/icons-material/Storage";
import BuildIcon from "@mui/icons-material/Build";
import HubIcon from "@mui/icons-material/Hub";
import type { McpResourceInfo, McpStatus, McpToolInfo } from "../../api/hooks";

function ResourceCard({ resource }: { resource: McpResourceInfo }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderColor: "divider" }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
        <StorageIcon sx={{ fontSize: 16, color: "text.disabled" }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {resource.name}
        </Typography>
      </Stack>
      <Chip
        label={resource.uri_template}
        size="small"
        variant="outlined"
        sx={{ height: 18, fontSize: 10, fontFamily: "monospace", mb: 0.75 }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {resource.description}
      </Typography>
      <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.5 }}>
        → {resource.wraps}
      </Typography>
    </Paper>
  );
}

function ToolCard({ tool }: { tool: McpToolInfo }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderColor: "divider" }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
        <BuildIcon sx={{ fontSize: 16, color: "text.disabled" }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {tool.name}
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {tool.description}
      </Typography>
      <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.5 }}>
        → {tool.wraps}
      </Typography>
    </Paper>
  );
}

export function McpTopologyDiagram({ status }: { status: McpStatus }) {
  return (
    <Box>
      <Paper
        sx={{
          p: 2,
          mb: 3,
          textAlign: "center",
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "primary.main",
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "center" }}>
          <HubIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Sentinel MCP Server
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.disabled">
          {status.mount_path} — {status.mounted ? "mounted, local only" : "not mounted"}
        </Typography>
      </Paper>

      <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="overline" color="text.disabled" sx={{ fontWeight: 700 }}>
            Resources
          </Typography>
          <Divider sx={{ mb: 1.5 }} />
          <Stack spacing={1.5}>
            {status.resources.map((r) => (
              <ResourceCard key={r.uri_template} resource={r} />
            ))}
          </Stack>
        </Box>

        <Box sx={{ flex: 1 }}>
          <Typography variant="overline" color="text.disabled" sx={{ fontWeight: 700 }}>
            Tools
          </Typography>
          <Divider sx={{ mb: 1.5 }} />
          <Stack spacing={1.5}>
            {status.tools.map((t) => (
              <ToolCard key={t.name} tool={t} />
            ))}
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}
