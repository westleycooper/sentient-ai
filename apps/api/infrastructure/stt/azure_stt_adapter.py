"""AzureSttAdapter — Azure AI Speech SDK transcription."""
from __future__ import annotations

import os


class AzureSttAdapter:
    def __init__(self) -> None:
        self._key = os.environ["AZURE_SPEECH_KEY"]
        self._region = os.environ.get("AZURE_SPEECH_REGION", "uksouth")

    async def transcribe(self, *, audio_bytes: bytes, mime_type: str = "audio/webm") -> str:
        import asyncio
        import tempfile

        import azure.cognitiveservices.speech as speechsdk

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(audio_bytes)
            tmp_path = f.name

        cfg = speechsdk.SpeechConfig(subscription=self._key, region=self._region)
        audio_cfg = speechsdk.AudioConfig(filename=tmp_path)
        recognizer = speechsdk.SpeechRecognizer(speech_config=cfg, audio_config=audio_cfg)

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, recognizer.recognize_once)
        return result.text if result.reason.name == "RecognizedSpeech" else ""
