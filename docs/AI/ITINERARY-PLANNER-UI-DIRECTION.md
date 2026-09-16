# ItineraryPlanner UI Direction — READ BEFORE UI CHANGES

## Goal

Improve `src/components/sections/itinerary-planner.tsx` so the planner feels like a personal travel workspace rather than a large form followed by a stack of feature cards.

This is a UX direction, not a request to copy Mindtrip's branding or implementation.

## Current product strengths — KEEP

The existing planner already contains substantial functionality. Do not remove or duplicate it just to change the visual hierarchy:

- natural-language trip input
- link/image/Google Pins ingestion
- days, budget, group size, party type, pace, season and date
- interests
- itinerary generation
- itinerary quality metrics
- budget calculation
- geo-validation
- route map
- trip conversation/copilot/refiner
- day navigation
- stop insights
- crowd notices and alternatives
- deterministic optimal day ordering / 2-opt
- events
- booking
- packing/budget/timeline/share/ICS and persistence
- Slovenian + English i18n
- analytics

## Target UX hierarchy

The main result should read in this order:

1. **My trip header** — trip title, days, people, budget/date and key status.
2. **Map + conversation workspace** — map and a prominent prompt such as “Kaj naj spremenim na tvoji poti?” should be immediately available together.
3. **Compact trip health/status** — distance, estimated cost, feasibility and important warnings without several large cards dominating the screen.
4. **Visual day timeline** — each day is a clear sequence of stops with time, destination, travel distance/time and useful actions.
5. **Progressive details** — quality, budget, geo-validation, booking, events, packing and advanced controls should remain accessible but should not overwhelm the primary flow.

## Concrete UI changes to consider

### A. Generated result becomes the primary workspace

Do not lead the generated result with a long sequence of separate analysis cards. Prefer:

`Trip header → Map + Chat → Trip status → Day timeline`

### B. Reduce form dominance

Keep all existing controls, but visually prioritize natural-language intent. Advanced parameters such as season, exact date and interests can be visually secondary / grouped rather than making the user feel they must complete a questionnaire.

### C. Make the itinerary visual

Stop cards should have stronger visual hierarchy and, where existing image data is available, a compact destination image/thumbnail. Do not introduce fake images or new external dependencies merely for decoration.

A stop should quickly communicate:

`time → destination → duration/cost → why → actions`

### D. Show movement between stops

Where route data exists, visually show:

`🚗 X km · ~Y min`

between stops. It should connect the timeline to the map rather than being hidden in secondary information.

### E. Promote useful optimization

If F16 calculates a meaningful saving, present it as a clear contextual opportunity, e.g.:

“✨ Našel sem krajšo pot — prihraniš približno 18 km.”

Keep the existing deterministic threshold and calculation. Do not invent savings.

### F. Conversation should feel attached to the trip

The user should see a clear action such as:

“💬 Kaj naj spremenim na tvoji poti?”

with examples like:

- Manj vožnje
- Dodaj Bled
- Cenejša različica
- Več narave
- Odstrani X

Use existing planner/refiner/copilot functionality where possible. Do not create a second competing chat system.

### G. Mobile first

At ~390px width, the order should remain understandable:

`Trip header → map → trip conversation → day tabs → timeline → details`

Avoid horizontal overflow and avoid making the user scroll through several large cards before reaching the actual trip.

## Design rule

The objective is NOT “make it look like Mindtrip”. The objective is to adopt the useful interaction model:

**conversation + visual recommendations + map + editable trip in one workspace.**

Discover Slovenia should retain its own visual identity, Slovenian-first content, deterministic validation and transparent calculations.

## Before coding

First inspect the current JSX and the components already imported by `ItineraryPlanner`. Then propose the exact UI restructuring and identify what remains unchanged. Do not rewrite working logic without a concrete reason.

## Before push

- run typecheck/lint/relevant tests
- verify 390px mobile layout
- verify SL and EN
- verify map ↔ stop synchronization
- verify F16 optimization still behaves exactly as before
- review the diff once more for unnecessary complexity
