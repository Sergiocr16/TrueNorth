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
   Phone / laptop                 Raspberry Pi 5 (home)              Google Cloud
   on Tailscale                   ┌──────────────────────────┐      ┌───────────────┐
  ┌────────────┐   https://…ts.net │ Next.js  (systemd :3000) │      │ Firestore     │
  │  PWA       │──────────────────▶│  ├ app/          UI      │      │ Auth          │
  │            │                   │  ├ app/api/      routes  │─────▶│ Storage       │
  │  Firestore │◀─────────────────────────────────────────────────────│ Cloud Msg.    │
  │  client SDK│                   │  └ server/engine │       │      └───────────────┘
  └────────────┘                   │       └─ claude -p       │             ▲
                                   │ systemd timer 02:00 ─────┤             │
                                   └──────────┬───────────────┘   Speech-to-Text
                                              ▼
                                          Notion API
```

Everything runs on the Raspberry Pi as one Next.js process, reached over
Tailscale, which also gives the app a valid HTTPS certificate so it installs
as a PWA and can receive push. Claude Code is installed on the same machine
and signed in with the subscription; the server calls it directly, `claude -p`
as a child process, three times a morning: the company analysis, one plan per
person with an account, and one team follow-up per manager — a reading of
everybody against what is expected of them, and a message only for whoever
needs one. Voice interpretation will use the same path. A systemd timer
triggers the daily run at 02:00.

Firebase is the database, identity, file store and push sender. The browser
talks to Firestore directly, which is what makes edits live across devices;
the server uses the Admin SDK for what the engine writes. There are no Cloud
Functions and no App Hosting.

**The trade this makes, on purpose:** when the Pi is off, the app is
unreachable and that morning's plan is not generated. The data is safe in
Firebase. See `docs/adr/ADR-005-everything-on-the-raspberry-pi.md`.

## Getting started

Requirements: Node 26.8.1 (`.nvmrc`), pnpm 11, and `apps/web/.env.local` with
the Firebase web config plus, for the engine, `GOOGLE_APPLICATION_CREDENTIALS`
pointing at a service-account key kept outside the repository (see
`docs/firebase-setup.md`).

```bash
nvm use             # or install Node 26.8.1
pnpm install
pnpm dev            # http://localhost:3000
```

The first company is seeded with ADITUM's objectives, projects, tasks and team
— the team as people without accounts, so follow-up has somebody to talk about
from day one — and everything is editable. Data lives in Firestore; **Settings
→ Reset sample data** puts the sample back.

To try it on a phone before the Pi exists, put `tailscale serve` in front of
the dev server and authorize the laptop's tailnet name in Firebase Auth
(`apps/web/scripts/authorize-domain.mjs`); `docs/pi-setup.md` §8c has the
three steps.

Other commands:

```bash
pnpm build          # production build
pnpm typecheck      # tsc --noEmit across the workspace
pnpm test           # signals, follow-up guardrails, health, people matching, Notion mapping
npx firebase-tools emulators:exec --only firestore "pnpm --filter @truenorth/core exec vitest run src/rules.test.ts"
                    # the security rules, against the emulator (Java 21+)
```

## Screens

| Route | What it does |
| --- | --- |
| `/entrar`, `/elegir-empresa` | Sign in, then pick the company and see your role in it |
| `/hoy` | The day as a compass — the needle swings north as the plan gets done — the plan, per-item feedback, recalculate, the calendar of past days |
| `/briefing` | Three numbers, the executive summary folded, ranked risks, decisions, five perspectives, how the team is doing |
| `/empresa` | North star, target date, 3/6/12-month plans, overall status |
| `/objetivos` | Objectives with indicators and the expected-vs-actual gap |
| `/proyectos` | Projects with a health strip and filters; each with objectives, tasks by status, dependencies |
| `/equipo` | Who is on the team, with or without an account: role, responsibility, what you expect of them |
| `/seguimiento` | Managers only: how each person is doing, private situations, and today's messages — greeting first, ready to copy |
| `/riesgos` | Every signal the engine raises, grouped by what to do about it, plus the risks you record |
| `/integraciones` | Notion connection, authorised sources, property and status mapping |
| `/ajustes` | Language, delivery time, notifications, six themes and five accents, reduced transparency, engine status |

Every main screen carries a small compass in its corner: that screen's health
as a share computed in `packages/core/src/health.ts` — south nothing right,
north nothing wrong.

## Notion

For ADITUM, Notion is the source of truth for projects and tasks. The sync
(not built yet — ADR-006 calls it "Fase 0") reads three databases:

- **Proyectos** — name, owner, status, dates, completion rollup, tasks relation.
- **Tareas Software** — task name, auto id (`TAR-###`), status (fifteen options), the people responsible, due date, priority, project, parent and subtasks, type, bug count. Also each page's `last_edited_time` and its comments, which is where most follow-up in ADITUM happens.
- **ADITUM Backlog** — everything still to do. An item not started has no responsible, and that is normal; once it is in development it must have one.

A task can have several people responsible, as in Notion. Each Notion person
is matched to a team member **by name** (`matchPerson()` in
`packages/core/src/people.ts`: accent- and case-insensitive, refuses to guess
between two people who both fit); one with no match becomes a new person on
the team, so the team populates itself from Notion. Notion does not expose
status history, so the sync stamps `statusChangedAt` itself whenever a status
differs from the stored one — the "has not moved" signals only tell the truth
from the first sync onward.

The fifteen Notion statuses collapse onto four internal states in `packages/core/src/notion-status.ts`. `Depende de otra TAR` becomes *blocked*; `Finalizada` and `Archivadas` become *done*. Changing that map requires an ADR.

Writes go back to Notion when a dictated update is confirmed. Notion always wins: if the page changed since the last sync, the app shows the conflict instead of overwriting.

## Voice updates

Record in the app → Cloud Storage → Speech-to-Text with a phrase set built from the company's own project names, `TAR` codes, people and statuses → the worker interprets it into concrete changes, each carrying the exact phrase that produced it → you confirm or correct each card → the changes land in Notion and Firestore.

No recogniser is perfect, so the design does not pretend otherwise: nothing is written before you confirm, and every correction is stored to improve the phrase set.

## Branches and deploying

| Branch | Role |
| --- | --- |
| `main` | Where work lands. Default branch, kept green. |
| `production` | What the Pi runs. Protected; moves forward from `main` only. |

Releasing is a fast-forward merge followed by a deploy on the Pi:

```bash
git checkout production
git merge --ff-only main
git push origin production
git checkout main
# then, on the Pi:
sudo truenorth-deploy           # git pull, pnpm install, next build, restart
```

The full runbook for the Pi is `docs/pi-setup.md`.

Not yet built: the Notion sync, push (FCM) and voice. The Pi runbook is
written and the engine runs end to end from a laptop today; the Pi itself has
not been mounted yet.

## The Raspberry Pi

The Pi is the server. What it needs, in short — the step-by-step is in
`docs/pi-setup.md`:

- Raspberry Pi 5 with 8 GB, NVMe or USB SSD rather than an SD card, on a small UPS.
- Ubuntu Server 24.04 arm64, the Node the repo pins, pnpm, and Claude Code signed in with the subscription.
- The app as a systemd service on port 3000, and a systemd timer for the 02:00 run.
- Tailscale with `tailscale serve` in front of port 3000, which is what gives the app HTTPS.
- The Firebase service-account key at `/etc/truenorth/service-account.json`, mode 600, on an encrypted disk. Never in the repo, never in a chat.

## Stack

| | |
| --- | --- |
| Runtime | Node 26.8.1, pnpm 11 |
| Web | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| Language | TypeScript 7 |
| Contracts | Zod 4 |
| Tests | Vitest 5 |
| Backend | Firebase (Firestore, Auth, Storage, Cloud Messaging) + Google Speech-to-Text |
| Server | Next.js on a Raspberry Pi 5, behind Tailscale |
| Engine | Claude Code headless, called in-process; API key as an alternative auth mode |

The project tracks current releases rather than the conservative floor. Bump to
the latest when you touch a dependency, and verify with
`pnpm test && pnpm typecheck && pnpm build`.

## Author and licence

Sergio Castro. Private project, all rights reserved.

## Running the engine by hand

The engine is three route handlers in the same process as the app, all under
`app/api/engine/`. Two are for the operator and take the shared token from
`ENGINE_LOCAL_TOKEN`; the third is for a signed-in person and takes their
Firebase ID token.

| Route | Who calls it | What it does |
|---|---|---|
| `GET /api/engine/selftest` | you, after installing | Builds a plan from the sample company by calling `claude -p`. No database. `?step=followup` runs the team follow-up instead. |
| `POST /api/engine/daily` | the systemd timer at 02:00 | Every company: signals, one analysis, one plan per member, one team follow-up per manager, heartbeat. `?company=<id>` limits it to one, `?date=YYYY-MM-DD` overrides today. |
| `POST /api/engine/replan` | the *Recalcular mi plan* button | Recomputes the caller's plan for today, reusing the day's analysis. |

One more route handler exists for the same reason — a write the browser is not
allowed to make: `POST /api/company/logo` takes a company id and an image,
verifies the ID token, checks membership with the Admin SDK and writes the
object to Storage. See `docs/firebase-setup.md` for why the logo does not go
straight from the browser.

Locally, put `ENGINE_LOCAL_TOKEN`, `CLAUDE_BIN` and, for the two routes that
write, `GOOGLE_APPLICATION_CREDENTIALS` in `apps/web/.env.local`, then:

```bash
curl -s -H "Authorization: Bearer $ENGINE_LOCAL_TOKEN" http://localhost:3210/api/engine/selftest | jq .plan

# The team follow-up: a reading for everybody, a message only for those who need one.
curl -s -H "Authorization: Bearer $ENGINE_LOCAL_TOKEN" \
  'http://localhost:3210/api/engine/selftest?step=followup' | jq .followUp
```

Claude Code is invoked with `--json-schema` built from the Zod contracts in
`packages/core`, targeted at JSON Schema draft-07 because that is what the CLI
validates against, and the answer is validated again with Zod before it is
written. The child runs in an empty directory so it never reads this
repository's `CLAUDE.md` as context.
