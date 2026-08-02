# Extraction Log — CHAIN DRIFT spec/design ladder

Audit trail for `docs/chain-drift-design.md`. This file exists separately because
it must cite the very constants and identifiers the design doc is required not to
contain.

Layers:

| Layer | File | Job |
|---|---|---|
| Implementation | `main.js` | The running game (read-only input to this extraction) |
| Reproduction spec | `docs/chain-drift-spec.md` | Enough to rebuild observable behaviour |
| Design | `docs/chain-drift-design.md` | Intent and experience, reproduction detail removed |

The design layer was written **from the spec**, not from the source, so that the
spec's filtering was not bypassed.

## Abstracted away (present in the spec, deliberately absent from the design doc)

| Category | Removed values |
|---|---|
| Geometry | 160x144 view; field x 4..156, y 18..138; player 6 px / radius 3; mine 5 px / radius 2.5; shove reach 8 px; ±50° arc; 4 px point-blank exemption; blast 3→16 px; capacitor body 5 px / discharge 3→24 px; shover-clear distance 11.5 px; scavenger 7/9/11 px |
| Speeds | player 1.05 px/f; armed mine 1.4 px/f; scavenger 0.55 px/f; drift 0.16–0.36 base |
| Timings | arm fuse 10 f; chain fuse 6 f; blast life 12 f; capacitor delay 60 f / discharge life 18 f / preserved chain window 135 f; shove cooldown 12 f; chain timer 75 f; overload delay 60 f; staggered overload fuses 6–34 f; respawn invulnerability 120 f; ceremony durations; entry timeout |
| Scoring | 50 per detonation; 200 per scavenger; multiplier cap 32; clear bonus `200 x patternRound x (lives+1)`; par bonus `max(0, quota*1.2 - sec) * 50`; final `1000 x lives`; extends at 40,000 then every 120,000; factory table values |
| Round data | the 9-row personality table repeated across an 18-round run (spawn / drift / inert cap / scavenger / lodestone / capacitor / quota), names and actor anchors; seed ratio 0.55; second-cycle scaling exponents 0.92, 1.10, 1.15 and their floors/ceilings |
| Lives | 3 start, 9 cap, 5 shown |
| Bot policy | flee radii 30/34 px, centre bias divisor, hoard threshold `max(4, ceil(cap*0.6))`, approach offset 7 px |
| Identifiers | every function, variable, flag and file name (`findShoveTarget`, `shoverSafe`, `src`, `CD.*`, `main.js`, `crisp-game-lib`, …) |
| Engine specifics | crisp-game-lib 1.5.0 (sole dependency, `isSoundEnabled` off); the `isNoTitle` boot trick; `isShowingScore` being off; `input.isJustPressed` being an OR of all keys; browser audio gesture requirement |
| Audio | the four-voice profile and its primitives; the master chain and its clamps; MIDI pitches, gains, frame offsets and slides of all 23 programs; both 16-step hooks, their six arrangements and step tempos; the 0.5 / 0.7 load thresholds and the 300-frame entry-clock threshold; the overload warn frames; priority numbers |

## Preserved as qualitative intent (converted, not dropped)

| Spec fact | Design-doc form |
|---|---|
| `50 x mult`, mult +1 per link | "payout is super-linear in chain length" |
| chain timer 75 f then reset to 1 | "a chain must stay hot; you cannot bank progress and resume later" |
| `inert > cap` for 60 f arms all | "the field has a crowding limit; let too many accumulate and it arms itself" |
| staggered 6–34 f overload fuses | "arms on staggered delays so it reads as a cascade to escape" |
| shover-safe until 11.5 px | "cannot harm you while it is still leaving you" |
| first blast of an uncleared mine is harmless | "its first explosion cannot harm you either, if it never got clear" |
| shove reach 8 px vs blast 16 px | "the reach of the verb guarantees you are inside that first blast" |
| whiff charges the 12 f cooldown | "it costs the same whether it lands or not" |
| pattern round 8 HARVEST is the pre-climax breather | "one round late in the sequence is a deliberate breather, placed immediately before the climax" |
| a capacitor stores for 60 f, emits one 24 px blast and marks it non-reabsorbable | "one absorbed blast produces at most one delayed, wider blast; waiting cannot create a permanent scoring pulse" |
| round personalities are parameter mixes | "personality made only from a different mix of the same parameters" |
| idle/bot 0.49 → 0.02 after causality rule | "a player who does nothing is paid a large fraction of what a skilled player earns" → "doing nothing pays almost nothing" |
| probe/balance/screenshot gates | "verify in this order, and never skip step 3" |
| BGM arrangement selected by `inertCount() / cap`, the same value the FIELD LOAD bar draws | "the music reads the gauge the player is already watching" |
| `p1` is never used by a BGM layer | "the player's own voice is reserved" |
| priority order control > danger > consequence > cabinet > BGM, with one note-start per voice per frame | "under load the music yields and consequence does not" |
| warn ticks at overload frames 6/22/34/44/52/58, transposed up | "a fuse is heard before it fires" |
| `chain:detonate` transposed by `min(mult,20)*2` | "a rising chain is heard rising" |
| BGM runs in `play` only | "silence is part of the arrangement; the music stopping is how the player hears the controls being taken away" |

## Omitted entirely (judged non-design)

- Verification results, run counts, and the measured idle/mash/bot distributions.
- The bug history and which gate caught which defect — except where a bug
  produced a design *principle*, in which case the principle was kept and the
  incident dropped (sections 6, 10).
- HUD pixel positions, colour names, glyph sizes, jingle note sequences,
  waveform and envelope choices, rendered peak/RMS measurements.
- Debug handle surface and measurement hooks (`setAutopilot`, `deaths()`, the
  naive policy) — these are instruments, not design.
- Known-gaps list (calibration caveats, untested late laps, no mobile scheme):
  these are project status, not intent.

## Added as recovery guidance (not present in the spec)

- The **treat-as-unspecified** list: everything a rebuilder may choose freely.
- The **safe-to-assume** list: conventional choices made without deliberation, so
  a rebuilder does not agonise over them.
- The **restoration priority** order, with the explicit instruction to implement
  the causality invariant *before* tuning anything — a sequencing lesson that
  cost real rework in this project and is invisible in the spec.
- The **room for reinterpretation** split (freely changeable vs load-bearing).
- Section 7's framing of anti-degenerate checks as a *policy comparison* rather
  than a single-run inspection.

## Validation status

**Gated 2026-07-30, twice: weak-pass, then pass after repairs.** Superseded the
original status, which read "not gated — waived by the project owner" and warned
that the extractor's own audit could not be independent. That warning was
correct: when the gate was finally run it found a rule the extractor believed
was transmitted and was not. Full account in the **Blind-restoration gate**
entry at the end of this file.

The residual caveat is narrower but real: the repairs made after the *second*
gate — the protected cash-out's closure rules, the ambient-vs-triggered
distinction in the causality section, and the shover-safety predicate's
promotion into the summary lists — have not themselves been re-gated. Their
sufficiency is asserted, not proven, which is the same category of claim the
first gate falsified.

## 2026-08-01 — Audio collision hardening

The isolated programs already met the four-voice contract, but normal gameplay
co-occurrences revealed four authored onsets or tails being lost: MISS masked
the GAME OVER opening, tally ticks truncated the ROUND CLEAR cadence, and the
low-quota and CHAIN OUT signatures shared voices with their triggering blast.

- **Reproduction spec**: delayed GAME OVER emission, separated clear/tally
  windows, reassigned or delayed sibling steps, the dedicated ALL CLEAR
  program, explicit BGM-voice phase stops, and `actualFrames` / `endedBy`
  diagnostics with real co-occurrence gates.
- **Design layer**: only the invariant that rare ceremonies receive distinct,
  complete punctuation and that mechanical ticks wait for reward phrases. It
  deliberately omits pitches, voices, frame offsets, gains and event names.

This promotes "a note started" versus "a note survived" into a tested audio
boundary without exposing the synthesis schedule to the design document.

## 2026-08-01 — Fixed 18-round score attack

The former endless lap structure was replaced by one continuously numbered,
fixed-length run. The nine authored personalities play once as a teaching arc
and once under scaled pressure; the second STORM clear ends the game.

- **Reproduction spec**: the exact endpoint, public-to-pattern/cycle formulas,
  second-cycle parameters and anchor rotation, repeated clear-bonus index,
  ordinary final ROUND CLEAR transition, ALL CLEAR timing, `1000 x lives`
  bonus with no ending extend, fresh V2-only score storage, `Rnn` /
  `C18` / `---` display tags, reached-round definition and exact tie ordering.
- **Design layer**: only the finite score-attack intent — every score shares one
  maximum course; the authored arc repeats once at higher pressure; survival
  pays only a small marginal reward; rankings retain progress and completion
  while score stays primary. It deliberately contains no round count, point
  value, ceremony duration, identifier or storage schema.

This moved the existence of a fixed endpoint into the load-bearing design while
leaving its exact length tunable. The former late-cycle actor multiplication and
score-inflation gaps are no longer reachable; historical measurements remain in
the spec as evidence about the earlier build, not current behaviour.

## 2026-07-30 — OVERLOAD must resolve before protected cash-out

The previous closure rule erased field-authored ordnance as soon as the quota
was met. That preserved the safety of `chainout`, but contradicted OVERLOAD's
design role as a crowding punishment the player must escape.

- **Reproduction spec**: the exact source-bearing objects that hold the
  settlement open, continued `play` phase/input/damage/clock behaviour,
  suppression of `stepSpawner()` and `stepOverload()`, persistent screen copy,
  miss handling, natural transition predicate and defensive forced-entry
  cleanup.
- **Design layer**: only the new player-facing intent — meeting the quota cannot
  erase a collapse already committed; the player remains able and required to
  survive it, while no new danger is allowed to arrive after the win.

## 2026-07-30 — Combined initials and ranking screen

The design layer now records the player-facing intent: name entry is a visible
board with explicit delete/finish actions, and the ranking remains visible
during that interaction. The reproduction spec keeps the concrete four-row
character/action layout, cursor wrapping, key bindings, colours, screen split,
three-character limit, padding rule and timeout. The implementation identifiers
and debug contract remain outside the design layer.

## 2026-07-30 — Initials only for a qualifying score

The design layer now preserves the recognition rule: entering a name is the
reward for reaching the visible table, while lower scores proceed directly to
the rankings. The reproduction spec retains the exact top-five boundary,
new-entry-wins tie handling and conditional phase transition.

## 2026-07-30 — Player-facing PUSH terminology

Player-visible copy and the design layer now call the single action `PUSH`,
whose short, familiar wording describes the physical verb. The title prompt is
`PRESS SPACE` so starting the game cannot be confused with the action name.
Implementation identifiers, telemetry, sound-event IDs, historical bug names
and exact shover-safety terminology remain unchanged in the reproduction layer.

## 2026-07-28 — LODESTONE addition

The new as-built constants, anchors, round-table column, pull formula, debug
surface and neutral-grey/blue drawing contract remain in the reproduction spec.
The design layer preserves only the new intent: a harmless actor rearranges
existing material into a visible local knot, making the best cascade target the
hardest place to escape, while creating no new score or lethal event. This also
changes the abstract round-personality mix from scavenger pressure alone to two
distinct harmless spatial pressures.

## 2026-07-28 — LODESTONE deflection (second pass)

Review found that the actor as first shipped could not touch the player at all,
not even indirectly: nothing was taken from a player who ignored it and nothing
was ever fired at them, which is the rejected DAMPER's defect with the sign
flipped. Armed mines in flight are now deflected as well.

Layer split for the new rule:

- **Reproduction spec**: the armed pull constant, the per-mine budget, the
  no-drag rule, the fuse exclusion, the `moveInert` parameter, the ring's hazard
  colour, and the measured deflection/fairness tables.
- **Design layer**: only that the field acts on live ordnance as well as inert
  material, that it can bend a shot but never keep one, and *why* — a pressure
  that can be ignored for free is not a pressure. The mechanism by which capture
  is prevented is an implementation detail and is deliberately not in the design
  doc; a rebuilder is free to choose another one.

Also recorded in the spec: the first pass's field-size evidence was retracted
after failing to reproduce at n=4, so `LODE_RADIUS` is now documented as an
unmeasured value rather than a measured one. That belongs to the reproduction
layer only — the design layer never named a radius.

## 2026-07-29 — Lodestone anchors (third pass)

Review found the anchor was one fixed point shared by all five lodestone
rounds, which made the deflection above avoidable by geography and made the
five rounds spatially identical.

- **Reproduction spec**: the five anchor coordinates, the per-round starting
  slot, the `+ lap + i` rotation, and the three geometric constraints the set
  satisfies (48 px separation, 30 px centre clearance, ring inside the frame).
  All of it is probe-covered over ten laps.
- **Design layer**: only that each round with one stands it somewhere else and
  that later laps move it again — learnable, but never the same answer twice.
  Neither the coordinates nor the rotation arithmetic appears there; a rebuilder
  choosing a different set of well-separated positions is still faithful.

## 2026-07-29 — Shover safety clears on leaving, not on distance (bug #7, second form)

This one moved a sentence *up* a layer rather than down, which is the reverse of
every entry above and is the point of recording it.

The design layer already said the right thing — an object you shoved cannot harm
you "while it is still leaving you", lethal again "once it has cleared". The
reproduction layer had turned "cleared" into a distance test, and a distance test
is satisfied by a mine that has separated and is now coming back. So the layers
did not disagree in wording, only in what the word was taken to mean, and the
defect lived entirely in that gap.

- **Reproduction spec**: the relative-velocity condition and its sign, the
  `player.vel` definition (post-clamp displacement, zeroed during `chainout`),
  the fused-mine consequence, the new debug surface, and the measurements —
  0.35 px/frame closing, 0/5 repro, 0 episodes under either automated policy.
- **Design layer**: one added sentence, no constants — that *cleared* means
  left, not distant, and why the distance reading recreates the trap. It is
  there because a rebuilder working from the design doc alone would otherwise
  reach for distance, exactly as this implementation did, and reproduce the bug.
  The relative-velocity formula itself stays out; any test for "still leaving"
  is faithful.

## 2026-07-30 — CAPACITOR and the nine-round lap

The fourth actor and lap recut change both layers, but at different resolution.

- **Reproduction spec**: the body, delay and enlarged-blast constants; the
  absorb-before-collision ordering; stored `src`/presentation power; the
  preserved chain-timer formula; the one-relay flag; charged-actor exclusion;
  grounding on `chainout` and miss; glyph state; READY copy; debug surface; the
  full nine-row table; both fixed-actor slot tables; and exact lap rollover.
- **Design layer**: only the new decision — an immediate, player-placed blast
  may become one visibly charging, wider future blast at a fixed position. It
  preserves authorship, cannot relay repeatedly, stops during protected
  cash-out, and never shares a round with the gathering field. The lap teaches
  each fixed actor alone, later combines the delayed relay with the roaming
  collector, and keeps a breather immediately before the climax.

The actor name, round count and names, all timings/radii, anchor coordinates,
table values, scaling caps, source-field identifier, sound events and probe
methods remain below the design layer. The design does preserve the finite
one-input/one-output lifecycle because removing it would permit safe waiting or
an unbounded scoring pulse and would change the game rather than merely tune it.

## 2026-07-30 — CAPACITOR intake, pull and recovery (second pass)

The same review the LODESTONE got, with the same finding one step worse. As
first shipped the relay had no continuous presence at all: it acted only when a
blast happened to touch it, its absorption boundary was never drawn, and an
absorption *extended* the player's streak window — so it cost nothing to ignore
and nothing to use. The LODESTONE at least gathered material every frame.

This entry is the mirror of the 2026-07-28 deflection entry, and the layer split
is deliberately the same shape:

- **Reproduction spec**: the intake radius and its identity with the discharge
  radius; the centre-inside test and the "born outside sweeps over harmlessly"
  consequence; the pull constant, per-launch budget, no-drag rule and fuse
  exclusion; the `intakeOpen` predicate and the cooldown constant; the removal of
  the chain-timer formula and the ~15-frame residue that replaces it; the three
  glyph states and the structure-blue drain; the new READY copy; the extended
  debug surface; and the measured before/after table with its negative result.
- **Design layer**: only that the actor now holds ground — live ordnance is
  drawn into a permanent footprint that swallows explosions whole, the delay is
  spent out of the player's streak rather than granted on top of it, and the
  actor must shut itself for an interval after returning a blast. The *reason*
  is in the design layer too, because a rebuilder given only "intercepts and
  returns a blast" would rebuild the ignorable version, exactly as this
  implementation did.

Two things were deliberately kept out of the design layer. The budget mechanism
that makes capture impossible stays an implementation detail, as it already does
for the gathering field. And the numbers — pull rate, budget, intake radius,
cooldown length — stay below it, because the spec now records that the measured
pull rate sits below the gathering field's and that raising any of them is an
open, unmeasured tuning question.

One thing moved *into* the design layer that was previously only implicit: the
split that LODESTONE acts on material while CAPACITOR acts on ordnance. It is
there because it is what stops the two fixed actors from being one idea twice,
and a rebuilder choosing to make the relay gather inert mines as well would
produce a coherent game that is not this one.

## 2026-07-30 — CAPACITOR loading gather (third pass)

The second pass overcorrected. Having removed the reasons to ignore the actor,
it left no reason to use it: routing a chain through the relay cost the blast
front, most of the streak window and the choice of where the explosion happens,
and returned one wider blast into whatever had drifted under it. A pure toll
fails the "every pressure is a trade" rule from the opposite side to the defect
it was fixing. The delay now gathers loose material into the coming blast.

- **Reproduction spec**: the gather reach and its derivation from
  `intake + pull * delay`; the pull rate, drag and core radius with the reason
  each is what it is; the `nearestLoadingCapacitor()` selection; the transient
  outer diamond, its neutral colour and its behaviour at corner anchors; the
  `moveInert` parameter; the seeded 40-field before/after table; and the balance
  evidence for the causality gate.
- **Design layer**: that the wait is what the player buys — loose material drawn
  in from wider than the coming explosion, so the delay loads the board and the
  returned blast lands in more than it took. Plus the decision this creates, in
  the same terms the doc already uses for the overload collapse: run, or claim
  the knot before the relay fires. No radius, rate or frame count.

The causality gate is the entry worth reading twice. Gathering was written to
apply to any stored charge, which is the obvious reading and was wrong: the
field's own collapses detonate inside capacitor footprints, so an idling player
was having material concentrated into explosions on their behalf. The balance
harness read idle/bot 0.30 against a 0.01–0.07 band. The multiplier was never
involved, so the causality *invariant* held — what had appeared was a new
unmultiplied income for doing nothing, which the invariant's stated purpose
covers even though its letter did not catch it.

This sits in **both** layers, deliberately, and it is the only part of this pass
that does. The spec records the gate and the measurement. The design doc records
that loading is a reward and therefore belongs to whoever authored the charge,
because a rebuilder given only "the wait loads the shot" would write the version
that pays idlers — as this implementation did, on the first try, having had the
rule in front of it the whole time.

**Retracted the same day.** The claim in the paragraph above — that the design
doc now carried the rule adequately — was tested and was wrong. See the
blind-restoration entry below.

One thing was considered and deliberately left alone: shover safety is not
preserved through the relay, so a blast that could not have hurt the player
returns a second later as one that can. The project owner reviewed and accepted
it. The spec records the acceptance and the weakened justification; the design
layer says nothing, because the fairness rule it states — an object still
leaving you cannot harm you — is not engaged a full second after the shove.

## 2026-07-30 — Capacitor anchors (fourth pass)

Entirely a reproduction-layer change, recorded here because of what it says
about the three passes before it.

The gather boundary had silently invalidated the anchor separation rule: 39 px
diamonds need 78 px, the shared five-anchor set has 50 px and 68 px pairs, and
from lap 4 the drawn boundaries interpenetrate. Capacitors now have their own
three anchors, sited on a freshly measured traffic map rather than inherited
from the lodestone.

- **Reproduction spec**: the coordinates, the separation arithmetic and its
  4.1 px margin, the proof that three is the maximum the field holds at that
  separation, the three-lap rotation and its consequence at full scaling, the
  traffic-map method and grid, and the before/after absorption table with its
  binomial test.
- **Design layer**: nothing. It already says each round with a fixed actor
  stands it somewhere else and that later laps move it again, which is still
  true; the coordinates, the count and the separation arithmetic were always
  below the line, and a rebuilder choosing different well-separated positions
  is still faithful.

The reason to read this entry is the result. Two passes of rule work — a wider
intake, a continuous pull, a withdrawn gift, a loading gather — moved absorption
frequency not at all, and the spec had to report that honestly twice. Moving the
anchors moved it 2.6x with a p of 0.003. **The actor's weak board presence was
substantially a placement problem wearing a rule problem's clothes.** The
design layer cannot express that, and should not try to; but anyone reaching
for another rule to make a fixed actor matter more should measure where it is
standing first.

## 2026-07-30 — Blind-restoration gate, and what it cost

The design doc had carried a note since its extraction saying its
self-sufficiency was unproven and had never been independently gated. It has now
been gated twice, and this entry exists because the result contradicted a claim
made one entry above.

**Round 1 — weak-pass.** An isolated agent was given the design doc text and
nothing else and asked to reconstruct the reproduction layer. Everything the
document calls load-bearing came back recoverable, including the shover-safety
predicate and the relay's full state machine. Three things did not: whether a
detonation arms its neighbours or detonates them, what an armed object does at
the wall, and whether field kills count toward the quota. The first two are the
*core loop*, which the document's own recovery guidance calls the thing that
matters most.

The finding that mattered was on the relay's author-conditional loading. Asked
what it would actually have implemented, the grader said **unconditional** — the
identical error this implementation had made hours earlier — and classified the
rule as "findable, not unmissable": present once, in a subordinate clause
following an emphatic unconditional half, and absent from all four places the
document itself designates as rule summaries. The entry above had asserted the
opposite. **A rule can be stated correctly, with its rationale, and still not be
transmitted.** Being in the document is not the same as being in the summary a
reader builds from.

**Round 2 — pass.** After repairs, a fresh grader who had not seen the first
report confirmed the rule now appears in six places including the bolded rule
list, the anti-degenerate table and the reinterpreters' section, and classified
it unmissable; and confirmed the three core-loop questions settled. It raised
three narrower residuals, all since fixed, and made one observation worth
keeping: the strongest reinforcements were commentary *about* the gate, which is
the first thing an editor strips. The document now carries an explicit
instruction naming which clauses are rules and must survive that tidying.

Layer discipline for the repairs: **all of it landed in the design layer and
none in the spec.** Propagation semantics, wall behaviour and quota accounting
are intent, not constants — the spec already had them and the design doc had
dropped them as if they were implementation detail. That is the mis-abstraction
this gate is for: the extraction had treated "what happens when a blast touches
a mine" as a reproduction concern, when it is the core loop.

The general lesson, which is the reason to keep paying for this: **the author of
an abstraction cannot judge whether it transmits.** Twice now this project has
believed a rule was carried and been wrong, and both times the belief was held
by whoever had just written the rule and could still see the thing it was
abstracted from.

## 2026-07-31 — Sound: a synthesised board, and music that reads the gauge

The game had a semantic SE kit playing crisp-game-lib presets and no music. Two
things changed, and the layer split between them is the point of this entry.

**Implementation change, spec layer.** Sound is now synthesised in-file over the
Web Audio API: a frozen four-voice PSG-like profile, a fixed primitive set, one
master chain, priority arbitration with real voice stealing, and a 16-step
adaptive BGM cue. `options.isSoundEnabled` is false and the audio library is
gone from `index.html`, so the engine has no sound path at all. All of that —
profile, pitches, gains, tempos, thresholds — is reproduction detail and lives
in the spec.

**Design change, design layer.** Five of the new rules are intent, not
constants, and went to the design doc as principles (§10, "Sound obeys the same
principles"): the music reads the crowding gauge; the fuse is ticked out before
the alarm; one voice is reserved for the player; under load the music yields
before consequence does; silence marks the moments control is taken away.

The one worth naming is the first. The recurring defect this project documents
is *a rule that is correct and never drawn*. Sound is a second place to draw,
and the arrangement is now driven by exactly the value the crowding bar draws —
one function, two readouts, incapable of disagreeing. That is the same
single-source rule the shove marker already follows, applied to a different
output device.

Nothing in the design doc names a waveform, a pitch or a tempo, and the
"unspecified" list still calls the audio palette free: a reimplementation may
pick any timbres it likes, as long as the music tracks the crowding gauge, the
player's channel is reserved, and the priority order holds.

## 2026-08-01 — A second cue for the initials screen

Asked for music on the name-entry screen after hearing the first pass. The
scheduler was generalised from one cue to a registry keyed `cue:section`, and
`entry` was added as a second cue with two arrangements.

The layer split is the same as last time, and the design layer gained exactly
two sentences of intent: **music may only read a gauge the player can already
see** (the field cue reads crowding, the initials cue reads the countdown that
screen already prints), and **a second cue is the first one answered** — the
entry hook is the field's descending cell inverted, same four notes, same
interval shape, resolved upward. Everything else — 13/9 frames per step, the
300-frame threshold, `A C D E / A C D G`, layer gains — is reproduction detail
and stayed in the spec.

Two things the generalisation forced, both worth keeping:

- "danger switches at the next step" became a per-arrangement **`urgent`** flag.
  Two arrangements now announce a deadline (the overload, the entry clock), and
  the rule was about deadlines, not about the field.
- The 1.25x audibility rule was measured against *the loudest cue in the game*,
  which is wrong once cues cannot co-occur: a field sound is never heard against
  the initials music. The gate now measures each group against the cue it
  actually shares a screen with. The first version of the entry cue would have
  passed the old rule and quietly made `entry:move` inaudible under its own
  music.

The gate also caught a real defect on the way in: the entry answer note landed
on step 15 with a length of `stepFrames + 2`, so it ran past the loop point in
both arrangements — a tail, in a contract that declares zero tail. Shortened to
`stepFrames - 1`.
