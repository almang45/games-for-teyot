# Rumah Cici Theia — Voice Recording Guide

The parents record every voice clip. This document covers what to record, how to record it, and
what the pipeline does with the files.

---

## 1. Voices and roles

| Setting | Behaviour |
|---|---|
| `narrator = mama` (**default**) / `papa` | That parent gives all instructions. Both parents' praise clips are mixed in. |
| `narrator = alternate` | Instructions alternate by room. For example, Mama in the kitchen, Papa in the bedroom. |
| Missing clip | Falls back to the other parent's version of the same key, then to a soft chime. The game never goes silent. |

Ideally both parents record the whole script. The minimum for M1 is **Mama recording
everything**, and Papa recording the **praise** and **greeting** sections.

Bubu and Ocica don't speak. They use short sound effects (boing, squeak, giggle, snore), which are
handled with the game sounds, not recorded here. Instruction lines may mention them by name: "Lihat
Bubu dulu ya", "Ocica peluk Cici".

## 2. What to record

The script is **generated from the game content** by `npm run audio:script` and written to
`content/audio-script.csv`:

```
key,section,text,note
greet.welcome,01-sistem,"Halo Cici Theia! Ayo main!",ceria
room.dapur.enter,02-ruangan,"Kita di dapur. Ayo berhitung!",
instr.tracing.watch,03-menulis,"Lihat Bubu dulu ya.",pelan
instr.tracing.follow,03-menulis,"Sekarang Cici ikuti bolanya.",
stroke.vertical,03-menulis,"Garis tegak. Seperti hujan turun.",
num.4,04-angka,"Empat.",datar — dipakai saat menghitung
count.howmany,05-hitung,"Berapa semuanya?",nada bertanya
count.put.prefix,05-hitung,"Masukkan...",berhenti sebentar sesudahnya
obj.telur,05-hitung,"telur",
color.merah,06-warna,"Merah!",
praise.01,07-pujian,"Hebat!",
hint.tryagain.01,08-bantuan,"Hampir! Coba lagi ya.",lembut
bedtime.01,09-tidur,"Sudah malam. Waktunya bobo. Sampai besok, Cici!",pelan, berbisik
```

M1 is about **110 clips per voice**:
- greetings and rooms: 10
- tracing instructions and the 7 pre-writing strokes: 15
- digits 0–10: 11
- counting phrases and objects: 20
- colors: 10
- praise: 20
- hints: 12
- bedtime: 6
- spare: about 6

At about 3 seconds per clip plus pauses, that is roughly **15 minutes of recording per parent**,
split into sessions.

Sentences are built from parts wherever it sounds natural: "Masukkan" + "empat" + "telur". This
keeps the count small as content grows. Record each part with **neutral, level intonation** so the
joins sound smooth.

## 3. How to record

**Room**:
- Use a small room full of soft things, like a bedroom with a closed wardrobe. Avoid the bathroom
  and kitchen, which echo.
- Turn off fans and AC for the take.

**Device**:
- Option A: an Android phone with a voice recorder app set to the **highest quality (WAV, or M4A
  at ≥ 128 kbps)**.
- Option B: a laptop with Audacity (48 kHz, mono, WAV).
- Phone in airplane mode. Mic 20–30 cm from the mouth, slightly off to the side to avoid "p" pops.

**Delivery**:
- Smile while speaking, at a slower pace than normal conversation. Keep the energy consistent
  across sessions.
- **Letter names** use the Indonesian alphabet: a, be, ce, de, e, ef, ge, ha, i, je, ka, el, em,
  en, o, pe, ki, er, es, te, u, ve, we, eks, ye, zet.
- **Letter sounds** are short and clean: say /m/, not "meh" or "muh". Stop consonants (b, d, p, t,
  k, g) get a very short release.
- For syllables, mark the **e pepet** vs **e taling** words. The script's `note` column says which
  one.

**Taking it**:
- Record **one file per section** (`01-sistem`, `02-ruangan`…). Read the lines in script order,
  with **about 2 seconds of silence** between lines.
- If you make a mistake, stop and re-record **the whole section**. Sections are short (10–20 lines)
  on purpose, which is simpler than fixing a single clip.
- Name files `<voice>-<section>.wav`, for example `mama-03-menulis.wav`, and drop them into
  `recordings/`. That folder is gitignored.

## 4. Pipeline (`npm run audio:build`)

Steps for each section file:
1. **Split on silence**: gaps ≥ 1.2 s at −40 dBFS. The clips are mapped in order to that section's
   script lines. A count mismatch fails loudly and lists the section.
2. **Clean up**:
   - 80 Hz high-pass filter
   - Light FFT denoise
   - Trim to 50 ms of leading and trailing silence
3. **Normalize**: EBU R128, −16 LUFS, true peak −1.5 dBTP, so both parents play at the same level.
4. **Encode**: Opus, mono, 48 kbps (`.webm`).
5. **Package**: one **audio sprite per room** plus `global`. Output goes to
   `audio/<voice>/<room>.webm` with a JSON marker map `{ key: [start, duration] }`.
6. **Review page**: `tools/audio/review.html` lists every key with its text and a play button, so
   a parent can listen through all clips before committing.

CI checks that every audio key used in `src/content/` exists for at least one voice.

## 5. Re-recording later

- Change or add lines in content, then run `npm run audio:script`. The script marks **new or
  changed** lines with `*`.
- Record only the affected sections and rebuild. Clips from unchanged sections are kept.
