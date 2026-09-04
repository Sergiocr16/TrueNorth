# ADR-003 — Claude Code headless on a Raspberry Pi, with an API fallback

Date: 2026-09-03 · Status: superseded by ADR-005 on 2026-09-04

> The queue, the separate worker and the API fallback service described here
> were dropped when the whole server moved onto the Pi. The verification of
> platform support and subscription terms below still holds.

## Context

The daily engine makes one analysis call per company and one plan call per
person. Paying per token for that adds up, and Sergio already holds a Claude
Code subscription.

Verified against the official documentation on 2026-09-03:

- Claude Code supports Linux ARM64 with 4 GB of RAM or more.
- Headless mode accepts the subscription token and returns JSON validated
  against a schema with `--json-schema`.
- Subscription limits are a five-hour window plus a weekly cap, shared with
  Claude chat; headless runs draw on the same pool.
- The consumer terms forbid reselling the service or using it to power products
  for third parties, and since April 2026 subscriptions may not power
  third-party agents.

## Decision

A worker written in TypeScript runs as a systemd service on a dedicated
Raspberry Pi 5. It leases jobs from a Firestore `jobs` collection, computes the
signals, and calls `claude -p` with no tools and a single turn.

The subscription is the primary path because this is first-party use:
TrueNorth is Sergio's own personal project, run on his own hardware, for his
own work. It is not offered to anyone else and no third party accesses it. The worker also supports an Anthropic
API key, selected by an environment variable, and a watchdog function uses that
path when the Pi misses its heartbeat for fifteen minutes.

## Consequences

**Positive.** Flat monthly cost for the engine. The same prompts and the same
signal code serve both paths, so the fallback produces plans of the same shape.

**Negative.** The moment TrueNorth stopped being personal and became something
other people or companies use, the subscription would no longer cover it and
the API key path would be mandatory under commercial terms.

A home device is now infrastructure: it needs a UPS, an SSD rather
than an SD card, encrypted storage and Tailscale-only access. Nightly jobs must
be staggered so they do not exhaust the five-hour window or collide with daytime
use of Claude.
