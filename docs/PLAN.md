# Rumah Cici Theia — Product Plan

A browser game, installed on Android as an app, that helps a 3-year-old learn to trace,
count, read, and color in Bahasa Indonesia. She plays as herself and walks around a drawing of her
own house. Each room is an activity, and her parents' recorded voices guide her.

Status: **planning**. No code yet.

---

## 1. Constraints

| Item | Decision |
|---|---|
| Player | Our daughter, 3 years old. Already knows numbers and some letters. Cannot read instructions. |
| Devices | Mama's Android phone (**main device**), plus Papa's phone and an Android tablet now and then. Landscape, touch only, no stylus. **Secondary**: MacBook and Windows laptop, **no touchscreen** (mouse or trackpad). Tracing practice only counts on touch devices. |
| Language | Bahasa Indonesia for everything she sees and hears. The parent area may mix in English. |
| Voice | Recorded by Papa and Mama. No text-to-speech in the kid-facing game. |
| World | Our real house layout, drawn as an **isometric cutaway diorama** in the style of the sticker-book dollhouses she loves. The character is a stylized version of her. |
| Distribution | Standalone installable web app, hosted on Cloudflare Workers (static assets). |
| Team | Claude: architect and core developer. Antigravity: UI/UX designer and prototyper. Papa approves every gate. See [`WORKFLOW.md`](WORKFLOW.md) and [`../AGENTS.md`](../AGENTS.md). |

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

- An **isometric cutaway diorama** of our house, like her favourite sticker-book dollhouses. The
  front walls are removed so she sees every room at once. Tapping a room zooms the camera into it,
  so each room becomes its own little diorama scene.
- She **taps a room** and her character walks there: through doors, up the stairs. No joystick, no
  free roaming.
- Her two favourite dolls come along as **companions**. They never talk (only the parents' voices
  speak) and react with cute sound effects and animation instead:

  | Companion | Looks | Personality and job |
  |---|---|---|
  | **Bubu** | Pink, slim bunny | Quick and curious. Hops ahead and **points** at rooms with something new or due for review. Demonstrates a new activity first, for example drawing the "Lihat" stroke with its paw. |
  | **Ocica** | White, fat bunny | Calm and cuddly. Waddles behind and **comforts** her after a miss with a hug and a soft "coba lagi". Cheers at successes and sleeps next to her in the bedtime ending. |

  - The two parts are deliberate. Bubu draws her toward what's next, Ocica makes a mistake feel
    safe.
  - Both appear in the counting and coloring scenes as extras: Ocica "eats" the cookies she counts,
    Bubu holds up the color palette.
- Rooms that are not unlocked yet stay dim, with a soft "zzz" or locked-door look. They never show
  a padlock or an error.
- **Mama and Papa appear in the house too**, as characters attached to their voices. A 3-year-old
  follows an instruction better when she can see who is talking.

  | Where | What they do |
  |---|---|
  | Activity scenes | The narrator's **portrait** sits in a corner and its mouth moves while the clip plays. The portrait is Mama by default, Papa when he's the narrator or for his praise clips. |
  | House hub | Each stands in "their" spot (e.g. Mama in the kitchen, Papa on the sofa) and waves when she enters the room |
  | Bedtime ending | Mama (or Papa) tucks her in, with Bubu and Ocica beside her |

  - They are guides only: not playable, and never shown being disappointed.
  - **Mama** and **papa** are also the first reading words (ma + ma, pa + pa), and R6 shows their
    portraits as the pictures to match.
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
| Syllables and words (M3) | Dining table | Shopping list, labels on jars |
| Shapes, colors, memory game (M4) | Garden / terrace | Flowers, butterflies, stepping stones |
| Tidy-up breaks ("Beberes") | Wherever Bubu and Ocica made a mess | Tidy the toys (M1). Make the bed, wipe spilled water, pair the shoes, sort the toys (M2). |
| Session end | Her bedroom | Character goes to sleep |

## 4. Curriculum

Indonesian spelling is regular, so the plan follows the method Indonesian schools use: letter
sounds → open syllables (suku kata) → words.

### 4.1 Tracing (Menulis)

Motor skills come before letters, so tracing moves through these levels. **Lowercase comes
first**, because that's what she reads in books and how Indonesian TK/SD teaches writing.
Uppercase comes later.

| Level | Content | Notes |
|---|---|---|
| T0 Pre-writing strokes | Vertical line (hujan turun), horizontal (jalan), circle (bola), diagonal, cross, zigzag (petir), wave (ombak) | Builds the strokes every letter uses. Always available as a warm-up. |
| T1 Digits 0–9 | Stroke-ordered digits | She already knows numbers, so early wins come fast. |
| T2 Lowercase, lines and the "c" family | l i t, then c o a d g q | All of the c family start with the same counterclockwise "c" movement as T0's circle. Single-storey **a** and **g** (school style). |
| T3 Lowercase, rest | Humps n m h r · cups and tails u y j · b p · e s f k v w x z | Shown on a simple baseline with x-height guide lines |
| T4 Uppercase | Straight lines L T I H E F A K M N V W X Y Z, then curves O C G Q S U J D P B R | Starts once lowercase is mostly mastered |
| Her name: **Theia** | t h e i a are put first in every level | Most motivating word she knows. Her name is the **one exception** to lowercase-first: the capital **T** is taught early, inside her name only. |

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
| C7 | Add with objects (M3) | 2 cookies + 1 cookie |

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
- Words come from things in **our** house and family: Papa, Mama, **Bubu**, *meja*, *kursi*,
  *bola*. Bubu (bu + bu) is a perfect first two-syllable word. Ocica (o + ci + ca) comes later.

### 4.4 Coloring (Mewarnai)

- **Tap-to-fill** by default: tap a closed area and it fills with the selected color. No precision
  needed.
- **Brush mode** later, as a free-drawing reward.
- 8–10 large color swatches. The voice names each color when tapped: *merah, kuning, biru*, and so on.
- Pages are tied to progress. Each letter learned unlocks one page (A = Ayam, B = Bola…), and
  finished pages appear on the fridge in the house.

## 5. Rewards and progression

- **Stickers**: one per mastered glyph or number, placed on her bedroom wall in the house.
- **Bubu and Ocica react**: a special celebration dance when she masters a whole level.
- **Unlocks**: new coloring pages, outfits for her character, new rooms when a curriculum level opens.
- **Review**: rooms with items due for review get Bubu's attention, chosen by spaced
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
  - Lowercase-first (default) or uppercase-first
  - Child name
  - Tracing tolerance override
  - Which parent's voice is the narrator: **Mama (default)**, Papa, or alternate
- **Data**: export and import progress as JSON (backup against Android clearing browser storage).
  Reset progress.

## 7. Device usage tips (parent-facing, goes in the README later)

Laptops (MacBook, Windows):
- Install it as an app so it opens fullscreen without browser tabs:
  - Chrome or Edge: the install icon in the address bar.
  - Safari on macOS 14+: File → Add to Dock. On a Mac, play **only** from the Dock app or from
    Chrome. In a plain Safari tab, Safari deletes stored data after 7 days without a visit, and
    progress would disappear.
- There is no App pinning. Use the installed app fullscreen, and optionally a separate macOS or
  Windows user account for her.

Android:

- Install from Chrome → "Add to Home screen". It opens fullscreen in landscape.
- Turn on **App pinning** (Settings → Security → App pinning) so she cannot leave the game.
- Turn on Do Not Disturb during play.

## 8. Roadmap

The roadmap is split into milestones **M0–M4**. Each milestone goes through the 5-phase workflow
in [`WORKFLOW.md`](WORKFLOW.md): PRD → design → integration → testing → review. Each one ends with
a playtest with her. Her reaction decides what changes next, not this document.

### M0: Foundations (no art needed)
- Repo scaffold, CI/CD to Cloudflare, installable offline app shell
- Placeholder art generated in code
- Asset manifest contract with Antigravity, and the audio recording script for Papa and Mama
- **Done when**: the app installs on Mama's phone, opens offline, and plays a test voice clip on the
  first tap.

### M1: First playable version (about 3 rooms)
- House hub with tap-to-walk between 3 rooms
- Tracing T0 + T1 (pre-writing strokes and digits 0–9)
- Counting C1–C4 for 1–5
- Tap-to-fill coloring with 5 pages (Bubu, Ocica, a dinosaur, a flower, a cat)
- One tidy-up break: tidy the toys
- Recorded voice clips for everything above
- Session timer with day-to-night fade and bedtime ending
- Progress saved on the device, plus JSON export
- **Done when**: she plays one 10-minute session on her own, apart from the parent starting it.

### M2: Letters
- Tracing T2–T4 (lowercase, then uppercase, her name first)
- Letter recognition and sounds R1–R3
- More tidy-up breaks: make the bed, wipe spilled water, pair the shoes, sort the toys
- Stickers, outfits, Bubu and Ocica's full animation set
- Parent dashboard with stroke replays
- Spaced-repetition review

### M3: Reading and more counting
- Syllables and words R4–R6
- Counting C5–C7, range up to 10
- Remaining rooms and full house art

### M4: Extras
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
  M4 sync is turned on.

## 10. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Tracing too strict or too loose | Frustration, or no learning | Tolerance adapts to her success rate. Parent override. Snap-to-path. Real playtests from M1. |
| Small phone screen | Tracing area cramped, and the phone is the main device | Tracing fills the full height, with a corridor floor in millimetres set by the spike. The house view zooms and pans without needing a pinch. Touch targets are checked in dp on the phone (`contracts/`). |
| Chrome clears stored data | Progress lost | Ask the browser for persistent storage. JSON export. Optional D1 sync. |
| AI-generated art inconsistent across rooms | World looks patchy | Style guide plus a locked character reference sheet. Every asset reviewed against the reference sheet before merge. See `ASSETS.md`. |
| AI line art has gaps | Tap-to-fill leaks color | Gap-closing pass when the page loads, plus validation in CI (`ASSETS.md` §6) |
| Recording more than 300 voice clips is tedious | Milestone slips | The script is generated from content and grouped by session. Record per milestone, not all at once. |
| Too much screen time | Health | Session limit and bedtime ending built in. Printable worksheets in M4. |

## 11. Open decisions

| Decision | Owner | Needed by |
|---|---|---|
| Floor plan + which room hosts which activity | Parents → Antigravity | M0 end |
| Photos of Bubu and Ocica (the real dolls) for the companion reference sheet | Parents → Antigravity | M0 end |
| Photos of Mama and Papa for their reference sheet. They stay in `reference/` and are never committed. | Parents → Antigravity | M0 end |
| Where Mama and Papa stand in the house hub | Parents | M2 |

Decided (2026-11-07):
- Companions are her two dolls, **Bubu** (pink, slim bunny) and **Ocica** (white, fat bunny).
- Tracing is **lowercase-first**.
- The parents are **Mama** and **Papa**, and Mama is the default narrator.
- The game's name is **Rumah Cici Theia**.
- (2026-11-09, PR #2 review) The voice lines call her **"Theia"**.
  - Devices: Galaxy Tab S10+, Pixel 6, Galaxy A52s, MacBook M4, Lenovo 14". (2026-11-11: Mama's
    Galaxy A52s is the main device; the tablet is occasional.)
  - Domain: `rct.amns.my.id`.
  - Sound effects: CC0, curated by Claude.
  - Cooldown can be turned off by a parent.
  - Progress stays per device.
  - Tidy-up breaks added.
- Mama and Papa get **their own characters**: portraits from M1, full house sprites in
  M2.
