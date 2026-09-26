# TASK 8 — BENCHMARK MATRIX (Issue #8 §5)

- **Baseline:** HEAD `ac75070`, v1.111.1 (audit: `docs/audit/task8-d8a-ux-audit.md`)
- **Research:** `docs/audit/task8-benchmark-research-1.md` (Mindtrip, ALMA, Wanderlog — 27 sources), `docs/audit/task8-benchmark-research-2.md` (Google Maps, Airbnb, Tripadvisor + Google Travel, Booking, Roadtrippers, Polarsteps, TripIt, Komoot, AllTrails, GetYourGuide — 59 sources)
- **Method:** live web research (web_search + page_reader) → convergent high-signal patterns → mapped against the D8-A code audit. Sources cited as [R1]/[R2] doc sections. No fake data; every claim traceable.

| UX area | Benchmark pattern | Source | Current Discover (D8-A evidence) | Proposed Discover (v1.112+) | Reason |
|---|---|---|---|---|---|
| **Home** | Question-first entry + small set of visual category entries + "continue your trip" on top | Mindtrip "Start chatting" entry [R1§1]; GYG persona categories [R2§7]; AB search-first [R2§2] | 13 top-level blocks; stats + validator telemetry mid-scroll; continuation (WelcomeBack) below fold | Hero keeps "Kaj želiš doživeti?" + intent chips + entry row (Narava · Hrana · Mesta · Doživetja · Dogodki) + editorial discovery; **Nadaljuj svojo pot rises to top when a trip exists**; stats/validator/demo move into progressive-disclosure positions (nothing deleted) | Fewer decisions at entry; issue §7/§54 "fewer unnecessary decisions" |
| **Search** | Results answer What/Why/What can I do; every result actionable in place | AB 3-field + recommended filters [R2§6]; ALMA structured answers [R1§2] | SmartSearch is navigate-only (P-SEARCH-1); 3 separate search entries | SmartSearch rows gain canonical **+ Dodaj v mojo pot** (44px) next to open; row click still opens; one mental model across hero/chat/search | Highest-intent moment must feed the funnel (G1 golden journey) |
| **Discovery cards** | Card contract: image → title → rating/price → actions, pre-click | AB list cards [R2§5]; GM Places UI Kit place-card [R2§2] | ~22 card grammars (P-CARD-1), 0–3 competing actions, radius lg/xl/2xl mixed | One card grammar: image, title, one context line, minimal meta, **primary + Dodaj v mojo pot**, secondary Odpri, optional Shrani heart; applied to destination/event/listing/experience/marketplace/map/search cards | Card contract builds the single habit (issue §9) |
| **Save** | One-tap save; save carries context; collections not scattered | GM Save→"Want to go" [R2§1]; AB wishlist saves dates [R2§1] | Wishlist = experiences/products only; destinations/POIs/events can't be saved at all (P-CTA-2) | Wishlist (Shrani) stays; new **Moja pot collection** = the trip layer; WishlistSheet gains "Dodaj v mojo pot" per item (bridge) | Two honest mental models: Shrani (ideas) vs V moji poti (trip) — issue §40 |
| **Add to trip** | One-tap add with smart default + correction banner; one vocabulary | Wanderlog "Add → most recent list/day + Change banner" [R1§3]; Mindtrip favorite→add [R1§1] | **7 incompatible implementations** (P-CTA-1); trip membership computed 4 ways (P-STATE-1) | One canonical `AddToTrip` primitive + one state vocabulary "V moji poti" backed by a single client store (`dai:my-trip-items`); map-supply add becomes write-through (selection AND membership); destination modal "Zgradi novo pot" stays as advanced (no longer the only trip action) | Same action = same meaning everywhere (issue §53 CONSISTENCY) |
| **Map/list** | Map = the query (80% AB searches originate from map); map↔itinerary sync; pin tiering | arxiv 2407.00091 [R2§3]; Wanderlog color-by-day redraw [R1§3] | Strong map but supply add is selection-only ("V načrt" = tell the AI); map results don't show trip membership | Map supply add writes membership too; ProductCard/ProductModal show truthful "V moji poti"; map↔planner sync unchanged | G2 golden journey: map → context → add → trip updates |
| **Planner** | Daily itinerary is the central object; common ops easy; advanced kept | Wanderlog daily itinerary + route optimization [R1§3]; Mindtrip day plan [R1§1] | /nacrtuj = THE planner (5603 lines, ~15 stacked sections, **5-CTA action bar**); /potovanje = second planner (P-CLUTTER-1, §8.1) | /nacrtuj stays THE planner; action bar → 2 primary (Shrani, Na poti) + "Več" overflow (E-pošta/.ics/Poslušaj/Natisni — all preserved); **Iz moje poti strip** at top consumes collection into plan; /potovanje re-scoped as provider-supply companion (full merge deferred to later phase) | Fewer competing primary actions; issue §19/§42 |
| **Mobile nav** | 5-tab bottom bar; map+trips as tabs | GM/AB/industry standard [R2§1–2]; issue §27 suggestion validated against routes | Hamburger sheet with 13 destinations + StickyMobileCTA + chat FAB competing at bottom (§10) | Bottom tab bar: **Razišči · Zemljevid · Načrtuj · Moja pot · Več** (Več = full current menu, nothing removed); StickyMobileCTA retired on tab-bar pages (its CTAs live in tabs); chat FAB lifts above bar | Mobile first-class; fewer fixed CTAs; 44px targets |
| **AI interaction** | AI organizes on demand; humans curate first; actionable cards, never prose dead-ends | TA builder postmortem (categories→save→AI on request, 2× save rate) [R2§9]; ALMA structured outputs [R1§2] | Chatbot per-place "+" is 28px icon-only (audit §12); AI→trip handoff exists via stash | Canonical compact add in chat rows (44px, labeled, same handlers); AI surfaces unchanged otherwise — they already emit real cards | Issue §15/§16; a11y touch-target fix |
| **Trip context** | Trip is the center; discovery continues inside the trip | AB "explore around your stay" + add-to-day [R2§8]; Mindtrip trip workspace [R1§1] | "V moji poti" has no global answer (P-STATE-1); /potovanje footer-only | Single my-trip store + **Moja pot view on /moja-potovanja** (grouped, Odpri/Odstrani, Nadaljuj načrtovanje); contextual membership badge on every wired surface | Issue §17/§18: "To je moja pot", not "which module?" |
| **Booking context** | Truthful actions; uncertainty never becomes certainty | ALMA yes/no + explanation + source [R1§2]; Wanderlog admits estimate gaps [R1§3] | 10 booking CTA variants with differing honesty labels (mostly honest, inconsistent) | All integrations preserved (affiliate, handoff, checkout, real booking); labels unified to one truthful vocabulary: Rezerviraj / Preveri ponudbo / Odpri ponudnika / Cena od … / Razpoložljivost ni preverjena | Issue §21/§38 DATA TRUST |
| **Go Mode** | NOW → NEXT → WHEN → HOW → CONTEXT; calm companion | ALMA mobile companion posture [R1§2]; issue §24 spec | GoMode exists (GPS, weather, handoff, offline) — capable but visually dense | Hierarchy/visual-calm pass only; every capability kept (D8-F) | Calm while traveling (issue §24) |
| **Loading** | Layout-preserving skeletons; no jumps; no dev-looking messages | industry consensus (NN/g in [R2]) | Mixed spinner/pulse/skeleton across ~58 surfaces (P-STATE-2) | Grids/cards get skeleton-first loading on redesigned surfaces; existing good patterns (SmartSearch skeletons, planner blur+inert) kept | Issue §31 |
| **Empty state** | Empty points to the next useful action | issue §32 spec; GM/AB empties link onward | 14 "Ni še…" strings, 4 grammars; wishlist empty has no link | Unified empty component on redesigned surfaces: message + Razišči/direct CTA | Issue §32 |
| **Error state** | Truthful, calm, localized, actionable, recoverable | ALMA honest uncertainty [R1§2]; issue §33 spec | Good in places (SmartSearch K-5, owner 503), ad hoc elsewhere | Unified error vocabulary on redesigned surfaces: what failed + Poskusi znova / Nadaljuj brez | Issue §33 |

## Anti-patterns explicitly rejected (documented in the wild — [R2§anti-patterns])

1. **Fake urgency/scarcity** (Booking.com countdowns, CMA warning letters) — never.
2. **AI day-by-day itinerary before relevance/control + 40 s latency** (Tripadvisor v1 postmortem) — our AI stays on-demand with deterministic fallback.
3. **Map occlusion** by floating cards (Airbnb mobile web bug) — map sheets must not cover pins.
4. **Geographic zigzag days** (TA "party bus for a family" review) — deterministic engine already guards this; keep trust line.
5. **Save-scale collapse** (TA "200+ saved trips, can't find them") — Moja pot caps + grouping from day one.
6. **Paywall mid-enthusiasm** (Roadtrippers tiers) — n/a (no paywall), keep it that way.
7. **Stale editorial data presented as fresh** — provenance/"vir podatkov" stays visible (B/CONTEXTUAL access).

## Convergent principles this design is built on (research summary)

1. Conversational/question entry must land in a structured, day-by-day plan.
2. One-tap add from discovery into the plan, smart default + correction.
3. Map ↔ itinerary live sync; the map is a planning surface.
4. Logistics completeness (parking, timings, prices) is the satisfaction driver.
5. Import the user's existing research (Start Anywhere — already our differentiator).
6. Real-time collaboration lives on the saved object (already on /pot).
7. Community content feeds the add-to-trip loop.
8. Honest uncertainty builds trust measurably.
9. Mobile = companion posture (now/here/next), not a shrunken planner.
10. AI output must be actionable objects (cards), never prose dead-ends.

*Matrix complete. Per issue §44: implementation may now begin once D8-B architecture doc is written.*
