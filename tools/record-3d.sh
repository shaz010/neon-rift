#!/bin/bash
# Boots an iPhone simulator, plays the native test flight, and writes a short reel.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/record-out}"
mkdir -p "$OUT"
rm -f "$OUT"/*.mp4 "$OUT"/*.jpg "$OUT"/*.png "$OUT"/nr2.log

DD="${RUNNER_TEMP:-/tmp}/nr2-dd"
rm -rf "$DD"

echo "Building Neon Rift 2 for the simulator"
xcodebuild \
  -project "$ROOT/ios/NeonRift2.xcodeproj" \
  -scheme NeonRift2 \
  -configuration Release \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$DD" \
  CODE_SIGNING_ALLOWED=NO \
  build

APP="$(find "$DD" -path '*iphonesimulator*' -name 'NeonRift2.app' -type d | head -1)"
test -n "$APP"
test -d "$APP"
echo "App: $APP"

python3 - <<'PY' > "$OUT/device.txt"
import json, subprocess, sys
raw = subprocess.check_output(["xcrun", "simctl", "list", "devices", "available", "-j"])
data = json.loads(raw)
cands = []
for runtime, devs in data.get("devices", {}).items():
    if "iOS" not in runtime:
        continue
    for dev in devs:
        name = dev.get("name", "")
        if dev.get("isAvailable") and name.startswith("iPhone"):
            cands.append((name, dev["udid"]))

def rank(name):
    if name == "iPhone 16":
        return (0, name)
    if name.startswith("iPhone 16"):
        return (1, name)
    if "iPhone 15" in name:
        return (2, name)
    return (3, name)

if not cands:
    sys.stderr.write("no iPhone simulators\n")
    sys.exit(1)
cands.sort(key=lambda item: rank(item[0]))
sys.stderr.write("using %s %s\n" % (cands[0][0], cands[0][1]))
print(cands[0][1])
print(cands[0][0])
PY
UDID="$(sed -n '1p' "$OUT/device.txt")"
echo "Simulator $UDID"

xcrun simctl boot "$UDID" || true
xcrun simctl bootstatus "$UDID" -b
xcrun simctl install "$UDID" "$APP"

MAC_SDK="$(xcrun --sdk macosx --show-sdk-path)"
swiftc -sdk "$MAC_SDK" -O -o "$OUT/bright-frame" "$ROOT/tools/bright-frame.swift"
swiftc -sdk "$MAC_SDK" -O -o "$OUT/compress-reel" "$ROOT/tools/compress-reel.swift"

open -a Simulator --args -CurrentDeviceUDID "$UDID" || true
sleep 2
xcrun simctl io "$UDID" recordVideo --codec h264 --force "$OUT/raw.mp4" >/tmp/nr2-record.log 2>&1 &
REC=$!
sleep 1

xcrun simctl launch --console "$UDID" com.shaz010.neonrift2 -showcase > "$OUT/nr2.log" 2>&1 &
APP_WRAP=$!

wait_mark() {
  local needle="$1"
  local timeout="$2"
  local start
  start="$(date +%s)"
  while true; do
    if grep -q "$needle" "$OUT/nr2.log"; then
      return 0
    fi
    if ! kill -0 "$APP_WRAP" 2>/dev/null; then
      echo "App exited while waiting for $needle"
      cat "$OUT/nr2.log" || true
      return 1
    fi
    if [ $(( $(date +%s) - start )) -gt "$timeout" ]; then
      echo "Timed out waiting for $needle"
      cat "$OUT/nr2.log" || true
      return 1
    fi
    sleep 0.4
  done
}

shot() {
  local name="$1"
  xcrun simctl io "$UDID" screenshot "$OUT/${name}.png"
  sips -s format jpeg -s formatOptions 62 -Z 1280 "$OUT/${name}.png" --out "$OUT/${name}.jpg" >/dev/null
  rm -f "$OUT/${name}.png"
}

cleanup() {
  kill -INT "$REC" 2>/dev/null || true
  wait "$REC" 2>/dev/null || true
  kill "$APP_WRAP" 2>/dev/null || true
  xcrun simctl terminate "$UDID" com.shaz010.neonrift2 >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_mark "NR2 phase cinema" 90
wait_mark "NR2 mark hangar" 90
shot hangar
wait_mark "NR2 mark combat" 90
shot combat
wait_mark "NR2 mark warden" 120
shot warden
wait_mark "NR2 phase results" 90
sleep 1.2
shot results
sleep 0.8

kill -INT "$REC" 2>/dev/null || true
wait "$REC" 2>/dev/null || true
trap - EXIT
kill "$APP_WRAP" 2>/dev/null || true
xcrun simctl terminate "$UDID" com.shaz010.neonrift2 >/dev/null 2>&1 || true

test -s "$OUT/raw.mp4"
"$OUT/compress-reel" "$OUT/raw.mp4" "$OUT/neon-rift-2-3d-gameplay.mp4"
rm -f "$OUT/raw.mp4"

"$OUT/bright-frame" "$OUT/hangar.jpg"
"$OUT/bright-frame" "$OUT/combat.jpg"
echo "Reel ready in $OUT"
