/**
 * McpTopologyDiagram — architecture view of the MCP server (ADR-0004) that
 * doubles as a small interactive explorer (ADR-0004 addendum): a
 * "Sentient AI MCP Server" card, with "Resources" and "Tools" columns below it.
 * Each card is rendered entirely from backend-provided fields (`wraps`,
 * `params`, `input_schema`) so the diagram never hardcodes a frontend-side
 * mapping that can drift from the backend's actual resource/tool registration.
 *
 * Resources/tools with no params/required fields can be run immediately;
 * MCP resource URIs (`sentient://...`) aren't browser-fetchable on their own
 * (reading one is a real MCP protocol call — initialize + JSON-RPC
 * resources/read over Streamable HTTP), so these buttons go through the
 * plain-REST explorer endpoints (POST /mcp-status/resources/read,
 * POST /mcp-status/tools/call) instead of a raw href.
 */
import { useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Divider, Paper, Stack, TextField, Typography } from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StorageIcon from "@mui/icons-material/Storage";
import BuildIcon from "@mui/icons-material/Build";
import HubIcon from "@mui/icons-material/Hub";
import {
  useCallMcpTool,
  useReadMcpResource,
  type McpResourceInfo,
  type McpStatus,
  type McpToolInfo,
} from "../../api/hooks";

function ResultPanel({ content, error }: { content?: unknown; error?: string | null }) {
  if (error) return <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>;
  if (content === undefined) return null;
  return (
    <Box
      component="pre"
      sx={{
        mt: 1,
        fontFamily: "monospace",
        fontSize: "0.72rem",
        color: "text.secondary",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        bgcolor: "action.hover",
        borderRadius: 1,
        p: 1,
        maxHeight: 240,
        overflowY: "auto",
      }}
    >
      {JSON.stringify(content, null, 2)}
    </Box>
  );
}

function ResourceCard({ resource }: { resource: McpResourceInfo }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const mutation = useReadMcpResource();
  const canRun = resource.params.every((p) => (values[p] ?? "").trim().length > 0);

  const run = () => {
    const uri = resource.params.reduce(
      (acc, p) => acc.replace(`{${p}}`, encodeURIComponent(values[p])),
      resource.uri_template
    );
    mutation.mutate(uri);
  };

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
      <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.5, mb: 1 }}>
        → {resource.wraps}
      </Typography>

      {resource.params.length > 0 && (
        <Stack spacing={1} sx={{ mb: 1 }}>
          {resource.params.map((p) => (
            <TextField
              key={p}
              label={p}
              size="small"
              value={values[p] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [p]: e.target.value }))}
              slotProps={{ htmlInput: { "aria-label": `${resource.name} ${p}` } }}
            />
          ))}
        </Stack>
      )}

      <Button
        size="small"
        variant="outlined"
        startIcon={mutation.isPending ? <CircularProgress size={14} /> : <PlayArrowIcon />}
        onClick={run}
        disabled={!canRun || mutation.isPending}
      >
        Read
      </Button>

      <ResultPanel
        content={mutation.isSuccess ? mutation.data.content : undefined}
        error={mutation.isError ? (mutation.error as Error).message : null}
      />
    </Paper>
  );
}

function ToolCard({ tool }: { tool: McpToolInfo }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const mutation = useCallMcpTool();
  const properties = Object.entries(tool.input_schema.properties ?? {});
  const required = tool.input_schema.required ?? [];
  const canRun = required.every((name) => (values[name] ?? "").trim().length > 0);

  const run = () => {
    const args: Record<string, unknown> = {};
    for (const [name, schema] of properties) {
      const raw = values[name];
      if (raw === undefined || raw === "") continue;
      args[name] = schema.type === "integer" || schema.type === "number" ? Number(raw) : raw;
    }
    mutation.mutate({ name: tool.name, arguments: args });
  };

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
      <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.5, mb: 1 }}>
        → {tool.wraps}
      </Typography>

      {properties.length > 0 && (
        <Stack spacing={1} sx={{ mb: 1 }}>
          {properties.map(([name, schema]) => (
            <TextField
              key={name}
              label={schema.title ?? name}
              size="small"
              required={required.includes(name)}
              type={schema.type === "integer" || schema.type === "number" ? "number" : "text"}
              value={values[name] ?? (schema.default != null ? String(schema.default) : "")}
              onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
              slotProps={{ htmlInput: { "aria-label": `${tool.name} ${name}` } }}
            />
          ))}
        </Stack>
      )}

      <Button
        size="small"
        variant="outlined"
        startIcon={mutation.isPending ? <CircularProgress size={14} /> : <PlayArrowIcon />}
        onClick={run}
        disabled={!canRun || mutation.isPending}
      >
        Invoke
      </Button>

      <ResultPanel
        content={mutation.isSuccess ? mutation.data.content : undefined}
        error={mutation.isError ? (mutation.error as Error).message : null}
      />
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
            Sentient AI MCP Server
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
