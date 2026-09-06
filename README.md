<p align="center">
  <img src="docs/brand/truenorth-mark.svg" width="72" height="72" alt="TrueNorth">
</p>

<h1 align="center">TrueNorth</h1>

<p align="center">Your plan for today, with the reason behind every item.</p>

---

TrueNorth connects a company's north-star goal to its objectives, projects, tasks and people, and gives each person a short, explained plan every morning.

A personal project by **Sergio Castro**. Its first workspace is ADITUM, a condominium-management software company in Costa Rica whose goal is to lead that market by December 2027, which is where the sample data comes from.

The screens are in Spanish (Costa Rica) with English available; the code, and every URL, is in English.

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

The first sign-in as a founder creates an empty company: no objectives, no
projects, no people. Everything arrives from the app or from Notion, and a
screen with nothing in it says so. ADITUM's sample data stays in
`packages/core/src/fixtures.ts` for the tests and the engine selftest only.
**Settings → Empty the company** wipes a company back to that state.

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
| `/sign-in`, `/choose-company` | Sign in, then pick the company and see your role in it |
| `/today` | The day as a compass — the needle swings north as the plan gets done — the plan, per-item feedback, recalculate, the calendar of past days |
| `/briefing` | Three numbers, the executive summary folded, ranked risks, decisions, five perspectives, how the team is doing |
| `/company` | North star, target date, 3/6/12-month plans, overall status |
| `/objectives` | Objectives with indicators and the expected-vs-actual gap |
| `/projects` | Projects in flight grouped by health, worst first, the completed ones folded away; each with objectives, tasks by status, dependencies |
| `/team` | The company's roles (each reading its Notion databases, whole or only what is assigned to the person) and who holds which; people with or without an account, their responsibility, what you expect of them |
| `/follow-up` | Managers only: how each person is doing, private situations, and today's messages — greeting first, ready to copy |
| `/assistant` | The chief of staff as a conversation: ask about the day, by text or voice, and confirm what it proposes — a situation, a message to copy, a follow-up marked sent, an expectation |
| `/risks` | Every signal the engine raises, grouped by what to do about it, plus the risks you record |
| `/integrations` | Notion: pick databases from the list the integration can see, check the suggested mapping and status table, sync now. GitHub: pick repositories, say which project each belongs to and who approves, sync now |
| `/settings` | Language, delivery time, notifications, six themes and five accents, reduced transparency, engine status |

Every main screen carries a small compass in its corner: that screen's health
as a share computed in `packages/core/src/health.ts` — south nothing right,
north nothing wrong.

## Notion

For ADITUM, Notion is the source of truth for projects and tasks. A database
is registered as a *source* from *Integraciones*: the screen lists every
database the integration can see, with a search box, and several are added at
once. The server reads each schema and suggests which property is the title,
the status, the people, the date, the code; every source then keeps its own
mapping and its own status table, because ADITUM's databases do not share a
vocabulary. What a
person sees of Notion is decided by the **role** they have on (ADR-008): a role
reads a set of sources, a person holds several roles and switches between
them, and the engine computes each person's day from that role's view only.
Since ADR-009 a role reads each source either whole or only through the
person's own assignments — the CTO sees all of *Tareas Software*, a developer
only their tasks in it and the whole backlog — and when somebody has nothing
of their own left, the plan offers unowned work from the sources the role sees
whole, never from one it sees only through assignments.

ADITUM's sources, as of September 2026:

- **Tareas Software** — task name, auto id (`TAR-###`), status (fifteen options in three groups), the people responsible, due date, priority, project, parent and subtasks. Also each page's `last_edited_time` and its comments, which is where most follow-up in ADITUM happens.
- **Backlog Software** and **Backlog Soporte** — everything still to do, with their own statuses ("Lista para desarrollar", "En desarrollo"…). An item not started has no responsible, and that is normal; once it is in development it must have one.
- **Test de Pruebas** — the QA table; its status is a plain select, so its map is checked by hand.
- **Proyectos** — name, owner, status, dates, completion rollup. Registered as a source of kind *projects* so tasks land in their project.

The sync (`apps/web/server/notion/`) runs before the daily engine, on demand
from the screen, and on the Pi every two hours on weekdays; it reads every page
id on every run (an archived page is simply not returned), maps only what
changed, and everything once a week. Two exceptions: a *projects* source is
mapped whole every run, because its completion is a rollup that does not edit
the page; and a task source is remapped whole whenever the set of projects it
can link to changed, so tasks find a projects table registered after them.
Pinned to the 2025-09-03 API version, the one with data sources.

A task can have several people responsible, as in Notion. Each Notion person
is matched to a team member **by name** (`matchPerson()` in
`packages/core/src/people.ts`: accent- and case-insensitive, refuses to guess
between two people who both fit); one with no match becomes a new person on
the team, so the team populates itself from Notion. Notion does not expose
status history, so the sync derives `statusChangedAt`: whenever a status
differs from the stored one it stamps the page's last edit time — the change
happened at or before it — never the sync's own clock. From that, every task
carries two clocks: anybody's activity (`idleDays`) and the owner's own
progress (`progressDays`: a status change, an edit, or a comment written by
somebody responsible). The overdue signal says whether the task is still
moving, and the plan and the follow-up treat "late but moving" and "late and
silent" as the different problems they are.

Every Notion status collapses onto one of four internal states through the source's own map, started from Notion's groups: *Depende de otra TAR* becomes *blocked*; *Finalizada* and *Archivadas* become *done*. `NOTION_TASK_STATUS` in `packages/core/src/notion-status.ts` is the known default for "Tareas Software" and is pinned by a test. Changing the four states requires an ADR.

Writes go back to Notion when a dictated update is confirmed. Notion always wins: if the page changed since the last sync, the app shows the conflict instead of overwriting.

## GitHub

Work ships through pull requests, and the engine reads them too (ADR-010).
A repository is registered from *Integraciones* — picked from the list the
token can see — and belongs to a project; it then sits on roles in the same
list as a Notion database, whole or only the pull requests naming the person.
A pull request is tied to a task by the code in its branch, title or body
(`feature/TAR-966`), and to a project by that task or by the repository.

The sync (`apps/web/server/github/`) runs after Notion's, reads the pull
requests updated since the last run with their reviews and the author's last
push or comment, and matches GitHub logins to the team by the username the
person declared or by the profile's name — never creating people, Notion is
the roster. Who reviews and merges is a role, prefilled with the one called
CTO. From that the engine computes four signals: a task in a "development
finished" status with no pull request, a pull request waiting for review,
one with changes requested and no answer, and one approved but unmerged.
The token is `GITHUB_TOKEN` in the Pi's environment.

## The assistant

`/assistant` is the chief of staff as a conversation. One question, one
`claude -p` call (Sonnet by default — `ASK_MODEL` changes it — about ten
seconds and three cents) over the same context the morning run had, cut down
to what the person may see. Answers cite signals like a plan does. Voice is
an input method, not a feature: the browser's own speech recognition fills
the box where it exists, the keyboard's microphone everywhere else.

It can also *propose* an action — record a situation, draft a message, mark
today's follow-up as sent, add to what you expect of somebody — which the
server validates and the screen shows as a card. Nothing is written until you
confirm, and a message is never sent from the app: it is copied. That is
ADR-004 in practice: Claude interprets, code writes.

## Reminders

Reminders are push: one at the hour you choose with the day's headline, another
when follow-ups are waiting, sent by `POST /api/push/hourly` from an hourly
timer on the Pi. On iPhone they reach only the app installed to the home screen. A
token identifies one device; turning the toggle on subscribes that device and
records it on the user's document, and a token Firebase reports dead is
dropped on the next send.

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

Not yet built: voice, and writing back to Notion. The Notion sync runs
against ADITUM since 2026-09-05 with four sources registered: Tareas
Software, Backlog Software, Gestor de lanzamientos and Proyectos.

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
