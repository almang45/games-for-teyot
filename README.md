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

Status: **planning**.

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
