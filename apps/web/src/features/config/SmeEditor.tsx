/**
 * Full SME template editor — soul, steps, sources, rules.
 * Presented as a form; calls onSave with the updated template.
 */
import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import { StepEditor } from "./StepEditor";
import type { SmeTemplate } from "../../api/hooks";

interface SmeEditorProps {
  template: SmeTemplate;
  onSave: (t: SmeTemplate) => void;
  isSaving: boolean;
  saveError?: string | null;
}

export function SmeEditor({ template, onSave, isSaving, saveError }: SmeEditorProps) {
  const [draft, setDraft] = useState<SmeTemplate>(template);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    setDraft(template);
    setTab(0);
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
          <FormControlLabel
            control={
              <Switch
                checked={draft.is_default}
                onChange={(e) => set("is_default", e.target.checked)}
              />
            }
            label="Show as default"
          />
        </Stack>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label="SME editor sections">
          <Tab label="Soul / Persona" id="tab-soul" aria-controls="tabpanel-soul" />
          <Tab label="Steps" id="tab-steps" aria-controls="tabpanel-steps" />
          <Tab label="Rules" id="tab-rules" aria-controls="tabpanel-rules" />
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
            <StepEditor steps={draft.steps} onChange={(steps) => set("steps", steps)} />
          </Box>
        )}

        {tab === 2 && (
          <Box role="tabpanel" id="tabpanel-rules" aria-labelledby="tab-rules">
            <RulesEditor
              rules={draft.rules}
              onChange={(r) => set("rules", r)}
            />
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

function RulesEditor({
  rules,
  onChange,
}: {
  rules: SmeTemplate["rules"];
  onChange: (r: SmeTemplate["rules"]) => void;
}) {
  const add = () =>
    onChange([...rules, { id: `rule-${Date.now()}`, description: "", enabled: true }]);

  const update = (idx: number, patch: Partial<SmeTemplate["rules"][number]>) =>
    onChange(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const remove = (idx: number) => onChange(rules.filter((_, i) => i !== idx));

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: "space-between" }}>
        <Typography variant="subtitle2" color="text.secondary">
          Rules
        </Typography>
        <Button size="small" onClick={add} aria-label="Add rule">
          + Add rule
        </Button>
      </Stack>
      {rules.map((rule, idx) => (
        <Stack key={rule.id} direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Switch
            checked={rule.enabled}
            onChange={(e) => update(idx, { enabled: e.target.checked })}
            size="small"
            slotProps={{ input: { "aria-label": `Enable rule ${idx + 1}` } }}
          />
          <TextField
            value={rule.description}
            onChange={(e) => update(idx, { description: e.target.value })}
            size="small"
            fullWidth
            placeholder="Rule description"
            slotProps={{ htmlInput: { "aria-label": `Rule ${idx + 1} description` } }}
          />
          <Button size="small" color="error" onClick={() => remove(idx)} aria-label={`Remove rule ${idx + 1}`}>
            Remove
          </Button>
        </Stack>
      ))}
      {rules.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No rules yet.
        </Typography>
      )}
    </Stack>
  );
}
