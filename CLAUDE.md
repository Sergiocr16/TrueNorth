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
  app/api/           route handlers: engine (daily, replan, selftest), company logo
  server/            admin.ts (Admin SDK) and engine/ (capture, prompts, run,
                     claude) — never imported by the browser
  components/        design system: ui.tsx, form.tsx, shell.tsx, icons.tsx,
                     day-compass.tsx, plan-calendar.tsx, follow-up.tsx
  lib/               preferences (theme, accent, locale), store (Firestore
                     listeners + every mutation), i18n dictionary
  scripts/           one-off operator scripts (authorize-domain.mjs)
packages/core/       domain types, Zod contracts, signal engine, visibility,
                     follow-up guardrails, health shares, people matching,
                     Notion mapping, ADITUM fixtures. Imported by web only.
docs/brand/          the compass mark (light, dark, maskable app icon)
docs/design/         the Claude Design brief
docs/adr/            architecture decision records
docs/prompts/        engine prompts with their change history
```

Not yet built: the Notion sync (`apps/web/server/notion/`, ADR-006 "Fase 0"),
push and voice. There is no `apps/functions` and no `apps/worker`; both were
dropped by ADR-005.

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

Three sentences, enforced in `firestore.rules`:

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

- The daily plan schema (`packages/core/src/schemas.ts`): three to five items, each citing a signal, plus the consequence sentence.
- The team follow-up schema in the same file (ADR-006): a reading for every person, a message only for those who need one and only ever citing a signal, defaulting to a comment on the Notion task. Nothing is sent or published without Sergio copying it.
- The `jobs` document shape used by the Raspberry Pi worker.
- The Notion status map (`packages/core/src/notion-status.ts`): fifteen Notion labels collapse onto four internal states. The signal engine, the plan and the voice writer all depend on it.
- The route paths (ADR-007): English, one folder per screen, `[date]` and `[id]` for dynamic segments.

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
`captureCompany()` reads it with the Admin SDK (a week of plans, active
situations included) and computes signals; one `claude -p` call writes
`analyses/{date}`; one per member with an account writes `plans/{date}_{uid}`;
one per manager (`owner`/`admin`) writes `followups/{date}_{managerUid}` — a
reading of everyone, messages only for whoever needs one, greeting first,
guarded in code by `packages/core/src/followup.ts`. `/api/engine/ask` answers one
question from the same context, scoped to the caller, and may return a
proposed action the client confirms before writing (ADR-004); `/api/engine/replan`
recomputes one person's plan from the Today screen; `/api/engine/selftest`
(`?step=followup`) proves Claude answers without touching the database. The
three load-bearing flags in `server/engine/claude.ts` are `--restricted`,
`--tools ""` and a draft-07 JSON schema; the model is pinned by `ENGINE_MODEL`.

## Testing

- `packages/core` uses vitest: signals, visibility, follow-up guardrails, health shares, people matching, Notion mapping. Every new signal or guard ships with a test.
- Golden cases for the engine belong in `packages/core` alongside the signal tests: a company snapshot in, an expected plan shape out.
- Firestore rules have emulator tests in `packages/core/src/rules.test.ts` (Java 21+). The two that matter most: nobody reads another company, and nobody reads a private project they are not a member of; then situations stay with admins and a follow-up stays with its manager.

## Current state

Firestore is wired: `apps/web/lib/store.tsx` holds live listeners and every
mutation is a write, and the engine has run end to end against ADITUM from a
laptop. The first company is created empty; `packages/core/src/fixtures.ts` feeds
only the tests and the engine selftest. The Pi is not mounted yet
(`docs/pi-setup.md`), the Notion sync does not exist, and until it does the
"has not moved" signals have nothing to read. Work lands on `v1.0` at the
moment; `main` and `production` are behind it.
