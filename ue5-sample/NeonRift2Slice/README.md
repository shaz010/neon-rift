# Neon Rift 2 — Ink Lane (Unreal Engine 5)

The same short flight as `unity-sample`. A sunlit planet, a starfield, three raiders, and Neon Rift's verb: **graze, then cast**.

The fighter floats toward the cursor or the thumb. Raiders lay coral wakes edged in teal.

- Skim the teal halo. That graze wets the ink.
- Touch the coral core and the wake takes ink.
- Tap, click, or press Space to cast the armed glyph.
- **Lance** is a lavender prism. **Seal** binds a raider in a ring and bursts it into debris. **Nova** is the amber bloom.
- The objective line teaches the beat. Three casts and it reads **LANE SEALED**.

## Open

Unreal Engine **5.4 or newer** (the project association is 5.5). This VM could not install the engine: the Linux build requires an Epic Games login, and there is no GPU here. Because of that, this folder is a real project, not a rendered fake.

1. Open `NeonRift2Slice.uproject` and let it compile.
2. On that first editor launch the editor module imports the NASA textures and builds the ink materials under `/Game/Slice`.
3. Press Play.

The log line `Ink lane materials ready` means the first-launch build finished. If you hit Play before it finishes, stop and press Play again.

## Capture

With the editor closed, from the engine directory:

```
UnrealEditor /absolute/path/NeonRift2Slice.uproject -game -windowed -ResX=1280 -ResY=720 -CaptureDir=/absolute/path/frames
```

The game writes `frame_####.png` for 42 seconds at 30 fps, plus `shot_establish.png`, `shot_lance.png`, and `shot_nova.png`, then exits. Join the frames with ffmpeg:

```
ffmpeg -y -framerate 30 -i frame_%04d.png -c:v libx264 -pix_fmt yuv420p ink-lane.mp4
```

Pixel streaming was not attempted. There is no GPU on the machine that prepared this project.

## Assets

- Ships: Kenney Space Kit, CC0, in `Content/Raw/Ships`. License text is beside the meshes.
- Planet and clouds: NASA Visible Earth, public domain. See the Unity sample's `Assets/Resources/Textures/SOURCES.txt` for the image records.
- The starfield is original.

No paid assets. Quixel / Fab were not downloaded; they need an Epic login this environment does not have.
