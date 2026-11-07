# AGENTS.md: shared rules for Claude and Gemini

This repo is built by two AI agents with a human (Papa) reviewing every PR.

| Agent | Role | Owns |
|---|---|---|
| **Claude** (Claude Code) | Game logic, engine, content data, tooling, CI/CD, deployment | `src/`, `tools/`, `tests/`, `public/`, `content/`, `audio/` (generated), `wrangler.jsonc`, `.github/`, `package.json` |
| **Gemini** (Antigravity) | Visuals: character, house, room art, coloring pages, UI art, icons | `assets/` (everything except the schema, which lives in `src/content/schema/manifest.ts`) |
| **Papa & Mama** | Product decisions, playtesting, voice recordings, reference photos | `recordings/` and `reference/` (both gitignored), final review |

Shared, and changed only through a PR that both sides follow: `docs/`, `AGENTS.md`, and
`assets/manifest.json` structure.

## Read first

1. [`docs/PLAN.md`](docs/PLAN.md): what we're building and why. The design rules for a 3-year-old
   are non-negotiable.
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): Claude's domain.
3. [`docs/ASSETS.md`](docs/ASSETS.md): the asset contract. Gemini's domain, and the interface
   between the two agents.
4. [`docs/AUDIO.md`](docs/AUDIO.md): voice recording pipeline.

## Hard rules

- **Stay in your lane.** Never edit files owned by the other agent. If you need a change there,
  open an issue or PR comment describing it, or propose a contract change in `docs/ASSETS.md`.
- **The contract is `docs/ASSETS.md` + `assets/manifest.json`.** Logic references assets by
  manifest **key**, never by file path. Art follows the sizes, frame grids, and layout schema
  exactly.
- **Privacy:**
  - Never commit photos of the child or the house, raw voice recordings, or anything from
    `reference/` or `recordings/`.
  - Never commit a photo-realistic likeness of her.
  - The repo stays private, and the deployment stays behind Cloudflare Access.
- **No text in images.** The game renders all letters and words.
- **No third-party runtime calls**: no analytics, CDNs, remote fonts, or ads.
- **Placeholders unblock logic.** Claude ships code-generated placeholders with the same keys and
  sizes as the final art, so neither agent waits on the other.

## Workflow

- Base branch: `master`. Never push to it directly. Everything goes through a PR.
- Branch names:
  - Claude: `feat/…`, `fix/…`, `chore/…`, `docs/…`
  - Gemini: `assets/<area>-<short-desc>`, for example `assets/character-walk-cycle`
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`). Asset
  commits use `feat(assets): …` or `fix(assets): …`.
- One concern per PR. Asset PRs include a screenshot of the asset in the game, using the preview
  deploy, on the tablet.
- CI must be green: lint → test → build → validate-assets → SAST → quality gate.

## Definition of done

- **Logic**:
  - Unit tests for engine code: tracing scorer, scheduler, nav, fill.
  - A Playwright smoke test for each scene.
  - Structured JSON logging for errors, and no swallowed exceptions.
- **Assets**: the review checklist in `docs/ASSETS.md` §8 is fully checked.
- **Both**: played on the real Android tablet and phone by a parent before merge.
