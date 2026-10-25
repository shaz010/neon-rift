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
  ARCHS=arm64 \
  ONLY_ACTIVE_ARCH=YES \
  EXCLUDED_ARCHS=x86_64 \
  build

APP="$(find "$DD" -path '*iphonesimulator*' -name 'NeonRift2.app' -type d | head -1)"
test -n "$APP"
test -d "$APP"
echo "App: $APP"

python3 - "$APP/Info.plist" <<'PY'
import plistlib, sys
path = sys.argv[1]
with open(path, "rb") as handle:
    info = plistlib.load(handle)
family = list(info.get("UIDeviceFamily") or [])
ipad = list(info.get("UISupportedInterfaceOrientations~ipad") or [])
phone = list(info.get("UISupportedInterfaceOrientations") or [])
full = info.get("UIRequiresFullScreen")
print("UIDeviceFamily", family)
print("iPhone orientations", phone)
print("iPad orientations", ipad)
print("UIRequiresFullScreen", full)
needed = {
    "UIInterfaceOrientationPortrait",
    "UIInterfaceOrientationPortraitUpsideDown",
    "UIInterfaceOrientationLandscapeLeft",
    "UIInterfaceOrientationLandscapeRight",
}
if sorted(family) != [1, 2]:
    sys.exit("UIDeviceFamily must be 1 and 2")
if phone != ["UIInterfaceOrientationPortrait"]:
    sys.exit("iPhone must stay portrait")
if not needed.issubset(ipad):
    sys.exit("iPad must allow every orientation")
if full is not True:
    sys.exit("UIRequiresFullScreen must be true")
PY

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
swiftc -sdk "$MAC_SDK" -O -o "$OUT/full-bleed" "$ROOT/tools/full-bleed.swift"

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
  local log="${3:-$OUT/nr2.log}"
  local start
  start="$(date +%s)"
  while true; do
    if grep -q "$needle" "$log"; then
      return 0
    fi
    if ! kill -0 "$APP_WRAP" 2>/dev/null; then
      echo "App exited while waiting for $needle"
      cat "$log" || true
      return 1
    fi
    if [ $(( $(date +%s) - start )) -gt "$timeout" ]; then
      echo "Timed out waiting for $needle"
      cat "$log" || true
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
sleep 0.4
shot results
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

xcrun simctl terminate "$UDID" com.shaz010.neonrift2 >/dev/null 2>&1 || true
: > "$OUT/showroom.log"
xcrun simctl launch --console "$UDID" com.shaz010.neonrift2 -showroom > "$OUT/showroom.log" 2>&1 &
APP_WRAP=$!
wait_mark "NR2 mark showroom" 40 "$OUT/showroom.log"
sleep 0.5
shot showroom
"$OUT/bright-frame" "$OUT/showroom.jpg"
kill "$APP_WRAP" 2>/dev/null || true
xcrun simctl terminate "$UDID" com.shaz010.neonrift2 >/dev/null 2>&1 || true
wait "$APP_WRAP" 2>/dev/null || true

python3 - <<'PY' > "$OUT/ipad-device.txt"
import json, subprocess, sys
raw = subprocess.check_output(["xcrun", "simctl", "list", "devices", "available", "-j"])
data = json.loads(raw)
cands = []
for runtime, devs in data.get("devices", {}).items():
    if "iOS" not in runtime:
        continue
    for dev in devs:
        name = dev.get("name", "")
        if dev.get("isAvailable") and name.startswith("iPad"):
            cands.append((name, dev["udid"]))

def rank(name):
    if "iPad Pro 13" in name:
        return (0, name)
    if "iPad Pro 11" in name:
        return (1, name)
    if "iPad Air" in name:
        return (2, name)
    if "iPad Pro" in name:
        return (3, name)
    return (4, name)

if not cands:
    sys.stderr.write("no iPad simulators\n")
    sys.exit(1)
cands.sort(key=lambda item: rank(item[0]))
sys.stderr.write("using %s %s\n" % (cands[0][0], cands[0][1]))
print(cands[0][1])
print(cands[0][0])
PY
IPAD="$(sed -n '1p' "$OUT/ipad-device.txt")"
echo "iPad simulator $IPAD ($(sed -n '2p' "$OUT/ipad-device.txt"))"
xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true
xcrun simctl boot "$IPAD" || true
xcrun simctl bootstatus "$IPAD" -b
xcrun simctl install "$IPAD" "$APP"
open -a Simulator --args -CurrentDeviceUDID "$IPAD" || true
sleep 2

cleanup_ipad() {
  kill "$APP_WRAP" 2>/dev/null || true
  if [ -n "${IPAD:-}" ]; then
    xcrun simctl terminate "$IPAD" com.shaz010.neonrift2 >/dev/null 2>&1 || true
  fi
}
trap cleanup_ipad EXIT

ipad_pass() {
  local name="$1"
  local orient="$2"
  local log="$OUT/${name}.log"
  : > "$log"
  xcrun simctl terminate "$IPAD" com.shaz010.neonrift2 >/dev/null 2>&1 || true
  local ui_orient="$orient"
  if [ "$orient" = "landscape" ]; then
    ui_orient="landscapeRight"
  fi
  xcrun simctl ui "$IPAD" orientation "$ui_orient" || true
  sleep 1
  xcrun simctl launch --console "$IPAD" com.shaz010.neonrift2 -showcase "-$orient" > "$log" 2>&1 &
  APP_WRAP=$!
  wait_mark "NR2 orientation $orient" 90 "$log"
  wait_mark "NR2 mark combat" 90 "$log"
  sleep 0.6
  xcrun simctl io "$IPAD" screenshot "$OUT/${name}.png"
  "$OUT/full-bleed" "$OUT/${name}.png"
  sips -s format jpeg -s formatOptions 62 -Z 1600 "$OUT/${name}.png" --out "$OUT/${name}.jpg" >/dev/null
  rm -f "$OUT/${name}.png"
  kill "$APP_WRAP" 2>/dev/null || true
  xcrun simctl terminate "$IPAD" com.shaz010.neonrift2 >/dev/null 2>&1 || true
  wait "$APP_WRAP" 2>/dev/null || true
}

ipad_pass ipad-portrait portrait
ipad_pass ipad-landscape landscape
echo "iPad full-screen shots ready"
