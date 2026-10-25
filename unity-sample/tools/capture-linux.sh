#!/usr/bin/env bash
# Build the Linux player and record the 42s ink lane.
# Requires a signed-in Unity Personal (or higher) license. This VM had none:
# the editor exits with "No valid Unity Editor license found" before compile.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNITY="${UNITY:-/opt/unity/Editor/Unity}"
FRAMES="${1:-/tmp/ink-lane-frames}"
mkdir -p "$FRAMES" "$ROOT/Logs"

"$UNITY" \
  -batchmode -nographics \
  -projectPath "$ROOT" \
  -executeMethod NeonRift.EditorTools.ProjectSetup.BuildLinux \
  -logFile "$ROOT/Logs/build-linux.log"

PLAYER="$ROOT/Builds/Linux/NeonRift2Slice.x86_64"
export LIBGL_ALWAYS_SOFTWARE="${LIBGL_ALWAYS_SOFTWARE:-1}"
xvfb-run -a -s "-screen 0 1280x720x24" \
  "$PLAYER" \
  -force-glcore \
  -screen-width 1280 -screen-height 720 -screen-fullscreen 0 \
  -capture "$FRAMES"

ffmpeg -y -framerate 30 -i "$FRAMES/frame_%04d.jpg" \
  -c:v libx264 -pix_fmt yuv420p -crf 18 \
  "$FRAMES/ink-lane.mp4"
echo "video: $FRAMES/ink-lane.mp4"
echo "stills: $FRAMES/shot_establish.png $FRAMES/shot_lance.png $FRAMES/shot_nova.png"
