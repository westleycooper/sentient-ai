import { useState } from "react";
import {
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
import type { ReasoningStep } from "../../api/hooks";

const STEP_KINDS = ["retrieve", "reason", "tool_call", "summarise", "guardrail_check"] as const;

interface StepEditorProps {
  steps: ReasoningStep[];
  onChange: (steps: ReasoningStep[]) => void;
}

export function StepEditor({ steps, onChange }: StepEditorProps) {
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
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle2" color="text.secondary">
          Reasoning Steps
        </Typography>
        <Tooltip title="Add step">
          <IconButton size="small" onClick={add} aria-label="Add reasoning step">
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {steps.map((step, idx) => (
        <Box key={step.id}>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Stack spacing={1} flex={1}>
              <Stack direction="row" spacing={1}>
                <TextField
                  label="Step name"
                  size="small"
                  value={step.name}
                  onChange={(e) => update(idx, { name: e.target.value })}
                  sx={{ flex: 1 }}
                  inputProps={{ "aria-label": `Step ${idx + 1} name` }}
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
                inputProps={{ "aria-label": `Step ${idx + 1} config` }}
              />
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
    </Stack>
  );
}
