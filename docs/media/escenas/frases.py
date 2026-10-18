#!/usr/bin/env python3
"""Merge the cues of an SRT into sentences, in place: manimgx cuts a cue every ~40
characters, which splits a sentence across two ("and a" / "node."). Burned into the
video, each sentence then shows whole, wrapped by the renderer. Usage: frases.py readme.srt
Exit 1 without writing if a sentence runs longer than LONGEST seconds: the script's punctuation
never reached the SRT (edge-tts gave bare words before voces.py's _puntuadas) and the whole
narration would become one cue."""
import re
import sys
from pathlib import Path

ENDS_SENTENCE = re.compile(r"[.?!]$")
LONGEST = 15.0


def cues(text: str):
    for block in text.strip().split("\n\n"):
        _, times, *lines = block.splitlines()
        start, end = times.split(" --> ")
        yield start, end, " ".join(lines)


def sentences(items):
    out: list[tuple[str, str, str]] = []
    for start, end, line in items:
        if out and not ENDS_SENTENCE.search(out[-1][2]):
            first, _, prev = out[-1]
            out[-1] = (first, end, f"{prev} {line}")
        else:
            out.append((start, end, line))
    return out


def seconds(stamp: str) -> float:
    h, m, s = stamp.replace(",", ".").split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


path = Path(sys.argv[1])
merged = sentences(cues(path.read_text()))
for i, (s, e, t) in enumerate(merged, 1):
    if seconds(e) - seconds(s) > LONGEST:
        sys.exit(f"frases.py: sentence {i} lasts {seconds(e) - seconds(s):.0f} s ({t[:50]}…): the SRT has no "
                 "punctuation; is the voice dropping it? (Edge: voces.py _puntuadas)")
blocks = [f"{i}\n{s} --> {e}\n{t}" for i, (s, e, t) in enumerate(merged, 1)]
path.write_text("\n\n".join(blocks) + "\n")
