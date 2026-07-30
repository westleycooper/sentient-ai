import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import TuneIcon from "@mui/icons-material/Tune";
import type { ReasoningStep } from "../../api/hooks";
import { ModelBrowser } from "./ModelBrowser";

const STEP_KINDS = ["retrieve", "reason", "tool_call", "summarise", "guardrail_check"] as const;

const GUARDRAIL_CHECKS = [
  { id: "no_personal_advice_solicitation", label: "No personal advice solicitation", phase: "input" },
  { id: "no_personalised_advice",          label: "No personalised advice in output", phase: "output" },
  { id: "crisis_detection",               label: "Crisis detection",                 phase: "input" },
  { id: "no_harmful_content",             label: "No harmful content",               phase: "output" },
  { id: "no_protected_characteristics",   label: "No protected characteristics",     phase: "output" },
  { id: "constructive_tone",              label: "Constructive tone",                phase: "output" },
  { id: "no_profanity",                   label: "No profanity",                     phase: "input" },
  { id: "no_off_topic",                   label: "No off-topic queries",             phase: "input" },
] as const;

interface StepEditorProps {
  steps: ReasoningStep[];
  onChange: (steps: ReasoningStep[]) => void;
  /** When true, LLM-calling steps show a per-step model picker that overrides
   * the template's default model; when false, every step shares the default. */
  useStepModels?: boolean;
}

const LLM_STEP_KINDS = new Set<ReasoningStep["kind"]>(["reason", "summarise", "tool_call", "guardrail_check"]);

export function StepEditor({ steps, onChange, useStepModels }: StepEditorProps) {
  const [modelBrowserIdx, setModelBrowserIdx] = useState<number | null>(null);

  const add = () => {
    onChange([
      ...steps,
      {
        id: `step-${Date.now()}`,
        name: "New Step",
        kind: "reason",
        config: {},
        next_default: null,
        next_on: {},
      },
    ]);
  };

  const remove = (idx: number) => {
    onChange(steps.filter((_, i) => i !== idx));
  };

  const update = (idx: number, patch: Partial<ReasoningStep>) => {
    onChange(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Stack spacing={0.25}>
          <Typography variant="subtitle2">Reasoning Steps</Typography>
          <Typography variant="caption" color="text.secondary">
            Executed in order on every turn. Steps compile into the LangGraph workflow.
          </Typography>
        </Stack>
        <Button size="small" startIcon={<AddIcon />} onClick={add} variant="outlined" aria-label="Add reasoning step">
          Add step
        </Button>
      </Stack>

      {steps.length === 0 && (
        <Box sx={{ textAlign: "center", py: 4, border: "1px dashed", borderColor: "divider", borderRadius: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            No steps yet.
          </Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={add} variant="outlined">
            Add first step
          </Button>
        </Box>
      )}

      {steps.map((step, idx) => (
        <Box key={step.id}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
            <Stack spacing={1} sx={{ flex: 1 }}>
              <Stack direction="row" spacing={1}>
                <TextField
                  label="Step name"
                  size="small"
                  value={step.name}
                  onChange={(e) => update(idx, { name: e.target.value })}
                  sx={{ flex: 1 }}
                  slotProps={{ htmlInput: { "aria-label": `Step ${idx + 1} name` } }}
                />
                <Select
                  size="small"
                  value={step.kind}
                  onChange={(e) => update(idx, { kind: e.target.value as ReasoningStep["kind"] })}
                  sx={{ minWidth: 160 }}
                  inputProps={{ "aria-label": `Step ${idx + 1} kind` }}
                >
                  {STEP_KINDS.map((k) => (
                    <MenuItem key={k} value={k}>
                      {k}
                    </MenuItem>
                  ))}
                </Select>
              </Stack>
              {step.kind === "guardrail_check" ? (
                <FormControl size="small" fullWidth>
                  <InputLabel id={`guard-check-label-${idx}`}>Guardrail check</InputLabel>
                  <Select
                    labelId={`guard-check-label-${idx}`}
                    label="Guardrail check"
                    value={step.config.check ?? ""}
                    onChange={(e) => update(idx, { config: { ...step.config, check: e.target.value } })}
                    inputProps={{ "aria-label": `Step ${idx + 1} guardrail check` }}
                  >
                    {GUARDRAIL_CHECKS.map((g) => (
                      <MenuItem key={g.id} value={g.id}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                          <Typography variant="body2">{g.label}</Typography>
                          <Typography variant="caption" color="text.secondary">({g.phase})</Typography>
                        </Stack>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : (
                <TextField
                  label="Config (JSON)"
                  size="small"
                  multiline
                  rows={2}
                  value={JSON.stringify(step.config, null, 2)}
                  onChange={(e) => {
                    try {
                      update(idx, { config: JSON.parse(e.target.value) });
                    } catch {
                      /* ignore invalid JSON mid-edit */
                    }
                  }}
                  slotProps={{ htmlInput: { "aria-label": `Step ${idx + 1} config` } }}
                />
              )}
              {useStepModels && LLM_STEP_KINDS.has(step.kind) && (
                <Chip
                  size="small"
                  icon={<TuneIcon fontSize="small" />}
                  label={step.model ? `Model: ${step.model}` : "Model: template default"}
                  onClick={() => setModelBrowserIdx(idx)}
                  variant="outlined"
                  sx={{ alignSelf: "flex-start" }}
                />
              )}
            </Stack>
            <Tooltip title="Remove step">
              <IconButton size="small" onClick={() => remove(idx)} aria-label={`Remove step ${idx + 1}`} sx={{ mt: 0.5 }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
          {idx < steps.length - 1 && <Divider sx={{ mt: 2 }} />}
        </Box>
      ))}

      {steps.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No steps yet. Click + to add one.
        </Typography>
      )}

      <ModelBrowser
        open={modelBrowserIdx !== null}
        onClose={() => setModelBrowserIdx(null)}
        value={modelBrowserIdx !== null ? (steps[modelBrowserIdx]?.model ?? null) : null}
        onChange={(id) => {
          if (modelBrowserIdx !== null) update(modelBrowserIdx, { model: id });
        }}
        allowNone
      />
    </Stack>
  );
}
