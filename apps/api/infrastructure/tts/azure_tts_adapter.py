"""AzureTtsAdapter — neural TTS via Azure AI Speech."""
from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator


class AzureTtsAdapter:
    def __init__(self) -> None:
        self._key = os.environ["AZURE_SPEECH_KEY"]
        self._region = os.environ.get("AZURE_SPEECH_REGION", "uksouth")
        self._voice = os.environ.get("TTS_AZURE_VOICE", "en-GB-SoniaNeural")

    async def synthesise(self, *, text: str, voice: str | None = None) -> AsyncIterator[bytes]:
        import io

        import azure.cognitiveservices.speech as speechsdk

        cfg = speechsdk.SpeechConfig(subscription=self._key, region=self._region)
        cfg.speech_synthesis_voice_name = voice or self._voice
        cfg.set_speech_synthesis_output_format(
            speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
        )

        stream = speechsdk.audio.PullAudioOutputStream()
        audio_cfg = speechsdk.audio.AudioOutputConfig(stream=stream)
        synthesizer = speechsdk.SpeechSynthesizer(speech_config=cfg, audio_config=audio_cfg)

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, synthesizer.speak_text_async(text).get)

        buf = bytes(32768)
        out = io.BytesIO()
        while True:
            filled = stream.read(buf)
            if filled == 0:
                break
            out.write(buf[:filled])

        data = out.getvalue()
        for i in range(0, len(data), 4096):
            yield data[i : i + 4096]
