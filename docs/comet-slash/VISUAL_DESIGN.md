# COMET SLASH — Visual Design

**Concept-Derived Visual Tags**: `neon-wake`, `luminous-geometry`, `peripheral-starflow`

## 1. Visual Concept

**Slip past saturated comets crossing dark space by a hair's breadth in an incandescent ship, and slash off their tails.**

The expressive register is abstract / minimal. Rather than adding faces or ornament, mass, danger, and reward are conveyed through color layers, trajectories, and brief flashes of light.

## 2. Palette Roles

Single colors in crisp-game-lib do not glow, so key objects are drawn in 2–3 layers: "high-saturation halo → role-color body → `light_*` core". `white` is not used because it blends into the theme background.

| Role | Halo | Body/Core | Meaning |
|---|---|---|---|
| Player | cyan | light_green + light_yellow core | The one and only protagonist |
| Purple comet | purple | light_purple + light_cyan accent | Predictable danger |
| Red comet head | red | light_red + yellow core | Homing danger. red is never used on ordinary tails |
| Warning | purple | light_purple + yellow direction | Future intrusion |
| Reward | yellow | light_yellow | Slash, crystal, score |
| NEAR | cyan | light_cyan | Pass at 16–22px |
| CLOSE | yellow | light_yellow | Pass at 11–16px |
| RAZOR | red | light_yellow spark | Pass at 8–11px |

## 3. Redline Visual Contract

- Make the radius at which the display appears and the outer edge of the scoreable band the same **22px**. Do not create a display-only band that cannot score.
- Do not show the risk tier circle or label while approaching. Only after safely passing the closest point do `TIER READY` and the scoreable-tail glow appear, indicating a 24-tick window in which the bonus can be claimed.
- `NEAR = cyan`, `CLOSE = yellow`, `RAZOR = red`. Tier names and colors are shared across the score popup, the post-pass tail, and the SE.
- Once the closest point is passed, the entire tail burns in the confirmed tier color for 24 ticks. If the tail is cut before that, only the normal score is granted, and `PASS FIRST` after the cut explains why no risk bonus was awarded. When it is awarded, `TIER BONUS +N` is shown frontmost and on-screen.
- The 8px collision radius is not a scoring band. Entering it forfeits the redline.

## 4. Object Rendering

- Player: a thin cyan outline, a light_green hull, a yellow core, and yellow/cyan thrust flames. Four directional sprites are produced by rotating the generated 12×12 right-facing hull in 90-degree steps.
- Comet head: drawn as the generated 12×12 sprite alone, with no solid square behind it and no core overpainted at the center. The normal type is a purple crystalline shape and the tracker a red split-jaw shape, so their silhouettes differ even without color. The red ring just before contact is kept, and the flash right after going naked is a 1px ring.
- Tail: a blue 7px halo, cyan 5px body, and light_cyan 2px accents on the three segments nearest the head, shared by all species. Red comets also use the same scoreable-tail colors until a tier is confirmed; red tail glow is reserved for an actionable RAZOR. Non-scoring debris after a cut shrinks to 3px or less as dim `light_black` + a `light_yellow` glint, so it never shares the color or silhouette of a surviving tail.
- Warning: purple 9px halo, light_purple 5px core, and a yellow dot showing the direction of travel.
- Naked head: a sparse, fast trail in dim `light_black`, clearly distinct from a scoreable tail, plus a short expanding ring. Hit sizes are unchanged.
- Ship break-up: on a miss the ship is not erased in a single frame. The intact hull stays visible for the duration of the hit stop and breaks into 7 pieces the moment the stop ends. The fragments use the ship's own cyan/green (a separate vocabulary from the dim `light_black` of cut debris), and their angles are fixed rather than drawn from `gameRnd` — advancing the seeded spawn stream would stop the same seed from producing the same comets. `OUCH!` appears only after the fragments have scattered from the center (tick 26 onward), so the burst and the text never overlap within a few px.
- Multi-cut announcement: a swing that reaches two or more comets multiplies its whole score, and says so in the empty band under the HUD (`DOUBLE CUT X2` / `TRIPLE CUT X3` plus the bonus it added), not at a cut site. Within a 24px arc the swing's own `+N` chips are already on top of each other, so a third line there would only be illegible; the banner also holds still instead of drifting, the way `READY!` does. The ship keeps the spatial half of the message: the wide reward ring, the sparks, and the stop all happen there. It uses the reward yellow/light_yellow rather than a new hue, because every other color already names a species, a risk tier, or the player — the ring's position on the ship, unique among reward rings, is what separates it. When a third comet upgrades a multiplier that is still on screen, the banner is rewritten in place rather than stacked.
- Background: low-density blue far layer, purple mid layer, and a few cyan near-field stars. Density at the center is never increased.
- HUD: score in cyan, HI in standard purple, and wave and remaining lives in standard yellow; the lowercase letters of score/HI/wave carry a 1px blue keyline so their outlines survive over stars and effects. `black`, which inverts to white in the dark theme, and `light_purple`, which sinks into the background, are not used for HUD text. The bottom-left row counts the stock — the ships still waiting, not the one being flown — so it drops to empty on the last life and the player can read how much is left without subtracting themselves out of it. It does not reuse the player sprite; it uses a HUD-only standard-yellow sprite.
- Spawn preview: the row of dots at the top center shows only the quota not yet spawned. Queued warnings use the actual species spec — normal = light_purple, red = red. cyan is the tail color shared by all species, so it is never used for species display. Quotas whose formation/species is not yet chosen are neutral blue; alternating index colors or the count of active comets must not fabricate a false species preview.
- Title masthead: `COMET SLASH` is drawn at 2× scale in light_cyan with a 1px blue keyline in 8 directions. Since it shares a color range with the cyan tails in the demo, hierarchy comes from letter size and the dark keyline rather than from hue. A 1px-offset purple shadow is not used — its luminance is too close, so it only smears the outline.
- Attract overlay: the title, HI, and start prompt stay fixed, while how-to-play and `TOP PILOTS` alternate every 8 seconds. Neither stops the demo, and no translucent panel is used. When the ranking is empty, `NO RECORDS YET` is shown instead of blank space.
- Pause overlay: no backing panel; the frozen game screen stays visible. The heading uses a purple shadow + yellow and the control guide a blue shadow + cyan, securing legibility through a 1px positional offset rather than relying on `light_*` colors.
- Clear ceremony: a clear is not a death, so it avoids the vocabulary of death. Where a miss claims a single burst ring at the center, a clear launches multi-colored shells off-center with staggered timing and lets the sparks fall under gravity. The ship is not erased and stays controllable (during a wave clear only movement and swinging remain — no hit detection and no spawning). Text during the ceremony is split into three lanes: top (banner), middle (1UP), and bottom (bonus), never stacked within a few px.  For ALL CLEAR the tally table occupies the center, so fireworks are launched in the left and right margins and the 1UP the tally awards is also shifted into the left margin.
- Ceremony pixels: attract shows a 24×12 comet/slash emblem, 1UP a ringed ship crest, ALL CLEAR a severed-comet crest, and the top ranking entry a star medal. They are used alongside the text as brief visual accents, not as replacements for it. The 1.25-second wave clear carries no crest: if the same crest appeared every wave, the ALL CLEAR crest would lose its rarity and the ceremony marking a completed run would look no different from a single wave break.

## 5. Feedback Mapping

| Event | Visual response | Strength |
|---|---|---|
| Normal cut | Local spark + small ring | Low |
| Long cut | yellow/cyan particles + medium ring | Medium |
| Redline armed | Tier-color circle + tier label | Decision-critical |
| Redline claimed | Tier-color tail, popup, expanding ring | High |
| Multi-cut (one swing, 2+ comets) | Wide reward ring + sparks on the ship, plus a named banner in its own lane | High |
| Full slash / naked | yellow contracting flash + fast trail | High |
| Miss | 8-tick stop → red/purple burst ring + ship break-up | High |
| Wave clear | Staggered multi-colored fireworks (shell ring + falling sparks) | Medium |

Cap the number of simultaneous rings and use them for rendering only. They never alter position, collision, or the input buffer.

### 5.1 Hit Stop

The weight of an impact is expressed by **stopping the world**, not by shaking the screen. Raster boards around 1980 could not shake the screen itself and answered big events with a few frozen frames. Camera shake is outside that era's vocabulary, and in a game that reads distances against an 8px collision and a 22px scoring band it also hurts legibility, so it is not used.

| Event | Stop | Reason |
|---|---|---|
| NEAR claimed | 0 | The most frequent tier. Stopping here would break the read on the next dodge |
| CLOSE claimed | 3 | |
| RAZOR claimed | 6 | The rarest on the cutting side |
| Full slash / naked | 4 | |
| Multi-cut | 6 (+1 per comet beyond the second) | Rarer than either, since it has to be set up before the swing. Never exceeds the miss stop |
| Miss | 8 | The longest. The intact hull stays visible during the stop and breaks apart the moment it ends |

- The stop affects rendering only. Positions, timers, and hit detection do not advance at all; during the stop the screen simply redraws the same state.
- Swings pressed during the stop are held and fire on the first tick after resuming. A stop lands right when the player is "deciding the next dodge", so eating the input would be a penalty. Buffers that would cross a wave clear are discarded, however.
- No stop occurs in the attract demo, so the rendering path that overlays the title and other text is never halted.

## 6. Readability Acceptance

- Even in a still frame with the HUD hidden, player / head / tail / warning are identifiable within 2 seconds.
- Entering the circle always makes at least `NEAR` a scoring candidate, and the transition to CLOSE/RAZOR is legible from color and label.
- Even at peak congestion, head cores and the player core are not buried in particles.
- The danger response is stronger for a redline success than for a normal cut, and stronger for a miss than for a redline success.
- Key effects fade in roughly 18 ticks and do not accumulate.
- Every stop always drains to 0, and the world moves not a single px during it. Stop length increases in the order NEAR < CLOSE < RAZOR.

## 7. AI-Generated Look Suppression Rules

### 7.1 Visual Hierarchy Rules

- Protagonist: a three-color ship of cyan halo + green body + yellow core.
- Threat: a species-colored halo plus the shared high-luminance head core.
- Reward: yellow/light_yellow crystals separating from the tail, and a tier-color ring.
- 2-second recognition check: the protagonist, the instant-death head, and the safe tail must be distinguishable without the HUD.

### 7.2 Limits on Familiar Template Symbols

- Adopted familiar elements (max 2): stars, warning blink.
- Replaced unique element: the generic circular near-miss indicator is replaced by a "glowing wake" in which the confirmed tier transfers to the tail.

### 7.3 UI-Independent Feedback

| Event | Non-UI visual response | Intensity |
| :---- | :--------------------- | :-------- |
| Score | Crystals, local ring, severing | Low/Med |
| Damage | red/purple burst, ship disappearing | High |
| Near miss | Transition from tier circle to same-colored wake | Medium |

### 7.4 Composition and Gaze Guidance

- Initial focal point: the player's three-color core.
- Visual flow: warning direction → head core → trailing wake → slash arc.
- Anti-center-clutter implementation: keep near-field background stars few, and push long decorative trails out to the periphery.

## 8. Asset Handoff

- Kept procedural: rings, trails, warning, particles, stars, HUD.
- Generated PNGs: store the title emblem, the player's 4 directions, 2 comet species, and 3 ceremony icons under `assets/sprites/`. Store the raw, cutout, and pixel intermediates, the prompt records, and the palette under `assets/source/`.
- Runtime: crisp-game-lib has no documented PNG API, so palette pixels from the verified PNGs are embedded into `PIXEL_SPRITES` and drawn synchronously with the native `box`. The source paths and dimensions of the PNGs and the runtime sprites can be read from `spriteContract()`.
- Acceptance criteria: player/head must read as their role and facing at 12px. The title emblem is 24×12 and ceremony icons are 12×12. All PNGs keep an alpha channel, transparent corners, and 8 colors or fewer, and change neither hit radii nor input.
