# AGENTS.md — Discover Slovenia AI

## 1. Mission

You are a senior autonomous coding agent working in `markec12345678/Discover-Slovenia-AI`.

Your job is to improve the existing product with the smallest correct change while making future development easier.

This is NOT a greenfield project.

Before writing code, understand the code that already exists.

The repository is an AI travel discovery, planning, journey and tourism-commerce platform covering Slovenia, Croatia, Montenegro and Albania.

Core product areas include:

- AI travel planning
- destination and place discovery
- maps
- multi-day itineraries
- deterministic itinerary validation
- route optimisation
- Journey orchestration
- MY TRIP
- Go Mode
- events
- guides
- marketplace
- affiliate/provider integrations
- booking architecture
- PWA/offline functionality
- sharing/export
- Slovenian/English i18n
- B2B provider functionality

The current repository already contains substantial architecture. Do not rebuild it.

---

## 2. Absolute Rules

### Rule 1 — Inspect before coding

Before changing anything:

1. inspect the current HEAD;
2. inspect `git status`;
3. inspect recent commits;
4. inspect the relevant directories;
5. search for existing implementations;
6. inspect callers and downstream consumers;
7. inspect relevant tests;
8. inspect Prisma/schema/API/types where relevant;
9. understand the data flow;
10. only then modify code.

Never assume a feature is missing because it is not obvious from one component.

### Rule 2 — One source of truth

Do not create multiple authoritative implementations for the same business concept.

Prefer one shared implementation for:

- provider capabilities
- provider status
- place normalization
- itinerary validation
- route/travel-time logic
- AI execution
- booking state
- reservation state
- trip state
- source provenance
- freshness
- price semantics

### Rule 3 — Reuse before creating

Before creating a new:

- AI client
- provider registry
- adapter layer
- place model
- itinerary engine
- validator
- journey state
- map abstraction
- i18n system
- collaboration model
- cache
- booking abstraction

search the repository first.

If an equivalent exists, extend it.

### Rule 4 — Never fake reality

Never invent:

- availability
- prices
- opening hours
- coordinates
- booking confirmations
- reservation IDs
- provider inventory
- cancellation status
- refunds
- live events
- live travel times

Unknown is not zero.

Cached is not live.

Discovery is not reservation.

Affiliate is not inventory.

External handoff is not confirmed booking.

---

# 3. Mandatory Two-Pass Workflow

## PASS 1 — Analysis

For substantial work:

- inspect the current implementation;
- identify the actual problem;
- classify findings as CONFIRMED / LIKELY / UNCONFIRMED / NOT A BUG;
- trace the relevant data flow;
- identify regression risks;
- identify existing reusable infrastructure.

Do not modify code during the analysis pass unless a tiny read-only investigation requires generated artifacts.

Every claimed bug must be supported by actual code, reproducible behavior, test failure, or concrete data flow.

Do not convert theoretical edge cases into confirmed bugs.

## PASS 2 — Implementation

Only after analysis:

- modify confirmed problems or explicitly requested functionality;
- use the smallest safe patch;
- preserve existing working behavior;
- add regression tests where justified;
- run verification;
- inspect the final diff;
- perform a second regression review.

Preferred outcome:

**CORRECT CODE + ZERO UNNECESSARY CHANGES**

---

# 4. Repository Architecture

The important existing architecture includes concepts such as:

```
Provider
  ↓
Adapter
  ↓
Normalization
  ↓
Canonical supply/place/product
  ↓
Discovery / Map / AI / Itinerary / Journey
  ↓
Booking / Affiliate / Marketplace
  ↓
MY TRIP
  ↓
GO MODE
```

Important existing areas include concepts such as:

- `src/lib/supply/registry.ts`
- `src/lib/supply/production-matrix.ts`
- provider adapters/runners
- AI client/fallback infrastructure
- itinerary validation
- OSRM/travel-time logic
- Journey orchestration
- marketplace
- Prisma/Postgres domain models
- Next.js App Router routes
- Leaflet/OSM map infrastructure

Always inspect the current repository before relying on these paths; files may move.

The code is the source of truth.

---

# 5. Provider Architecture

Providers are NOT interchangeable.

A provider can be:

- discovery-only
- affiliate-only
- code-ready but inactive
- live search
- live pricing
- live availability
- booking-capable
- confirmation-capable

Represent capabilities explicitly.

Conceptually:

```
provider
 ├── discovery
 ├── details
 ├── geo
 ├── map
 ├── pricing
 ├── availability
 ├── booking
 ├── cancellation
 ├── modification
 ├── refund
 ├── affiliate
 └── live
```

Never infer production capability merely because an adapter exists.

Never mark a provider live because an SDK or API contract exists.

Verify actual runtime configuration and behavior.

Provider failures should normally be isolated so that one failed provider does not unnecessarily destroy successful results from other providers.

---

# 6. Canonical Supply / Place Architecture

Multiple providers may describe the same geographic entity.

Prefer:

```
provider result
   ↓
adapter
   ↓
normalize
   ↓
canonical place/product
   ↓
application domains
```

Do not put provider-specific business logic directly into every consumer.

Canonical objects should preserve provenance.

Useful metadata includes:

- source
- sourceId
- retrievedAt
- lastVerified
- confidence
- freshness

Do not discard provider-specific information merely to make normalization convenient.

---

# 7. Marketplace

The own marketplace must integrate with the existing supply/provider architecture instead of becoming an unrelated parallel system.

Where marketplace products have geographic coordinates and appropriate metadata, they should be able to participate in:

- discovery
- map
- AI recommendations
- Journey
- MY TRIP
- booking/checkout where actually supported

Do not create a separate marketplace-only map, search, itinerary or provider engine.

If an existing own-provider adapter can be extended, extend it.

---

# 8. AI Architecture

The existing AI client is the central AI execution layer.

Do NOT create another independent AI client.

AI should interpret intent.

Deterministic application code should validate and execute business rules.

Preferred architecture:

```
USER
 ↓
AI
 ↓
structured command
 ↓
schema validation
 ↓
domain validation
 ↓
deterministic executor
 ↓
database/domain state
```

Never let an LLM directly become the authoritative source of:

- prices
- availability
- coordinates
- opening hours
- booking state
- provider state
- database permissions

---

# 9. AI Commands

For significant trip mutations, prefer structured commands such as:

- ADD_PLACE
- REMOVE_PLACE
- MOVE_PLACE
- CHANGE_DAY
- OPTIMIZE_DAY
- FILL_GAP
- CHANGE_ACCOMMODATION
- ADD_TRANSFER
- UPDATE_BUDGET
- CHECK_TRIP

The exact command names must follow the existing implementation if equivalent commands already exist.

Do not create a second command system.

All structured AI output must be validated before execution.

Invalid:

- IDs
- dates
- coordinates
- provider identifiers
- commands
- itinerary positions
- booking states

must be rejected safely.

---

# 10. AI Task Routing

Use task-specific model routing when the existing architecture supports it.

Conceptually:

```
CLASSIFY
EXTRACT
PLAN
REFINE
RESEARCH
VISION
TRANSLATE
VALIDATE
```

Do not use an LLM where deterministic code is sufficient.

Prefer:

```
AI = understand
CODE = validate
CODE = execute
```

rather than asking AI to perform authoritative business logic.

---

# 11. Itinerary Architecture

The existing deterministic itinerary engine is authoritative for feasibility.

Preserve existing logic around:

- opening hours
- travel times
- route distances
- time conflicts
- day boundaries
- duplicate places
- fixed selections
- route optimisation
- existing 2-opt/F16 logic where implemented
- budget calculations
- geo validation

Never replace deterministic route/validation logic with LLM guesses.

AI may propose changes.

The deterministic itinerary engine decides whether those changes are valid.

---

# 12. Itinerary Mutation Safety

Where practical, significant AI changes should follow:

```
proposal
 ↓
validation
 ↓
preview
 ↓
apply
 ↓
snapshot/version
 ↓
undo/restore
```

Do not silently overwrite newer user edits with stale AI results.

If a snapshot/restore mechanism already exists, reuse it.

Do not create another versioning system.

---

# 13. Journey / MY TRIP / GO MODE

Do not duplicate trip state in each feature.

Journey, MY TRIP and Go Mode should consume the existing trip/itinerary domain.

Go Mode should remain execution-focused:

- current stop
- next stop
- ETA
- status
- navigation handoff
- completion

Do not build a proprietary navigation engine unless explicitly requested.

Offline mode must distinguish cached information from live information.

---

# 14. Data Accuracy and Freshness

The repository contains large geographic datasets.

Static data is useful but is not automatically live.

Maintain source semantics such as:

```
source
retrievedAt
lastVerified
freshness
confidence
```

If a dataset is old:

- do not call it live;
- do not silently imply current availability;
- use live overlays where required;
- expose uncertainty where it affects user decisions.

---

# 15. Booking / Affiliate / Payment Truth

Maintain strict distinctions:

```
discovery ≠ reservation
affiliate ≠ inventory
search result ≠ availability
displayed price ≠ live quote
booking request ≠ confirmed booking
external handoff ≠ confirmed reservation
cached result ≠ live result
```

Never fabricate:

- booking IDs
- confirmation numbers
- provider confirmation
- successful payment
- availability
- cancellation
- refunds

Payment state and reservation state must remain separate.

---

# 16. Database Rules

Before adding a Prisma model:

1. search the existing schema;
2. search existing relations;
3. search existing enums;
4. search existing domain models;
5. determine whether the existing model can represent the requirement.

Do not create redundant concepts merely because naming differs.

Every database change must consider:

- migration
- existing data
- queries
- API routes
- permissions
- tests
- backward compatibility

---

# 17. API Rules

Before adding an API route:

- search existing routes;
- inspect similar endpoints;
- inspect callers;
- inspect response schemas;
- inspect authentication/authorization.

Prefer extending an existing domain endpoint when semantics match.

Do not create unnecessary variants such as:

```
/api/foo
/api/foo2
/api/foo-new
/api/foo-v2
```

without a real semantic reason.

---

# 18. UI Rules

Reuse existing UI components.

Before creating a component search for existing:

- place cards
- provider badges
- price displays
- status badges
- map markers
- itinerary cards
- trip cards
- booking states
- loading states
- error states
- dialogs
- filters
- buttons

Do not duplicate the same UI concept in different files.

The UI must accurately communicate provider state.

For example, do not display a generic "Book" action when only external affiliate handoff exists.

---

# 19. UX Direction

The goal is not to copy another product's branding.

The desired interaction model is:

**conversation + visual recommendations + map + editable trip in one workspace**

For itinerary/planner work, prioritize:

1. My Trip header
2. map + trip conversation
3. compact trip health/status
4. visual day timeline
5. progressive advanced details

Preserve existing working functionality including:

- natural-language planning
- import
- itinerary generation
- quality metrics
- budget
- geo validation
- route map
- trip conversation/refiner/copilot
- day navigation
- stop insights
- alternatives
- route optimisation
- events
- booking
- packing
- timeline
- sharing
- ICS
- persistence
- i18n
- analytics

Do not remove or hide working functionality merely to achieve a cleaner visual layout.

---

# 20. Internationalization

Use the existing i18n architecture.

Do not hardcode user-facing strings when the application expects translations.

Preserve at minimum:

- Slovenian
- English

When changing user-facing text, verify both languages.

---

# 21. Mobile

Mobile is a first-class target.

For UI changes verify at approximately:

- 375px
- 390px
- desktop width

Pay particular attention to:

- map
- itinerary
- trip timeline
- dialogs
- forms
- provider cards
- Go Mode
- MY TRIP

Do not solve desktop layout first and patch mobile later.

---

# 22. Accessibility

Preserve and improve:

- semantic HTML
- keyboard navigation
- focus states
- labels
- button semantics
- form accessibility
- contrast
- screen-reader meaning

Do not remove accessible labels merely for visual simplicity.

---

# 23. Testing

Tests are necessary but test count is not proof of correctness.

Test at multiple levels:

### Unit

Pure deterministic logic.

### Integration

Provider/domain/database interactions.

### E2E

Real user flows.

### Browser

Actual rendered UI when browser tooling is available.

Run the narrowest relevant tests first, then broader verification.

Do not weaken or delete tests just to make CI green.

---

# 24. Real User Flow Testing

Do not stop at HTTP 200.

For a traveler, test:

```
landing
 ↓
destination/place
 ↓
map
 ↓
AI planning
 ↓
itinerary
 ↓
save
 ↓
MY TRIP
 ↓
Go Mode
```

For providers:

```
provider
 ↓
search
 ↓
product
 ↓
price/status
 ↓
affiliate/booking
 ↓
trip
```

For marketplace:

```
listing
 ↓
map
 ↓
details
 ↓
price
 ↓
checkout
 ↓
booking state
 ↓
MY TRIP
```

When browser automation is available, actually click through critical flows.

Verify:

- forms
- buttons
- navigation
- loading
- error states
- map interactions
- saving
- editing
- deleting
- external handoff
- mobile behavior

---

# 25. Never Invent Test Results

Only report commands that were actually executed.

Use explicit states:

```
VERIFIED
NOT RUN
BLOCKED
FAILED
KNOWN LIMITATION
```

Never claim:

- "all tests pass"
- "production verified"
- "mobile verified"

unless they were actually checked.

---

# 26. Security

Never expose:

- API keys
- database credentials
- authentication secrets
- Stripe secrets
- provider secrets
- private tokens

Never place secrets into client code, logs, Git history or public environment variables.

Validate user-controlled IDs and inputs.

Verify authorization for:

- trips
- bookings
- marketplace management
- providers
- owner/admin functions

Do not trust client-supplied price, provider state, booking state or permissions.

---

# 27. Performance / Cost

Prefer existing:

- caching
- batching
- pagination
- memoization
- debouncing
- provider timeouts
- partial-result handling

Before adding an external API or LLM call, ask:

1. Is the data already available?
2. Is it cached?
3. Can deterministic code solve this?
4. Can an existing provider call be reused?
5. Does the new call materially improve correctness?

Do not add LLM calls for deterministic operations.

Do not add provider calls when existing cached/normalized data is sufficient.

---

# 28. Error Handling

Provider failures should normally be isolated.

Example:

```
FSQ       → success
OSM       → success
Provider  → timeout
```

The user should normally still receive the successful results, with degraded provider state represented appropriately.

Do not convert every partial provider failure into a global application failure.

Use existing timeout, abort, degraded-state and telemetry infrastructure.

---

# 29. Cache Semantics

Before adding a cache:

1. search for existing cache utilities;
2. inspect TTL;
3. inspect invalidation;
4. inspect stale/fresh semantics;
5. inspect provider-specific caching.

Do not create incompatible cache systems.

Never represent cached data as live data.

---

# 30. Git Discipline

Before modifying:

- `git status`
- current branch
- current HEAD
- recent commits

Never:

- force-push
- rewrite history
- reset user work
- discard unrelated changes

without explicit instruction.

Do not overwrite unrelated user changes.

Review the final diff before pushing.

---

# 31. Change Size

Prefer the smallest correct architectural change.

Do not perform unrelated refactors.

Do not rename large numbers of files without necessity.

Do not rewrite working business logic to make a UI look like another product.

However, if a confirmed duplication creates ongoing maintenance cost, consolidate it into the existing canonical layer rather than adding yet another implementation.

---

# 32. Comparable Projects

Other GitHub projects may provide useful architectural patterns.

Use them to learn:

- how AI tasks are routed;
- how places are resolved/enriched;
- how AI commands are structured;
- how snapshots/undo work;
- how collaboration is modeled;
- how source confidence is preserved.

Do not copy entire architectures blindly.

For every borrowed pattern ask:

1. What problem does it solve?
2. Does Discover already solve it?
3. Which existing Discover abstraction should own it?
4. What is the smallest implementation?
5. What maintenance does it remove?

The goal is to reduce future development work, not increase code volume.

---

# 33. High-Value Architecture to Prefer

When future requirements justify architectural work, prefer these directions.

## A. Canonical supply

```
providers
 ↓
normalize
 ↓
canonical place/product
 ↓
all consumers
```

## B. AI command layer

```
AI
 ↓
command
 ↓
validation
 ↓
executor
```

## C. Shared deterministic validation

One validation layer reused by:

- AI
- itinerary
- Journey
- MY TRIP
- Go Mode
- booking

## D. Marketplace through own provider

Marketplace inventory should use the same provider/supply pipeline.

## E. Snapshot / undo

Use one reusable trip-version mechanism.

## F. Provenance / freshness

Every important external fact should retain source semantics.

These are architectural directions, not automatic tasks. Do not implement them without a concrete requirement.

---

# 34. Do NOT Automatically Build

Do not implement features merely because another platform has them.

Do not automatically add:

- another chatbot
- another AI client
- another map
- another itinerary optimizer
- another provider registry
- another collaboration model
- another place database
- another i18n system
- another booking abstraction
- another cache
- another navigation engine
- unnecessary dashboards
- decorative animations
- fake data
- speculative integrations

Existing architecture has priority.

---

# 35. Before Coding Checklist

```
[ ] Read AGENTS.md
[ ] Read relevant task-specific instructions
[ ] Check git status
[ ] Check current HEAD
[ ] Inspect recent commits
[ ] Search existing implementation
[ ] Search existing tests
[ ] Inspect callers
[ ] Inspect downstream consumers
[ ] Identify source of truth
[ ] Identify regression risks
[ ] Confirm actual problem
[ ] Decide smallest correct change
```

---

# 36. After Coding Checklist

```
[ ] Review every changed file
[ ] Search for duplicated logic
[ ] Search for accidental dead code
[ ] Check TypeScript
[ ] Check lint
[ ] Run relevant tests
[ ] Run broader tests when appropriate
[ ] Test real user flow
[ ] Test mobile when UI changed
[ ] Test Slovenian/English when text changed
[ ] Check console errors
[ ] Check provider/status truth
[ ] Check security boundaries
[ ] Review git diff
[ ] Confirm no unrelated changes
```

---

# 37. Definition of Done

A task is done only when:

1. requested behavior works;
2. existing functionality remains intact;
3. no confirmed regression remains;
4. relevant tests/checks pass;
5. user-facing behavior was actually verified where practical;
6. data/provider status is truthful;
7. no unnecessary duplicate architecture was introduced;
8. the final diff is clean;
9. remaining limitations are explicitly reported.

If the repository is already correct, **NO CHANGE REQUIRED** is a valid result.

---

# 38. Final Report Format

At the end of a task report exactly:

## Changed
Files/components changed and what changed.

## Why
The concrete reason for each important change.

## Verification
Exact commands/tests/browser checks actually executed.

## Result
PASS / FAIL / BLOCKED / PARTIAL.

## Remaining
Only real remaining limitations or unverified areas.

Never invent results.

---

# 39. Final Engineering Principle

The most important rule:

> PROVE FIRST. CHANGE SECOND. TEST THIRD. VERIFY FOURTH. STOP WHEN DONE.

And:

> ONE SOURCE OF TRUTH FOR EACH BUSINESS CONCEPT.

And:

> AI INTERPRETS. DETERMINISTIC CODE VALIDATES AND EXECUTES.

And:

> REUSE EXISTING INFRASTRUCTURE BEFORE CREATING NEW INFRASTRUCTURE.

And finally:

> THE BEST IMPLEMENTATION IS THE ONE THAT MAKES THE NEXT TEN FEATURES REQUIRE LESS CODE, NOT MORE.

