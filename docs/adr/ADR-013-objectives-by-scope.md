# ADR-013 — An objective is the company's or one role's; everybody reads all, each role is measured by its own

Date: 2026-09-07 · Status: accepted

## Context

Every objective was the whole company's: any member could create, edit or
delete one, and every screen, signal and prompt read the full list. The six
objectives loaded for ADITUM are the CTO's (they say so in their titles),
yet a Project Manager's plan was measured against them, and a developer
could rewrite them.

Sergio's requirement: the company's general objectives are the owner's and
the admins' to edit; each person defines objectives for the role they hold;
a switch says which kind an objective is; a general one applies to every
role, a role one only to the people who hold that role. Everybody may still
look at every objective, but only the general ones and their own role's
should be active for them — on screen, in the plan, in Reports.

## Decision

**`Objective.scope` is `general` or `role`, with `roleId` for the latter.**
Absent means general, so every objective written before this ADR keeps its
meaning. The six existing objectives are marked as the CTO role's.

**Active means general plus the role on** (`activeObjectives` in
`packages/core/src/visibility.ts`). `scopeFor` narrows objectives the way
it already narrows projects and tasks, so the engine's signals, prompts,
briefing and plan for a role only know the objectives that count for it;
`fmtObjective` says which kind each is. The browser computes its signals,
health compass, Reports and the company's status counts from the same
active set. `orphan_project` is unchanged — it looks at whether a project
serves *any* objective — so a project serving another role's objective is
not read as orphaned, and the prompt says "sirve a un objetivo de otro
rol" for it.

**Everybody reads every objective.** The Objectives screen shows the
company's, then the role's, and other roles' behind "Ver N de otros
roles", grouped by role. Reading needs no rule change, so the store's
listener stays a single query.

**Who writes is decided by the scope, in the UI and in the rules.** Owner
and admins write any objective; a member writes only a role objective of
a role they hold. The editor offers the "Objetivo general" switch to admins
and a role picker limited to the roles the person holds; the detail screen
hides "Editar" from whoever may not. `firestore.rules` says the same with
`canWriteObjective`, tested in the emulator; it is deployed from a
logged-in machine, as ADR-009's rules are still waiting to be.

## Alternatives considered

**Hide other roles' objectives entirely.** Consistent with ADR-008, but
Sergio wants to be able to look; the split between *seeing* and *being
measured by* is the point. Rejected.

**Owner-only for general objectives.** Sergio chose owner and admins.

**A per-objective member list.** More than a small company needs; roles
already say who does what. Rejected.

## Consequences

**Positive.** A role's plan is measured against its own goals and the
company's, not against another role's. A developer can write the
objectives of their role without touching the company's. Old data needs
no rewrite.

**Negative.** Until the rules are deployed, only the screens enforce who
writes. A project linked only to another role's objective shows no
objective in a role's view, only the note that it serves one elsewhere.
`upsertObjective` writes the whole document, so a client older than this
change would drop the scope — all clients update with the deploy.
