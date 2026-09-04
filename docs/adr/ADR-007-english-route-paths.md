# ADR-007 — Route paths are English

Date: 2026-09-04 · Status: accepted · Amends the contract list in CLAUDE.md

## Context

The screens speak Spanish, and the first design let the URLs speak it too:
`/hoy`, `/equipo`, `/seguimiento`. Everything else in the repository is
English — code, identifiers, commits, docs — and the URL is, in practice, part
of the code: it appears in `ROUTES`, in redirects, in the push payload, in the
service worker, in the manifest and in the runbook. Two languages in one
identifier space meant every new screen had to be named twice, and the name
people see (the title, from the dictionary) never was the path anyway.

## Decision

Paths are English, one folder per screen under `apps/web/app`, dynamic
segments named `[id]` and `[date]`. `ROUTES` in `components/shell.tsx` is the
only place a path is spelled out for navigation; screens import it. The
Spanish stays where people read it: titles, labels, messages, all in the
dictionary.

| Was | Is |
| --- | --- |
| `/entrar`, `/elegir-empresa` | `/sign-in`, `/choose-company` |
| `/hoy` | `/today` |
| `/briefing/historial`, `/briefing/[fecha]` | `/briefing/history`, `/briefing/[date]` |
| `/empresa`, `/objetivos`, `/proyectos` | `/company`, `/objectives`, `/projects` |
| `/equipo`, `/seguimiento`, `/asistente` | `/team`, `/follow-up`, `/assistant` |
| `/riesgos`, `/reportes/semanal`, `/integraciones`, `/ajustes` | `/risks`, `/reports/weekly`, `/integrations`, `/settings` |

## Consequences

Nothing had shipped to `production` with the Spanish paths, so there are no
redirects to keep. An installed PWA from the tailnet test has `/hoy` as its
start URL and must be reinstalled once. Push payloads and the service worker's
fallback now open `/today` and `/follow-up`.
