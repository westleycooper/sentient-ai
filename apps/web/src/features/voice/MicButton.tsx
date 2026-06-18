import { Box, CircularProgress, IconButton, Tooltip } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import { RecordingState } from "./useVoiceRecorder";

interface MicButtonProps {
  state: RecordingState;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
}

export function MicButton({ state, onStart, onStop, disabled }: MicButtonProps) {
  const isRecording = state === "recording";

  return (
    <Box
      sx={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {isRecording && (
        <CircularProgress
          size={84}
          thickness={2}
          sx={{
            color: "primary.main",
            position: "absolute",
            animation: "pulse 1.5s ease-in-out infinite",
            "@keyframes pulse": {
              "0%, 100%": { opacity: 0.4 },
              "50%": { opacity: 1 },
            },
          }}
        />
      )}
      <Tooltip title={isRecording ? "Stop recording" : "Start recording"}>
        <span>
          <IconButton
            aria-label={isRecording ? "Stop recording" : "Start recording"}
            onClick={isRecording ? onStop : onStart}
            disabled={disabled || state === "error"}
            sx={{
              width: 72,
              height: 72,
              bgcolor: isRecording ? "error.dark" : "primary.dark",
              color: "#fff",
              "&:hover": {
                bgcolor: isRecording ? "error.main" : "primary.main",
              },
              "&.Mui-disabled": { bgcolor: "action.disabledBackground" },
              transition: "background-color 0.2s",
            }}
          >
            {isRecording ? <StopIcon sx={{ fontSize: 36 }} /> : <MicIcon sx={{ fontSize: 36 }} />}
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
