# ADR-001 — Firebase as the backend

Date: 2026-09-03 · Status: accepted

## Context

TrueNorth needs identity, a database, scheduled work, push notifications and
secret storage for a small internal app. The team is one person building with
Claude Code, so the number of moving parts matters more than raw flexibility.

## Decision

Firebase on the Blaze plan, in a single Google Cloud project: Firestore,
Authentication, Cloud Functions (2nd gen), Cloud Scheduler, Cloud Storage,
Cloud Messaging, Secret Manager and Speech-to-Text. The web app is hosted by
Firebase App Hosting from GitHub.

Blaze is required because the functions call external APIs (Anthropic, Notion),
which the free plan forbids.

## Alternatives considered

- **Postgres (Neon) with Drizzle and a hosted auth provider.** Better fit for a
  relational domain and organisations come built in, but it spreads the system
  over three vendors.
- **Vercel for the frontend.** Better Next.js ergonomics, but it splits the
  system across two platforms for no benefit at this size.

## Consequences

**Positive.** One console, one bill, one identity system. Emulators give a full
local stack. Scheduled work and push are first-party.

**Negative.** Firebase Auth has no organisations, so memberships, invitations
and roles are ours to model and to protect with security rules; that costs a few
days in phase 0. Firestore is documental while the domain is relational, so
relations are id arrays resolved in memory inside the daily job, and health is
recomputed rather than joined.
