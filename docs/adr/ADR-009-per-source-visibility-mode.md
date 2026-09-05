# ADR-009 — A role reads each source whole, or only through the person's assignments

Date: 2026-09-05 · Status: accepted

## Context

ADR-008 made the role the unit of visibility: a role names the Notion
sources it reads, and whoever has it on sees every record of every one of
them. That was right for the CTO, who needs the whole of *Tareas Software*
and *Backlog Software* to run the team. It was wrong for a developer.

Sergio's requirement: "in *Backlog Software* everybody sees everything; in
*Tareas Software* I see only what is assigned to me." The CTO sees all of
both; a developer sees the whole backlog and only their own tasks. And the
engine must follow: a developer's plan is built from their assigned tasks,
and when none are left it should say which backlog items to pick up —
because the backlog is what they can see whole. Hiding the rest of the task
table is not about secrecy so much as focus: a person's day should not be
computed from work that is somebody else's.

## Decision

**Each source on a role is read in one of two modes.** `Role.sourceIds`
keeps saying what the role reads; a new `Role.assignedOnlySourceIds`, a
subset of it, says which of those it reads only through the person's own
assignments. A task from such a source is visible when `assigneeUserIds`
names the person; a project when `memberUserIds` does. Absent or empty means
what it always meant: everything. Roles written before this change need no
migration.

A parallel array rather than a `{sourceId: mode}` map, because the rule
stays one `in` on a list the evaluator can reason about, and because a
stray id — a source that left the role — is harmless: the code intersects
it with `sourceIds` before use (`roleAssignedOnlyIds`).

**The rules and the engine enforce the same thing.** `readsSource` in
`firestore.rules` gains the record's own people array as an argument and
requires the caller in it when the source is assigned-only on the active
role. The browser adds `where('assigneeUserIds', 'array-contains', uid)`
(tasks) or `where('memberUserIds', 'array-contains', uid)` (projects) to the
per-source listener of such a source, which is what lets the rule be proven
for the query; the plain per-source query is refused, and the emulator tests
pin both. The array is passed raw, not through `get()`: the evaluator can
prove `uid in resource.data.assigneeUserIds` against an array-contains
clause, and cannot prove it through a default. `scopeFor` in
`packages/core/src/visibility.ts` applies the same filter with the Admin
SDK before any prompt is built, and `Scoped` now carries
`assignedOnlySourceIds` so the prompt can say how each source is read.

**An assigned-only source makes the view partial.** `Scoped.partial` was
"there are sources this role does not read"; it is now also "there is a
source this role reads only in part". The consequence is the same:
`empty_objective` is not asserted, because "no active work serves this
objective" cannot be known from part of the work. Signals are recomputed
from the visible subset as before, so a developer never sees a workload
computed over tasks they cannot open, and the people in their view are
those who share a visible task or project with them.

**The plan draws from a list code prepared.** `pickableTasks(scope)` is the
open, unowned work of the app and of the sources the role sees whole,
highest priority first. When the person has no open task of their own the
prompt shows that list and the system rule says: propose taking one or two,
citing `no_owned_work:<uid>` — the signal that already fires for exactly
this situation — plus `unassigned:<taskId>` when it exists (it does not for
a `todo` with no owner, by design of ADR-002's signal). No new signal, and
the model never has to guess which database is a pool and which is private:
nothing from an assigned-only source can be in the list, because of those
the person only ever sees their own.

## Alternatives considered

**A `sourceModes` map on the role.** Reads better in the document; worse in
the rule, where a map lookup with a default is not something the query
evaluator proves. Rejected.

**Stamp `readerUids` on every task.** Rejected in ADR-008 for restamping
cost; nothing here changes that.

**A new `pickable_task` signal per backlog item.** Would give the model an id
to cite per task, but would flood the signal list with every unowned
backlog item — the very thing `unassigned_task` avoids by skipping `todo`.
`no_owned_work` already names the situation; the task list names the
candidates. Rejected.

**Assigned-only as a property of the source, not of the role.** Then the
CTO would lose the whole table too. The requirement is per role. Rejected.

## Consequences

**Positive.** A developer's screen, briefing, plan and follow-up are built
from their work and the backlog, and the plan says what to pick up next
without being able to name work it should not have seen. The CTO's view is
untouched. Old roles, old analyses and old plans keep their meaning.

**Negative.** A person in an assigned-only role sees fewer people: only
those on something they share. A manager who happens to hold such a role
gets a follow-up over co-assignees only, which is honest but thin — put a
manager on a whole-source role. `workload` in such a view averages over a
handful of people and can read oddly; it cannot leak anyone hidden, which
is the invariant that matters. The two new query shapes may one day ask for
a composite index (equality, equality, array-contains); the store logs
anything that is not a plain refusal so a missing index does not look like
an empty source. Rules must be deployed with the code: the old rules refuse
the new query and the new rules keep accepting the old one.
