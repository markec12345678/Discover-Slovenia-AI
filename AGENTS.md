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

## 🔴 TWO-PASS RULE — MANDATORY FOR SUBSTANTIAL WORK

### PASS 1 — ANALYSIS ONLY

- Inspect the current repository HEAD and the relevant implementation.
- Do not modify files.
- Identify and classify findings:
  CONFIRMED / LIKELY / UNCONFIRMED / NOT A BUG.
- Prove every claimed bug from actual code, data flow, UI behavior, or reproducible behavior.
- Check regression risk before proposing a change.
- Do not treat theoretical edge cases as confirmed defects.

### PASS 2 — CHANGES

- Modify ONLY confirmed issues or explicitly requested functionality.
- Use the smallest safe patch.
- Preserve working architecture, business logic and existing UX capabilities.
- Add tests only when they protect a confirmed bug, critical business rule, security boundary, or important user flow.
- Run relevant verification after changes.

Never mix discovery and modification without first establishing that the problem is real.

The AI must prefer:

**CORRECT CODE + ZERO CHANGES**

over

**MORE CHANGES + MORE TESTS.**

## 🔴 DATA ACCURACY RULE

Discover Slovenia is a tourism product. Never invent or silently guess:

- places or attractions
- addresses or coordinates
- opening hours
- prices
- availability
- travel times or route distances
- events
- accommodation, restaurant or activity offers
- booking or affiliate status

If information is not verified by the relevant data source, mark it as uncertain or omit it.

Do not present straight-line distance as driving distance or estimated travel time as verified travel time.

## 🔴 FEATURE DISCIPLINE

Do not add a feature merely because another tourism platform has it, an AI model suggested it, or it looks impressive.

Before implementing a non-trivial feature establish:

1. WHO uses it?
2. WHAT problem does it solve?
3. WHAT existing functionality is insufficient?
4. HOW will the improvement be verified?

If these cannot be answered from the actual product context, do not implement the feature.

## 🔴 PRODUCT + REVENUE TRUST

Affiliate and partner functionality must never mislead users.

- Do not fabricate offers, prices or availability.
- Do not claim an affiliate relationship that is not configured.
- Do not manipulate rankings solely for commission.
- External/provider links must remain truthful and functional.

## 🔴 REAL USER FLOW OVER TEST COUNT

Prioritize verification of real journeys:

visitor → destination/place → map → itinerary → provider/booking

and the equivalent mobile flow.

A larger test count is not itself evidence of a better product.

## 🔴 STOP CONDITION

Stop changing the repository when:

- no confirmed important bug remains
- requested functionality works
- relevant tests/checks pass
- no reproducible regression exists
- remaining findings are theoretical or low-impact

**NO CHANGE REQUIRED** is a valid and preferred result when the current implementation is correct.

## FINAL PRINCIPLE

**PROVE FIRST. CHANGE SECOND. TEST THIRD. VERIFY FOURTH. STOP WHEN DONE.**
