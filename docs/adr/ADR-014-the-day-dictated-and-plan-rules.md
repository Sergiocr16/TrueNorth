# ADR-014 — The day the person actually had, and the rules they confirm from it: the engine is tuned by evidence, never by itself

Date: 2026-10-11 · Status: accepted

## Context

The only feedback the engine ever received was the three verdicts on a plan
item — `done`, `skipped`, `irrelevant` — which reach the next day's prompt as
three lists, built by `yesterdaySummary` in `run.ts`. That channel describes
only what the engine *proposed*. It can say the engine was wrong about an
item; it can never say what the engine should have said instead.

So the work a person actually does that no plan ever asked for left no trace
anywhere. A blind spot in the signals was therefore invisible by
construction, and repeated itself every morning: nothing in the system could
notice that somebody spends their Tuesdays on a kind of work the engine has
never once mentioned.

The tuning did exist, but the mechanism was a person. `docs/engine-feedback.md`
records what Sergio said about a plan and which prompt rule changed because of
it — one entry, dated 2026-09-07. It depends on Sergio remembering to say it
and on somebody editing `prompts.ts` afterwards.

Three facts in the code shaped the design. There is no fine tuning to be had:
the engine is `claude -p` with the model pinned by `ENGINE_MODEL`, so anything
"learned" has to be accumulated context or computed signal, nothing else.
`CompanyContext` carries no viewer identity, so per-person data already
travels as a prompt-builder argument (`yesterday`, `personalSignals`,
`FollowUpSubject.situations`). And `enforceCitations` drops any plan item
citing a signal the person was not shown, which is the guard that must survive
whatever is added.

## Decision

**What the person did goes in `companies/{cid}/updates`, which already had a
rule.** One document per person per day, id `${date}_${uid}`, `kind:
'day_log'`, edited all day rather than appended to — so it serves dictating at
the close and jotting as the day goes. The collection's rule already gates
read and create on `uid`, allows updates while `appliedAt == null`, and
forbids deletion; a day log is never applied, so it stays editable, and the
record of what somebody said they did is not theirs to erase. No rule changed.
`kind` keeps the collection honest: the ADR-004 voice flow writes `'voice'`
documents into the same place. The collection was also the only rule in the
file without a test; it has one now.

**The rules a person confirms live in an array on their member document.**
`Membership.planRules`, beside `expectations`, which is the same thing in
spirit: prose the model reads, not a fact it computes. Decisive: the engine
already reads every member document in `captureCompany`, so a rule costs no
extra read, and no new collection means no new security rule — the same
reasoning the `users/{uid}` rule records for the personal reminders, that a
subcollection needs its own rule and rules deploy from a logged-in machine,
never from the Pi. The one rule change is `planRules` in the member's own
`changedOnly` list, so a plain member may write it without being an admin: an
admin says what is *expected* of somebody, but how you work is yours to
describe.

**The engine proposes; the person confirms; the app writes.** `proposedRule`
is an optional field on both plan contracts, carrying a sentence, its scope
and the evidence behind it. The engine stores it on the plan document it
already owns. Confirming or dismissing writes a `PlanRule` to the person's own
member document — and because that rule records the `planId` it came from,
the screen knows the proposal was answered without anything being written back
to the plan. So `changedOnly(['feedback', 'stale'])` on `plans` is untouched,
and the client has exactly one write target. A dismissed rule is kept with
`status: 'rejected'` rather than deleted, so the same sentence is not offered
twice.

**A proposal is offered only when the day gave a reason for one.** The
instruction is appended to the plan prompt only when there is a day log or an
"no aplica" from yesterday, and it asks for at most one rule, never a generic
one, never a repeat of something already confirmed. A proposal every morning
would be noise, and noise is what gets tapped through without reading.

**Rules change the ranking and the wording, never the facts.** They are prose,
like `roleDescription`. `enforceCitations` still runs, so every item still
cites a signal computed in code: ADR-002 is intact. Where a rule and a signal
disagree, the prompt says the signal remains the fact and the action must be
restated to respect the rule — follow somebody up rather than do their work —
not hidden. The rules reaching one prompt are capped at
`MAX_PLAN_RULES`, because a list that grows without bound ends up
contradicting itself and the prompt cannot tell which of two opposing
sentences the person still means.

**The day log reaches the prompt raw.** No matching to tasks, no detection of
work without a task behind it. That interpretation is what would justify new
signals, and new signals are better designed against weeks of real logs than
against a guess.

## Alternatives considered

**A `planRules` subcollection.** The honest default, and rejected on the
repo's own recorded grounds: a rule, a rule test, a deploy from a logged-in
machine, and one more read per engine run, to hold a handful of sentences that
fit next to `expectations` on a document already being read.

**`users/{uid}.planRules`, like the reminders.** No rule change at all, since
that document is already fully self-writable. Rejected because a rule is
scoped to a role, and a role is company-scoped: cross-company storage for
company-scoped data would be wrong, and the engine would need a read per
person it does not do today.

**The proposal confirmed on the plan document.** The obvious shape — the
engine wrote it there, answer it there — and it forces `changedOnly` on
`plans` to grow a field, weakening the guarantee that a person can only ever
touch `feedback` and `stale` on something the engine wrote. Rejected for a
field on the member document that the client may write anyway.

**The model writing rules by itself.** Rejected by ADR-004, and on its own
merits: a model that can write its own standing instructions can reinforce a
belief nobody checked, and there would be no moment at which a person saw the
sentence that is now shaping every plan.

**Voice now.** Wanted, and deferred. It needs Whisper on the Pi, and
`apps/web/app/today/voice-flow.tsx` is already a complete implementation of
"free text → interpreted items → confirm each → apply" waiting for it. The
learning loop does not depend on it, and text does not block on hardware.

## Consequences

**Positive.** A day leaves two traces instead of one, and the second accrues:
the work the plan never asked for now reaches tomorrow's prompt, and a rule
confirmed once keeps being read every morning without anybody editing
`prompts.ts`. The loop that was Sergio-plus-a-markdown-file is now the app's.
Both new surfaces cost one rule line and one index between them. Every plan
item still cites a computed signal.

**Negative.** A rule written badly is followed badly, exactly like a focus or
a role description — prose in, prose out. The day log is unstructured, so
nothing yet computes over it and the engine cannot be held to having read it
correctly. A person who writes nothing gets what they got before, which also
means the feature is invisible until used. `MAX_PLAN_RULES` will eventually
bind, and when it does the oldest confirmed rules silently stop reaching the
prompt. And the metric that says whether any of this worked — "no aplica" per
week — needs weeks before it says anything at all.
