#!/usr/bin/env bash
# Regenerates docs/media/readme.mp4 and readme.gif from readme.py. Needs manimgx
# (https://manimgx.academa.ai/: `uv tool install --python 3.14 manimgx`) and ffmpeg.
# On Termux, manimgx is built from source: see ~/Code/SourceCode/manimgx/learning/.
# The narration (voice.py, ElevenLabs) is cached in voice/: a render with an unchanged script needs no
# key; a new or edited line needs ELEVENLABS_API_KEY. The MP4 gets an AAC track, and readme.srt (the
# subtitles) is written beside it, then merged into sentences (frases.py) and burned into the video.
set -euo pipefail
cd "$(dirname "$0")"
# `bash generar.sh mapa` renders mapa.py instead: the Spanish walkthrough of how the repo is built
# (voice.py's Edge, edge-tts: no key), MP4 only.
if [[ "${1:-}" == "mapa" ]]; then
  manimgx render mapa.py Mapa -r 960x540 --fps 30 -o ../mapa.mp4
  python3 frases.py ../mapa.srt
  ffmpeg -y -loglevel warning -i ../mapa.mp4 -c:a copy \
    -vf "subtitles=../mapa.srt:force_style='FontName=DejaVu Sans,FontSize=13,PrimaryColour=&H00FFFFFF,BorderStyle=3,BackColour=&HA0000000,Outline=0,Shadow=0,MarginV=8'" \
    ../mapa.sub.mp4
  mv ../mapa.sub.mp4 ../mapa.mp4
  rm -f ../mapa.storyboard*.png
  ls -la ../mapa.mp4 ../mapa.srt
  exit 0
fi
manimgx render readme.py ReadmeStory -r 960x540 --fps 30 -o ../readme.mp4
python3 frases.py ../readme.srt
ffmpeg -y -loglevel warning -i ../readme.mp4 -c:a copy \
  -vf "subtitles=../readme.srt:force_style='FontName=DejaVu Sans,FontSize=13,PrimaryColour=&H00FFFFFF,BorderStyle=3,BackColour=&HA0000000,Outline=0,Shadow=0,MarginV=8'" \
  ../readme.sub.mp4
mv ../readme.sub.mp4 ../readme.mp4
# GIF: 12 fps, 800 px wide, a 128-color palette from the frames' differences, light dithering
ffmpeg -y -loglevel warning -i ../readme.mp4 \
  -vf "fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  -loop 0 ../readme.gif
rm -f ../readme.storyboard*.png
ls -la ../readme.mp4 ../readme.gif ../readme.srt
