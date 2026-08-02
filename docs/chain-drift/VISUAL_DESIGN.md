# Visual Design: CHAIN DRIFT

**Concept-Derived Visual Tags**: `#render-relay-glyphs`,
`#geometry-directional-circuitry`, `#motionviz-chain-pulse`

## 1. Visual Concept

**A restless 1980 relay board whose signals become lethal when the player closes
the first circuit.** The image stays black-field, hard-edged and integer-snapped.
Energy is shown by relay rotation, expanding traces and border pulses rather
than bloom, transparency, camera motion or asset-heavy effects.

## 2. Color Palette

| Role | crisp color | Usage |
|:---|:---|:---|
| Player / control | `cyan` | Directional interceptor, ready pip and lives |
| Inert material / structure | `blue` | Harmless relay mines, frame, gates and secondary HUD |
| Player-authored danger | `red` | Armed mines that carry multiplier value |
| Field-authored danger | `purple` | Overload chains and scavengers |
| Reward / chain energy | `yellow` | Targeting, player blasts, score values and gauges |

`light_black` is the sole persistent exception, used as visible neutral grey
for empty gauges, disabled controls and tertiary copy. `light_yellow` is
restricted to the brief multiplier-milestone frame accent. Other chromatic
`light_*` variants are not part of the persistent palette.

## 3. Object Rendering Specifications

- **Player:** an outlined directional interceptor with an always-readable nose.
  Its separate nose lamp dims during SHOVE cooldown.
- **Mine:** a four-prong relay glyph. Inert relays are subdued blue; armed
  relays rotate between orthogonal and diagonal phases in steady red or purple.
  The full danger footprint blinks, not the object colour.
- **Scavenger:** an open-jaw collector whose mouth points toward its target.
  Growth increases the jaw span rather than merely enlarging a generic box.
- **Blast:** a cause-colored expansion ring. High-value player blasts add a
  sparse cross trace; the danger footprint remains unobscured.
- **Lodestone:** a fixed diagonal four-pole anchor inside a broken ring drawn at
  its exact field radius, with inward spokes to the inert mines it is gathering
  and a blue core that grows with the count held. The ring is neutral grey while
  the field only gathers, and takes the hazard colour of a live chain link it is
  bending — the one shape permitted to change role colour, because it is
  reporting whose ordnance the field currently has hold of. The interior of the
  ring is reserved for the pile, so no per-mine indicator is drawn there.
- **Capacitor:** two opposed plates with four charge cells inside a broken
  diamond drawn at its exact intake radius — which is also its discharge radius
  and its ordnance-pull radius, so one shape states the whole spatial rule. Three
  states distinguished by more than presence: **open** (neutral outline, empty
  cells, taking the hazard colour of a live link it is bending, on the same
  licence the lodestone ring has); **charging** (hazard outline, cells filling,
  blinking near release, plus a second larger neutral-grey diamond marking the
  reach of the loading gather); **recovering** (neutral outline, cells draining
  in structure blue, intake shut). The outer gather diamond is never hazard-
  coloured: the lethal footprint is the inner one, and colouring the outer boundary
  red would overstate the danger area by more than half its radius.
- All world glyph origins are snapped to integer screen pixels. Gameplay
  collision state remains authoritative and unchanged.

## 4. Background & Environment

The playfield remains empty black negative space bounded by a thin blue
relay-board frame. Spawn gates are blue edge contacts. A hot player chain
energizes the frame briefly; only multiplier milestones produce a two-frame
bright flash. All persistent instruments occupy a two-row strip above the
frame; no readout may enter the field. No ambient texture is allowed in the
centre of play.

## 5. Feedback Effects

| Event | Visual Response | Tag Reference |
|:---|:---|:---|
| Ordinary score | Small rising yellow number | `#render-relay-glyphs` |
| High-value score | Larger, longer-lived yellow number | `#motionviz-chain-pulse` |
| Player chain | Yellow blast plus escalating frame pulse | `#motionviz-chain-pulse` |
| Multiplier milestone | Two-frame bright frame flash | `#motionviz-chain-pulse` |
| Overload chain | Purple relay and purple blast ring | `#geometry-directional-circuitry` |
| Quota met during overload | Persistent purple `SURVIVE OVERLOAD` while committed purple hazards remain | `#geometry-directional-circuitry` |
| Chain out | Player dims blue, aim lamp goes dark, yellow `CHAIN OUT` while red effects finish | `#motionviz-chain-pulse` |
| Time value | Compact yellow `T+value` and shrinking gauge in the second cabinet row; low value blinks without borrowing red danger colour | `#geometry-directional-circuitry` |
| Damage | Cyan fragments and field defuse; the exact mine or frozen blast edge that touched the player remains source-coloured with a blinking yellow contact highlight through MISS / GAME OVER | `#render-relay-glyphs` |
| Round clear | Two-register cabinet count-up | `#geometry-directional-circuitry` |

## 6. Relationship with Visual Tags

`render-relay-glyphs` replaces generic boxes with a tiny fictional hardware
vocabulary. `geometry-directional-circuitry` makes facing, collection and source
causality visible in silhouette. `motionviz-chain-pulse` reserves the strongest
screen-level response for the game's primary reward: a long authored cascade.

## 7. AI-Generated Look Suppression Rules

### 7.1 Visual Hierarchy Rules

- Protagonist: the only cyan directional silhouette.
- Threat: rotating red/purple pronged relays and their blinking full-size danger rings.
- Reward: yellow authored blasts, rising score, and an energized field frame.
- 2-second recognition check: without HUD text, identify the cyan interceptor,
  distinguish blue inert relays from red/purple armed relays, and see which way
  the purple collector is moving.

### 7.2 Limits on Familiar Template Symbols

- Adopted familiar elements (max 2): expanding blast ring; arcade score digits.
- Replaced unique element: generic square actors are replaced by interceptor,
  relay and open-jaw collector glyphs.

### 7.3 UI-Independent Feedback

| Event | Non-UI visual response | Intensity (Low/Med/High) |
| :---- | :--------------------- | :----------------------- |
| Score | Rising number; high values are larger and persist longer | Med |
| Damage | Player fragments and every live explosive vanishes; only a non-interactive highlighted culprit echo remains | High |
| Near miss | Pre-lethal danger footprint crosses the player silhouette | Low |

### 7.4 Composition and Gaze Guidance

- Initial focal point: cyan player interceptor.
- Visual flow: facing pip → marked relay → launch trace → chain cluster → frame pulse.
- Anti-center-clutter implementation: no background texture; score numbers rise
  locally and expire; all persistent readouts share the two-row cabinet strip.

## 8. Asset Handoff

Gameplay actors, effects, gauges, and instructional diagrams remain
procedural. The title wordmark is the sole raster asset: a transparent
128×24-pixel, four-colour logo designed on an 8×8 tile rhythm for the native
160×144 screen. Its relay nodes reuse the mine's four-prong geometry; cyan and
blue dominate, with yellow and red restricted to the single ignition break.
It is registered as crisp-game-lib external character `a`, which preserves the
engine-owned canvas, nearest-neighbour rendering and no-title boot contract.

Future glyph changes must stay inside the current gameplay footprint, use only
the five palette roles above, and pass the 2-second recognition check at native
160×144 resolution. Future title variants must preserve the exact
`CHAIN DRIFT` spelling, hard pixel edges, transparent background, and a maximum
of five opaque colours.
