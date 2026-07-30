/**
 * Full SME template editor — soul, steps, sources, rules.
 * Presented as a form; calls onSave with the updated template.
 */
import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import PsychologyAltOutlinedIcon from "@mui/icons-material/PsychologyAltOutlined";
import SaveIcon from "@mui/icons-material/Save";
import { StepEditor } from "./StepEditor";
import { RagSourcesEditor } from "./RagSourcesEditor";
import { RulesEditor } from "./RulesEditor";
import { LessonEditor } from "./LessonEditor";
import { ModelBrowser } from "./ModelBrowser";
import { useModelDisplay } from "./useModelDisplay";
import type { SmeTemplate } from "../../api/hooks";
import { THEMES } from "../../themes/index";

interface SmeEditorProps {
  template: SmeTemplate;
  onSave: (t: SmeTemplate) => void;
  isSaving: boolean;
  saveError?: string | null;
}

export function SmeEditor({ template, onSave, isSaving, saveError }: SmeEditorProps) {
  const [draft, setDraft] = useState<SmeTemplate>(template);
  const [tab, setTab] = useState(0);
  const [modelBrowserOpen, setModelBrowserOpen] = useState(false);
  const { describe } = useModelDisplay();

  useEffect(() => {
    setDraft(template);
    setTab(0);
    // Intentionally reset only when the selected template changes, not on
    // every `template` prop update — that would wipe in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id]);

  const set = <K extends keyof SmeTemplate>(key: K, value: SmeTemplate[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const dirty = JSON.stringify(draft) !== JSON.stringify(template);

  return (
    <Box component="form" onSubmit={(e) => { e.preventDefault(); onSave(draft); }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          <TextField
            label="Template name"
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            required
            size="small"
            sx={{ flex: 1 }}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="vis-kind-label">Waveform</InputLabel>
            <Select
              labelId="vis-kind-label"
              label="Waveform"
              value={draft.visualisation_kind ?? "wave"}
              onChange={(e) => set("visualisation_kind", e.target.value as "wave" | "wavecircle" | "wave3d" | "wave3dgrid" | "wavehead")}
              aria-label="Waveform visualisation"
            >
              <MenuItem value="wave">Sound Wave</MenuItem>
              <MenuItem value="wavecircle">Circle Wave</MenuItem>
              <MenuItem value="wave3d">3D Wave</MenuItem>
              <MenuItem value="wave3dgrid">3D Grid</MenuItem>
              <MenuItem value="wavehead">Talking Head</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel id="theme-label">Theme</InputLabel>
            <Select
              labelId="theme-label"
              label="Theme"
              value={draft.theme_id ?? "dark-teal"}
              onChange={(e) => set("theme_id", e.target.value)}
              aria-label="Theme"
            >
              {Object.values(THEMES).map((t) => (
                <MenuItem key={t.id} value={t.id}>{t.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControlLabel
            control={
              <Switch
                checked={draft.is_default}
                onChange={(e) => set("is_default", e.target.checked)}
                slotProps={{ input: { "aria-label": "Lock — prevent deletion" } }}
              />
            }
            label="Lock"
          />
        </Stack>

        <Box>
          <Chip
            icon={<PsychologyAltOutlinedIcon />}
            label={`${describe(draft.default_model ?? null)} (default)`}
            onClick={() => setModelBrowserOpen(true)}
            variant="outlined"
          />
        </Box>

        <ModelBrowser
          open={modelBrowserOpen}
          onClose={() => setModelBrowserOpen(false)}
          value={draft.default_model ?? null}
          onChange={(id) => set("default_model", id)}
          allowNone
        />

        <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label="SME editor sections">
          <Tab label="Soul / Persona" id="tab-soul" aria-controls="tabpanel-soul" />
          <Tab label={`Steps (${draft.steps.length})`} id="tab-steps" aria-controls="tabpanel-steps" />
          <Tab label={`Rules (${draft.rules.length})`} id="tab-rules" aria-controls="tabpanel-rules" />
          <Tab label={`RAG Sources (${draft.sources.length})`} id="tab-sources" aria-controls="tabpanel-sources" />
          <Tab label={`Lesson (${draft.lesson.questions.length})`} id="tab-lesson" aria-controls="tabpanel-lesson" />
        </Tabs>

        <Divider />

        {tab === 0 && (
          <Box role="tabpanel" id="tabpanel-soul" aria-labelledby="tab-soul">
            <TextField
              label="Soul (system context / persona)"
              multiline
              minRows={6}
              value={draft.soul}
              onChange={(e) => set("soul", e.target.value)}
              fullWidth
              required
              helperText="The system prompt persona for this SME. Be specific about tone, constraints, and domain."
            />
          </Box>
        )}

        {tab === 1 && (
          <Box role="tabpanel" id="tabpanel-steps" aria-labelledby="tab-steps">
            <FormControlLabel
              sx={{ mb: 1.5 }}
              control={
                <Switch
                  checked={draft.use_step_models}
                  onChange={(e) => set("use_step_models", e.target.checked)}
                />
              }
              label={
                <Box>
                  <Typography variant="body2">Use different models for reasoning steps</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Off: every step uses the template's default model above. On: each step below
                    can choose its own model, falling back to the default when unset.
                  </Typography>
                </Box>
              }
            />
            <StepEditor
              steps={draft.steps}
              onChange={(steps) => set("steps", steps)}
              useStepModels={draft.use_step_models}
            />
          </Box>
        )}

        {tab === 2 && (
          <Box role="tabpanel" id="tabpanel-rules" aria-labelledby="tab-rules">
            <RulesEditor rules={draft.rules} onChange={(r) => set("rules", r)} />
          </Box>
        )}

        {tab === 3 && (
          <Box role="tabpanel" id="tabpanel-sources" aria-labelledby="tab-sources">
            <RagSourcesEditor sources={draft.sources} onChange={(s) => set("sources", s)} />
          </Box>
        )}

        {tab === 4 && (
          <Box role="tabpanel" id="tabpanel-lesson" aria-labelledby="tab-lesson">
            <LessonEditor value={draft.lesson} onChange={(l) => set("lesson", l)} />
          </Box>
        )}

        {saveError && <Alert severity="error">{saveError}</Alert>}

        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button
            type="submit"
            variant="contained"
            startIcon={<SaveIcon />}
            disabled={!dirty || isSaving}
            aria-label="Save template"
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}

