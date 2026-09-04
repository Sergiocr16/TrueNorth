# ADR-005 — Everything runs on the Raspberry Pi, behind Tailscale

Date: 2026-09-04 · Status: accepted · Supersedes ADR-003

## Context

ADR-003 placed the web app on Firebase App Hosting and a separate worker on
the Raspberry Pi, joined by a job queue in Firestore and guarded by a Cloud
Function that fell back to the Anthropic API when the Pi went quiet. The
reasoning was availability: the app would stay up when the Pi did not.

Sergio weighed that against the cost in moving parts and decided the other way.
This is a personal tool. The people who use it are few and known. The data
lives in Firebase either way, so a Pi that is off means an app that is
unreachable for a while, not data that is lost. In exchange, the whole system
becomes one process on one machine, with Claude Code a function call away
instead of a queue away.

## Decision

The Next.js server runs on the Raspberry Pi, in production mode, as a systemd
service. It is reached over Tailscale, which also provides a valid HTTPS
certificate on the tailnet domain, so the PWA installs and push works.

Claude Code is installed on the same machine and signed in with Sergio's
subscription. The server invokes it directly, `claude -p` as a child process,
for the two things that need a model: the daily analysis with per-person plans,
and interpreting a dictated update into structured changes. There is no queue,
no separate worker, no heartbeat watchdog and no API fallback service. If the
subscription's usage window is exhausted, the same invocation can run with an
API key instead; that is a configuration switch, not a second system.

Firebase is the database, the identity provider, the file store and the push
sender: Auth, Firestore, Storage and Cloud Messaging. Cloud Functions and App
Hosting are not used. The server holds a service-account key and uses the
Admin SDK for everything the engine writes; the browser keeps talking to
Firestore directly with the client SDK, which is what makes edits live across
devices.

The daily run is a systemd timer at 02:00 that calls the engine over localhost.
Notion sync, Notion writes and Speech-to-Text are route handlers in the same
server, with their tokens in an environment file on the Pi.

## What this keeps from earlier decisions

ADR-002 stands: signals are computed in code, the model only ranks and explains.
ADR-004 stands: Claude never calls Notion. It produces a proposal the person
confirms, and ordinary code performs the write. Both were about *what* the
model is allowed to do, and neither depended on *where* it runs.

## Consequences

**Positive.** One deployable, one machine, one place to look when something
fails. No queue semantics, no lease expiry, no duplicate-run guards. Recalculate
and voice interpretation answer in seconds rather than through a round trip.
The subscription question is settled beyond argument: the software runs on
Sergio's own hardware, for Sergio's own work, with Sergio's own account.

**Negative.** When the Pi is off or the home connection drops, the app is
unreachable until it is back, and the morning plan for that day is not
generated. The phone must have Tailscale connected to open the app at all,
including from a push notification. The Pi is now infrastructure and needs the
care of one: a UPS, an SSD rather than an SD card, an encrypted disk, and a
deploy script that pulls, builds and restarts.

**What changes in the repository.** No `apps/functions` and no `apps/worker`.
The engine becomes `apps/web/server/engine`, imported by route handlers and by
the timer. The `jobs` collection is not needed; `workers/pi-01` stays as a
heartbeat the app can show. The temporary rule that let a person seed their own
plan closes to `if false`, because the server writes plans with the Admin SDK.
