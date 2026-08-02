# CHAIN DRIFT

A fixed-screen arcade game in the style of 1978–1983 cabinets, built with
[crisp-game-lib](https://github.com/abagames/crisp-game-lib) 1.5.0.

> Inert drift mines are harmless until you shove one.
> The only thing in this game that can kill you is a bomb you armed yourself.

Single screen, 8-way movement plus one button, difficulty that escalates only by
numbers, no ending. Gameplay visuals are code-drawn primitives; the title uses
one generated pixel-logo asset. Every sound is synthesised at runtime — there
are no audio assets or audio library, and the game owns its own four-voice board.

Visual/feel register: restrained geometric 1980 relay hardware. Integer-snapped
directional glyphs replace generic boxes; authored chains alone earn yellow
frame pulses and milestone flashes. Effects are perimeter/local only, with no
camera shake or deformation that could falsify a danger footprint.

## Run it

```bash
npm install          # playwright, used only by the test harnesses
npm run serve        # static server on http://localhost:8231
```

Then open <http://localhost:8231>. The game boots straight into its attract
cycle; press SPACE to start.

## Play

| Action                                     | Keys                          |
| ------------------------------------------ | ----------------------------- |
| Move (8-way)                               | Arrows / WASD                 |
| PUSH                                       | Space / Z / X / J / K         |
| Confirm (ceremony screens, name entry)     | Space / Enter / Z / X / J / K |
| Name entry: move cursor on the letter grid | Arrows / WASD                 |
| Name entry: select letter, DEL or END      | any Confirm key               |

**How it works.** Blue mines drift in and pass harmlessly through you. Walk up to
one — a yellow ring marks the mine PUSH would arm, and a dashed line shows where
it would fly. Press SPACE: the mine arms, rotates, then launches and detonates on
the first thing it touches. Every blast arms the mines around it, so one push can
ripple across the field.

**Score.** Each detonation in your chain is worth more than the last, so one long
chain beats several short ones. Letting the field crowd up first makes the chain
bigger — and the blast wave harder to escape.

**The lodestone.** Some rounds contain a grey anchor inside a broken ring. It
cannot hurt you and cannot be destroyed, and it stands still for the whole
round — but each round puts it somewhere else, and later laps move it again.
Inside that ring it drags drifting mines into a pile, and it pulls live ordnance
off course too, yours and the field's. While it has hold of something armed, the
ring turns the colour of whatever it is bending. Fight next to one and the
launch angle stops telling you where the explosion will be.

**The capacitor.** Other rounds contain a pair of plates inside a broken
diamond. It also cannot hurt you, cannot be destroyed and stands still for the
round, and it also moves between rounds and laps. Any explosion that goes off
inside the diamond never happens there: the plates swallow it whole and fire it
back a second later, from their own position, over a wider area than the blast
you lost — and live ordnance drifting through gets tugged toward the plates, so
a chain fought nearby tends to end up going in whether you aimed it there or
not. The second you wait is not free and it is not empty. It costs you most of
your chain window, and while the cells fill, a wider grey diamond appears and
everything inside it is dragged under the coming explosion. Anything in that
outer diamond will be in the blast when it goes off. So: run, or dive in and
claim the pile yourself before the plates fire. The field's own explosions can
charge it too — but those return without gathering anything. Only your chains
are worth loading.

When the final required mine goes during an OVERLOAD, the purple danger does
not vanish: `SURVIVE OVERLOAD` stays on screen and you remain in control,
vulnerable, until every committed purple mine, blast and stored capacitor shot
has resolved. Nothing new spawns and a second OVERLOAD cannot begin during this
last escape. Then **CHAIN OUT** locks the controls and protects the player while
the red chain already in flight finishes paying out; only that committed
authored cascade can score before the round-clear tally begins.

**Listen to the field.** The play music is a second reading of the FIELD LOAD
bar:
one bass hook at rest, percussion when the field is half full, the hook's answer
when it is nearly at the cap, and a faster, transposed arrangement the moment
anything purple is on the board. Go over the cap and the 60-frame fuse is ticked
out, accelerating, before the alarm — the alarm is never the first warning. The
music runs during play and nowhere else: when it stops, the controls have been
taken away from you. The initials screen has its own tune — the same figure
turned upward — and it picks up the pace when the entry clock is nearly out.
Sound needs one key press to start, so the attract cycle is silent.

**Watch three readouts.**

- The **mine glyph and number** in the top row: how many mines you still have to
  destroy to clear the round. It flashes at five or fewer.
- The **FIELD LOAD** bar: how crowded the field is against this round's cap. Go
  over the cap for a second and the whole field arms _itself_ — those chains pay
  a flat rate and build no multiplier, so waiting for them is not a strategy.
  The smart move during an overload is to shove into the mess and claim it.
- The compact **T+** register in the second HUD row: the bonus you
  would receive by clearing now. Its yellow gauge drains to zero but never
  causes a miss. It keeps draining while you survive a finishing OVERLOAD, then
  freezes during CHAIN OUT while the committed red chain finishes.

A mine you just shoved cannot hurt you while it is still leaving you, and its
first blast cannot either. Shoving into a pack you are standing next to will
still kill you — that is a decision, not bad luck. On a miss, the field is
defused but the one mine or blast edge that actually touched you stays
highlighted through the ceremony, so the mistake is visible.

## Layout

```
index.html            page shell; pins crisp-game-lib 1.5.0 (the only dependency)
main.js               the whole game
docs/
  chain-drift-design.md   design intent, no constants  <- read this to understand it
  chain-drift-spec.md     as-built reproduction spec   <- read this to change it
  extraction-log.md       audit trail between those two layers
  concept-slate.md        the original 5-concept slate this was chosen from
  kiln-row-spec.md        the runner-up concept, never implemented
tools/                harnesses: smoke, probe, audio, ceremony, balance, botrun, repro
shots/                screenshots produced by the harnesses
AGENTS.md             procedures for anyone (human or agent) extending this
```

## Verify

Start `npm run serve` in another shell first — every harness drives the local
server.

```bash
npm run gates      # smoke + spec probes + audio contract + ceremony screenshots
npm run audio      # the audio contract on its own
npm run balance    # idle vs mash vs bot; run it several times
npm run botrun     # round pacing and the score curve
```

See `docs/chain-drift-spec.md` for what each gate proves and the measurements
behind the tuning, and `AGENTS.md` for the rules to follow when changing things.
