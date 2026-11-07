# DEEP STRIKE — handoff

Live game for this build: https://shaz010.github.io/neon-rift/strike-16/
Branch: `strike-16`. Pages folder: `/strike-16/` only.

Do not touch `main`, the `gh-pages` root, or any other folder there, including `/strike-15/`. `strike-15` stays the previous build (stamp `s15 · 15p`).

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
