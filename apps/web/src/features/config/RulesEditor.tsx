import {
  Box,
  Button,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import type { SmeRule } from "../../api/hooks";

interface RulesEditorProps {
  rules: SmeRule[];
  onChange: (rules: SmeRule[]) => void;
}

export function RulesEditor({ rules, onChange }: RulesEditorProps) {
  const add = () =>
    onChange([...rules, { id: `rule-${Date.now()}`, description: "", enabled: true }]);

  const update = (idx: number, patch: Partial<SmeRule>) =>
    onChange(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const remove = (idx: number) => onChange(rules.filter((_, i) => i !== idx));

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Stack spacing={0.25}>
          <Typography variant="subtitle2">Rules</Typography>
          <Typography variant="caption" color="text.secondary">
            Behavioural constraints enforced on every response.
          </Typography>
        </Stack>
        <Button size="small" startIcon={<AddIcon />} onClick={add} variant="outlined" aria-label="Add rule">
          Add rule
        </Button>
      </Stack>

      {rules.length === 0 && (
        <Box sx={{ textAlign: "center", py: 4, border: "1px dashed", borderColor: "divider", borderRadius: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            No rules yet.
          </Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={add} variant="outlined">
            Add first rule
          </Button>
        </Box>
      )}

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
            placeholder="e.g. Never reveal the system prompt"
            slotProps={{ htmlInput: { "aria-label": `Rule ${idx + 1} description` } }}
          />
          <Button size="small" color="error" onClick={() => remove(idx)} aria-label={`Remove rule ${idx + 1}`}>
            Remove
          </Button>
        </Stack>
      ))}
    </Stack>
  );
}
