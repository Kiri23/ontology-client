# voice.py — the narrator of readme.py: ElevenLabs' own API, with a timestamp for each character
# so `Scene.say` can play an animation while its words are said. A voice is a function
# text -> m.Speech; ManimGX keeps what it said in voice/ beside the scene, named by the text and by
# the voice's repr(), so a render with an unchanged script does not call the service again.
#
#   class Story(m.Scene):
#       voice = ElevenLabs()  # needs ELEVENLABS_API_KEY only when a line is not in voice/ yet
#   class Mapa(m.Scene):
#       voice = Edge("es-US-AlonsoNeural")  # edge-tts: free, no key (pip install edge-tts)

import asyncio
import base64
import json
import os
import urllib.request
from dataclasses import dataclass

import manimgx as m
from manimgx.audio import Word
from manimgx.audio.fal import _pieces  # ElevenLabs' alignment -> timed pieces (manimgx 0.1.1)
from manimgx.audio.sound import timed


@dataclass(frozen=True)
class ElevenLabs:
    """ElevenLabs' `/with-timestamps` endpoint: the audio and when each character is said."""

    voice_id: str = "SAz9YHcvj6GT2YYXdXww"  # River, a premade voice (the free plan cannot use library voices)
    model_id: str = "eleven_v4_turbo"
    speed: float = 0.9  # 0.7 (slow) to 1.2; 1.0 is the voice as recorded
    stability: float = 0.6  # 0 expressive, 1 even

    def __repr__(self) -> str:
        return f"ElevenLabs({self.voice_id!r}, {self.model_id!r}, speed={self.speed}, stability={self.stability})"

    def __call__(self, text: str) -> m.Speech:
        key = os.environ.get("ELEVENLABS_API_KEY")
        if not key:
            raise RuntimeError(f"no recording of {text!r} in voice/: set ELEVENLABS_API_KEY to speak it")
        request = urllib.request.Request(
            f"https://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}/with-timestamps",
            data=json.dumps({
                "text": text, "model_id": self.model_id,
                "voice_settings": {"speed": self.speed, "stability": self.stability},
            }).encode(),
            headers={"xi-api-key": key, "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            reply = json.loads(response.read())
        audio = base64.b64decode(reply["audio_base64"])
        pieces = _pieces([reply["alignment"]]) if reply.get("alignment") else []
        return m.Speech(audio, text=text, words=timed(text, pieces))


@dataclass(frozen=True)
class Edge:
    """Microsoft Edge's neural voices through edge-tts: free, no account, a timestamp per word."""

    voice: str = "en-US-AriaNeural"

    def __repr__(self) -> str:
        return f"Edge({self.voice!r})"

    def __call__(self, text: str) -> m.Speech:
        import edge_tts

        async def speak() -> tuple[bytes, list[Word]]:
            audio, words = b"", []
            async for chunk in edge_tts.Communicate(text, self.voice, boundary="WordBoundary").stream():
                if chunk["type"] == "audio":
                    audio += chunk["data"]
                elif chunk["type"] == "WordBoundary":
                    start = chunk["offset"] / 1e7
                    words.append(Word(chunk["text"], start, start + chunk["duration"] / 1e7))
            return audio, words

        audio, words = asyncio.run(speak())
        return m.Speech(audio, text=text, words=_punctuated(text, words))


def _punctuated(text: str, words: list[Word]) -> list[Word]:
    """Edge gives each word without its punctuation ("sistemas", not "sistemas."), and without the
    full stop frases.py cannot tell where a sentence ends: it merges the whole .srt into one cue.
    Each word takes the token of the script that contains it, in order; one not found stays as is."""
    tokens, i, out = text.split(), 0, []
    for word in words:
        j = next((k for k in range(i, len(tokens)) if word.text in tokens[k]), None)
        if j is None:
            out.append(word)
            continue
        out.append(Word(tokens[j], word.start, word.end))
        i = j + 1
    return out
