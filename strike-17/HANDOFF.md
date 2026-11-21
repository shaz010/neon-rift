# DEEP STRIKE — handoff

Live game for this build: https://shaz010.github.io/neon-rift/strike-17/
Branch: `strike-17`. Pages folder: `/strike-17/` only.

`/strike-16/` stays frozen at `s16 · 16n`. Do not touch `main`, the `gh-pages` root, or any other folder, including `/strike-15/` and `/strike-16/`.

## s17 · 17x27 — the hitches are warmed

The two freezes are warmed before they can land in the flight. The sea environment map is built while the brief is up and reused when the carrier lights, instead of being generated on the first takeoff frame. The deck model compiles only itself. At the moment you press fly, before the brief comes down, the target, the defences, Raven, and the carrier are drawn once into a hidden target so the dive after the refuel and the first look at the ship are not the first time those shaders run. Phone settings stay 0.8× and 32 fps. Nothing about the flying, the HUD, the refuel, the landing, the sounds, the ace, the seeds, or practice changed.

Stamp `s17 · 17x27`.

## s17 · 17x26 — the lock and the target

The target diamond and the distance stay up from launch, through the refuel, until the blast, for the bunker, the radar site, and the fuel depot. The old "fly to the target" line is back, with the target's name. Lock frames the structure, not the hidden bunker mesh, and a press on LOCK is remembered long enough to acquire. A hit on the radar dish counts. Raven calls SIX if he spawns behind you, and he does not shoot faster than the 17x22 bandit. Refuel, the landing, and practice are unchanged.

Stamp `s17 · 17x26`.

## s17 · 17x25 — the re-attack distance is back

17x23 hid the re-attack cue whenever the bunker mesh was hidden, which is every radar sortie, and the "you passed it" line still used the old bunker latitude. The same RE-ATTACK distance and arrow now point at the seeded target, bunker, radar site, or fuel depot, and they stay up until that target is destroyed. The way-home arrow takes over only after the blast. The target diamond, the target glow, and the guns at the target follow the same rule. Refuel, the landing, Raven, and practice are unchanged.

Stamp `s17 · 17x25`.

## s17 · 17x24 — the rival ace

Raven is one named ace in a dark fighter with a red tail stripe. About half of full missions, chosen by the seed, he replaces the usual bandit. On some of those he stays out of the valley and hunts after the blast, on the way home, and he breaks off inside 8 km of the carrier. He uses the ground, and he breaks when you get behind him, then comes back. He does not fire a missile. If he survives, the next time he is a little sharper. The rank is kept on this phone and capped. Shooting him down pays 8000, clears that rank, and the next one is called a new ace. The debrief shows the record, with no music. Refuel, the landing, practice, and the sortie mix are unchanged.

Stamp `s17 · 17x24`.

## s17 · 17x23 — every sortie is different

A full mission rolls a seed, shown on the start card. The target is a bunker, a radar site, or a fuel-depot entrance, somewhere in the valley he can still fly. The three SAM sites move, the bandit still comes from a seeded direction, and the count stays the same. The sky is day, dusk, or night, and clear, haze, or low cloud. Night is moonlit so the valley and the HUD stay readable. Practice is the fixed sortie. The refuel and the open-sea landing are unchanged.

Stamp `s17 · 17x23`.

## s17 · 17x22 — the carrier is in open sea, and the approach is written on the screen

The ship is east of the valley, on open water, with a long straight final. The way home is still the valley, then the sea, then the carrier. From about 5 km the screen says high or low, left or right, and slow down, with the altitude and the speed. The first approach says: line up with the deck, slow down, gear down, follow the ball, touch down. A wide or fast pass is a go-around, with the arrow turning back. A sea hit or a ramp hit still fails. The refuel is unchanged.

Stamp `s17 · 17x22`.

## s17 · 17x21 — the arrow is on the page, and the phone can open offline

The way home is an HTML arrow, not a mark on the HUD canvas. It stays up from the blast until the trap, with the kilometres, and a diamond on the ship when the ship is in sight. The offline store is the sortie itself, about 27 MB, not the whole sound bank. The start screen says READY OFFLINE when that store is in.

Stamp `s17 · 17x21`.

## s17 · 17x20 — the way home is marked

After the blast a diamond on the heading tape points back along the valley, then to the carrier. Left and right arrows show when it is off the nose. A diamond sits on the ship when it is in sight. One line, RTB — FOLLOW ◆ TO CARRIER, fades after 3 s. The grids stay, but they are no longer the thing the HUD tells you to chase. The glass panels no longer blur the scene behind them, and the phone is capped the way the earlier thermal pass left it.

Stamp `s17 · 17x20`.

## s17 · 17x19 — fly back and trap

After the bunker, the jet is flown home to the carrier and caught on the wires. Fuel is a clock on that leg. The ball and the lineup are cues only. A miss is a bolter. A trap stops the jet, a low thud, then the same debrief, with a landing bonus. Practice: carrier landing is in the picker. The refuel, the glass HUD, and the warning tones are the 17x18 ones.

Stamp `s17 · 17x19`.

## s17 · 17x18 — the high tone is gone

The shrill beeps and the bright engine whine are lowered. Warnings that the flight still needs are short and under 400 Hz. The refuel, the HUD, the enemies, and the bunker blast are unchanged.

Stamp `s17 · 17x18`.

## s17 · 17x17 — glass HUD, harder enemies

The refuel is the 17x16 join. Panels, buttons and readout plates are translucent glass, and idle labels are shorter. Outside the refuel, bandits press from more than one angle, sometimes as a pair, and a stern gun or missile lands if you ignore the SIX. SAMs are a little quicker. AAA near the bunker is denser. The 8 s after CLEARED are still safe, and there are still no enemies during the refuel.

Stamp `s17 · 17x17`.

## s17 · 17x16 — the 17x8 refuel, put back

The join is the 17x8 refuel again: the tanker follows the valley and matches speed, the hose and basket move as they did, the ring and the dot are the 17x8 pair, and the camera is the 17x8 chase. Combat buttons stay up and hide only while the probe is on the basket. The jet starts on the route heading. No bandit or SAM while a refuel is still required. A death retry that already has fuel says TANK FULL — NO REFUEL. The badge is the build in the code. Damage smoke is only below 2 hp. Engine exhaust is the 17x8 exhaust.

Stamp `s17 · 17x16`.

## s17 · 17x15 — a shorter join, and you can see the basket

The tanker now starts about 400 m ahead. Closure eases from +40 m/s beyond 150 m down to +8 m/s at 20 m, and contact is +0.5 to +6 m/s. The join camera sits up behind the jet so the tanker is above it and the jet is low in the frame. The ring is still the basket and the dot is still the probe. The badge shows the build in the code, not a stale address. The black trail behind the jet was engine exhaust, not damage; it is held off during the join so it does not cover the basket.

Stamp `s17 · 17x15`.

## s17 · 17x14 — clean refuel

The refuel assists are gone: no magnet, no auto-trim, no tanker teleport, no softened stick, no aim-point dot. The tanker flies dead straight at 200 m/s, spawned 1 km ahead. The ring is the real basket and the dot is the real probe, from a fixed camera on the probe axis. Inside 300 m the closure is capped at 15 m/s. Inside 100 m the stick is half rate, with the same response and no extra lag. Contact needs the dot in the ring and a closure of 0.5 to 5 m/s for half a second. A speed strip sits beside the throttle.

Stamp `s17 · 17x14`.

## s17 · 17x13 — the tanker is there

A new sortie pointed the jet due north while the tanker flew the valley's heading, about 17 degrees off. A centred stick never met it. Past 2.8 km the quiet zone ended, and at 75 seconds a bandit spawned where the tanker should have been. The jet now starts on the route heading. Until the join, the tanker stays ahead, and it comes back in front if the player wanders off. No bandit and no SAM during an unfinished refuel. If the tank is already full, the line says TANK FULL — NO REFUEL. The close-in capture is unchanged.

Stamp `s17 · 17x13`.

## s17 · 17x12 — the dot goes in the ring

The yellow dot was the probe tip, drawn from a camera that sits above and behind the jet, while the ring was the basket. On a phone those two points do not line up until the probe is almost on the drogue, so a jet that was already on the hose still showed the dot outside the ring. The dot is now the aim point at the basket's distance, using the same camera and the same projection as the ring. A lined-up jet at 40 m sits about 9 px inside the ring in portrait and in landscape. The ring turns green only when that dot is inside it and the probe is within 42 m, and the closure window is wide. A centred stick in the join trims heading and pitch to the tanker, and trims speed once you are in the capture bubble. A calm noisy approach on a phone-sized page connects in about 5.5 s at 30, 60 and 120 fps.

Stamp `s17 · 17x12`.

## s17 · 17x11 — plays with no network

A service worker scoped to this folder caches the game, the sound pages, the scripts, the sky, the models, and the sound bank. Open it once online, then flight mode still starts a sortie and the sound page still plays. The next online launch picks up a new build. Saved sound picks and scores stay in localStorage. The cache is about 166 MB because the sound bank is mostly large wav masters, which is over a comfortable iPhone budget.

Stamp `s17 · 17x11`.

## s17 · 17x10 — the tanker flies straight

During the join the tanker holds one heading, one altitude, and 200 m/s. It no longer speeds up, slows down, or slides aside when the dot reaches the ring. The basket only bobs, about 30 cm over several seconds, and that bob shrinks once you are on the drogue. A steady noisy approach on a phone-sized page connected in about 12 to 14 seconds. After the ring went green and stayed there, contact was under a second.

Stamp `s17 · 17x10`.

## s17 · 17x9 — buttons stay up, and the first join connects

After the tank is full, GUN, FLR, JAMS, BREAK, LOCK, and RELEASE stay on the screen for the rest of the flight. They can dim when nothing is threatening, and they hide only while you are actually on the basket. Killing a bandit does not put the refuel screen back. A retry after you have taken fuel keeps the fuel and the buttons.

The first refuel used to turn the ring green while the probe was still short of the drogue, so you could sit in that picture for a long time with no fuel. The ring is green only when the dot is inside it and the probe is close enough to connect. That contact starts within about a second. If something is in the way, the ring stays amber and the line says CLOSER, SLOW, FAST, or WAIT.

Stamp `s17 · 17x9`.

## s17 · 17x8 — banners stay off the buttons

Once the tank is full, the join-up line, the tanker arrow, and the distance stop. They come back only if the tanker is needed again. Prompt text sits above the control buttons. The top banner is kept left of the radar so it does not cover the RWR circle. Checked in phone portrait, phone landscape, and an iPad-sized page.

Stamp `s17 · 17x8`.

## s17 · 17x7 — after the tank, you can fight

Filling the tank used to leave the refuel screen on, so GUN, flares, LOCK, and RELEASE stayed hidden even after a bandit showed up. The refuel screen now drops once you are clear of the basket. For eight seconds after CLEARED the jet cannot be killed by the ground, the tanker, or a missile, and the tanker slides away. Any death puts its cause on the screen at once: TERRAIN, HIT BY SAM, COLLIDED WITH TANKER, and the rest.

Stamp `s17 · 17x7`.

## s17 · 17x6 — the fuel gauge stays out of the picture

The gauge is smaller and sits in the lower-right corner, with a light backing. The ring and the aim dot are drawn after it, so they stay on top. Portrait, landscape, and an iPad-sized page keep the basket, the ring, the dot, and the jet clear of it.

Stamp `s17 · 17x6`.

## s17 · 17x5 — a second refuel is a fresh refuel

The first tank-full used to stick. The hose stayed reeled in, the tanker hid, and the aim ring never came back, so the next attempt had nothing to line up with. After CLEARED the basket pays out to the trail again, the lock and the magnet reset, and another join works. A disconnect does the same: the basket leaves the probe and trails. Having already taken fuel no longer turns the join off. The ease-in is capped so it does not snap, and the dot and the ring are smoothed on screen.

Stamp `s17 · 17x5`.

## s17 · 17x4 — the dot stays up, and a near join connects

The aim dot is drawn last, in yellow on a black disc, and it stays on the screen. If the basket is off the screen, an arrow points at it and the dot stays too. It is not faded with the other instruments.

Once the dot is inside about twice the ring, or the probe is near the basket, the jet eases into the drogue over about a second. The line says CLOSER, then HOLD STEADY, then CONTACT. Near the basket the stick is softer, the basket sways less, and the camera shake is cut down, including at 30 fps. A small drift after contact only slows the fuel. The lock drops when the jet clearly flies away.

Stamp `s17 · 17x4`.

## s17 · 17x3 — the drogue looks like a drogue

Visual only. The connect, the hose motion, and the sounds are unchanged from 17x2.

The basket is a flared fabric cone: off-white gores with stitched seams, thin ribs, a thin metal rim at the mouth, and a dark coupler where the hose meets it. The hose is dark rubber with faint collars. The probe is a slimmer nozzle. The tanker fuselage has smoother shading and a few panel lines.

Stamp `s17 · 17x3`.

## s17 · 17x2 — the dot in the ring connects, and the hose is a drogue

The aim dot is the refuelling probe. The ring is the drogue basket. If the dot sits in the ring and the closure is gentle, the probe locks in about half a second. A phone gets a wider ring. There is no hidden speed, depth, or throttle gate. If the picture is right but the join is not, the line is one word: SLOW, FAST, or CLOSER. Once fuel is flowing, a small drift pauses with DISCONNECT and keeps the lock for a moment, so it does not flicker. A real gap drops the lock.

The hose reels from a drum under the tanker's tail. It hangs in a shallow curve, with a little sway. The basket is a metal ring, a fabric canopy, ribs, and a coupler in the middle. The player's jet has a metal probe on the nose. On contact the probe seats in the coupler, the basket eases forward, the hose shortens a little, and a wave runs up it. While connected the hose follows the jet. On disconnect the basket springs back and swings. The fuel cue is the gauge. The hose glint is only a faint shimmer.

The fuel rumble and the clunk fade in and out, and they will not restart every frame.

Stamp `s17 · 17x2`.

## s17 · 17x — the fuel transfer, a second pass, a quieter HUD

The refuel is no longer an autopilot. Once the boom locks there is a clunk and a shake, fuel runs down the hose, and a gauge counts the pounds. Lights under the tanker say up, down, forward, or aft. Drift out and the flow stops with DISCONNECT until you reconnect. Full says TANK FULL, the hose pulls away, then CLEARED.

A miss or a fly-by sets RE-ATTACK, with an arrow and the distance back to the bunker. Climbing out of the valley to turn is forgiven, and the lock and the guided release work on the way back in.

The HUD keeps only what the moment needs. Idle numbers fade. What stays is large, on a dark plate, and updates in calm steps. Buttons dim until they matter, and they still take a press.

Stamp `s17 · 17x`.

## s17 · 17w — a photographed sky, the jet stays in frame, the tanker stays up

The high sky is a real photograph: Alps Field, a bright day over snowy Alpine peaks, from Poly Haven, CC0. The paper clouds and the stripy rock skirt are gone. The same picture is the sky in the valley. The valley's far ridges fade into that photo's haze.

The chase camera keeps the player's jet fully on screen, low and centred, in portrait and landscape, including while banking and while joining the tanker. The join may show the tanker as well, and it does not push the jet off the edge.

The tanker stays until the tank is full. It is not culled, fog does not swallow it, and if it is past the old draw distance the far plane opens up and a marker plus the distance stay on the HUD. The page asks the browser not to keep an old copy, and the script is `main.mjs?v=17w`.

The 17v fixes stay: combat buttons answer, and the engine bed fades instead of clicking.

Stamp `s17 · 17w`.

## s17 · 17v — mountains, and three fixes from the iPhone

The high peaks are no longer cones. They grow out of the valley ridges: ridged rock, snow on the crests, dark faces on the steep side, lit by the sun. The sky at that height is blue and only the far ridges fade. The cloud deck has bright tops and shaded undersides. The valley, the lock, and the strike are unchanged.

The same build answers three notes from the iPhone on 17u.

The tanker used to give up after about two and a half minutes, or once the jet passed the old leave line, and then it was simply gone. It now stays on the high leg until the tank is full. While you are still looking for it, the HUD keeps a direction arrow and the distance. When the tank is full the line is TANKER BREAKING AWAY, then DESCEND — VALLEY AHEAD.

FLARE did nothing because the combat buttons were hidden for the whole time the tanker was on screen. FLARE, BREAK, JAMS, GUN, LOCK, and RELEASE stay up until you are actually in the basket. A press flashes the button. If there is nothing to use, the line says NO FLARES, NO JAMS, BREAK — WAIT, OUT OF RANGE, or NO RELEASE. A second finger still reaches them while the stick is held.

The scratch like a gramophone needle came from the wind and engine pieces starting loud, gains jumping, and too many pieces playing at once. Each piece now fades in and out, the noise starts and ends on silence, and only two of each play at once. A captured stretch of the bed had no clipped samples and no jump big enough to be that scratch. Not listened to by ear, and not on a real iPhone.

Stamp `s17 · 17v`.

## s17 · 17u — refuel above the peaks

The tanker no longer rides the valley toward the bunker. After take-off the jet is on a high leg, above the snow, and the tanker is there. Fuel complete, the tanker breaks away, and the cue is DESCEND — VALLEY AHEAD. The valley, the lock, and the strike are the same. A ring of snow peaks and a cloud deck sit around the valley. They are drawn only. The ground you can hit is still the 17n valley.

Stamp `s17 · 17u`.

## s17 · 17t — the air does not loop

The engine and the wind no longer repeat every few seconds. The F-105 whine is played in long overlapping pieces from random places in the recording, and the wind is new filtered noise each time. It follows the throttle, swells in a turn, and whooshes near the ground. Nothing in that bed sits up in a piercing band.

Stamp `s17 · 17t`.

## s17 · 17s — release means a drop

The RELEASE button only says RELEASE when a press drops the bomb. Hold LOCK until LOCKED, then press RELEASE and the bomb is guided. Without a lock, the same button drops a free-fall while you are in range. Once LOCKED, the lock stays through small moves until the bunker leaves the range.

Stamp `s17 · 17s`.

## s17 · 17r — quieter engine, iPad is a tablet

The piercing tone after a missed pass was the F-105 engine whine, left open at 2,200 Hz once the other sounds dropped away. The engine now stays under about 900 Hz and moves a little with the throttle. Warning tones are sines and they go silent as soon as the warning ends. An iPad, which tells Safari it is a Mac, is treated as a touch tablet: lighter valley, a sharper picture than a phone, and sound starts on the first touch.

Stamp `s17 · 17r`.

## s17 · 17q — a lock is a hit

Hold LOCK with the bunker in the box and inside 4.2 km. After a short hold the cue is LOCKED. Release then, and the bomb is GUIDED onto the bunker. Release without that lock and the bomb falls free: SHORT, LONG, or MISS. Phones start in battery saver, draw a coarser valley, and stay at 30 fps until saver is turned off, which raises them to 45.

Stamp `s17 · 17q`.

## s17 · 17p — valley restored

17o (`4611f87`) put the flight in the real Mattertal. It did not feel right, so that scenery commit is reverted. The ground, materials, clouds, trees, and bunker are the 17n valley again. Tanker lock, the calm lesson, the bandit, the grid, the frame cap, battery saver, and the zoom lock stay.

The penetrator no longer steers toward the bunker. It leaves the jet with the jet's speed, falls under gravity, and stops on the first surface the ray meets. A hit on the bunker, or within 72 m of it, is the strike. Anywhere else is SHORT, LONG, or MISS, with a dust burst on that ground. The CCIP diamond is the predicted impact.

Stamp `s17 · 17p`.

## s17 · 17n — cooler phone

The picture stays the same. The game no longer chases a 120 Hz screen: flight is capped at 60, the brief at 30, and pause, hide, and the score screen stop drawing. Pixel ratio never goes above 2, and a slow frame drops the render scale. Battery saver, off unless chosen, goes to 30 fps and a lighter scene. The choice is `localStorage.ds17n_batt`.

Stamp `s17 · 17n`.

## s17 · 17m — defence grid

Destroying the bunker raises a cable barrier across the escape valley. After the dogfight the jet has to thread the one gap. A cable hit is KILLED BY: DEFENCE GRID. Passing once arms extra, lower, narrower grids on later sorties. START AT GRID is the practice.

Stamp `s17 · 17m`.

## s17 · 17l — the ring locks

The dot is the nose, and it is the same point the lock measures. When that dot sits in the ring on screen for half a second, the probe snaps in with a clunk and an autopilot holds formation until the tank is full, about nine seconds. A small stick does not break it. A hard shove or a throttle pull does. The meeting is in the south of the valley, so there is about a minute of flying before the tanker turns away, well short of the release point.

Stamp `s17 · 17l`.

## s17 · 17k — put the dot in the ring

Refuelling shows one picture. Far away, a single arrow points at the tanker and the rest of the HUD is hidden. In the join, the camera looks up the tail so the hose and a bright drogue sit ahead of the nose. The basket is a lit ring with a dark outline and strobes, and the HUD ring is locked on it. The only job is to put the white dot in that ring. It turns green as you reach it, then reads IN with a fill bar. FAST or SLOW is one word. Score, radar, distances, and the other tapes stay hidden until fuel is complete. Contact is a little wider than the ring itself, and a light pull helps only in the last few metres. The 17j lesson flag is unchanged.

Stamp `s17 · 17k`.

## s17 · 17j — calm tanker, then a distant warning

The first refuelling is fully calm. Nothing shoots, locks, or spawns while the tanker call is active, until fuel is complete, the join is abandoned, or the jet leaves the tanker and enters the defended belt, plus about four seconds after. START AT TANKER practice stays calm even after the lesson is learned. A later sortie, after one real FUEL COMPLETE, adds only a distant `BANDIT, FAR` callout, a short search blip, and a countdown that never becomes a weapon. No SAM, AAA, guns, or missile can damage the jet during that phase. Combat, including the post-bomb dogfight, returns when the phase ends.

The lesson flag is `localStorage.ds17j_tanker` = `1`, and cookie `ds17jt=1` (one year, path `/`). It is written beside the high score keys `ds17e_hi` and `ds17e_streak`, and only on a non-practice FUEL COMPLETE. RESET TANKER LESSON on the brief clears both. The current sortie reads the flag once at start, so finishing fuel does not flip that same join into the warning.

Stamp `s17 · 17j`.

## s17 · 17i — tanker keeps up, bandit in front

The tanker flies at the jet's speed in the join, and faster when the jet runs past, so minimum throttle no longer overruns it. The basket is wider. The bandit merges head-on, in front, and comes back to twelve o'clock instead of camping at six. The F-105 whine is low-passed, and that loop stops on the debrief.

Stamp `s17 · 17i`.

## s17 · 17h — Sonniss choices on the sound bank

Extra Sonniss GDC 2026 clips sit on the sound bank rows. Nothing new is baked. The 17g flight is unchanged. The licence note is in `docs/sonniss/` and is not part of the public download.

Stamp `s17 · 17h`.

## s17 · 17g — survive the release, see the tanker, quiet the loop

The bomb run no longer kills a decent pull-out. For the release, the blast, and eight seconds after the camera comes back, radar locks and SAM hits are held off, and a terrain brush lifts the jet with `PULL UP / EGRESS` instead of ending the sortie. A crash after that is only when the jet meets the ground you can see. The failure screen names the cause.

The tanker starts ahead of the valley defences, large, with `TANKER AHEAD — JOIN UP` and an arrow. The looping valley bed stays off unless this build turns it on, and every music loop is held about 30 dB under the effects. Practice buttons on the brief jump to the tanker or the dogfight.

Stamp `s17 · 17g`.

## s17 · 17f — quiet release, loud blast, tanker

Mood now defaults to Off. An old pick code that still names a synth bed does not turn it back on. The bomb run, from release until the detonation, keeps the music and the beds down and leaves only a faint engine. Oil Rise still swells, then its peak is the loudest moment, then the rumble fades. The debrief stays silent.

On the way to the target a tanker flies the valley. Hold the basket to take fuel. Drift off and the hose drops. Three breaks, or running out of time, is a low-fuel warning and a score penalty. A full contact is fuel complete and a bonus. The fuel clock itself waits for the next build.

Home Screen names are DS 17f and SND 17f.

Stamp `s17 · 17f`.

## s17 · 17e — terrain-hugging score

A multiplier from ×1 to ×5 builds while the jet is low and fast, and falls off as it climbs. Passing close to the ground or a ridge is a near miss: a short whoosh, a small shake, and a streak bonus. Above the ceiling the radar spikes, then a SAM lock, then a launch. Dropping into the weeds breaks that lock. The ground still kills. The debrief shows the score, the best streak, and the saved high score.

The 17d picks, Mood Off, and the F-15 fight are unchanged. The Home Screen name is DS 17e, and the sound icon is SND 17e. iOS keeps the old icon until the shortcut is removed and added again.

Stamp `s17 · 17e`.

## s17 · 17d — mood off, and a real fighter

Mood has an Off. It silences the valley synth, and that choice stays in the pick code, so a refresh, a retry, and a Home Screen launch that can read the code keep it off. The baked gun, bunker, flare, pass, impact, AAA, engine, and deck picks are unchanged. SAM and crash stay Current.

The escape fighter is the CC0 F-15 already on the deck, gear up, with afterburner, heat haze, and wingtip trails. It slashes, climbs, and tries for the six. It warns before guns and before a missile. Flares spoil a shot when the player is tracking it. Ten hits bring smoke, then fire, then a falling wreck. The chase camera is unchanged and the gun still fires only while it is held.

Stamp `s17 · 17d`.

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

Current project checkpoint: DEEP STRIKE s17 · 17x27. The sky is still the Poly Haven Alps Field photograph. After the tank is full and you leave the basket, the combat buttons come back, and the seconds right after CLEARED are safe. Each full mission is a different seed. After the target, follow the arrow out of the valley, over the open sea, and trap on the carrier. Pages folder `/strike-17/` only. `/strike-16/` stays `s16 · 16n`.
