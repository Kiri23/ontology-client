# voice.py — the narrator of readme.py: ElevenLabs' own API, with a timestamp for each character
# so `Scene.say` can play an animation while its words are said. A voice is a function
# text -> m.Speech; ManimGX keeps what it said in voice/ beside the scene, named by the text and by
# the voice's repr(), so a render with an unchanged script does not call the service again.
#
#   class Story(m.Scene):
#       voice = ElevenLabs()  # needs ELEVENLABS_API_KEY only when a line is not in voice/ yet

import base64
import json
import os
import urllib.request
from dataclasses import dataclass

import manimgx as m
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
