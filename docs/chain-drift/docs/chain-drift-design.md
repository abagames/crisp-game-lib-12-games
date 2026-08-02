# CHAIN DRIFT — Design Document

The abstract layer: what this game is, what it asks of the player, and which of
its rules are load-bearing. It deliberately contains **no constants, formulas,
frame counts, or code identifiers** — those live in the reproduction spec, which
is a separate document. If you are trying to rebuild the exact game, read that
instead; if you are trying to understand or reinterpret it, read this.

## 1. Experience Core

A fixed-screen arcade game about **manufacturing your own danger**.

The field fills with inert objects that drift harmlessly and pass straight
through you. Nothing on the screen can hurt you until you *make* it dangerous.
Your single action arms one object and launches it; an armed object detonates on
contact with anything, and every detonation arms its neighbours, so one push can
ripple across the whole field.

Three details of that sentence are load-bearing and were found missing by a
blind-restoration gate, so they are stated here rather than left to the
reproduction layer:

- **A detonation arms and launches its neighbours; it does not detonate them.**
  Each newly armed object waits briefly, then travels until it meets something,
  and detonates *there*. The cascade is a chain of separate explosions spreading
  across space over time, not one flood-fill resolved on a single frame. A
  detonation that reaches an object which is already armed and already
  travelling does set that one off immediately — otherwise a dense pack would
  stall.
- **Inert objects reflect off the field boundary; armed ones detonate on it.**
  "Detonates on contact with anything" includes the wall, and this is what
  guarantees a push into empty space eventually resolves instead of leaving
  live ordnance bouncing forever.
- **The brief wait before an armed object launches is the game's only warning.**
  It is what makes an armed object readable as a threat with a position you can
  plan around, and several later rules depend on it existing.

The scoring engine and the killing mechanism are literally the same object. That
identity is the game. Everything else exists to make it legible and to stop the
player from getting the reward without taking the risk.

The intended feeling is a held breath: a slowly crowding screen, one decisive
push, then a cascade you are running away from while it pays you.

## 2. The Player's Verb

Movement plus **one** contextual action: *push the object you are facing*.

The verb has three properties that matter more than its implementation:

- **It is directional.** You do not select a target; you position yourself so
  that the object flies where you want. Aiming is done with your body, which is
  why movement and the action are inseparable. The usable region reaches
  farther in a narrow line directly ahead than it does across the shoulders:
  walking straight into a deliberate push should be forgiving, while a loose
  diagonal aim should not acquire an object by accident.
- **It is committal.** Once pushed, the object cannot be recalled, disarmed, or
  steered. The decision is spent at the moment of the press.
- **It costs the same whether it lands or not.** A missed press occupies the
  action for a short while. This is the only anti-mashing rule the game needs;
  spamming guarantees the action is unavailable at the moment it is wanted.

## 3. What the Player Decides

Three decisions, asked continuously:

1. **When to break the calm.** The field grows denser over time. A denser field
   means a longer chain and a much larger payout, but also a blast wave with
   fewer gaps to escape through. The whole difficulty curve is authored by the
   player's own patience.
2. **Where to aim.** A push into empty space is nearly worthless; a push into
   the densest cluster is worth the most and puts the explosion closest to the
   crowd you are standing in. A harmless field actor continuously gathers
   material into a visible local knot, offering a stronger target at a position
   the player did not choose.
3. **Where to be standing afterwards.** The reach of the action is far shorter
   than the reach of an explosion, so the push point is always inside the blast
   footprint. Retreat is part of the move, not an optional flourish. The
   gathered knot makes the best aim point and the safest staging point conflict
   directly, and inside the gathering field the retreat cannot be planned from
   the launch angle alone: what is in flight there is being pulled off course
   while the player is choosing where to run.

The speed reward must be readable while these decisions are being made. The
player should always be able to see how much bonus remains, so waiting for a
larger chain is an informed trade between chain value and time value rather
than a hidden post-round judgment.

## 4. Risk and Reward

Payout is **super-linear in chain length**: each link in an unbroken chain is
worth more than the last. Two short chains are worth far less than one long one,
which is what makes hoarding rational and hoarding is what makes the field
dangerous. The reward curve and the threat curve are the same curve.

Against that pull, five counter-pressures:

- A **chain must stay hot**. If detonations stop for long enough, the streak
  value collapses back to its floor. You cannot bank progress and resume later.
- The field has a **crowding limit**. Let too many objects accumulate and the
  field arms *itself*, all at once. This is the punishment for pure patience,
  and it is announced clearly and staggered so it can be survived by a player
  who is already moving.
- A **third actor** roams the field consuming inert objects. It cannot hurt you;
  it takes your raw material and grows fatter doing it. Destroying it pays well
  and disgorges everything it swallowed as live ordnance — a second wave you now
  have to survive. It exists so that hoarding is not free, and so the field has
  something moving in it that is neither yours nor lethal.
- A **second fixed actor** anchors a local field that acts on everything moving
  through it. It neither creates nor consumes material, pays nothing and cannot
  touch the player directly. On inert material it gathers: it changes only where
  material accumulates, making a larger cascade available in the place that is
  hardest to escape. On live ordnance it pulls trajectories off course — the
  player's own chain and the field's self-armed ordnance alike — so inside its
  footprint a launch angle no longer tells you where the explosion will be. It
  can bend a shot but never keep one; anything it acts on eventually leaves and
  detonates.

  Each round that has one stands it somewhere different, and the placement
  shifts again when the sequence repeats at higher pressure, so the layout is
  learnable but the second half is not a spatial replay of the first. A single permanent position would have made half the field
  permanently uninteresting and let a player opt out of the whole pressure by
  never fighting there.

  The second half exists because the first half alone made it the only actor a
  player could ignore for free. Every other pressure is a trade: the crowding
  limit takes the streak and arms the field, the roaming collector takes your
  material and hands it back as live ordnance. A gathering field that only ever
  offers a better target is an optional bonus, which is the same defect as the
  rejected pure-subtraction proposal with its sign flipped. Deflection is what
  makes standing near one a decision rather than a free upgrade — and, like
  every other pressure here, it adds no new way to score and no new way to die.

- A **third fixed actor** intercepts a blast and returns it later from its own
  position with a wider footprint. It neither scores nor changes who authored
  the chain; it turns an immediate, player-placed explosion into a visibly
  charging future hazard somewhere the player did not choose to stand.

  It holds a permanent footprint that live ordnance is drawn into and that
  swallows whole any explosion occurring inside it. Its counterpart gathers
  material at all times; this one gathers *ordnance*, and the split is what
  keeps the two fixed actors from being one idea twice. A chain fought near this
  actor is therefore routed into the relay rather than merely at risk of
  touching it: the cost of its ground is that explosions there are taken away
  and given back late, from a point the player did not choose, and the delay is
  spent out of the player's own streak window rather than granted on top of it.

  Against that cost, the wait itself is what the player buys. While it holds a
  charge the actor draws loose material inward from a reach wider than the
  explosion it is about to make, so the delay is a visible loading of the board
  and the returned blast lands in more than it took. Without this the actor is a
  toll with nothing on the other side of it, which fails the same trade rule from
  the opposite direction. The loading is a reward and therefore obeys the
  causality invariant: a charge the field caused still returns its wider
  explosion, because danger is never conditional, but it loads nothing. Only a
  chain the player authored is worth concentrating.

  The board this creates is the actor's real decision: material piling under an
  explosion that is visibly coming, at a place the player did not choose. Run,
  or go in and claim the knot before the relay fires.

  The second half exists for the reason its counterpart's does. Interception
  alone made this the actor a player could both ignore for free and use for
  free — no trade in either direction, the same defect the gathering field
  shipped with, one step worse because that one at least acted on the field
  every moment. The revision adds no new way to score and no new way to die.

  The relay is deliberately finite. One absorbed blast produces at most one
  delayed blast; a returned blast cannot be stored again; after returning one
  the actor stays shut for a further interval; **and only a charge the player
  authored draws material in — a field-caused charge returns its wider explosion
  and loads nothing.**

  Two of those four need their reasons kept next to them. Without the lockout,
  the wider intake and the inward pull combine into a relay that feeds itself:
  its own returned explosion arms material inside its own footprint, which falls
  back in and starts the cycle again. Waiting must never create a permanent
  scoring pulse. And the fourth rule is in this list rather than only in the
  prose above because a blind-restoration gate showed that a reader working from
  the list alone builds the unconditional version — which pays an idling player
  for the field's own collapses being concentrated on their behalf. It reads as
  physics, so it does not feel like something that needs asking who caused it.
  It is not physics. It is a reward.

  Aiming through the actor still preserves the reward and danger of the authored
  chain. Its full future footprint and remaining delay must be visible before
  release, and so must the difference between holding a charge, drawing a link
  in, and being unable to accept one — and the reach of the loading draw, which
  is wider than the explosion and is a promise about what will be caught, must
  be drawn only when a charge is actually going to load.

  The two fixed actors never share a round. Their effects would multiply into a
  chain that sustains itself, and their overlapping footprints would obscure
  which spatial rule the player is reading. The relay is introduced by itself
  before a later round combines it with the roaming collector.

## 5. The Causality Invariant

**The reward for a chain belongs to whoever started it.**

Objects armed by the player's action, and everything their explosions arm in
turn, carry the full streak value. Objects armed by the field's own crowding
collapse are worth a flat, unmultiplied minimum and never advance the streak.

This is the single most important rule in the design. Without it, a player who
does nothing at all is paid a large fraction of what a skilled player earns:
the field's self-detonation chains and multiplies on its own, so standing still
becomes a strategy. With it, doing nothing pays almost nothing.

The rule also produces the game's best emergent play. During a self-armed
collapse the smart move is not to run — it is to push into the mess and *claim*
it, converting the field's cascade into a chain of your own.

Design consequence: **anything the player is handed must be asked "who caused
this?" before it is handed over.** Not only scoring, streak and bonus
mechanisms — that wording is too narrow and has already let one violation
through. An effect that merely moves objects around, with no score attached
anywhere in it, is still something given to the player if it makes their
explosions land in more; and if the field can trigger it, the field will hand it
to a player who did nothing. The test is not "does this pay points" but "is
someone better off because this happened, and did they earn it".

This is the invariant most likely to be violated by accident, and the accident
is usually this shape: a rule that reads as *physics* rather than as *reward*.
Physics feels unconditional, so nobody thinks to ask the question.

**The test applies to effects fired by an event, not to ambient ones.** An actor
that simply acts on its surroundings continuously, responding to nothing, has no
cause to interrogate — nobody triggered it, so there is no "who". The gathering
fixed actor is exactly that: it gathers always, for everyone, and it is not a
violation of this section. The relay's loading is the opposite case — it happens
*because* something was absorbed, so there is an author, and an author means the
question must be asked. If you can name the event that started an effect, ask
who caused that event. If you cannot, the test does not apply.

One further point of accounting, so it cannot be assumed either way: **the round
quota counts every object destroyed, whoever armed it.** A crowding collapse
does advance the round. The anti-idle pressure is carried entirely by score and
by lethality — never by withholding progress — because a quota that ignored
field kills would stall a dying player in place rather than punishing them.

## 6. Fairness Invariants

The design's premise is "the only thing that can kill you is something you
armed." That premise is only honest if the act of arming is not itself a coin
flip. Two rules protect it:

- **An object you just pushed cannot harm you while it is still leaving you.**
  It is lethal to everything else immediately, and lethal to you again once it
  has cleared. Without this the arming delay is a trap: the player walks into
  their own stationary object and dies the instant it launches.
  *Cleared means left, not merely distant.* An object that has separated but is
  closing again has not cleared — and it will close again, because the player
  who pushes while moving is walking in the direction they just fired, and the
  pushed object is the faster of the two. Reading "cleared" as distance alone
  restores the trap in a form that only appears when the player holds their
  direction through the push.
- **Its first explosion cannot harm you either, if it never got clear.** Not
  because explosions are safe, but because the reach of the verb guarantees you
  are inside that first blast. Everything that explosion arms is a normal,
  lethal chain link, so pushing into an adjacent pack remains fatal — that is a
  decision, not a coin flip.
  *The exemption is spent once, and only while the object has never cleared.* An
  object that separated, cleared, and later detonates with the player back inside
  its blast kills them. Clearing is one-way: nothing re-earns the grace. The
  exemption exists to stop the press being a coin flip, and a player who walked
  back into an explosion they could see is making a choice again.

The distinction to preserve: **punish the choice, never the button press.**

A third rule protects the same premise from the opposite direction: the field's
self-arming collapse must be announced before it happens, and must arm its
objects on staggered delays rather than simultaneously, so it reads as a cascade
to escape rather than a single unavoidable frame.

## 7. Anti-Degenerate-Play Invariants

These are structural, not tuning, and should be re-verified after any change to
scoring or spawning:

| Degenerate play | Why it fails |
|---|---|
| Doing nothing | No score without a player-caused chain; the crowding limit eventually arms the field, and an idle player is standing in it |
| Mashing the action | A missed press occupies the action, so the button is unavailable when it matters |
| Holding a direction | There is no held action to exploit |
| Safe nibbling from a corner | Isolated pushes yield the streak floor, which cannot keep pace with a round's quota |
| Camping the delayed relay | It cannot accept another blast until well after it has returned the last one, so no amount of waiting turns it into a repeating source |
| Idling next to the delayed relay | The field's own collapses can charge it, but a charge the player did not author gathers nothing, so waiting near one concentrates nothing on the idler's behalf |

The correct way to check these is a **comparison between control policies**, not
an inspection of any single run: an idling policy and a mashing policy must both
score far below, and die faster than, a competent policy. Judge the ratio, and
run it several times — the distributions have long tails and a single run proves
nothing.

## 8. How Tension Is Built

**Within a round**: a quota of destroyed objects. Meeting it secures the clear
once every danger already committed has resolved, so progress is something the
player produces rather than waits out. A speed bonus that decays to zero —
never a timeout failure — restores the mild time pressure that a quota structure
otherwise removes.

Reaching the quota does not erase a field collapse already in progress. The
player must first survive every field-authored hazard that was already
committed; the quota display remains at zero and a persistent message makes
this final obligation explicit. No new material or second collapse may begin
during that interval, so it is a finite consequence of the state already on the
field rather than extra danger arriving after the win. Controls, mortality
and the speed-bonus clock remain live until the field-authored danger is gone.

Only then does reaching the quota lock the player's controls, make them harmless
**and make them unkillable** while the player-authored chain already in flight
finishes paying out. No new danger or scoring opportunity may be created during
this protected cash-out: spawning, field self-arming and all harmless actors
stop, while only objects causally descended from the committed push continue.
The round clock stops when protected cash-out begins. This is reward completion,
not a new safe play state.

Two closures that the phrase "only causal descendants continue" does not by
itself settle, and which decide whether a player can be killed after winning:

- **Field-authored ordnance already in flight delays protected cash-out.** It is
  never carried into the locked, invulnerable reward state, but neither is it
  erased by reaching the quota. The player keeps the controls needed to answer
  it and remains vulnerable until it has resolved.
- **The quota can be met by the field's own collapse**, since it counts every
  kill. When that happens the round does not end until the collapse itself has
  finished. If there is no player-authored chain left afterward, the protected
  cash-out has nothing to run and simply ends at once.

**Across the round sequence**: a fixed table, each entry a *personality made only from
a different mix of the same parameters* — never new content. Rounds differ by
being crowded, fast, collector-heavy, locally clustered, delayed by a fixed
relay, or tightly capped, and the mix is what makes them feel unlike each other.
Each fixed actor is introduced alone before it appears in a mixed pressure.
One round late in the sequence is a deliberate breather: abundant material, a loose
crowding limit, and no harmless actor — the round where a good player farms one
enormous chain. It is placed immediately before the climax, after the hardest
mixed stretch.

**Across the run**: the table is played once to teach its complete arc, then
repeated once with greater numeric pressure and its fixed layouts shifted.
The second climax is the end of the game. A fixed endpoint makes every score a
comparison over the same maximum course instead of rewarding whoever can keep
an endless run alive longest.

The run has a life allowance, an extra life awarded at a threshold well
above a beginner's first attempt and periodically thereafter, initials entry,
and a persistent local score table. Clearing the final climax pays a deliberately
small remaining-life bonus: survival matters at the margin, but cannot outweigh
the risky chain play that produces the main score. Initials entry is earned only
by placing on that table; a run below it proceeds directly to the rankings rather
than asking for a name that will be discarded. During initials entry the player
navigates a visible character board, with explicit delete and finish choices,
while the score table remains visible below it. Every ranking row also records
the furthest round reached and distinguishes a completed run. Score remains the
primary ordering; completion and progress decide only exact score ties.
Recognition, progress and the target to beat share one screen instead of being
separated into consecutive chores.

## 9. Learning Curve and Teaching

The game has exactly one non-obvious verb, and playtesting showed that neither
the verb nor two of its rules were discoverable from play. The teaching load is
therefore carried by presentation, in this order:

1. **An attract demo that plays the game properly** — including the hoarding
   strategy, so the player sees patience rewarded before they ever hold the
   controls.
2. **A how-to screen that animates the verb**: approach, press, launch, chain.
   Static text did not work; the loop does.
3. **A live marker on the object the action would hit**, plus an indicator of
   where it would fly, driven by the *same* query the action itself uses so the
   two can never disagree.
4. **A control reminder during the opening round only.**
5. **A one-line READY lesson for each fixed actor before its solo debut.**

## 10. Presentation Principles

The recurring defect in this project was a rule that was correct in the
simulation, verified by automated checks, and **never drawn on screen**. Four
separate playtest complaints were all this same class. The principles that came
out of it:

- **Every rule that changes the player's decision must have a persistent
  readout.** Not a warning that fires once the situation is already bad — a
  gauge that fills before it.
- **State the goal continuously, not once.** A target announced on a pre-round
  screen and then hidden makes the round appear to end arbitrarily.
- **Show a decaying reward before it is awarded.** A post-round speed bonus
  needs a live, non-failing gauge so the player can decide whether more setup
  time is worth spending.
- **Keep persistent instruments in one cabinet strip.** Score, progress,
  crowding, multiplier, time value and lives must share a stable grid outside
  the playfield instead of claiming new pieces of action space as they are
  added.
- **Reserve brighter colour variants for events, not objects.** Persistent
  actors and gauges use one stable base colour per role; brightness changes
  belong to brief impacts and milestones. Motion and geometry carry ordinary
  state changes.
- **Prefer a glyph over a word.** A count next to a miniature of the object being
  counted needs no language and no legend.
- **Distinguish states by more than presence.** Ready-and-aimed, aimed-but-
  recharging, and armed-by-whom are all distinct and all colour-coded.
- **Threat footprints are drawn before they are lethal**, sized to the actual
  danger, so "get out of this circle" is a readable instruction.
- **A miss preserves its cause long enough to learn from it.** Once danger is
  defused, the one object or blast boundary that actually touched the player
  remains highlighted through the miss ceremony; unrelated live hazards do
  not remain and cannot be mistaken for the cause.

Automated value assertions cannot catch this class of defect. Screenshots and
play can.

### Sound obeys the same principles

Sound is a second instrument panel, not decoration, and the readout principle
above applies to it unchanged:

- **The music reads a gauge the player is already watching.** Play has one
  piece of music and it responds to exactly one thing: how crowded the field is
  against its cap, the same quantity the crowding gauge draws. The initials
  screen has its own, and it responds to the countdown that screen already
  shows. The score is written by the situation the player is in; letting the
  field fill up, or letting the clock run down, is heard as well as seen.
- **Where a second piece of music exists, it is the first one answered.** The
  initials screen is the field's phrase inverted — the same figure resolved
  upward instead of falling. One cabinet, two moods, not two soundtracks.
- **A fuse is heard before it fires.** The alarm that announces a field arming
  itself is not the first warning. The interval before it is ticked out,
  accelerating and rising, for as long as the crowding condition is held.
- **The player's own voice is reserved.** One channel carries nothing but
  control feedback and cabinet rewards, so the answer to a press can never be
  taken by the music or by the field's own noise.
- **Under load the music yields and consequence does not.** When more sounds
  want the board than the board has channels, control feedback and danger win,
  causal consequences next, ambience and music last. A cascade thins the music
  out; the music never thins the cascade.
- **Contour carries meaning; loudness does not.** Opposed events are opposed in
  shape — absorbing glides down and discharging glides up, a shove falls and a
  respawn rises — so two sounds stay distinguishable when they arrive together.
- **Silence is part of the arrangement.** Music belongs to the two screens
  where the player is doing something — playing, and entering a name. The ready
  screen, the protected cash-out, the tallies, the miss, game over, the table and
  the whole attract cycle carry none. The moment the music stops is itself
  information: it is how the player hears that the controls have been taken
  away.
- **A rising chain is heard rising.** The streak has a pitch, so a long chain is
  audibly a long chain before the score column confirms it.
- **Rare ceremonies receive complete punctuation.** Final completion has a
  cadence distinct from an ordinary round clear, and mechanical count-up ticks
  wait until a reward phrase has finished instead of cutting it short.

## 11. Room for Reinterpretation

Freely changeable without touching the design:

- **The fiction.** Nothing depends on the objects being mines. Any theme where
  an inert thing becomes dangerous once disturbed works.
- **The harmless actors' identities and exact pressures.** One must make
  hoarding costly by consuming material and returning danger; one must
  rearrange material into visible local concentrations without changing its
  count; one must delay and spatially widen a chain without changing its cause
  or becoming a repeatable relay, must impose a continuous cost on the ground it
  stands on rather than waiting to be used, and must give the wait back as
  something worth having **but only to a player who caused the wait** — what it
  gives back is a reward and follows authorship like every other reward. Their
  fiction and precise motion are open.

  That last clause is not decoration. An earlier version of this bullet listed
  the first four requirements and omitted the fifth, and a blind-restoration
  gate found that a reinterpreter working from this section — the section
  addressed to reinterpreters — would build an unconditional loader and believe
  they had preserved everything that mattered.
- **The escalation levers.** Which parameters scale, and how fast, is tuning.
- **The exact length of the fixed run**, and the round names and personalities,
  provided the mix-not-magnitude principle, complete repeated arc, placed
  breather and final climax survive.
- **The visual style** entirely.

Changeable only with care — these carry the design:

- The identity of the scoring object and the killing object.
- Super-linear chain payout.
- The causality invariant, **including its application to effects that hand the
  player an advantage without paying any points**.
- The two shover-safety rules — and specifically that **"cleared" is a
  separating test, not a distance test**. An object that is far away but closing
  has not cleared. Implementing this as a radius or a timer looks correct, passes
  casual play, and restores the exact trap the rule exists to remove, visible
  only to a player who holds their movement direction through the push. This
  clause is spelled out here because it is the single most reimplementable-wrong
  rule in the document and a summary that says only "the two shover-safety rules"
  has already proved insufficient.
- The crowding limit as the anti-patience pressure.
- A fixed score-attack endpoint after the table has repeated at higher pressure.

## 12. Recovery Guidance

If you are rebuilding from this document alone:

**Treat as unspecified** (any reasonable choice is fine): every numeric value —
speeds, radii, reach, delays, streak cap, quotas, bonus sizes, extra-life
thresholds, round count and names; the field's aspect ratio and resolution;
the input device and key bindings; the audio palette; the engine.

**Safe to assume** (these are conventional and were chosen without deliberation):
a fixed-screen playfield with reflecting walls and edge spawn points; a small
life allowance; a ready screen, a clear screen, a final-clear screen, a miss
screen and a game-over screen; three-character initials with a timeout; a top-five local table with a
factory default set; a colour ramp that reserves the alarm colour for genuine
threats.

**Restoration priority** — build in this order, and verify each before adding
the next:

1. Inert field, the push verb, arming, and chain propagation. Nothing else
   matters if the cascade does not feel good.
2. The streak value and its decay.
3. The causality invariant. Add this *before* tuning anything, or every
   measurement you take afterwards will be wrong.
4. The two shover-safety rules and the threat footprint. **Build "cleared" as
   separating-and-distant, never distance alone** — see §6 and §11; a distance
   test passes every casual check and reintroduces the trap.
5. The crowding limit, its gauge, and its staggered collapse.
6. The material-consuming harmless actor.
7. The material-gathering harmless actor.
8. The finite delayed-blast relay and its full pre-release footprint.
9. Round quota, repeated round table, bounded scaling and fixed endpoint.
10. Ceremony screens, extra lives, the small final life bonus, initials, and
    the score/progress table.
11. Attract demo and how-to screen.

**Verify in this order, and never skip step 3**: does it run; do the rules match
this document; do the degenerate policies lose badly; does a screenshot of every
screen show what it should.

## 13. Extraction Note

This document was abstracted from the reproduction spec, which was itself
written from the implementation.

It has now been through an independent blind-restoration gate (2026-07-30): an
isolated agent was given this text and nothing else — no source, no spec, no
repository access — and asked to reconstruct the reproduction layer and grade
what it could not recover. **Verdict: weak-pass.** Every rule this document
calls load-bearing came back recoverable and unambiguous, including the two
shover-safety rules with their non-obvious "cleared means separating, not
distant" predicate, and the relay's full state machine. Three things did not:
the arm-versus-detonate propagation semantics, armed-object behaviour at the
wall, and quota accounting for field kills — the first two being the *core loop*,
which the recovery guidance below calls the thing that matters most. §1 and §5
were amended to state all three.

The gate's sharpest finding was about the relay's author-conditional loading.
Asked what it would actually have built, the grader said **unconditional** — the
same error the implementation made — and classified the rule as "findable, not
unmissable": stated once, in a subordinate clause after an emphatic
unconditional half, and absent from all four places this document designates as
rule summaries. The relay rule list, §5, §7 and §11 were all amended. The
authors' prior belief that they had made it unmissable was wrong, and that
belief being wrong is the reason to keep running the gate rather than
self-auditing.

The repairs were then **re-gated against a fresh reader** who had not seen the
first report. **Verdict: pass.** It found the relay's author-conditional loading
now stated in six places including the bolded rule list, §7 and §11, and
classified it unmissable; and it confirmed the propagation, wall and quota
questions settled. It raised three narrower residuals — the protected cash-out's
behaviour when the quota is met by a collapse, the apparent collision between
§5's widened test and the gathering actor's unconditional behaviour, and the
shover-safety predicate appearing in prose but in none of the summary lists.
All three were then fixed in §8, §5, §6, §11 and §12 respectively. **Those
last fixes have not themselves been re-gated.**

The second grader noted one thing worth acting on directly: several of the
strongest reinforcements above are *commentary about the gates*, which is
exactly what an editor would strip when tidying this document for distribution.
So, explicitly:

> **If you remove the gate history from this document, do not remove with it:**
> the fourth item of the relay's finiteness list; the "Idling next to the
> delayed relay" row in §7; the causality clause in §11's relay bullet; the
> separating-not-distant clause in §11 and §12. Those are rules. Everything
> around them explaining which gate found them is not.

A sibling extraction log records what was abstracted away, what was preserved,
and what was added as recovery guidance.
