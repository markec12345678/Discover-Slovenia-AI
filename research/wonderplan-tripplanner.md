# Competitive Research: Wonderplan & Trip Planner AI

**Task ID:** 19-b · **Agent:** research-agent · **Date:** 2026-09-28 (live browser session 2026-09-27/28, sandbox time)
**Scope:** Platforms NOT covered by `docs/UX-WORKFLOW-BENCHMARK-2026-09-27.md` (which covered Alma STB, Mindtrip, Stardrift, Wanderlog).
**Method:** Live agent-browser visits (desktop 1440×900, isolated session `task19b`) + 10 web searches. Screenshots in `research/screenshots/`.

---

## 1. WONDERPLAN (wonderplan.ai)

> Positioning: "Your personal trip planner and travel curator, creating custom itineraries tailored to your interests and budget." — free AI itinerary generator with a preferences quiz + a large SEO/affiliate surface.

### (a) First-run UX observed via browser (live)

**Landing page** (`wonderplan-landing.png`):
- Nav: `Blog · Trip Planner · Deals · Attractions · Sign In`
- H1: "Craft Unforgettable Itineraries with AI Trip Planner" + subhead above. CTA: **"Get started—it's free"** → `/trip-planner`.
- Feature blocks: *Adjust your itinerary as needed* (reorder, add destinations, discard plans), *AI Travel* (personalized **accommodation recommendations**), *Offline Access* (**download plans as PDF**), *Everything in one space* (personalized + bookmarked plans on one page).
- FAQ accordion (answers extracted from DOM): free "at least for now 🤭"; recommendations from "unique preferences, tastes, and travel requirements"; PDF download for offline; reorder/add/remove locations; support = support@wonderplan.ai.
- Footer: Popular destinations (Japan, Thailand, Bali, US, Italy, France itineraries → `/itineraries/<country>/<n>-days`), Contact, Attractions, Blog, Twitter, ToS, Privacy. © 2026.
- Interacting with CTAs triggered a **login modal**: "Let's Start with Wonderplan — To access all the functionalities and services, please log in to your account first." (`wonderplan-login-modal.png`, `wonderplan-signin.png`)

**Trip Planner page** (`wonderplan-trip-planner.png`, `wonderplan-form-filled.png`) — the core onboarding quiz, viewable without login:
1. **Hybrid input, top**: NL prompt box "Describe your dream trip..." with 3 example chips — "5 days in Bali with family, budget $3000", "Romantic weekend in Paris, fine dining and museums", "Solo backpacking in Japan for 2 weeks" — + "✨ Generate with AI" button (calls `POST /api/v4/trips/parse-text`, which pre-fills the form).
2. **"or customize manually"** classic preferences quiz:
   - Destination (default "New York"; autocomplete backed by `GET /api/v1/destinations?q=`)
   - Travel dates (flatpickr calendar)
   - Number of days (stepper, default 3)
   - Budget segmented control: **Low 0–1000 USD / Medium 1000–2500 USD / High 2500+ USD** — "The budget is exclusively allocated for activities and dining purposes."
   - Travel party: **Solo / Couple / Family / Friends**
   - Interests (8 multi-select): Beaches, City sightseeing, Outdoor adventures, Festivals/events, Food exploration, Nightlife, Shopping, Spa wellness
   - Food preferences: **Halal / Vegan** checkboxes
   - Submit

**⚠ LIVE PRODUCTION OUTAGE observed (2026-09-27):** I could NOT generate an itinerary — every core API failed:
- `GET /api/v1/auth/config` → **503** (Sign In renders an `about:blank` iframe; console: `[tp] entrypoint init`, `[error] config is not valid`)
- `GET /api/v1/destinations?q=ljubljana|rome|italy` → **503** (autocomplete shows "No options")
- `POST /api/v4/trips/parse-text` → **502** (UI: "Something went wrong. Please try again or fill in the form manually.")
- Manual form Submit with Rome + date + budget + party + interests → no navigation (validation depends on the 503 destination config)
→ The **itinerary result view (day cards / map presence) could not be verified live**; structure below comes from reviews + their own marketing copy.

**Adjacent surfaces (all working, all affiliate-driven):**
- `/attractions` (`wonderplan-attractions.png`): "Discover Things to Do" — 26 popular-city grid + regional browse. Rome page (`wonderplan-rome-attractions.png`): **"8308 tours, activities, and experiences"** with ratings, price "From $114.97 per person", duration, "Free cancellation", categories (Tours & Sightseeing, Art & Culture, Food & Drink, Outdoor, Day Trips, Museums, Tickets & Passes). Product detail (`wonderplan-attraction-detail.png`) → "Book" goes to **viator.com …?pid=P00206813&medium=api&api_version=2.0** (Viator Rapid API affiliate partner).
- `/deals` (`wonderplan-deals.png`): coupon/affiliate hub — Airalo eSIM (FALLY20), flight-compensation claim (AirHelp-style), travel insurance (WNFOUND), tour discount codes (SAVEAPP10, ZXWJLD, WANDERLUST5), transport (S018500, €10 new-user), Google Flights, hotel codes (WJLKLWX, TRIPBESTUSD8/Trip.com).
- `/itineraries/japan/7-days` (`wonderplan-japan-itinerary.png`): long-form SEO guide "Japan Itinerary 7 Days: The Ultimate Guide (2026)" — quick-facts card (best time, currency, visa, JR Pass, daily budget, language), day-by-day narrative (Tokyo 2n → Hakone 1n → Kyoto 2n → Osaka 1n "Golden Route"), "Plan your own Japan trip" CTA → trip planner, and per-city **Booking.com affiliate links (aid=8048291)** + Viator links.
- `/blog` (`wonderplan-blog.png`): generic travel-adjacent SEO (passport/ID photo apps, what to wear for passport photo, travel photo storage, northern lights on film, Dominican Republic e-ticket) — traffic play, not destination depth.

### (b) Workflow steps end-to-end (intended)
1. Land on wonderplan.ai → "Get started—it's free" → `/trip-planner`.
2. Either type a one-shot NL prompt ("Generate with AI" → parse-text API pre-fills the form) or fill the manual quiz (destination, dates, days, budget tier, party, interests, food prefs).
3. Submit → **login required** (modal: "To access all the functionalities and services, please log in to your account first") → account creation.
4. Itinerary generated: day-by-day plan on a single page + **personalized accommodation recommendations** ("AI Travel" feature).
5. Customize: reorder stops, add/remove destinations, discard plans — all "in one page".
6. Bookmark plans; "everything in one space" (trips + bookmarks).
7. Export: **download as PDF** for offline access.
8. Optional: browse `/attractions` catalog to book tours (Viator hand-off), `/deals` coupons.

### (c) UI patterns
- **Preferences quiz (form)** as primary; **optional single NL prompt** that pre-fills the form (not a chat loop).
- Marketing describes a single-page itinerary workspace (drag/reorder implied "reconfiguring the order"), **no map view observed** — itechguides review: "No listed collaboration, maps, or third-party integrations."
- Card grids for attractions catalog; long-form editorial for SEO itinerary guides.
- **No chat interface, no map-first layout** (in stark contrast to Mindtrip/Wanderlog and to our platform).

### (d) Booking path
- **No in-itinerary booking integration** (simular.ai: "No booking integration. Cannot handle multi-city trips with complex logistics"). Accommodation "recommendations" in-plan, but booking is a separate affiliate surface:
  - Tours/activities: `/attractions` → **Viator affiliate** (pid=P00206813, `medium=api` — Viator Rapid API partner).
  - Hotels: pre-generated itinerary guides → **Booking.com affiliate** (aid=8048291).
  - Coupons: `/deals` (Airalo, insurance, Trip.com codes, Google Flights link-out).

### (e) Collaboration / share / export
- Export: **PDF download** (stated in FAQ + landing feature block; core "offline" story).
- Share: no share-link feature found.
- Collaboration: **none observed/listed** (American Bar Association blurb says Wonderplan "balances multiple preferences" for group travel — i.e., quiz captures group prefs, not live co-editing). itechguides: "No listed collaboration".

### (f) Pricing model
- **Free** — FAQ: "Yes, Wonderplan is a free planning tool (at least for now 🤭)". Reviews (monkeyeatingmango, Jun 2026) note premium tiers "signaled but unverified". Monetization today = **affiliate commissions** (Viator, Booking.com, coupon partners).
- Trustpilot: claimed profile **April 2026**; **3.7 TrustScore from just 1 review** (5-star "Best travel planner so far… good suggestion for hotels, restaurants and… itinerary recommendation", Apr 19 2026, unprompted). Company details: 30 N Gould St, 82801, **Sheridan, Wyoming** (registered-agent address), +1 307 223 5892, support@wonderplan.ai.

### (g) Unique differentiators
1. **Freemium one-shot generator + PDF offline export** as the hero promise — "best free generator" (felloai comparison: "If you want one tool that plans and books, choose Mindtrip. For the best free generator, choose Wonderplan. If you like planning by conversation, choose Layla").
2. **Content-commerce flywheel independent of the app**: 6 country itinerary guides × long-form SEO, an 8k-tours-per-city Viator catalog, and a coupon hub — the site monetizes organic search even when the planner is down (which it literally was during research).
3. **Preference-quiz granularity** (budget tiers scoped to activities+dining, Halal/Vegan food prefs, 4 party types, 8 interests) feeding "personalized accommodation recommendations" — a budget-scoped curation angle most generators skip.

### (h) Weaknesses / notable criticism
- **Core product broken in production during research**: auth config 503, destination autocomplete 503, NL parse 502 — Sign In cannot complete (blank auth iframe); itinerary generation impossible. aitravel.tools ("3 AI Trip Planners Tested. One tool broke…") corroborates fragility.
- **No map, no chat, no collaboration, no in-product booking** (itechguides editor score 6.5/10; simular.ai criticism).
- Itineraries ignore **closures, weather, local events, seasonality** (travo.me: "What it suggests in March might not work in August").
- Thin social proof (1 Trustpilot review); Wyoming registered-agent address = unclear company identity; blog content off-topic (passport photos) — SEO-first, product-second signal.
- Reviews conflict on account requirement: some claim "no account required" for drafts (blog.vacation-planner.app, Apr 2026) while live UI login-modals before any functionality — suggests a recent re-login-walling or A/B state.

### Screenshot references (Wonderplan)
`wonderplan-landing.png` · `wonderplan-login-modal.png` · `wonderplan-trip-planner.png` · `wonderplan-form-filled.png` · `wonderplan-signin.png` · `wonderplan-attractions.png` · `wonderplan-rome-attractions.png` · `wonderplan-attraction-detail.png` · `wonderplan-deals.png` · `wonderplan-japan-itinerary.png` · `wonderplan-blog.png`

---

## 2. TRIP PLANNER AI (tripplanner.ai)

> **Key finding: tripplanner.ai is not an independent planner anymore — it is an SEO/inspiration front-end owned by Layla AI GmbH (Berlin), funneling all planning into layla.ai's chat agent. Layla was acquired by Expedia Group on 2026-07-31.**

### Corporate/product reality (from their own Terms, verified live)
- `/terms`: "the Website https://tripplanner.ai/ … **run by Layla AI GmbH**, a limited liability company… Belziger Straße 69-71, 10823 Berlin… HRB 247135 B… represented by its Managing Director **Saad Saeed**…"
- "**Trip Planner AI only provides referral links to Layla and to third-party booking partners**, and is not subject to the application of any organized travel contracts…"
- Sign-in: **Google account** (NextAuth/Auth.js — clicking "Create a new trip" fires a signIn attempt; we observed an AuthError in console).
- The site serves **Layla's logos from its own domain** (`/logo/layla_avatar_borderless.svg`, `/logo/new-layla-logo.svg`) — full brand fusion.
- **app.tripplanner.ai → DNS NXDOMAIN** (decommissioned; the historical map-first app subdomain is gone).
- Layla (formerly "Roam Around") was **acquired by Expedia Group on July 31, 2026** (multiple sources: thepaypers, deeparrival, eturbonews, 36kr) — "Layla stays standalone for now".

### (a) First-run UX observed via browser (live)

**Landing page** (`tripplanner-landing.png`):
- Nav: `Create a new trip` (button → Auth.js Google sign-in) · logo · `Community Trips` (×2) · "AI Trip Planner" heading.
- H1 "AI Trip Planner"; subhead: "Smarter than endless tabs, a personalized trip builder and itinerary generator that saves you hours planning flights, hotels, and activities."
- **Primary CTA "Create a New Trip" → `https://layla.ai/chat?ask=Create+a+new+trip&utm_medium=tripplanner`** — anonymous users are handed to Layla's chat with a pre-filled prompt.
- Social proof block: **"8M+ trips planned"**, **"4.9 ★ average"**, plus editorial bylines ("Written by Ana Rodriguez — Family & Group Travel Blogger"; "Written by David Chen — Data Scientist & AI in Travel").
- Feature grid: *Instant itineraries* ("Enter your travel dates and destinations, and get a full plan… complete with flights, hotels, and activities"), *Trips for everyone* (family/couples/road trip), *Live Prices & Easy Booking* ("Compare real-time prices… book directly with trusted platforms like **Skyscanner, Booking.com, and GetYourGuide**"), *Flexible editing* ("Swap activities… with one click, your itinerary updates instantly").
- **Homepage copy repeatedly redirects to Layla** — "watch the magic happen on Layla.ai", "you're connected directly to Layla.ai, your personal AI travel agent", "Start a chat with Layla.ai Travel Agent and start your trip planning!" (leftover copy-paste creates real brand confusion: the page describes Layla's chat-refinement loop — swap museums for food tours, shorten a train transfer, add a Florence day trip, upgrade hotels — as "Plan Together").
- SEO sections: Family / Couples / Road Trip / Multi-City planner long-tails, each linking to layla.ai/plan/* or layla.ai/chat.
- Testimonials (3: digital nomad, 2 students), travel-guide cards (Paris 2025, Tokyo 2025/2026), "Journey Inspirations from Travelers" community previews.
- Footer: /terms, /privacy, `mailto:hello@tripplanner.ai`, /destinations, /public-trips.

**Community Trips** (`tripplanner-public-trips.png`): `/public-trips` — "Find trips created by other users and get inspired!" Card list with **author name, day count, view count** (Discover Seoul 8d · 35 views; São Paulo 8d · 23; LA 3d · 19; Tokyo 10d · 13; NYC 7d · 12; Budapest 4d · 8; Rome 3d · 7; Cartagena 6d…). Names look seeded/demo-ish ("Ash Simpson", "Italo Pereira", "Pablo Guzmán").
- **Detail pages 404**: every `/public-trips/<uuid>` I opened (incl. links from their own homepage) → "Error 404: Trip Not Found / Back home / **Exit map**" (`tripplanner-trip-detail.png`, `tripplanner-trip-detail2.png`). The persistent "Exit map" button reveals the detail template is a **map-centric layout** (full-screen map itinerary view — consistent with their historical "map-based itinerary" reputation), but the data layer is stale/broken.

**Destinations** (`tripplanner-destinations.png`): `/destinations` — a giant flat alphabetical city list (thousands of entries, GeoNames-style, incl. "Bled, Slovenia", "Ljubljana, Slovenia", duplicates like "Amsterdam, Holanda"/"Amsterdam, Netherlands"). **Clicking a city redirects to `layla.ai/?utm_medium=tripplanner`** (`tripplanner-ljubljana.png` — layla.ai answered with a Vercel Security Checkpoint "Failed to verify your browser, Code 21" that blocks headless/automation traffic; retry once failed, per policy I fell back to search).

**Paris guide** (`tripplanner-paris-guide.png`): `/paris` — genuinely good editorial SEO page: districts cheat-sheet, "where to stay" by persona (first-timers/families/couples/budget) each with "Find hotels →" links that are **contextual deep-links into Layla chat with pre-filled questions** (`layla.ai/chat?ask=What+are+the+best+family+hotels+to+stay+in+paris&utm_source=tripplanner`), 20 highlights, embedded map ("Loading map..."), "Create your Paris trip" CTAs.

**app.tripplanner.ai**: `DNS_PROBE_FINISHED_NXDOMAIN` (`tripplanner-app.png`) — the old planning app subdomain no longer exists.

### (b) Workflow steps end-to-end (intended)
1. User lands via SEO (homepage, /paris-type guides, /destinations, /public-trips).
2. Clicks "Create a New Trip" (or any guide CTA):
   - **Anonymous** → `layla.ai/chat?ask=<contextual prompt>&utm_medium=tripplanner` — planning happens in **Layla's chat**: input dates/destination/interests → AI designs full itinerary (flights, hotels, transfers, experiences).
   - **Returning/signed-in** → Google sign-in (Auth.js) on tripplanner.ai → their own (map-first) trip builder + saved trips.
3. Iterate in chat ("Plan Together"): swap activities, shorten transfers, add day trips, upgrade hotels — itinerary + costs + travel times recalculate.
4. **Live prices & booking**: flights (Skyscanner), hotels (Booking.com — affiliate `aid=2233658` seen on links), activities (GetYourGuide) — "book directly with trusted platforms"; on the Layla side this deepens post-Expedia acquisition.
5. Optionally publish trip to **Community Trips** (public share page with map) for inspiration/social proof.

### (c) UI patterns
- **Chat-first** (via Layla hand-off) — the homepage literally teaches the chat loop. tripplanner.ai itself contributes **content pages + list surfaces**, not an editor.
- Historical/own-product pattern = **map-first itinerary** (public-trip template with "Exit map", reviews: "map view… synced with Google Maps", "day-by-day map showing optimized routes").
- Card grids for community trips; long-form editorial guides; flat mega-list for destinations.
- No form/quiz onboarding on tripplanner.ai itself (the destination/dates/interests form lives inside Layla chat).

### (d) Booking path
- Affiliate hand-offs from tripplanner.ai: **Skyscanner** (flights), **Booking.com** (`aid=2233658` + label), **GetYourGuide** (activities search links, e.g. `getyourguide.com/s/?q=tokyo+food+tours`).
- Layla side (the actual product): conversational booking with live prices — now backed by **Expedia Group** inventory relationships.
- T&C explicitly disclaims: "Trip Planner AI shall never be understood as a tour operator… only provides referral links."

### (e) Collaboration / share / export
- **Community Trips** = public share surface (trip pages with view counts) — conceptually mirrors our /pot community trips; currently broken (404s).
- Chat-based collaborative refinement is Layla's "Plan Together" (solo-user chat, not multi-user live editing).
- **No PDF/calendar export demonstrated** on tripplanner.ai; unverified on Layla side (blocked by bot protection).

### (f) Pricing model
- **Free** ("free of charge" per Terms; monetization = referral links — their T&C says so explicitly). Reviews occasionally mention "premium unverified". No visible paywall anywhere on tripplanner.ai. Google sign-in is the only gate.

### (g) Unique differentiators
1. **SEO → chat funnel with contextual deep-links**: every guide section hands off to `layla.ai/chat` with a *pre-filled, intent-matched prompt* ("Best hotels for a couples trip in paris") — the smoothest content-to-conversation bridge I've seen among competitors.
2. **Community trips gallery** with view counts as an inspiration layer (user-generated itineraries, author attribution) — direct conceptual competitor to our /pot.
3. **Massive destination index + editorial guides** (thousands of cities, Paris/Tokyo deep guides) as programmatic-SEO top-of-funnel, backed by **Layla AI GmbH → Expedia Group** (funding + booking inventory no indie planner can match).
4. Historical product identity: **map-first itinerary generation** ("optimized routes", "synced with Google Maps") — the reputation the brand still trades on.

### (h) Weaknesses / notable criticism
- **It's a funnel, not a full product**: the brand's own planning capability is gone (app.tripplanner.ai NXDOMAIN; all planning = Layla hand-off). Value on tripplanner.ai = SEO content + a (broken) community gallery.
- **Broken public data layer**: community trip detail pages 404 from their own homepage links; "Create a new trip" sign-in errored live (Auth.js AuthError observed in console).
- **Brand confusion**: copy repeatedly says "watch the magic happen on Layla.ai", features described as "Layla.ai allows you to chat…" — users don't know which product they're using; stats ("8M+ trips planned, 4.9★") are unverifiable and attributed to the funnel brand, not the planner.
- **layla.ai is bot-protected** (Vercel Security Checkpoint Code 21) — blocks automation *and* some legit users (VPN/private-mode); the actual UX couldn't be fully audited.
- Reviewer placement: "Trip Planner AI — best one-shot AI itinerary" (monkeyeatingmango) reflects the *legacy* product; today the one-shot experience depends entirely on Layla chat quality.

### Screenshot references (Trip Planner AI)
`tripplanner-landing.png` · `tripplanner-newtrip.png` · `tripplanner-public-trips.png` · `tripplanner-trip-detail.png` · `tripplanner-trip-detail2.png` · `tripplanner-destinations.png` · `tripplanner-ljubljana.png` (layla.ai bot-block) · `tripplanner-paris-guide.png` · `tripplanner-app.png` (NXDOMAIN)

---

## 3. Benchmark takeaways vs "Discover Slovenia AI"

| Dimension | Wonderplan | Trip Planner AI | Discover Slovenia AI (us) |
|---|---|---|---|
| Onboarding | Preferences quiz (dest/dates/days/budget tier/party/8 interests/Halal-Vegan) + optional NL prompt → login wall | SEO content → Layla chat hand-off (or Google sign-in → own map-first builder) | /nacrtuj deterministic form + NL adjustments, **no login** for plans |
| Itinerary UI | Single-page day plan + accommodation recs; **no map, no chat** | Map-first (legacy) / chat-first (Layla) | Day cards + drag-drop + split map + weather bar |
| AI refinement | None beyond manual reorder/add/discard | Chat loop (Layla): swap/shorten/upgrade with cost recalc | NL refine actions + undo, deterministic engine |
| Booking | None in-product; Viator/Booking/coupon affiliate surfaces | Skyscanner/Booking/GetYourGuide affiliate; Expedia-backed Layla booking | Booking bridge + marketplace with own supply |
| Community | None | Community Trips gallery (broken 404s) | /pot with revisions, presence, reservations |
| Export | PDF (offline story) | None demonstrated | PDF + ICS + audio + offline Go mode |
| Pricing | Free (paid signaled); affiliate-funded | Free; referral-funded (Layla GmbH/Expedia) | Freemium marketplace |
| Provenance/offline truth | None | None | Provenance layers, data-freshness, validator telemetry |
| Live reliability (observed) | **Core APIs 502/503 down** | Public trips 404; auth error; layla.ai bot-wall | (our own monitoring: production healthy) |

**Both platforms are structurally weaker than us on the product axis** (no deterministic engine, no weather/event awareness — Wonderplan criticized exactly for that; no independent editor on tripplanner.ai). Wonderplan's quiz is the closest analog to our interests/party/budget intake; Trip Planner AI's community gallery is the closest analog to /pot; their affiliate hand-off model (Viator pid / Booking aid / GetYourGuide / Skyscanner) mirrors our booking-bridge philosophy. Wonderplan's *content-commerce flywheel* (SEO guides + 8k-tours catalog + coupon hub that keeps monetizing while the app is broken) and Trip Planner AI's *contextual deep-link SEO→chat funnel* are the two patterns worth stealing for acquisition strategy.

---

## Search log
- Wonderplan: "Wonderplan AI travel planner review 2026 features" · "Wonderplan.ai itinerary how it works preferences quiz pricing" · "Wonderplan vs Mindtrip vs Wanderlog comparison" · "Wonderplan app itinerary view day cards map accommodation recommendations user experience" · "wonderplan.ai local expert/human/group travel collaboration offline PDF review" · "Wonderplan Trustpilot reviews rating" · "Wonderplan weaknesses criticism limitations AI itinerary generic review"
- Trip Planner AI: "Trip Planner AI tripplanner.ai review map itinerary features 2026" · "tripplanner.ai pricing pro plan free features PDF export collaborative" · "Trip Planner AI how it works itinerary map view review" · "Layla AI GmbH tripplanner.ai acquisition Roam Around Berlin" · "tripplanner.ai review itinerary map day by day" · "Trip Planner AI pricing free pro subscription cost 2026" · "tripplanner.ai mobile app Google Play"
