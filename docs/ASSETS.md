# Rumah Teyot — Asset Contract

Owner: **Gemini (Antigravity)**. Consumer: Claude's game logic.

This file is the interface between the two agents. If the art needs something this spec does not
allow, change this file in a PR first. Do not quietly break the format.

All assets live under `assets/`. Nothing in `src/` is edited by the asset agent, and nothing in
`assets/` is edited by the logic agent, except placeholder files that Claude generates under
`src/placeholder/`.

---

## 1. Inputs from the parents

These are stored in `reference/`, which is **gitignored and never committed**:

| Input | Used for |
|---|---|
| 3–6 photos of her: face front and side, full body, typical hairstyle, favourite clothes | Character reference sheet |
| Floor plan sketch: rough is fine, with room names and positions, stairs, doors | House layout |
| A few photos per room: key furniture and colours | Room art |
| Photos of the family pet or a favourite toy (optional) | Companion |

**Only stylized illustrations are committed.** No photo, and no photo-realistic render of her,
goes into git or the deployed site.

## 2. Art direction

- **Look**: flat 2D illustration, soft rounded shapes, thick warm-dark outlines (not pure black),
  gentle shading at most one tone deep, no gradients on characters.
- **Mood**: warm, cosy, calm. This is a home, not a theme park. Low saturation for backgrounds,
  higher saturation for things she can interact with, so tappable items stand out.
- **Character**: chibi proportions (head ≈ 40% of height), large eyes, recognisably *her* (hair,
  skin tone, face shape), no exaggerated features.
- **Palette**: define once in `assets/style/palette.json` (≤ 24 colours plus the 10 coloring
  swatches) and reuse it everywhere.
- **No text inside images.** Every letter and word is rendered by the game, so Indonesian text and
  curriculum changes never need new art.
- **Consistency gate**: each new asset is reviewed side by side with `assets/style/reference-sheet.png`
  before merge (§8).

## 3. Character (her) and companion

### 3.1 Reference sheet (first deliverable)

`assets/style/reference-sheet.png` shows:
- front, three-quarter, and side views
- colour callouts
- 3 facial expressions (happy, focused, surprised)
- outfit base

Every later character asset must match this sheet.

### 3.2 Sprite sheet

- Facing **right only**. The game flips the sprite for left.
- Frame size **256 × 256 px**. Feet on a fixed baseline at y = 240, with her body centred
  horizontally.
- Transparent background, PNG, premultiplied alpha off.

| Animation key | Frames | FPS | Loop | Notes |
|---|---|---|---|---|
| `idle` | 4 | 6 | yes | Subtle breathing or blink |
| `walk` | 8 | 12 | yes | In-place walk cycle, no horizontal drift |
| `stairs_up` | 8 | 10 | yes | Side view on stairs |
| `celebrate` | 6 | 12 | no | Jump with arms up |
| `point` | 4 | 8 | no | Points forward, ends holding the pose |
| `think` | 4 | 6 | yes | Hand on chin, used while waiting for her answer |
| `sleep` | 4 | 4 | yes | In bed. Used by BedtimeScene. |

**Outfits** (unlockable rewards) are full re-renders of all animations using the same frame
grid, not overlays. That keeps the art simple and the rendering cheap.

The **companion** follows the same rules with frame size **128 × 128** and animations `idle`,
`walk`, `point`, `celebrate`.

## 4. House

### 4.1 Images

- Side-view cutaway, front wall removed, our real floor plan, simplified.
- Design canvas **3840 × 2160 px** (16:9). Export at 50% (1920 × 1080) for the game and keep the
  source at full size.
- Layers, each a separate PNG at the same canvas size:
  - `house/bg.png`: sky and outside. The game tints it for day and night.
  - `house/structure.png`: walls, floors, stairs
  - `house/rooms/<room-id>.png`: furniture for each room
  - `house/rooms/<room-id>_dim.png`: the locked look for each room
- Every walkable floor is a **flat horizontal line**. Stairs are a single straight diagonal.

### 4.2 `assets/house/layout.json`

Coordinates are in the 1920 × 1080 export space, with the origin at the top left.

```jsonc
{
  "size": [1920, 1080],
  "rooms": [
    {
      "id": "kamar-teyot",                 // kebab-case, stable forever
      "activity": "tracing",               // tracing | counting | coloring | reading | words | garden | bedtime
      "polygon": [[120, 80], [700, 80], [700, 480], [120, 480]],   // tap area
      "stand": [410, 470],                 // character feet position on arrival
      "floor": 470                         // y of this room's floor line
    }
  ],
  "waypoints": [
    { "id": "door-kamar", "pos": [700, 470] },
    { "id": "stairs-top", "pos": [900, 470] },
    { "id": "stairs-bottom", "pos": [1100, 990] }
  ],
  "edges": [["kamar-teyot", "door-kamar"], ["door-kamar", "stairs-top"], ["stairs-top", "stairs-bottom"]],
  "start": "ruang-tamu"
}
```

Rules:
- Room ids and waypoint ids together are unique.
- Every room is reachable from `start`.
- Every edge between waypoints is either horizontal (on a floor) or the stair diagonal.

The `tools/assets` validator checks all of these.

## 5. Activity art

| Asset | Path | Spec |
|---|---|---|
| Tracing surface (chalkboard / paper) | `tracing/surface.png` | 1920 × 1080, centre safe area 1080 × 900 kept plain |
| Pre-writing stroke themes | `tracing/themes/<stroke-id>.png` | Decoration around the path (rain clouds, road, ball). The path itself is drawn by the game. |
| Countable objects | `counting/objects/<id>.png` | 192 × 192, clear silhouette, each readable at 96 px. Ids: `apel`, `telur`, `kue`, `bola`, `ikan`, `bunga`… |
| Containers | `counting/containers/<id>.png` | Bowl, plate, basket, 512 × 384, with the drop zone marked in `counting/containers.json` |
| Stickers | `rewards/stickers/<item-id>.png` | 256 × 256, one per learnable item, no letters baked in (the game overlays the glyph) |
| Coloring pages | `coloring/<id>.png` | See §6 |
| UI | `ui/*.png` | Back (home) button, parent-gate corner icon, color swatches frame. All ≥ 144 × 144 px source. |
| App icons | `icons/` | 512 × 512 maskable plus 192 × 192, safe zone respected |

## 6. Coloring pages (strict)

Pages use **raster line art with runtime flood fill**, so AI-generated art works as is:

- 1920 × 1080 PNG, white background (`#FFFFFF`), line colour pure `#000000`, **no anti-aliasing
  grey in large patches**. Light anti-aliasing on the line edges is fine.
- Lines **≥ 6 px** thick at 1920 × 1080.
- **Every fillable region is closed.** No gaps wider than 2 px. The game runs a 2 px gap-closing
  pass when the page loads, so bigger gaps leak.
- Regions **≥ 40 × 40 px**. Smaller details are just drawn lines, not fillable areas.
- 6–15 regions per page at age 3.
- One subject per page, tied to a word: `coloring/ayam.png` (A), `coloring/bola.png` (B)…
- CI checks closure by flood-filling from a grid of seed points and flagging any region that
  touches the image border unexpectedly.

## 7. Export rules

- Format: PNG for sources in `assets/`. The build step packs them into **texture atlases**
  (≤ 2048 × 2048, WebP) per room, so do not hand-pack atlases.
- File names: `kebab-case`, ASCII only, no spaces.
- Every asset is registered in `assets/manifest.json`:

```jsonc
{
  "version": 1,
  "assets": [
    {
      "key": "character.teyot.default",
      "type": "spritesheet",                 // image | spritesheet | coloring | layout | palette
      "path": "character/teyot/default.png",
      "frame": [256, 256],
      "animations": { "idle": [0, 3], "walk": [4, 11] },
      "room": "global"                       // global | <room-id> — decides which bundle it ships in
    }
  ]
}
```

Claude owns the zod schema for this manifest in `src/content/schema/manifest.ts`. Additions to the
schema go through a PR that touches both files.

## 8. Review checklist (before merging an asset PR)

- [ ] Matches the reference sheet (proportions, colours, line weight)
- [ ] No text baked into images
- [ ] No photo or photo-realistic likeness of her
- [ ] Sizes and frame grid exactly as specified
- [ ] Registered in `manifest.json`
- [ ] `npm run validate:assets` passes
- [ ] Looked at on the actual Android tablet **and** phone

## 9. Delivery order

1. Palette + character reference sheet + companion concept
2. House layout (from the floor plan) + `layout.json` with 3 phase-1 rooms
3. Character `idle`, `walk`, `celebrate`, `sleep`
4. Phase-1 room art: tracing surface + pre-writing themes, counting objects 1–5 + bowl, 5 coloring
   pages
5. App icons
6. Phase-2 and later: stickers, outfits, remaining rooms, companion animations

Until each piece lands, the game runs on Claude's code-generated placeholders, which have the same
keys and sizes.
