# Neon Rift 2 — engine samples

Same 42-second lane, two engines. The fighter cruises past a sunlit Earth, three raiders settle into the lane, and the player seals them. The verb is Neon Rift's, not a borrowed shooter: **graze the teal halo, then cast**.

| Beat | What you see | What it is |
| --- | --- | --- |
| Graze | The ship skims the teal gauze around a coral wake | Near-miss while the ink is wet. It arms a glyph. It does not fire. |
| Lance | A lavender prism | First payoff. A hit, not a laser bolt from a crosshair. |
| Seal | A ring contracts and the hull bursts into debris | Second payoff. The raider is bound, then broken. |
| Nova | An amber bloom and more debris | Third payoff. |
| Objective | `GRAZE THE WAKE`, then `TAP TO CAST …`, then `LANE SEALED` | The only instruction. Three seals end the lane. |

Numbers are shared (`SliceDirector` and `InkLane` in `SliceTypes.h`): 42 s at 30 fps, cruise 50 m/s, planet center `(1600, -420, 6400)` m, radius 3900 m, sun over the shoulder so the visible face is lit. Capture grazes are forced at 8.0 / 13.5 / 20.5 s and casts at 8.8 / 14.25 / 21.2 s, so a re-graze cannot arm the wrong glyph. Hero frames, if a capture is run, are step 180 (establish), 272 (lance), and 664 (nova).

Ships are Kenney Space Kit (CC0). The planet and clouds are NASA Visible Earth (public domain). The starfield is original. No paid packs, and no Quixel or Fab download (those need an Epic login).

## What each engine actually produced

### Unity (URP, mobile-oriented)

The project in `unity-sample` is a real Unity 6 project:

- Editor pin: **6000.0.64f1** (`5360b7cd7953`).
- URP **17.0.4**, the version built into that editor.
- Render pipeline assets copied from Unity's 3D cross-platform template, so the player uses a real Universal Renderer rather than a blank one.
- Touch weave, a short-tap cast, a landscape player, and the template's mobile quality asset (HDR on, render scale 0.8). The scripted capture assigns the template's PC asset so bloom and the ink reads are not scaled down.
- Custom HLSL for the sky, the planet (wrap lighting so the Blue Marble stays readable), clouds, air, and additive ink.
- One scene, one director, one HUD. The Linux and WebGL build entry points are `NeonRift.EditorTools.ProjectSetup.BuildLinux` and `BuildWebGL`.

The editor binary and the Linux IL2CPP and WebGL modules were installed on the build machine. They are not in git. The build was started and did not compile.

Unity Personal will not run without a signed-in seat. This machine had zero entitlements. Headless and windowed launches both stopped with `com.unity.editor.headless` / `com.unity.editor.ui` missing and `No valid Unity Editor license found`. Personal has no serial and no manual `.ulf`. Signing in needs a Unity ID, which this run does not have.

Because of that:

- No Linux player.
- No WebGL build.
- `gh-pages` was not touched. The existing site (`index.html`, `neon-rift-2`, `pinball.png`) is unchanged. There is no `https://shaz010.github.io/neon-rift/engine-samples/unity/` deploy.
- No Unity video and no Unity screenshots. Inventing frames from another renderer would misrepresent URP.

`unity-sample/tools/capture-linux.sh` is the command that finishes the job once a license is active: batch build, `xvfb` + `llvmpipe` + `-force-glcore` (this VM has no GPU), then ffmpeg. The capture clock is `Time.captureDeltaTime`, so the 42 s lane does not depend on how slow software GL is.

### Unreal Engine 5

The project in `ue5-sample/NeonRift2Slice` is a real C++ UE 5.4+ project (engine association 5.5):

- Game mode, pawn, HUD, and stage. The stage is the same lane, converted from Unity meters (X right, Y up, Z forward) into Unreal centimeters (X forward, Y right, Z up).
- Kenney OBJ loader and the same NASA textures under `Content/Raw`.
- An editor module that, on first open, imports the textures and builds `/Game/Slice` materials (lit hull, additive ink, planet, clouds, stars, air).
- A `-CaptureDir=` path that grabs the viewport at a fixed 30 fps, writes `frame_####.png` plus the three hero stills, and exits.

The engine itself is not installed, and it was not rendered.

A Linux installed build needs an Epic Games login. The archive is on the order of 25 GB compressed and about 43 GB extracted. This VM has no GPU and about 15 GB of RAM with a large memory balloon, which is a poor place to compile UE shaders. Pixel streaming was not attempted. No image in this repository is an Unreal frame.

Opening `NeonRift2Slice.uproject` in a 5.4 or 5.5 editor, letting the editor module log `Ink lane materials ready`, and pressing Play is the playable path. The capture command is in `ue5-sample/NeonRift2Slice/README.md`. A few editor-only material APIs (`GetEditorOnlyData`, texture opacity output index, `FImageUtils::SaveImage(FImageView)`) were written against 5.4/5.5 docs and were not compiled here, so the first open on a real editor may need a small fix.

## Comparison

Visual quality and game feel were **not measured**. There are no frames from either engine, so there is no score for lighting, materials, or juice.

What can be compared is the work each engine asked for, and what the slice would be showing if it ran.

**Same picture, different machinery.** Both samples load the same meshes and the same planet. A finished capture would be a comparison of lighting, materials, and post, not of art direction. The ships stay Kenney low-poly in both. The photographic planet is the film layer; the teal and coral ink is the game layer. That split is deliberate. A generic space shooter would read as orange tracers, a crosshair, and a health bar. This lane has none of those.

**Unity effort.** One C# simulation, five small shaders, and an editor setup script. URP volume (ACES, bloom, vignette, film grain) is created at runtime. The hard part on this machine was not the game. It was the license gate in front of the compiler. Once that gate is open, `capture-linux.sh` is a single build and a software-GL playthrough. WebGL is the mobile delivery path (Gzip plus decompression fallback, because GitHub Pages does not set `Content-Encoding` for `.gz` files).

**Unreal effort.** More types for the same lane: module, targets, game mode, pawn, HUD, stage, OBJ loader, and an editor module that constructs materials in code because there is no editor session here to author them. Coordinates are converted at the boundary so the sim stays in the Unity numbers. The project turns static lighting and distance fields off and does not enable Lumen. If it ran, it would not demonstrate a film-quality UE look. It would demonstrate the same ink lane under Unreal's default lit and unlit materials, with engine bloom and a manual exposure bias. That is the honest scope. A Lumen cinematic would be a different sample, and it could not be verified here anyway.

**Feel, as designed (not as played).** Weave is continuous, casts are rare, and each cast is earned by a skim. The capture plays that rhythm on a rail so both engines show the same three payoffs. Desktop uses the cursor. Mobile uses the thumb, with a short tap as the cast so a weave does not fire. Whether that rhythm is actually addictive has to be played. It was not played in either engine on this machine.

## Links and artifacts

| Item | Where |
| --- | --- |
| Unity project | `unity-sample/` |
| Unreal project | `ue5-sample/NeonRift2Slice/` |
| Unity capture script | `unity-sample/tools/capture-linux.sh` |
| Unity video, 3 stills | Not produced. License blocked the editor. |
| Unreal video, 3 stills | Not produced. Engine not installed. |
| WebGL on GitHub Pages | Not deployed. `gh-pages` was left as it was. |
