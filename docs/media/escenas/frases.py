#!/usr/bin/env python3
"""Merge the cues of an SRT into sentences, in place: manimgx cuts a cue every ~40
characters, which splits a sentence across two ("and a" / "node."). Burned into the
video, each sentence then shows whole, wrapped by the renderer. Usage: frases.py readme.srt"""
import re
import sys
from pathlib import Path

ENDS_SENTENCE = re.compile(r"[.?!]$")


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


path = Path(sys.argv[1])
blocks = [f"{i}\n{s} --> {e}\n{t}" for i, (s, e, t) in enumerate(sentences(cues(path.read_text())), 1)]
path.write_text("\n\n".join(blocks) + "\n")
