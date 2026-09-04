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
apps/web/            Next.js 16 App Router, PWA, deployed to Firebase App Hosting
  app/               routes (Spanish paths), one folder per screen
  components/        design system: ui.tsx, form.tsx, shell.tsx, icons.tsx
  lib/               preferences (theme + locale), store (editable data), i18n
packages/core/       domain types, Zod contracts, signal engine, Notion mapping,
                     ADITUM fixtures. Imported by web, functions and worker.
docs/brand/          the compass mark (light, dark, maskable app icon)
docs/design/         the Claude Design brief
docs/adr/            architecture decision records
docs/prompts/        engine prompts with their change history
```

Planned, not yet built: `apps/functions` (Cloud Functions: scheduler, triggers, Notion sync, watchdog, API fallback) and `apps/worker` (the Raspberry Pi worker).

## Commands

Node 26.8.1 (see `.nvmrc`), pnpm 11.

```bash
nvm use                   # picks up .nvmrc
pnpm install
pnpm dev                  # web app on :3000
pnpm build                # production build
pnpm typecheck            # tsc --noEmit across the workspace
pnpm test                 # signal engine tests (vitest)
```

**Stay on the newest versions.** This project tracks current releases rather
than the conservative floor: Node 26, pnpm 11, Next 16, React 19, TypeScript 7,
Tailwind 4, Zod 4, Vitest 5. When you add or bump a dependency, take the latest
and run `pnpm test && pnpm typecheck && pnpm build` before moving on. The one
place to check rather than assume is the deploy runtime: Firebase App Hosting
and Cloud Functions pin their own Node versions, so confirm what they support
before setting `engines` for a deployed package.

## Rules of work

- **Code, identifiers, comments, commits and technical docs in English.** UI text in Spanish, in `apps/web/lib/i18n/dictionary.ts`, with an English variant for every string. Never hardcode user-facing text in a component.
- **Never commit or push unless Sergio asks.** Leave changes in the working tree.
- **No secrets in the repo.** Firebase service accounts, Notion tokens and the Anthropic key live in Secret Manager or in an untracked `.env.local`.
- **Every new collection ships with a security rule and a rule test.** The engine runs with the Admin SDK and bypasses rules, so the private-project filter lives in the capture step and has its own tests.
- **All real business data is editable in the app.** North star, objectives, indicators, projects, tasks, roles and risks are all created and edited by the user. Anything you add to the domain needs an editing path too.
- Prefer editing an existing file over adding one. Keep components small and typed.

## Contracts that need an ADR to change

- The daily plan schema (`packages/core/src/schemas.ts`): three to five items, each citing a signal, plus the consequence sentence.
- The `jobs` document shape used by the Raspberry Pi worker.
- The Notion status map (`packages/core/src/notion-status.ts`): fifteen Notion labels collapse onto four internal states. The signal engine, the plan and the voice writer all depend on it.
- The route paths, which are Spanish and user-visible.

## Design system

The visual direction is "as if Apple designed it, with a touch of glass, readable above all". The full brief is in `docs/design/claude-design-brief.md`; the tokens are implemented in `apps/web/app/globals.css`.

Non-negotiables:

- **Glass is for chrome only** — tab bar, sidebar, sheet headers, the mic button. Body text never sits on a blurred background. Sheets use `.tn-sheet-surface`, which is near-opaque and does not rely on blur for contrast.
- **Both themes are first-class.** Light is the base `:root`; dark redefines only the tokens, once under `prefers-color-scheme` guarded by `:not([data-theme='light'])` and once under `[data-theme='dark']`. Never define a colour only inside a dark block.
- **Custom CSS lives in `@layer base` or `@layer components`.** Unlayered CSS beats every Tailwind utility, which silently breaks layout — this already cost us a bug where the tab bar dropped back into the flow.
- Body text 17px, touch targets 44pt, tabular numerals for anything that lines up in a column, status encoded in shape as well as colour.
- Mobile first. When phone and desktop conflict, the phone wins.

## Testing

- `packages/core` uses vitest. The signal engine and the Notion mapping are covered; keep them that way.
- Golden cases for the engine belong in `packages/core` alongside the signal tests: a company snapshot in, an expected plan shape out.
- Firestore rules get emulator tests once `apps/functions` exists. The first two must be: nobody reads another company, and nobody reads a private project they are not a member of.

## Current state

The web app is built against `packages/core` fixtures held in a client-side store that persists per browser (`apps/web/lib/store.tsx`). It seeds from ADITUM's real data. When Firestore is wired, the mutations in that store become writes and the context shape stays the same, so no screen needs rewriting.
