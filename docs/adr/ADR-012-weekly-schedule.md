# ADR-012 — The week: a rest day gets optional suggestions, a working day may have a focus; the role never changes

Date: 2026-09-06 · Status: accepted

## Context

The engine never knew what day it was. `runDaily` took an ISO date, the
prompt interpolated it raw, and nothing derived the weekday from it. The
daily timer runs seven days a week, so a Saturday produced the same plan
as a Tuesday — three to five obligations, overdue work chased, "what
happens if this is not done today" — and pushed it to the phone.

Sergio's requirement: the role a person has on is the same every day; what
changes with the day is the *mode*. A working day gets the role's plan,
optionally ordered by a focus written for that day ("viernes: cerrar
pendientes y dejar todo listo para el lunes"). A rest day gets a different
engine: one to three optional suggestions of research or improvement,
nothing owed. The company decides the days and a base focus; a role may
add its own focus for a day. Public holidays were left out on purpose.

Two facts in the code shaped the design. The plan contract travels to the
Claude Code CLI as a hard JSON schema, so `items.min(3)` cannot be relaxed
by a prompt; and `enforceCitations` drops any item that cites no signal
the person was shown, so a suggestion with no task behind it needs a real
signal to rest on.

## Decision

**The schedule lives on the documents that already exist.**
`Company.schedule` holds the working days and a focus per weekday;
`Role.schedule` holds a role's own focus lines. Absent means Monday to
Friday, no focus. Both are admin-only already, so no rule changes.

**The day is resolved in code.** `resolveDay(company, role, iso)` in
`packages/core/src/schedule.ts` says whether the day is a working day and
which focus applies — the role's, then the company's. `capture.ts` threads
it into the scope and the prompt context; the prompt names the weekday
and says what kind of day it is.

**The day is a signal.** `rest_day:<iso>` on a rest day, `day_focus:<iso>`
on a working day with a focus; both `info`, both shown to everybody. A
rest-day suggestion cites the first; an action born of the focus rather
than of a task cites the second. That is what keeps every item checkable.

**A rest day is a second contract, not a relaxed one.** `dailyPlanSchema`
is unchanged. `restDayPlanSchema` asks for one to three items with no
deadline and no consequence sentence, and `run.ts` chooses between them
from `day.working` — a deterministic fact, not something asked of the
model. Every item of a rest-day plan is stamped `optional: true` in code;
the plan records `dayKind` and `focus`, and the screen reads those rather
than recomputing the day, so it describes the plan that was written.

**The briefing is still produced on a rest day; follow-ups are not.** The
briefing feeds the executive screen and costs nothing extra. Following
people up on their day off is not what the product is for — not from the
timer, and not on demand either: the route answers `skipped` and the
screen says it is a rest day.

**The timer keeps running daily.** The engine decides what the day is.

## Alternatives considered

**One schema with `min(1)` and an `optional` flag the model fills.**
Loses the hard guard that a working-day plan has at least three actions,
and hands the model a fact code already knows. Rejected.

**No plan on a rest day.** Sergio wants light improvement work offered,
not silence. Rejected.

**Public holidays in code.** Deferred by decision; a day can be switched
by hand in the schedule when it matters.

**A `schedules` collection.** A rule and a rule test for two small maps.
Rejected.

**A different role per weekday.** Considered and dropped by Sergio: the
role is who the person is at work; the day only changes the mode.

## Consequences

**Positive.** Saturday looks like Saturday: a couple of things worth
reading or trying, nothing owed. A Friday focus reorders the plan without
losing an overdue-and-silent or blocked signal. The prompt names the day.
Everything an item cites is still a computed fact.

**Negative.** A focus written badly ("hacer todo") is followed badly; it
is prose, like the role description. Plans written before this ADR have
no `dayKind` and render as before. The browser must pass `day` to
`computeSignals`, or a plan item citing the day shows no signal line.
