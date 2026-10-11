# TrueNorth

TrueNorth is a personal project by Sergio Castro: a strategic-execution app whose first workspace is ADITUM, a condominium-management software company in Costa Rica. Every morning an AI "Chief of Staff" reads the company's north-star goal, its objectives, projects and tasks (synced from Notion), works out what is late, blocked or at risk, and hands each person a short plan for the day with the reason behind every item. People can dictate status updates by voice; the app transcribes, interprets, asks for confirmation and writes back to Notion.

It is multi-company by design (a user belongs to several companies with a different role in each) but it is private, first-party software: Sergio's own tool, run for his own work. It is not a product sold to third parties, and that distinction is what keeps the Claude Code subscription the right engine for it.

## The rule that shapes everything

**Signals in code, judgement in the model.**

Anything computable is computed in TypeScript, deterministically and with tests: what is overdue, blocked, orphaned, unassigned, who is overloaded, what changed since yesterday. The model never sees raw records. It receives those signals and does only what an algorithm cannot: rank by impact against the goal, adapt to the person's role, and explain why in plain language.

Consequences you must preserve:

- Every plan item cites at least one signal id, and the UI shows it. A recommendation that cannot be traced to a signal is a bug.
- New signals go in `packages/core/src/signals.ts` and ship with tests.
- The app must be useful without Notion. The engine does not care whether a task came from Notion or was created in the app.

## Repository map

```
apps/web/            Next.js 16 App Router, PWA, served from the Raspberry Pi
  app/               routes (English paths, ADR-007), one folder per screen
  app/api/           route handlers: engine (daily, replan, followup, ask,
                     selftest), notion (inspect, sync), push, company logo
  server/            admin.ts (Admin SDK, authorizeCaller), engine/ (capture,
                     prompts, run, claude), notion/ (client, inspect, sync),
                     github/ (client, sync) and writer.ts (batched writes)
                     — never imported by the browser
  components/        design system: ui.tsx, form.tsx, shell.tsx, icons.tsx,
                     day-compass.tsx, plan-calendar.tsx, follow-up.tsx
  lib/               preferences (theme, accent, locale), store (Firestore
                     listeners + every mutation), i18n dictionary
  scripts/           one-off operator scripts (authorize-domain.mjs)
packages/core/       domain types, Zod contracts, signal engine, visibility,
                     follow-up guardrails, health shares, people matching,
                     Notion mapping (schema → mapping, page → record),
                     ADITUM fixtures. Imported by web only.
docs/brand/          the compass mark (light, dark, maskable app icon)
docs/design/         the Claude Design brief
docs/adr/            architecture decision records
```

Not yet built: voice, and writing back to Notion. There is no `apps/functions`
and no `apps/worker`; both were dropped by ADR-005.

## Commands

Node 26.8.1 (see `.nvmrc`), pnpm 11.

```bash
nvm use                   # picks up .nvmrc
pnpm install
pnpm dev                  # web app on :3000
pnpm build                # production build
pnpm typecheck            # tsc --noEmit across the workspace
pnpm test                 # core tests (vitest): signals, follow-up, health, people, notion
npx firebase-tools emulators:exec --only firestore \
  "pnpm --filter @truenorth/core exec vitest run src/rules.test.ts"   # rules; Java 21+
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage
                          # after touching the rules — undeployed rules fail closed
```

**Stay on the newest versions.** This project tracks current releases rather
than the conservative floor: Node 26, pnpm 11, Next 16, React 19, TypeScript 7,
Tailwind 4, Zod 4, Vitest 5. When you add or bump a dependency, take the latest
and run `pnpm test && pnpm typecheck && pnpm build` before moving on. The Pi
runs the same Node the repo pins, so there is no second runtime to reconcile.

## Branches

- **`main`** — where work lands. Default branch, always green: `pnpm test`,
  `pnpm typecheck` and `pnpm build` must pass before anything merges.
- **`production`** — what the Pi runs. Protected against force pushes and
  deletion. It only ever moves forward from `main`.

Releasing is a fast-forward merge, never a direct commit:

```bash
git checkout production
git merge --ff-only main
git push origin production      # then, on the Pi: sudo truenorth-deploy
git checkout main
```

If the fast-forward is refused, `production` has drifted, which should not
happen. Find out why before forcing anything: a hotfix committed straight to
`production` is the usual cause, and it needs merging back into `main`.

Never commit or push either branch unless Sergio asks.

## Rules of work

- **Code, identifiers, comments, commits and technical docs in English.** UI text in Spanish, in `apps/web/lib/i18n/dictionary.ts`, with an English variant for every string. Never hardcode user-facing text in a component.
- **Never commit or push unless Sergio asks.** Leave changes in the working tree.
- **No secrets in the repo.** Firebase service accounts, Notion tokens and the Anthropic key live in Secret Manager or in an untracked `.env.local`.
- **Every new collection ships with a security rule and a rule test.** The engine runs with the Admin SDK and bypasses rules, so the same visibility is re-applied in `packages/core/src/visibility.ts` before any prompt is built, with its own tests.
- **All real business data is editable in the app.** North star, objectives, indicators, projects, tasks, roles, expectations, situations and risks are all created and edited by the user. Anything you add to the domain needs an editing path too.
- **Notes about people are private, and stay that way.** `companies/{cid}/situations` is admin-only in the rules, a `discreet` note never reaches the text of a message, and the engine drops any message that quotes one verbatim. Do not widen that read rule without an ADR.
- **A Notion task always shows its name and links to its page.** Never render only the code: `TAR-966` identifies a task to whoever already knows it and to nobody else. `TaskLine` in `components/ui.tsx` is the one place that decides how a task looks.
- Prefer editing an existing file over adding one. Keep components small and typed.

## Access model

Five sentences, enforced in `firestore.rules`:

1. **Accounts are created by the administrator**, never by self-registration.
   The app has no sign-up screen; Firebase Authentication is the roster. Until a
   callable Cloud Function exists, that means the console.
2. **Having an account grants nothing.** A person sees a company only once
   somebody inside it invites their address and they redeem it. Redeeming
   requires a confirmed email, because password sign-in lets anyone claim any
   address.
3. **Members are trusted peers.** They create their own projects and decide who
   else to share a project or the company with. Nobody grants access above their
   own level.
4. **Being on the team and having access are separate.** An admin may add a
   person to the team with no account at all: a `members/{p_…}` document whose
   synthetic id matches no uid, so it grants nothing. They exist to be followed
   up with. Sharing the app with them later is the invitation flow, unchanged.
5. **The role a person has on decides what they see of Notion** (ADR-008). A
   role (`companies/{cid}/roles`) names the Notion sources it reads; a person
   holds several roles (`roleIds`) and switches `activeRoleId` themselves, only
   among their own. A synced task or project is readable while its source is
   on the active role — and, for a source the role lists in
   `assignedOnlySourceIds` (ADR-009), only while the record names the person;
   app-native records keep the project visibility above. A GitHub repository
   is a source in the same list (ADR-010): its pull requests are readable
   while the repository is on the active role, assigned-only meaning the ones
   naming the person as author or reviewer. An objective is the company's
   or one role's (ADR-013): everybody reads all, but only the general ones
   and the active role's count — on screen, in signals and in the plan —
   and only the owner, admins, or the role's holders write them. The engine
   applies the same scope in code and recomputes signals from it, so nothing one role
   cannot see reaches its plan, briefing or follow-up; when the person has no
   work of their own, the plan may only offer unowned tasks from sources the
   role sees whole (`pickableTasks`).

`founders()` in the rules lists who may create a company from scratch. Keep it
short. `FOUNDERS` in `lib/store.tsx` mirrors it only to choose which screen to
show; the rules are what actually enforce it.

## Who does what

**Claude interprets, code writes.** Claude never calls Notion. See ADR-004.

Everything runs on the Raspberry Pi as one Next.js process, reached over
Tailscale. See ADR-005, which supersedes the queue-and-worker design.

| Piece | Where | Responsibility |
| --- | --- | --- |
| **Browser / PWA** | the phone or laptop, on Tailscale | Reads and writes Firestore directly with the client SDK. Never holds a Notion token. |
| **Next.js server** | the Pi, systemd, port 3000 | Serves the app. Route handlers under `app/api/` run the engine, sync Notion both ways, transcribe voice with Whisper on the same machine, send push. Uses the Admin SDK. |
| **Engine** | `apps/web/server/engine`, in-process | Computes signals in code, then invokes `claude -p` as a child process for the analysis, the plans, the team follow-up (one call per manager) and voice interpretation. |
| **Timer** | systemd timer on the Pi | Calls the engine over localhost at 02:00. |
| **Firebase** | Google Cloud | Auth, Firestore, Storage, Cloud Messaging. No Functions, no App Hosting. |

When the Pi is off the app is unreachable and that morning's plan is not
generated; the data is safe in Firebase. That trade was made deliberately.

## Contracts that need an ADR to change

- The daily plan schema (`packages/core/src/schemas.ts`): three to five items, each citing a signal, plus the consequence sentence. Since ADR-008 it travels inside `personalBriefingSchema` with the briefing, one call per person per role. Since ADR-012 a rest day has its own contract (`restDayPlanSchema`: one to three optional suggestions, nothing owed), chosen in code from the company's weekly schedule.
- The team follow-up schema in the same file (ADR-006): a reading for every person, a message only for those who need one and only ever citing a signal, defaulting to a comment on the Notion task. Nothing is sent or published without Sergio copying it.
- The `jobs` document shape used by the Raspberry Pi worker.
- The Notion status map: every registered source carries its own `statusMap` (ADR-008), built from the database's own groups by `defaultStatusMap()` and edited on screen. `NOTION_TASK_STATUS` in `packages/core/src/notion-status.ts` is the known default, pinned by a test as what "Tareas Software" resolves to. The signal engine, the plan and the voice writer all depend on the four internal states.
- The scope of a person (`scopeFor` in `packages/core/src/visibility.ts`, ADR-008, ADR-009): the active role's sources — each read whole or only through the person's assignments — plus app records, with signals recomputed from that subset. Documents are per person and role: `analyses/{date}_{uid}_{roleId}`, `plans/…`, `followups/…`.
- The route paths (ADR-007): English, one folder per screen, `[date]` and `[id]` for dynamic segments.
- How the engine is tuned (ADR-014): a `day_log` in `companies/{cid}/updates` is what a person says they actually did, read raw into the next day's prompt; `Membership.planRules` is the sentences they confirmed about how they work, read every morning. `proposedRule` on both plan contracts is a proposal only — the engine stores it on the plan, the person confirms it onto their own member document, and nothing reaches a prompt unconfirmed. Rules change ranking and wording; `enforceCitations` still drops any item citing a signal the person was not shown.

## Design system

The visual direction is "as if Apple designed it, with a touch of glass, readable above all". The full brief is in `docs/design/claude-design-brief.md`; the tokens are implemented in `apps/web/app/globals.css`.

Non-negotiables:

- **Glass is for chrome only** — tab bar, sidebar, sheet headers, the mic button. Body text never sits on a blurred background. Sheets use `.tn-sheet-surface`, which is near-opaque and does not rely on blur for contrast.
- **Both schemes are first-class.** Light is the base `:root`; dark redefines only the tokens, once under `prefers-color-scheme` guarded by `:not([data-theme])` — the system preference governs only the unstamped root; a stamped theme is one attribute selector and a chain of `:not()` guards would out-specify it — and once under `[data-theme='dark'], [data-theme='midnight'], [data-theme='ambar']`. Warm, midnight and amber are tints on top of those two, never a third scheme. Accents (`data-accent`) redefine only `--accent` and `--accent-bg`, with a light and a dark value each; green is not an accent because it already means "done". Never define a colour only inside a dark block.
- **Custom CSS lives in `@layer base` or `@layer components`.** Unlayered CSS beats every Tailwind utility, which silently breaks layout — this already cost us a bug where the tab bar dropped back into the flow.
- Body text 17px, touch targets 44pt, tabular numerals for anything that lines up in a column, status encoded in shape as well as colour.
- Mobile first. When phone and desktop conflict, the phone wins.

## The engine, in one paragraph

`POST /api/engine/daily` (bearer `ENGINE_LOCAL_TOKEN`) runs every company:
`syncCompany()` reads every registered Notion source first (`server/notion/`);
`captureCompany()` reads the company with the Admin SDK (a week of plans, active
situations, roles and sources included); then, for every member with an
account, `scopeOf()` narrows the company to the role they have on and
recomputes signals from that, and one `claude -p` call writes both
`analyses/{date}_{uid}_{roleId}` and `plans/{date}_{uid}_{roleId}`; one per
manager (`owner`/`admin`) writes `followups/{date}_{uid}_{roleId}` — a reading
of the people in that role's view, messages only for whoever needs one,
greeting first, guarded in code by `packages/core/src/followup.ts`. Other roles
are generated on demand when the person switches to them (`/api/engine/replan`
and `/api/engine/followup` take a `roleId`). `/api/engine/ask` answers one
question from the same scoped context and may return a proposed action the
client confirms before writing (ADR-004); `/api/notion/inspect` reads a
database's schema for the Integrations screen and `/api/notion/sync` runs the
sync now (`/api/github/sync` too, but it answers at once and the run goes on
in the server — the screen follows `integrations/github` — unless the caller
passes `wait=1`, as the timer does); `/api/engine/selftest` (`?step=followup`)
proves Claude answers without touching the database. The three load-bearing
flags in `server/engine/claude.ts` are `--restricted`, `--tools ""` and a
draft-07 JSON schema; the model is pinned by `ENGINE_MODEL`. Signals name a task by its
title with the code after it, and give every task two clocks: anybody's
activity (`idleDays`) and the owner's own progress (`progressDays` — a status
change, an edit, or a comment by somebody responsible); the overdue signal
says whether the task is still moving, and the plan and follow-up rules treat
"late but moving" and "late and silent" differently. `pickableTasks()` is the
unowned work a person may take: app tasks and tasks of the sources their role
sees whole (ADR-009).

## Testing

- `packages/core` uses vitest: signals, visibility and scope by role, follow-up guardrails, health shares, people matching (Notion and GitHub identities), Notion mapping (`notion-map.test.ts` runs `suggestMapping` and `pageToTask` against ADITUM's recorded schemas in `notion-schemas.fixture.ts`), GitHub mapping (`github-map.test.ts`: task code from a branch, review state GitHub's way, pull request to record), and how the engine is tuned (`plan-rules.test.ts`: which rules reach a prompt, the cap, and a proposal confirmed or turned down). Every new signal or guard ships with a test.
- Golden cases for the engine belong in `packages/core` alongside the signal tests: a company snapshot in, an expected plan shape out.
- Firestore rules have emulator tests in `packages/core/src/rules.test.ts` (Java 21+). The ones that matter most: nobody reads another company, nobody reads a private project they are not a member of, and nobody reads a Notion record whose source is not on their active role, or one of an assigned-only source that does not name them; then situations stay with admins and a follow-up stays with its manager. `pnpm test:rules` assumes macOS (`/usr/libexec/java_home`); on the Pi run `npx firebase-tools emulators:exec --only firestore --project truenorth-rules-test "pnpm --filter @truenorth/core exec vitest run src/rules.test.ts"`.

## Current state

Firestore is wired: `apps/web/lib/store.tsx` holds live listeners (one per
Notion source the active role reads, with the caller's own `array-contains`
clause for an assigned-only source) and every mutation is a write. The Pi runs
`production` behind Tailscale. The first company is created empty with one role,
"General"; `packages/core/src/fixtures.ts` feeds only the tests and the engine
selftest. The Notion sync runs against ADITUM since 2026-09-05: four sources
registered from *Integraciones* (Tareas Software, Backlog Software, Gestor de
lanzamientos, Proyectos), three roles reading them, a weekday timer on the Pi.
The status clock of every task was repaired that day to the page's last edit.
**The ADR-009 rules are written and tested but not yet deployed**: the Pi's
service account cannot deploy rules and the Pi holds no `firebase login`; until
`npx firebase-tools deploy --only firestore:rules,firestore:indexes` runs from
a logged-in machine, the live rules still accept the narrower query the app
issues for an assigned-only source (so the screen is right) but do not enforce
the restriction server-side. PRs #1–#10 were
merged straight into `production`; `main` was fast-forwarded to match on
2026-09-05, and from here the flow above (land on `main`, fast-forward
`production`) is the one to follow.
