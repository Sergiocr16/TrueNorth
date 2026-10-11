# Engine feedback log

What Sergio said about a day's plan, and what changed in the engine because
of it. One entry per lesson, newest first. The prompts live in
`apps/web/server/engine/prompts.ts`; the rules that can be computed live in
`packages/core/src/signals.ts` and ship with tests.

**Since ADR-014 this file is for changes to the engine itself** — a prompt
rule, a new signal, a contract. The day-to-day tuning moved into the app: what
Sergio actually did goes in the day log on *Hoy*, and a sentence about how he
works goes in *Mis reglas*, which the plan prompt reads every morning. A
lesson only lands here when it is everybody's, not his.

## 2026-10-11 — The tuning loop moved into the app

**The problem:** the three verdicts on a plan item only describe what the
engine proposed. Sergio does plenty the plan never asked for, and none of it
left a trace, so a blind spot in the signals was invisible and repeated
itself. This file was the only tuning mechanism, and it needed him to
remember and somebody to edit `prompts.ts`.

**Changed:** ADR-014. A day log per person per day in
`companies/{cid}/updates`, read raw into the next day's prompt; confirmed
rules in `Membership.planRules`, read every morning; and `proposedRule` on
both plan contracts, so the engine may offer one rule when the day gave it a
reason — stored on the plan, confirmed by Sergio onto his own member
document, never reaching a prompt unconfirmed.

**What to watch:** "No aplica" per week. If it does not fall, the problem was
never the feedback and the next move is new signals computed over the
accumulated logs (`work_off_plan`, `habitual_work`, `rejected_kind`), not
more prose in the prompt.

## 2026-09-07 — Owning a project is not doing its tasks

**The plan said:** "Definí y ejecutá el orden de integración de la ola de
passkeys (TAR-1071 → 1073/1074, luego 1076/1077)", to Sergio.

**Sergio:** those tasks are Juan's; if Juan is responsible for them, that is
his job, not the CTO's. The rest of the plan (planning block, dating his
own undated tasks, the technical review of Privacidad, deciding TAR-605)
was right.

**Why the engine did it:** the project *Inicio de sesión con passkeys* has
Sergio as its owner in Notion while every task is Juan's; the signals were
`no_followup` on the project plus overdue and unanswered comments on Juan's
tasks, and the model turned "you own the project" into "you do the work".

**Changed:** a rule in both plan prompts — owning a project is not doing its
tasks; on somebody else's task the reader's action is to follow up, decide,
unblock, review or merge, named as such and naming the person. The project
line in the prompt now says who the project's owner is, next to what the
task lines already say about who does each task. And "No aplica" on a plan
item now reaches the next day's prompt as its own list, with the
instruction not to propose it again — so tapping it on the phone is the
fastest way to teach the engine.
