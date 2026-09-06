# ADR-011 — An objective is measured by its indicators; progress is computed, and each indicator has its own date

Date: 2026-09-06 · Status: accepted

## Context

Reports plots two lines per objective — where it should be and where it
is — and the engine raises `progress_gap` from the distance between them.
Both came from numbers a person typed: `progressPct` on the objective, and
a straight ramp from the objective's start date to its target date as the
expectation. Indicators existed on the objective (baseline, current,
target, direction) but nothing read them beyond a bar on the detail screen
and a line in the prompt.

With ADITUM's six CTO objectives loaded, the screen showed what that
produces: progress of 45 %, 31 %, 30 % and three zeros, typed on day one,
with no indicator behind any of them; and one ramp to 31 December for all
six, while their key results speak of three, six and twelve months. Reports
could only ever draw an opinion against an assumption. Sergio's reaction
was the right one: "no me termina de convencer que sea muy útil".

## Decision

**An objective's progress is the mean of its indicators' progress**, where
an indicator's progress is the share of the distance from its baseline to
its target that its current value has covered, clamped to 0–100. The
number is recomputed on every write (`objectiveProgressPct` in
`packages/core/src/signals.ts`, applied by `upsertObjective`), so what is
stored, plotted, signalled and shown to the model is the same measured
value, and the objective's history records it. The typed number stands only
for an objective without indicators, which the screens now say out loud.

**Each indicator may carry its own target date.** The expected progress of
an objective on a day is the mean of each indicator's linear ramp from the
objective's start to that indicator's date (`expectedObjectivePct`); the
objective's own ramp is the fallback for an indicator without a date and
for an objective without indicators. The expected line in Reports is
therefore piecewise, with a bend wherever an indicator comes due
(`expectedObjectivePath`). Gap and health follow (`objectiveGap`,
`objectiveHealth`); `progressGap` and `healthFrom` stay as they are for
projects.

**Reports shows every indicator**, each against its own target and date,
not just the first; the editor shows the computed progress in place of the
slider as soon as an indicator exists.

## Alternatives considered

**Progress from the tasks of the projects that serve the objective.** Task
completion measures activity, not outcome; a project can close every task
and move no indicator. Kept as the thing projects already show for
themselves. Rejected as the objective's progress.

**Weighting indicators.** Every objective at ADITUM has two to five key
results of comparable weight; a weight field would be one more number to
invent. Rejected until a real case asks for it.

**Indicators computed by the sync** — pull-request coverage of tasks in
review, overdue share, time in review, regressions when Notion tags them.
The right next step: the data is already in Firestore, and it would make
Reports move without anybody typing. Deferred to its own ADR because it
adds a source to the indicator and a writer to the sync.

## Consequences

**Positive.** Progress means something checkable: a person can read the
indicators and redo the mean. A key result due in three months is
expected at 100 % in three months. The model sees the same number the
screen does, with each indicator's date and share. An objective without
indicators is visibly an opinion.

**Negative.** Progress moves only when somebody updates an indicator's
current value — the same as before, but now honest about it — until
computed indicators exist. An objective whose indicators are all due
early sits at "expected 100 %" for the rest of its window, which is what
a missed key result looks like. Existing objectives keep their typed
progress until they get indicators; their history will show the jump.
