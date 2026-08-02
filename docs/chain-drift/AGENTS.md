# AGENTS.md — working on CHAIN DRIFT

Instructions for anyone (human or agent) extending this game. Read this before
touching `main.js`.

## Repo shape

One game, one file. `main.js` holds the whole simulation, HUD, phase machine,
attract bot and debug handle. `index.html` is a shell that pins the engine.
There is no build step and no bundler — it is a classic script, deliberately, so
that top-level state stays reachable from a browser console and from probes.

Three documentation layers, with different jobs. Keep them that way:

| File                         | Job                                                                        | Update it when                                                              |
| ---------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `docs/chain-drift-design.md` | Intent. No constants, formulas, or identifiers.                            | The _design_ changes — a new invariant, a changed decision the player makes |
| `docs/chain-drift-spec.md`   | As-built behaviour: constants, tables, formulas, measurements, bug history | **Any** behaviour change                                                    |
| `docs/extraction-log.md`     | Audit trail between those two                                              | You move something between layers                                           |

If you add a constant, it belongs in the spec, never in the design doc.

## Entrypoints

Start the server first; every harness drives `http://localhost:8231`.

```bash
npm run serve            # static server (leave running)
npm run gates            # smoke + probes + audio + ceremony + full runs  <- the required gate
npm run fullrun          # two whole autopilot runs, one cleared and one lost
                         # (also inside gates). It takes the frame clock off the
                         # display -- see the header of tools/fullrun.mjs -- so a
                         # full 18-round run costs ~9 s instead of ~7 minutes.
                         # It is the only gate that reaches every round by
                         # playing. It does not cover audio: the autopilot never
                         # presses anything, so the audio path never wakes up.
npm run audio            # the audio contract alone (also inside gates)
                         # `-- --manifest /tmp/kit.json` also writes the derived
                         # manifest, for the external validator in the
                         # building-era-authentic-game-audio skill. That check is
                         # optional (it needs the skill installed) and is not in
                         # `gates`; its invariants are ported into tools/audio.mjs.
                         # If you do run it and it prints nothing, it did not run.
npm run balance          # idle vs mash vs bot policy comparison
npm run botrun           # round pacing, extend timing, score rate
npm run repro-selfhit    # regression for "shoving killed the shover"
```

`npm test` is `npm run gates`.

## Definition of done

A change is not finished until all of these are true:

1. `npm run gates` passes with **zero** console errors.
2. Any rule you added or changed has a **probe assertion** in `tools/probe.mjs`
   with a concrete expected value from the spec. A probe that only checks "no
   error" does not count.
3. You have **looked at a screenshot** of every screen your change can reach.
4. If you touched scoring, spawning, or anything a player could exploit,
   `npm run balance` was run **at least three times** (see "Measure, don't
   guess").
5. `docs/chain-drift-spec.md` reflects the new behaviour.

## Non-negotiable rules

These are load-bearing. Breaking them produces bugs that pass every automated
check.

### Causality

Every armed mine carries a `src` tag (`"player"` / `"overload"`), and blasts
propagate their tag to what they arm. **Only player-caused detonations pay the
multiplier.** Any new scoring, streak, or bonus mechanism must ask "who caused
this?" before paying out. This rule is what stops idling from being a viable
strategy; it was worth a 25x difference in idle score.

### Shover safety

A mine armed by the player's own shove, and the first blast of a mine that never
cleared the player, cannot harm that player. Shove reach is much shorter than a
blast radius, so without this the act of shoving is a coin flip. **Punish the
choice, never the button press.**

### One source of truth for the SHOVE target

`findShoveTarget()` is called by both the button handler and the on-screen
marker. Never re-implement the query in the drawing code — the marker and the
action must be incapable of disagreeing.

### Mid-frame mutation

`hitPlayer()` defuses the field: it empties `blasts` and splices armed mines out
of `mines`. Any loop over those arrays must therefore re-check `simActive` (or
bail out) after anything that can call it. This already caused one crash; there
is a regression probe for it.

### The audio boundary

Gameplay code emits **event names**; it never names a waveform, a pitch or a
voice, and it never touches an AudioContext. Everything between the event and
the hardware lives in the `audio` section of `main.js`, which is delimited by
banner comments — `npm run audio` fails if a Web Audio call appears outside
them. Adding a sound means adding an entry to `AUDIO_EVENTS` and a program to
`AUDIO_KIT`, then emitting the name from the moment it belongs to.

The registry entry is `[role, heardUnder]`, and **`heardUnder` is not a
comment**: it names the BGM cue the sound can actually be playing over, and the
gate uses it to decide which music that sound has to be measured against. Get it
wrong in the safe direction (`null` when the music is in fact running) and you
have added a sound nothing checks. If a new sound can be heard during play, it
is `"drift"`; on the initials screen, `"entry"`.

A moment that should stay silent is declared `"none"` in `AUDIO_EVENTS` rather
than left out, so the next person can tell a decision from an oversight. An
emission of an undeclared name is not a crash and not a sound: it lands in
`CD.audioUnknown()`, which the gate asserts is empty.

The board has **four monophonic voices** and can start one note per voice per
frame. That is a real constraint, not bookkeeping: a new sound competes with the
ones already there, and the priority order (control > danger > consequence >
cabinet > BGM) decides who is dropped. Author sibling sounds together and check
`CD.audioNotes()` under a cascade, not in isolation.

`p1` belongs to the player. Do not put music on it.

**Peak is not loudness.** A four-frame click and a one-second four-voice phrase
reach the same sample value and are nowhere near each other to the ear, so the
gate measures a `sustain` figure — the loudest `sustainWindowSec` slice of the
render — beside the peak. The peak checks decide whether a sound can be _heard_
over its cue; the sustain checks decide how _loud_ it is against the rest of the
cabinet, and `ceremonyOverMusicMaxDb` caps how far the ceremonies may sit above
the arrangements. Raising a jingle's gains until it "reads" is how a ceremony
ends up louder than the game; check both numbers.

There are two BGM cues, `drift` (play) and `entry` (initials), keyed
`cue:section`. A cue is chosen by the phase and an arrangement by one gauge that
is **already drawn on that screen** — crowding for `drift`, the entry clock for
`entry`. If you add a third, hold that rule: the music may only read something
the player can already see, or it becomes a hidden state.

### Engine contract

- **No audio library.** `options.isSoundEnabled` is false and `index.html` loads
  crisp-game-lib only. The game synthesises everything itself, so `play()`,
  `playBgm()` and the algo-chip / sounds-some-sounds path are all dead. Do not
  re-add them to "get sound working" — sound already works, through
  `audioEmit()`.
- `title` and `description` are **left undefined** on purpose. That keeps the
  bundle's `isNoTitle` true so `update()` runs from frame 0 and this file owns
  the whole arcade cycle. Defining either one hands control back to the library
  and breaks attract mode.
- **`end()` is never called.** Game over, name entry and the score table are our
  own phases.
- `options.isShowingScore` stays **off**; we draw score and HI ourselves, because
  the library only refreshes them inside `initInGame()`.
- Read named actions through `keyboard.code[...]`. `input.isJustPressed` is the
  OR of the pointer and _every_ key, so it fires on movement presses. It is
  correct only for "any input starts the game".
- Programs are frame-scheduled note lists; emit them while the update loop is
  still running.
- Dependency versions in `index.html` are pinned to versions **verified against
  the npm registry**. Do not invent or bump a version without checking it.

## Measure, don't guess

This project has a working measurement rig. Use it instead of reasoning about
balance.

- **`CD.setAutopilot(true)`** runs the attract bot in the play phase — for
  pacing, extends, and score-rate questions.
- **`CD.setAutopilot("naive")`** runs a policy that walks at the nearest mine,
  shoves whenever the marker is lit, and never retreats. Use this for fairness
  questions: the attract bot flees too well to die and will tell you nothing.
- **`CD.deaths()`** returns every death with its cause and how many frames after
  the player's own shove it happened. "Is this unfair?" is a measurable claim.
- The balance harness compares **policies**, not runs. Judge the ratio
  (`idle/bot`, `mash/bot`), and run it several times — both distributions have
  long right tails and a single run proves nothing. A known ~20 % of idle runs
  land near 0.18; that tail is documented and accepted in the spec.

## The defect class to watch for

Four of the nine bugs this project shipped and fixed were the _same_ thing: a
rule that was implemented correctly, verified by probes, and **never drawn on
screen**. The controls, the overload trigger, and the clear condition were all
invisible to the player while being perfectly correct in the simulation.

Value assertions cannot catch this. When you add a rule that changes a player's
decision, add a persistent readout for it in the same change — a gauge that
fills _before_ the situation is bad, not a warning that fires once it already
is — and take a screenshot.

## Probing

`window.CD` is a deliberate debug handle: state getters, phase and round setters,
entity injection, and measurement hooks. Keep it in sync when you add state — a
rule buried in a frame-local variable is unverifiable.

When a probe fails, decide **implementation bug / spec ambiguity / probe
artifact** before editing game code. Two probe artifacts have already been
mistaken for game bugs here: injected mines stacked at one coordinate
annihilating each other, and calling `CD.startGame()` before the first frame
(the boot frame runs `startAttract()` and clobbers it — wait for
`CD.state().phase === "attract"` first).

## Out of scope unless asked

- Mobile / pointer controls. The game is keyboard-only by request; the attract
  bot exists because replay was also declined.
- Additional image assets. Gameplay visuals are code-drawn; the generated title
  logo is the sole raster exception.
- Audio assets. Everything is synthesised in-file.
- Scrolling, hand-built levels, a second action button, or an ending. These are
  the genre constraints the design was generated under; see
  `docs/chain-drift-design.md` before proposing any.
- Enemy/obstacle types beyond **four**. This limit was three; the project owner
  relaxed it to four explicitly on 2026-07-28 so that a second non-lethal actor
  can be added alongside the scavenger. The relaxation is a one-step, deliberate
  exception to a genre constraint, not an invitation to keep adding actors —
  going past four needs the same explicit decision again.

  Current count is 4 (mine, scavenger, LODESTONE, CAPACITOR; a blast is an
  effect, not a type), so both exception slots are now filled. Any future actor
  requires another explicit limit decision and must still satisfy the
  non-negotiable rules above — in particular it must carry a `src` tag if it can
  cause a scoring event, must be frozen during `chainout`, and must have a
  persistent on-screen readout if it changes a player decision.
