/**
 * LessonPanel — runs a Lesson's questions to completion. Two modes driven by
 * `lesson.visual_verify`: camera + on-device OCR verification, or a simple
 * self-report flashcard flow when there's no camera to check against.
 */
import { useEffect, useState } from "react";
import { Alert, Box, Button, LinearProgress, Stack, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import type { LessonConfig } from "../../api/hooks";
import { useCameraCapture } from "./useCameraCapture";
import { matchesAnswer, recognizeText } from "./ocr";

interface LessonPanelProps {
  lesson: LessonConfig;
  onFinish: () => void;
}

type Feedback = "correct" | "incorrect" | null;

export function LessonPanel({ lesson, onFinish }: LessonPanelProps) {
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [revealed, setRevealed] = useState(false);
  const [checking, setChecking] = useState(false);
  const camera = useCameraCapture();

  const question = lesson.questions[index];
  const finished = index >= lesson.questions.length;

  useEffect(() => {
    if (!lesson.visual_verify || finished) return;
    camera.start();
    return () => camera.stop();
    // `camera` is a fresh object every render; only re-run when the Lesson's
    // visual_verify flag or completion state actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.visual_verify, finished]);

  const advance = (correct: boolean) => {
    if (correct) setScore((s) => s + 1);
    setFeedback(null);
    setRevealed(false);
    setIndex((i) => i + 1);
  };

  const handleCheckSpelling = async () => {
    const canvas = camera.captureFrame();
    if (!canvas) return;
    setChecking(true);
    try {
      const recognized = await recognizeText(canvas);
      setFeedback(matchesAnswer(recognized, question.answer) ? "correct" : "incorrect");
    } finally {
      setChecking(false);
    }
  };

  if (lesson.questions.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography color="text.secondary">This Lesson has no questions configured yet.</Typography>
        <Button onClick={onFinish} sx={{ mt: 2 }}>Close</Button>
      </Box>
    );
  }

  if (finished) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <CheckCircleIcon color="success" sx={{ fontSize: 48, mb: 1 }} />
        <Typography variant="h6">
          Lesson complete: {score} / {lesson.questions.length}
        </Typography>
        <Button variant="contained" onClick={onFinish} sx={{ mt: 2 }}>
          Finish
        </Button>
      </Box>
    );
  }

  return (
    <Stack spacing={2} sx={{ p: 3, maxWidth: 480, mx: "auto" }}>
      <LinearProgress
        variant="determinate"
        value={(index / lesson.questions.length) * 100}
        aria-label="Lesson progress"
      />
      <Typography variant="caption" color="text.secondary">
        Question {index + 1} of {lesson.questions.length}
      </Typography>

      <Typography variant="h5">{question.title}</Typography>
      <Typography variant="body1">{question.question}</Typography>
      {question.image_url && (
        <Box component="img" src={question.image_url} alt={question.title} sx={{ maxWidth: "100%", borderRadius: 1 }} />
      )}

      {lesson.visual_verify ? (
        <Stack spacing={1.5} sx={{ alignItems: "center" }}>
          <Box
            component="video"
            ref={camera.videoRef}
            autoPlay
            muted
            playsInline
            sx={{ width: "100%", maxWidth: 320, borderRadius: 1, bgcolor: "black" }}
          />
          {camera.state === "error" && (
            <Alert severity="warning">Camera access was denied. Enable it to verify your spelling.</Alert>
          )}
          {feedback === null ? (
            <Button
              variant="contained"
              startIcon={<CameraAltIcon />}
              onClick={handleCheckSpelling}
              disabled={camera.state !== "active" || checking}
            >
              {checking ? "Checking…" : "Check my spelling"}
            </Button>
          ) : (
            <Stack spacing={1} sx={{ alignItems: "center" }}>
              <Alert severity={feedback === "correct" ? "success" : "error"}>
                {feedback === "correct" ? "Well done — that's correct!" : `Not quite — the answer is "${question.answer}".`}
              </Alert>
              <Button variant="contained" onClick={() => advance(feedback === "correct")}>
                Next question
              </Button>
            </Stack>
          )}
        </Stack>
      ) : (
        <Stack spacing={1.5} sx={{ alignItems: "center" }}>
          {!revealed ? (
            <Button variant="outlined" onClick={() => setRevealed(true)}>
              Reveal answer
            </Button>
          ) : (
            <Stack spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="h6">{question.answer}</Typography>
              <Stack direction="row" spacing={1}>
                <Button variant="contained" color="success" onClick={() => advance(true)}>
                  I got it right
                </Button>
                <Button variant="outlined" color="error" onClick={() => advance(false)}>
                  I got it wrong
                </Button>
              </Stack>
            </Stack>
          )}
        </Stack>
      )}
    </Stack>
  );
}
