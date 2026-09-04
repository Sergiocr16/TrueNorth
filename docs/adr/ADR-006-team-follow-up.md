# ADR-006 — Team follow-up: expectations, situations and suggested messages

Date: 2026-09-04 · Status: accepted

## Context

TrueNorth answered one question well: *what should I do today?* It answered
nothing about the other half of Sergio's work, which is *how is each person
doing against what I expect of them, and what do I say to them today?*

Three things were missing. What is expected of somebody was a paragraph of free
text on their membership — readable, but not checkable against anything. What is
going on with somebody, the week they are having, had nowhere to live at all.
And the follow-up itself, which in ADITUM happens in the comments of Notion
tasks and in whether a status moved, had no representation in the app: the
engine could see that a task was overdue, never that it had sat untouched for
nine days with a question nobody answered.

Writing a message to a real person is also not the same as writing a plan for
yourself. It can be wrong in ways a plan cannot: it can nag, it can repeat
yesterday, it can quote something private, it can go to the wrong person.

## Decision

**Expectations are prose, judged by the model.** `Membership.expectations` is
free text in the manager's own words. The first draft tied each expectation to
an objective so a signal could check it; Sergio rejected that, and he was right
about where the line falls. The facts — which task moved, which comment went
unanswered, which date slipped — are signals computed in code. Whether those
facts add up to "delivering what I expect" is a comparison between a standard
written by a person and evidence, and that is exactly the judgement ADR-002
leaves to the model. The reading says so; the message still has to cite the
signals it rests on.

**Situations are a first-class collection**, `companies/{cid}/situations`,
readable and writable only by owners and admins. Each carries a `discreet` flag,
which is the safeguard that makes the feature usable with real employees: the
engine lowers the ask and softens the register, and never writes the reason into
a message. The engine also refuses, in code, any message that repeats a discreet
note verbatim.

**The follow-up is a third engine step, one call per manager**, not one per
person. Deciding *who* to write to is half the judgement — the task is stuck, and
whether that is the developer's problem or the lead's is only visible with the
whole team side by side. Managers are the members whose access is `owner` or
`admin`.

**It produces two different things.** A *reading* for every person, every day:
how they are doing, and what the manager should do about it. A *message* only
for the people the data says need one — silence is a valid answer, and the
reading is where it is explained. A reading may cite no signal; a message must
cite at least one.

**The default channel is a comment on the task.** Where the signal is about one
task, the suggested text goes there, because that is where the conversation
already lives. A direct message is for what spans several tasks or is about the
person rather than the work.

**Nothing is sent or published automatically.** The manager copies the text, and
may edit it first. What was actually sent is stored and fed back into the next
day's prompt.

**Signals carry their summary into the document.** Plans get away with citing
ids alone, because the browser recomputes the same signals from data it can
read. A follow-up cannot: it cites signals about other people, drawn from plan
history the rules keep private. So `{ id, severity, summary }` travels with the
message.

**Repetition is stopped in code, not by the prompt.** A message citing exactly
yesterday's signals, with nothing worse behind it, is dropped before it is
written.

**Who is responsible comes from Notion, matched by name.** The task already
carries its Notion person; the app never decides that. The sync resolves that
person to a team member with `matchPerson()` — accent- and case-insensitive,
first-name matches allowed when unambiguous, and a refusal rather than a guess
when two people fit. A Notion person with no match becomes a new person on the
team without an account, so the team populates itself from Notion and Sergio's
only job is to write what he expects of each one.

## Alternatives considered

**One call per person.** Cheaper to reason about, and it produces better prose
per person — but it cannot answer "who should hear about this", which is the
question Sergio actually asked. Rejected.

**Messages without signals behind them.** Would have made the feature easy and
made it worthless: a daily generator with no grounding writes plausible nagging.
Rejected; it also breaks ADR-002.

**Publishing the comment straight to Notion.** The plumbing will exist once the
Notion write-back lands, and it fits ADR-004 — Claude interprets, code writes.
Deferred deliberately: nothing that reaches another person leaves this app
without Sergio reading it first.

**A separate `/seguimiento` route.** Rejected in favour of the Team screen,
where the person, their role, their expectations and their message sit together.
Today only carries the count.

## Consequences

**Positive.** Follow-up becomes traceable in the same way plans are. The
"nothing has moved" signals — `stale_task`, `comment_unanswered`,
`silent_owner`, `no_followup` — are the first ones that describe the
conversation around the work rather than the work alone, and they are what
detects a lead who has stopped chasing. Recognition is a first-class tone, so
the feature is not only a machine for telling people off.

**Negative.** The company now stores private assessments of identifiable
people. That is a real obligation, not a footnote: in Costa Rica it falls under
Ley 8968, the rules keep it to admins, and the interface says it is private.

Two signals cost money to be honest about: on ADITUM's fixture the follow-up
call runs about 55 s and $0.15, roughly doubling the cost of a daily run rather
than the $0.05 first estimated.

The movement signals only tell the truth going forward. Notion does not expose
status history, so `statusChangedAt` is stamped by our own sync when it sees a
status differ from the stored one, and `Project.history` starts empty. For the
first week after this ships, "it has not moved" has nothing to say.
