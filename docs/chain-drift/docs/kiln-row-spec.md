# KILN ROW — Implementation Spec

Engine: crisp-game-lib (browser), code-drawn shapes only, no pixel assets.
Input: pointer-follow movement + click/tap = PULL. Pointer-primary for the same
attract-replay reason as CHAIN DRIFT.

## Screen Layout

`options.viewSize = { x: 160, y: 120 }`.

```
y 0..9     HUD strip
           left: SCORE 0000000   centre: FLUE gauge (48 px bar, fills red)
           right: ROUND 1-4  +  lives as up to 5 pot icons
y 10..119  workshop floor
           upper kiln row: y = 34, slots at x = 20, 40, 60, 80, 100, 120, 140
           lower kiln row: y = 96, same x positions
           player moves freely in the aisle (y 44..86) and up to each row
```

Active slots for a round are filled from the centre outward, alternating rows, so
a 3-slot round is compact and an 8-slot round spans the screen. Slot positions are
fixed data, not level design — the only variable is how many are lit.

## Object List

| Object | Shape / size | Behaviour |
|---|---|---|
| **Player (POTTER)** | 6×8 upright bar, `cyan` | Moves toward the pointer at 1.15 px/frame. Must be within 8 px of a kiln mouth for PULL to apply to it (nearest wins). |
| **Kiln mouth** | 12×10 arch outline, `light_black` | Fixed. Holds at most one pot. Empty after a pull for `reload` frames, then loads a fresh pot at heat 0. |
| **Pot** | 8×8 rounded box, colour ramps by heat | `heat` rises `heatRate` per frame. Colour: `light_black` <40, `blue` 40–69, `yellow` 70–89, `red` 90–99, blinking `red`/`white` ≥100. Heat is also drawn as a 2 px fill bar under the mouth so the state is readable without relying on colour alone. |
| **Soot sprite** | 5×5 jittering blob, `purple` | Spawns at a screen edge every `sootInterval` frames, crawls at 0.4 px/frame to the nearest loaded kiln, then attaches and doubles that pot's heat rate. Removed after the player stands within 6 px for 20 cumulative frames. Never lethal. |
| **Flue gauge** | HUD bar | `flue` 0..100. `+6` per pull in band, `+10` per pull below 70, `+12` per rescue pull at ≥100. Decays `flueDecay` per frame. At 100 → VENT. |
| **Vent event** | screen shake + white flash, 30 f | Every pot gains +25 heat instantly; `flue` resets to 40. |

## Bands and Income

```
heat  0..69    cold      contributes 0
heat 70..89    band      contributes 1
heat 90..99    peak      contributes 2
heat 100..     critical  contributes 0, crack countdown running
```

Per frame: `score += floor(0.35 * contributionTotal * lapMultiplier)` accumulated
in a fractional carry. Four pots at peak ≈ 168 points/second.

Pull bonus, by heat at the moment of the pull: `<70 → 0`, `70–89 → 100`,
`90–99 → 400`, `≥100 (rescue) → 150`. The pull bonus is deliberately small
against sustained income (400 ≈ 2.4 s of a good field) so the economy stays
defense-survival rather than turning into harvest-scoring.

## State Transitions

Pot: `loading(reload f) → heating → [pulled → slot empty → loading] |
[heat ≥ 100 → crackCountdown(f) → cracked → miss → slot empty → loading]`.
A rescue pull during the countdown is legal and awards 150.

Player: `alive → hit(crack) → shutdown(60 f)`. Shutdown: every pot on the board is
removed and every slot restarts its reload; `flue` resets to 0. Because a crack
triggers a full shutdown and at most one life can be lost per 60-frame window, a
vent can never take two lives at once.

Phases: `title → attract → ready → play → (clear → ready) | (death → play) |
(death → gameover → entry → table → title)`. Same single-`phase` discipline,
20-frame grace on chained confirms, spawner re-checks `phase` mid-frame, and
frozen phases stop heat accumulation, reload timers, soot movement, and the flue
decay — not just the player.

## Collision Detection

| A | B | Trigger |
|---|---|---|
| player (8 px radius) | kiln mouth centre | that kiln becomes the PULL target (nearest only) |
| player (6 px radius) | soot sprite | accumulate brush timer, remove at 20 f |
| soot sprite | kiln mouth | attach, ×2 heat rate for that pot |
| — | `heat ≥ 100` | start crack countdown |
| — | `countdown = 0` | crack → miss |
| — | `flue ≥ 100` | vent |

There is no lethal contact collision in this game at all; every miss is a timer
the player failed to service.

## Difficulty Escalation Formula

| R | Name | slots | heatRate | reload (f) | sootInterval (f) | flueDecay | crack (f) | quota (pulls) |
|---|---|---|---|---|---|---|---|---|
| 1 | FIRST FIRING | 3 | 0.30 | 45 | — | 0.10 | 90 | 10 |
| 2 | SOOT | 4 | 0.32 | 45 | 480 | 0.10 | 90 | 12 |
| 3 | QUICK CLAY | 4 | 0.46 | 36 | 420 | 0.10 | 75 | 14 |
| 4 | WIDE ROW | 6 | 0.32 | 42 | 420 | 0.10 | 80 | 16 |
| 5 | CHOKED FLUE | 5 | 0.38 | 40 | 360 | 0.05 | 75 | 18 |
| 6 | ASH STORM | 7 | 0.42 | 34 | 240 | 0.08 | 65 | 20 |
| 7 | SLOW BURN *(breather)* | 5 | 0.26 | 30 | 600 | 0.20 | 90 | 22 |
| 8 | FULL KILN | 8 | 0.46 | 30 | 260 | 0.07 | 60 | 24 |

Lap scaling (`L` = 0, 1, 2, …):

```
heatRate     = base * 1.12^L
crack        = max(40,  round(base * 0.90^L))
sootInterval = max(150, round(base * 0.88^L))
reload       = max(20,  round(base * 0.94^L))
quota        = round(base * 1.15^L)
lapMultiplier= 1.15^L          // applied to income and pull bonus
slots, flueDecay: unchanged by lap
```

Round personalities come from the *mix*: R3 is few slots but fast (pure timing),
R4 is many slots but slow (pure travel), R5 attacks pull discipline via flue
decay alone, R7 is the deliberate breather after the R5–R6 stretch — low rate,
fast reload, generous flue — i.e. the round where a good player parks five pots
at peak simultaneously and farms.

## Score Economy

- Sustained income and pull bonuses as above.
- Round-clear bonus: `400 × R × (lives + 1)`.
- Par-time bonus: `max(0, par - elapsed) × 8`, `par = quota × 3.5` seconds,
  bottoming out at 0. Check that rushing pulls (which charges the flue) cannot
  out-earn holding pots in band — if it can, cut the par multiplier.
- Extend: **first at 40,000, then every 100,000**. Estimated from ~7–9k per round
  at a competent 3–4 pots-in-band average; **re-measure with an autopilot run
  before shipping.**
- Initials entry and top-5 table: identical rules to CHAIN DRIFT (phase before
  `end()`, replay-flag-guarded persistence, factory defaults with 5th ≈ 9,000 and
  1st ≈ 38,000, shortened timeout under the replay flag).

## Ceremony Screens

`ready` (90 f, `ROUND n` + personality name, kilns visible but cold and frozen) →
`clear` (150 f, `FIRING COMPLETE` + bonus tally) → `death` (60 f, the shutdown,
`CRACKED`) → `gameover` (120 f, jingle before the engine call) → `entry` →
`table`.

## Attract Mode

Pointer-driven replay, as in CHAIN DRIFT. Attract highlight to guarantee in the
seeded recording: a round-8 moment with eight pots blinking at peak and the flue
bar in the red while the player sweeps the row.

## Game-Over Condition

Lives reach 0. A crack costs one life plus a full-board shutdown. Infinite laps
with the scaling above; no ending.

## Anti-Idle / Anti-Mash Invariants (verify with state-injection probes)

- **Idle**: income requires pots *inside* the band; heat always rises, so an idle
  board leaves the band within `(100-70)/heatRate` frames and then cracks. Idle
  income converges to 0 and then costs lives.
- **Mash**: pulling below heat 70 scores 0 *and* charges the flue by 10 — the
  worst rate in the game. Mashing at a reloading slot does nothing but is still
  the frames you did not spend at a hot kiln.
- **Hold**: no hold action exists; the only held action (brushing soot) is
  positional and pays nothing directly.
- **Degenerate safe loop**: pulling every pot at exactly 70 is survivable but
  yields contribution 1 per pot and a heavy flue load, scoring far under the
  quota pace — safe play cannot clear rounds.
- **Critical invariant**: the flue must make aggressive pulling *and* panicked
  early pulling both worse than riding the band. If telemetry shows a dominant
  strategy at either extreme, adjust `flue` charges before touching heat rates.

## Validation Gates

1. `smoke-testing-web-games` — headless load, idle, input bursts, zero console
   errors.
2. `probing-web-game-mechanics` — inject state and assert: band boundaries and
   income per frame, pull-bonus tiers at 69/70/89/90/99/100, flue charge per pull
   type, vent at 100 adding +25 to every pot, one-life-per-60-frames guard during
   a multi-crack vent, quota → clear → next round, extend threshold, entry save.
3. Screenshot every ceremony screen.
4. `evaluating-gameplay-balance` — distribution of pull heats (the whole game is
   in this histogram; a spike at 70 means the flue is too punishing, a spike at
   99 means cracks are too forgiving) and death causes.
5. Full cycle twice: title → attract → game → game over → entry → table → title.
