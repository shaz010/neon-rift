# DEEP STRIKE — handoff

Live game for this build: https://shaz010.github.io/neon-rift/strike-17/
Branch: `strike-17`. Pages folder: `/strike-17/` only.

`/strike-16/` stays frozen at `s16 · 16n`. Do not touch `main`, the `gh-pages` root, or any other folder, including `/strike-15/` and `/strike-16/`.

## s17 · 17c — picks in the build, fighter in front

The sound bank picks are the build defaults: Deep Report, Oil Rise, Pressure Hiss, Shells Overhead, Violent Hit, Fifty Cal, F-105 Whine, and Pier Bed. SAM launch and the crash stay on the sound-tester choice. Current on a row keeps that saved sound. Apply writes a pick code into the page, a cookie, and the address. The brief can paste a code, because an iPhone Home Screen icon does not share the sound page's storage. Empty storage still plays the baked picks.

Apply and the Game button stay in the app, so the game brief opens in place. iOS no longer gets a temporary page whose close returns to the sound picker.

After the bunker the fighter is in front of the chase view, with its silhouette, a target box, a lead marker, and an arrow when it leaves the screen. The gun fires only while it is held. Six hits, the guns warning, and the exfil gate are unchanged. Oil Rise is the bunker detonation. The generic blast does not play over it.

Stamp `s17 · 17c`.

## s17 · 17b — separate sound bank

A new page, `sound-bank.html`, offers a short list of CC0 field recordings. Current keeps the sound-tester choice. Apply sends only the new overrides together with the choices already saved. Each row is wired to the sortie event it names. Sirens were not shipped. Stamp `s17 · 17b`.

## s17 · 17a — escape dogfight

After the bunker, a fighter intercepts. The player turns, breaks, and fires the gun. Exfil stays closed until that fighter is destroyed. The chase camera does not swoop. The bunker blast at detonation is the blast chosen in the sound tester, including Rising Cluster. Stamp `s17 · 17a`.

## s16 · 16n — audible beds and distinct nights

The six quiet beds were silent at the start of the Logic files. They now begin where the sound actually is, at the same level in the picker and in flight. Each night look has its own light and fog. Star field puts stars in the sky you can see. Choosing one updates the live picture. Stamp `s16 · 16n`.

## s16 · 16m — mood variety, rising cluster, night preview

Rotation fades up on its own bus, then a tom passes through and the texture returns. More valley beds use the existing Logic files as sequences, not one stacked loop. Rising Cluster is an extra bunker choice: detonations swell, then rumble. Night looks stay on the scenery tester until Apply. Stamp `s16 · 16m`.

## s16 · 16l — compact sound picker

The sound tester is one row per sound: a dropdown, Play, and Stop. Music levels, surround, and width sit in the same list. Apply stays fixed at the bottom. A surround test sweeps a tone left, behind, right, then front, and the position buttons play it on the left, right, front, behind, or above. Best with headphones. Stamp `s16 · 16l`.

## s16 · 16k — gun stays, bunker blast

Retry was starting the sortie twice, so the second start left the carrier up and hid the weapons. One start now, and the gun, release, lock, flare, break and jammer are cleared between runs. The bunker uses a layered blast. Shock Front is the default. Stamp `s16 · 16k`.

## s16 · 16j — Logic presets and surround

Intro, ending, and mood presets are built from Shahbaz's Logic files. Random picks a different one each sortie. Surround uses positioned Web Audio with HRTF when it is on, plus a width control. The sound tester pan buttons and sliders follow the finger. Stamp `s16 · 16j`.

## s16 · 16i — saved sounds, instant release, marked target

Empty storage now starts with the approved s15 ticks: flare Clean Thunder, engine Jet Take off 2, cannon Thunder VideoStar, SAM Boomer FX 45, missile pass Boomer FX 28. A saved tick still wins. Bomb release and the other sections had no recorded final tick, so they stay Current.

RELEASE drops the bomb on the first touch when the target is in the window. The bunker carries a diamond, a range, a soft beacon, and an edge arrow when it is off the screen. Stamp `s16 · 16i`.

## s16 · 16h — valley respawn after a loss

The carrier take-off plays only when a sortie starts from the opening screen. After a crash or a shoot-down, RETRY puts the jet back in the valley on the run-in, wings level, about 80 m above the ground, short of the first SAM. The camera is the usual steady chase. Stamp `s16 · 16h`.

## s16 · 16g — buttons, the jammer label, and a gun picker

The GUN button sits on the right, above LOCK, clear of FLARE, BREAK and the jammer. The label that read `ECM ×2` is the radar jammer, and it showed how many uses were left. It now reads `JAMS 2`.

The sound tester has a Gun section. Current is still the cannon already in the game. Six low gun hits are optional. Stamp `s16 · 16g`.

## s16 · 16f — deck sound, and the deck in frame

Take-off plays no music. `INTRO_TRACK` is still the slot for Shahbaz's kick-off track, and it defaults to none. In that space the deck plays real recordings through `mixFlightAudio`: jets idling nearby, a soft helicopter rotor, a steam chuff while they hold, and a metal clank plus one more chuff when the shuttle fires. Tapping LAUNCH plays a person on the radio saying the aircraft is cleared. Credits are in `sfx/CREDITS.md`. Nothing here is a noise generator.

The opening camera sits off the port side so the yellow tractor, the crew, and the parked jets are in the shot, with a warm fill on them. The helicopter hovers just off that edge, and its rotor is a real spinning disc because the model had none. The shooter close-up, the steady camera, and the SAM defence are unchanged.

Stamp `s16 · 16f`.

## s16 · 16e — take-off pad, and SAMs you can kill

Take-off keeps the 16d flight mix and adds the s15 Propulsion Layers pad (`mus_layers`, the synth layer from the sound tester) under it. No whoosh and no new noise. Shahbaz's own intro replaces that pad by setting `INTRO_TRACK` in `main.mjs` to an `sfx/` key and adding the file. `startIntroMusic()` is the only function that starts it, and it stops when the valley begins.

A SAM battery shows a lock light and a short tone, then about two seconds before it fires. Hold GUN and put the pipper on the battery, or put it in the HUD box and hold RELEASE (two bombs). An inbound missile is a bright body you can gun down: a hit is a mid-air burst and the warning stops. The gun never fires on its own. The camera is the same steady chase cam.

Stamp `s16 · 16e`.

## s16 · 16d — sound put back to s15

The catapult no longer plays a noise whoosh. Take-off uses the same flight mix as the valley sortie (`mixFlightAudio`), which is the s15 graph: master gain 0.8 into the gentle compressor. The golden-hour environment rebuild is deferred so it does not stall the audio thread on the first frame. Standing crew skeletons are frozen after their pose. Stamp `s16 · 16d`.

## s16 · 16c — real deck models and golden hour

The block deck is replaced by CC0 glTF models (see `MODELS-CREDITS.md`): a Nimitz-scale carrier, F-15-style fighters, a rigged crew tinted to jersey colours, yellow tractors, and a helicopter off the port side. Geometry is meshopt-compressed. Dressing hides once the camera leaves the ship.

Take-off light is a low warm sun, ACES, a little more bloom, soft shadows, and a specular ocean. The valley mission restores the previous light when the fade completes. The Shooter sequence, throttle, LAUNCH, skip, and both orientations are unchanged.

Stamp is `s16 · 16c` (`main.mjs?v=16c`).

## s16 · 16b — busy deck and the Shooter

Same take-off as 16a. The deck now has folded, chained jets along the edges and by the island, a jet on the other catapult, a jet taxiing with a tow tractor, and more tractors. Crew jerseys are yellow (directors), green (catapult), red (ordnance), white (safety) and purple (fuel). The blast deflector behind the player is raised. Steam wisps run along both catapult tracks. The island has antennas and lights. A wake sits on the water.

After LAUNCH, the camera holds close on the Shooter: two fingers circling for the run-up, a salute, then a crouch pointing down the deck. The camera eases back and the catapult fires. Throttle-to-arm, the launch tap, skip, and both portrait and landscape are unchanged. Dressing is instanced and hides once the camera leaves the ship.

Stamp is `s16 · 16b` (`main.mjs?v=16b`).

## s16 · 16a — carrier take-off

Roadmap item 1 only. The valley mission, flight model, camera, and every sound choice are the ones shipped in s15.

Sortie order:

1. The jet starts on the carrier deck, heading toward the valley, with the catapult, island, deck crew (yellow shooter), and steam.
2. Hold the throttle at full. That arms the shot. The LAUNCH button appears.
3. Tap LAUNCH, or tap the screen. Short catapult stroke, speed builds hard, wings stay level, camera stays the steady chase cam (no roll).
4. Climb out over the open sea. Pull up. After a few seconds of climb the picture fades into the existing valley ingress (same start point as s15).
5. If they never pull up, the jet does not hit the water. It eases into a shallow climb and the HUD says `SETTLE — PULL UP` until they pull. Nothing in the take-off can kill the aircraft.

Opening screen has **SKIP TAKE-OFF** for testing. That flag lasts for the session, including RETRY. Sound choices are unchanged and still use the `ds15_` keys (`ds15_snd_*`, `ds15_flare`, `ds15_bed`), so an s15 choice still applies here.

Stamp is `s16 · 16a` (`main.mjs?v=16a`). Home-screen icon is sea-teal with an amber `s16`, not the s15 purple. Sound and scenery pages are copied onto this build with the same stamp; their icons stay blue and green and now read s16.

## Deploy

Copy this branch into `gh-pages` at `strike-16/` only, then push `gh-pages`. Cache-bust is the `?v=` on `main.mjs`.

## Bot continuity and recovery

Every bot working on this project, and any new bot Shahbaz creates, follows the shared "Bot continuity and recovery" skill. The ready-to-paste setup pack is at `docs/Bot-Continuity-Setup-Pack.md`.

Save the assignment explicitly and never infer the job from the bot's name. Keep a dated checkpoint with the goal, the scope, where the work lives, the latest verified build, what is finished, what is running, what is untested, the next step, and protected items or blockers. Update that checkpoint after deliveries and direction changes, and mark older ones superseded. If unsure, recover from the checkpoint, the chat history, and the real project files before important actions, and ask if it is still unclear. Saved notes never authorize sending, publishing, spending, or resuming paused work.

Current project checkpoint: DEEP STRIKE s17 · 17c. Shahbaz's sound picks are baked into the build, Oil Rise is the bunker detonation, and the fighter appears in front after the strike. Deployed to `/strike-17/` only. `/strike-16/` stays `s16 · 16n`. No further combat stages.
