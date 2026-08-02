# CHAIN DRIFT — As-Built Specification

Engine: crisp-game-lib **1.5.0** (pinned; version verified from the npm registry,
not guessed). It is the **only** dependency: `options.isSoundEnabled` is false
and the game synthesises its own audio with the Web Audio API, so no audio
library is loaded. Gameplay visuals are code-drawn primitives; the title uses
one generated pixel-logo asset. There are no sound assets.

Files: `index.html`, `main.js`, probes and harnesses in `tools/`.

## Input and Arcade-Cycle Ownership

**Keyboard-primary, no replay, scripted-bot attract.**

| Action | Keys |
|---|---|
| Move (8-way) | Arrows / WASD |
| PUSH | Space / Z / X / J / K |
| Confirm (ceremony and table) | Space / Enter / Z / X / J / K |
| Entry: move cursor | Arrows / WASD |
| Entry: choose character / DEL / END | Space / Enter / Z / X / J / K |

`input.isJustPressed` is deliberately **not** used for PUSH: in the 1.5.0 bundle
it is the OR of the pointer and every keyboard key, so it fires on every movement
press. Named keys are read through `keyboard.code[...]`, whose map is
pre-populated for all codes at init.

One consequence is accepted rather than fixed: attract starts a game on
`input.isJustPressed`, so a pointer click begins a run that a pointer cannot
then play, because PUSH and movement are keyboard-only. The cabinet is
keyboard-primary and stays that way; this is not a defect to repair.

`title` and `description` are left undefined. The bundle then keeps
`isNoTitle = true`, skips `initTitle()` and boots straight into `initInGame()`,
so `update()` runs from frame 0 forever and this file owns the entire cycle:

```
attract(title <-> bot demo) -> ready -> play -> (chainout -> clear -> ready)
                                             | (R18 clear -> allclear
                                                -> qualifying: entry -> table -> attract
                                                -> sixth or lower: table -> attract)
                                             | (death -> play)
                                             | (death -> gameover
                                                -> qualifying: entry -> table -> attract
                                                -> sixth or lower: table -> attract)
```

`end()` is never called. Consequently `options.isShowingScore` is **off** and the
score / HI line is drawn by the game: the library only resets `score` and updates
`hiScore` inside `initInGame()`, which now happens once per page load, so its
display would be permanently stale. This avoids depending on the bundle's
undocumented `sc` score-mirror global.

Browser audio needs a user gesture, so the game's AudioContext is created on the
first input rather than at load; the attract cycle is silent by design in any
case. `CD.audioRuntime()` reports whether the context exists and is running, so
"the gate passed on a silent game" is a detectable state rather than an
assumption. See **Audio**.

## Screen Layout

`viewSize = { x: 160, y: 144 }`, theme `dark`.

```
y 0..8     score (left)   mine glyph + mines still to clear (centre)
           HI + top score (right)
y 9..15    Rn | FL + FIELD LOAD | xMULT | T+TIME | lives
           fixed two-row cabinet strip; TIME has a one-pixel gauge below it
           this strip is drawn only during gameplay phases; the title, entry
           and table screens own the whole field area
y 16       field border          field interior: x 4..156, y 18..138
```

The initials-entry screen instead divides the full 160 x 144 view horizontally.
Its upper half holds the current three-character name, run score, and a 10 x 4
cursor grid:

```
A B C D E F G H I J
K L M N O P Q R S T
U V W X Y Z 0 1 2 3
4 5 6 7 8 9 . - DEL END
```

The lower half continuously shows all five ranking rows, each with initials,
seven-digit score and a three-character progress tag (`Rnn`, `C18` or `---`).
Arrow movement wraps
at every edge of this grid; a cyan cell is the single cursor. Confirm on a
character appends it until the three-character limit, `DEL` removes exactly the
last entered character, and `END` completes entry. The help line explicitly
names arrow movement and Space selection. Grid centres run from x 13 through
x 148 in 15 px steps and from y 20 through y 53 in 11 px steps. The 14 x 10 px
cursor therefore clears the playfield frame at x 2 / 157 and y 16 even on the
top row and both outer columns.

Gate markers (blue) mark the 20 px spawn openings at the centre of each wall.
The fixed HUD register coordinates are: row baselines y 2 / 9, with the round
counter and `FL` label lowered to y 10; score x 3;
quota glyph/count x 56 / 64; `FL` label x 21 with load gauge x 31, width 38;
multiplier right edge x 87; TIME right edge x 116 with gauge x 91, width 25;
life icons right-aligned from x 152. At one through four lives the HUD draws one
3 px cyan square per life. At five through the 9-life cap it stops repeating
the glyph and draws the exact total as `■5` .. `■9`, using the square at x 144
and the small numeral at x 149; it never describes the fifth life as overflow
`+1`. These values are exposed with the palette through `CD.visualContract()`,
and `CD.lifeDisplay(n)` exposes the shared display rule for probes.

## Object List

| Object | Shape | Behaviour |
|---|---|---|
| Player | 7 px cyan interceptor + facing pip | 1.05 px/frame toward the held direction; facing = last movement vector |
| Inert mine | 6 px blue four-prong relay | Drifts at `drift`, reflects off walls, **harmless to the player** |
| Armed mine | 6 px rotating relay | Steady red = player-owned chain, steady purple = self-armed field. Stationary for its fuse, then 1.4 px/frame until it contacts anything |
| Blast | expanding ring, ordinarily r 3→16 over 12 frames | Arms and radially launches mines it touches; kills the player and scavengers; a CAPACITOR discharge instead reaches r 24 over 18 frames |
| Scavenger | 7/9/11 px purple open jaw + three appetite pips | 0.55 px/frame toward its claimed inert target in the densest available cluster; eats at most 3 inert mines; harmless to the player; killed by a blast it releases `2 x eaten` armed mines, so at most 6 |
| Lodestone | fixed four-pole anchor, broken 24 px field ring, blue core | Harmless and indestructible; gathers inert mines into a 7 px core and deflects armed mines in flight by up to 6 px each, without creating, consuming, arming or scoring anything |
| Capacitor | fixed opposed plates inside a broken 24 px diamond | Harmless and indestructible; draws armed mines in flight up to 6 px each toward its plates, swallows whole any ordinary blast that detonates inside the 24 px diamond, stores its cause for 60 frames, and emits one non-reabsorbable 24 px blast before shutting its intake for a further 60. While loading a **player-caused** charge it also gathers inert material from a transient 39 px boundary into the coming blast |

World positions are integer-snapped for drawing only; simulation coordinates
and collision radii remain continuous. The code-drawn silhouettes are:

- player: cyan directional interceptor, plus a separate cooldown/facing lamp;
- mine: four-prong relay, rotating between orthogonal and diagonal phases while
  armed;
- scavenger: open-jaw collector facing its current target, with jaw span
  increasing by stage.
- lodestone: diagonal four-pole anchor. Its broken ring is the exact pull
  radius, up to four inward spokes connect it to affected mines, and its blue
  core grows from 2 to 6 px as the active count rises from zero to six. The ring
  is neutral grey while the field is only gathering inert material and takes the
  hazard colour of any live chain link it is bending.
- capacitor: two opposed plates with four charge cells. The broken diamond is a
  single shape carrying all three of its rules at one radius — the intake that
  swallows a detonation, the field that draws live ordnance into that intake, and
  the footprint the discharge will fill. Three states: **open** (neutral outline,
  empty cells; the outline takes the hazard colour of any live link it is
  currently bending, exactly as a lodestone ring does), **charging** (hazard
  outline and plates, cells filling toward release, blinking in the last 18
  frames, plus a second larger neutral-grey broken diamond at the 39 px gather
  boundary for as long as the load lasts) and **recovering** (neutral outline,
  cells draining in the actor's own structure blue, intake shut). Both diamonds
  come from one `vertexOf()` helper, so the two boundaries can never drift into
  different shapes. The gather diamond is deliberately **not** hazard-coloured:
  the threat footprint is the inner diamond, and a red boundary at 39 px would
  overstate the lethal area by more than half its radius. At the four corner
  anchors the gather diamond extends past the field frame; that excursion is
  exactly the strip the walls keep empty, so the drawn boundary stays true
  everywhere a mine can actually be.

Player-authored blasts are yellow; overload-authored blasts are purple. At
multiplier 8, 16 and 32 the field frame flashes for 2 frames. Every
player-authored detonation also drives a capped 3–14 frame yellow frame pulse;
at multiplier 8 and above the blast adds a sparse cross trace. These are
presentation state only and never change collision geometry or simulation time.
READY and ROUND CLEAR retain the frozen world state but do not draw it behind
their central text; PLAY restores the field unchanged. This keeps ceremony
instructions legible without introducing a modern panel or changing simulation.

Persistent chromatic roles use base palette colours only: cyan player/control,
blue inert material and structure, red player-authored danger, purple
field-authored danger, and yellow reward/chain energy. `light_black` is the
neutral grey exception required to remain visible on the dark theme.
`light_yellow` appears only in the two-frame chain milestone accent. Armed-mine
urgency is carried by rotation and the blinking full-size danger footprint,
not by alternating light colour variants. The lodestone ring is the one shape
that changes role colour: neutral grey as a footprint, red or purple while it is
bending a live link — the same danger-ownership distinction those two colours
carry everywhere else. The capacitor diamond follows the same rule for the same
reason — neutral as a footprint, red or purple while it is bending or holding a
live link — and adds one further use of structure blue for the cells draining
through its recovery. Its opposed plates and diamond, rather than a new colour,
make it distinct from both the lodestone and neutral UI.

Player-facing `PUSH` (implemented internally by the existing shove path): arms
the nearest inert mine in either of two overlapping facing
regions: the original broad cone within 8 px and ±50°, or a narrow forward lobe
within 11 px and ±25°. The forward lobe adds about three movement frames to a
straight approach without making diagonal targets easier to acquire. Cooldown
12 frames, **charged on a whiff too**.

Inside 4 px the angle filter is skipped. Inert mines are non-solid, so a player
walking into one steps past its centre in a single frame, which flips the
measured angle by 180° and silently locks them out of shoving a mine they are
standing on. At point-blank, facing alone decides the launch direction.

### PUSH affordance (discoverability)

The verb was not discoverable: pressing SPACE with nothing in range produced only
a quiet click, so a new player could not tell whether the button worked. Three
readouts fix it, all driven by `findShoveTarget()` — the *same* function the
button calls, so the marker can never disagree with the action:

- a yellow ring around the mine PUSH would arm right now;
- a dashed line from that mine showing the direction it would fly;
- the player's facing pip goes dim while the cooldown is running.

The ring turns grey (not yellow) during the cooldown, so "aimed but not ready"
and "ready" are distinct states. Probe-covered: targets at the edge of the broad
cone and forward lobe are found, a target outside the forward lobe's distance
or angle is not, the same mine behind is not, and SPACE arms exactly the marked
mine.

### Scavenger lifecycle

Fixed and measured 2026-07-28. Appetite, visual size and release geometry are
separate rules:

- `eaten` is capped at `SCAV_EAT_CAP = 3`; `stage` still saturates at 3 and
  selects the 7/9/11 px size only. Three pips below the jaw persistently show
  swallowed (purple) versus remaining (grey) capacity.
- A live inert mine can be claimed by only one scavenger. Claims persist across
  the 30-frame retarget interval and are discarded when the mine is eaten,
  armed or removed. Two scavengers therefore select two distinct live targets
  whenever at least two are available. With no available target, each patrols a
  distinct anchor on a 22 px ring around field centre instead of converging on
  one point or parking future payloads safely at an arbitrary edge.
- Death releases `n = 2 * eaten` mines with fuses
  `CHAIN_FUSE + j`, `j = 0..n-1`, preserving the original `src`. Every released
  mine is immediately entered in the killing blast's `hit` set, so later steps
  of that blast cannot overwrite the stagger or launch angle.
- Release radius is
  `max(5, MINE_R / sin(PI / n) + 0.5)` px. The extra 0.5 px keeps adjacent
  payload centres strictly outside the 5.0 px mine-contact threshold as the
  payload grows. Scavenger centres are clamped far enough inside the field for
  the maximum six-mine ring.

The appetite cap was selected by four-way organic-play measurement, not by
taste. The attract policy repeated R4/R6/R8 for 60 s per condition:

| cap | R4/R6/R8 score | total releases | payload | zero-travel detonations |
|---:|---:|---:|---:|---:|
| 3 | 41,200 / 81,000 / 105,850 | 36 | 124 | 0 / 122 |
| 4 | 69,750 / 82,400 / 112,700 | 34 | 214 | 0 / 204 |
| 6 | 98,800 / 124,400 / 134,350 | 35 | 232 | 0 / 232 |
| 8 | 104,950 / 136,550 / 174,500 | 33 | 246 | 0 / 233 |

All candidates suppressed OVERLOAD completely under the skilled bot, so that
coupling did not distinguish them. Cap 3 was retained because it is the
smallest value that fixes the two-meal defect and it produced the lowest score
inflation and smallest bounded payload. More importantly, independent pacing
runs put the first 40,000-point extend at 77/80 s with cap 4 but 58/68/70 s
in zero-death cap-3 runs, preserving the pre-fix calibration of about 57 s
without moving the threshold.

Before target claims and the widened ring, a separate 90 s organic measurement
on R4/R6/R8 observed 63 releases and 169 recorded detonations. Nineteen releases
had another scavenger within 10 px, but **0/169 detonations travelled 0.1 px or
less**. The forced co-location mechanism was real but not a frequent organic
failure, which is why the fix is limited to claims plus collision-safe release
spacing rather than a new repulsion system. `tools/scav-measure.mjs` preserves
this measurement path, and `CD.scavReleases()` exposes release distances.

### Lodestone field

Added 2026-07-28. A lodestone is fixed at a round-table anchor and is harmless
to the player. It is not affected by mines or blasts and has no bounty. It
therefore never originates a scoring event and carries no `src`; every
detonation still derives causality exclusively from the armed mine that caused
it.

At each active simulation step, every mine chooses its nearest lodestone within
`LODE_RADIUS = 24` px (`nearestLodestone()`, shared by the simulation and the
glyph so a drawn spoke can never claim a pull that is not happening). What
happens next depends on the mine's state.

**Inert mines — gathering.** The selected lodestone increments its visible
`active` count, the mine's existing velocity is multiplied by
`LODE_DRAG = 0.94`, and, while outside the `LODE_CORE_RADIUS = 7` px core, its
position receives an additional inward displacement of
`min(LODE_PULL, distance - LODE_CORE_RADIUS)` where `LODE_PULL = 0.18`
px/frame. A lodestone therefore rearranges the same inert count into a dense
local target; it does not perturb FIELD LOAD or OVERLOAD accounting.

**Armed mines in flight — deflection** (added 2026-07-28, second pass). A mine
whose fuse has ended receives an inward displacement of
`min(LODE_PULL_ARMED, remaining budget, distance - LODE_CORE_RADIUS)` where
`LODE_PULL_ARMED = 0.25` px/frame, drawn from a per-mine budget of
`LODE_ARMED_BUDGET = 6` px issued by `armMine()` at every launch. So a chain
crossing a field does not land where it was aimed.

- **No drag is applied to armed mines.** Damping a 1.4 px/frame link would leave
  it hanging in the field instead of detonating on the next thing it touches.
- **The budget is what makes capture impossible.** Once it is spent the mine is
  ballistic again, so no field can hold a link in orbit at any radius. Probed at
  four impact parameters (8/12/16/20 px off-centre): every link leaves and
  detonates.
- **A mine still on its fuse is not deflected.** That stationary tell is what
  the player reads to plan an escape.
- Deflection never arms, scores or removes anything, so the mine's own `src`
  still owns the chain and the causality rule is untouched. 6 px is one
  mine-contact threshold (5 px) and a third of a blast radius (16 px).

**Why the actor deflects at all.** As shipped in the first pass it was the only
actor in the game with no imposed cost: ignore it and nothing is taken from you
and nothing is fired at you, which is the mirror image of the rejected DAMPER
concept and breaks the design doc's rule that every pressure is a trade.
Deflection puts the cost back: near a field, trajectories —
yours and the field's own overload ordnance — stop being computable from the
launch angle alone.

**Why the anchor moves between rounds.** The first pass put every lodestone
round's field on one fixed point, so the same 9.9 % of the playfield was the
only interesting ground for the whole game, and the deflection cost above could
be opted out of by geography — stay out of that quadrant and no trajectory is
ever bent. It also flattened the exact thing the actor was added for: every
lodestone round in the then-current eight-round table shared one spatial
structure. See the Round Table for the current per-round anchors and
second-cycle rotation.

The readout is part of the actor rather than a new HUD register: a persistent
broken ring shows the exact capture footprint, up to four grey spokes show which
nearby mines are currently being pulled, and the blue centre grows with the
active count (saturating visually at `LODE_DENSE_COUNT = 6`). **While the field
is bending a live link the ring itself takes that link's hazard colour** — red
for a player-owned chain, purple for overload ordnance — and returns to neutral
grey the moment the budget is spent. The readout is the footprint rather than a
per-mine spoke because the inside of the ring is already full of glyphs: a
radial spoke shrinks to nothing exactly when the link is deepest in the field.
READY names `LODESTONE CLUSTERS MINES` whenever the round contains one.

During `chainout` the rule runs with `moveInert = false`: gathered material
stays exactly where it was, but the committed chain is still deflected, because
CHAIN OUT protects the player without changing the physics. The `active` count
is still recomputed there, so the visible core keeps agreeing with what is left
on the field while the chain eats it. `CD.addLodestone`, `CD.clearLodestones`,
`CD.lodestoneList` and `CD.pullLodestonesOnce(moveInert)` expose the rule for
deterministic probes, and `CD.mineList()[i].lodeBudget` exposes the remaining
budget.

**Historical measured effect before the nine-round recut** (bot, forced round,
45 s, sampling every armed mine in flight), measured after the per-round
anchors landed:

| round | anchor | samples | had been deflected | mean displacement |
|---|---|---:|---:|---:|
| R2 | 30, 44 | 446 | 13 % | 2.74 px |
| R3 | 130, 112 | 668 | 18 % | 3.26 px |
| R5 | 130, 44 | 437 | 27 % | 2.07 px |
| R6 | 30, 112 | 882 | 14 % | 3.06 px |
| R8 | 80, 44 | 979 | 45 % | 2.99 px |

Those row numbers name the former eight-round table and are retained as the
pre-recut baseline, not claimed as measurements of the current mixes. The rate
was a property of the anchor/round rather than a constant: the top-gate field
bent nearly half of all chain links, while the two corner anchors saw roughly a
third of that traffic. The displacement when it applied was stable at 2–3.3 px.
Under the single shared anchor of the first deflection pass the same measurement
read a flat 23–30 % across the former five lodestone rounds.

Fairness was checked the way the shover-safety rule was, with the naive policy
over 240 s per cell, comparing the round against itself with the lodestones
removed. The deflection does not make the shove a coin flip:

| | deaths | own-blast | within 20 f of own shove |
|---|---:|---:|---:|
| R2 with lodestone | 9 | 4 | 6 |
| R2 lodestone removed | 10 | 7 | 7 |
| R6 with lodestone | 23 | 13 | 19 |
| R6 lodestone removed | 26 | 12 | 19 |

### Lodestone field size: the first-pass evidence was retracted

The 24 px / one-field configuration was originally selected from single 30 s
focused R6 bot runs (78,850 / 67,050 / 54,500 against a 28,650 "no lodestone"
control). Repeating that recipe at n=4 per condition shows those numbers were
run-to-run noise and could not support the conclusion drawn from them:

| R6 condition, 30 s | scores | mean |
|---|---|---:|
| shipped (one 24 px field) | 57,900 / 61,950 / 62,800 / 24,300 | 51,738 (sd 15,949) |
| no lodestone control | 47,350 / 53,150 / 45,200 / 78,500 | 56,050 (sd 13,284) |

The control mean is *higher* than the shipped mean, and the original control
value sits below the minimum of four fresh control runs. This is the failure
AGENTS.md warns about under "Measure, don't guess": the score distribution has a
long tail and a single run proves nothing. **The 24 px radius and the one-field
first cycle are therefore currently unjustified numbers, not measured ones** — see
Known Gaps. Score is the wrong instrument for this actor; the tables above use
the effect the rule is supposed to have instead.

### Capacitor relay

Added 2026-07-30. Revised 2026-07-30, second pass; see **Why the actor pulls,
and why the intake is a drawn boundary** below for what the first pass got
wrong. A capacitor is fixed at a round-table anchor, harmless, indestructible,
and worth no bounty. It has no `src` of its own and never originates a scoring
event; every detonation still derives causality exclusively from the armed mine
that caused it.

**The intake.** `CAPACITOR_INTAKE_R = CAPACITOR_BLAST_R1 = 24` px. One radius
serves the intake, the ordnance pull and the discharge footprint, so the
persistent diamond states three rules at once. (The loading gather below adds a
second, larger, transient diamond — the only other boundary this actor draws.)
An ordinary blast **whose centre lies within
24 px of an open capacitor** is removed before it processes any collision on
that frame — it is swallowed whole rather than partially spent. A blast born
outside the diamond sweeps over the plates harmlessly however large its ring
grows: the intake takes what detonates in it, not what expands over it. The
capacitor then stores:

- `charge = CAPACITOR_DELAY = 60` frames;
- the incoming blast's `src` (`"player"` or `"overload"`);
- the incoming blast's presentation `power`.

**The pull** (`pullCapacitors()`). At each active simulation step, every armed
mine whose fuse has ended and whose per-launch budget is unspent chooses its
nearest capacitor with an **open** intake within 24 px (`nearestCapacitor()`,
shared by the simulation and the glyph so a drawn pull can never claim one that
is not happening) and receives an inward displacement of
`min(CAPACITOR_PULL_ARMED, remaining budget, distance - CAPACITOR_R)` where
`CAPACITOR_PULL_ARMED = 0.25` px/frame, drawn from a budget of
`CAPACITOR_ARMED_BUDGET = 6` px issued by `armMine()` at every launch. The
budget makes capture impossible for the lodestone's reason: once it is spent the
mine is ballistic again. No drag is applied, for the same reason as there —
damping a 1.4 px/frame link would leave it hanging instead of detonating on the
next thing it touches. A mine still on its fuse is not pulled; that stationary
tell is what the player reads to plan an escape.

**The loading gather** (added 2026-07-30, third pass). While — and only while —
a capacitor is holding a **player-caused** charge, every inert mine within
`CAPACITOR_GATHER_R = 39` px chooses its nearest such capacitor
(`nearestLoadingCapacitor()`), has its velocity multiplied by
`CAPACITOR_GATHER_DRAG = 0.94`, and is displaced inward by
`min(CAPACITOR_GATHER_PULL, distance - CAPACITOR_CORE_R)` where
`CAPACITOR_GATHER_PULL = 0.25` px/frame and `CAPACITOR_CORE_R = 12` px. The
delay is therefore a visible loading of the shot rather than dead time.

None of those four is a free parameter — two are derived and two are inherited
from rules already in the game:

- **39 is not free.** Gathering inside the discharge footprint would be
  worthless — anything already within 24 px is armed by the discharge either way
  — so the reach has to exceed it or the rule changes nothing. It is set to
  `CAPACITOR_INTAKE_R + CAPACITOR_GATHER_PULL * CAPACITOR_DELAY`, exactly how far
  a mine can travel in the time available. The drawn outer diamond therefore
  states something exact: **everything inside it will be inside the blast when it
  fires**, rather than vaguely marking influence. Probed at the boundary: a mine
  seeded at 39 px arrives at 24.0 px on the discharge frame; a mine at 45 px is
  never touched.
- **0.25** is the rate the actor already uses on ordnance — one speed for one
  actor.
- **12** is half the discharge radius: far enough in that gathered material
  cannot drift back out of the footprint, far enough out that the knot does not
  cover the charge cells the player is reading.
- **0.94** is the lodestone's drag, for the lodestone's reason: damping ordinary
  drift is what makes material settle into a knot instead of sailing through.

**Gathering asks who caused it.** A field-caused charge stores, waits and
returns its wider blast exactly as before — the danger is never conditional —
but it gathers nothing. Gathering makes a discharge catch more, so it is a
reward mechanism and is bound by the causality invariant like every other one.
This was not foreseen; it was caught by the balance harness. See **The idle
regression the harness caught** below.

`isLoading(c)` — `charge > 0 && src === "player"` — is the single predicate both
the gather rule and the drawn outer diamond read, in the same way
`nearestCapacitor()` is shared by the ordnance pull and its glyph. The first cut
of the gate put the causality test only in the rule and left the boundary drawn
for any charge, which would have put a promise on screen that a field-caused
charge was never going to keep: the project's recurring defect class running in
reverse, a *drawn* rule with no simulation behind it. `CD.capacitorList()[i].loading`
and `CD.state().loadingCapacitors` expose it.

**Inert material is never touched outside that window.** Rearranging the field
as a standing property is the lodestone's job, and the two actors never share a
round: LODESTONE gathers always, CAPACITOR gathers only for the second it is
loading a shot the player authored. Gathering relocates material without
changing its count, so it does not perturb FIELD LOAD or OVERLOAD accounting,
and neither pull nor gather ever arms, scores or removes anything, so every
mine's own `src` still owns its chain.

Absorption changes no mine count, quota, score, or multiplier, and **it does not
touch the chain timer for either cause**. The 60-frame storage delay is spent
from the player's own 75-frame chain window, so a discharge returns with roughly
15 frames of streak remaining: the multiplier survives a relayed chain, but only
if the chain was still hot when it went in, and the player must keep detonating
elsewhere if they want any window left afterwards.

The charge decrements once per active `play` or attract-demo simulation frame.
At zero, the capacitor emits one blast from its own centre with radius
`3 → 24` over `CAPACITOR_BLAST_LIFE = 18` frames. The discharge preserves
`src`, arms mines by the ordinary blast rule, and is fully lethal to the player
and scavengers. It is not shover-safe: the one-second footprint is the warning,
and aiming a chain through the relay is a player choice rather than the button
press itself.

Every discharge carries `capacitorRelayed === true`. A relayed blast cannot be
absorbed by any capacitor, so even an injected or future multi-actor state
cannot relay one blast forever. A charged capacitor also cannot absorb another incoming blast;
that blast propagates normally.

**The recovery.** After a discharge the intake stays shut for
`CAPACITOR_COOLDOWN = 60` further frames, during which the capacitor neither
absorbs nor pulls. `intakeOpen(c)` — `charge <= 0 && cooldown <= 0` — is the one
predicate both rules read, so the three drawn states are exactly the three the
simulation uses. The cooldown is a lifecycle guard, not tuning: without it the
24 px intake and the inward pull together let the discharge's own chain fall
back in and re-charge the relay, which would be a standing scoring pulse that
keeps a multiplier alive with no player input — the thing the design forbids
outright. With it the bound is hard rather than statistical: **at most one
absorption and one discharge per 120 frames, whatever the chain does.**

These are lifecycle invariants, not tuning: each absorption creates at most one
delayed discharge and no capacitor event scores directly.

CAPACITOR and LODESTONE are mutually exclusive in every base round, and both
scale from zero without appearing in a round that did not author them. They no
longer share an anchor set; see **Capacitor anchors** below. R3 begins at
(72, 114) and R6 at (132, 58); adding the cycle index rotates R12 and R15 to
the next entries of the three-anchor set.

The **delayed producer** is frozen at safety boundaries:

- entering `chainout` grounds every stored charge and cooldown before the
  protected phase begins;
- during `chainout`, a committed blast passes through a capacitor without
  charging it;
- a miss grounds every stored charge and cooldown along with clearing armed
  mines and blasts.

Thus no delayed producer can wake up while the player is input-locked,
invulnerable, or recovering from a miss. **The pull is not frozen**, for the
reason the lodestone's deflection is not: CHAIN OUT protects the player without
changing the physics, so `pullCapacitors()` runs there too and a pulled link
simply detonates on the plates instead of being stored.

READY says `CAPACITOR EATS BLASTS + FIRES BACK`. The persistent broken diamond
shows the 24 px intake, pull field and discharge footprint before anything
happens; the four cells fill during the 60-frame delay and drain back through
the 60-frame recovery, and the outline uses red for a player source or purple
for an overload source, whether it is holding a charge or bending a live link.
`CD.addCapacitor`, `CD.clearCapacitors`, `CD.capacitorList` (now carrying
`cooldown`, `intakeOpen`, `pulling` and `gathering`), `CD.stepCapacitorsOnce`,
`CD.pullCapacitorsOnce(moveInert)`, `CD.stepBlastsOnce`,
`CD.mineList()[i].capBudget`, and the `chargedCapacitors` /
`coolingCapacitors` / `pullingCapacitors` / `gatheringCapacitors` counts in
`CD.state()` expose the full lifecycle for probes.

**Shover safety is not preserved through the relay, and that is accepted.** A
shover-safe first blast absorbed by the intake returns as an ordinary lethal
discharge 60 frames later; `newBlast()` does not propagate `shoverSafe` and the
discharge is not marked safe. Verified by probe. The justification the first
pass gave — the second-long drawn footprint is the warning, and the player
covers 63 px in that time against a 24 px radius — still holds, but it is
weaker than it was: widening the intake to the drawn 24 px diamond means an
ordinary shove near a capacitor can now trigger this conversion, where
previously it took deliberate aim. Reviewed and accepted by the project owner on
2026-07-30 rather than fixed, because "still leaving you" has no meaning a full
second after the shove, so preserving the flag would grant a safety the fairness
rule was never written to give.

### Why the actor pulls, and why the intake is a drawn boundary

As shipped in the first pass the capacitor was the only actor in the game with
no continuous presence at all. It acted solely when a blast happened to touch
it, its absorption test was an **undrawn** `blast radius + 5 px body` — roughly
a 21 px cross-section that only bit once the blast had already armed part of its
neighbourhood, so absorption removed the *tail* of a chain front rather than the
front — and a player-authored absorption then set the chain timer to
`DELAY + CHAIN_TIME`, making the relay a strict gift. Ignoring it cost nothing
and using it cost nothing. That is the same defect the lodestone shipped with
and was revised for (see **Why the actor deflects at all**), one step worse:
the lodestone at least gathered material every frame.

The second pass is three changes with one intent — make the diamond a place
where something is always true — and a third pass then fixed the defect those
three created between them:

1. the intake became the drawn 24 px diamond and now swallows a detonation
   whole, so the rule the player can see is the rule the simulation runs;
2. live ordnance inside the diamond is drawn toward the plates on the
   lodestone's budget model, so a chain fought near a capacitor is routed into
   the relay rather than merely at risk of touching it;
3. the chain-window gift was withdrawn, so routing a chain through the relay
   spends 60 of the player's 75 frames and is a trade like every other pressure.

The cooldown in the previous subsection exists only to keep (1) and (2) from
combining into a self-feeding relay.

**What the second pass got wrong.** Taken together those three made the relay a
cost with no matching benefit — the mirror of the defect they fixed, and equally
against the design's "every pressure is a trade" rule. Routing a chain through
the intake gave up the whole blast front, 60 of the 75 available streak frames,
and the choice of where the explosion happens, in exchange for one wider blast
into whatever had happened to drift under it. Nothing gathered material there,
so the delay was dead time. The expected player behaviour was avoidance, and an
actor a player only ever routes *around* is barely more interesting than one
they route around for free.

The third pass is the loading gather. It is what makes the delay pay: a 24 px
discharge already covers 2.25x an ordinary blast's area, and the gather is what
puts material into it.

**Measured effect** (attract bot, forced round, 60 s per cell, 3 repetitions,
same engine and same bot on both builds; the pre-change build was reconstructed
from the current source by reverting exactly these four behaviours). Score is
the wrong instrument for this actor — the distribution's long tail is documented
above — so the table reports what the rules are supposed to do:

| build | round | absorptions/min (3 reps) | armed samples | had been pulled | mean displacement |
|---|---|---|---:|---:|---:|
| before | R3 | 1 / 1 / 0 | 6,341 | 0 % | — |
| after | R3 | 4 / 2 / 3 | 5,947 | 4–6 % | 3.31 px |
| before | R6 | 2 / 5 / 2 | 8,125 | 0 % | — |
| after | R6 | 2 / 2 / 2 | 8,769 | 4–9 % | 3.18 px |

Read honestly: **absorption frequency did not move outside its own noise.** The
counts are single-digit events per minute and R3 rose while R6 did not; 15 after
against 11 before across six minutes is not a result. What did change is
categorical rather than statistical — the pull went from structurally zero to
4–9 % of live links displaced by about 3.2 px, matching the lodestone's
2–3.3 px band, and absorption now consumes a chain front instead of its tail.

**Does routing through pay? (third pass.)** The instrument is what the discharge
catches. Forty seeded fields at the round-table density of 16 inert mines, each
field identical between builds, capacitor charged at frame 0, counting mines
inside the 24 px footprint on the frame it fires. Fully deterministic — there are
no random draws in the gather path, so this is 40 distinct fields rather than 40
samples of one noisy quantity:

| build | mines caught by the discharge | min | max |
|---|---:|---:|---:|
| without the gather | 2.98 | 1 | 6 |
| with the gather | **5.22** | 2 | 10 |

A 1.75x increase in what a relayed blast catches, on top of the 2.25x footprint
area it already had over an ordinary blast. Routing a chain through the intake
now buys something specific for what it costs.

The same comparison in live bot play produced 0–3 discharges per 60 s cell and
is reported here only to be dismissed: **n that small cannot support a claim**,
which is the frequency gap below, not a result about the gather.

**The idle regression the harness caught.** The gather as first written applied
to any charge. An idling player authors no chain but the field's own collapses
do detonate inside capacitor diamonds, so the relay was concentrating material
into field-caused discharges on an idle player's behalf. Three balance runs read
idle/bot `0.30 / 0.07 / 0.04` against the `0.01–0.07` band the second pass had
measured, with `maxMult` correctly pinned at 1 — so the causality invariant was
never broken, but a new *unmultiplied* income stream had appeared for a player
doing nothing. Gathering is a reward mechanism and now asks who caused the
charge, per the standing rule that any new scoring or bonus mechanism must. Four
runs after the gate: idle/bot `0.06 / 0.10 / 0.10 / 0.05`, back inside the
historical band, idle losing all three lives every run. This is exactly the
failure mode "Measure, don't guess" exists for: the rule was correct, probed and
wrong, and only a policy comparison showed it.

**Known gap, substantially narrowed by the anchor move.** At the old anchors
absorption frequency was 0–4 per round-minute and the pull rate sat well below
the lodestone's; re-siting took the frequency to 2–7 per round-minute
(see **Capacitor anchors**) and the pull rate to 5.7–21.6 % in R3 and 8.7–13.3 %
in R6, overlapping the lodestone band at its lower end. What remains is
structural: a lodestone manufactures its own traffic by gathering inert material
at all times, while a capacitor gathers only after it has been fed, so it cannot
bootstrap its own encounters, and its intake is shut for up to 120 frames after
each absorption.

`CAPACITOR_PULL_ARMED` and `CAPACITOR_ARMED_BUDGET` remain unmeasured numbers;
`CAPACITOR_GATHER_R` is derived and should only change if
`CAPACITOR_GATHER_PULL` or `CAPACITOR_DELAY` changes — and if it grows, the
anchor set must be re-derived, because three anchors is already the most the
field holds at 78 px separation. Do not tune any of them without repeating the
tables above at n ≥ 3 per cell, and re-run `npm run balance` afterwards: the
idle regression above is what happens when a capacitor change is not
policy-tested.

## Shover Safety (fairness rule)

PUSH reach is 8 px in the broad cone and 11 px in its narrow forward lobe,
while a blast is 16 px, so **the push point is always inside the shover's own
blast**. Left alone, that makes the act of pushing a coin flip. Two flags fix it
without making the player safe in general:

- A mine armed by a player's push is flagged `shoverSafe` and **cannot touch the
  shover** until it has *left* them: separated by `MINE_R + PLAYER_R + 6` =
  11.5 px **and** moving away. It is fully lethal to every other mine, to
  scavengers, and to the player again once it has cleared them.
- "Moving away" is the sign of the closing speed along the mine→player axis,
  `dot(m.vel - player.vel, player.pos - m.pos) / d`, which `shoverSafeCleared()`
  requires to be negative. `player.vel` is the actual per-frame displacement
  recorded at the end of `stepPlayer()`, taken after the wall clamp so a player
  pinned against a border reads as stationary; it is zeroed during `chainout`,
  where the player is not stepped. A mine still on its fuse already carries the
  launch velocity `armMine()` gave it, so the ten stationary fuse frames read
  the same as the flight that follows them. Distance alone was the original
  reading and it is what bug #7's second form exploited.
- The **first blast** of a mine that never cleared its shover is likewise
  harmless to that player. Everything the blast arms is a normal, lethal chain
  link, so pushing into an adjacent pack is still fatal.
- While an ordinarily lethal fuse burns, a blinking ring the size of the blast
  is drawn around the mine: the circle the player has to leave. The just-shoved
  shover-safe mine omits that ring until it becomes lethal to the player. The
  ring is drawn from `shoverSafe` itself, so extending how long the flag holds
  extends the suppression with it and the readout cannot disagree with the rule:
  `shots/shover-safe-chase.png` is a mine chasing its shover with no ring,
  `shots/shover-safe-cleared.png` the same mine drawn with one once it has left.

`CD.mineList()[i].closing` reports that closing speed (positive = gaining on the
player, `null` for inert mines) and `CD.addArmed(x, y, angle, src, fuse,
shoverSafe)` takes the flag, so the transition can be probed deterministically
instead of raced for with timed key presses.

**Why it exists** (measured, not assumed). A "naive" measurement policy — walks
at the nearest mine, shoves whenever the marker is lit, never retreats — was run
for 120 s before and after:

| | deaths / 120 s | causes | within 20 f of own shove |
|---|---|---|---|
| before | 12 | own-blast 11, mine 1 | 8 (67 %) |
| after | 6 | own-blast 3, mine 3 | 3 (50 %) |

The attract bot could not measure this at all: it flees well enough to die zero
times in 150 s. Deliberately shoving into a pack 11 px away still kills 5/5 times
— that is the design, not a defect.

## The Causality Rule (added during implementation)

Every armed mine carries a source tag: `"player"` when the chain traces back to a
shove, `"overload"` when the field armed itself. A blast propagates its own tag
to everything it arms.

- `src === "player"` → scores `50 x mult`, raises `mult` (cap 32), refreshes the
  75-frame chain timer.
- otherwise → scores a flat `50`, does not touch the multiplier.

Both count toward the round quota. Scavenger bounties follow the same rule
(`200 x mult` vs flat `200`).

**Why it exists**: without it, measurement showed a fully idle player scoring
**49 %** of a competent bot — the overload cascade chained and multiplied on its
own, so standing still was a viable strategy. With the rule, idle scores 2 %.
This is the single most important rule in the game and it is probe-covered.

## Round Table

The personality of a round is the parameter *mix*, not the magnitude. A seeded
field of `floor(cap * 0.55)` inert mines exists at round start, because without
it the first shove of a round has nothing to chain into.

| R | Name | spawn (f) | drift | inert cap | scav | lode | capacitor | first anchor | quota |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|
| 1 | SHAKEDOWN | 48 | 0.18 | 16 | 0 | 0 | 0 | — | 20 |
| 2 | DRIFT LINE | 44 | 0.26 | 16 | 0 | 1 | 0 | 30, 44 | 24 |
| 3 | CHARGE LINE | 42 | 0.22 | 16 | 0 | 0 | 1 | 72, 114 | 26 |
| 4 | SWARM | 26 | 0.20 | 13 | 1 | 1 | 0 | 130, 112 | 30 |
| 5 | SCAVENGE | 46 | 0.22 | 18 | 2 | 0 | 0 | — | 30 |
| 6 | SURGE | 38 | 0.36 | 15 | 1 | 0 | 1 | 132, 58 | 36 |
| 7 | CRUSH | 24 | 0.28 | 10 | 2 | 1 | 0 | 30, 112 | 40 |
| 8 | HARVEST *(breather)* | 20 | 0.16 | 24 | 0 | 0 | 0 | — | 44 |
| 9 | STORM | 22 | 0.34 | 12 | 3 | 1 | 0 | 80, 44 | 48 |

The run is exactly 18 continuously numbered rounds. R1–R9 use the authored
table above; R10–R18 repeat its nine personalities with cycle scaling, so R10
is a stronger SHAKEDOWN and R18 a stronger STORM. CAPACITOR is introduced alone
in R3, returns with one scavenger in R6, and never shares a round with
LODESTONE. R8 and R17 are the breathers immediately before the R9 and R18
climaxes. R18 clear ends the run; there is no R19. Attract demos choose only
from the nine authored personalities, R1–R9; second-cycle pressure variants are
reserved for real runs.

Spatial layout is part of the mix, not a constant. `LODE_ANCHORS` holds five
separated anchors and `CAPACITOR_ANCHORS` three; `LODE_SLOT_BY_ROUND` and
`CAPACITOR_SLOT_BY_ROUND` give each personality its starting index. Both
selectors add the zero-based cycle index and actor index. The reachable second
cycle therefore rotates placement: R2's lodestone stands at (30, 44), while
R11's stands at (130, 44); R3's capacitor stands at (72, 114), while R12's
stands at (132, 58). Every reachable anchor is at least 30 px from the centre
spawn and every 24 px footprint falls entirely inside the frame.

### Capacitor anchors

Added 2026-07-30, with the loading gather. Capacitors shared `LODE_ANCHORS` for
as long as both fixed actors had a single 24 px footprint and 48 px of
separation was therefore enough. **The gather boundary broke that.** Two 39 px
diamonds need 78 px between them, and one loading capacitor next to an idle one
needs 63 px; the shared set contains 50 px and 68 px pairs. Those were reachable
in the former endless build's fourth cycle, where a screenshot showed three boundaries interpenetrating
into a tangle in which no mine can be attributed to a diamond by eye. It was a
readability defect rather than a behaviour one (`nearestLoadingCapacitor()`
resolves ties by proximity) but it is exactly the property the original anchor
separation rule was written to protect.

`CAPACITOR_ANCHORS = [(32, 42), (72, 114), (132, 58)]`, separations
82.4 / 101.3 / 82.1 — 4.1 px of margin over the required 78. **Three is the
most the field can hold at this separation**: a search over every 4 px candidate
position satisfying the frame and centre-spawn constraints finds no feasible
4-set, and no 3-set at 90 px. The full set remains three entries, although the
fixed R18 endpoint reaches only its first two cycle offsets and never spawns
multiple capacitors.

**The positions are measured, not chosen.** The pre-recut traffic table further
up is from the eight-round game and reports a different quantity (share of mines
that had *ever* been deflected). A fresh map was taken instead: the attract bot
in R3 and R6 with the capacitor removed, 120 s each, sampling every armed mine
in flight against a 4 px grid of candidate positions and counting the share
within 24 px. 9,444 samples. Traffic is far flatter than the old table implied —
7.6 % at the worst position to 14.6 % at the best, the busiest ground being
around (112, 66) rather than any corner. The chosen set maximises the *worst*
member subject to separation, so the second-cycle rotation cannot strand the actor on dead
ground:

| anchor | traffic share | previously |
|---|---:|---|
| (72, 114) — R3, the solo teaching round | 12.7 % | R3 stood at (130, 44), ~8.0 % |
| (32, 42) | 11.2 % | — |
| (132, 58) — R6 | 10.9 % | R6 stood at (30, 112), ~10.2 % |

**Measured effect, and the one result today that clears noise.** Same build,
same bot, 60 s per cell, 3 repetitions, old anchors against new with everything
else identical:

| | R3 absorptions/min | R6 absorptions/min | pooled |
|---|---|---|---:|
| old anchors | 1 / 0 / 4 | 1 / 2 / 3 | 11 events / 6 cell-min |
| new anchors | 5 / 7 / 6 | 5 / 2 / 4 | **29 events / 6 cell-min** |

Rate ratio **2.64**. Exposure is equal, so conditioning on the 40 total events
and testing the split gives a one-sided binomial `P(X >= 29 | p = 0.5) = 0.003`.
Every other capacitor measurement in this project has been reported with the
caveat that single-digit counts prove nothing; this one does not need it. R3
gained most (1.7 to 6.0 per minute) which is consistent with it receiving the
busiest of the three anchors.

The lesson generalises past this actor: **the capacitor's weak board presence
was substantially a placement problem, not a rule problem.** Two passes of rule
work moved absorption frequency not at all; moving the anchors moved it 2.6x.

Cycle scaling uses `C = floor((round - 1) / 9)`. Only `C = 0` and `C = 1`
are reachable before R18 clear; the same resolver is used by gameplay, attract
mode and probes. R13 is probe-verified as the scaled repeat of R4:

```
spawn    = max(22, round(base * 0.92^C))
drift    = min(0.60, base * 1.10^C)
cap      = max(8, base - C)
scav     = min(4, base + floor(C/2))
lode     = base == 0 ? 0 : min(3, base + floor(C/2))
capacitor = base == 0 ? 0 : min(3, base + floor(C/2))
quota    = round(base * 1.15^C)
```

Cycle scaling does not change score values. Across all 18 rounds, mines retain
the exact `50 x mult` / flat `50` awards and scavengers retain `200 x mult` /
flat `200`; the second cycle increases scoring opportunity through its larger
quota rather than introducing fractional point denominations.

**Overload**: while `inert > cap` — **strictly greater**, so sitting exactly at
the cap is safe indefinitely — a timer counts up; at 60 frames every inert mine
arms at once with staggered 6–34 frame fuses (a readable cascade, not one
unavoidable frame) and a descending siren.

The trigger is **crowding, not elapsed time**. Shoving mines lowers the count,
scavengers eating them lowers it, spawning raises it; a player who never shoves
reaches the cap fastest. Both halves of the rule are probe-covered (at the cap:
timer stays 0 after 1.6 s; one over: timer starts).

### Field-load gauge

Because the rule is invisible in the fiction, the HUD carries a **FIELD LOAD**
bar (`inert / cap`): blue → yellow past 75 % → blinking red when over the cap,
with a second bar underneath draining the 60-frame fuse, plus a blinking
`OVERLOAD` banner at the top of the field. The HUD identifies progress with the
single continuous `Rn` counter. The READY screen spells it out as `ROUND n`;
the round name is displayed separately below it. The remaining space is reserved for the
gauge; its fill spans `x = 31..69` with the `FL` label at `x = 21`, leaving a
visible gap after the round register. The attract how-to page states the rule explicitly
(`TOP GAUGE FULL = OVERLOAD`).

### Clear condition readout

A round ends when `quota` mines have been destroyed. That target was stated on
the READY screen and then vanished — during play nothing on screen said how many
were left, so the round appeared to end arbitrarily.

- READY screen: `BLOW UP n MINES` at full size, in yellow.
- During play: a **mine glyph plus the remaining count** in the top HUD row,
  between the score and HI. The glyph is the same shape the player sees drifting
  on the field, so the readout needs no wording in any language; it flashes
  yellow at 5 or fewer to sell the end of the round.

### CHAIN OUT

When the remaining count first reaches 0 during real play, the quota clamps at
0. If any live overload-authored threat remains, play first enters an
**OVERLOAD settlement interval without changing phase**:

- `phase` remains `play`; movement and PUSH remain enabled and the player gains
  no invulnerability;
- the round clock and projected time-bonus countdown continue;
- `stepSpawner()` is suppressed, `stepOverload()` is not called and
  `overloadTimer` is reset to 0, so no new material, scavenger respawn or second
  OVERLOAD can extend the interval;
- every already-committed overload-authored armed mine and blast continues
  through the ordinary simulation, including lodestone deflection, capacitor
  absorption/re-emission, scavenger destruction/release and ordinary collision
  damage;
- the interval remains live while any armed mine or blast has
  `src === "overload"`, or any capacitor holds a positive charge with that
  source. Inert mines and capacitor cooldown do not hold it open;
- `SURVIVE OVERLOAD` is drawn persistently at the top of the field. The quota
  readout remains at 0;
- a miss behaves normally: it costs a life and defuses every live threat. After
  the MISS ceremony, the next play frame can therefore enter `chainout`.

This makes the crowding punishment something the player must survive even when
it supplies the quota's final detonation. Suppressing only future production
keeps the interval finite without turning it into safe post-win scoring.

Once no overload-authored threat remains, the game enters `chainout` instead of
`clear`. The round clock freezes at that frame. For at most 300 frames:

- player position and facing are fixed, the player is invulnerable, and movement
  plus PUSH input is not read;
- the PUSH marker/aim line is absent and the player is drawn dim blue with its
  cooldown lamp off;
- spawning, inert drift, scavenger movement/eating/respawn, capacitor charging
  and OVERLOAD are not stepped; the overload timer is reset to 0;
- every overload-authored armed mine and blast is removed on entry as defensive
  cleanup for forced/debug entry; the natural play transition has already
  proved that none remain;
- every stored capacitor charge and cooldown is grounded on entry, and committed
  blasts pass through the frozen actors without being absorbed;
- lodestone deflection and capacitor pull *do* continue, because CHAIN OUT
  protects the player without changing the physics. Neither can arm, score or
  store anything, so a pulled link simply detonates on the plates. Both run with
  `moveInert = false`: gathered material stays exactly where it was while its
  count keeps being recomputed for the readout. Every capacitor charge is
  grounded on entry, so nothing should be loading there in any case — the
  parameter makes that an enforced invariant rather than an incidental one;
- player-authored armed mines and blasts continue normally. Their blasts may
  claim inert mines, destroy a stationary scavenger and release more
  player-authored ordnance; all such causal descendants continue scoring and
  advancing the multiplier;
- `CHAIN OUT` is drawn at the top of the field while the authored chain exists.

The phase finishes when both player-authored armed-mine count and
player-authored blast count reach 0, then enters the ordinary 210-frame clear
tally. A 300-frame fail-safe removes remaining armed mines/blasts before clear.
The fail-safe is observable as `chainOutTimedOut` through `CD.state()`.

Safety cannot be exploited for new score: the pre-cash-out settlement is still
ordinary vulnerable play but cannot spawn or arm a second field collapse;
`phase !== "play"` is the PUSH/input gate after `chainout` begins, and no
autonomous producer runs there. Only an object already carrying
`src === "player"`, or an inert/scavenger object reached by its blast, can
produce a scoring event during protected cash-out. Probe coverage asserts the
settlement's active controls, vulnerability, advancing clock, stopped
production, complete purple-source lifecycle and persistent screen; then input
lock, fixed position, invulnerability, defensive purple cleanup, capacitor
grounding/bypass, stopped round/overload state, exact continued chain score and
fail-safe termination.

## Score Economy

- In every round, detonation is `50 x mult` (player chain) or flat `50`, and a
  scavenger is `200 x mult` / `200`. Cycle scaling never changes these values.
  Capacitor absorption and discharge pay zero directly; only ordinary
  mines/scavengers reached by the preserved source can score.
- Round-clear bonus `200 x patternRound x (lives + 1)`, where
  `patternRound = ((round - 1) % 9) + 1`. The reward arc repeats at R10 instead
  of increasing tenfold merely because the public counter is continuous.
- Par-time bonus `max(0, quota * 1.2 - elapsedSec) * 50`, bottoming out at 0 —
  never a timeout miss.
- During every active-round screen except the clear tally, the second HUD row
  shows compact `T+value` and a 25 px yellow gauge. `value` is
  the exact integer award if the quota were completed on that frame:
  `floor(max(0, quota * 1.2 - roundFrames / 60) * 50)`. The full gauge is
  `floor(quota * 1.2 * 50)`. At 20% or less, label and fill blink every 6
  frames without using the red danger colour. At 0, the grey label and empty
  gauge remain visible. Because `roundFrames` is frozen during `chainout`,
  death and game over, the projected value freezes too; the clear screen
  replaces it with the actual TIME BONUS tally register.
- The 210-frame ROUND CLEAR ceremony credits these exact totals in two visible
  registers instead of adding them on entry: the complete clear cadence gets
  58 frames, the round bonus begins at `phaseTimer = 152` and counts for at
  most 45 frames, then the time bonus begins at `phaseTimer = 97` and counts
  for at most 45 frames. Any remainder is credited before the next round
  initializes. Crossing an extend threshold during either register grants the
  extend at that count.
- R18 takes the same settlement, CHAIN OUT and 210-frame ROUND CLEAR path as
  every other round. When that tally finishes it enters a 180-frame `allclear`
  phase instead of creating R19. `ALL CLEAR` holds for 30 frames, then
  `LIFE BONUS = lives x 1000` counts up in at most 45 frames, followed by the
  final score. The bonus is capped implicitly by the 9-life cap (9,000 maximum)
  and deliberately does not grant an extend because the run has ended. The
  dedicated 28-frame ALL CLEAR fanfare finishes before the life-bonus tally
  begins.
- **Extend at 40,000, then every 120,000.** Measured, not guessed: the pre-fix
  240 s run crossed at 57/175 s. With the fixed cap of 3, an independent short
  zero-death run crossed 40,000 at 68 s. The final 240 s run crossed at
  86/179 s while taking two deaths; an earlier zero-death full run crossed at
  70/168 s. The score-curve calibration therefore remains in the same observed
  band, while actual extend timing now exposes the intended release danger.
- Initials entry (3 chars, 30 s / 1,800-frame timeout) runs only when the score qualifies for
  the displayed top five. A score below fifth place skips entry and goes from
  GAME OVER or ALL CLEAR directly to the table. Ranking is score-first; exact
  score ties sort by clear status, furthest reached round, then newest record.
  Throughout entry, the lower five-row ranking
  provisionally includes the current run score at its resulting rank and uses
  the live padded initials (`---` before input); this preview does not write
  storage and its actual row is yellow while every other row is cyan. The
  cursor starts on `A`. Confirming a character appends it, `DEL`
  removes one trailing character, and `END` finishes;
  confirming more characters after the third has no effect. END or timeout pads
  an incomplete name on the right with `-`. Every row ends in `R01`–`R18` for
  an unfinished run, `C18` for a clear, or `---` when a record (including a
  factory default) has no trustworthy progress metadata. Reached round means
  the highest READY screen entered, so a death during R16 records `R16`.
  Storage V2 rows are
  `{name, score, reachedRound, cleared, recordedAt}`. The V2 transition starts
  a fresh ranking: V1 storage is neither read nor migrated because its rows
  cannot supply trustworthy progress metadata.
  Storage holds **real entries only**;
  the factory table is merged at read time so it can never be written back and
  re-merged into duplicates.

Factory table: `CDL 35000 / ARC 24000 / MNE 17000 / FSE 12000 / TND 8000` —
5th place is reachable in about two rounds, 1st sits just below the first extend.

## Audio

Every sound in the game is synthesised at runtime by `main.js` through the Web
Audio API. `options.isSoundEnabled` is **false** and no audio library is loaded,
so crisp-game-lib never initialises algo-chip or sounds-some-sounds and never
plays anything of its own: there is exactly one sound path, and it is ours.
This is **era-inspired, not hardware-faithful** — no specific chip is emulated.

### Board profile (frozen)

| Field | Value |
|---|---|
| profile id | `chain-drift-psg-4v` |
| fidelity | `era-inspired` |
| voices | `p1`, `p2` (pulse), `bass` (triangle), `noise` — four, each **monophonic** |
| primitives | `p12`, `p25`, `p50` (band-limited pulses, 32 partials), `tri`, `noise` |
| noise source | one 1-second buffer from a fixed LCG (`seed 22695477`), looped, lowpassed at `midiToFreq(pitch) * 6` clamped to 180–14000 Hz |
| envelope | linear AD: 4 ms attack, decay to 0.55 peak at 60 % of the note, 12 ms release |
| update granularity | one frame (60 Hz); every note start is frame-quantised |
| master chain | sum → gain **0.22** → highpass 30 Hz (DC block) → `tanh(2.2x)` soft clip → destination, **mono** |
| clamps | note gain ≤ 0.6, note length ≤ 60 f, BGM gain ≤ 0.22 |
| same-tick policy | `drop` — a voice starts at most one note per frame; later requests for it are discarded, never retriggered |
| audibility margin | 1.25× — how far a sound must clear the cue it shares a screen with, on rendered peaks |
| budgets | SFX last step ≤ 36 f (0.6 s), jingle last step ≤ 96 f (1.6 s), ≤ 24 steps/program, BGM loop ≤ 240 f (4 s) with zero tail |

`p1` is reserved for the player: control feedback and cabinet rewards only. No
BGM arrangement ever takes it, so a shove never competes with the music for a
voice.

The context is created on the **first input**, not at load — a context built
before a gesture is born suspended. The attract cycle is silent by design, so
nothing is lost by waiting.

### Event boundary

```
game code -> audioEmit(event) -> AUDIO_KIT program -> per-frame arbitration
          -> synthNote() -> Web Audio
```

Gameplay code names events, never waveforms; the audio section of `main.js` is
the only place that touches an AudioContext, and `npm run audio` fails if a Web
Audio call appears outside it. `AUDIO_EVENTS` declares every event as `[role, heardUnder]`. The role is one of
`control`, `danger`, `consequence`, `cabinet`, `bgm`, `none`. `heardUnder` names
the cue the event can actually be playing over (`drift`, `entry`) or `null` when
it only ever sounds in silence — `chainout`, `tally` and the
ready/clear/all-clear/game-over jingles, all of which belong to screens the
music has already left. `jingle:extend`
is declared under `drift` because an extend can be paid mid-round as well as
during the tally.

That field is load-bearing, not commentary: the audibility gate groups events by
it and requires each one to clear the cue it shares a screen with, so a new sound
that forgets to declare it is a new sound nobody measured. An emission of an
undeclared name is recorded in `CD.audioUnknown()` rather than failing quietly.
Attract/demo emissions are discarded at the bus.

A program step is `{t, v, w, p, d, g, s}`: frame offset, voice, primitive, MIDI
pitch (for noise, its colour), length in frames, peak gain, slide in semitones
across the note. Two steps of one program never occupy one voice at once.

### Arbitration

Priorities: `control 100 > danger 90 > consequence 70 > cabinet 55 >
bgm bass 20 > bgm perc 12 > bgm mid 8`.

Notes due in a frame are sorted by priority (ties by emission order) and handed
the four voices in that order. A voice already sounding is **stolen** by an
equal or higher priority and never by a lower one; the stolen note is faded out
over 8 ms rather than mixed under. **A voice can start only one note per
frame** — three detonations in one frame are one note on the board and two
logged drops, because retriggering a channel 0 ms after itself is not a sound.
The music therefore thins out inside a chain instead of the chain thinning out.
Every accepted note log starts with its authored duration in `actualFrames`.
If a later note steals it, that duration is shortened and `endedBy` names the
stealing event; a phase boundary records `endedBy: "phase"`. A dropped note
has zero actual frames. Cross-frame truncation is therefore observable rather
than being mistaken for a successfully completed sound.

Per-frame repeat caps at the bus: `chain:detonate` 3, everything else 1.

A miss clears the pending note queue before emitting `miss`: the field is
defused, and the chain that is no longer on screen stops chattering with it.

### Programs (23)

| Event | Role | Kind | Voices | Sonic target |
|---|---|---|---|---|
| `shove` | control | sfx | p1 + noise | dry high-low snap, shorter than the arming fuse |
| `shove:whiff` | control | sfx | p1 | one dull logic click, no noise, no reward contour |
| `respawn` | control | sfx | p1 | three rising blips; opposite contour to the falling shove |
| `entry:move` | control | sfx | p1 | quiet cursor relay |
| `entry:confirm` | control | sfx | p1 | firm high relay closure |
| `entry:delete` | control | sfx | p1 | the same relay falling instead of closing |
| `miss` | danger | sfx | noise + bass + p2 | noisy low impact under a collapsing bass |
| `overload:warn` | danger | sfx | p2 + noise | single pre-alarm tick, transposed up per tick |
| `jingle:overload` | danger | jingle | bass + p2 | descending four-note alarm over a drone |
| `chain:detonate` | consequence | sfx | noise + p2 | noise burst over a falling pulse; transposed by the multiplier |
| `chain:expire` | consequence | sfx | p2 | two falling relay clicks |
| `scav:eat` | consequence | sfx | noise + p2 | low mechanical bite, above the BGM bass register |
| `scav:burst` | consequence | sfx | p2 + noise | bright rising rupture |
| `capacitor:absorb` | consequence | sfx | p2 + noise | long downward glide into a relay closure |
| `capacitor:release` | consequence | sfx | p2 + noise | the same glide inverted, then the bigger blast |
| `quota:low` | cabinet | sfx | bass | two rising blips at five mines left, clear of the triggering detonation |
| `chainout` | cabinet | sfx | bass + noise | immediate lock tone, then a latch clunk after the final detonation |
| `tally` | cabinet | sfx | p1 | bright counter tick, capped at one per frame |
| `jingle:ready` | cabinet | jingle | bass + p1 | compact rising board-awake phrase |
| `jingle:clear` | cabinet | jingle | bass + p1 | rising reward phrase, leaving room for the tally |
| `jingle:allclear` | cabinet | jingle | noise + bass + p1 + p2 | compact four-voice summit before the final tally |
| `jingle:extend` | cabinet | jingle | p1 + p2 | four-step extra-life fanfare |
| `jingle:gameover` | cabinet | jingle | noise + bass + p2 | sparse descending shutdown |

`chain:detonate` is transposed by `min(mult, 20) * 2` semitones, so a chain is
heard as a rising ladder — the multiplier made audible.

`overload:warn` fires at `overloadTimer` ∈ **{6, 22, 34, 44, 52, 58}** of the
60-frame fuse (gaps 16, 12, 10, 8, 6) transposed `index * 2` semitones up: the
fuse drawn under the FIELD LOAD bar, heard accelerating. The alarm is never the
first warning.

`quota:low` fires once per round, on the way down, when `quotaLeft` first
reaches `QUOTA_LOW = 5` — the same threshold at which the HUD glyph starts to
flash. Its bass voice is not used by the simultaneous `chain:detonate`, so both
notes survive the normal triggering path. Zero is not announced: CHAIN OUT and
the clear jingle own it. CHAIN OUT similarly holds bass immediately but delays
its noise latch to frame 9, after the quota-closing detonation burst ends.

Declared silences, each a real moment left unvoiced: `mine:spawn` (continuous
drift-in, the field shows it), `mine:arm:overload` (the alarm covers the whole
wave), `lodestone:capture` and `capacitor:gather` (continuous, and both are
drawn), `mult:milestone` (carried by the detonation pitch ladder),
`player:move`.

### BGM

Mode: **layered-adaptive**. Two cues, `drift` (the field) and `entry` (the
initials screen), each a 16-step loop and each driven by one clamped axis that
is already drawn on the screen it plays under. Arrangements are keyed
`cue:section`; a change of cue only ever happens across a phase change, so the
running cue always stops first and the next starts at step 0 of its own hook.

#### `drift` — the field

The axis is `fieldLoad() = clamp(inertCount() / cap, 0, 1)` — the number the
FIELD LOAD bar draws. `drawHud()` and the BGM scheduler call the same function,
so the bar and the arrangement cannot disagree; the music is a second readout of
the crowd filling up. The bass hook is a descending cell that answers
itself, `E D C A / E D C G` (MIDI `40 38 36 33 / 40 38 36 31`) on even steps, so
the loop is sixteen steps long rather than eight repeated twice. `mid` is a
sparse four-note answering figure (`64 67 64 71` on steps 3, 7, 11, 15), mostly
rest. `perc` is a noise tick at pitch 58 (48/52 as ghost notes in the busier
patterns).

| Section | Selected when | Step frames | Loop | Layers | Transpose |
|---|---|---:|---:|---|---:|
| `drift:idle` | load < 0.5 | 14 | 3.73 s | bass | 0 |
| `drift:build` | 0.5 ≤ load < 0.7 | 11 | 2.93 s | bass + offbeat perc | 0 |
| `drift:hot` | load ≥ 0.7 | 9 | 2.40 s | bass + perc + mid | 0 |
| `drift:danger` | `overloadTimer > 0` or any purple mine, blast or stored charge on the field | 7 | 1.87 s | bass + driving perc + mid | +5 |

Layer gains: bass 0.14, mid 0.09, perc 0.09, times a per-section gain (0.85 /
1 / 1 / 1.05) and clamped to 0.22.

**The thresholds are measured, not chosen.** Sampling the axis every ~120 ms
across 120 s of bot play gave 746 `play` samples running **0.28–0.93**, deciles
`0.39 0.44 0.50 0.54 0.56 0.56 0.61 0.69 0.75`, median 0.56. 0.5 and 0.7 are
its ~30th and ~80th percentiles. At the first cut (`build` 0.35) `idle` was
unreachable in organic play — a 90 s bot run spent 63.7 % of its time in
`build`, 4.6 % `hot`, 3.7 % `danger`, **0 % `idle`**, the rest silent in
ceremonies. A round is seeded at 0.55 of its cap, so play opens in `build`,
relaxes to `idle` as the field is cleared and tightens to `hot` as it crowds.

Occupancy after the re-cut, sampled the same way over 90 s: bot **47.6 %
`build`, 26.2 % `idle`, 0.7 % `hot`**, 25.5 % silent in ceremonies; the naive
policy, which never retreats and dies often, spent **32.6 % `idle`, 4.6 %
`build`** and 62 % silent — mostly in game-over, entry and attract. `hot` and
`danger` are single-digit percentages by design: they are what a field about to
arm itself sounds like, not a normal operating state. Their occupancy varies
run to run (the pre-re-cut sample reached 4.6 % / 3.7 %), which is the axis
doing its job — the music describes the round being played, not the clock.

#### `entry` — the initials screen

The axis is the initials clock, `entry.timer`, counted down in whole seconds by
the `TIME n` readout on the same screen. Its hook is the field cell **inverted**
— `A C D E / A C D G` (MIDI `33 36 38 40 / 33 36 38 43`) — the same four notes
and the same interval shape rising instead of falling, so the screen is
recognisably the same cabinet resolved upward. `entryMid` answers at steps 4, 12
and 15 (`69 72 76`) on `p2`, and the noise voice is the clock: one tick per loop
in `hold`, five in `hurry`.

| Section | Selected when | Step frames | Loop | Layers | Urgent |
|---|---|---:|---:|---|---|
| `entry:hold` | `entry.timer > 300` (5 s) | 13 | 3.47 s | bass + mid + one tick | no |
| `entry:hurry` | `entry.timer ≤ 300` | 9 | 2.40 s | bass + mid + driving tick | yes |

Layer gains: bass 0.14, mid 0.085, perc 0.09, times 0.85 / 0.95. `entryMid`
notes last `stepFrames - 1`, one frame short of their own step: the answer lands
on step 15 and a note that outlives its loop is a tail, not a phrase.

**Boundaries.** A tier change waits for the next **bar** (step % 8 == 0) so the
loop keeps its shape. An arrangement marked **urgent** — `drift:danger` and
`entry:hurry`, the two that announce a deadline — is allowed in and out at the
next **step**, because a warning that waits for a bar line is not a warning.
Neither ever cuts a step in half.

**Where the cues play.** `drift` in `play`, `entry` in `entry`, and nowhere
else: READY, CHAIN OUT, the clear tally, MISS, GAME OVER, the table and the
whole attract cycle have no music under them. A cue stops the frame its phase
ends: any still-sounding BGM-owned voice is faded over 8 ms and its diagnostic
record ends with `endedBy: "phase"`. Every round and every initials screen
therefore opens on step 0 of its hook without leaking a tail into the next
screen.

Measured rendered peaks (offline, through the real master chain): `drift:idle`
0.061, `drift:build` 0.084, `drift:hot` 0.084, `drift:danger` 0.096,
`entry:hold` 0.096, `entry:hurry` 0.107. Every event peaks at **≥ 1.25×** the
loudest arrangement **it can actually be heard against** — field sounds against
`drift` (lowest is `scav:eat` at 0.126), the three cursor sounds against `entry`
(lowest is `entry:move` at 0.149); a field sound and the initials music never
share a screen. No jingle may peak above the loudest gameplay SFX: `miss` is
0.231, while the loudest jingle is `jingle:allclear` at 0.227. The other
adjusted jingle peaks are overload 0.213, clear 0.208 and ready 0.192. Nothing
reaches 0.95, so the soft clip is a safety net, not a mix stage.

### Diagnostics

`CD.audioProfile()`, `CD.audioKit()` (kind, role, step count, last/end frame,
max gain, voices, waves, per-voice spans), `CD.audioEventRegistry()`,
`CD.audioPriorities()`, `CD.audioManifest()` (the generic audio-kit manifest,
derived from the same data, never maintained beside it; a declared silence appears
in it with priority 0, since it never asks for a voice), `CD.audioEvents()`,
`CD.audioNotes()` (every dispatched note with `played` = won its voice,
`sounded` = reached the hardware, `actualFrames` = duration survived and
`endedBy` = stealing event or phase boundary), `CD.audioUnknown()`, `CD.audioBgm()`,
`CD.audioBgmCue()`, `CD.audioRuntime()`, `CD.audioClear()`,
`CD.setAudioMuted()`, `CD.audioEmit()`, and `CD.audioRender(id)` /
`CD.audioRenderBgm(section)`, which render program and cue data offline through
the same device chain and return peak, RMS, onset and tail.

## Miss and Game Over

An armed mine or a blast touching a non-invulnerable player costs one life,
removes every armed mine and blast, grounds every capacitor, and resets the
multiplier. 3 lives, cap 9 (4 shown before a compact `+n` remainder).

Before that defuse, the collision handler copies the culprit into a render-only
death echo. A mine echo stores its centre, 2.5 px collision radius and source
tag; a blast echo stores its centre, exact collision-frame radius and source
tag. Both also store the player's collision position. The copy is not present
in `mines` or `blasts`, is never stepped, cannot collide, chain or score, and is
drawn only during `death` or `gameover`:

- a mine redraws its rotating source-coloured relay glyph inside a blinking
  yellow 7.5 px ring;
- a blast redraws its frozen source-coloured ring with a blinking yellow 3 px
  contact marker on the player-facing circumference.

`death` preserves the echo for its full 45-frame MISS ceremony and clears it
when the player respawns. `gameover` preserves it for its full 120-frame
ceremony. Its shutdown jingle starts when the timer reaches 98, after the
22-frame MISS impact has released, so none of its opening voices are
discarded. The echo clears on entry to initials. Attract-mode and forced debug
deaths do not fabricate an echo. MISS and GAME OVER are centred at y 28 rather
than over the collision site. `CD.state().deathEcho` exposes the type, centre,
player position, source and radius, or `null`, for probes.

Lives reach 0 → gameover → entry/table → attract. Clearing R18 instead finishes
the ordinary clear tally, pays the ALL CLEAR life bonus, then follows the same
entry/table path. Both outcomes record the run's score, reached round and clear
status before qualification is tested.

## Attract Mode (scripted bot, no replay)

`options.isReplayEnabled` is false, so the library never re-runs `update()` on a
title screen; the demo is a real autopilot. `botControl()` emits the same
`{mx, my, shove}` control record the keyboard produces, so the demo and a human
run through exactly one movement/shove code path.

Bot policy, in priority order:

1. **Flee** anything armed or exploding within 30 px (34 px for blasts, weighted
   double), with a bias toward the field centre so fleeing never corners it.
2. **Hoard** — hold fire until inert count reaches `max(4, ceil(cap * 0.6))`.
   This is also the strategy the demo exists to teach.
3. **Line up** on the far side of a target mine from the densest cluster, then
   shove it into the pack.

Attract cycles **title** (300 f: a 128×24 transparent raster logo centred at
native `(80, 31)`, hook line, high-score table, blinking PRESS SPACE) → **how to
play** (480 f: a looping diagram of walk-up → PUSH → flight → chain, with the
caption changing per step) → **demo** (1080 f or until the quota is met). The
logo is loaded through crisp-game-lib's external-character slot `a` from
`assets/sprites/chain-drift-logo.png`; its four opaque colours are the cabinet
blue, cyan, yellow and red, with no smoothing or runtime tint. Any input starts
a real game from any of the three.

The how-to page exists because playtest feedback was "I can't tell what the
controls are": static text did not make the verb discoverable, and the library's
own description screen is unavailable in this `isNoTitle` setup. The opening
round (`ROUND 1`) also carries a dim
`ARROWS MOVE   SPACE PUSH` line at the bottom.

`CD.setAutopilot(true)` reuses the same policy in the play phase for measurement
runs — it is a test hook, not a second gameplay path.

## Verification (all green)

| Gate | Command | Result |
|---|---|---|
| Runtime health | `npm run smoke` | PASS, 0 console errors (idle 5 s + input 12 s) |
| Spec conformance | `npm run probe` | All assertions pass, including continuous R9→R10 progression, scaled R13 values, R18→ALL CLEAR, exact 3,000-point three-life bonus, progress persistence and tie ordering; 0 errors |
| Audio contract | `npm run audio` | All assertions pass: frozen profile and budgets, event-registry completeness, per-voice non-overlap, source boundary, offline-rendered level and clipping checks, derived-manifest invariants (also passed directly by external `validate-audio-kit.mjs`: 23 programs, 6 cue arrangements, 35 events), demo/mute gating, repeat caps, cross-frame steal diagnostics, real GAME OVER / CLEAR / low-quota / CHAIN OUT collision paths, explicit BGM phase stops, all four field arrangements, boundary and determinism checks, 59.9 fps; 0 errors |
| Ceremony screens | `npm run ceremony` | 16 ceremony screenshots including ALL CLEAR before/after life tally and the clear-result entry preview; full cycle closed, 0 errors. The probe additionally covers R10 READY, R18 CLEAR, both ALL CLEAR states and progress-tagged ranking screens |
| Balance invariants | `npm run balance` (x3 after fixed endpoint) | idle/bot **0.06–0.11**, mash/bot **0.12–0.21**, idle `maxMult` 1 in all three; 0 errors |
| Pacing / endpoint | `npm run botrun -- http://localhost:8231/index.html 480` | Cleared all 18 rounds in 433 s; round mean 23.9 s (19.6–29.3), 556,103 final score, 6 lives after 2 deaths, 6,000 life bonus, 0 errors |
| Design-layer self-sufficiency | blind-restoration gate (isolated agent, design doc only) | weak-pass, then **pass** after repairs; see `docs/chain-drift-design.md` §13 |

`npm run serve` first (the harnesses drive `http://localhost:8231`).

Post-fixed-endpoint recheck (3 independent 90 s comparisons):

| run | idle | mash | bot | idle/bot | mash/bot |
|---|---:|---:|---:|---:|---:|
| 1 | 3,300 | 9,100 | 42,997 | 0.08 | 0.21 |
| 2 | 4,747 | 5,261 | 45,160 | 0.11 | 0.12 |
| 3 | 3,000 | 10,515 | 51,657 | 0.06 | 0.20 |

Idle and mash lost all three lives in every run; idle never exceeded multiplier
1. The bot had no deaths, reached R4–R5 and held four lives in all three. All
nine policy pages reported zero errors. Because the final life bonus is paid
only after R18, none of these 90-second policies received it; the comparison
isolates the unchanged in-round score economy.

The fixed-endpoint botrun cleared R1–R18 in 433 s including ceremonies. Its
rounds averaged 23.9 s with a 19.6–29.3 s range. R9 and R14 caused the only two
deaths; both were well after the previous shove (120 / 94 frames). Extends
arrived at 86 / 178 / 291 / 392 / 424 s. The R18 ROUND CLEAR tally ended at
550,103 with six lives, and ALL CLEAR added exactly 6,000 for a final 556,103.
The run reached initials with `lastRunCleared === true` and no browser errors.

### Historical pre-endpoint measurements

Final CAPACITOR-revision recheck (6 independent 90 s comparisons, taken after
the causality gate on gathering and the anchor move):

| run | idle | mash | bot | idle/bot | mash/bot |
|---|---:|---:|---:|---:|---:|
| 1 | 3,977 | 9,798 | 51,586 | 0.08 | 0.19 |
| 2 | 4,050 | 10,733 | 36,296 | 0.11 | 0.30 |
| 3 | 2,100 | 3,050 | 51,598 | 0.04 | 0.06 |
| 4 | 950 | 10,254 | 45,827 | 0.02 | 0.22 |
| 5 | 9,044 | 6,576 | 47,413 | 0.19 | 0.14 |
| 6 | 8,244 | 12,193 | 37,839 | 0.22 | 0.33 |

`maxMult` is **1 in all six idle runs**: the causality invariant holds and every
point an idling policy earns is flat-rate. The bot lost no lives in any run;
idle lost all three in four runs of six, mash in three of six.

**mash/bot reads 0.06–0.33, entirely inside the historically documented
0.05–0.34.** An earlier n=4 sample of this same build read 0.18–0.38 and was
written up here as "the band moved up, because a mashing player authors chains
and its absorptions now load". **That was a small-sample artifact and the
conclusion is retracted.** Six runs show the same tail the spec has recorded
twice before. The mechanism described was real; its effect was not
distinguishable from noise, and it should not have been reported as a finding at
n=4 in a project whose own guidance says a single run proves nothing.

idle/bot reads 0.02–0.22 against a pre-revision n=3 sample of 0.06–0.11. The two
high draws are the idle long tail `AGENTS.md` already documents as accepted
(~20 % of idle runs landing near 0.18); both were runs where the field's own
collapses cleared rounds for a stationary player, which is by design — the quota
counts field kills, and the pressure against idling is that it pays flat and
kills you, not that it stalls you.

The final 240 s botrun, taken after the anchor move, cleared all nine first-lap
rounds and R1 of lap 2: R1–R9 lengths were `21.6 / 23.1 / 19.2 / 18.1 / 25.4 /
31.9 / 19.3 / 21.6 / 23.5` seconds, a 203.7 s full lap. CAPACITOR's solo R3 came
in at 19.2 s — the fastest fixed-actor round in the lap and 3 s quicker than at
the old anchors — while its mixed R6 was 31.9 s, the longest round measured in
this project. That spread is the anchor move showing up in pacing: R3's busy
anchor feeds the relay often enough to help clear the quota, while R6 pairs a
relay on live ground with a scavenger and becomes the lap's hardest round. The
run ended at R2-L2 with score 195,499, 4 lives, one death (R8, 214 frames after
the player's last shove — unrelated to the shove, and R8 has no fixed actor)
and no errors; mean 22.6 s over ten clears and 814 pts/s. Extends landed at
94 / 198 s against a pre-revision 86 / 173 s.

Lap duration is flat across all three revision states (203.8 → 205.1 →
203.7 s) and mean round length has moved less than half a second, so the actor
work has not changed pacing at the lap level. **R6 at 31.9 s is the one number
worth watching** — it is a single observation, and the 18.1–31.9 s spread within
one run is wide enough that it may simply be the tail, but if R6 is genuinely
becoming a wall the fix is its anchor rather than its rules. The score rate has
drifted down across the same three states (1,124 → 931 → 814 pts/s) in the
direction the withdrawn chain window predicts; single 240 s runs of a long-tailed
distribution cannot carry that as a finding, and it is recorded as a trend to
re-measure, not a result.

Post-OVERLOAD-settlement recheck (3 independent 90 s comparisons):

| run | idle | mash | bot | idle/bot | mash/bot |
|---|---:|---:|---:|---:|---:|
| 1 | 5,300 | 1,550 | 33,684 | 0.16 | 0.05 |
| 2 | 2,100 | 2,603 | 56,227 | 0.04 | 0.05 |
| 3 | 750 | 14,493 | 41,414 | 0.02 | 0.35 |

Idle lost all 3 lives in every run and never exceeded multiplier 1. Mash lost
`3 / 3 / 2` lives; the skilled bot retained all three starting lives in the
first comparison and finished the other two with one death. All nine policy
pages reported zero errors. The single 0.35 mash/bot draw is one point above
the previously documented 0.34 tail and far below parity; at n=3 it is recorded
as distribution noise, not a balance shift. The intended structural change is
visible in the idle outcomes: meeting the quota during a field collapse no
longer erases the committed danger.

Post-CHAIN-OUT balance recheck (3 independent 90 s comparisons): idle/bot
`0.14 / 0.05 / 0.04`, mash/bot `0.07 / 0.11 / 0.06`. Idle and mash lost all
3 lives in every comparison; the bot had 0 deaths and ended with `3 / 4 / 4`
lives. The harness runs the three isolated policy pages concurrently, so each
still receives the full real-time 90 s window while one comparison costs 90 s
rather than 270 s of wall time.

Final post-scavenger-fix recheck (3 independent 90 s comparisons): idle/bot
`0.04 / 0.02 / 0.05`, mash/bot `0.22 / 0.07 / 0.11`. Idle and mash lost all
3 lives in every comparison; the bot had `0 / 0 / 1` deaths. The final 240 s
bot run took 2 deaths, cleared 10 rounds at a 23.1 s mean,
and scored 190,145. A separate 120 s zero-death run crossed the first extend at
68 s; `tools/botrun.mjs` now prints `CD.deaths()` telemetry for future pacing
comparisons.

Final post-LODESTONE recheck (one actor per first-lap LODESTONE round, 24 px
field; 3 independent 90 s comparisons): idle/bot
`0.02 / 0.06 / 0.00`, mash/bot `0.05 / 0.12 / 0.19`. Idle lost all 3 lives in
every comparison. Mash lost 3 / 2 / 1 lives and remained far below the skilled
policy; the bot had zero deaths in all three runs and reached R5 with 4 lives.
The final 90 s botrun cleared four rounds at a 21.6 s mean, crossed the first
extend at 83 s, and scored 51,485. The score rate was 571 pts/s versus the
post-scavenger 792 pts/s long-run reference; the shorter observation window
does not reach the late-lap inflation case.

Post-forward-lobe recheck (3 independent 90 s comparisons): idle/bot
`0.16 / 0.20 / 0.06`, mash/bot `0.23 / 0.11 / 0.03`. Mash lost all 3 lives in
every comparison; idle lost `2 / 2 / 3`; the bot had zero deaths in all three,
reached R5 every time and ended with `3 / 4 / 4` lives. The added acquisition
window therefore did not make blind SPACE repetition competitive with the
skilled policy. All nine policy pages reported zero errors.

### Anti-degenerate-play, 10 runs x 90 s per policy

| Policy | Score range | Rounds reached | Outcome |
|---|---|---|---|
| idle (no input) | 350 – 9,428 | 1 – 4 | game over (3 deaths) in **10/10** runs |
| mash (Space spam) | 750 – 11,733 | 1 – 4 | game over in **9/10** runs |
| bot | 30,129 – 59,080 | 5 | 0 – 1 deaths, never game over |

`idle/bot` across 10 runs: 0.02, 0.07, 0.05, 0.05, 0.01, 0.05, **0.19**, 0.01,
0.02, **0.18**. `mash/bot`: 0.33, 0.01, 0.01, 0.04, 0.13, 0.04, 0.15, 0.13,
0.12, 0.11.

**This gate must be run several times before it is trusted** — both policies have
a wide right tail and a single run can land on either end.

#### The idle tail is understood and accepted

Roughly one run in five, idle reaches ~0.18. Those are runs where overload
cascades happened to clear several rounds on their own. The causality rule flattens
the *detonation* score to 50 a mine, but overload detonations still count toward
the quota (they are genuinely destroyed mines), and the **round-clear and par-time
bonuses are paid regardless of who caused the destruction** — about 3,200 of the
8,210 in the worst observed idle run.

Left as is, deliberately. Idle reached game over in 10/10 runs, never leaves the
first four rounds, and tops out at a fifth of skilled play, so it is nowhere near
dominant. The tight fix — counting only player-caused detonations toward the
quota — would also stop an *active* player from making round progress during a
big cascade, which is a worse trade than the tail it removes.

### Bugs the gates caught

1. **Idle dominance** (balance harness) — fixed by the causality rule above.
2. **Duplicated factory scores** (ceremony walk) — defaults were being persisted
   with real entries and re-merged on read; storage now holds real entries only.
3. **Mid-loop mutation crash** (`TypeError: reading 't'` in `stepBlasts`) — a miss
   inside the blast loop empties `blasts` while the loop is still indexing it.
   Both `stepMines` and `stepBlasts` now bail out on `simActive === false`.
   Covered by a dedicated regression probe (6 forced multi-blast deaths).
4. **HUD overlapping the field border** and attract text clipped by the bottom
   border (screenshots only — value assertions passed).
5. **The core verb was invisible** (playtest feedback): PUSH had no on-screen
   affordance and a whiff was indistinguishable from a broken button. Fixed with
   the target ring, aim line, cooldown light and the attract how-to page.
6. **Walking into a mine made it unshovable** (found while reproducing #7): the
   player steps past the mine's centre, the ±50° filter flips, and SPACE silently
   does nothing. Fixed by dropping the angle filter inside 4 px. This was the
   deeper cause of "I can't tell what the controls are".
7. **Shoving killed the shover** (playtest feedback, reproduced frame by frame):
   the 10-frame fuse was a trap — the player walked onto their own stationary
   mine and died the frame it launched. Fixed by the shover-safety rules above;
   the reproduction went from a guaranteed death to 0/5.

   **Second form — fixed 2026-07-29** (found 2026-07-28 during the deflection
   work, not caused by it — the scenario runs in R1, which has no lodestone).
   `npm run repro-selfhit` reported 2/5 then 3/5 on the hold-through case, at
   `sinceShove = 28`. Traced frame by frame: the shove happens at point-blank
   with the direction still held, so the mine launches from *behind* the player,
   who is still walking the same way. Separation passes 11.5 px while the mine
   is stationary on its fuse, which cleared `shoverSafe` permanently; the mine
   then launched at 1.4 px/frame, overtook the 1.05 px/frame player from behind
   and killed them on contact. The flag protects a mine that is leaving, not a
   mine that left and came back.

   Fixed by the relative-velocity condition in "Shover Safety" above: the mine
   must be past 11.5 px **and** separating. The measured frame trace of the
   repro scenario, post-fix — the pair peaks at 11.9 px on the last fuse frame,
   the flag survives it because the mine is closing at
   `ARMED_SPEED - PLAYER_SPEED` = 0.35 px/frame, the mine passes *through* the
   player at 0 px, and the flag clears at 11.9 px once the mine is genuinely
   leaving. `repro-selfhit` hold-through went 2–3/5 → **0/5 on three
   consecutive runs**, and point-blank chain deaths stayed **5/5**: the "shove
   into an adjacent pack still kills you" property is carried by the blast rule
   and by the lethal links that blast arms, neither of which this touches.

   **How often the situation arises: never, under any automated policy.**
   Counting episodes of the defect state itself — a shover-safe mine past
   11.5 px and still closing — gives **0 episodes in 120 s of `naive`
   (119 shoves) and 0 in 120 s of the attract bot (35 shoves)**. The same
   detector fires on 2/5 hold-through repro shoves, matching the pre-fix death
   rate exactly, so the zero is a property of the policies and not a broken
   instrument: both retarget after shoving and neither holds a direction through
   a point-blank shove. Consequently the fix is **not** visible in aggregate
   death counts — `naive` deaths over 3 x 120 s were 18 after versus 16 before,
   which is noise — and the deterministic probe, not the death rate, is the
   instrument for this rule. This is also why the bug was found by playtest:
   holding the direction key through the shove is a human input pattern.

8. **The overload trigger was unreadable** (playtest feedback: "is it just a
   timer?"). The rule was only surfaced by a small red flash *after* the player
   was already over the cap, with neither the cap nor the current count shown.
   Fixed with the field-load gauge, the fuse bar and the how-to line.
9. **The clear condition was invisible during play** (playtest feedback). It was
   stated once on the READY screen and never again. Fixed with the mine-glyph
   remaining counter in the HUD.
10. **The principal jingles were louder than gameplay** (playtest feedback).
    READY, CLEAR, OVERLOAD and ALL CLEAR rendered at peaks 0.291–0.342 against
    the loudest gameplay SFX at 0.231 because their simultaneous voices added
    together. Their note gains were reduced together without changing melody,
    timing, voices or priority; they now peak at 0.192–0.227. The audio gate
    asserts that no jingle exceeds the loudest gameplay SFX.

Items 5, 6, 8 and 9 are all the same defect class: a rule that exists in the
simulation and is verified by probes, but is never rendered. Value assertions
cannot catch these — only playing the game or reading a screenshot can.

`tools/repro-selfhit.mjs` keeps #7 reproducible, and `CD.deaths()` records the
cause and the frames elapsed since the player's own shove for every death.

## Known Gaps

- **Half the audio has been listened to.** The 22-program kit and the `drift`
  cue were auditioned by the project owner on 2026-08-01 and approved. **The
  `entry` cue was written after that audition and has not been heard by anyone**
  — its two arrangements, the one-tick-per-loop clock in `hold` and the five-tick
  clock in `hurry`, are the most likely things in the audio to be wrong, and the
  tick density is the specific number to try first.
  Everything else in **Audio** is a contract assertion or a measurement of
  offline-rendered output: levels, clipping, onset, tail, per-frame voice counts,
  arrangement density. Those catch a program that is silent, buried, clipped or
  stealing the wrong voice. They cannot judge whether a hook is any good,
  whether `capacitor:absorb` and `capacitor:release` stay distinguishable in the
  heat of a chain, or whether the `idle` loop becomes irritating over the ~20 s a
  round takes.
- The extend thresholds are calibrated against the *bot*, which never plays badly.
  A human first run is between the idle and bot bounds; only playtesting can place
  it exactly.
- Score growth is quadratic in chain length (`50 * n(n+1)/2`). The fixed R18
  endpoint now bounds the former endless late-cycle inflation, but the complete
  second-cycle score distribution still needs human playtest evidence beyond
  the bot pacing run.
- **`LODE_RADIUS = 24` and the one-field first cycle are unjustified numbers.**
  The runs they were chosen from do not survive repetition (see "the first-pass
  evidence was retracted"). They have not been shown to be wrong either — they
  are simply unmeasured, and the actor works as specified at these values.
- **The gathered knot is rarely the best target on the field.** Measuring the
  inert count inside one blast radius of the anchor against the densest
  neighbourhood elsewhere: R2 hoarding 2.05 vs 2.48 (knot best in 21/97
  samples), R6 hoarding 0.79 vs 2.01 (5/77), R6 bot 0.46 vs 1.90 (0/113). The
  pull does concentrate material — 2–4x the density expected from the field
  area alone — but round populations are only 7–11 inert mines, so a 24 px well
  cannot assemble a knot that beats an ordinary random cluster. The design
  doc's "the gathered knot makes the best aim point and the safest staging point
  conflict directly" is therefore **not yet delivered by the gathering half of
  the actor**; what the deflection half adds is measured above. Fixing this is a
  tuning question (radius, pull, or the `cap` of lodestone rounds) that needs
  the knot-density instrument above, not a score comparison.
- `LODE_DENSE_COUNT = 6` sizes the core for a count organic play does not reach:
  the observed maximum was 5 with a hoarding player and 3 under the bot, so the
  top of the readout's range is currently dead.
- The anchor table retains entries that only the former endless scaling could
  use. The fixed R18 run never increases the authored one-field count; changing
  the endpoint or actor-count scaling must re-check anchor separation.
- No mobile/pointer control scheme: the game is keyboard-only by request.
