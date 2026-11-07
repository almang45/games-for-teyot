# Rumah Teyot — Product Plan

Working title. A browser game, installed on Android as an app, that helps a 3-year-old learn to trace,
count, read, and color in Bahasa Indonesia. She plays as herself and walks around a drawing of her
own house. Each room is an activity, and her parents' recorded voices guide her.

Status: **planning**. No code yet.

---

## 1. Constraints

| Item | Decision |
|---|---|
| Player | Our daughter, 3 years old. Already knows numbers and some letters. Cannot read instructions. |
| Devices | Android phone and Android tablet, landscape. Touch only, no stylus. Tablet is the main device. |
| Language | Bahasa Indonesia for everything she sees and hears. The parent area may mix in English. |
| Voice | Recorded by Ayah and Ibu. No text-to-speech in the kid-facing game. |
| World | Our real house layout, drawn as a cutaway "dollhouse" view. The character is a stylized version of her. |
| Distribution | Standalone installable web app, hosted on Cloudflare Workers (static assets). |
| Team | Claude: game logic, engine, content data, CI/CD. Gemini (Antigravity): visuals and assets. See [`../AGENTS.md`](../AGENTS.md). |

## 2. Design principles for a 3-year-old

1. **No failure state.** Nothing buzzes, no lives, no timers. A wrong answer gets a hint (glow, voice,
   or demo) and she tries again. After 3 misses the game shows the answer and moves on.
2. **Voice first, zero text.** Every instruction is spoken. Icons and pictures carry meaning, and
   text only appears as the thing being learned (a letter or a word).
3. **Short sessions.** Each activity runs 2–4 minutes and a session about 10 minutes. The parent can
   change this.
4. **Big, forgiving touch targets.** At least 72 dp. Accept a tap on release, not on press. Ignore
   palm and multi-finger touches during tracing.
5. **Celebrate effort.** The voice praises the trying ("Hebat, kamu coba terus!"), not only the
   correct answers.
6. **Natural stopping point.** Daylight in the house fades as the session time runs out. At the end
   her character goes to the bedroom and sleeps. No pleading, no streak guilt.
7. **No manipulative mechanics.** No random-chance rewards, no ads, no notifications, no buying,
   no external links.

## 3. World: the house hub

- A side-view cutaway of our house. The front wall is removed so she sees every room at once.
- She **taps a room** and her character walks there: through doors, up the stairs. No joystick, no
  free roaming.
- A small companion (pet or toy, to be decided) follows her and points at rooms that have something
  new or something to review.
- Rooms that are not unlocked yet stay dim, with a soft "zzz" or locked-door look. They never show
  a padlock or an error.
- The house fills with progress over time: letter stickers on her bedroom wall, finished coloring
  pages on the fridge, plants in the garden.

### Room → activity mapping (draft)

Final assignment depends on the real floor plan. Map each activity to the room where it would
naturally happen in real life.

| Activity | Suggested room | In-world framing |
|---|---|---|
| Tracing (letters, numbers, pre-writing strokes) | Her bedroom / study corner | Chalkboard or table |
| Counting | Kitchen | Put eggs in the bowl, share cookies onto plates, count fruit |
| Coloring | Living room / play corner | Easel, finished pages hang on the fridge |
| Letter and name recognition | Living room bookshelf | Picture book that "reads aloud" |
| Syllables and words (phase 3) | Dining table | Shopping list, labels on jars |
| Shapes, colors, memory game (phase 4) | Garden / terrace | Flowers, butterflies, stepping stones |
| Session end | Her bedroom | Character goes to sleep |

## 4. Curriculum

Indonesian spelling is regular, so the plan follows the method Indonesian schools use: letter
sounds → open syllables (suku kata) → words.

### 4.1 Tracing (Menulis)

Motor skills come before letters, so tracing moves through these levels:

| Level | Content | Notes |
|---|---|---|
| T0 Pre-writing strokes | Vertical line (hujan turun), horizontal (jalan), circle (bola), diagonal, cross, zigzag (petir), wave (ombak) | Builds the strokes every letter uses. Always available as a warm-up. |
| T1 Digits 0–9 | Stroke-ordered digits | She already knows numbers, so early wins come fast. |
| T2 Uppercase, straight lines | L T I H E F A K M N V W X Y Z | Grouped by stroke type |
| T3 Uppercase, curves | O C G Q S U J D P B R | |
| T4 Lowercase | Grouped by shape: c o a d g q / l i t / n m h r / u y / b p / e s f k v w x z j | Single-storey **a** and **g** (school style) |
| Her name | The letters of her name are put first in every level | Most motivating word she knows |

Each glyph moves through these steps:

1. **Lihat**: an animated hand draws the glyph, and the voice names it.
2. **Ikuti**: thick guide path with a start dot and direction arrows. Each stroke unlocks after the
   previous one is done.
3. **Titik-titik**: dotted guide only.
4. **Sendiri**: only a faint outline remains. This step comes much later and is optional at age 3.

Scoring is deliberately loose for her age (details in `ARCHITECTURE.md` §4). When she gets close
enough, the stroke **snaps** onto the ideal path and sparkles. At 3, getting her to try matters more
than precision.

### 4.2 Counting (Berhitung)

She already says numbers, so the focus is **number sense**, not reciting:

| Level | Skill | Example |
|---|---|---|
| C1 | One-to-one correspondence | Tap each apple once and the voice counts along |
| C2 | Cardinality | "Berapa semuanya?" after counting |
| C3 | Subitizing 1–5 | Dot pattern flashes briefly, she picks the matching picture |
| C4 | Number → quantity | "Masukkan 4 telur ke mangkuk" |
| C5 | Quantity → number | Pick the numeral that matches the group |
| C6 | More / less | "Mana yang lebih banyak?" |
| C7 | Add with objects (phase 3) | 2 cookies + 1 cookie |

Range is 1–5 first, then 1–10. 11–20 only after the parent dashboard shows 1–10 is solid.

### 4.3 Letters and reading (Membaca)

| Level | Skill | Example |
|---|---|---|
| R1 | Letter recognition | "Cari huruf **m**" with 2–3 choices, grows as she improves |
| R2 | Letter sound | The voice says the sound /m/ and the letter name "em" |
| R3 | Her name | Spell her name with big letter tiles |
| R4 | Open syllables, consonant + vowel | ma mi mu me mo, ba bi bu be bo |
| R5 | Two-syllable words | ma + ma → **mama**, bo + la → **bola**, su + su → **susu** |
| R6 | Picture → word | Match a word to a picture of something in the house |

Notes:
- Teach vowels **a i u e o** first, then consonants in this order: m b p s t k n l d g r j.
- Indonesian **e** has two sounds: pepet /ə/ (*emas*) and taling /e/ (*ember*). Early word lists use
  only one per word and tag each word with which one. See `content/words.json` (to be created).
- Words come from things in **our** house and family: Ayah, Ibu, the pet's name, *meja*, *kursi*,
  *bola*.

### 4.4 Coloring (Mewarnai)

- **Tap-to-fill** by default: tap a closed area and it fills with the selected color. No precision
  needed.
- **Brush mode** later, as a free-drawing reward.
- 8–10 large color swatches. The voice names each color when tapped: *merah, kuning, biru*, and so on.
- Pages are tied to progress. Each letter learned unlocks one page (A = Ayam, B = Bola…), and
  finished pages appear on the fridge in the house.

## 5. Rewards and progression

- **Stickers**: one per mastered glyph or number, placed on her bedroom wall in the house.
- **Unlocks**: new coloring pages, outfits for her character, new rooms when a curriculum level opens.
- **Review**: rooms with items due for review get the companion's attention, chosen by spaced
  repetition (see `ARCHITECTURE.md` §5). She never sees a "due" list.

## 6. Parent area

- **Gate**: press and hold the corner icon for 3 s, then tap three spoken-as-text numbers in order
  ("tap 7, 2, 9"). A 3-year-old cannot read the prompt.
- **Dashboard**:
  - Mastery per glyph, number, and syllable
  - Time played
  - Which strokes she struggles with, with replays of her last attempts
- **Settings**:
  - Session length
  - Unlocked levels
  - Uppercase-first or lowercase-first
  - Child name
  - Tracing tolerance override
  - Which parent's voice is the narrator (Ayah / Ibu / alternate)
- **Data**: export and import progress as JSON (backup against Android clearing browser storage).
  Reset progress.

## 7. Android usage tips (parent-facing, goes in the README later)

- Install from Chrome → "Add to Home screen". It opens fullscreen in landscape.
- Turn on **App pinning** (Settings → Security → App pinning) so she cannot leave the game.
- Turn on Do Not Disturb during play.

## 8. Roadmap

Each phase ends with a playtest with her. Her reaction decides what changes next, not this
document.

### Phase 0: Foundations (no art needed)
- Repo scaffold, CI/CD to Cloudflare, installable offline app shell
- Placeholder art generated in code
- Asset manifest contract with Gemini, and the audio recording script for Ayah and Ibu
- **Done when**: the app installs on the tablet, opens offline, and plays a test voice clip on the
  first tap.

### Phase 1: First playable version (about 3 rooms)
- House hub with tap-to-walk between 3 rooms
- Tracing T0 + T1 (pre-writing strokes and digits 0–9)
- Counting C1–C4 for 1–5
- Tap-to-fill coloring with 5 pages
- Recorded voice clips for everything above
- Session timer with day-to-night fade and bedtime ending
- Progress saved on the device, plus JSON export
- **Done when**: she plays one 10-minute session on her own, apart from the parent starting it.

### Phase 2: Letters
- Tracing T2–T4 (all uppercase and lowercase, her name first)
- Letter recognition and sounds R1–R3
- Stickers, outfits, the companion
- Parent dashboard with stroke replays
- Spaced-repetition review

### Phase 3: Reading and more counting
- Syllables and words R4–R6
- Counting C5–C7, range up to 10
- Remaining rooms and full house art

### Phase 4: Extras
- Garden: shapes, colors, memory game
- Brush mode for coloring
- Printable worksheets for each letter (writing on paper and on glass are different skills)
- Optional sync across devices (Cloudflare D1 + Access). Only if two devices really need shared
  progress.

## 9. Privacy

The game uses her likeness, our house layout, and our voices.

- The repo is **private** and must stay private.
- **Raw photos never go into git.** Reference photos of her and the house stay in `reference/`,
  which is gitignored, or outside the repo. Only stylized, illustrated output is committed.
- The deployed site sits behind **Cloudflare Access**, limited to family Google accounts. The app
  still works offline once installed, because the service worker serves the cached copy (see
  `ARCHITECTURE.md` §8).
- No analytics, no third-party scripts, no remote fonts. All data stays on the device unless
  phase-4 sync is turned on.

## 10. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Tracing too strict or too loose | Frustration, or no learning | Tolerance adapts to her success rate. Parent override. Snap-to-path. Real playtests from phase 1. |
| Small phone screen | Tracing area cramped | Tablet is the main device. On the phone, tracing fills the full height, house view zooms and pans. |
| Chrome clears stored data | Progress lost | Ask the browser for persistent storage. JSON export. Optional D1 sync. |
| AI-generated art inconsistent across rooms | World looks patchy | Style guide plus a locked character reference sheet. Every asset reviewed against the reference sheet before merge. See `ASSETS.md`. |
| AI line art has gaps | Tap-to-fill leaks color | Gap-closing pass when the page loads, plus validation in CI (`ASSETS.md` §6) |
| Recording more than 300 voice clips is tedious | Phase slips | The script is generated from content and grouped by session. Record per phase, not all at once. |
| Too much screen time | Health | Session limit and bedtime ending built in. Printable worksheets in phase 4. |

## 11. Open decisions

| Decision | Owner | Needed by |
|---|---|---|
| Final game name ("Rumah Teyot" is a placeholder) | Parents | Phase 1 (app icon/name) |
| Floor plan + which room hosts which activity | Parents → Gemini | Phase 0 end |
| Companion: family pet, favourite toy, or new character | Parents | Phase 1 |
| Default narrator (Ayah / Ibu / alternate) | Parents | Phase 1 audio session |
| Uppercase-first or lowercase-first for T2–T4 (her playgroup/TK may already have a preference) | Parents | Phase 2 |
