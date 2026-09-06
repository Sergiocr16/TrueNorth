# ADR-010 — GitHub pull requests are a source; repositories sit on roles; code says who owes what

Date: 2026-09-06 · Status: accepted

## Context

Work finishes in Notion but ships through GitHub. A task reaches *Pruebas
QA* or *Lista para deploy* and what actually happens next is a pull
request: the developer opens it against the repository's base branch, the
CTO reviews and merges it. Neither table saw the other. The engine could say
"this task has not moved" but not "the code for it is sitting in a pull
request nobody has reviewed for a week", which is the more common truth at
ADITUM, and the more actionable one.

Sergio's requirement: the reporter must have access to GitHub as well, and
understand the flow — the developer responsible for a project answers for
its pull requests and for opening them when a task is done; the CTO answers
for approving and merging them — so that what it recommends to each person
follows their role and responsibility. A GitHub token of his account goes
in the app's environment on the Pi.

Facts that shaped the design, read from the repositories with `gh`: the
product repository's default branch is `development`; branches are named
`feature/TAR-1093` and `hotfix/TAR-1092`, titles start with the code; pull
requests stack on `project/*` and `feature/*` branches, and hotfixes go to
`production` and `development` both; almost nobody approves formally — the
CTO approves by merging; Copilot leaves bot reviews; one person can have
two logins, exactly as with Notion identities.

## Decision

**A repository is a source, and it sits on roles in the same list as a
Notion database.** `companies/{cid}/githubRepos` holds the registered
repositories with the project each belongs to and its base branch;
`Role.sourceIds` may name a repository, whole or assigned-only. Who reads a
repository's pull requests is therefore decided exactly as ADR-008 and
ADR-009 decide who reads a Notion database: `roleSourceIds()` takes both
lists, the rules' `activeSourceIds()` need no change, and assigned-only
means "the pull requests that name me as author or reviewer".

**Pull requests are their own collection**, `companies/{cid}/pullRequests`,
written by a deterministic sync and never by the browser. Not a third
`RecordSource`: a pull request is neither a task nor a project, and the
rules for those stay byte-identical. The rule `readsRepo(companyId,
people)` mirrors `readsSource` on the record's `repoId` and
`peopleUserIds`, and the store issues the same two query shapes.

**Linking is by code, then by repository.** `TAR-###` in the branch, the
title or the body ties a pull request to a task and, through it, to the
task's project; a pull request without a code hangs off the repository's
project. Any base branch counts: a pull request onto a project branch is
still the task's pull request.

**Who owes what is computed in code**, four signals: `pr_missing` (a task
in a "development finished" status, in a project with a repository, with
no pull request — the developer's), `pr_awaiting_review` (open, not a
draft, nothing decisive from a reviewer — the approvers'),
`pr_changes_requested` (changes asked and nothing from the author since —
the developer's), `pr_approved_unmerged` (approved and still open — the
approvers'). Approvers are the holders of the roles the integration names,
prefilled with the role called CTO. Bots are not reviewers. Reviews are
read GitHub's way: the latest decisive review per reviewer counts, changes
requested outweigh approvals, a dismissal clears one.

**People come from Notion, never from GitHub.** A login is matched to a
member by a login the member declared, or by the profile's name through
the same matcher as a Notion person, and is remembered on the member; a
login nobody claims is reported on the repository for an admin to assign.
A member can hold several logins.

**One token per server, the sync runs after Notion**: in the daily run and
in the day timer, because a pull request finds its task by code and the
task must be there first.

## Alternatives considered

**Notion's own "PRs de GitHub" relation as the link.** Indirect, stale by
a sync, and it carries no review state. Kept as a possible secondary link;
rejected as the source.

**Stamp pull requests with the task's Notion `sourceId`.** Would reuse
`readsSource` unchanged, but a pull request without a task would vanish and
a change of source would mean restamping. Rejected.

**A separate `repoIds` list on roles.** Two lists, two rules, one meaning.
Rejected.

**Webhooks.** The Pi is behind Tailscale; GitHub cannot reach it. Polling
every two hours on weekdays is enough for a question asked once a night.

**Only pull requests toward the base branch count.** ADITUM stacks pull
requests on project branches; a task's pull request onto `project/x` is
real work awaiting review. Rejected; the base branch annotates, it does
not gate.

## Consequences

**Positive.** The CTO's plan lists what waits on them; a developer is told
when a pull request is owed or a review went unanswered; the follow-up
says "your PR for X is waiting on my review" instead of "X has not moved".
Adding a repository is picking it from a list; who reads it is a role
decision, as everything else.

**Negative.** A login that matches nobody makes a pull request nobody's
until an admin assigns it. A branch without the task code links only to a
project. Every open pull request costs a few API calls per run; the client
sleeps on the rate limit rather than failing. `pr_missing` depends on the
company's "finished" statuses being right, so it is `info` and never
louder. And the rules must be deployed with the code, as with ADR-008 and
ADR-009.
