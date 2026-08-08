# VOLT KEEPER

A fixed-screen arcade game on **crisp-game-lib 1.5.0**, with a **self-implemented**
BGM/SE subsystem. The library's built-in `play()` / algo-chip path is deliberately
unused: `index.html` loads no algo-chip scripts and the game never calls `play()`.

The capacitor drains constantly and the only way to refill it is to absorb sparks,
which requires standing in their path while grounded. The field pieces are not
obstacles — they are harvest terrain that decides where the income is. Each wave
sets a quota in banked energy; clearing it cashes the capacitor out into score and
fits a full battery, and missing it fits a short one.

There are two pieces, and they are deliberate opposites. An **arrow** forces any
spark that touches it onto the direction it points, whatever that spark was doing
when it arrived — so a board can be read rather than simulated, and four arrows
aimed at each other are a circuit that captures anything entering from any
direction. A **bumper** reflects off its surface normal and adds speed, so its
result depends on where it was struck. Every layout carries both, because the
difference between them is only learnable side by side — except the first one.
Wave 1 is an empty field, wave 2 is a bare circuit of arrows with nothing else
moving on it, and everything from wave 3 mixes.

Terrain pays. A spark picks up a **volt** every time an arrow turns it and is worth
more for going faster, so one that has been round a circuit banks over twice what
one straight off a port does — it wears a cyan ring that grows with its worth, and
which spark to cross the field for is the decision the board exists to pose.

From wave 3 a **scavenger** crawls in and eats the arrows. It outruns the keeper,
so it cannot be chased down — but it stops dead on the piece it is taking and
draws a dial while it works, and killing it inside that window saves the piece.

## Run

```bash
npm install
npm run serve            # http://localhost:8080/
```

Controls: **Arrows / WASD** move, **Z / X / Space / J / K** ground (0.5 s).

The HUD carries three quantities. The wide bar is the capacitor: a level, and the
thing that kills you. Above it, sharing one target tick, are the two marks that
answer the wave's question — the yellow one is energy banked against the quota,
the blue one is the wave clock (flashing for its last five seconds). Both fill
toward the tick, so which of them reaches it first *is* the question.

## Validate

```bash
npm run validate:audio   # derive manifest from the kit, run the skill validator
npm run render           # offline render: peak/RMS/onset/tail per program and cue
npm run render -- --wav build/wav   # also bounce WAVs for auditioning
npm run test:audio       # bus arbitration, gating, determinism, event coverage
npm run test:bgm         # BGM continuity against a fake AudioContext
npm run test:geometry    # lattice closure, orbit closure, 20k-frame stability
npm run smoke            # headless Chromium: console errors, loop, live audio
npm test                 # all of the above
```

## Arcade cycle (game-owned)

`title` and `description` are left undefined, `options.isShowingScore` is `false`,
and `end()` is never called. `update()` owns frame zero onward and runs a phase
machine; score, hi-score and every ceremony are drawn by `main.js`.

```
boot ─▶ ATTRACT ──[Z]──▶ READY(100f) ──▶ PLAY ──miss──▶ MISS(90f) ──▶ PLAY
          ▲                                  └─last life─▶ GAME OVER(260f) ─┐
          └──────────────────────────────────────────────────────────────────┘
```

- **ATTRACT** — a demo pilot drives the real `stepWorld()`: it predicts where each
  spark will pass, grounds just before one arrives, and backs off while recovering.
  All emissions are marked `demo: true` and suppressed; the hi-score is never
  written from a demo run. Hint cards rotate every 7 seconds.
- **READY / MISS / GAME OVER** — the world is frozen; only the phase timer runs.
  Game over shows the final score and flags a new record.
- The start press cannot bleed into a ground: attract consumes it, and `stepWorld`
  runs on the demo pilot's input that frame.

Ceremony text sits between two 1px rules rather than on a filled panel — on this
theme no palette entry is darker than the background, so a "dimmed" backing panel
renders as a bright slab that blanks the playfield. A test enforces the rule.

## Design decisions that came out of measurement

Every number below is from `tests/harness.mjs` running the shipped `main.js`
headlessly with a scripted policy, 5-7 seeds per arm.

| Change | Evidence |
|---|---|
| **The leaker enemy was removed.** | As a periodic drain, an A/B with it deleted produced identical wave, survival and death causes. Made expensive, it became a tax with no affordable counter-play: a bot that intercepted leakers scored **76% worse** than one that ignored them, because travel is the costliest act in this economy and interception forces a trip to the least productive part of the field. Retargeted as a camp-detector it fired on ordinary play, while the camping it was meant to punish already ends a run in **~36 seconds** on its own. |
| **Terrain turns a spark to an absolute direction instead of rotating it 90°.** | A rotation is relative to the spark's heading, which the screen never shows, so the same piece gave a different answer every time. Across 8 piloted runs no family ever put two piece types on one screen (CROSS/RING were all deflector, GAUNTLET all rotor, SPINE all bumper), so there was never an occasion to compare them, and exposure was hopelessly skewed: deflectors **2260 s**, rotors **355 s**, bumpers **39 s** — about five seconds of bumper per run. The only difference measurement could detect at all was the bumper's acceleration (avg speed **1.44 / max 2.48** against 1.25 / 1.68 elsewhere). Arrows state their whole effect on their face; every family now carries arrows *and* bumpers so the contrast has somewhere to be seen. |
| **The player can no longer flip terrain.** | Not because it was weak — because it was welded to the wrong action. Flipping was a side effect of grounding, which is how the keeper takes the income that exists *now*, so shaping where future income goes could never be aimed at anything. It fired on only **23-43%** of grounds; **63-73%** of the flips it did cause touched no spark within three seconds; the ones that landed did so a median **1.0-1.8 s** later, somewhere the keeper had already left. On rotor boards the machine's own turns outnumbered player flips **605:50** and overwrote **52%** of them before use. Terrain is read now, not steered. |
| **Family unlocks are set from measured reach, not from intent.** | 12 piloted runs ended at a **median of wave 4** and never passed wave 6, against a schedule that opened the last families at waves 6 and 8: SPINE was reached in **1 of 12** runs, DIAMOND and the polar variant in **0 of 12**. Everything is now open by wave 4. |
| **Turning arrows are staggered across the rotation period.** | The rotors they replace all turned on one shared `ticks % period` frame, so a whole board changed its mind at once — 605 turns a wave that the player could attribute to nothing. Phase is now spread across the period, and the board reads as a wave crossing it. |
| **Layouts are randomised inside each family, and checked for two traps.** | Fixed templates made every board of a family identical, so position jitter and flow direction now vary per wave. Absolute direction also makes two configurations reachable that a rotation never could: two arrows aimed down the same line at each other trap a spark bouncing between them where it can never be absorbed, and an arrow parked against a wall gets the spark straight back off the bounce. Both are structural checks in `buildLayout`, not something a family is trusted to avoid. |
| **The scavenger arrives at wave 3, outruns the keeper, and eats on a visible timer.** | It is the only thing that can take a piece off the board, and it was barely in the game: gated at wave 5 against a median run of wave 4, it appeared in **3 of 12** runs — 6 spawns in 20 minutes of play, with a piece disabled for **5.4%** of frames. It also crawled at 0.35 px/frame (a third of the keeper) in `light_purple`, an **x3.5** contrast entry, drawn as the same 6px box as an ordinary spark. It now spawns from wave 3, crosses at 1.6 so it can never be run down, and stops on its target for 90 frames before the piece is lost — a window with its own countdown dial, because an enemy answered only by chasing is what got the leaker deleted. Result: seen in **10 of 12** runs, a piece disabled **26.7%** of frames, and the pilot now intercepts 17 against 2. Median wave reached is unchanged at 4. |
| **Terrain is introduced on a board by itself, at wave 2.** | First contact used to be three things at once: two piece types that behave nothing alike, plus the scavenger walking in to eat them. Wave 2 is now a bare circuit — arrows only, no enemy, nothing else moving — and it is the one board exempt from the mixing rule. It sits at wave 2 rather than 3 because at wave 3 only **50%** of measured runs ever reached it: waves 1-2 were both empty and a median run is three waves, so a full minute of blank field came before the game showed its subject. Moving it up took the teaching board from 50% of runs to **79%**, and bumper, mixed-board and scavenger exposure each from ~40% to **58%**, with no change in median survival. Holding the scavenger back a further wave to keep the first *mixed* board clean was measured too, and rejected: it cost 20 points of scavenger exposure and bought nothing else. |
| **Sparks bank volts from arrows and a premium for speed.** | The premise did not hold. The shipped pilot predicts sparks in straight lines, so it cannot see terrain at all and measured no difference either way; a pilot written to replay the real physics scored **2.8x** better (12.19 vs 8.46 banked/s, median wave 6 vs 4), proving reading the board is worth a great deal. But *having* a board was not: with terrain forced off, that same pilot **gained** a wave of survival and ~10% score for only ~10% less income, because straighter sparks are easier to dodge. Live terrain was a net loss, which made every attack on it a favour to the player. A spark now takes a volt per arrow that turns it (cap 4, +25% each) and is paid for speed above its own launch speed (up to +40%) — an arrow is the battery farm, a bumper is the accelerator. Live terrain now measures **+21%** income for the shipped pilot (11.26 vs 9.28) against **-1.5%** before, and halves starvation deaths. Disabling an arrow went from *gaining* 10% score to costing **25% income and 8% score**. |
| **The scavenger eats arrows only.** | With the economy fixed, taking an arrow off the board is a real loss — but taking a *bumper* off still **gains** 8% score, because a bumper is a hazard that pays only a little. An enemy whose effect is a favour is not an enemy, so it leaves them alone. The blunt alternative — making bumpers safer — would erase the one contrast the two pieces have. |
| **Every spark is built by one factory.** | Three call sites each spelled out their own field list, and when `volts` was added the one that seeded a LOOP circuit was missed. That spark paid `NaN` energy and a `NaN` score the moment it was banked, and the whole suite stayed green: nothing absorbs that particular spark often enough to trip over it. The population is now asserted finite every frame of the long run, rather than trusting three constructors to stay in step. |
| **Split children are inert for 45 frames and ejected outward.** | They used to spawn inside the ring the player was already standing in, so the heavy's "cost" was two extra free absorbs. |
| **Recovery is 45 frames at 0.9 speed with a countdown arc; grounding allows ~10px of drift.** | The commitment is the point, but it was unreadable and felt like a controls blackout. Drift lowers no risk — sparks inside the ring are being absorbed, not threatening — so it only rewards a good read. |
| **Both halves of the ground gesture show remaining time.** | The catch radius stays a full circle; an inner sweep counts the ground window down, in the same language as the recovery arc. The circle was drawn in `light_cyan` — half-brightness on this theme, **x5.0** against the field where plain `cyan` is x10.0 — so the one mark telling the player how far they reach was dimmer than the keeper drawing it. Third time the same half-brightness trap has bitten here, after the terrain (`light_blue`, x3.4) and the scavenger (`light_purple`, x3.5). |
| **The start jingle was never audible.** | The frame that leaves attract is still flagged `demo` when `beginFrame` runs, so `game:start` was suppressed on every run — measured 0.0 plays/run. It now emits with `demo: false`, which is what it is by definition. |
| **A jingle no longer schedules its own restore.** | The melody swelled back to **0.283 gain 1.167 s after game over** — the game-over jingle's length plus a frame. `stopBgm()` skipped voices that were still ducked, so the stop never reached them, while `duck()` had scheduled a restore to the gain captured *before* the jingle. The duck now only ramps down; the per-frame `setLayerGains` restores the voice with the value that is live at that moment, and a requested gain of 0 always overrides an in-flight duck. |
| **The adaptive BGM was adapting to nothing.** | The danger axis is `1 − capacitor/100`, and absorbing is what refills the capacitor — so a run that is going well pins the axis at zero. Over 2000 s of demo-pilot play it sat below 0.04 for **62%** of frames and **never passed 0.58**. The ladder asked for 0.25 (lead), 0.60 (hats) and 0.85 (`critical`): the hats never sounded once, the `critical` cue never played once, and **86% of play was the bass line alone** — 22 of its 32 notes the same A. Thresholds now come from that distribution, the bed is bass + lead unconditionally, and the same trace replayed through the bus visits **4 arrangement states at 4.5 changes/min** with `critical` audible 14.5% of the time. |
| **The loop is 8 bars, and `critical` is its own phrase.** | One 4-bar loop, 6.4 s, repeated ~40 times per run, and `critical` was `main` transposed +12 with the same rhythm and the same bass — so the one cue swap that could have broken the repetition changed only register. Both cues are now A + B halves over 8 bars (12.8 s, against a 32 s budget) with different rhythms, registers and bass motion in each half, and `critical` shares no note or onset list with `main`. |
| **A cue swap lands on four bars, not on the loop.** | Doubling the loop doubled the worst-case wait for `critical` to arrive. Measured danger excursions past 0.45 last about 7 s, so a 12.8 s boundary would routinely resolve after the danger had passed. Swaps now land on the 6.4 s half-loop grid and the incoming source starts at the outgoing one's position, so the swap continues the phrase instead of restarting it. |
| **Layer changes are quantised to a bar.** | At the measured thresholds the raw axis crosses ~40 times a minute; as a direct per-frame gate that is a flicker, not an arrangement. Each layer now carries its own hysteresis and may only change on a bar boundary — 2.4 changes/min instead of 40. |
| **Audio suspends when the tab is hidden.** | The animation-frame loop stops on its own, but a looping `BufferSource` does not, so the BGM played on behind whatever the player switched to. `visibilitychange` now suspends the `AudioContext`, which also freezes `currentTime` so the loop bookkeeping survives the gap. |
| **Surplus energy converts to score (overcharge).** | Energy over 100 was silently discarded, which made a full capacitor a reason to stop absorbing. |
| **Drain now tracks income instead of the bar.** | The capacitor was decorative. Measured play banks **4.5 energy/s** (36.7 absorbs/min, **3.5 per ground** — a ground harvests the ring, not one spark), against a drain of 1.65-3.0/s. So the bar sat **above 90 for 75% of frames**, never fell below the 50 a miss resets it to, and ended **0 of 90 lives**; the only real death cause was contact. Drain is now `min(10, 4 + 0.5w)/s`, set from measured income per wave (4.1/s at wave 1, 9.3/s at wave 12) so the squeeze is constant rather than arriving all at once. |
| **The drain ceiling sits where income stops growing.** | `sparkCount` caps at 12, so income flattens around 9.5/s past wave 12 while a linear drain would not: at `min(15, ...)` wave 16 ran a **-2.3/s deficit no play could answer**, which is a clock dressed as difficulty. The clamp is now 10/s, reached at wave 12. |
| **A wave clear cashes the capacitor out and fits a fresh battery.** | Waves were pure time: nothing marked one. The surge now pays `charge x 20 x multiplier` and replaces the capacitor with a fixed **70**. The rule was chosen against its alternatives on one axis — whether the resource survives it. A top-up (`capacitor + n`) measured gentler at every size, but **every** value from +30 upward drove starvation to **0% of deaths**, handing back exactly the pressure the drain had just been given; cashing out keeps it at **2%**. It is also the only version the ceremony can state honestly: a bar that appears to empty into the score while the charge it carried is quietly still there is a lie the animation would be telling. At 50x the payout was 56% of a run's score and drowned out absorbing; at 20x it is **24%**. |
| **The payout is counted out, not handed over.** | The rule — charge becomes points — is stated nowhere else in the game, and a bar that snapped to the new battery while a number appeared beside it left the two facts unconnected. The bar now drains to empty over 36 frames of the 60-frame freeze while the ceremony's figure climbs in step and the score rises with it, then the fresh battery snaps in. The remainder is settled on the last frame, so the total is exactly the bonus rather than the sum of 36 roundings. |
| **A wave has a quota, and the quota decides the battery.** | Wave clear was pure elapsed time: 1800 frames, nothing to reach. It still is — but what the surge *hands back* is now earned. Banking `1.2 x` what the wave will drain fits the full **70**; falling short fits **40**. The quota measures energy banked across the wave, not charge held at the end, and that separation is deliberate: the payout already rewards arriving charged, so gating the battery on the same thing would compound one bad wave into the next. Throughput is what a player can still be doing well while the bar is low. |
| **The quota ratio is set by pass rate, and had to exceed 1.0 to exist.** | The measured pilot clears **100%** of waves at every ratio up to 1.0 — a quota under the drain is not a gate, it is a formality. 1.1 gives 89%, **1.2 gives 74%**, and 1.35 gives 33% with runs **14% shorter** and starvation returning: past that point the short battery feeds itself, which is a spiral, not a goal. |
| **The quota is on screen while it can still be acted on.** | A quota first revealed at the surge is a lottery, not an objective: the last ten seconds of a wave can only be played differently if the shortfall is visible during them. A meter fills on the status row, meeting it announces itself mid-wave with its own cue (`wave:quota`, rank 7 in the `ground` family, so it replaces the absorb that completed it — at that moment it is the news), and the surge states what it bought. |
| **The wave clock is on screen too, or the quota is unreadable.** | "80% banked" says nothing without "8 seconds left", and the charge payout can only be aimed at a surge the player can see coming — the wave had no visible deadline at all. |
| **The clock is paired with the quota, and fills rather than drains.** | It first ran down the top edge of the playfield, immediately under the capacitor bar. Two problems, both of them about what the arrangement says rather than what it shows: a mark depleting beside the bar that kills you reads as death approaching, when a wave running out is the payout arriving; and the quota and the clock are the two halves of one question, so putting them at opposite ends of the screen made the comparison a memory exercise. They are now one instrument in two rows over a shared target tick, both filling left to right. Which mark reaches the tick first is the question, drawn. |
| **The ceremony moves to the half the keeper is not in.** | Four lines of ceremony over a frozen keeper meant the payout and quota lines were the ones a keeper parked near the centre sat on, which was checked by looking at a screenshot rather than by any assertion. The world is frozen for the whole freeze, so the block picks its half once and cannot flicker. |
| **The quota gauge is a growing mark against a target tick, not a bar with a track.** | On this theme an empty track renders as a bright slab (the same palette fact that rules out a dimmed ceremony panel), so a tracked meter above the capacitor bar read as a second capacitor sitting nearly empty. A baseline under it was worse: at y=14 it touched the capacitor frame at y=15 and became a bump on it. Only the target tick is static now. |
| **The BGM thresholds were re-derived, again.** | The danger axis is `1 - capacitor/100`, so making the capacitor real moved it: p50 **0.33**, p90 **0.62**, p95 **0.69**, p99 **0.84**, and it now reaches 1.0. Percussion moved 0.25/0.18 -> **0.45/0.35** (audible 37% of play; at 0.35 against this axis it was 54%, which is a bed, not a state) and the cue swap 0.45/0.30 -> **0.65/0.35**. Hysteresis width was set by how long a visit lasts, not by symmetry: at 0.60/0.45 `critical` arrived 2.4 times a minute and left after **4.0 s** — shorter than the 6.4 s half-loop it swaps into, so it never finished a phrase. At 0.65/0.35 it arrives **1.5/min** and stays **7.0 s**, and the arrangement visits 4 states at 7.6 changes/min. |

Current balance, measured with the shipped attract pilot as the policy, 7 seeds,
45-47 runs per arm, against the build before any of this work:

| | before | shipped |
|---|---|---|
| capacitor above 90 | 75% of frames | **11%** |
| capacitor under 60 | 9% | **48%** |
| capacitor under 30 | 0.0% | **7.0%** |
| median capacitor | 97 | **62** |
| starvation, as a share of deaths | 0% | **2%** |
| run length / wave / score | 96 s / 3.6 / 62k | **91 s / 3.5 / 67k** |

The bar's range costs 5% of run length. The wave payout is **24%** of a run's
score, the quota is met on **74%** of waves, and overcharge still fires **3.0 times
a minute** — rarer than the 21/min it managed when the bar was pinned, and now a
sign of a hot streak rather than the resting state. The flee-and-never-ground
probe in `tests/geometry.test.mjs` starves in **22.2 s**, which is the backstop the
drain is there to be.

Earlier revisions of this file quoted **9.1 / 171k / 272s** from a scripted policy
that was never checked in, so those figures are not comparable to the ones above
and cannot be reproduced from this repository.

## Files

| Path | Role |
|---|---|
| `main.js` | Gameplay. Emits abstract audio events; never touches the synth. |
| `audio/vk-dsp.js` | Pure DSP core (pulse / tri / LFSR noise, envelopes, master chain). Runs identically in the browser and in Node. |
| `audio/vk-kit.js` | Frozen hardware profile, budgets, program and cue data, event table. **Single source of truth.** |
| `audio/vk-bus.js` | Event bus (priority, caps, cooldowns, gating, tick arbitration) plus Web Audio and mock adapters. |
| `tools/export-manifest.mjs` | Projects the kit into the validation manifest. Never hand-edited. |
| `tools/render-audio.mjs` | Offline render and level measurement. |
| `tests/harness.mjs` | Runs the real `main.js` in a Node vm with crisp-game-lib stubbed. |
| `tests/bgm.test.mjs` | Runs the real Web Audio adapter against a fake `AudioContext` that integrates gain ramps, so BGM continuity can be measured rather than assumed. |

Dependency direction: `game -> bus.emit(name) -> kit resolves alias -> adapter -> synth`.

## Frozen audio contract

| Field | Value |
|---|---|
| Profile id | `vk-4voice-psg` |
| Fidelity | **era-inspired** — not an emulation of any named board |
| Voice limit | 4: `pulse1`, `pulse2`, `bass`, `noise` |
| Primitives | pulse (variable duty), tri, 15-bit LFSR noise |
| Voice ownership | BGM holds `pulse1` + `bass` + `noise`; SE holds `pulse2` and may claim `noise`; jingles claim all and pause BGM |
| Noise ownership | one LFSR shared by BGM percussion and SE; an SE claiming it ducks the BGM voice for the SE's duration |
| Parameter update | 60 Hz (one game frame) |
| Same-tick policy | `drop`, overridden to `coalesce` for the `ground` family |
| Repeat cap | 2 per event name per frame (bounds the queue, **not** audibility) |
| Cross-tick voices | monophonic: a new note on a voice ends the note still ringing there |
| Master chain | gain 0.28 → tanh soft clip (drive 1.6) → DC block 12 Hz → clamp ±0.9, mono |
| BGM mode | `layered-adaptive`, one exposed axis (`danger` = 1 − capacitor/100, clamped 0–1) |
| Adaptive boundaries | layer change on a bar (1.6 s); cue swap on a half-loop (6.4 s), phase-preserving |
| Budgets | SFX ≤ 0.6 s, jingle ≤ 1.6 s, ≤ 24 steps/program, loop ≤ 32 s, loop tail 0 s |

### BGM

Two 12.8 s cues (`main`, `critical`) at 150 BPM, 8 bars of 4/4 in A minor, each an
A half and a contrasting B half — B answers an octave up in a 3-3-2 rhythm under
`main`, and drops `critical`'s stabs for relentless eighths. `critical` is separate
music, not `main` transposed: it grinds the tonic against its b2 (A–B♭) over a
sixteenth-note bass. `main`'s percussion is an eighth-note groove with a fill closing
each half; `critical` keeps the constant sixteenth tick, which is the one place a
machine-gun hat belongs.

Thresholds come from the measured distribution of the axis, not from a tidy ladder
(see the table above). Bass and lead are the bed and are always audible; the
percussion layer enters at danger ≥ 0.45 and leaves below 0.35. The cue swaps to
`critical` at ≥ 0.65 — a capacitor under 35 — and back below 0.35. Every layer
change waits for a bar, and every cue swap for a four-bar boundary;
`tests/audio.test.mjs` asserts that no threshold sits above **0.69**, the measured
p95 of the axis over waves 1-12, so the arrangement cannot quietly become dead data
again. The bound is a percentile rather than the maximum on purpose: the axis
touches 1.0, but only in the instant a capacitor runs out, and a layer that can
only be heard as somebody dies is dead data of a subtler kind.

### Arbitration

Measured jingle rate over 5 runs (mean 237 s): `game:start` 1.0, `keeper:miss` 2.0,
`wave:surge` 6.8, `game:over` 1.0 per run — roughly one every 20 seconds, which is
punctuation rather than accidental background music. On the last life
`keeper:miss` and `game:over` are emitted on the same tick and both want
`pulse1 + bass + noise`; arbitration keeps game over and drops the miss, verified
in every run.

Priority order: danger warning (120) → game over (115) → miss (110) → ground/absorb
family (100–90) → loss events (85–70) → cabinet jingles (60) → multiplier cap (55)
→ terrain ambience (40–25) → BGM (20). Three deliberate silences carry no sound: `keeper:recover`,
`wave:layout`, `arrow:turn`.

The `ground` family coalesces rather than dropping. Grounding onto a spark that is
already inside the ring emits the click and the absorb in the same tick, and several
absorbs in one ground arrive together — in both cases the highest-ranked member is the
single sound, because that is the one carrying the information.

## Known limitations

- **Nobody has listened to this.** Every audio gate here is measurement (peak, RMS,
  onset, tail, level ordering inside co-occurrence groups) plus a live-context check.
  That catches silence, clipping, a late onset, and a runaway tail. It does not catch
  "the hats are annoying" or "the lead fights the absorb". Audition at low volume
  during play before treating the kit as finished.
- **`critical` arrives 1.5 times a minute** and stays 7.0 s. Its arrival rate is now
  set by a measurement that stops short of the question that matters: a visit is at
  least one half-loop long, so the cue always finishes a phrase, but whether a swap
  every 45 s reads as tension or as churn is a listening question. If it churns,
  raise `CUE_SWITCH.toCritical` — though there is little headroom left above 0.65,
  since the measured p95 is 0.69 and past it the cue is reachable only as a run ends.
- The ambience-vs-bed level check is the weakest one: it compares a short high click
  against a bass-heavy loop by peak-vs-RMS, which understates spectral separation.
- Initials entry and a multi-row high-score table are not implemented: the cycle
  keeps a single persisted hi-score in `localStorage`.
- All balance figures come from the attract pilot, not from human play. A bot that
  plays one way well can hide problems a person would find in a minute — and this
  one in particular never looks at the capacitor, so every figure about the bar is
  what happens to a player who ignores it. A person who reads the bar and takes a
  risk to refill it will see a different game, most likely a more forgiving one.
- Ceremony text overlays a live demo, so a spark occasionally crosses a glyph on
  the attract screen. Legibility is acceptable but not perfect, and no palette-only
  fix exists on this theme. The surge ceremony now dodges the keeper specifically,
  but nothing dodges the sparks.
- The HUD was checked by eye, once, at one moment of one run. The tests assert that
  each gauge is drawn, moves in the right direction and is reset by the right
  event; they cannot see that two of them together read as one instrument, which is
  exactly the bug the screenshot found twice.
