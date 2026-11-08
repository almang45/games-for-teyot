# AGENTS.md: shared rules for Claude and Antigravity

Two AI agents build this repo. Papa approves every gate and merges every PR. The phases, gates, and
handoffs are defined in [`docs/WORKFLOW.md`](docs/WORKFLOW.md).

| Actor | Role | Owns (may edit) |
|---|---|---|
| **Claude** (Claude Code) | Architect and core developer: PRD, architecture, contracts, game logic, integration, refactoring, testing, CI/CD, code review | `src/`, `tools/`, `tests/`, `content/`, `audio/` (generated), `public/`, `.github/`, `package.json`, `wrangler.jsonc`, `docs/PRD.md`, `docs/prd/` |
| **Antigravity** | UI/UX designer and prototyper: visual direction, design system, characters, house, screen designs, motion, clickable prototype, presentational UI components, all visual assets | `design/`, `assets/`, `ui/`, `prototype/` |
| **Papa & Mama** | Product owners: decisions, reference photos, voice recordings, playtests with Theia, gate approval | `recordings/` and `reference/` (both gitignored) |

**Joint files.** Changes go through a PR that both agents review and Papa approves:
- `contracts/`: Claude drafts it, Antigravity co-signs. Procedure in `docs/WORKFLOW.md` §7.
- `docs/` other than the PRD, including `docs/handoff/` (written by whoever makes the handoff)
- `AGENTS.md`

## Read first

1. [`docs/WORKFLOW.md`](docs/WORKFLOW.md): phases, gates, handoffs, ownership. **Check which
   phase the current milestone is in before doing anything.**
2. [`docs/PLAN.md`](docs/PLAN.md): what we're building and why. The design rules for a 3-year-old
   are non-negotiable.
3. [`docs/PRD.md`](docs/PRD.md) (written in Phase 1): user stories, acceptance criteria, screen
   inventory.
4. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): Claude's domain.
5. [`docs/ASSETS.md`](docs/ASSETS.md): the asset contract, Antigravity's domain.
6. [`docs/AUDIO.md`](docs/AUDIO.md): voice recording pipeline.

## Hard rules

- **Stay in your lane.** Never edit files owned by the other agent, not even to "quickly fix"
  something. File an issue (`type:design-change`, `type:visual-defect`, `type:defect`,
  `type:contract-change`) with a screenshot or repro steps instead.
- **Review across lanes, never edit across lanes:**
  - Claude reviews the code quality and contract conformance of `ui/` and `design/*.json`.
  - Antigravity reviews the visual result of Claude's integration.
- **Contracts are code.** Logic references art by manifest **key** and screen layouts by element
  **key**, never by file path or hard-coded position. Design artifacts must validate against
  `contracts/`.
- **The prototype is never copied and rewritten.** Phase 2 artifacts (tokens, layouts, motion, `ui/`,
  assets) are consumed by the game as they are. The prototype only showcases them, and it never
  ships.
- **`ui/` stays presentational:**
  - Props in, events out.
  - No imports from `src/`, no storage, no network, no global state.
  - Tokens only, no hard-coded colors or sizes.
- **Respect the gates.** Don't start a phase's work for a milestone until the previous gate is
  approved. One exception: Claude's Phase 2b engine work on placeholders.
- **Privacy:**
  - Never commit photos of Theia, Mama, Papa, or the house, raw voice recordings, or anything
    from `reference/` or `recordings/`.
  - Never commit a photo-realistic likeness of anyone in the family.
  - The repo stays private, and the deployment stays behind Cloudflare Access.
- **No text in images.** The game renders all letters and words.
- **No third-party runtime calls**: no analytics, CDNs, remote fonts, or ads.
- **Placeholders unblock logic.** Claude ships code-generated placeholders with the same keys and
  sizes as the final art.

## Workflow conventions

- Base branch `master`. Never push to it directly. Everything goes through a PR.
- Branch prefixes:
  - Claude: `feat/`, `fix/`, `chore/`, `docs/`, `test/`, `refactor/`
  - Antigravity: `design/`, `assets/`, `ui/`, `proto/`
- Conventional Commits. Antigravity uses scopes such as `feat(assets): …`, `feat(ui): …`,
  `fix(design): …`.
- One concern per PR, linked to its milestone tracking issue, with the phase label.
- Visual PRs include screenshots on both the tablet (1920 × 1080) and phone (2400 × 1080)
  viewports.
- CI must be green: lint → test → build → validate (design + assets) → SAST → quality gate.

## Definition of done (for each PR)

- **Claude**:
  - Unit tests for engine code.
  - Every acceptance criterion touched has an E2E test named after its story ID.
  - Structured JSON logging for errors. No swallowed exceptions.
- **Antigravity**:
  - `docs/ASSETS.md` §8 checklist done. Design JSON validates.
  - `ui/` components have a gallery entry with every state, plus component tests.
- **Both**: the change is visible in the preview build and checked on a real Android device before
  merge.
