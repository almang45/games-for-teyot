# Rumah Cici Theia — Asset Contract

Owner: **Antigravity** (UI/UX designer and prototyper). Consumer: Claude's game logic.
This file covers `assets/`. Design tokens, screen layouts, motion, `ui/` components, and the
prototype are defined in [`WORKFLOW.md`](WORKFLOW.md) §3.

This file is the interface between the two agents. If the art needs something this spec does not
allow, change this file in a PR first. Do not quietly break the format.

All assets live under `assets/`. Nothing in `src/` is edited by the asset agent, and nothing in
`assets/` is edited by the logic agent, except placeholder files that Claude generates under
`src/placeholder/`.

---

## 1. Inputs from the parents

### 1.1 Where they live

The originals sit in a **private Google Drive folder, "Rumah Cici Theia – Referensi"**. It is
shared only between Mama's and Papa's accounts, and both upload from their Android phones.
- **Google Drive for desktop** (Mirror mode) keeps a local copy on the Mac.
- `reference` in the repo root is a **symlink** to that mirrored folder. It is gitignored, so
  agents read plain local files, and nothing is fetched at runtime or through MCP.
- `npm run reference:frames` (Claude's tool) extracts key frames from videos into
  `reference/frames/<subject>/` with ffmpeg. Agents work from the frames, not the raw video.
- `npm run reference:check` lists what is missing against the table below.

Folder structure. The folder names tell the agents what each file shows:

```
reference/
├── theia/      front/  side/  back/  full-body/  video/
├── mama/       front/  side/  full-body/
├── papa/       front/  side/  full-body/
├── bubu/       front/  side/  back/  video/      ← 360° turn video recommended
├── ocica/      front/  side/  back/  video/
├── style/      inspiration images (e.g. the isometric sticker-book dioramas Theia likes)
├── rumah/      denah/  <lantai>-<room-id>/  tangga/  video/
│                ← lantai: bawah, mezzanine-1, atas, mezzanine-2; room-id from contracts/rooms.ts,
│                  e.g. atas-kamar-tidur, mezzanine-2-kamar-anak. Other rooms (kamar-mandi) are fine.
└── frames/     (generated)
```

Alternative if the family prefers no cloud: Syncthing between the phones and the Mac, with the
same structure and the same symlink.

### 1.2 What to provide

All of this is **gitignored and never committed**:

| Input | Used for |
|---|---|
| 3–6 photos of her: face front and side, full body, typical hairstyle, favourite clothes | Character reference sheet |
| 2–3 photos each of Mama and Papa: face and full body | Parents reference sheet |
| Floor plan sketch: rough is fine, with room names and positions, stairs, doors | House layout |
| A few photos per room: key furniture and colours | Room art |
| Photos of the dolls **Bubu** (pink, slim bunny) and **Ocica** (white, fat bunny): front, side, back | Companion reference sheet |

**Only stylized illustrations are committed.** No photo, and no photo-realistic render of her or her parents,
goes into git or the deployed site.

## 2. Art direction

- **Look**: an **isometric cutaway diorama**, like the sticker-book dollhouses Theia loves (in
  `reference/style/`):
  - Pre-rendered **2D** art drawn in isometric projection, not real-time 3D.
  - Clean warm-dark outlines (not pure black), flat colors with one soft shade tone, cosy props.
  - Characters use the same projection and line weight.
  - The references are **inspiration for the style only**. Never trace or copy their artwork, and
    never commit them, because they are copyrighted.
- **Detail budget**: the references are dense with tiny props, but she plays on a phone too:
  - **Interactive items** (room entrances, the fridge, the bed, activity props) are larger, with
    higher contrast and saturation.
  - **Decoration** is lower contrast and lower detail.
  - Nothing tappable is smaller than 72 dp at phone scale.
- **Projection**: 2:1 pixel isometric (dimetric, about 26.57° lines). The same angle everywhere
  (house, props, characters), so pieces from different files fit together.
- **Mood**: warm, cosy, calm. This is a home, not a theme park. Low saturation for backgrounds,
  higher saturation for things she can interact with, so tappable items stand out.
- **Character**: chibi proportions (head ≈ 40% of height), large eyes, recognisably *her* (hair,
  skin tone, face shape), no exaggerated features.
- **Palette**: define once in `design/tokens.json` (`color.palette`, ≤ 24 colours, plus the 6
  `color.swatches` for coloring, each a `{ name, hex }` whose name picks the `color.<name>` voice
  clip) and reuse it everywhere. The game and the art read the same file.
- **No text inside images.** Every letter and word is rendered by the game, so Indonesian text and
  curriculum changes never need new art.
- **Consistency gate**: each new asset is reviewed side by side with `assets/style/reference-sheet.png`
  before merge (§8).

## 3. Character (her) and companions

### 3.1 Reference sheet (first deliverable)

`assets/style/reference-sheet.png` shows:
- front, three-quarter, and side views
- colour callouts
- 3 facial expressions (happy, focused, surprised)
- outfit base

Every later character asset must match this sheet.

### 3.2 Sprite sheet

- **Two facings**, the minimum for isometric movement:
  - `fr`: front-right, walking toward the viewer
  - `br`: back-right, walking away from the viewer

  The game flips each horizontally to get front-left and back-left, which gives all 4 isometric
  directions. Animations marked *fr only* are drawn just facing front-right.
- Frame size **256 × 256 px**. Feet on a fixed baseline at y = 240, with her body centred
  horizontally.
- Frames sit in a grid, read left to right, top to bottom. The manifest names each animation
  `<animation>.<facing>` (`walk.br`) with its first and last frame (§7).
- Transparent background, PNG, premultiplied alpha off.

| Animation key | Frames | FPS | Loop | Notes |
|---|---|---|---|---|
| `idle` | 4 | 6 | yes | `fr` + `br`. Subtle breathing or blink. |
| `walk` | 8 | 12 | yes | `fr` + `br`. In-place walk cycle, no drift. |
| `stairs` | 8 | 10 | yes | `fr` (down) + `br` (up), climbing along the stair axis |
| `celebrate` | 6 | 12 | no | *fr only*. Jump with arms up. |
| `point` | 4 | 8 | no | *fr only*. Points, ends holding the pose. |
| `think` | 4 | 6 | yes | *fr only*. Hand on chin, used while waiting for her answer. |
| `sleep` | 4 | 4 | yes | *fr only*. In bed. Used by BedtimeScene. |

**Outfits** (unlockable rewards) are full re-renders of all animations using the same frame
grid, not overlays. That keeps the art simple and the rendering cheap.

### 3.3 Companions: Bubu and Ocica

Both are based on her real dolls, stylized the same way as she is. Keep each doll's recognisable
traits (colour, ear shape, any stitching or accessories).

- `assets/style/companions-sheet.png`: both bunnies side by side with her, at the correct
  relative scale. Each about 40–50% of her height.
- **Silhouettes must be distinct at a glance**:
  - **Bubu**: pink, slim, tall ears
  - **Ocica**: white, round, wide body
  - Ocica's white needs a warm off-white fill plus the standard outline so she doesn't vanish on
    light walls.
- Same rules as §3.2: `walk` and `idle` in `fr` + `br`, everything else *fr only*, transparent
  PNG. Frame size **192 × 160** (width × height), feet on baseline y = 150. The extra width gives
  Ocica's round body room for her `walk` sway, `comfort` hug and `eat`; Bubu uses the same frame.

| Animation key | Bubu | Ocica | Frames | Loop | Notes |
|---|---|---|---|---|---|
| `idle` | ✓ | ✓ | 4 | yes | Bubu twitches its ears, Ocica sways |
| `walk` | ✓ hop | ✓ waddle | 8 | yes | In place |
| `point` | ✓ | — | 4 | no | Paw toward a room or item, holds the pose |
| `demo` | ✓ | — | 6 | yes | Paw "drawing" motion for the Lihat step |
| `comfort` | — | ✓ | 6 | no | Hug or pat, after a miss |
| `celebrate` | ✓ | ✓ | 6 | no | Jump. Ocica's jump is a small bounce. |
| `eat` | — | ✓ | 4 | no | Munches a counted cookie (counting scene) |
| `sleep` | ✓ | ✓ | 4 | yes | Curled up beside her in bed |

Keys: `companion.bubu.<outfit>`, `companion.ocica.<outfit>`. Outfits are optional, for later.

### 3.4 Mama and Papa

- They are adults, but drawn in the same chibi style as her. Recognisably them (hair, glasses,
  everyday clothes), with a head about 30% of their height.
- They are **taller than her** so the family scale reads correctly.
- `assets/style/parents-sheet.png`: Mama, Papa, her, Bubu and Ocica lined up at relative scale.
  It becomes the master consistency reference.

**Portrait** (M1, used in activity scenes while a voice clip plays):
- Bust in a soft circular frame, **384 × 384** per frame, transparent outside the frame.
- Keys: `parent.mama.portrait`, `parent.papa.portrait`. Portraits have no facing, so their
  animations are named plainly (`talk`, not `talk.fr`).

| Animation | Frames | Loop | Notes |
|---|---|---|---|
| `idle` | 4 | yes | Blink |
| `talk` | 3 | — | Mouth closed / half / open. The game picks the frame from the clip's live loudness, so no lip-sync authoring is needed. |
| `smile` | 2 | no | After praise |
| `encourage` | 4 | no | Nod, for hint clips |

**Full body** (M2, house hub and bedtime ending):
- **320 × 320** per frame, feet on baseline y = 300. Same rules as §3.2.
- Keys: `parent.mama.body`, `parent.papa.body`.

| Animation | Frames | Loop | Notes |
|---|---|---|---|
| `idle` | 4 | yes | |
| `wave` | 6 | no | When she enters their room |
| `clap` | 6 | no | At level mastery |
| `tuck-in` | 8 | no | Bedtime ending. Bends over the bed. |

## 4. House

### 4.1 Images

- An **isometric cutaway** of our real house, simplified:
  - the two back walls and the floor of each room are visible, and the front walls are removed,
    like a dollhouse
  - floors are stacked, with stairs between them
  - a garden or outside around it, following the reference style
- **Start from a blockout.** Image models drift in perspective from one room to the next. Claude's
  `npm run house:blockout` turns the floor plan dimensions (`reference/rumah/denah/`, entered as a
  small JSON) into an isometric **SVG blockout**: floors, walls, stairs, and door openings at the
  exact projection. Antigravity paints over it (structure guide or img2img), so every room shares
  one geometry and `layout.json` lines up with the art.
- **The 20 cm grid.** The plan sits on a 20 cm grid, and `house-blockout-grid.svg` draws its cells
  on every floor and back wall (whole metres are thicker). Each cell's corners land on whole
  pixels; the guide's scale bar gives the cell size in px. A prop's footprint is measured in whole
  cells, so it follows the grid lines; its height is free.
- **One sprite per piece of furniture.** The structure layers hold no furniture. Each piece is
  its own `house.props.*` sprite, so one can be redrawn without touching the rest, and the game
  sorts it with the characters by its footprint. Lock the style first: paint 3–4 props and one
  storey, get Papa's approval, then do the rest.
  `house-blockout-props-<storey>.svg` draws every piece of furniture as a box, with that storey
  and the ones below it (the storeys above fade, as in the zoom). The guide names each piece by
  its key, and the draft `layout.json` carries its `rect` and `base`. A piece that hangs on a wall
  (a TV, wall cabinets) has its underside as its footprint, so its sprite stays trimmed.
- Design canvas **3840 × 2400 px** (16:10, the 1920 × 1200 frame at 2×). It fits the tablet and
  the laptops; on the phones, Theia's main devices, it fills the height and `house.bg` fills the
  sides.
  `layout.json` uses the 1920 × 1200 half-size space; the game draws the full-size layers at 50%,
  so the camera can zoom into a room on arrival (§4.3) without blur.
- Layers, each a separate PNG. Layers of one size share the same canvas, so they stack without
  offsets:

  | Key | Path (suggested) | Size | What |
  |---|---|---|---|
  | `house.bg` | `house/bg.png` | 2688 × 1200 | Outside around the house: garden, fence, trees. The middle 1920 px lines up with the 1920 × 1200 export space; 384 px of extra garden on each side fills a 20:9 phone. |
  | `house.sky.<look>` | `house/sky/<look>.png` | 2688 × 1200 | One per look: `morning`, `noon`, `afternoon`, `dusk`. The game blends them with the `color.sky` tints. Same side extension as `house.bg`. |
  | `house.structure.<storey>` | `house/structure/<storey>.png` | 3840 × 2400 | One per storey (`lt-dasar`, `mezzanine-1`, `lt-atas`, `mezzanine-2`): its floor, back walls, door openings and stairs, with no furniture. Zoomed into a room, the game fades the storeys above it (PRD US-HOUSE-01). |
  | `house.lights` | `house/lights.png` | 3840 × 2400 | Warm lamp and window glow. The game fades it in at dusk and dims it at bedtime. |
  | `house.props.<area>.<id>` | `house/props/<area>/<id>.png` | 16–1024 px per side | One piece of furniture or decor, trimmed to its own bounds and drawn at 2× its `rect` in `layout.json`. `<area>` is the plan area it stands in (a room id, or `ruang-tangga`, …). |
  | `house.occluders.<id>` | `house/occluders/<id>.png` | 3840 × 2400 | Fixed parts of the building drawn **in front of** a character walking behind them (a stair railing, a half wall). Each has a sort line in `layout.json`. Furniture is a prop instead. |
  | `house.mess.<room-id>` | `house/mess/<room-id>.png` | 3840 × 2400 | Drawn on top of the room while it's messy (tidy-up) |
  | `house.fridge`, `house.sticker-wall` | `house/fridge.png`, … | 64–1024 px per side | The fridge display and her sticker wall, placed at `spots` in `layout.json` |
- Walkable areas are **floor polygons** on each storey. Stairs run along one isometric axis.
- **Locked rooms** (PRD US-HOUSE-03) need no extra art: the game dims the room's floor area and its
  props.

### 4.2 `assets/house/layout.json`

Manifest key `house.layout`. Coordinates are in the 1920 × 1200 export space, with the origin at
the top left. Schema: `contracts/houseLayout.ts`.

```jsonc
{
  "version": 1,
  "size": [1920, 1200],
  "rooms": [
    {
      "id": "kamar-tidur",                    // from contracts/rooms.ts, stable forever
      "activities": ["tracing", "bedtime"],   // tracing | counting | coloring | tidy | bedtime | reading | words | garden
      "polygon": [[1100, 280], [1650, 280], [1650, 520], [1100, 520]],   // tap area (screen space)
      "walk": [[1100, 320], [1600, 320], [1600, 480], [1100, 480]],      // walkable floor polygon
      "stand": [1350, 400],                   // Theia's feet on arrival
      "storey": 2,                            // see the storey list below
      "focus": [1000, 200, 700, 400],         // camera zoom rect for this room (x, y, w, h)
      "parking": { "bubu": [1250, 400], "ocica": [1450, 400] }           // where they wait
    }
  ],
  "spots": {
    "fridge": { "room": "dapur", "rect": [500, 650, 120, 160] },          // finished coloring pages
    "sticker-wall": { "room": "kamar-tidur", "rect": [1200, 250, 100, 60] }
  },
  "occluders": [
    { "key": "house.occluders.railing-tangga", "sortY": 488 }   // in front of characters with feet y < sortY
  ],
  "props": [
    {
      "key": "house.props.dapur.kulkas",     // in the manifest, with its 2× PNG
      "storey": 0,                            // fades with this storey
      "room": "dapur",                        // dims with this room while it's locked; omit outside rooms
      "rect": [480, 600, 160, 240],           // where the sprite is drawn (x, y, w, h)
      "base": [[560, 780], [630, 815], [560, 835], [490, 815]]   // footprint: back corner, then clockwise
    }
  ],
  "waypoints": [
    { "id": "pintu-dapur", "pos": [1100, 900], "storey": 0 },
    { "id": "tangga-bawah", "pos": [1550, 850], "storey": 0, "stair": true },
    { "id": "tangga-atas", "pos": [1550, 400], "storey": 2, "stair": true }
  ],
  "edges": [["ruang-keluarga", "tangga-bawah"], ["tangga-bawah", "tangga-atas"], ["tangga-atas", "kamar-tidur"]],
  "start": "ruang-keluarga"
}
```

Rooms (`contracts/rooms.ts`; a new room is a contract change):

| Id | Denah | Storey | M1 |
|---|---|---|---|
| `ruang-keluarga` | R. TAMU | 0 | Coloring, tidy-up. The start room. |
| `dapur` | DAPUR + R. MAKAN | 0 | Counting. Holds the fridge. |
| `kantor-papa` | MEZZANINE 1 | 1 | Locked |
| `kamar-tidur` | R. TIDUR UTAMA | 2 | Tracing, bedtime. Holds the sticker wall. |
| `kamar-anak` | MEZZANINE 2 | 3 | Locked |

Storeys are numbered in elevation order of the split-level house: 0 Lt Dasar (±0.000),
1 Mezzanine 1 (+2.400), 2 Lt Atas (+3.400), 3 Mezzanine 2 (+4.800).

Rules (`npm run validate:assets` checks all of them):
- Room ids and waypoint ids together are unique. Each activity lives in one room only.
- Every room is reachable from `start`.
- Every waypoint lies inside a walkable polygon of its storey, unless it is marked `stair`.
- An edge within one storey stays on that storey's walkable floor. An edge between storeys joins
  two `stair` waypoints.
- Every room's `stand` and both `parking` spots lie inside its `walk` polygon, and so does the
  straight line from the `stand` to each `parking` spot: Bubu and Ocica walk it on arrival.
- Every room's `walk` polygon lies inside its tap `polygon`.
- A tap on a room's floor reaches that room. Another room on the same storey may meet it on a
  shared edge, but its tap area must not reach over the floor. Where tap areas overlap, the tap
  goes to the higher storey, then to the room whose `stand` is nearer the viewer (larger y). A
  storey above may cover the floor.
- Polygons have an area, don't cross themselves, and stay on the canvas. So do `focus` and `spots`.
- Every occluder and prop key is registered in the manifest. Prop keys are unique.
- A prop stays on the canvas, its footprint is a real polygon inside its `rect`, and its `room`
  is on the prop's `storey`.
- The game draws a character in front of a prop when the character's feet are in front of the
  prop's footprint, and behind it otherwise.

## 5. Activity art

**Wide screens.** Every device shows the whole 1920 × 1200 frame, and wider screens show more at
the sides. Full-screen backgrounds are therefore **2688 × 1200**: the middle 1920 px lines up with
the frame, plus 384 px on each side, which covers a 20:9 phone. Keep anything important inside the
middle. Where no art reaches, the game fills with the `color.backdrop` token and fades the art into
it with a soft vignette.

| Screen | Sides on wide screens |
|---|---|
| `SCR-HOUSE`, `SCR-BOOT` | `house.bg` and `house.sky.*` (2688 × 1200, §4.1) |
| `SCR-TRACE` | `tracing.surface` and `tracing.theme.*` (2688 × 1200) |
| `SCR-COUNT`, `SCR-COLOR-PICK` | `color.backdrop` with a soft vignette, no painted background |
| `SCR-COLOR` | `coloring.desk` (2688 × 1200) behind the 1920 × 1200 page |
| `SCR-TIDY` | More of the zoomed house room, then `color.backdrop` |
| `SCR-BEDTIME` | `bedtime.room` (2688 × 1200) |
| `OVL-CELEBRATE`, `OVL-RECOVER` | Translucent over the screen below; `OVL-RECOVER` dims with `color.backdrop` |

| Asset | Path | Spec |
|---|---|---|
| Tracing surface (chalkboard / paper) | `tracing/surface.png` | 2688 × 1200, the frame's centre safe area 1080 × 1000 kept plain |
| Pre-writing stroke themes | `tracing/themes/<stroke-id>.png` | 2688 × 1200. Decoration around the path (rain clouds, road, ball). The path itself is drawn by the game. |
| Countable objects | `counting/objects/<id>.png` | 192 × 192, clear silhouette, each readable at 96 px. Ids: `apel`, `telur`, `kue`, `bola`, `ikan`, `bunga`… |
| Containers | `counting/containers/<id>.png` | Bowl, plate, basket, 512 × 384. The drop zone is the entry's `dropZone` in the manifest (image px). |
| Dot cards | `counting/dots/<n>.png` | 256 × 256, n = 1–10. Key `counting.dots.<n>`. |
| Stickers | `rewards/stickers/<item-id>.png` | 256 × 256, one per learnable item, no letters baked in (the game overlays the glyph) |
| Coloring pages | `coloring/<id>.png` | See §6 |
| Coloring desk | `coloring/desk.png` | `coloring.desk`, 2688 × 1200: the wooden desk the page lies on, with quiet props in the margins |
| Tidy-up toys | `tidy/toys/<id>.png` | 192 × 192, same rules as countable objects |
| Toy box | `tidy/toybox.png` | 512 × 384, with its `dropZone` in the manifest |
| Mess overlays | `house/mess/<room-id>.png` | See §4.1 |
| Bedtime | `bedtime/room.png` + props | `bedtime.room` is 2688 × 1200 (her bedroom at night). Props (`bedtime.bed`, `bedtime.moon`, …) up to 2688 × 1200. |
| UI | `ui/*.png` | Back (home) button, parent-gate corner icon, swatch frame, keypad, tiles. 144–1024 px per side. |
| Cursor | `ui/cursor-<state>.png` | `ui.cursor.normal` and `ui.cursor.pressed`, 64 × 64 with a `hotspot` in the manifest. The build makes the 32 × 32 version. |
| App icons | `icons/` | `icons.app.192`, `icons.app.512`, `icons.app.maskable-512` (safe zone respected), `icons.app.apple-touch-180` |
| Fonts | `fonts/<id>.woff2` | `font.<id>`, bundled locally (no remote fonts). Referenced from `design/tokens.json`. |

## 6. Coloring pages (strict)

Pages use **raster line art with runtime flood fill**, so AI-generated art works as is:

- 1920 × 1200 PNG, white background (`#FFFFFF`), line colour pure `#000000`, **no anti-aliasing
  grey in large patches**. Light anti-aliasing on the line edges is fine. Pages never get the
  wide-screen extension (fill runs on their pixels); `coloring.desk` fills the sides instead.
- Lines **≥ 6 px** thick at 1920 × 1200.
- **Every fillable region is closed.** No gaps wider than 2 px. The game runs a 2 px gap-closing
  pass when the page loads, so bigger gaps leak. An opening between two areas is either a gap
  (≤ 2 px) or a deliberate passage (> 8 px), never in between.
- Every fillable region holds a **40 × 40 px square** of paper inside its lines (corners may be
  rounded): her finger has to fit inside. Thin strips
  and smaller details are just drawn lines, not fillable areas. A margin around the subject
  counts only if it is that wide too.
- 6–15 regions per page at age 3.
- One subject per page, tied to a word: `coloring/ayam.png` (A), `coloring/bola.png` (B)…
- `npm run validate:assets` runs the game's own fill code (`src/engine/fill/`) and fails a page
  that:
  - has fewer than 6 or more than 15 fillable regions after closing 2 px gaps
  - leaks: it also closes openings up to 8 px, and a region that falls apart into separate areas
    (or into the background) had a gap the game won't close. The report names the region's box.
  - has transparency, colour, grey patches away from the lines, or lines thinner than 6 px

## 7. Export rules

- Format: PNG for sources in `assets/`. The build step packs them into **texture atlases**
  (≤ 2048 × 2048, WebP) per room, so do not hand-pack atlases.
- File names: `kebab-case`, ASCII only, no spaces.
- Every asset is registered in `assets/manifest.json`. Only the reference sheets in
  `assets/style/` stay unregistered: they are for review and never ship.

```jsonc
{
  "version": 1,
  "assets": [
    {
      "key": "character.theia.default",
      "type": "spritesheet",                 // image | spritesheet | coloring | layout | font
      "path": "character/theia/default.png", // relative to assets/, kebab-case
      "frame": [256, 256],
      "animations": {
        "idle.fr": { "frames": [0, 3], "fps": 6, "loop": true },
        "walk.fr": { "frames": [4, 11], "fps": 12, "loop": true }
      },
      "room": "global"                       // global | <room-id>: which bundle it ships in
    },
    {
      "key": "counting.containers.mangkuk",
      "type": "image",
      "path": "counting/containers/mangkuk.png",
      "dropZone": [96, 96, 320, 192],        // x, y, w, h in image px
      "room": "dapur"
    }
  ]
}
```

- Each key belongs to a **key family** (`KEY_FAMILIES` in `contracts/manifest.ts`), which fixes
  its type, size, frame and animation set as listed in §3–§6. A key that matches no family fails
  validation: new kinds of art start with a contract change.
- Animations: the names and facings from the tables in §3, the exact frame count, and the loop
  flag. Missing animations are warnings, since art arrives in stages (§9) and placeholders fill in.
- `npm run contracts:schema` writes JSON Schemas to `contracts/schema/` (gitignored). Point an
  editor at them with `"$schema": "../contracts/schema/manifest.schema.json"`. They cover the
  structure only; `npm run validate:assets` checks the rest.

Claude owns the zod schemas in `contracts/` (manifest, house layout, screen layouts, tokens,
motion, `ui/` props). Changes follow `WORKFLOW.md` §7.

## 8. Review checklist (before merging an asset PR)

- [ ] Matches the reference sheet (proportions, colours, line weight)
- [ ] No text baked into images
- [ ] No photo or photo-realistic likeness of her
- [ ] Sizes and frame grid exactly as specified
- [ ] Registered in `manifest.json`
- [ ] `npm run validate:assets` passes
- [ ] Looked at on Mama's phone **and** the tablet

## 9. Delivery order

1. Palette + character reference sheet + Bubu and Ocica companion sheet + Mama and Papa (`parents-sheet.png`)
2. House layout (from the floor plan) + `layout.json` with 3 M1 rooms
3. Character `idle`, `walk`, `celebrate`, `sleep`. Bubu and Ocica `idle`, `walk`, `point` (Bubu), `comfort` (Ocica).
4. M1 room art: tracing surface + pre-writing themes, counting objects 1–5 + bowl, 5 coloring
   pages
5. Mama and Papa portraits (`idle`, `talk`, `smile`, `encourage`)
6. App icons
7. M2 and later: stickers, outfits, remaining rooms, remaining Bubu and Ocica animations, Mama and Papa full-body sprites

Until each piece lands, the game runs on Claude's code-generated placeholders, which have the same
keys and sizes.
