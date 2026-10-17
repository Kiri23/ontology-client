#!/usr/bin/env bash
# Regenerates docs/media/readme.mp4 and readme.gif from readme.py. Needs manimgx
# (https://manimgx.academa.ai/: `uv tool install --python 3.14 manimgx`) and ffmpeg.
# On Termux, manimgx is built from source: see ~/Code/SourceCode/manimgx/learning/.
set -euo pipefail
cd "$(dirname "$0")"
manimgx render readme.py ReadmeStory -r 960x540 --fps 30 -o ../readme.mp4
# GIF: 12 fps, 800 px wide, a 128-color palette from the frames' differences, light dithering
ffmpeg -y -loglevel error -i ../readme.mp4 \
  -vf "fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  -loop 0 ../readme.gif
rm -f ../readme.storyboard*.png
ls -la ../readme.mp4 ../readme.gif
