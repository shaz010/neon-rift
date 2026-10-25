# Neon Rift 2 — Ink Lane (Unity 6, URP)

A mobile-shaped vertical slice of the same moment as `ue5-sample`: one fighter, a sunlit planet, three raiders, and the game's own verb.

This is not a turret shooter. The ship floats toward your thumb or cursor. Each raider lays a coral wake with a teal halo. There is no crosshair and no red health bar.

- Skim the teal halo. That is a **graze**. It wets the ink.
- Touch the coral core and the wake takes ink off you.
- When the ink is wet, tap (or press Space, or the cast button) to unleash the armed glyph.
- The glyphs cycle **Lance** (lavender prism), **Seal** (a ring that binds, then bursts the hull into debris), **Nova** (an amber bloom and a debris field).
- The objective line is the whole lesson. Three seals and the lane reads **LANE SEALED**.

## Open

Unity **6000.0.64f1** with Universal Render Pipeline **17.0.4**. The pipeline assets under `Assets/Settings` come from Unity's own 3D cross-platform template (`PC_RPAsset` for the capture, `Mobile_RPAsset` kept for the phone quality tier). Press Play. Mouse position weaves the fighter. Click, Space, or the corner button casts. A short touch tap casts on a phone.

The old Input Manager is selected on purpose (`activeInputHandler: 0`). A blank Unity 6 project often enables only the new Input System, and this slice reads `Input` directly.

## Capture

The Linux player accepts `-capture <folder>` and writes a 42 second, 30 fps JPEG sequence plus `shot_establish.png`, `shot_lance.png`, and `shot_nova.png`, then quits. `tools/capture-linux.sh` builds that player and stitches the video.

That script did not finish here. The editor is installed on the build machine at `/opt/unity` (6000.0.64f1, Linux IL2CPP and WebGL modules) but it has no license. Both `-batchmode` and a windowed launch stopped at:

```
[Licensing::Client] Error: Code 404 while processing request (status: Found 0 entitlement groups and 0 free entitlements matching requested entitlement ids)
[Licensing::Module] Error: 'com.unity.editor.headless' was not found.
No valid Unity Editor license found. Please activate your license.
```

Unity Personal only activates by signing in to Unity Hub (or `unity auth login`, then a personal license). There is no serial and no offline `.ulf` for Personal. No player, no WebGL build, and no frames were produced. Nothing was published to `gh-pages`.

## Assets

- Ships: Kenney Space Kit, CC0. See `Assets/Resources/Ships/KENNEY_CC0.txt`.
- Planet: NASA Visible Earth Blue Marble, December 2004, topography and bathymetry (public domain), record 73909, resized to 4096×2048.
- Clouds: NASA Visible Earth cloud map, record 57747 (public domain).
- Stars and all ink, glyphs, and flight code are original to this slice.

No paid assets.
