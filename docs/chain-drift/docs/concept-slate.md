# Retro Arcade Concept Slate (1978–1983 style)

Target: browser (crisp-game-lib), code-drawn shapes only, movement + 1 button,
single screen, numeric escalation only, arcade-grade volume (rounds / ceremony /
extend / initials entry / attract).

Axis-1 (reward conversion) slot pre-assignment, without replacement:

| Slot | Axis-1 value |
|---|---|
| 1 | territory-conversion |
| 2 | carry-and-bank |
| 3 | defense-survival |
| 4 | streak-multiplier-upkeep |
| 5 | instant-scoring |

---

## 1. TIDE MASON

1. **Title** — TIDE MASON
2. **Concept** — Between tides, wall off patches of tideflat with stone so the sea
   cannot take them back.
3. **Controls** — 8-way move; button = SET STONE at the player's current cell
   (18-frame placement lock during which the player cannot move).
4. **Core rules** — The playfield is a tidal flat grid. Water level cycles
   low → rising → high → falling. Placing stones forms walls; when a stone wall
   plus the shore encloses a region, the enclosed cells convert to permanent
   land and score. Un-enclosed stones are washed away by high tide. Being caught
   in water above ankle depth costs a life.
5. **Enemies/obstacles (3)** — (a) *Tide*: rises and falls on a fixed period,
   flooding cells outward from the seaward edge. (b) *Crab*: walks the wet zone
   and removes one un-enclosed stone on contact with it. (c) *Undertow*: a
   drifting current band that pushes the player one cell per second while
   overlapping them.
6. **Score** — Converted cell × distance-from-shore multiplier (1× near shore,
   up to 4× at the seaward edge). No points for placing stones, only for
   enclosing.
7. **Risk-for-reward** — Seaward cells pay up to 4× but flood first and are the
   farthest from safety.
8. **Escalation** — Tide period shortens; crab count and speed rise; undertow
   band widens.
9. **Fairness** — Water rises cell-by-cell with a 2-second audible/visual warning
   per cell; the player can always outrun it from any reachable cell at round
   speeds.
10. **Differentiators** — Territory is claimed by *building against a clock*, not
    by tracing a line; claimed territory is permanent while unclaimed work is
    erased wholesale by an environmental cycle.
11. **Lives** — 3 lives; a life is lost by being caught in deep water.
12. **Attract highlight** — A near-complete causeway with one gap left open as
    the tide floods in and washes the whole run of stones away.
13. **Audio** — Wet slate "clack" per stone with a rising surf-roar swell into a
    two-note flood alarm; conversion pays off in an ascending arpeggio.
14. **Signature** — territory-conversion / timing-window / place / environmental-cycle

## 2. COLD HAUL

1. **Title** — COLD HAUL
2. **Concept** — Cut ice from a thawing lake and haul it to the icehouse before
   it melts away in your arms.
3. **Controls** — 8-way move; button = context act (cut a block at the lake /
   deposit at the icehouse / dump the load anywhere else).
4. **Core rules** — The lake occupies the screen centre, the icehouse a fixed
   corner. Blocks are cut from the lake and carried; each carried block shrinks
   over time and its value with it. Carrying N blocks scales the player's speed
   by 1/(1+0.18N). Depositing banks the current summed value. A hit drops the
   whole load.
5. **Enemies/obstacles (3)** — (a) *Sun spot*: a slow wandering bright patch that
   triples melt rate for anyone inside it. (b) *Thaw wisp*: homes toward the
   player at a speed proportional to the load they carry. (c) *Weak ice*: cells
   that crack after being stood on for 40 frames and drop the player in.
6. **Score** — Banked block value only; unbanked value is worth nothing.
7. **Risk-for-reward** — One more block raises the payout but slows the run home
   and speeds up the wisp chasing you.
8. **Escalation** — Melt rate rises; wisp base speed rises; weak-ice density rises.
9. **Fairness** — The wisp is always slower than an *empty-handed* player, so
   dumping the load is a guaranteed escape.
10. **Differentiators** — The carried goods are a decaying asset *and* a mobility
    penalty *and* an aggro amplifier at once, so the bank/greed decision is
    re-evaluated continuously rather than at pickup.
11. **Lives** — 3 lives; wisp contact or falling through weak ice costs one.
12. **Attract highlight** — A five-block hauler crawling home at half speed with
    the wisp closing, dumping two blocks at the last moment and sprinting clear.
13. **Audio** — A dry saw-rasp per cut and a descending drip that speeds up as the
    load melts; the deposit is a fat descending three-note "cha-ching".
14. **Signature** — carry-and-bank / growing-liability / carry / homing

## 3. KILN ROW

1. **Title** — KILN ROW
2. **Concept** — Keep as many pots as possible sitting in the narrow peak-glaze
   heat band at once, pulling each one out in the last moment before it cracks.
3. **Controls** — 8-way move; button = PULL the pot from the kiln you are standing
   at (that kiln then reloads a cold pot after a delay).
4. **Core rules** — Kiln mouths sit at fixed positions in two rows. Every pot's
   heat rises continuously. Income accrues **per second, proportional to how many
   pots are currently inside the glaze band** — cold pots and over-fired pots pay
   nothing. A pot passing 100 heat enters a blinking crack countdown; if it
   expires the pot cracks and costs a life. Every pull adds pressure to the flue
   gauge; if the flue tops out it vents and adds heat to *every* pot at once.
5. **Enemies/obstacles (3)** — (a) *Pot/kiln*: heats at the round's rate, cracks
   at the end of the countdown. (b) *Soot sprite*: crawls to the nearest loaded
   kiln and doubles its heat rate until the player stands on it for 20 frames.
   (c) *Flue vent*: when the flue gauge fills, every pot takes +25 heat instantly.
6. **Score** — Per-second income scaled by the count of pots in band, plus a small
   pull bonus tiered by the heat at which the pot was pulled.
7. **Risk-for-reward** — Leaving a pot deeper into the band pays more per second
   and gives a bigger pull bonus, but every frame closer to the crack; pulling
   early is safe but drops income and still charges the flue.
8. **Escalation** — Active kiln count, heat rate, and soot frequency rise; reload
   delay and crack countdown shrink.
9. **Fairness** — At most one life can be lost per 60-frame window, and every
   crack triggers a full-row heat shutdown, so a flue vent can never take multiple
   lives at once.
10. **Differentiators** — Payment is for *sustained simultaneous exposure* rather
    than for the act of harvesting, and the safety action itself charges the
    systemic hazard, so neither greed nor caution is a dominant strategy.
11. **Lives** — 3 lives; a cracked pot costs one.
12. **Attract highlight** — Eight pots blinking at peak orange simultaneously with
    the flue gauge in the red as the player sprints the row pulling them one by one.
13. **Audio** — A warm bellows whoosh per pull whose pitch rises with glaze
    quality, over an insistent ratchet alarm during crack countdown.
14. **Signature** — defense-survival / proximity-daring / cycle-reset (self-named) / self-generated

## 4. CHAIN DRIFT

1. **Title** — CHAIN DRIFT
2. **Concept** — Inert drift mines are harmless until you shove one; the only thing
   in the game that can kill you is a bomb you armed yourself.
3. **Controls** — 8-way move; button = SHOVE the mine in front of you (12-frame
   cooldown, whiffs also cost the cooldown).
4. **Core rules** — Mines drift in from edge gates and bounce inertly around the
   field, passing through the player harmlessly. A shove arms a mine and launches
   it; an armed mine detonates on contact with anything. Any mine inside a blast
   is armed and launched outward, propagating the chain. Each detonation while the
   chain timer is alive raises the multiplier by 1.
5. **Enemies/obstacles (3)** — (a) *Inert mine*: drifts and bounces, harmless,
   arms when shoved or caught in a blast. (b) *Armed mine*: travels fast and
   detonates on any contact, including the player. (c) *Scavenger*: harmless to
   the player, homes toward the densest inert cluster and eats mines, growing one
   stage per meal; killed in a blast it releases everything it ate as armed mines.
6. **Score** — 50 × current multiplier per mine destroyed; 200 × multiplier per
   scavenger destroyed. Shoving itself scores nothing.
7. **Risk-for-reward** — Letting the field build before the first shove makes the
   chain far larger, but a dense field means the resulting blast wave is nearly
   unescapable, and the inert cap can overload and arm everything at once.
8. **Escalation** — Spawn interval shrinks, drift speed rises, scavenger count
   rises, the inert cap tightens (which brings the overload event closer).
9. **Fairness** — Nothing that the player did not arm can kill them; armed mines
   blink for 10 frames before moving, and overload is announced with a siren and
   a 60-frame warning.
10. **Differentiators** — The threat is 100% player-manufactured and the scoring
    engine and the death mechanism are literally the same object, so the whole
    difficulty curve is authored by the player's own greed.
11. **Lives** — 3 lives; an armed mine or a blast touching the player costs one,
    after which all armed mines defuse and the multiplier resets.
12. **Attract highlight** — A twenty-link chain rippling across the whole field,
    then a fat scavenger popping and releasing its swallowed mines as a second wave.
13. **Audio** — A pitched tick per chain link stepping up the scale with the
    multiplier, under a descending siren for overload.
14. **Signature** — streak-multiplier-upkeep / irreversible-commitment / push / self-generated

## 5. POD CUTTER

1. **Title** — POD CUTTER
2. **Concept** — Shoot ripening seed pods off a growing tree for instant points,
   using ammunition you can only reload by standing under the tree.
3. **Controls** — 8-way move; button = fire a cutter dart upward.
4. **Core rules** — A tree occupies the upper screen; pods swell along its
   branches and ripen through colour stages. Shooting a pod scores by ripeness.
   A fully ripe pod bursts on its own and rains spores in a fixed downward spray.
   Darts are finite and only refill while the player stands in the shaded ground
   directly beneath the canopy — the same place the spores land.
5. **Enemies/obstacles (3)** — (a) *Pod*: ripens on a timer and bursts into a
   downward spore spray at full ripeness. (b) *Spore*: falls in a straight line
   and kills on contact. (c) *Borer*: crawls along a branch and re-ripens pods it
   passes, accelerating their burst.
6. **Score** — Per pod cut, valued by ripeness stage (25 / 100 / 400), with the
   400 tier only available in the two seconds before it bursts.
7. **Risk-for-reward** — The highest-value cut is the shot taken latest, and the
   reload zone is the spore impact zone.
8. **Escalation** — Ripening rate rises, branch count rises, borer count rises,
   dart capacity shrinks.
9. **Fairness** — Every burst is telegraphed by a one-second colour flash, and
   spores fall strictly vertically, so a lane is always readable.
10. **Differentiators** — Ammunition economy inverts the safe position: the only
    refill point is the most dangerous tile on screen, so shooting freely is
    self-limiting without any cooldown rule.
11. **Lives** — 3 lives; spore contact costs one.
12. **Attract highlight** — A chain of four pods flashing to burst-ready at once
    while the player reloads directly beneath them.
13. **Audio** — A short taut "thip" per dart with a wet pop per cut, and a rising
    whistle warning before each burst.
14. **Signature** — instant-scoring / spend-to-score / shoot / ballistic-stream

---

## Hard-Constraint Check

| Constraint | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Single screen, no scrolling | ✓ | ✓ | ✓ | ✓ | ✓ |
| No hand-built levels | ✓ (procedural flat) | ✓ | ✓ (fixed slots) | ✓ | ✓ |
| Move + 1 button | ✓ | ✓ | ✓ | ✓ | ✓ |
| ≤3 enemy/obstacle types | 3 | 3 | 3 | 3 | 3 |
| Numeric escalation only | ✓ | ✓ | ✓ | ✓ | ✓ |
| Threat within 30 s | ✓ tide | ✓ wisp | ✓ first pot in band | ✓ first shove | ✓ first burst |
| No unfair instant death | ✓ | ✓ | ✓ | ✓ | ✓ |
| Lives system | ✓ | ✓ | ✓ | ✓ | ✓ |
| No ending, infinite laps | ✓ | ✓ | ✓ | ✓ | ✓ |
| Attract motion with no input | ✓ | ✓ | ✓ | ✓ | ✓ |
| Fits 256×224 / 16×16 / 64 col | ✓ | ✓ | ✓ | ✓ | ✓ |
| Audio identity in one phrase | ✓ | ✓ | ✓ | ✓ | ✓ |

## Pairwise Distinctness (≥2 of 4 axes must differ)

|  | 2 | 3 | 4 | 5 |
|---|---|---|---|---|
| **1** | 4 | 4 | 4 | 4 |
| **2** | — | 4 | 4 | 4 |
| **3** | — | — | 3 | 4 |
| **4** | — | — | — | 4 |

All pairs differ on ≥2 axes; no two concepts share an axis-1 value.

## Nearest-Precedent Check

**1. TIDE MASON** — adversarial candidates: Amidar (1981), Qix (1981), Pengo.
Nearest: **Amidar** = territory-conversion / timing-window / trace / patrol-homing.
M = 2 (axes 1, 2) → differentiation cap 3. Strongest rule-level overlap: "close a
region and its interior converts and scores" is Amidar's box-painting bonus almost
verbatim. Confidence: high on Amidar's economy, moderate on its exact chase rules.
Tide-timed builder games are a plausible obscure/doujin space — novelty unverified.

**2. COLD HAUL** — candidates: Bagman (1982), Space Panic, Frogger.
Nearest: **Bagman** = carry-and-bank / proximity-daring / carry / homing.
M = 3 (axes 1, 3, 4) → cap 2. Strongest overlap: pick loot up in a hazard zone,
carry it while chased, deposit it at one fixed banking point, drop the load on a
hit. Confidence: high on the economy, moderate on Bagman's specifics.

**3. KILN ROW** — candidates: Reactor (Gottlieb 1982), Kaboom! (1981),
Pressure Cooker (1983), Game & Watch *Fire*.
Nearest: **Reactor** = defense-survival / proximity-daring / push / ballistic-stream.
M = 2 (axes 1, 2) → cap 3. Strongest overlap: a single systemic meltdown gauge that
the player must keep out of the red while handling individual objects. Confidence:
moderate — Reactor's physics-push core may be misremembered in detail; the
"harvest-at-peak juggling" pattern is common in later casual games, so obscure and
post-cutoff precedents are plausible. Scored **3**.

**4. CHAIN DRIFT** — candidates: Pengo (1982), Missile Command (1980), Boulder Dash.
Nearest: **Pengo** = instant-scoring / proximity-daring / push / homing.
M = 1 (axis 3 only) → cap 5. Strongest overlap: the shove verb against a field of
free-standing blocks, and blocks being lethal in motion. But in Pengo the threat is
autonomous enemies and pushing is a weapon; here there are no autonomous lethal
enemies at all. Confidence: high on Pengo. Chain-detonation scoring is common in
puzzle games, but as a real-time single-screen arcade core it is uncommon.
Scored **4**.

**5. POD CUTTER** — candidates: Centipede (1980), Space Invaders, Astro Blaster.
Nearest: **Centipede** = instant-scoring / proximity-daring / shoot / homing.
M = 2 (axes 1, 3) → cap 3. Strongest overlap: shoot upward at a segmented,
transforming target mass from a restricted lower zone. Confidence: high on
Centipede. Ammo-economy shooters (Astro Blaster's fuel/overheat) are adjacent, so
the reload-zone idea is a variant rather than a new axis. Scored **3**.

## Evaluation (1–5)

| Criterion | 1 TIDE MASON | 2 COLD HAUL | 3 KILN ROW | 4 CHAIN DRIFT | 5 POD CUTTER |
|---|---|---|---|---|---|
| Implementability | 3 | 5 | 5 | 4 | 5 |
| Rule clarity | 4 | 5 | 4 | 4 | 4 |
| Single-screen fit | 5 | 5 | 5 | 5 | 5 |
| Low level-design dependency | 3 | 4 | 5 | 5 | 4 |
| Risk/reward strength | 4 | 4 | 5 | 5 | 3 |
| Replayability | 3 | 3 | 4 | 5 | 3 |
| Differentiation (capped) | 3 | 2 | 3 | 4 | 3 |
| Attract appeal | 5 | 3 | 4 | 5 | 3 |
| **Total** | **30** | **31** | **35** | **37** | **30** |

Notes on the decisive criteria (level-design dependency and differentiation, per
the selection rule): TIDE MASON's fun depends on the flat's rock layout, which is
level design in disguise, and its enclosure detection needs a flood fill — the
weakest combination in the slate. COLD HAUL is the cleanest to build but is capped
at 2 on differentiation by Bagman. POD CUTTER's risk/reward collapses once a player
learns to shoot only from the canopy edge.

## Selection

**CHAIN DRIFT** (streak-multiplier-upkeep) and **KILN ROW** (defense-survival).
They differ on the reward-conversion axis, so no substitution is required. They
also differ on all of risk shape, core verb, and are the two lowest-level-design
designs in the slate: every difficulty lever in both is a scalar.
