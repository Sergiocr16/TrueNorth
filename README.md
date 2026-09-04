<p align="center">
  <img src="docs/brand/truenorth-mark.svg" width="72" height="72" alt="TrueNorth">
</p>

<h1 align="center">TrueNorth</h1>

<p align="center">Your plan for today, with the reason behind every item.</p>

---

TrueNorth connects a company's north-star goal to its objectives, projects, tasks and people, and gives each person a short, explained plan every morning.

A personal project by **Sergio Castro**. Its first workspace is ADITUM, a condominium-management software company in Costa Rica whose goal is to lead that market by December 2027, which is where the sample data comes from.

The screens are in Spanish (Costa Rica) with English available; the code is in English.

### What a plan looks like

> **Your priority today**
> Unblock the supplier portal: review the secure link on TAR-966.
> **Why:** *Launch the supplier portal* is behind plan — at risk, 32 points of gap.
>
> 1. Supplier portal with secure link — *signal: TAR-966 is due today · 45 min · TAR-966*
> 2. Sentry: create account, projects and alerts — *signal: TAR-842 is 6 days overdue · 30 min*
> 3. Review financial-module tickets — *signal: TAR-931 is 9 days overdue · 25 min · 14:00*
>
> **If this doesn't happen today,** the launch slips four days.

## Architecture

```
  Phone / desktop            Google Cloud                      Home
 ┌──────────────┐      ┌──────────────────────┐        ┌──────────────────┐
 │  Next.js PWA │─────▶│ Firestore            │◀──────▶│ Raspberry Pi 5   │
 │ App Hosting  │      │ Auth · Functions     │  jobs  │ worker (systemd) │
 └──────────────┘      │ Scheduler · Storage  │        │  └ claude -p     │
                       │ FCM · Secret Manager │        └──────────────────┘
                       │ Speech-to-Text       │                 │
                       └──────────┬───────────┘                 │
                                  │                    fallback │
                                  ▼                             ▼
                              Notion API              Anthropic API (key)
```

Each morning Cloud Scheduler writes one job per company into Firestore. The worker on the Raspberry Pi leases the job, reads the company with the Admin SDK, computes the signals in code, and calls Claude Code headless (`claude -p --output-format json --json-schema`) to produce the executive analysis and one plan per person. If the Pi misses its heartbeat for fifteen minutes, a watchdog function processes the queue against the Anthropic API instead.

**Why Claude Code and not the API:** the subscription covers first-party use, and TrueNorth is internal to ADITUM. The worker supports both authentication modes behind one environment variable, so switching to an API key is a config change.

## Getting started

Requirements: Node 26.8.1 (`.nvmrc`), pnpm 11.

```bash
nvm use             # or install Node 26.8.1
pnpm install
pnpm dev            # http://localhost:3000
```

The app opens with ADITUM's real objectives, projects and tasks and is fully editable. Data persists in the browser until Firestore is wired; **Settings → Reset sample data** puts it back.

Other commands:

```bash
pnpm build          # production build
pnpm typecheck      # tsc --noEmit across the workspace
pnpm test           # signal engine + Notion mapping tests
```

## Screens

| Route | What it does |
| --- | --- |
| `/entrar`, `/elegir-empresa` | Sign in, then pick the company and see your role in it |
| `/hoy` | The day's plan, per-item feedback, recalculate, dictate an update |
| `/briefing` | Executive summary, top risks, decisions, five perspectives |
| `/empresa` | North star, target date, 3/6/12-month plans, overall status |
| `/objetivos` | Objectives with indicators and the expected-vs-actual gap |
| `/proyectos` | Projects, their objectives, tasks grouped by status, dependencies |
| `/equipo` | Roles with an editable responsibility description, load per person |
| `/riesgos` | Overdue, blocked, orphan projects, empty objectives, decisions |
| `/integraciones` | Notion connection, authorised sources, property and status mapping |
| `/ajustes` | Language, delivery time, notifications, theme, reduced transparency |

## Notion

For ADITUM, Notion is the source of truth for projects and tasks. Two databases are synced:

- **Proyectos** — name, owner, status, dates, completion rollup, tasks relation.
- **Tareas Software** — task name, auto id (`TAR-###`), status (fifteen options), owner, due date, priority, project, parent and subtasks, type, bug count.

The fifteen Notion statuses collapse onto four internal states in `packages/core/src/notion-status.ts`. `Depende de otra TAR` becomes *blocked*; `Finalizada` and `Archivadas` become *done*. Changing that map requires an ADR.

Writes go back to Notion when a dictated update is confirmed. Notion always wins: if the page changed since the last sync, the app shows the conflict instead of overwriting.

## Voice updates

Record in the app → Cloud Storage → Speech-to-Text with a phrase set built from the company's own project names, `TAR` codes, people and statuses → the worker interprets it into concrete changes, each carrying the exact phrase that produced it → you confirm or correct each card → the changes land in Notion and Firestore.

No recogniser is perfect, so the design does not pretend otherwise: nothing is written before you confirm, and every correction is stored to improve the phrase set.

## Branches and deploying

| Branch | Role |
| --- | --- |
| `main` | Where work lands. Default branch, kept green. |
| `production` | What Firebase App Hosting deploys. Protected; moves forward from `main` only. |

Point the App Hosting backend at **`production`**, with `apps/web` as the app
root. `apphosting.yaml` at the repo root already carries the build and
environment configuration; the values marked `secret` must exist in Secret
Manager under those names, or be switched to plain `value` entries, which is
fine for the Firebase web config since it is public by design. Local variables
are listed in `apps/web/.env.example`.

Releasing:

```bash
git checkout production
git merge --ff-only main
git push origin production      # triggers the App Hosting rollout
git checkout main
```

Not yet wired: Firestore rules and indexes, Cloud Functions, the Notion OAuth callback, FCM, and the Raspberry Pi worker. See `CLAUDE.md` for the phase plan.

## Running the Raspberry Pi worker

Planned setup, for when `apps/worker` lands:

- Raspberry Pi 5 with 8 GB, NVMe or USB SSD (not an SD card), on a small UPS.
- Ubuntu Server 24.04 arm64 or Raspberry Pi OS 64-bit, the current Node release, Claude Code installed for the service user.
- The worker runs as a systemd unit with automatic restart, writing a heartbeat every minute.
- SSH over Tailscale only, full-disk encryption, and a Firebase service account scoped to Firestore.

## Stack

| | |
| --- | --- |
| Runtime | Node 26.8.1, pnpm 11 |
| Web | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| Language | TypeScript 7 |
| Contracts | Zod 4 |
| Tests | Vitest 5 |
| Backend | Firebase (Firestore, Auth, Functions, Scheduler, Storage, FCM, Secret Manager, Speech-to-Text) |
| Engine | Claude Code headless on a Raspberry Pi, Anthropic API as fallback |

The project tracks current releases rather than the conservative floor. Bump to
the latest when you touch a dependency, and verify with
`pnpm test && pnpm typecheck && pnpm build`.

## Author and licence

Sergio Castro. Private project, all rights reserved.
