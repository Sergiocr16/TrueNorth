# ADR-008 — Roles decide what a person sees; Notion databases are registered sources

Date: 2026-09-04 · Status: accepted

## Context

Until now every member of a company saw every task, the engine computed
signals over the whole company, and it wrote one briefing a day that
everybody read. The only scope that existed was the private project. "Role"
was a free-text title on the membership.

That stopped being true the moment Notion became the source of work. ADITUM
keeps its work in several databases — *Tareas Software*, two backlogs, a test
table, the projects table — and they are not one person's. The CTO should
read the software tables and nothing about sales; a salesperson the reverse.
Sergio's requirement was sharper than "hide some tables": what the engine
computes for a person must be built only from what that person sees, and a
person may have more than one hat. "If I change role I should see the other
role's suggestions and progress."

Two facts about the databases shaped the design. They do not share a
vocabulary: the backlog says "En desarrollo" where the task table says "En
curso", the test table keeps its status in a plain select with no groups, the
task number is a `unique_id` property whose name is the empty string. And
Notion keeps no history of status changes, so "this has not moved" can only
be known by remembering what we saw last time.

## Decision

**A role is a first-class, configurable entity** — `companies/{cid}/roles` —
with a name, a responsibility in prose, and the list of Notion sources it
reads. Nothing is predefined; each company writes its own. The first company
is created with one role, "General", reading no sources, so the app is useful
before any database is registered.

**A person holds several roles and has one on.** `Membership.roleIds` lists
them; `activeRoleId` is the one in use, and only the person changes it, only
to one of their own — the rule says so. `roleTitle` survives as a derived
field, the role names joined, because the company switcher and the prompts
read it; it is never edited by hand.

**The active role is the whole of the scope.** A Notion record is readable in
the browser while its source is on the caller's active role: the rules read
the member document, then the role, then check the record's `sourceId`; the
app issues one listener per source the role reads and one for app records,
which is what lets every query be proven. The engine applies the same
visibility in code (`scopeFor` in `packages/core/src/visibility.ts`) — and
goes one step further: it **recomputes the signals from the visible subset**
rather than filtering company-wide ones, because a workload or an "empty
objective" is an aggregate, and an aggregate over hidden data still tells
you about the hidden data. From a partial view, `empty_objective` is not
asserted at all.

**A Notion database is registered as a source** — `companies/{cid}/notionSources`
— with its own property mapping and its own status map. The mapping is
suggested from the database's schema by type (the `title`, the `people`, the
`unique_id`) and corrected on screen; the status map starts from Notion's own
groups (to-do, in progress, complete), with a label that says it is waiting
on something sent to blocked, and a plain select starting as to-do with the
obvious words recognised. `NOTION_TASK_STATUS`, the ADR-gated constant,
becomes the known default: a test pins that the database it describes still
resolves to exactly it.

**The sync is deterministic code on the server**, `apps/web/server/notion/`,
pinned to the 2025-09-03 API version (the one with data sources). It reads
what Notion says changed, maps it with pure functions that live in
`packages/core` under tests, stamps `statusChangedAt` when a label differs
from the stored one, resolves people by name and creates on the team whoever
Notion names that the team lacks, and refreshes comments on its own schedule,
because a comment does not bump its page's edit time. A full read happens at
least weekly and whenever the mapping changes. Claude is nowhere near it
(ADR-004). A Notion record is never written from the browser: it lives in
Notion.

**The morning call is one per person, in the role they have on, and it
produces both the briefing and the plan** — `analyses/{date}_{uid}_{roleId}`
and `plans/{date}_{uid}_{roleId}`. One shared company briefing cannot
survive scoping: it would be built from everything and read by everyone. One
call rather than two because the context is the expensive part and the plan
is more coherent written by the model that just wrote the briefing. The
follow-up is one per manager in their role, over the people who exist in
that role's view — somebody whose work is all in a source the role does not
read is not in the prompt.

**Other roles are computed on demand.** The nightly run costs one call per
account; multiplying it by roles would multiply the bill for plans nobody
opens. When a person switches to a role that has no plan or follow-up yet
today, the screen says so and offers to generate it, which takes under a
minute and uses exactly the functions the nightly run uses.

## Alternatives considered

**Assign sources to people directly, no roles.** Simpler, and it was the
first draft. Rejected by Sergio: the point is to put on a different hat and
see that hat's day, and to add a person by giving them a role rather than a
list of tables.

**The union of a person's roles as their scope.** Would show more and mix
everything; the whole requirement was not to mix. Rejected.

**Copy the allow-list onto every task (`readerUids`).** Makes the rule a
single `array-contains`, but every change to a role would have to restamp
every task of every source it touches. The chain of two `get()` calls costs
nothing extra — Firestore deduplicates them within one evaluation — and
needs no restamping. Rejected.

**Keep filtering company-wide signals per person.** Cheaper to write, wrong:
`workload:bob` computed over tasks the viewer cannot see leaks their
existence. Rejected in favour of recomputation, which is milliseconds.

**One briefing per role, shared by its holders.** Fewer calls, but the
briefing quotes the person's own tasks and yesterday's plan, and two people
in the same role do not have the same day. Rejected.

**Every role every night.** Deferred, not rejected: if switching roles
becomes a daily habit, an environment flag can compute them all.

## Consequences

**Positive.** A person's screen, plan, briefing and follow-up agree with each
other, and none of them can name work from a table their role does not
read. Adding somebody to the team is choosing their roles. Registering a
database is pasting a link and checking a table; the mapping is data, so a
new database in Notion is a screen, not a release. The Notion sync exists,
so the movement signals of ADR-006 finally have something to read.

**Negative.** Cost scales with accounts rather than with the company: each
account costs one Opus call a night, roughly $0.10–0.15, plus whatever roles
they generate on demand. The API only returns unresolved comments, so a
resolved thread disappears from the follow-up's view. There is one Notion
token per server, in the Pi's environment file; a second company with its
own workspace needs per-company tokens, which is a later step. `analyses`,
`plans` and `followups` written before this change carry no `roleId` and
are unreadable or ignored; the database was empty when this shipped, so
nothing was migrated. And a role with no sources sees only what was recorded
in the app, which is the honest answer, not a bug.
