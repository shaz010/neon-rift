# DEEP STRIKE — handoff

Live game for this build: https://shaz010.github.io/neon-rift/strike-16/
Branch: `strike-16`. Pages folder: `/strike-16/` only.

Do not touch `main`, the `gh-pages` root, or any other folder there, including `/strike-15/`. `strike-15` stays the previous build (stamp `s15 · 15p`).

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
