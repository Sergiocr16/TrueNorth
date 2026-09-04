# ADR-002 — Signals in code, judgement in the model

Date: 2026-09-03 · Status: accepted

## Context

The product's value is the quality of the daily recommendation. A naive design
hands the model the raw company data and asks for a plan. That is expensive,
inconsistent between runs, and impossible to debug when a recommendation is
wrong.

## Decision

Everything computable is computed in TypeScript, deterministically and with
tests: progress gaps, overdue and blocked tasks, orphan projects, empty
objectives, workload, changes since yesterday. The model receives those signals
and does only what an algorithm cannot: rank by impact against the north star,
adapt to the person's role, and explain the reasoning in plain language.

Every plan item must cite at least one signal id, and the interface shows it.

## Consequences

**Positive.** Recommendations are traceable to real data. Signals are unit
tested. Cost per company is predictable. Two runs on the same data agree.

**Negative.** New kinds of insight need code, not just a prompt change. The
signal catalogue is a contract shared by the worker, the API fallback and the
UI, so it lives in `packages/core` and changes deliberately.
