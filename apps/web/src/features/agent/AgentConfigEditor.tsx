import { useState, useEffect, useMemo } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  FormGroup,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CodeIcon from "@mui/icons-material/Code";
import WebIcon from "@mui/icons-material/Web";

import {
  useAgentConfig,
  useAgentModels,
  useUpdateAgentConfig,
  type AgentConfig,
} from "../../api/hooks";
import { RulesEditor } from "../config/RulesEditor";
import { RagSourcesEditor } from "../config/RagSourcesEditor";
import { THEMES } from "../../themes/index";

const TOOL_LABELS: Record<string, string> = {
  bash: "Bash — run shell commands",
  read_file: "Read file",
  write_file: "Write file",
  edit_file: "Edit file (string replace)",
  list_directory: "List directory",
};

const DEFAULT_CONFIG: AgentConfig = {
  model: "claude-sonnet-5",
  working_mode: "full",
  system_prompt: "",
  auto_allow_tools: [],
  rules: [],
  sources: [],
  theme_id: "dark-teal",
};

const FALLBACK_MODELS = [
  { id: "claude-fable-5",           label: "Fable 5",   description: "Agentic — purpose-built for long multi-step coding tasks" },
  { id: "claude-sonnet-5",          label: "Sonnet 5",  description: "Balanced — fast and capable for most code changes" },
  { id: "claude-opus-4-8",          label: "Opus 4.8",  description: "Complex — best reasoning for large refactors" },
  { id: "claude-haiku-4-5-20251001",label: "Haiku 4.5", description: "Fast — quick fixes and simple lookups" },
];

export function AgentConfigEditor() {
  const { data: serverConfig, isLoading: configLoading } = useAgentConfig();
  const { data: serverModels, isLoading: modelsLoading } = useAgentModels();
  const updateMutation = useUpdateAgentConfig();
  const [tab, setTab] = useState(0);

  const [draft, setDraft] = useState<AgentConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    if (serverConfig) setDraft({ ...DEFAULT_CONFIG, ...serverConfig });
  }, [serverConfig]);

  const models = useMemo(
    () => (serverModels && serverModels.length > 0 ? serverModels : FALLBACK_MODELS),
    [serverModels],
  );

  if (configLoading || modelsLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", pt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const toggleTool = (tool: string) => {
    setDraft((d) => {
      const has = d.auto_allow_tools.includes(tool);
      return {
        ...d,
        auto_allow_tools: has
          ? d.auto_allow_tools.filter((t) => t !== tool)
          : [...d.auto_allow_tools, tool],
      };
    });
  };

  const handleSave = async () => {
    await updateMutation.mutateAsync(draft);
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 640 }}>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label="Agent config sections">
        <Tab label="Model & Tools" id="tab-model" aria-controls="tabpanel-model" />
        <Tab label="System Prompt" id="tab-prompt" aria-controls="tabpanel-prompt" />
        <Tab label={`Rules (${draft.rules.length})`} id="tab-rules" aria-controls="tabpanel-rules" />
        <Tab label={`RAG Sources (${draft.sources.length})`} id="tab-sources" aria-controls="tabpanel-sources" />
      </Tabs>

      <Divider sx={{ mt: 0 }} />

      {tab === 0 && (
        <Box role="tabpanel" id="tabpanel-model" aria-labelledby="tab-model">
          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Model
              </Typography>
              <RadioGroup
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              >
                {models.map((m) => (
                  <FormControlLabel
                    key={m.id}
                    value={m.id}
                    control={<Radio size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2">{m.label}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {m.description}
                        </Typography>
                      </Box>
                    }
                    sx={{ alignItems: "flex-start", mb: 0.5 }}
                  />
                ))}
              </RadioGroup>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Working Mode
              </Typography>
              <ToggleButtonGroup
                value={draft.working_mode}
                exclusive
                onChange={(_, v: string | null) =>
                  v && setDraft({ ...draft, working_mode: v as AgentConfig["working_mode"] })
                }
                size="small"
                aria-label="Working mode"
              >
                <ToggleButton value="full" sx={{ px: 2 }}>
                  <CodeIcon fontSize="small" sx={{ mr: 0.5 }} />
                  Full
                </ToggleButton>
                <ToggleButton value="frontend_only" sx={{ px: 2 }}>
                  <WebIcon fontSize="small" sx={{ mr: 0.5 }} />
                  Frontend Only
                </ToggleButton>
              </ToggleButtonGroup>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mt: 0.75 }}
              >
                {draft.working_mode === "frontend_only"
                  ? "Writes restricted to apps/web/src/**. Vite HMR picks up changes instantly while pnpm dev is running."
                  : "Full project access — all files and shell commands available."}
              </Typography>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Theme
              </Typography>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel id="agent-theme-label">Theme</InputLabel>
                <Select
                  labelId="agent-theme-label"
                  label="Theme"
                  value={draft.theme_id ?? "dark-teal"}
                  onChange={(e) => setDraft({ ...draft, theme_id: e.target.value })}
                  aria-label="Theme"
                >
                  {Object.values(THEMES).map((t) => (
                    <MenuItem key={t.id} value={t.id}>{t.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                Applied to the code agent page. The coding agent can add new themes by editing{" "}
                <code>apps/web/src/themes/index.ts</code>.
              </Typography>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Auto-Allow Tools
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                These tools run without asking for approval each turn.
              </Typography>
              <FormGroup>
                {Object.entries(TOOL_LABELS).map(([tool, label]) => (
                  <FormControlLabel
                    key={tool}
                    control={
                      <Checkbox
                        size="small"
                        checked={draft.auto_allow_tools.includes(tool)}
                        onChange={() => toggleTool(tool)}
                      />
                    }
                    label={<Typography variant="body2">{label}</Typography>}
                  />
                ))}
              </FormGroup>
            </Box>
          </Stack>
        </Box>
      )}

      {tab === 1 && (
        <Box role="tabpanel" id="tabpanel-prompt" aria-labelledby="tab-prompt">
          <Typography variant="subtitle2" gutterBottom>
            System Prompt
          </Typography>
          <TextField
            multiline
            minRows={10}
            fullWidth
            value={draft.system_prompt}
            onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })}
            slotProps={{ htmlInput: { "aria-label": "System prompt" } }}
            size="small"
            helperText="Appended after the built-in coding assistant instructions. Leave blank to use defaults only."
          />
        </Box>
      )}

      {tab === 2 && (
        <Box role="tabpanel" id="tabpanel-rules" aria-labelledby="tab-rules">
          <RulesEditor
            rules={draft.rules}
            onChange={(rules) => setDraft((d) => ({ ...d, rules }))}
          />
        </Box>
      )}

      {tab === 3 && (
        <Box role="tabpanel" id="tabpanel-sources" aria-labelledby="tab-sources">
          <RagSourcesEditor
            sources={draft.sources}
            onChange={(sources) => setDraft((d) => ({ ...d, sources }))}
          />
        </Box>
      )}

      <Divider />

      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? "Saving…" : "Save"}
        </Button>
        {updateMutation.isError && (
          <Alert severity="error" sx={{ flex: 1, py: 0 }}>
            {(updateMutation.error as Error).message}
          </Alert>
        )}
        {updateMutation.isSuccess && (
          <Alert severity="success" sx={{ flex: 1, py: 0 }}>
            Saved.
          </Alert>
        )}
      </Stack>
    </Stack>
  );
}
