# M1 — Design brief

| | |
|---|---|
| From → To | Claude → Antigravity |
| Gate | 1 (end of Phase 1). Starts Phase 2 for M1. |
| Inputs | [`../PRD.md`](../PRD.md) §6–§9, [`../ASSETS.md`](../ASSETS.md), [`../WORKFLOW.md`](../WORKFLOW.md) §3–§4, `reference/` (local symlink to the family's Google Drive folder) |
| Devices | **Design frame 1920 × 1200 (16:10)**, matching Theia's **Samsung Galaxy Tab S10+** (primary, 2800 × 1752) and both laptops (MacBook M4, Lenovo 14", mouse/trackpad, no touch). **Phones** (Pixel 6, Galaxy A52s, 2400 × 1080, 20:9): the whole frame is scaled to the screen height, and the extra width on each side is decoration only. The house view opens zoomed to a room. Landscape only. |

This brief says **what** each screen must achieve and what it contains. **How it looks** is
Antigravity's call, within the art direction in `ASSETS.md` §2 and the design rules in `PLAN.md` §2.

---

## 1. Global rules (every screen)

- **Theia can't read.** Text appears only as learning content (a digit, a stroke label for parents).
  Every instruction is a voice clip plus a visual cue.
- **Touch targets**: ≥ 72 dp, and ≥ 96 dp for primary actions. On the phone, nothing interactive
  sits within 48 px of the left or right edge, to stay clear of gesture navigation.
- **Safe areas**: interactive content stays inside a centred 1760 × 1080 area of the 1920 × 1200
  frame. Every device always shows the whole frame. Wider screens (phones, 16:9 laptops) add
  decoration at the sides and never crop.
- **Fixed HUD positions**, the same on every activity screen:
  - `HUD-HOME`: bottom left
  - `HUD-SPEAKER`: top left
  - parent-gate corner: top right, small and visually quiet
- **States** to design for every interactive element: `idle`, `hover` (laptop only), `pressed`,
  `active/selected`, `success`, `hint` (glow or pulse), `disabled/locked` (sleepy, never a
  padlock).
- **Laptop cursor**: a child-friendly pointer (a hand or a star) and its pressed variant. 32 × 32
  and 64 × 64 for high-DPI, with the hotspot defined.
- **No failure visuals.** No red X, no shake, no frowning faces. A miss is shown with Ocica's
  comfort animation and a hint glow.
- **Motion**: every movement gets an entry in `design/motion.json` (duration, easing). Keep things
  calm. Celebrations ≤ 1.5 s, transitions ≤ 600 ms.

## 1a. Style anchor: isometric diorama

Theia loves isometric cutaway "dollhouse" sticker books. The photos are in `reference/style/`,
local only and never committed, since they are copyrighted.
- **Take from them**: the isometric cutaway diorama, the warm outlined flat-color look, the cosy
  props, the multi-storey stairs, the zoomed-in "one room as a scene" framing.
- **Never take**: their actual artwork, compositions, or props one-to-one. They're for mood only.
- **Adapt for a 3-year-old**: fewer and bigger props around anything she can tap. Decoration is
  quieter than interactive items.
- **Activity screens stay flat and front-facing.** Tracing, counting, and coloring need an
  undistorted surface. They are *framed* in the room's isometric style: for example the desk edge
  in the corners, room props at the sides, and the same palette and line weight.

## 2. Deliverables for M1 (Phase 2)

Follows `WORKFLOW.md` §4, Phase 2. Concepts are a **PR to `design/concepts/M1/`**. Papa and Mama
review them in GitHub.

| # | Deliverable | Path | Review |
|---|---|---|---|
| 1 | 2–3 style directions, **all isometric cutaway dioramas** (see §1a), varying palette, line weight, and detail density. A mood board plus `SCR-HOUSE` and `SCR-TRACE` mockups per direction. | `design/concepts/M1/01-style-*.png` + `README.md` | Papa picks one |
| 2 | Family sheet: Theia, Mama, Papa, Bubu, Ocica at relative scale, front / three-quarter / side | `design/concepts/M1/02-family-sheet.png` → final `assets/style/` | Papa and Mama |
| 3 | Isometric house concept painted over Claude's blockout (`npm run house:blockout`), with the 3 M1 rooms marked | `design/concepts/M1/03-house.png` | Papa and Mama |
| 4 | Design tokens + `ui/` components (§5) | `design/tokens.json`, `ui/` | Claude checks contracts |
| 5 | Mockups for every screen in §3, every state, tablet and phone | `design/mockups/<screen-id>/` | Papa |
| 6 | Layout JSON per game screen | `design/layouts/<screen-id>.json` | Claude checks contracts |
| 7 | Motion spec + reference GIFs for the key moments (§4) | `design/motion.json`, `design/motion/` | Papa |
| 8 | Clickable prototype of the M1 main flow on mock data | `prototype/` (`npm run proto`) | Papa, on the tablet |
| 9 | Production assets (§6) | `assets/` + `manifest.json` | Validators + checklist |

## 3. Screens

### `SCR-BOOT`: start screen
- **Purpose**: one obvious tap, which unlocks audio, then a warm welcome.
- **Elements**:
  - background: the house exterior, morning
  - one giant "Mulai" button (≥ 240 dp) with a play symbol, no word needed
  - Bubu and Ocica peeking from the sides
- **States**: idle (the button breathes gently), pressed, then a transition into `SCR-HOUSE`.
- **Voice**: none before the tap. After the tap, `greet.welcome` plays with `HUD-SPEAKER`.

### `SCR-HOUSE`: house hub
- **Purpose**: Theia chooses where to go. The house also shows her progress.
- **Elements**:
  - The isometric cutaway house (layers and occluders per `ASSETS.md` §4), plus a zoomed
    "scene" framing for each room.
  - 3 active rooms: bedroom/tracing, kitchen/counting, living room/coloring. Final rooms come
    from the floor plan.
  - Other rooms shown dim and sleepy.
  - Theia, Bubu, Ocica.
  - A sky that changes from day to night.
  - The fridge (shows finished coloring pages) and a sticker spot on her bedroom wall (empty in
    M1, placed for M2).
- **States per room**: `idle`, `has-new` (Bubu points, soft sparkle), `due-review` (lighter
  sparkle), `locked` (dim, "zzz"), `tapped` (a short highlight).
- **Interactions**: tap a room → walk → the camera zooms into the room. Phone: opens zoomed to the
  current room, drag to pan, pinch-out to see the whole house.
- **Layout JSON**:
  - room polygons, the standing spot for each room, waypoints and edges
  - positions for the fridge display and the wall-sticker spot
  - the parking spots where Bubu and Ocica wait in each room
- **Day/night**: provide 4 key looks (morning, noon, afternoon, dusk) as a sky layer plus tint
  values. The game blends between them.

### `SCR-TRACE`: tracing (bedroom)
- **Purpose**: trace one item through the Lihat → Ikuti → Titik-titik steps.
- **Elements**:
  - The surface (chalkboard or paper on her desk).
  - The trace area (the game draws the path, guide, ball, dots, and ink).
  - Theme decoration for each T0 stroke: rain clouds for vertical, a road for horizontal, a ball
    for circle, a slide for diagonal, a lightning bolt for zigzag, waves for wave, a plus sign for
    cross.
  - Bubu's demo paw (Lihat).
  - Ocica at the side (comfort, cheering).
  - A round progress indicator: 3 big dots, no numbers.
- **The game renders, Antigravity specs the look**: guide stroke width, colors, and glow (tokens);
  the start dot; direction arrows; the follow ball; the dotted guide; ink color and width; the
  snap sparkle.
- **States**: `watch`, `follow` (ball idle / ball advancing / stalled hint), `dotted`,
  `stroke-success`, `stroke-miss` (fade out + comfort), `round-complete` → `OVL-CELEBRATE`.
- **Phone**: the trace area uses the full height, and the decoration moves to the sides.

### `SCR-COUNT`: counting (kitchen)
- **Purpose**: the 4 counting variants, with no painted backdrop: the objects sit on
  `color.backdrop` with the engine's soft vignette (ASSETS.md §5).
- **Elements**:
  - objects (`telur`, `apel`, `kue`, `bola`, `ikan`) in counted and uncounted looks
  - containers (`mangkuk`, `piring`) with a marked drop zone
  - 3 numeral choice tiles (digits rendered by the game, tile art by Antigravity)
  - dot-pattern cards for 1–5
  - picture-group choice cards
  - Ocica `eat` (cookie variant)
- **Variants and states**:
  - **C1 count along**: object `idle`, then `counted` (highlight + small bounce, stays marked).
  - **C2 how many**: the 3 tiles go `idle` → `selected` → `correct` / `hint`.
  - **C3 recognise a group**: the dot card is `shown` for 2 s, then `hidden`. The choices go
    `idle` → `correct` / `hint`.
  - **C4 put N in the bowl**: objects can be dragged. The bowl goes `idle` → `receiving` →
    `full-correct` (glow). An extra object `hops-out`.
- **Layout**: up to 5 object slots, arranged so they can't overlap and so each has a ≥ 96 dp tap
  area.

### `SCR-COLOR-PICK` and `SCR-COLOR`: coloring (living room)
- **Pick**: 2–3 big thumbnails of unlocked pages (≥ 320 dp). Locked pages are shown sleepy.
- **Color**:
  - the page (line art per `ASSETS.md` §6)
  - a palette of 8–10 big swatches, ≥ 96 dp each
  - the selected-swatch indicator
  - the "oops" undo button (≥ 96 dp)
  - a "done" moment when ≥ 80% of the page is filled
- **Swatch colors** are tokens. Fill colors must look good on white and cover the full lines.
- **M1 pages (5)**, her favourites: `bubu` (the pink bunny doll), `ocica` (the white bunny doll),
  `dinosaurus`, `bunga`, `kucing`. Each has 6–15 regions. Bubu and Ocica pages must match the
  family sheet.

### `SCR-TIDY`: tidy-up break ("Beberes"), M1 variant: tidy the toys
- **Purpose**: a ~1-minute playful break between learning rounds (PRD US-TIDY-01/02).
- **In the hub**: a "mess moment". Bubu and Ocica knock over the toy basket with a funny animation,
  toys scatter, and the room sparkles. Design the messy look of the room as an overlay layer on top
  of the normal room.
- **Elements**:
  - the living room floor, zoomed in
  - 5–8 toys: `bola`, `balok`, `mobil`, `boneka`, `dinosaurus`, … Each ≥ 96 dp, with clear
    silhouettes.
  - the toy box (drop zone marked)
  - Bubu and Ocica looking sheepish, then apologising with a hug
- **States**: toy `idle`, `dragging` (lifted, with a shadow), `in-box` (pops in with a bounce),
  `returning` (slides back); box `idle`, `receiving`, `full`; room `messy` → `tidy`.
- **Tone**: funny and warm. Never messy-as-in-dirty or guilt-inducing.
- **M2 preview** (no art needed yet): messy bed, spilled water puddle plus a cloth, scattered shoes.

### `SCR-BEDTIME`: ending
- **Purpose**: a warm, final ending that she accepts.
- **Elements**: her bedroom at night, the bed, Theia `sleep`, Bubu `sleep` and Ocica `sleep`
  beside her, a soft moon and stars, the narrator portrait saying goodnight.
- **Then**: a calm idle screen (slow twinkle), with nothing for Theia to tap. Only the parent-gate
  corner stays active.

### HUD and overlays
- **`HUD-HOME`**: a house icon, ≥ 96 dp. **Hold 1 s** with a filling ring (spec the ring).
  States: idle, holding (ring fills), triggered.
- **`HUD-SPEAKER`**:
  - The Mama or Papa portrait in a soft round frame (`ASSETS.md` §3.4).
  - States: `idle`, `talk` (3 mouth frames driven by loudness), `smile`, `encourage`.
  - Tap = replay the instruction. Show a subtle "tap me" pulse after 8 s of no input.
- **`OVL-CELEBRATE`**: ≤ 1.5 s. Theia `celebrate`, Bubu and Ocica `celebrate`, confetti or
  sparkles. It can't be dismissed and it doesn't block the next voice clip.
- **`OVL-RECOVER`**: about 2 s of a neutral "whoops" moment (Bubu shrugs), then back to the house.
  It must not look like an error screen.
- **`OVL-PARENT-GATE`**: a dim overlay, a keypad of 9 big buttons, and a text prompt
  ("Ketuk 7, 2, 9"). Adult styling is fine. Close (×) in a corner.

### Parent screens (adult-facing, `ui/` components)
- **`SCR-PARENT-HOME`**:
  - progress summary (time played; mastery box 1–5 per T0, T1, and counting item)
  - attempt replays (the game provides the replay canvas, Antigravity designs the frame)
  - navigation to settings and data
- **`SCR-PARENT-SETTINGS`**:
  - session length stepper (5–20 min)
  - narrator selector (Mama / Papa / alternate, each with its portrait)
  - name fields
  - tolerance slider
  - case-order toggle
  - manual unlock of T1
- **`SCR-PARENT-DATA`**: export, import (with an error state), reset (with a second
  confirmation), storage status, log export.
- **`SCR-INSTALL`**: 3 illustrated steps for "Add to Home screen" in Chrome on Android. Plain
  adult text is fine here.
- Indonesian UI copy for the parent screens comes from Claude (`content/strings.id.json`).
  Antigravity designs for text up to 1.5× the length of the sample copy.

## 4. Key motion moments (`motion.json` + reference GIFs)

| Moment | Notes |
|---|---|
| Walk start / stop | Ease in and out. Bubu leaves 150 ms earlier, Ocica follows 200 ms later. |
| Stairs | Switch to `stairs` (`br` going up, `fr` going down). Speed stays the same. |
| Room zoom in / out | Camera eases into the room's `focus` rect in ≤ 600 ms, and back out when she leaves. Characters keep animating during the zoom. |
| Stroke snap | The ink morphs onto the path in about 250 ms, then a sparkle runs along the stroke. |
| Stroke miss | The ink fades out in about 400 ms. Ocica `comfort`. The demo replays. |
| Count tap | Object bounce 120 ms + highlight. The number pops briefly above it. |
| Bowl drop / hop out | Drop squash 150 ms. The extra object arcs back to its slot in 500 ms. |
| Mess moment | Basket tips, toys scatter in ≤ 1 s with a bounce. Bubu and Ocica freeze in an "oops" pose. |
| Toy into box | Arc into the box, ≤ 300 ms, with a small pop. A missed drop slides back in 400 ms. |
| Fill | A radial reveal from the tap point, ≤ 200 ms. |
| Celebration | ≤ 1.5 s. All three characters jump in a staggered sequence. |
| Day → dusk | Continuous blend over the session. Dusk is clearly visible in the last 2 minutes. |
| Bedtime | 2–3 s sequence: lights dim → into bed → stars. |

## 5. Design system v1 (`design/tokens.json` + `ui/`)

**Tokens:**
- the color palette (≤ 24) plus the 10 coloring swatches
- semantic colors: interactive, success glow, hint glow, ink, guide, dotted guide, dim/locked
- typography: one rounded, highly legible family, **bundled locally** (no remote fonts), with
  single-storey *a* and *g*. Andika (SIL OFL) is suggested.
- touch-target sizes, radii, shadows, z-layers, durations, easings

**`ui/` components** (presentational, props in and events out, per `WORKFLOW.md` §3):

| Component | Used in |
|---|---|
| `BigButton` | Boot, overlays |
| `HoldButton` | `HUD-HOME`, parent-gate corner |
| `SpeakerPortrait` | `HUD-SPEAKER`. Props: speaker, mouth frame, state. |
| `ChoiceTile` | C2 numerals, C3 cards |
| `Swatch` and `SwatchPalette` | Coloring |
| `ProgressDots` | Activity round indicator |
| `Keypad` | Parent gate |
| `Stepper`, `Toggle`, `Slider`, `SegmentedControl`, `FileImport` | Parent settings and data |
| `MasteryBadge` | Parent progress (box 1–5) |

Each component gets a gallery page in `prototype/` showing every state.

## 6. Asset inventory for M1

The keys follow `ASSETS.md`. Until the real art lands, the placeholders use the same keys.

| Key (prefix) | Asset | Spec |
|---|---|---|
| `character.theia.default` | `idle` `walk` `stairs` in `fr` + `br`. `celebrate` `point` `think` `sleep` in `fr` only. | `ASSETS.md` §3.2 |
| `companion.bubu.default` | `idle` `walk` in `fr` + `br`. `point` `demo` `celebrate` `sleep` in `fr` only. | §3.3 |
| `companion.ocica.default` | `idle` `walk` in `fr` + `br`. `comfort` `celebrate` `eat` `sleep` in `fr` only. | §3.3 |
| `parent.mama.portrait`, `parent.papa.portrait` | `idle` `talk` `smile` `encourage` | §3.4 |
| `house.*` | `bg` (+ 4 sky looks), `structure`, 3 rooms + their `_dim` versions, `occluders.*`, fridge display, wall-sticker spot. Isometric, painted over the blockout. | §4 |
| `tracing.surface`, `tracing.theme.<stroke-id>` × 7 | Surface + theme decorations | §5 |
| `counting.objects.<id>` × 5, `counting.containers.<id>` × 2, `counting.dots.<n>` × 5 | Objects (counted/uncounted), containers with drop zones, dot cards | §5 |
| `coloring.<id>` × 5 | Line-art pages | §6 |
| `ui.*` | HUD icons, hold ring, swatch frame, keypad, tiles, laptop cursor (normal + pressed) | §5 |
| `bedtime.*` | Bedroom at night, bed, moon and stars | — |
| `tidy.toys.<id>` × 5–8, `tidy.toybox`, `house.mess.<room-id>` | Toys, toy box with drop zone, messy-room overlay for the living room | §5 |
| `icons.app` | 512 maskable + 192 | §5 |

## 7. Questions for Antigravity

Answer inline at the Phase 2 kickoff. The numbers stay stable.

1. Does the 160 × 160 companion frame give Ocica's round body enough room, or should it be
   192 × 160?
   - **Recommendation: 192 × 160 px** (width × height).
   - **Reasoning:**
     - Ocica is designed with a round, chubby, wide-body silhouette (40–50% of Theia's height). At ~110–120 px tall on baseline y = 150, a spherical body plus chubby arms in 2:1 isometric projection easily reaches 120–130 px in static width.
     - More critically, her key animations require lateral movement: the `walk` waddle has a side-to-side sway/weight shift, `comfort` involves reaching wide for a hug, and `eat` involves holding food. A 160 px width leaves under 15 px margin per side, which risks clipping or forcing a compromised, squished silhouette.
     - Standardizing both companions at 192 × 160 px (baseline y = 150) also benefits Bubu (providing comfortable clearance for `point` and `demo` paw gestures) while keeping companion spritesheet dimensions unified for texture atlas packing.

2. Phone 2400 × 1080: should the house view use a single wide composition, or a tablet
   composition extended at the sides?
   - **Recommendation: Tablet composition (1920 × 1200 / 16:10 source), extended at the sides for wider viewports.**
   - **Reasoning:**
     - *Single geometric source of truth:* The isometric cutaway diorama of the house (walls, room proportions, stairs, doors, waypoints, walk polygons, and occluders in `assets/house/layout.json`) remains completely identical across tablet, laptop, and phone. We avoid managing two divergent architectural models or distorted perspectives.
     - *Consistent framing & zoom:* On phone (2400 × 1080), the house view opens zoomed into the current room with drag-to-pan / pinch-to-zoom (PRD US-HOUSE-05). When zoomed out to view the entire house, scaling to the 1080 px height leaves ~240 px of horizontal space on each side. We extend `house/bg.png` with lush ambient decoration (garden foliage, fence, trees, sky) beyond the 16:10 frame.
     - *Safe areas & ergonomics:* All interactive elements and room tap polygons remain strictly inside the 1760 × 1080 safe area, safely away from phone edges to prevent accidental triggering of system gesture navigation.

3. Day/night: are 4 sky looks plus tint values enough, or should rooms also get light layers (lamps
   switching on at dusk)?
   - **Recommendation: 4 sky looks + tint values as the base, PLUS a dedicated indoor warm light overlay layer (`house/lights.png`).**
   - **Reasoning:**
     - Global tinting darkens both exterior and interior uniformly. At dusk and bedtime, a pure dark tint makes indoor rooms feel gloomy, muddy, and murky rather than cozy.
     - In the isometric diorama style, warm glowing indoor lamps turning on ("lampu rumah dinyalakan") are the signature visual cue that daytime play is winding down. It provides high-contrast warmth that makes the transition soothing rather than sad for a 3-year-old.
     - *Implementation cost is minimal:* A single additive/screen overlay layer (`house/lights.png`) covering lamp and window glows. The engine can simply tween its opacity from 0.0 to 1.0 during the last 2 minutes of the session (dusk), and dim it off during the bedtime sequence in `SCR-BEDTIME`.

4. Which rooms does the floor plan suggest for the 3 M1 activities?
   - **Answer**: Based on the complete architectural denah in `reference/rumah/denah/` (`denah-lt-0.png`, `denah-lt-1.png`, `denah-lt-2.png`, `tampak-depan-dengan-ukuran-tinggi.png`), the house is a split-level design. Following Papa's final decisions, we map the rooms as follows (using exact stable room ids):
     - **Tracing (`SCR-TRACE` — Menulis)**: **`kamar-tidur`** (R. TIDUR UTAMA, Lt. Atas, FFL +3.400).
       - *Framing*: Theia's study desk / chalkboard in the master bedroom.
       - *Why*: Quiet, focused learning corner. Crucially, the bedroom directly hosts the session bedtime sequence (`SCR-BEDTIME`: Theia, Bubu, and Ocica falling asleep in bed), creating a unified narrative and spatial anchor. Walking up the stairs (`walk` + `stairs` animation) to her bedroom gives an endearing sense of journey.
     - **Counting (`SCR-COUNT` — Berhitung)**: **`dapur`** (kitchen, including the dining table, Lt. Dasar, FFL ±0.000; DAPUR + R. MAKAN on the denah).
       - *Framing*: The open kitchen counter and dining table.
       - *Why*: Perfectly suits food-based counting objects (telur, apel, kue) and containers (mangkuk, piring). Ocica "eating" the counted cookies fits naturally at the kitchen table.
     - **Coloring (`SCR-COLOR-PICK` / `SCR-COLOR` — Mewarnai)**: **`ruang-keluarga`** (living room, Lt. Dasar, FFL ±0.000; R. TAMU on the denah).
       - *Framing*: The living room floor/rug and drawing easel under the high-ceiling void.
       - *Why*: Central creative play area. Finished coloring pages hang on the fridge (`house.fridge`), which sits in the adjacent dining/kitchen area in direct visual line-of-sight in this open plan. Also hosts the M1 tidy-up break (`SCR-TIDY`: Beberes scattered toys on the floor).
     - **Future rooms (locked in M1)**: Drawn and present in `layout.json` (dimmed / sleepy look; tap = soft "zzz" sound + Ocica yawns):
       - **`kantor-papa`**: Mezzanine 1, FFL +2.400 (Papa's office, overlooking the void). Reserved for M2/M3 letter recognition & reading (`R1–R6`).
       - **`kamar-anak`**: The small upstairs bedroom, MEZZANINE 2, FFL +4.800 (confirmed by Papa as the children's room, reference in `reference/rumah/mezzanine-2-kamar-anak/`).
     - **Garden note (M4)**: Ground-floor front and back garden activities stay reserved for M4 without room ids yet.

5. Isometric pipeline: is painting over the SVG blockout workable with your image tools, or would
   you prefer another structure guide (for example a depth map rendered from the blockout)?
   - **Status: Waiting on Claude's `house:blockout` tool.**
   - **What is needed:** We need Claude to implement and run `npm run house:blockout` (US-REF-02 in M0) against the floor plan data to generate the 3840 × 2400 SVG blockout.
   - **Preferred guide format:** An SVG blockout with clean strokes and grouped layers (floors, back walls, stairs, door openings) is an excellent primary structural wireframe for vector/raster painting. If the tool can also export a rendered 3840 × 2400 raster line guide PNG (or flat color-coded surface ID pass), that will additionally allow direct depth/ControlNet conditioning in our generative passes. We will validate this hands-on as soon as the blockout tool outputs its first artifact.

6. Anything in the contracts (`ASSETS.md`, upcoming `contracts/`) that blocks your preferred
   workflow or tools?
   - **Status: Waiting on the contracts v1 PR.**
   - **What is needed:** We need to review the zod schemas and generated JSON Schemas in `contracts/` (manifest, layout, tokens, motion, ui props) once Claude opens the contracts PR.
   - **Current assessment:** `ASSETS.md` is clean, specific, and fully aligned with our design system approach. The strict coloring rules (closed line art ≥ 6 px, gaps ≤ 2 px, regions ≥ 40 px) and manifest keys are completely clear. The 192 × 160 companion frame size, `house.lights` key, and `ruang-keluarga` start room will land in contracts v1, which Antigravity will co-sign.

### Blocking questions from Antigravity for Gate 1 / Phase 2 kickoff

1. **Reference photos in `reference/` (Google Drive)**:
   - *Status: Resolved.* Full reference sets for Theia, Mama, Papa, Bubu, Ocica (including 360° turn videos), style inspiration, and house denah/photos confirmed ready in `reference/`. Reference material stays strictly local and gitignored.
2. **Surface styling vs. token contrast in Tracing (`SCR-TRACE`)**:
   - *Status: Resolved.* Confirmed by Claude: all guide, path, ink, and hint-glow colors are driven strictly by semantic tokens in `design/tokens.json` (`tracing.*`). Base surface color will be defined as a token, and the design validator checks contrast against it automatically.
3. **Audio-visual coordination on error/comfort**:
   - *Status: Resolved.* Confirmed by Claude: ink fades out (~400 ms), Ocica `comfort` animation and narrator hint ("Hampir! Coba lagi ya.") play simultaneously. Bubu's demo step replays only after the spoken clip ends, respecting US-AUD-01 (no overlapping voice clips).
4. **Asset validation tooling during Phase 2**:
   - *Status: Resolved.* Confirmed by Claude: `npm run validate:design` and `npm run validate:assets` ship in the contracts v1 PR (M0), available for local verification before Phase 2 begins.

## 8. Sign-off

- [ ] Antigravity: brief understood, questions answered
- [ ] Papa: approved (Gate 1)
