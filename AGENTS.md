# AI CODING INSTRUCTIONS — READ FIRST

Before changing code in this repository, READ THIS FILE and then read `docs/AI/ITINERARY-PLANNER-UI-DIRECTION.md` when the task touches the itinerary planner, trip planning UX, or Mindtrip-style UI.

## Mandatory workflow for relevant UI work

1. Do NOT start coding immediately.
2. Inspect the current implementation first, especially the actual rendered structure and the existing components it already uses.
3. Compare the requested change against the current UX and existing functionality.
4. Think through the change twice:
   - first pass: what would improve the user experience;
   - second pass: what could break, duplicate, hide, or regress existing functionality.
5. Before implementing a substantial UI change, state a concise proposal: what will change, what will stay, which files/components are affected, and why.
6. Prefer the smallest architectural change that produces a major UX improvement. Do not rewrite working business logic merely for visual similarity.
7. Preserve existing deterministic validation, route optimization, budget, events, booking, import, analytics, i18n, persistence and accessibility behavior unless the task explicitly asks to change them.
8. After implementation, run the relevant typecheck/lint/tests and inspect responsive behavior, especially 390px mobile width.
9. Before pushing, review the diff once more specifically for regressions and unintended UI complexity.

## Important principle

This project should feel like an intelligent travel workspace, not a long configuration form. The AI should help the user shape a trip, while the map, visual stops, timeline, and trip status make the result immediately understandable.

When instructions conflict, the explicit user request for the current task wins.
