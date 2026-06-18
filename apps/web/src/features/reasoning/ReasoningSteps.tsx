import {
  Box,
  Chip,
  Collapse,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import type { StepEvent } from "../../api/hooks";

interface ReasoningStepsProps {
  steps: StepEvent[];
  isStreaming: boolean;
}

export function ReasoningSteps({ steps, isStreaming }: ReasoningStepsProps) {
  if (steps.length === 0 && !isStreaming) return null;

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: 480,
        bgcolor: "background.paper",
        borderRadius: 2,
        p: 1.5,
      }}
      role="status"
      aria-live="polite"
      aria-label="Reasoning steps"
    >
      {isStreaming && steps.length === 0 && (
        <LinearProgress sx={{ borderRadius: 1, mb: 1 }} />
      )}
      <Stack spacing={0.5}>
        {steps.map((step) => (
          <StepRow key={step.step_id + step.phase} step={step} />
        ))}
      </Stack>
    </Box>
  );
}

function StepRow({ step }: { step: StepEvent }) {
  const done = step.phase === "finished";
  const tokens = step.total_tokens > 0 ? `${step.total_tokens} tokens` : null;
  const latency = step.latency_ms != null ? `${Math.round(step.latency_ms)} ms` : null;

  return (
    <Collapse in>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        {done ? (
          <CheckCircleIcon sx={{ fontSize: 16, color: "success.main" }} />
        ) : (
          <HourglassTopIcon sx={{ fontSize: 16, color: "warning.main" }} />
        )}
        <Typography variant="caption" sx={{ flex: 1, color: "text.secondary" }}>
          {step.step_name}
        </Typography>
        {tokens && (
          <Tooltip title="Token usage for this step">
            <Chip label={tokens} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
          </Tooltip>
        )}
        {latency && (
          <Chip label={latency} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
        )}
      </Stack>
    </Collapse>
  );
}
