# ⛔ GLM-5.3 — READ THIS BEFORE CODING

**STOP BEFORE YOU EDIT ANY CODE.**

You are the coding agent using GLM-5.3. This repository contains explicit instructions for your work. Do not begin implementation until you have read this file and, for itinerary/trip-planning/UI work, also read `docs/AI/ITINERARY-PLANNER-UI-DIRECTION.md`.

## Mandatory sequence — do not skip

1. **READ FIRST.** Read this entire file.
2. **READ THE TASK DIRECTION.** If the task concerns itinerary planning, trip UX, the planner, map, stops, timeline, or Mindtrip-style UX, read `docs/AI/ITINERARY-PLANNER-UI-DIRECTION.md` completely.
3. **INSPECT BEFORE CODING.** Inspect the current implementation, rendered structure, related components, state flow, existing styles, and existing functionality. Do not assume the current code from the task description.
4. **ANALYZE PASS #1 — UX.** Determine what the requested change should improve for the user.
5. **ANALYZE PASS #2 — REGRESSION.** Independently check what could break, duplicate, disappear, become harder to use, affect mobile layout, or conflict with existing functionality.
6. **PROPOSE BEFORE SUBSTANTIAL IMPLEMENTATION.** Briefly state: what changes, what stays, which files/components are affected, and why. If the request is already unambiguous, do not ask unnecessary questions; make the proposal and proceed.
7. **IMPLEMENT MINIMALLY.** Prefer the smallest architectural change that gives the requested UX improvement. Do not rewrite working business logic merely to make the UI look similar to another product.
8. **PRESERVE FUNCTIONALITY.** Unless explicitly requested otherwise, preserve deterministic validation, route optimization, budget, events, booking, import, analytics, i18n, persistence, accessibility, map synchronization, and existing working planner behavior.
9. **VERIFY.** Run relevant typecheck/lint/tests. Check both Slovenian and English where applicable and inspect responsive behavior, especially 390px mobile width.
10. **FINAL SECOND REVIEW BEFORE PUSH.** Review the complete diff again. Check for regressions, duplicated UI, hidden functionality, unnecessary complexity, console errors, and accidental changes outside the task.
11. **ONLY THEN PUSH.** Do not push unfinished or unverified work.

## Current itinerary UX direction

The goal is **not to copy Mindtrip branding**. The goal is to make Discover Slovenia AI feel like an intelligent travel workspace instead of a long configuration form.

The desired interaction model is:

**conversation + visual recommendations + map + editable trip in one workspace**

For itinerary-planner UI work, the preferred hierarchy is:

1. My trip header — title, days, people, budget/date, status.
2. Map + trip conversation — the user can see the route and ask what to change.
3. Compact trip health/status — distance, estimated cost, feasibility, warnings.
4. Visual day timeline — clear sequence, time, destination, travel distance/time, actions.
5. Progressive details — quality, budget, geo validation, booking, events, packing and advanced controls without overwhelming the main trip view.

Existing strengths must remain usable: natural-language planning, ingestion/import, itinerary generation, quality metrics, budget, geo-validation, route map, trip conversation/refiner/copilot, day navigation, stop insights, crowd alternatives, deterministic F16 optimal day ordering, events, booking, packing, timeline, sharing, ICS, persistence, Slovenian/English i18n and analytics.

## Non-negotiable behavior

- Never code first and read later.
- Never assume a feature is missing without inspecting the existing implementation.
- Never remove or hide an existing feature just to simplify the visual layout unless explicitly requested.
- Never create a second chat when an existing planner conversation/refiner/copilot can serve the purpose.
- Never replace deterministic route/validation logic with AI guessing.
- Never add fake imagery or fake data when real existing data can be used.
- Keep mobile usability in mind from the beginning, not as a final patch.

**Explicit user instructions for the current task always take precedence when they intentionally conflict with this document.**
