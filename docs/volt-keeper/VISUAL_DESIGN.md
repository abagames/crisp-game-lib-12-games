# VOLT KEEPER — Visual Design

## Visual phrase

**A live electrical instrument panel under load.** The field is not a scenic
backdrop; it is a dark diagnostic surface where every bright mark reports a
force, resource, threat, or state change.

Concept-derived tags: `hard-circuit geometry`, `directional discharge`, and
`instrument-panel ceremony`.

## Layout and hierarchy

- The upper 24 pixels are the instrument strip. Score and record occupy the top
  line; multiplier, wave/family, quota/clock and lives occupy the second; the
  capacitor is the widest and most important persistent gauge.
- The keeper and live sparks outrank terrain. Terrain outranks secondary traces
  and ceremony rules. Ceremony text is drawn over the frozen field without a
  filled panel because this theme has no darker panel colour.
- Large effects are reserved for miss, surge and high-value absorb. Routine
  movement and terrain contacts use short, bounded traces.
- Hierarchy by surface: the paired-bolt title mark and exact text own ATTRACT;
  capacitor then wave/quota own the HUD; keeper and sparks own play; terrain and
  neutral feedback support them; thin rules and demo labels are last.

## Semantic colour contract

The game uses crisp-game-lib's `dark` theme on `#090c1b`. In this theme the
palette name `black` renders as the near-white primary ink; `light_*` entries
are half-bright variants. The runtime `VISUAL` object in `main.js` is the source
used by both renderer and tests.

| Role | Colour | Use |
|---|---|---|
| Primary state | `black` | wave/family, HI score, title, ceremony state |
| Energy/player | `cyan` | score, keeper and charge-linked information |
| Reward | `green` | quota clear, charge and energy gains |
| Score reward / warning | `yellow` | multiplier, payout numbers, READY, urgency |
| Danger/loss | `red` | MISS, GAME OVER, short battery |
| Secondary structure | `light_black` | thin rules, paired meter boundary ticks |
| Time | `blue` | wave clock |

`white` is not used because it merges with the theme background. Low-contrast
`light_cyan`, `light_red`, and `light_green` are not used for text. HUD roles
are kept separate from collision-bearing world draw colours; changing this
table must not change any gameplay geometry.

## Shape language and feedback

- Keeper: the code-native **Capacitor Probe**, a two-frame cyan 6x6 pixel
  instrument drawn at 2x. Its outer shell, upward terminal, face-like two-cell
  gap and lower grounding bus never change; one internal current gap moves only
  left/right. Movement rotates that fixed upward-facing front in cardinal steps.
  Ground locks Frame B in cyan, while recover locks Frame A in purple. Existing
  circular grounding/recovery instruments remain outside the sprite.
- Sparks: warm moving hazards; volt rings identify cultivated, higher-value
  sparks without changing their collision silhouette.
- Arrows: directional circuit glyphs. Bumpers: circular reflective machines.
- Scavenger: purple clawed silhouette with a work dial, visually distinct from
  sparks.
- Reward language is an outward glint/burst plus green or yellow text. Danger is
  a red frame punch or red statement. State change is a stable near-white label.
  Near-miss is neutral silver so it cannot be mistaken for reward or damage.

## Element audit and asset handoff

| Element | Representation | Decision |
|---|---|---|
| Title logo | Animated 5x7 circuit-pixel `VOLT`, `KEEPER` subtitle and paired bolts | A cyan current scans the yellow pixel wordmark; the two stacked parts combine once as `VOLT KEEPER` without repeating `VOLT`. It preserves the game-owned arcade cycle without an external asset. |
| Keeper / lives | `characters[]` Capacitor Probe, procedural arcs and motion traces | Two code-native frames replace the generic square without adding an asset path. The 12x12 world draw and 6x6 HUD icons share one silhouette; gameplay still uses the explicit ±6px contact test and 22px grounding radius rather than `char()` collision results. |
| Normal spark | Three-beat procedural bolt | A directional core, alternating side branch and bright leading edge fit inside the 12x12 contact envelope. This replaces the ambiguous yellow square. |
| Heavy / charger | Procedural split-cell / needle-and-tail silhouettes | Heavy exposes two payload cores; Charger exposes its leading point and speed-scaled tail. Both remain tied to live direction and speed. |
| Spark ports | Two code-native 6x6 socket frames | Dormant silver closes into a red charged frame and rotates inward at each edge, making launch origin and timing readable before danger becomes live. |
| Arrow / scavenger | Existing `characters` glyphs | Code-native pixel silhouettes already supply the needed direction and enemy identity with no new runtime asset path. |
| Bumper / volt reward / transitions | Procedural arcs and bounded particles | Radius, stored value and event timing must track runtime state exactly. |
| Generated PNG | None | The existing character array and primitives are smaller, palette-exact and state-aware. PNG loading would not improve role recognition enough to justify another asset pipeline. |

Palette constraints: yellow is electrical potential and score reward, cyan is
keeper/energy instrumentation, red is immediate damage or loss, green is banked
or restored value, purple is scavenger/recovery state, and neutral near-white is
structural state. A normal spark may use yellow and its half-bright leading edge,
but never red or green; a danger statement may never use reward green.

Acceptance in the shipped 256x224 view:

- ATTRACT must show exact `VOLT KEEPER` lettering with paired electrical marks,
  without replacing or bypassing the current arcade-cycle state machine.
- In ordinary and four-spark congestion frames, the two-frame Capacitor Probe,
  live sparks and terrain must remain distinguishable without reading the HUD.
- Cardinal movement must rotate the Probe without diagonal-facing chatter;
  A/B may move current only laterally and must never move its face, terminal or
  grounding bus toward the front/back. Ground/recover remain distinguishable by
  both fixed frame and colour. Zero to four cyan Frame-A HUD icons show reserve
  lives only; the active Probe is represented by its body in the playfield.
  A newly awarded reserve assembles terminal, shell and current over 18 frames;
  thresholds consumed at the five-life cap must not fabricate an icon.
- A normal spark must read as a short, branching discharge with a downstream
  head, not as a yellow square or coin, while staying inside its 12x12 contact
  envelope.
- Important small text must not use `white`, `light_cyan`, `light_red`, or
  `light_green`; secondary `light_black` must remain subordinate to state,
  reward and danger roles.
- HI score uses readable `black` primary ink and changes to reward `yellow`
  while the current score owns the record.
- The quota and clock share matching `light_black` boundary ticks at both ends.
  The paired shape must read as a meter span; the finish tick beside the life
  icons must not be left alone where it can be mistaken for the digit `1`.

## AI-generated look suppression addendum

VOLT KEEPER should avoid soft gradients, glossy panels, bloom haze, decorative
micro-detail, rounded app-card UI, and texture that does not encode play. Prefer
hard pixel geometry, one-pixel rules, discrete palette roles, fixed alignments,
and short procedural effects whose beginning and end are legible. Asset detail
must never compete with a spark path or imply a collision volume that the game
does not have.
