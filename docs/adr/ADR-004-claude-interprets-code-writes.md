# ADR-004 — Claude interprets, code writes

Date: 2026-09-03 · Status: accepted

## Context

TrueNorth changes Notion: a status moves, a due date shifts, a note is added.
Two ways to build that suggested themselves:

1. Give Claude the Notion tools and let it perform the change end to end.
2. Let Claude turn language into a structured proposal, and have ordinary code
   perform the change once a person confirms it.

The question came up while designing the voice flow, but it applies equally to
tapping a status in the app.

A third option, writing to Notion straight from the browser, is not available:
the integration token would have to ship to the client, where anyone can read
it. Any Notion write needs a server-side step regardless of this decision.

## Decision

**Claude never calls Notion.** Its output is a proposal, validated against a Zod
schema, that a person confirms or corrects. The write itself is a deterministic
Cloud Function calling the Notion API with a token from Secret Manager.

That splits the system cleanly:

| Component | Responsibility |
| --- | --- |
| **Raspberry Pi worker** | Only what needs Claude Code: the daily analysis and per-person plans, and interpreting a voice transcript into changes. Nothing else. |
| **Cloud Functions** | Everything deterministic: Notion sync both ways, the 02:00 trigger, notifications, the heartbeat watchdog, Speech-to-Text. |
| **Web app** | Reads and writes Firestore. Never holds a Notion token, never talks to the Pi. |

A manual status change is therefore:

```
app → Firestore → Cloud Function → Notion
```

with Claude absent entirely. A dictated change adds one step: the Pi worker
interprets the transcript and writes the proposal back to Firestore, and the app
shows it for confirmation before anything reaches Notion.

## Consequences

**Positive.** A wrong transcription can never silently change a real task,
because a person sees every proposed change beside the exact phrase that
produced it. Writes are fast and predictable: no model call sits between the
confirmation and the Notion page. Editing a status works while the Pi is down,
because only plan generation depends on it. The Notion token stays server-side
in Secret Manager, out of the browser and off the Pi.

**Negative.** More moving parts than handing Claude a set of tools: a queue, a
proposal document and a confirmation screen. Anything Claude should be able to
act on has to be modelled as a change type in `InterpretedChange`, so new kinds
of edit need code rather than only a prompt change. That is the same tradeoff
ADR-002 accepted for signals, and it buys the same thing: the system stays
debuggable and its actions stay traceable to a human decision.
