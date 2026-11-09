# games-for-teyot

**Rumah Cici Theia** is an installable browser game for our 3-year-old, in Bahasa
Indonesia. She plays as herself and walks around our house. Each room is a learning activity:

- tracing pre-writing strokes, numbers, and letters
- counting
- letter and early reading practice
- coloring

Papa and Mama's recorded voices guide her through everything.

- Runs on Android phone and tablet, landscape, touch only, and works offline.
- Hosted on Cloudflare Workers (static assets) behind Cloudflare Access.

Status: **M0, Phase 1**: app shell, CI/CD, and placeholders.

| Doc | Contents |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Requirements: goals, personas, success metrics, screen inventory, flows, user stories + acceptance criteria (M0, M1), NFRs |
| [docs/handoff/](docs/handoff/) | Handoff docs per milestone (M1 design brief first) |
| [docs/PLAN.md](docs/PLAN.md) | Product plan: design principles, house hub, curriculum, rewards, parent area, roadmap, risks |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, repo layout, tracing engine, scheduler, nav, audio, offline/hosting/auth, CI/CD |
| [docs/ASSETS.md](docs/ASSETS.md) | Asset contract for the art agent: style, sprite specs, house layout schema, coloring pages |
| [docs/AUDIO.md](docs/AUDIO.md) | Voice recording guide and processing pipeline |
| [docs/WORKFLOW.md](docs/WORKFLOW.md) | 5-phase delivery workflow per milestone: PRD → design → integration → testing → review, with gates and handoffs |
| [AGENTS.md](AGENTS.md) | Day-to-day rules for Claude (architect/core dev) and Antigravity (UI/UX designer/prototyper) |

## Development

Requires Node 26 (see `.nvmrc`).

```sh
npm ci
npm run dev          # http://localhost:5173/?browser=1 skips SCR-INSTALL in a plain tab
npm run check        # typecheck + lint + unit tests with coverage
npm run build        # production build + size budget + privacy check
npx playwright install chromium webkit   # once
npm run test:e2e     # tablet / phone (touch) + laptop (mouse), Chromium + WebKit
```

| Path | Contents |
|---|---|
| `src/` | Game shell: Phaser scenes, engine modules, structured log, placeholders |
| `content/` | Indonesian copy and curriculum data |
| `tools/build/` | Placeholder icons, `_headers` parsing, budget and privacy checks |
| `tests/unit/`, `tests/e2e/` | Vitest and Playwright. E2E tests are named after PRD story IDs. |
| `public/` | `_headers` (CSP, caching), `robots.txt` |
| `.github/workflows/ci.yml` | lint → test → build → e2e → Semgrep + osv-scanner → SonarQube Cloud gate → deploy |

### CI secrets

| Secret | Used by |
|---|---|
| `CLOUDFLARE_API_TOKEN` | **`production` environment secret**, never a repository secret (PR runs can read repository secrets). Custom token, least privilege: Account → *Workers Scripts: Edit* and *Account Settings: Read*; Zone `amns.my.id` → *Workers Routes: Edit*. |
| `CLOUDFLARE_ACCOUNT_ID` | `production` environment secret |
| `SONAR_TOKEN` | Quality gate. Required: CI fails without it. Add it to **Dependabot** secrets as well, so Dependabot PRs pass the gate. |

Deploys run only after the quality gate passes. `master` deploys to `rct.amns.my.id`, the only
production hostname (`workers_dev` is off), through the `production` environment, which only
`master` may use. PR preview uploads are off unless the repository variable `PREVIEW_DEPLOYS` is
`enabled`; turn that on only after giving the `preview` environment required reviewers and its own
token.

After the 1-month Access session expires, a parent opens `https://rct.amns.my.id/masuk` to log in
again; the offline shell answers `/` from cache, so only that path reaches the Access login. `npm run deploy` builds first, but it bypasses the CI
gates, so it is for the very first deploy only. Roll back with `npx wrangler rollback <version-id>`.
