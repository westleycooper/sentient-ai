import {
  Box,
  Button,
  Divider,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import type { LessonConfig, LessonQuestion } from "../../api/hooks";

interface LessonEditorProps {
  value: LessonConfig;
  onChange: (lesson: LessonConfig) => void;
}

export function LessonEditor({ value, onChange }: LessonEditorProps) {
  const add = () => {
    const question: LessonQuestion = {
      id: `question-${Date.now()}`,
      title: "",
      question: "",
      answer: "",
      image_url: null,
    };
    onChange({ ...value, questions: [...value.questions, question] });
  };

  const remove = (idx: number) =>
    onChange({ ...value, questions: value.questions.filter((_, i) => i !== idx) });

  const update = (idx: number, patch: Partial<LessonQuestion>) =>
    onChange({
      ...value,
      questions: value.questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)),
    });

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={3} sx={{ alignItems: "center" }}>
        <FormControlLabel
          control={
            <Switch
              checked={value.enabled}
              onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
              slotProps={{ input: { "aria-label": "Enable Lesson" } }}
            />
          }
          label="Enable Lesson"
        />
        <FormControlLabel
          control={
            <Switch
              checked={value.visual_verify}
              onChange={(e) => onChange({ ...value, visual_verify: e.target.checked })}
              slotProps={{ input: { "aria-label": "Visual verify" } }}
            />
          }
          label="Visual verify (camera + OCR)"
        />
      </Stack>

      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Stack spacing={0.25}>
          <Typography variant="subtitle2">Questions</Typography>
          <Typography variant="caption" color="text.secondary">
            Each question shows a prompt; the learner spells the answer with physical
            blocks, verified {value.visual_verify ? "via camera + on-device OCR" : "by self-report"}.
          </Typography>
        </Stack>
        <Button size="small" startIcon={<AddIcon />} onClick={add} variant="outlined" aria-label="Add question">
          Add question
        </Button>
      </Stack>

      {value.questions.length === 0 && (
        <Box sx={{ textAlign: "center", py: 4, border: "1px dashed", borderColor: "divider", borderRadius: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            No questions yet.
          </Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={add} variant="outlined">
            Add first question
          </Button>
        </Box>
      )}

      {value.questions.map((question, idx) => (
        <Box key={question.id}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
            <Stack spacing={1} sx={{ flex: 1 }}>
              <Stack direction="row" spacing={1}>
                <TextField
                  label="Title"
                  size="small"
                  value={question.title}
                  onChange={(e) => update(idx, { title: e.target.value })}
                  sx={{ flex: 1 }}
                  slotProps={{ htmlInput: { "aria-label": `Question ${idx + 1} title` } }}
                />
                <TextField
                  label="Answer"
                  size="small"
                  value={question.answer}
                  onChange={(e) => update(idx, { answer: e.target.value })}
                  sx={{ flex: 1 }}
                  slotProps={{ htmlInput: { "aria-label": `Question ${idx + 1} answer` } }}
                />
              </Stack>
              <TextField
                label="Question / prompt"
                size="small"
                fullWidth
                value={question.question}
                onChange={(e) => update(idx, { question: e.target.value })}
                slotProps={{ htmlInput: { "aria-label": `Question ${idx + 1} prompt` } }}
              />
              <TextField
                label="Image URL (optional)"
                size="small"
                fullWidth
                value={question.image_url ?? ""}
                onChange={(e) => update(idx, { image_url: e.target.value || null })}
                slotProps={{ htmlInput: { "aria-label": `Question ${idx + 1} image URL` } }}
              />
            </Stack>
            <Tooltip title="Remove question">
              <IconButton size="small" onClick={() => remove(idx)} aria-label={`Remove question ${idx + 1}`} sx={{ mt: 0.5 }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
          {idx < value.questions.length - 1 && <Divider sx={{ mt: 2 }} />}
        </Box>
      ))}
    </Stack>
  );
}
