# Object Inventory — House Props & Style Test

Deliverable 1 for Step 3 of Papa's hold review (2026-11-12).

This inventory catalogs every furniture and prop piece across the family's split-level home based on the private reference photos (`reference/rumah/<lantai>-<room>/`) and video keyframes (`reference/frames/rumah/`), mapped against the 19 prop keys and 20 cm grid footprints in `reference/rumah/blockout/layout.json`.

In accordance with `AGENTS.md`:
- Pure written descriptions only — no photos are pasted, traced, or committed.
- Dimensions follow the 20 cm blockout grid (1 cell = 20 cm, 76 × 38 px at 2× canvas, 190 px/m).
- Findings on missing items and size/placement corrections are cataloged below for Claude to update in `reference/rumah/denah/floorplan.json` so the blockout can be regenerated cleanly.

---

## 1. Dapur (Lt. Dasar, FFL ±0.00)

### `house.props.dapur.kulkas`
- **Layout Rect**: `[846, 515, 114, 209]` (2× asset: `228 × 418 px`)
- **Base Footprint**: `[[903, 667], [960, 695], [903, 724], [846, 695]]` (3 × 3 cells, 60 × 60 cm) against wall `x0`.
- **Real Appearance in Photos** (`area-dapur.jpg`, `posisi-kulkas/frame-01–12.jpg`):
  - **Form & Type**: Tall, modern 2-door freestanding refrigerator with upper freezer and larger lower cooling compartment.
  - **Color & Material**: Dark charcoal slate / metallic black gloss finish with subtle vertical lighting reflections. Recessed horizontal pocket handle along the mid-door split.
  - **Details to Keep**:
    - Pinned to the upper door: Theia's colourful crayon drawing secured by a cute pink bunny magnet (referencing Bubu).
    - Front lower door: Cluster of colorful kid magnets, star/fruit shapes, and family notes.
    - Side handle: Little brown plush teddy bear towel hook loop.
  - **In-Game Role**: Active display spot (`spots.fridge`) where Theia's completed coloring pages hang (`SCR-COLOR` output).

### `house.props.dapur.kitchen-set`
- **Layout Rect**: `[713, 619, 190, 171]` (2× asset: `380 × 342 px`)
- **Base Footprint**: `[[846, 695], [903, 724], [770, 790], [713, 762]]` (10 × 3 cells, 200 × 60 cm) along wall `x0`.
- **Real Appearance in Photos** (`area-dapur.jpg`):
  - **Form & Type**: Built-in lower kitchen counter cabinet unit spanning from the back wall to the fridge.
  - **Color & Material**: Warm deep walnut woodgrain laminate base doors with brushed metal curved handles; solid dark grey/granite countertop work surface.
  - **Details to Keep**:
    - Integrated stainless steel single sink with tall arched gooseneck faucet located center-right.
    - Two-burner black tempered-glass built-in gas stove top on the left counter.
    - Compact two-tier stainless dish drying rack next to sink with mugs, toddler cups, and plates.
    - Child safety latches visible on cabinet drawer corners.
    - Backsplash: Mirrored / dark reflective splashback tile above the counter.

### `house.props.dapur.lemari-atas`
- **Layout Rect**: `[713, 486, 171, 162]` (2× asset: `342 × 324 px`)
- **Base Footprint**: `[[846, 562], [884, 581], [751, 648], [713, 629]]` (10 × 2 cells, 200 × 40 cm). Hanging wall cabinet, underside ~140 cm from floor.
- **Real Appearance in Photos** (`area-dapur.jpg`):
  - **Form & Type**: Wall-mounted upper kitchen cabinetry directly above the kitchen counter.
  - **Color & Material**: Matching rich dark walnut woodgrain finish with clean flush lower door overhangs (handleless).
  - **Details to Keep**:
    - Under-cabinet warm LED task strip lighting casting a cosy ambient glow onto the countertop and dish rack.
    - Hanging utensil rail beneath cabinet holding ladles, spatulas, and small strainers.

### `house.props.dapur.meja-makan`
- **Layout Rect**: `[846, 690, 209, 176]` (2× asset: `418 × 352 px`)
- **Base Footprint**: `[[979, 762], [1055, 800], [922, 866], [846, 828]]` (10 × 3 cells, 200 × 60 cm).
- **Real Appearance in Photos** (`area-dapur.jpg`, `ruang-keluarga.jpg`):
  - **Form & Type**: High dining bar table / breakfast island acting as the architectural divider between kitchen and living room.
  - **Color & Material**: Modern industrial design: textured slate grey / cast concrete-look tabletop on a sturdy black powder-coated steel tube frame with rectangular leg trestles.
  - **Details to Keep**:
    - Serves as the interactive anchor for the counting activity (`SCR-COUNT` plates, cookie containers, fruit bowls).
    - In photos, countertop holds a white UV bottle sterilizer unit, pastel drinking tumblers, and condiment bottles.
    - Right end connects with a black multi-tier wire appliance rack holding the electric rice cooker and hot water kettle.

### `house.props.dapur.kursi-makan-1` & `house.props.dapur.kursi-makan-2`
- **Layout Rect**: `[884, 709, 76, 81]` and `[827, 738, 76, 81]` (2× asset: `152 × 162 px` each)
- **Base Footprint**: 2 × 2 cells (40 × 40 cm) each, tucked partially beneath the bar table facing into the kitchen.
- **Real Appearance in Photos** (`area-dapur.jpg`):
  - **Form & Type**: Elevated wooden bar stools with backrests and footrest rungs.
  - **Color & Material**: Charcoal grey / black painted timber frames.
  - **Details to Keep**: Playful kid stickers decorated on the rear panel of the seat backs.

### `house.props.dapur.kotak-mainan`
- **Layout Rect**: `[713, 743, 76, 209]` (2× asset: `152 × 418 px`)
- **Base Footprint**: `[[751, 914], [789, 933], [751, 952], [713, 933]]` (2 × 2 cells, 40 × 40 cm, height ~140 cm).
- **Real Appearance in Photos** (`ruang-keluarga-1.jpg`):
  - **Form & Type**: 6-tier modular stackable clear plastic toy organizer drawer tower (`menara laci bening`).
  - **Color & Material**: Transparent / frosted polycarbonate front drop-down doors with round dark latches; off-white / light cream plastic framing rims between tiers.
  - **Details to Keep**:
    - Filled with Theia's colourful toys, activity books, stacking cups, and craft sets.
    - Pinned / visible inside top compartment: Cute plush stuffed panda sitting happily facing forward.
  - **In-Game Role**: Tidy-up / toybox anchor for the living room cleaning activity (`SCR-TIDY`).

---

## 2. Ruang Keluarga (Lt. Dasar, FFL ±0.00)

### `house.props.ruang-keluarga.sofa`
- **Layout Rect**: `[1036, 686, 323, 237]` (2× asset: `646 × 474 px`)
- **Base Footprint**: `[[1131, 762], [1359, 876], [1264, 923], [1036, 809]]` (12 × 5 cells, 240 × 100 cm).
- **Real Appearance in Photos** (`ruang-keluarga.jpg`):
  - **Form & Type**: Large, plush modular L-shape / sectional sofa with an attached chaise and a separate rectangular matching ottoman bench.
  - **Color & Material**: Upholstered in dark charcoal / slate grey textured woven fabric with neat button/stitch tufting on the seat cushions.
  - **Details to Keep**:
    - Segmented backrest cushions with adjustable pillow-top headrests along the upper edge.
    - Wide, padded boxy armrests.
    - Placed along the sofa backrest against the rear wall is a delightful row of stuffed animal plushies:
      - Lotso bear (strawberry pink with magenta nose)
      - Chubby brown bear doll
      - Soft white bunny plushie
    - Warm ochre-mustard knit throw blanket folded over the chaise corner.
  - **Placement**: Sits facing the TV wall, with its back facing the dining bar counter.

### `house.props.ruang-keluarga.rak-tv`
- **Layout Rect**: `[808, 885, 114, 133]` (2× asset: `228 × 266 px`)
- **Base Footprint**: `[[846, 961], [922, 999], [884, 1018], [808, 980]]` (6 × 2 cells, 120 × 40 cm).
- **Real Appearance in Photos** (`ruang-keluarga.jpg`, `ruang-keluarga-1.jpg`):
  - **Form & Type**: Low-profile media console unit standing below the television.
  - **Color & Material**: Warm natural medium-toned wood tabletop and shelves with a dark metal frame.
  - **Details to Keep**: Multi-tier shelves loaded with family baskets, Theia's toy boxes, tissue box, remote controls, and storybooks.

### `house.props.ruang-keluarga.tv`
- **Layout Rect**: `[808, 800, 133, 142]` (2× asset: `266 × 284 px`)
- **Base Footprint**: `[[827, 876], [941, 933], [922, 942], [808, 885]]` (7 × 1 cells, 140 × 20 cm). Mounted on wall partition.
- **Real Appearance in Photos** (`ruang-keluarga.jpg`, `ruang-keluarga-1.jpg`):
  - **Form & Type**: Large widescreen flat-panel smart television (~55 inch).
  - **Color & Material**: Ultra-thin black bezel, glossy dark display surface with subtle soft ambient room reflection.
  - **Mounting**: Mounted securely against the vertical dark walnut wood slat partition wall.

### `house.props.ruang-keluarga.meja-bulat`
- **Layout Rect**: `[922, 914, 114, 114]` (2× asset: `228 × 228 px`)
- **Base Footprint**: `[[979, 971], [1036, 999], [979, 1028], [922, 999]]` (3 × 3 cells, 60 × 60 cm).
- **Real Appearance in Photos** (`ruang-keluarga.jpg`, `ruang-keluarga-1.jpg`, `tangga-1.jpg`):
  - **Form & Type**: Low circular toddler activity / play table placed on the living room floor between the sofa and TV console.
  - **Color & Material**: Warm natural oak/blonde wood circular top with three slender dark splayed legs.
  - **Details to Keep**:
    - Covered with Theia's toddler art materials: colourful playdough cups, plastic sorting containers, crayon tins, and small toy accessories.
    - Paired with a bright orange moulded plastic toddler chair (`kursi-anak`).

---

## 3. Ceruk Jendela (Front Facade Bay Window Alcove)

### `house.props.ceruk-jendela.bangku-jendela`
- **Layout Rect**: `[1055, 933, 228, 152]` (2× asset: `456 × 304 px`)
- **Base Footprint**: `[[1245, 971], [1283, 990], [1093, 1085], [1055, 1066]]` (10 × 2 cells, 200 × 40 cm).
- **Real Appearance in Photos** (`ruang-keluarga-1.jpg`, `tangga-1.jpg`):
  - **Form & Type**: Built-in recessed bay window bench nook overlooking the front yard.
  - **Color & Material**: Solid white painted bench base topped with a thick upholstered foam bench cushion in charming dark periwinkle / navy blue fabric dotted with white polka dots.
  - **Details to Keep**: Cosy throw pillows and warm afternoon sunlight streaming in through the front window blinds.

---

## 4. Ruang Tangga (Stairway Hall & Partitions)

### `house.props.ruang-tangga.rak-belakang-tv`
- **Layout Rect**: `[770, 828, 152, 228]` (2× asset: `304 × 456 px`)
- **Base Footprint**: `[[808, 980], [922, 1037], [884, 1056], [770, 999]]` (4 × 2 cells, 80 × 40 cm).
- **Real Appearance in Photos** (`ruang-keluarga-1.jpg`, `tangga-1.jpg`, `tangga-2.jpg`):
  - **Form & Type**: Architectural dark walnut wood vertical partition structure dividing the living room TV wall from stair flight 2.
  - **Color & Material**: Deep walnut wood veneer paneling matching internal doors.
  - **Details to Keep**:
    - Integrated open display niches facing onto the staircase steps.
    - Upper niche holds Papa's Sony PlayStation 5 gaming console with a custom swirling graphic faceplate, paired with a crimson-red DualSense controller on a mini dock.
    - Lower niche holds neat white storage caddies with tech accessories.

---

## 5. Kantor Papa (Mezzanine 1, FFL +2.40, Sleepy/Locked in M1)

### `house.props.kantor-papa.meja-kerja`
- **Layout Rect**: `[523, 429, 209, 181]` (2× asset: `418 × 362 px`)
- **Base Footprint**: `[[580, 505], [732, 581], [675, 610], [523, 534]]` (6 × 3 cells, 120 × 60 cm).
- **Real Appearance in Photos** (`mezzanine-1-kantor-papa/kamar-kerja-papa.jpg`, `tangga-2.jpg`):
  - **Form & Type**: Papa's dedicated work desk setup with wall organizer and office chair.
  - **Color & Material**: Deep walnut wooden desk top with matte black steel legs; high-back ergonomic black leather office rolling chair.
  - **Details to Keep**:
    - Mounted directly above the desk is a natural beechwood pegboard organizer equipped with metal hooks holding over-ear gaming headphones, white game controllers, and USB cables.
    - In the corner beside the desk sits a bright red travel suitcase with a black laptop duffel bag.
    - White split AC unit mounted high on the back wall.
    - Fluted frosted-glass privacy partition along the staircase hallway.

---

## 6. Kamar Tidur Utama (Lt. Atas, FFL +3.40)

### `house.props.kamar-tidur.kasur`
- **Layout Rect**: `[1074, 467, 342, 209]` (2× asset: `684 × 418 px`)
- **Base Footprint**: `[[1264, 505], [1416, 581], [1226, 676], [1074, 600]]` (8 × 10 cells, 160 × 200 cm queen size).
- **Real Appearance in Photos** (`atas-kamar-tidur/kamar-tidur-1.jpg`, `kamar-tidur-2.jpg`):
  - **Form & Type**: Queen-size master platform bed with solid base incorporating pull-out under-bed storage drawers.
  - **Color & Material**: Dark brown walnut wooden platform base; tailored rectangular padded headboard upholstered in textured light grey fabric.
  - **Details to Keep**:
    - Dressed in Theia's signature pale mint/sage green bedsheet printed with adorable colourful miniature cartoon dinosaurs and palm trees (`#d4e9d7`).
    - Two matching mint dinosaur sleeping pillows at the headboard.
    - Two matching mint dinosaur bolsters (`guling`) with white tied ends.
    - Papa's distinctive black-and-white vertical striped Juventus bolster lying along the right side!
    - Folded neat blankets at the foot of the bed: a soft grey animal-print fleece blanket layered over a plush pastel pink blanket.
  - **In-Game Role**: Key anchor for bedtime storytelling and ending sequence (`SCR-BEDTIME`).

### `house.props.kamar-tidur.lemari`
- **Layout Rect**: `[827, 410, 209, 333]` (2× asset: `418 × 666 px`)
- **Base Footprint**: `[[884, 638], [1036, 714], [979, 743], [827, 667]]` (12 × 3 cells, 240 × 60 cm).
- **Real Appearance in Photos** (`atas-kamar-tidur/kamar-tidur-2.jpg`):
  - **Form & Type**: Built-in full-height wardrobe closet spanning the left wall from floor to ceiling.
  - **Color & Material**: Dark walnut woodgrain finish matching the room doors, clean vertical door lines with minimalist edge pulls.

### `house.props.kamar-tidur.meja-rias`
- **Layout Rect**: `[979, 638, 133, 143]` (2× asset: `266 × 286 px`)
- **Base Footprint**: `[[1036, 714], [1112, 752], [1055, 781], [979, 743]]` (5 × 2 cells, 100 × 40 cm).
- **Real Appearance in Photos** (`atas-kamar-tidur/kamar-tidur-1.jpg`, `denah`):
  - **Form & Type**: Compact dressing vanity table and vertical mirror nestled beside the bedroom entrance.
  - **Color & Material**: Matching natural dark timber with small drawers and surface caddies for accessories.

---

## 7. Kamar Anak (Mezzanine 2, FFL +4.80, Sleepy/Locked in M1)

### `house.props.kamar-anak.kasur`
- **Layout Rect**: `[485, 296, 285, 171]` (2× asset: `570 × 342 px`)
- **Base Footprint**: `[[675, 325], [770, 372], [580, 467], [485, 420]]` (5 × 10 cells, 100 × 200 cm).
- **Real Appearance in Photos** (`mezzanine-2-kamar-anak/kamar-anak.jpg`):
  - **Form & Type**: Low Montessori floor mattress / daybed positioned over foam play flooring in the corner.
  - **Color & Material**: Cream quilted mattress topper with blue and sunny yellow cartoon character blankets.
  - **Details to Keep**: Protective interlocking woodgrain foam play mats lined against the corner wall. Floor is warm blonde wood-look vinyl plank.

### `house.props.kamar-anak.lemari`
- **Layout Rect**: `[352, 201, 133, 219]` (2× asset: `266 × 438 px`)
- **Base Footprint**: `[[428, 353], [485, 382], [409, 420], [352, 391]]` (4 × 3 cells, 80 × 60 cm).
- **Real Appearance in Photos** (`mezzanine-2-kamar-anak/kamar-anak.jpg`):
  - **Form & Type**: Child-height freestanding wardrobe cabinet standing against the right wall.
  - **Color & Material**: Scandinavian natural light blonde oak veneer with two clean flush doors.
  - **Details to Keep**: Above the cabinet runs a long floating wooden display shelf holding framed baby photos, a cuddly cream teddy bear, and keepsake boxes.

---

## 8. Missing Items & Discrepancies Catalog

The following elements are prominent in the actual reference photos and video stills, but are either missing from the blockout or have placement/room classification discrepancies. **Per instructions, these are listed here for Claude to incorporate into `floorplan.json` so the blockout can be regenerated; Antigravity does not edit the plan directly.**

### A. Missing Physical Elements in Reference Photos
1. **White Baby Safety Gate (`pagar-tangga`)**:
   - *Location*: At the top of `tangga-1` right before `bordes-1` (visible in `tangga-1.jpg`).
   - *Significance*: Very prominent real-life safety feature in the house preventing toddler access up the stairs; adds immediate authentic storytelling and domestic coziness.
2. **Tall Utility Bookshelf on Stair Landing (`rak-buku-tangga`)**:
   - *Location*: On `bordes-1` against the toilet wall (visible in `tangga-1.jpg`).
   - *Real dimensions*: ~40 × 40 × 120 cm (2 × 2 cells). Holds household supplies and storage basket.
3. **Standing Fan & Water Gallon (`kipas-angin`, `galon-air`)**:
   - *Location*: Living room corner between `kotak-mainan` and `rak-tv` (visible in `ruang-keluarga-1.jpg`).
   - *Real details*: Tall black standing oscillating fan and a 19L blue Aqua gallon with white automatic pump dispenser.
4. **Orange Toddler Chair (`kursi-anak`)**:
   - *Location*: Beside `meja-bulat` in `ruang-keluarga` (visible in `ruang-keluarga.jpg`, `ruang-keluarga-1.jpg`).
   - *Real details*: Bright orange moulded plastic toddler chair where Theia sits while drawing or playing with playdough.
5. **Floating Wall Storybook Shelves (`rak-buku-dinding`)**:
   - *Location*: Master bedroom wall directly to the left of the bed (visible in `atas-kamar-tidur/kamar-tidur-1.jpg`).
   - *Real details*: Two-tier shallow wooden book ledges displaying children's picture book covers facing outward and a green felt cactus ornament.
6. **Master Bedroom Sliding Bathroom Door & Alphabet Poster**:
   - *Location*: Dividing wall between `kamar-tidur` and ensuite `kamar-mandi` (visible in `kamar-tidur-2.jpg`).
   - *Real details*: Dark timber sliding barn-door mechanism with a colourful printed alphabet learning chart ("Alfabet Aa Bb Cc...").
7. **Appliance Wire Tier Rack in Kitchen (`rak-alat-dapur`)**:
   - *Location*: Connected to the living-room end of `meja-makan` (visible in `area-dapur.jpg`, `ruang-keluarga.jpg`).
   - *Real details*: Black powder-coated wire shelf holding the rice cooker, electric kettle, and sterilizer.
8. **Plush Toy Row on Sofa Back**:
   - *Location*: Along the top ledge of the sofa back against the wall (visible in `ruang-keluarga.jpg`).
   - *Real details*: Lotso bear, brown bear, and character dolls.

### B. Classification & Placement Discrepancies in `layout.json`
1. **`house.props.dapur.kotak-mainan` Room Assignment**:
   - Currently assigned to room `dapur` in `layout.json` (`[713, 743, 76, 209]`).
   - In physical reality, this modular drawer tower faces the living room and sits at the foot of the stair partition. Functionally, it is the living room toy storage (`SCR-TIDY`).
2. **`house.props.ruang-tangga.rak-belakang-tv` Room Assignment**:
   - Currently has `room: undefined` in `layout.json`.
   - It forms the physical back of the TV unit facing `tangga-2`. If room assignment is required for dimming or sorting, it belongs to `ruang-keluarga` or `ruang-tangga`.
3. **Bay Window Bench (`ceruk-jendela.bangku-jendela`)**:
   - Currently has `room: undefined` in `layout.json`.
   - Functionally an extension of `ruang-keluarga` seating.
