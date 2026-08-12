# VOLT KEEPER feel tuning

## Register and baseline

VOLT KEEPER is an abstract, tense electrical machine: dark field, hard geometric
silhouettes, cyan keeper/energy, yellow moving sparks, red danger, green terrain
and reward, purple recovery/scavenger states, and silver structure. Feedback must
stay short and technical rather than bouncy or characterful.

The collision-authoritative shapes remain unchanged. New motion marks, arcs and
particles are presentation-only draws whose collision results are never read.

## Event vocabulary

| Event | Feedback | Reason |
|---|---|---|
| move start / direction change | 3 light-cyan particles + 5px wake | immediate motion confirmation |
| stop | 3 silver particles + 5f settling ring | neutral return to rest |
| ground start | 8 cyan radial particles + 8f expanding ring | confirms the committed catch window without changing its 22px boundary |
| spark spawn | 5 light-red directional particles + 10f red ring | danger becomes live on this frame |
| spark warning | dormant/charged 6x6 edge socket | launch origin and countdown become shape-readable before the existing live-frame burst |
| arrow turn / bumper hit | 2 cyan directional ticks / 4 green impact sparks | absolute redirection and reflected impact remain distinct |
| fast wall hit | 2 light-red scrape particles | only high-speed danger receives wall feedback |
| absorb | cyan/green radial glints, 8/12/16 by spark tier | reward weight follows value and consequence |
| near miss | 3 silver particles + 6f local bracket | weaker than a reward; fires only after the spark exits safely |
| scavenger stopped / arrow lost / arrow restored | green reward / red loss / cyan restore | counterplay, danger and state return use different roles |
| wave surge | 18 green particles + 24f field pulse | strongest positive state change |
| miss | 24 red particles + 12f inset field-frame punch | strongest negative event; no world/collision displacement |
| EXTEND | 18f terminal -> shell -> current HUD assembly | the newly manufactured reserve is visible; cap-only threshold consumption stays silent |
| ATTRACT title | 5x7 yellow circuit letters with one cyan scanning column | cabinet identity gains motion without adding playfield noise |

Deliberate `none`: ordinary wall bounces, free-state idle, recovery completion,
and automatic arrow rotation receive no additional particle burst. Existing shape,
dial, flash or audio already carries those moments, and repeating effects would
turn a busy 12-spark field into noise.

## Budgets and validation thresholds

- Hard cap per burst: 24 particles; common repeated impacts use 2-5. A shared
  same-frame gate caps the whole feedback layer at 48 particles.
- No game-owned particle or trail arrays; all local timers are 5-24 frames.
- Every timer must return to zero and every visual must leave authoritative body,
  catch radius and terrain catch boxes unchanged.
- Input must move or ground the keeper on the first sampled frame.
- Busy play must keep keeper, yellow/red spark silhouettes, cyan value rings and
  green/silver terrain readable; target is at least 55 fps in headless Chromium.
- Runtime gate: idle plus keyboard/pointer input bursts with zero console errors,
  uncaught exceptions or page crashes.
