import { useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Divider,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HttpIcon from "@mui/icons-material/Http";
import DataObjectIcon from "@mui/icons-material/DataObject";
import type { RetrievalSource } from "../../api/hooks";

interface RagSourcesEditorProps {
  sources: RetrievalSource[];
  onChange: (sources: RetrievalSource[]) => void;
}

const HTTP_METHODS = ["GET", "POST"];

function blankHttpSource(): RetrievalSource {
  return {
    id: `src-${Date.now()}`,
    name: "New API Source",
    kind: "http_api",
    config: { url: "", method: "GET", auth_header: "", auth_value: "", params: {} },
  };
}

function blankJsonSource(): RetrievalSource {
  return {
    id: `src-${Date.now()}`,
    name: "New JSON Source",
    kind: "json_set",
    config: { documents: [] },
  };
}

export function RagSourcesEditor({ sources, onChange }: RagSourcesEditorProps) {
  const [expanded, setExpanded] = useState<string | null>(sources[0]?.id ?? null);

  const addHttp = () => {
    const s = blankHttpSource();
    onChange([...sources, s]);
    setExpanded(s.id);
  };

  const addJson = () => {
    const s = blankJsonSource();
    onChange([...sources, s]);
    setExpanded(s.id);
  };

  const remove = (id: string) => {
    onChange(sources.filter((s) => s.id !== id));
    if (expanded === id) setExpanded(null);
  };

  const update = (id: string, patch: Partial<RetrievalSource>) =>
    onChange(sources.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const updateConfig = (id: string, configPatch: Record<string, unknown>) =>
    onChange(
      sources.map((s) =>
        s.id === id ? { ...s, config: { ...s.config, ...configPatch } } : s
      )
    );

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Stack spacing={0.25}>
          <Typography variant="subtitle2">RAG Sources</Typography>
          <Typography variant="caption" color="text.secondary">
            Data sources retrieved and injected into each reasoning turn.
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<HttpIcon />} onClick={addHttp} variant="outlined">
            Add API
          </Button>
          <Button size="small" startIcon={<DataObjectIcon />} onClick={addJson} variant="outlined">
            Add JSON
          </Button>
        </Stack>
      </Stack>

      {sources.length === 0 && (
        <Box sx={{ textAlign: "center", py: 4, border: "1px dashed", borderColor: "divider", borderRadius: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            No retrieval sources configured.
          </Typography>
          <Stack direction="row" spacing={1} sx={{ justifyContent: "center" }}>
            <Button size="small" startIcon={<AddIcon />} onClick={addHttp} variant="outlined">
              Add HTTP API endpoint
            </Button>
            <Button size="small" startIcon={<AddIcon />} onClick={addJson} variant="outlined">
              Add JSON document set
            </Button>
          </Stack>
        </Box>
      )}

      {sources.map((src) => (
        <Accordion
          key={src.id}
          expanded={expanded === src.id}
          onChange={(_, open) => setExpanded(open ? src.id : null)}
          variant="outlined"
          sx={{ "&:before": { display: "none" } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flex: 1, mr: 1 }}>
              {src.kind === "http_api" ? (
                <HttpIcon fontSize="small" color="secondary" />
              ) : (
                <DataObjectIcon fontSize="small" color="secondary" />
              )}
              <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                {src.name || "(unnamed)"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {src.kind === "http_api" ? (src.config.url as string) || "no URL" : "JSON set"}
              </Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <TextField
                  label="Source name"
                  size="small"
                  value={src.name}
                  onChange={(e) => update(src.id, { name: e.target.value })}
                  sx={{ flex: 1 }}
                />
                <Select
                  size="small"
                  value={src.kind}
                  onChange={(e) =>
                    update(src.id, {
                      kind: e.target.value as RetrievalSource["kind"],
                      config: e.target.value === "http_api"
                        ? { url: "", method: "GET", auth_header: "", auth_value: "", params: {} }
                        : { documents: [] },
                    })
                  }
                  sx={{ minWidth: 140 }}
                >
                  <MenuItem value="http_api">HTTP API</MenuItem>
                  <MenuItem value="json_set">JSON Set</MenuItem>
                </Select>
                <Tooltip title="Remove source">
                  <IconButton size="small" color="error" onClick={() => remove(src.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>

              <Divider />

              {src.kind === "http_api" && (
                <HttpApiFields src={src} onChange={(p) => updateConfig(src.id, p)} />
              )}
              {src.kind === "json_set" && (
                <JsonSetFields src={src} onChange={(p) => updateConfig(src.id, p)} />
              )}
            </Stack>
          </AccordionDetails>
        </Accordion>
      ))}
    </Stack>
  );
}

function HttpApiFields({
  src,
  onChange,
}: {
  src: RetrievalSource;
  onChange: (p: Record<string, unknown>) => void;
}) {
  const cfg = src.config as {
    url?: string;
    method?: string;
    auth_header?: string;
    auth_value?: string;
    params?: Record<string, string>;
  };

  const [paramsStr, setParamsStr] = useState(
    JSON.stringify(cfg.params ?? {}, null, 2)
  );

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1}>
        <Select
          size="small"
          value={cfg.method ?? "GET"}
          onChange={(e) => onChange({ method: e.target.value })}
          sx={{ minWidth: 100 }}
        >
          {HTTP_METHODS.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
        </Select>
        <TextField
          label="Endpoint URL"
          size="small"
          fullWidth
          value={cfg.url ?? ""}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder="https://api.example.com/data"
        />
      </Stack>

      <Stack direction="row" spacing={1}>
        <TextField
          label="Auth header name"
          size="small"
          sx={{ flex: 1 }}
          value={cfg.auth_header ?? ""}
          onChange={(e) => onChange({ auth_header: e.target.value })}
          placeholder="Authorization"
        />
        <TextField
          label="Auth header value"
          size="small"
          sx={{ flex: 2 }}
          value={cfg.auth_value ?? ""}
          onChange={(e) => onChange({ auth_value: e.target.value })}
          placeholder="Bearer sk-..."
          type="password"
        />
      </Stack>

      <TextField
        label="Query params (JSON)"
        size="small"
        multiline
        rows={3}
        value={paramsStr}
        onChange={(e) => {
          setParamsStr(e.target.value);
          try { onChange({ params: JSON.parse(e.target.value) }); } catch { /* mid-edit */ }
        }}
        helperText='e.g. {"limit": "10", "format": "json"}'
        sx={{ fontFamily: "monospace" }}
      />
    </Stack>
  );
}

function JsonSetFields({
  src,
  onChange,
}: {
  src: RetrievalSource;
  onChange: (p: Record<string, unknown>) => void;
}) {
  const cfg = src.config as { documents?: unknown[] };
  const [raw, setRaw] = useState(JSON.stringify(cfg.documents ?? [], null, 2));

  return (
    <Stack spacing={1}>
      <Typography variant="caption" color="text.secondary">
        Paste a JSON array of documents. Each object should have a <code>text</code> field and
        optionally an <code>id</code> field.
      </Typography>
      <TextField
        label="Documents (JSON array)"
        multiline
        rows={8}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          try { onChange({ documents: JSON.parse(e.target.value) }); } catch { /* mid-edit */ }
        }}
        placeholder='[{"id": "doc1", "text": "..."}, ...]'
        sx={{ fontFamily: "monospace", "& .MuiInputBase-input": { fontFamily: "monospace", fontSize: "0.8rem" } }}
      />
    </Stack>
  );
}
