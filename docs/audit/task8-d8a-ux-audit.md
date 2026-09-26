# D8-A — READ-ONLY UX AUDIT of current `main` (Issue #8 groundwork)

- **Baseline:** HEAD `ac75070`, v1.111.1, 3197 tests, CI green
- **Date of audit:** 2026-09-26 (Task 36-a, Explore agent)
- **Method:** full read of `src/app` (38 pages), `src/components` (178 tsx files), `src/lib` state/persistence layer, navigation, stores, design tokens. **No source code was modified.**
- **Purpose:** foundation inventory for the DISCOVER → EXPLORE → SAVE → ADD → PLAN → GO redesign with **ZERO FEATURE LOSS**. Every capability found in code is listed here; the regression matrix for the redesign must be built from §3 (Feature Inventory) and §4 (CTA Inventory).

---

## 0. SUMMARY TABLE

| Metric | Value |
|---|---|
| Total routes under `src/app` (pages) | **38** (+5 non-page routes: `/go/[provider]`, `llms.txt`, `llms-full.txt`, `robots.txt`, `rss.xml`, `sitemap.xml`) |
| API route groups (`src/app/api/*`) | **50** (147 `route.ts` files) |
| Pages **without** the main `Navigation` component | **17 of 38** (incl. all 5 destination detail pages) |
| Distinct card-like components (user-facing) | **~22 variants** (§5) |
| Distinct "add-to-trip"-style action implementations | **7** (different labels, states, and mechanics — §4.1) |
| Distinct "save"-style action implementations | **6** (wishlist heart, save&share ×2, PDF/print, pass auto-save, my-trips ledger — §4.2) |
| Distinct booking CTA implementations | **10** ("Rezerviraj termin", "Rezerviraj", "Preveri ponudbo", "Rezerviraj direktno", day booking strip, "Rezerviraj pri ponudniku" ×2, checkout-modal, consultation "Rezerviraj", affiliate links — §4.3) |
| Dead ends found (discovery → no trip action / broken link) | **12** (incl. 1 hard 404 link bug — §9) |
| Major clutter surfaces (≥6 competing CTAs/sections visible) | **6** (homepage, nav, /nacrtuj results, /potovanje, destination hub, footer — §10) |
| State stores / persistence keys (client) | **1 Zustand app store + 1 Zustand cart + 8 localStorage keys + 5 sessionStorage keys** (§6) |
| Search entry points | **3** (SmartSearch dialog, hero-quick-input, chatbot — §7) |
| Hard-coded SL-only surfaces (no EN) | all DB surfaces + /dogodki, /lokali, /trznica, /dozivetja, /slovenia-pass, /moja-potovanja, /pot/[shareId] (§2.4) |

---

## 1. ROUTE INVENTORY (38 pages)

Legend: **Nav** = renders main `Navigation`; **!Nav** = does not (uses `LanguageToggle`, own header, or nothing).

### 1.1 Core funnel
| Route | Purpose | Key components | Nav |
|---|---|---|---|
| `/` | Homepage — AI-first hierarchy, 13 top-level blocks | `Hero`+`HeroQuickInput`, `BetaBanner`, `WelcomeBackWrapper`, `DemoScenariosWrapper`, `StatsSection`, `PlanCheckSection`, `ValidatorTelemetrySection`, `DestinationsSection` (featured=6), `PreGeneratedItinerariesWrapper`, `ExperiencesSection`, `ExploreHub`, `AffiliateSection`, `NewsletterSection`, `Footer`, `Chatbot`, `StickyMobileCTA`, `LegacyHashRedirect` | ✅ |
| `/nacrtuj` | AI itinerary planner (THE product core) | `ItineraryPlanner` (5603 lines), `TravelStyleQuiz`, `CommunityTrips` | ✅ solid |
| `/potovanje` | "Complete journey across all providers" (TASK 58) — second planner | `JourneyPlanner` (7 category columns: transfer/accommodation/attractions/events/restaurants/petrol/rental), `JourneyTrip` (MY TRIP view) | ✅ |
| `/na-poti` | Go Mode — Now & Next travel companion (phone-first) | `GoMode` (GPS, weather, completed stops, handoff, offline) | ✅ |
| `/moja-potovanja` | MY TRIPS — saved itineraries (guest: local; user: server) + AI consultations + orders | own guest/user header, `MyOrdersSection`, `EmptyState` | ❌ own header (both guest & logged-in views) |
| `/pot/[shareId]` | Shared trip workspace (public link) | `SharedTrip` (timeline, save/share, print/PDF, "Zaženi Na poti"), `TripCollaboration`, `TripReservations`, `TripBudgetCard`, `TripDocumentsCard`, `TripGuide`, `TripPolls`, `TripSocial`, `TripPushCard`, `PrintQr` | ❌ (in-page header only; SL-only) |

### 1.2 Discovery
| Route | Purpose | Key components | Nav |
|---|---|---|---|
| `/destinacije` | Full directory, 38 destinations, 6 filters + sort + collections | `DestinationsSection` (692 lines; `DestinationCard`, `DestinationModal`), `CollectionsSection` | ✅ solid |
| `/destinacija/[slug]` | Destination HUB (GEO-A) — links to all subpages, facts, provenance, nearby | server page + `AffiliateCtaBlock`, `LanguageToggle`, breadcrumbs | ❌ |
| `/destinacija/[slug]/things-to-do` | Things to do detail (activities, opening hours) | server + `AffiliateCtaBlock` | ❌ |
| `/destinacija/[slug]/guide/[type]` | 4 guide types per destination | server + `AffiliateCtaBlock` | ❌ |
| `/destinacija/[slug]/itinerary/[duration]` | 5 pre-generated itineraries per destination (1-day…7-day) | server + buttons | ❌ — **contains dead link** (§9 #1) |
| `/destinacija/[slug]/best-time-to-visit/[season]` | 4 seasonal pages per destination | server | ❌ |
| `/zemljevid` | Interactive map: 38 destinations + FSQ POI layer (125k points) + supply layer + own itinerary route | `MapSection`→`MapView` (1328 lines), `ProviderPanel`, `ProductCard`, `ProductModal`, `MapOpenedTracker` | ✅ solid |
| `/dogodki` | Events calendar (month/category/region filters) | `EventsCalendar` (417 lines; `EventCard`) | ✅ solid |
| `/vodici` | Guides + Adria guides + Blog + AskLocal consultation | `BlogSection`, `AskLocal` (`ConsultationDialog`) | ✅ |
| `/vodici/[slug]` | Adria guide detail (SL+EN full translations) | server | ✅ |
| `/lokali` | Restaurants/venues directory (DB listings) | `ListingsSection` (564 lines; `ListingCard`, `ListingModal` with AI Booking Assistant) | ✅ solid |
| `/dozivetja` | Experiences: categories + hidden gems + marketplace pinned to "experiences" tab | `ExperiencesSection`, `MarketplaceSection(defaultTab="experiences")` | ✅ solid |
| `/trznica` | Marketplace: products + experiences tabs, cart, checkout | `MarketplaceSection` (1129 lines), `CartDrawer`, `CheckoutModal`, `WishlistSheet` | ✅ solid |
| `/primerjava` | Honest comparison of AI planners (SEO: "mindtrip alternative") | server cards + FAQ | ❌ LanguageToggle only |
| `/slovenia-pass` | Gamification — digital passport, region badges, points | `SloveniaPassSection` → `SloveniaPass` (event-driven, `PassToast`) | ✅ solid |

### 1.3 Trust/info/legal
`/o-strani`, `/kontakt`, `/vir-podatkov`, `/zaupanje-in-varnost`, `/pogoji-uporabe`, `/politika-zasebnosti` — all server pages, **all ❌ Nav** (LanguageToggle only; `/vir-podatkov` renders `Footer`).

### 1.4 Auth & account
`/prijava`, `/preverba-emaila`, `/reset-gesla`, `/pozabljeno-geslo`, `/konzultacija/[token]` (delivered consultation answer + `ConsultationPartnerCards`) — all ❌ Nav (own headers).

### 1.5 Provider & admin surfaces
- `/za-ponudnike` — B2B funnel (how it works, model, pricing, founding partner) — ✅ Nav, ❌ Footer.
- `/owner/prijava`, `/owner/preverba-emaila`, `/owner/reset-gesla`, `/owner/dashboard` — owner surface. Dashboard = **8 tabs** (Lokali/Izdelki/Izkušnje/Rezervacije/Naročnina/Statistika/Provizije/Izplačila) + `OnboardingWizard`, forms (`ListingForm`, `ProductForm`, `ExperienceForm`), `ExperienceAvailabilityDialog`, `SponsorshipPanel`, `SubscriptionCalculator`, `PayoutLedgerPanel`.
- `/admin` — admin dashboard, 6 tabs (Pregled/Lokali/Leads/Naročnine/Stats/AI) + `AffiliateStatsPanel`, `ListingForm`, `GeoValidationPanel`.

### 1.6 API route groups (50 top-level, not exhaustive)
`ai, ai-health, ai-insights, ai-story, analytics, ask-local, auth, admin, beta-status, bookings, chat, checkout, collections, consultations, cron, debug-db, destinations, diary, email-itinerary, experiences, health, itinerary, journey, leads, listing-inquiry, listings, map, newsletter, orders, owner, plan-check, pois, poll, products, push, recommendations, reviews, smart-search, stripe, supply, track-funnel, translate, trip, trip-comments, trip-guide, trip-likes, trip-vote, tts, user, weather` (147 route.ts files).

---

## 2. NAVIGATION INVENTORY

### 2.1 Header — `src/components/sections/navigation.tsx` (448 lines)
Scroll-aware glass nav (transparent over hero → glass after 24px scroll), progress bar, `solid` prop for pages without hero.

- **Desktop (lg+): 5 primary links** — Destinacije, Doživetja, Zemljevid, Vodiči, **Moja potovanja** (lines 39–48).
- **Right side (up to 8 controls + CTA):** `PwaHeaderIcons` (offline badge + install), **Cart button** (badge), **WishlistSheet** (heart + badge), **Search icon** (opens SmartSearch), theme toggle (hidden <sm), `LanguageSwitcher` (hidden <sm), "Za ponudnike" ghost (hidden <md), **primary CTA "Načrtuj z AI" → /nacrtuj** (hidden <sm). Lines 213–320.
- **Mobile (Sheet, right, 82vw):** 5 primary links + separator "Razišči več" + **5 secondary links** (Na poti, Dogodki, Lokali, Tržnica, Slovenia Pass) + Za ponudnike + LanguageSwitcher + theme + full-width CTA. Lines 322–423. Total **13 destinations** in mobile menu.
- `SmartSearch` mounted inside header (line 438).

### 2.2 Footer — `src/components/sections/footer.tsx`
5 columns, **24 links**: Razišči (8: destinacije, doživetja, zemljevid, dogodki, lokali, tržnica, vodiči, slovenia-pass), Načrtuj+račun (8: nacrtuj, kviz, primerjava, #rezerviraj, moja-potovanja, na-poti, potovanje, prijava), Za ponudnike (4), Pravno (4), brand. Affiliate disclaimer. pb-40 for sticky CTA + chat FAB clearance.

### 2.3 Other navigation mechanisms
- **Breadcrumbs:** only on `/destinacija/[slug]` + subpages (custom, line 252–260). Nowhere else.
- **BetaBanner** (`src/components/beta-banner.tsx`): gradient strip under hero, dismissible, links `/za-ponudnike#pridruzi-se`. Homepage only.
- **StickyMobileCTA** (`src/components/sticky-mobile-cta.tsx`): fixed bottom bar (mobile only, appears after 85% viewport scroll): "Načrtuj z AI" + "Za ponudnike" — 2 CTAs competing with chat FAB. Hidden on /nacrtuj. On 16 pages.
- **Chatbot FAB** (`src/components/chatbot.tsx`): fixed bottom-right size-14, hides on scroll-down (mobile), lifts above sticky CTA (`body[data-sticky-cta]` CSS).
- **LanguageSwitcher** (`src/components/language-switcher.tsx`): SL/EN dropdown, **hidden on pages without EN version** (whitelist `src/i18n/routing.ts` — EN exists for: `/`, `/nacrtuj`, `/destinacije`, `/vodici`(+adria detail), `/primerjava`, `/zemljevid`, `/potovanje`, `/na-poti`, info pages, destination subroutes). DE/IT listed but filtered out.
- **LanguageToggle** (`src/components/language-toggle.tsx`): floating pill on ❌Nav pages — a *second, different* language control.
- **LegacyHashRedirect:** `/#načrtuj → /nacrtuj` etc. (client).

### 2.4 Findings — Navigation

**P-NAV-1 — Two-thirds of detail pages have no main navigation.**
- BEFORE: 17/38 pages render no `Navigation` (all `/destinacija/*` hub + subpages, `/pot/[shareId]`, `/moja-potovanja`, `/primerjava`, `/konzultacija/*`, auth pages, info/legal pages). Verified by grep across all `page.tsx` (nav=0). Destination hub has only a floating LanguageToggle; `/moja-potovanja` builds its own minimal header (lines 206–218, 329–356).
- PROBLEM: users deep-linked from Google/AI agents land on `/destinacija/bled` with no way back to map/planner/trips except browser back; MY TRIP (the central saved object) is unreachable from the shared-trip page header.
- PROPOSED: single persistent shell (nav + footer) on every public page; page-specific headers become content, not chrome.
- EVIDENCE: `src/app/destinacija/[slug]/page.tsx` (no Navigation import), `src/app/moja-potovanja/page.tsx:206`, `src/app/pot/[shareId]/page.tsx`.

**P-NAV-2 — Three parallel "language UIs".** Header `LanguageSwitcher` (dropdown), floating `LanguageToggle` (pill), and hardcoded SL-only surfaces. EN whitelist excludes /dogodki, /lokali, /trznica, /dozivetja, /slovenia-pass, /moja-potovanja, /pot/[shareId] — an EN user switching language on the homepage loses the switcher on most level-2 surfaces.
- EVIDENCE: `src/i18n/routing.ts:59–88`, `src/components/language-toggle.tsx:32`.

---

## 3. FEATURE INVENTORY (regression-matrix source — CRITICAL)

Format: **name** — surface(s) · implementation file(s) · reachability (P=primary, C=contextual, A=advanced, H=hidden).

### 3.1 Planning
1. **AI itinerary generation** — `/nacrtuj` · `itinerary-planner.tsx` (POST `/api/itinerary`; stages, abort) · P (nav CTA + hero).
2. **Deterministic engine** — `/nacrtuj` · `deterministic-itinerary.ts`, engine selector in form (`ENGINE_OPTIONS` line 261) · A (form field).
3. **NL refine (mutation)** — planner results · `ItineraryRefiner` via `/api/itinerary/refine`, `PlannerAiControls` quick chips · P/C.
4. **Plan Q&A (facts-first)** — planner right column tab "Vprašaj" · `plan-copilot.tsx`, `/api/itinerary/ask` · C.
5. **Chatbot with geo answers** — global FAB · `chatbot.tsx` (1432 lines), `/api/chat`, `chat-domain-fallback.ts` · P.
6. **Start Anywhere imports** — `/nacrtuj` `#start-kjerkoli` · link paste (F5.4), image/VLM (F8), Google pins (F14), PDF (D3) — `itinerary-planner.tsx:601–2470`, `/api/itinerary/ingest-*` · H (secondary hero line + planner tabs).
7. **Travel style quiz** — `/nacrtuj#kviz` · `travel-style-quiz.tsx` · A (below planner).
8. **Planner editing** — reorder (drag + ↑/↓), move stop between days, remove stop, add day/remove day, add suggested stop between stops (`PlannerLegSuggestions`, F16), meal suggestions (`PlannerMealStop`), segment headers (Jutro/Popoldan/Veer) · `itinerary-planner.tsx:1348–5083`, `planner-reorder.ts`, `day-segments.ts` · C.
9. **Undo stack** — results chip · `itinerary-undo.ts` + planner (§22) · C.
10. **Plan validator (foreign plans)** — homepage `PlanCheckSection` · `plan-check.ts`, `/api/plan-check` · A (homepage mid-scroll).
11. **Validator telemetry** — homepage `ValidatorTelemetrySection` · `validatorTelemetry` fragments · A.
12. **Planner trust line** — ✓ Pot preverjena / ⚠ counts · `planner-trust-line.tsx`, `stop-insights.ts` · C.
13. **Pre-generated itineraries** — homepage + `/destinacija/[slug]/itinerary/[duration]` (38×5 pages) · `pre-generated-itineraries.tsx` (sessionStorage heroQuery handoff) · C/A.
14. **Community trips** — `/nacrtuj` bottom + `/pot` social proof · `community-trips.tsx` · A.
15. **JourneyPlanner (complete journey)** — `/potovanje` · `journey-planner.tsx` (7 categories, supply search, selection → sessionStorage `dai:supply-selection` → "Nadaljuj v načrtovalnik") · C (nav? no — footer + explore only… actually reachable only from footer/homepage sections; it IS in footer as "Celotno potovanje").
16. **MY TRIP view (journey)** — `/potovanje` · `journey-trip.tsx` (timeline, totals, confirmation doc, print, weather chips, day audio) · C.

### 3.2 Discovery
17. **Destinations directory** — `/destinacije` + homepage featured · `destinations.tsx` (6 filters + sort + advanced toggle), `DestinationModal` (weather, opening hours, affiliate, "Zgradi novo pot") · P.
18. **Destination hub + subpages** — `/destinacija/[slug]` (+things-to-do/guide/itinerary/best-time) · server pages · P (SEO).
19. **SmartSearch** — header search icon · `smart-search.tsx`, `/api/smart-search` (AI+fallback; destinations/listings/products/experiences with "why") · P.
20. **Map** — `/zemljevid` · `map-view.tsx` (dest pins, FSQ POIs, supply layer with zoom gate, category chips, route toggle, deep links `#z=…`) · P.
21. **Map supply panel** — map right rail · `supply/provider-panel.tsx` + `ProductCard`/`ProductModal` ("Dodaj v moj načrt" → selection persist → AI context FIXED) · C.
22. **Events** — `/dogodki` + planner "Kaj se dogaja med tvojim obiskom" + `/pot` events · `events-calendar.tsx`, `itinerary-events.tsx` (add-to-trip!), `/api/itinerary` events match · P/C.
23. **Guides/Adria/blog** — `/vodici` (+[slug]) · `blog.tsx` (16 posts SL+EN modal), adria-guides(-en) · P.
24. **Listings (lokali)** — `/lokali` · `listings.tsx`, `ListingModal` + **AI Booking Assistant** (`booking-assistant.tsx`) · C.
25. **Experiences** — `/dozivetja` + marketplace tab · `experiences.tsx` + `MarketplaceSection` · P.
26. **Marketplace** — `/trznica` · `marketplace.tsx` (products + experiences, cart) · P.
27. **Comparison** — `/primerjava` · server page (planner comparison + FAQ) · H (footer only).
28. **Slovenia Pass** — `/slovenia-pass` · `slovenia-pass.tsx` (region badges, points, toasts on events: itinerary generated / destination viewed / listing viewed) · H (mobile menu + explore hub).
29. **Collections** — `/destinacije` bottom · `collections.tsx`, `collection-modal.tsx` · A.
30. **Weather** — destination modal, planner day chips (`itinerary-weather.tsx`, `/api/weather` Open-Meteo), MY TRIP day chips, Go Mode weather, homepage `weather-widget.tsx` (stats section?) · C/H.
31. **Opening hours** — destination modal + hub + stop-insights (planner) · `opening-hours.ts`, `opening-hours-status.tsx` · C.
32. **Provenance/trust info** — destination hub "Vir vsebine" card, map source badges (T1/OSM/STO), `/vir-podatkov` · `destination-provenance.ts` · C/H (footer).

### 3.3 Booking
33. **Experience booking (real)** — `experience-modal.tsx` `BookingSection` → POST `/api/bookings` (availability calendar, capacity guard, demo payments) · P on card.
34. **Affiliate booking** — destination modal "Rezerviraj direktno" (Booking.com/GYG/Viator/Tiqets), homepage `AffiliateSection` `#rezerviraj` (hotels/activities/transfers/insurance), `AffiliateCtaBlock` on destination pages, `/go/[provider]` redirect route · C.
35. **Journey handoff booking** — `journey-planner.tsx` / `go-mode.tsx` / `journey-trip.tsx` "Rezerviraj pri ponudniku" → EXTERNAL lifecycle + `handoff-record.ts` · C.
36. **Marketplace checkout** — cart-drawer + `checkout-modal.tsx` (Stripe demo) · P.
37. **Day booking strip/panel** — planner day header CTA + `booking-panel.tsx` per day (912 lines; hotels/experiences/transport/food) · C.
38. **Reservations import** — `/pot/[shareId]` `trip-reservations.tsx` (manual + parse of confirmation emails/PDF, DRAFT state) · A.
39. **Consultation partner cards** — `/konzultacija/[token]` "Rezerviraj/Poglej" · `consultation-partner-cards.tsx` · A.

### 3.4 Trip management / sharing / GO
40. **Save & share itinerary** — planner action bar `handleSaveShare` + `trip-timeline.tsx` duplicate implementation → POST `/api/trip` → `/pot/[shareId]` · P.
41. **My Trips** — `/moja-potovanja` (server list for users, localStorage `dai:my-trips` for guests, claim-on-login) · P.
42. **Shared trip live sync** — `use-trip-version-poll.ts`, banner "Naloži novejšo različico" · C.
43. **Trip collaboration** — `/pot` `trip-collaboration.tsx` (roles, invites, revocation, rename) · A.
44. **Trip social** — comments + likes + stop voting (`trip-social.tsx`, `trip-likes`, `trip-vote` API) · A.
45. **Trip polls** — `trip-polls.tsx` (group voting) · A.
46. **Trip documents** — `trip-documents-card.tsx` (metadata only) · A.
47. **Trip budget** — `trip-budget-card.tsx` (5 ledgers, unknown ≠ €0) · A.
48. **Trip guide (author)** — `trip-guide.tsx` (owner-only edit via editToken) · A.
49. **Trip diary** — `trip-diary.tsx` · A.
50. **Packing list + smart packing** — `packing-list.tsx`, `packing-smart.tsx` (in "Več o tvoji poti") · A.
51. **Go Mode** — `/na-poti` + "Zaženi Na poti" buttons (planner action bar line 5171, shared-trip line 783) → `dai:go-trip` v1/v2 · C.
52. **PDF export** — `trip-itinerary-pdf.ts` (deterministic) + print CSS (`@media print` in globals) · C.
53. **ICS calendar export** — planner action bar `handleIcsDownload` (`ics-export.ts`) · C.
54. **Email itinerary** — planner action bar → `/api/email-itinerary` · C.
55. **TTS audio (plan + days)** — planner "Poslušaj" (`/api/itinerary/tts`), MY TRIP day audio (`itinerary-audio.tsx` `DayAudioButton`) · A.
56. **Trip push (web push)** — `trip-push-card.tsx`, `/api/push`, cron `daily-trip-push` · H (on shared trip page).

### 3.5 Platform
57. **Consultations (Ask a local)** — `/vodici` `AskLocal` + `ConsultationDialog` → `/konzultacija/[token]` email delivery · A.
58. **Newsletter** — homepage `NewsletterSection` · A.
59. **Reviews** — `review-section.tsx` (on listing modal) · C.
60. **Owner onboarding/dashboard** (8 tabs incl. availability calendar, payouts ledger + CSV) · `/owner/*`.
61. **Admin dashboard** (6 tabs) · `/admin`.
62. **PWA/offline** — `manifest.json`, `sw.js`, `sw-register.tsx`, `pwa-header-icons.tsx` (install prompt + offline badge), offline.html, SW precache of /pot pages · H (header icons).
63. **Funnel analytics** — `FunnelTracker`, `trackPlannerEvent`, `/api/track-funnel`, `/api/analytics` · invisible.
64. **AI story** — `ai-story.tsx` (destination narrative w/ [Obišči][Kupi][Dodaj v plan] actions) · C (destination pages).
65. **Demo scenarios** — homepage `DemoScenariosWrapper` (pilot presentations) · A.
66. **Slovenia Pass toasts** — event-driven unlock notifications.

---

## 4. CTA INVENTORY

### 4.1 "Dodaj v mojo pot"-style actions — **7 different implementations**

| # | Label (SL/EN) | File | What it actually does | Where visible | Visual grammar |
|---|---|---|---|---|---|
| 1 | "Dodaj v mojo pot" / "Add to my trip" (+ states "V tvoji poti", "V poti") | `src/components/itinerary-events.tsx:102,116,217–248` | adds event to `itinerary.addedEvents` via `onToggleEvent` — **only in planner context**; on `/pot` static badge | planner results "More" section + shared trip | pill `rounded-full border px-3 min-h-[36px]`, emerald added-state |
| 2 | "Dodaj v moj načrt" / "Add to my plan" (states: postanek/izbira/duplikat) | `src/components/supply/product-modal.tsx:90,538–562` | `addProductToSelection` (map supply) → sessionStorage selection → AI context | map product modal (map only!) | full-width `Button` (default or outline when offerHref) |
| 3 | "V načrt" / "Add to plan" (state "V načrtu") | `src/components/supply/product-card.tsx:23,183–197` | same `onAdd` selection flow | map provider panel list | compact `h-7 px-2 text-[11px]` button |
| 4 | "Dodaj v načrt" / "Add to plan" (badge select) | `src/components/sections/journey-planner.tsx:110` | toggles product into journey selection | `/potovanje` category cards | badge-like control |
| 5 | icon-only "+" (aria "Dodaj {name} v načrt", state ✓) | `src/components/chatbot.tsx:432–461` (t key `addPlace` sl.json:398) | `addChatPlaceToItinerary` or `stashChatPlace` (sessionStorage `dai:chat-places` when no plan) | chatbot geo answer rows | `size-7` (28px!) icon button |
| 6 | "Zgradi novo pot okoli {name}" | `src/components/sections/destination-modal.tsx:230–253` | **NOT an add** — sets sessionStorage `heroQuery` and navigates to `/nacrtuj` (builds NEW plan; previously honestly renamed from "Dodaj v mojo pot") | destination modal (from /destinacije + homepage cards) | full-width `Button size=lg` |
| 7 | "Dodaj" (legSugAdd) | `src/components/planner-leg-suggestions.tsx` (sl.json:480) | deterministic insert of suggested stop between two stops | planner between-stop suggestions | small chip button |

Related but planner-internal: "Dodaj dan" (add empty day, planner line 5072), add-stop from `applySuggestedStop`, chat deferred-consume (planner line 1031–1080).

**P-CTA-1 — The first-class action of the redesign exists in 7 incompatible variants.**
- BEFORE: 7 implementations above; labels differ ("moja pot" vs "moj načrt" vs "načrt"), mechanics differ (real add vs new-plan redirect vs AI-selection vs stash), states differ ("V tvoji poti" / "V načrtu" / "Že v načrtu" / ✓ disabled), sizes differ (28px icon vs 36px pill vs h-7 vs full-width).
- PROBLEM: user cannot form a single habit; "Dodaj" on the map means "tell the AI", on destination modal means "start over", on events means "pin to plan". None is reachable from /dogodki, /lokali, listing modal, guide pages, blog, SmartSearch results.
- PROPOSED: one canonical `<AddToTrip>` primitive + one state vocabulary ("V moji poti"), wired to a single journey store, contextual on every discovery card/detail.
- EVIDENCE: table above; chatbot `size-7` (28px touch target < 44px minimum); destination-modal comment lines 230–234 admit the mismatch.

### 4.2 Save/keep actions — **6 implementations**
1. **WishlistHeartButton** (`wishlist-sheet.tsx:63–116`) — heart, `dai:my-wishlist` localStorage; **only experiences + marketplace products** (marketplace.tsx:717,887; experience-modal.tsx:331). Terracotta fill. Header sheet "Priljubljene" (row → opens marketplace modal only).
2. **"Shrani in deli"** planner (`itinerary-planner.tsx:5152–5165`) — server save + clipboard.
3. **"Shrani itinerer"** duplicate (`trip-timeline.tsx:245–267`) — same API, second code path.
4. **"Natisni / Shrani kot PDF"** (`shared-trip.tsx:791–810`) + "Prenesi PDF" (deterministic pdf-lib file).
5. **Draft-nudges / reservation draft save** (`trip-reservations.tsx` "Shrani kot osnutek" line 803, "Potrdi in shrani" 795).
6. **Slovenia Pass auto-save** (event-driven, no control) + my-trips ledger (automatic).

**P-CTA-2 — Two mental models of "keep" (wishlist vs trip) with no bridge.** Wishlist items can only be re-opened in the marketplace ("Odpri v tržnici") — no "add wishlist item to trip". A saved destination/POI does not exist at all: only experiences/products have hearts.

### 4.3 Booking CTAs — **10 implementations**
`Rezerviraj termin` (experience-modal, real booking) · `Rezerviraj` (marketplace card, opens modal) · `Preveri ponudbo` (supply product-modal, affiliate) · `Rezerviraj direktno` + provider link table (destination-modal:420) · `AffiliateSection #rezerviraj` (homepage: hotels/activities/transfers/insurance links) · day-header `Rezerviraj` strip → `booking-panel-{day}` (planner) · `Rezerviraj pri ponudniku` (journey-planner:146, go-mode:129, journey-trip EntryRow) · `V košarico` (marketplace.tsx:813 + product-modal:529) · checkout-modal flow · `Rezerviraj/Poglej` (consultation-partner-cards:494). Honesty labels differ per surface (EXTERNAL / SAMO INFORMACIJA / REZERVACIJA PRI PONUDNIKU / demo notes).

### 4.4 Open controls
`Odpri` on my-trips cards → `/pot/[shareId]`; community-trips `openButton`; wishlist row opens marketplace modal; `Odpri košarico` (nav aria); `Odpri meni`; events "Spletna stran" external.

---

## 5. CARD INVENTORY (~22 card variants)

| Card | File | Image | Meta | Actions on card | Grammar notes |
|---|---|---|---|---|---|
| DestinationCard | `sections/destinations.tsx:523` | aspect-video + region/featured badges | ★rating·budget·duration·€ + 3 highlight chips | **1** (ghost "Več info" → modal; whole card clickable) | shadcn Card, p-3/4, hover:shadow-lg |
| DestinationModal hero card | `sections/destination-modal.tsx:187` | aspect-video + gradient | 2×2 info grid, opening hours, provenance | **2–3** (Zgradi novo pot + affiliate links + map/weather) | Dialog p-0, max-w-3xl |
| Experience category card (home) | `sections/experiences.tsx:71` | 4/3 + scrim title | description | **0 explicit** (whole card link → /dozivetja) | rounded-2xl custom |
| Marketplace product card | `sections/marketplace.tsx` (~line 780+) | thumb | price, provider | **3** (V košarico + Podrobnosti + heart) | — |
| Marketplace experience card | `sections/marketplace.tsx:940–1010` | thumb | provider·destination, badges | **3** (Rezerviraj + Pri ponudniku + heart) | — |
| EventMiniCard | `itinerary-events.tsx:142` | none | date·location·price | **2** (Dodaj v mojo pot / website) | rounded-lg border p-4 |
| EventsCalendar EventCard | `sections/events-calendar.tsx:274` | 112px thumb left | category badge, meta | **1** (Spletna stran external; fallback → /destinacije) | row layout |
| ListingCard | `sections/listings.tsx:319` | thumb | category, rating | **2** (Več podrobnosti + Spletna stran) | — |
| Supply ProductCard | `supply/product-card.tsx:53` | icon tile only | taxonomy badge, status, rating, price | **2** (open + "V načrt") | rounded-lg p-3, h-7 CTA |
| Supply ProductModal | `supply/product-modal.tsx` | none | wiki/AI desc, contacts, coords | **2** (Preveri ponudbo + Dodaj v moj načrt) | Dialog |
| Community trip card | `sections/community-trips.tsx` | — | days, stops | **1** (Odpri → /pot) | — |
| Pre-generated itinerary card | `pre-generated-itineraries.tsx` | — | days, destinations | **1** (klik → heroQuery → /nacrtuj) | — |
| MyTrips trip card | `app/moja-potovanja/page.tsx:279,441` | none | name, days, views, date | **1** (Odpri) | Card + hover:shadow-md |
| Consultation card | same page:514 | none | status badge, preview | **1** (Odpri) | — |
| Collection card | `sections/collections.tsx` | image | count | **1** (open modal) | — |
| Guide type card (hub) | `destinacija/[slug]/page.tsx:467` | emoji only | label+desc | **1** (link) | Card p-5 |
| Blog card | `sections/blog.tsx` | image | date, read time | **1** (open modal) | — |
| Adria guide card | `/vodici` page | image | — | **1** (detail) | — |
| My orders card | `my-orders-section.tsx` | — | number, status | **1** (lookup) | — |
| Pass badge card | `slovenia-pass.tsx:106+` | badge art | region, progress | **0** (info) | — |
| Trip day card (planner) | `itinerary-planner.tsx:4340+` | stop thumbs | km badge, geo ⚠, day offers | **many** (booking strip, remove day, drag handles, per-stop ↑/↓/remove/open) | Card |
| Stop card (shared trip) | `shared-trip.tsx:867` | thumb | time, price | vote + open | print-card |

**P-CARD-1 — No shared card primitive; ~22 grammars.** Radius values seen: `rounded-md/lg/xl/2xl/full`; paddings `p-2.5/p-3/p-4/p-5/p-6`; action counts 0–3+; wishlist heart exists only on 2 card types. The redesign's "one card system" must consolidate: image block, title/meta strip, primary Add-to-Trip, contextual secondary.

---

## 6. STATE INVENTORY

### 6.1 Where save/trip state lives
| Store | Tech | Key | Written by | Read by |
|---|---|---|---|---|
| `useAppStore` | Zustand (memory) | — | `setItinerary` (planner) | MapSection/TripMapPanel (routeByDay), TripTimeline, Chatbot |
| `useCart` | Zustand persist | `discoverslovenia-cart` | marketplace cards, product modal | CartDrawer, nav badge |
| Wishlist | localStorage + events | `dai:my-wishlist` (+ `dai:wishlist-changed` custom event, cross-tab) | WishlistHeartButton | WishlistSheet, Marketplace (pending open) |
| My trips ledger | localStorage | `dai:my-trips` (FIFO 50) | save&share | `/moja-potovanja` guest view, claim on login (`POST /api/user/trips/claim`) |
| Last itinerary | localStorage | `discoverslovenia_last_itinerary` | planner persist | planner restore ("Obnovljeni načrt" chip) |
| Supply selection | sessionStorage | `dai:supply-selection` | map adds / journey planner | AI context (FIXED), planner selectedProducts strip |
| Chat stashed places | sessionStorage | `dai:chat-places` (via `chat-add-place.ts`) | chatbot + w/o plan | planner deferred consume |
| Go Mode | localStorage | `dai:go-trip` (v1 journey / v2 itinerary+shareId), `dai:go-progress` (≤200) | "Zaženi Na poti" | `/na-poti` GoMode |
| Orders/bookings numbers | localStorage | `dai:my-orders`, `dai:my-bookings` | checkout, experience booking | MyOrdersSection |
| Server | Prisma | `SavedItinerary` (shareId, contentVersion), `JourneyBooking`, `TripGuide/Polls/Social/Collaboration/Reservations/Documents`, `PayoutEntry/Settlement`, `ExperienceAvailability(Day)` | save APIs | `/pot/[shareId]`, owner, admin |

### 6.2 State vocabulary for objects (inconsistent)
- **Saved (wishlist):** heart fill; aria "Shrani v priljubljene"; sheet count.
- **Added to trip:** events "V tvoji poti"/"V poti"; supply "V načrtu (izbira)"; chat ✓ disabled + toast "Že v načrtu"; selection strip FIXED/PREFERRED chips (planner line 3825–3833).
- **Scheduled:** Go Mode "Opravljeno"/completed stops (dai:go-progress); trip dates mapping for added events.
- **Booked:** journey booking states (`CONFIRMED`/`EXTERNAL`/`INFO`/`FAILED`/`CANCELLED` + provider-confirmed substates) with 5-color badge system (journey-trip.tsx:142–165); experience booking success view with booking number; reservations DRAFT vs confirmed.

**P-STATE-1 — "Is this in my trip?" has no global answer.** Trip membership is computed 4 different ways (addedEvents array, selection persist, chat stash, go-trip record), so no surface can render a truthful "V moji poti" state without duplicating logic. PROPOSED: single journey store (client) + server reflection, derived selectors for card states.

---

## 7. SEARCH INVENTORY

| Entry | File | Input | Returns | Trip action? |
|---|---|---|---|---|
| **SmartSearch** (header 🔍) | `smart-search.tsx` → `/api/smart-search` | NL query, debounce 600ms, ≥3 chars | 4 groups (destinations/listings/products/experiences) + AI summary + source badge; navigates via `search-result-nav.ts` | ❌ navigate only |
| **Hero quick input** (homepage) | `hero-quick-input.tsx` | NL + 8 intent chips + "Imaš že vire?" link | nothing — transfers `heroQuery` → `/nacrtuj` autogenerate | ➡ planner |
| **Chatbot** (FAB) | `chatbot.tsx` → `/api/chat` + RAG | NL chat | text + geo places (with per-place "+") | ✅ per-row add |
| Map search | map-view zoom-based supply + POI category chips | category filters | markers + panel | ✅ (V načrt) |
| Listings/destinations/events filters | per-page selects | structured | grids | ❌ |

**P-SEARCH-1 — SmartSearch is navigate-only dead end for the funnel.** Finding "rafting v Bovcu" leads to a page, not to a plan. The DISCOVER→ADD bridge is missing at the single highest-intent moment. EVIDENCE: `smart-search.tsx:174–180` (navigateResult).

---

## 8. DUPLICATE PATTERNS (concrete)

1. **Two planners:** `/nacrtuj` (`ItineraryPlanner`, 5603 lines, destinations+days) vs `/potovanje` (`JourneyPlanner`, 786 lines, provider products). Both have "plan" semantics, separate state, separate handoff ("Nadaljuj v načrtovalnik" only one-way). EVIDENCE: both files; footer links both.
2. **Two save&share implementations:** `itinerary-planner.tsx:1833+` and `trip-timeline.tsx:245–267`.
3. **Two day-audio entries:** planner listen button vs `DayAudioButton` (journey-trip/shared-trip).
4. **Two language controls:** `LanguageSwitcher` vs `LanguageToggle`.
5. **Three header styles:** glass `Navigation`, `/moja-potovanja` custom header, ❌Nav pages with none.
6. **Two toast systems:** shadcn `Toaster` + `PassToast` custom.
7. **Duplicated L-object i18n pattern** (~40 components carry local `const L = {sl, en}` while others use next-intl messages — e.g. `journey-trip.tsx:78`, `plan-copilot.tsx:58` vs `navigation.tsx` t()).
8. **Empty states:** at least 4 visual grammars (dashed border + icon + CTA in `destinations.tsx:658` and `moja-potovanja EmptyState`; plain text "Ni zadetkov"; amber error box; wishlist centered).
9. **Button hierarchy drift:** primary emerald default, emerald outline (Go Mode line 5176), amber-bordered amber (live-sync banner 5125), violet undo chip (3997), terracotta heart, plus one-off inline-styled CTAs (product-modal line 531).
10. **Card radius:** rounded-lg/xl/2xl mixed (§5).
11. **Status badges:** events CATEGORY_BADGE_CLASS (6 colors), journey statusBadge (5 colors), planner source badges (3 colors) — three palettes for "status".

---

## 9. DEAD ENDS (discovery → trip broken/missing)

1. **HARD BUG — dead link `/načrtuj`:** `src/app/destinacija/[slug]/itinerary/[duration]/page.tsx:241` links `href={`/načrtuj`}` (diacritic č). No such route exists (`src/app/nacrtuj`). Leads to 404. BEFORE: `t("generateButton")` CTA on 38×5 pre-generated itinerary pages.
2. **Destination hub has no add-to-trip** (`/destinacija/[slug]`): only "Načrtuj z AI" deep link and affiliate block; and no Navigation.
3. **Destination card/modal path loses current plan:** "Zgradi novo pot okoli X" overwrites `heroQuery` → planner regenerates (comment admits it: destination-modal.tsx:230–234).
4. **/dogodki EventCard:** external "Spletna stran" only — no add-to-trip (the capability exists in `itinerary-events.tsx` but only in planner/shared contexts).
5. **/lokali ListingCard/ListingModal:** booking assistant + website only; no trip action.
6. **SmartSearch results:** navigate-only (§7).
7. **Wishlist items:** cannot enter a trip/plan (marketplace open only) — §4.2.
8. **things-to-do/guide/best-time pages:** zero trip actions, no nav.
9. **Consultations & /konzultacija:** answers recommend partners with "Rezerviraj/Poglej" but no way to append the recommendation to a trip.
10. **Slovenia Pass:** pure gamification island — badges not connected to trip state surface.
11. **Blog/Adria guide cards:** read-only; "Explore the destination" link is the only exit (no add).
12. **Community trips "Odpri":** opens `/pot/[shareId]` as visitor — no "copy this trip into my planner" fork action (a classic MindTrip pattern).

---

## 10. CLUTTER PROBLEMS (counts from code)

| Surface | Count | Evidence |
|---|---|---|
| Homepage top-level blocks | **13** (+ chat FAB + sticky CTA + beta banner) | `src/app/page.tsx:84–155` |
| Desktop header controls | **5 links + 7 icon/buttons + CTA = 13 interactive elements** | navigation.tsx:152–320 |
| Mobile menu destinations | **13** | navigation.tsx:347–421 |
| Footer links | **24** in 5 columns | footer.tsx:46–100 |
| Planner results page blocks (single render) | restored chip · undo chip · header+3 badges · AI controls · trust line · summary bar · map+chat tabs (2) · status strip · day cards (with per-day booking strip + remove + drag + geo badge) · events section (6 cards w/ add) · booking panels ×N · **action bar with 5 buttons** (Shrani in deli / Zaženi Na poti / E-pošta / .ics / Poslušaj) · live-sync banner · "Več o tvoji poti" collapsible (recommendations/tips/events/packing/timeline) · below the fold quiz + community trips ⇒ **~15 stacked sections, 5 primary actions in one bar** | itinerary-planner.tsx:3948–5603 |
| Destination hub sections | **11 `<section>`** + affiliate CTA block + plan CTA | destinacija/[slug]/page.tsx (grep count 11) |
| /potovanje | 7 category columns × N cards each + MY TRIP + totals + handoff | journey-planner.tsx |
| Sticky mobile bar + chat FAB + safe area | 2 fixed CTAs + FAB simultaneously on mobile | sticky-mobile-cta.tsx + chatbot.tsx:1031 |

**P-CLUTTER-1 — The primary action "Dodaj v mojo pot" is never among the visible CTAs on discovery surfaces, while 5 different secondary actions compete in the planner.**

---

## 11. HIDDEN CAPABILITIES (powerful but buried)

1. **Start Anywhere (link/image/PDF/Google-pins import)** — the differentiator vs every competitor; reachable only via a small underlined hero line (`hero-quick-input.tsx:152–158`) and planner tabs at `#start-kjerkoli`.
2. **Foreign-plan validator (PlanCheck)** — homepage-only mid-page section; not linked from planner where anxious users are.
3. **Travel-style quiz** — below the 5603-line planner on /nacrtuj.
4. **TTS audio** ("Poslušaj") — appears only when audioScript exists, 5th button in action bar.
5. **ICS export + email itinerary** — same crowded bar.
6. **Go Mode** — mobile-menu secondary list + footer + planner/shared buttons; not in desktop nav.
7. **/potovanje complete journey** — footer-only entry for the core promise.
8. **Primerjava (planner comparison)** — footer-only.
9. **Slovenia Pass** — mobile menu + explore hub only.
10. **Data sources/provenance page** — footer; provenance cards exist on hub (good) but not on lokali/tržnica surfaces (status badges only).
11. **PWA install/offline** — tiny header icons; offline.html fallback.
12. **Map supply "Dodaj v moj načrt"** — requires zoom ≥ threshold + right-rail discovery.
13. **Reservations import (parse email/PDF)** — buried in shared trip page cards.
14. **Trip collaboration/polls/documents/diary/guide/budget** — 6 features stacked below the shared trip timeline; no in-planner pointers.
15. **Consultation (Vprašaj lokalca)** — only on /vodici.
16. **Availability calendar info** — guest sees "Še N prostih mest" in modal only after choosing a date.

---

## 12. MOBILE + DESKTOP PATTERNS

- **Responsive vocabulary (counts across src):** `hidden sm:` ×49, `sm:hidden` ×15, `hidden lg:` ×11, `hidden md:` ×11, `md:hidden` ×2, `lg:hidden` ×2 (hamburger + one more), `max-sm:` ×18 (mostly safe-area paddings). Desktop nav switches at `lg`, CTA/theme at `sm` — two different breakpoints for the same header.
- **Drawers/sheets:** mobile nav = Sheet; wishlist = Sheet; cart = Drawer (vaul); chat = fixed panel; planner day nav = horizontal snap scroll (`planner-day-nav.tsx` snap-start). Dialog everywhere else (24 files).
- **Touch targets:** good — hero chips `py-2.5` (~46px), events pill `min-h-[36px]`, sticky CTA `h-11` (44px), wishlist heart `size-11` (44px), chat FAB `size-14`. **Bad:** chatbot add-to-plan `size-7` (28px), supply ProductCard CTA `h-7` (28px), several `size-4`-icon-only buttons in day headers (remove day `p-1.5`).
- **Overflow risks:** journey-trip EntryRow uses flex-wrap + whitespace-normal after a fixed 17px overflow (comment at line 158–160 admits prior bug); product-card `truncate` chains; events meta wraps; `w-[82vw]` mobile sheet fine; map `h-[500px] sm:h-[600px] lg:h-full`.
- **Desktop-only workflows:** drag-and-drop stop reorder is mouse-only (HTML5 DnD; arrows exist for touch/AT — planner line 4596–4619 comment). Map supply requires zoom (pointer-heavy).
- **Print:** dedicated `@media print` system only for `/pot/[shareId]` (pot-page classes).

---

## 13. LOADING / EMPTY / ERROR STATES

- **Loading:** `Skeleton` used in 16 files; `Loader2`/`animate-spin` in 58 files; `animate-pulse` in 9 — mixed spinner/skeleton/pulse conventions per surface (SmartSearch = skeletons + elapsed-seconds counter + slow hint; moja-potovanja = pulse blocks; marketplace = skeletons; planner = whole-workspace blur + `inert`).
- **Empty states (good ones point to next action):** `/moja-potovanja` EmptyState → "Načrtuj potovanje" CTA; destinations filter empty → "Počisti filtre"; wishlist empty → "Klikni srček…" (weak — no link); planner "Ni rezultatov" states; events/go-mode empty → rebuild instructions. 14 distinct "Ni še…" strings found.
- **Error states:** mostly truthful and localized (SmartSearch K-5 "Iskanje trenutno ni uspelo" + abort; my-trips loadError Alert destructive; owner 503 banners; supply degraded banner "Nič izmišljenega"). Some English leaks in aria labels ("Nalagam..."). Planner generation error keeps old plan usable (TASK 80 inert pattern — good).

**P-STATE-2 — No unified loading/empty/error component family; each of ~58 surfaces rolls its own.**

---

## 14. DESIGN SYSTEM FACTS

- **Tailwind v4** (CSS-first config in `globals.css` `@theme inline`; `postcss.config.mjs` plugin only; no `tailwind.config` file). `tw-animate-css` imported.
- **shadcn/ui: 48 components** in `src/components/ui` (accordion…tooltip incl. sidebar, carousel, chart, input-otp, sonner).
- **Font:** Geist (`next/font/google`, latin-ext), `--font-geist-sans`; mono var declared, unused.
- **Palette (oklch):** primary = deep alpine emerald `oklch(0.43 0.105 158)` (UX-CMP #5 change), terracotta accent `oklch(0.92 0.04 50)` (used by wishlist heart orange-600), amber-400 featured, destructive red. Day colors array in `store.ts:25–40` (14 colors). Semantic status palettes ×3 (§8.11).
- **Radius:** token `--radius: 0.75rem` with sm/md/lg/xl derived; but components freely use `rounded-lg/xl/2xl/3xl/full` (§5) — token mostly bypassed.
- **Dark mode:** `.dark` custom variant + ThemeProvider (`defaultTheme="light"`, `enableSystem`) — full token set present; day colors hardcoded hex (fine, they're data).
- **Shadows:** ad-hoc (`shadow-md`, `hover:shadow-lg`, custom `shadow-[0_4px_24px_-12px…]` glass).
- **Custom CSS utilities:** `.hero-overlay` (3-layer cinematic gradient), `.hero-kenburns`, `.hero-scroll-cue`, `.soft-pulse`, `.text-gradient-brand`, `.gradient-hairline`, `.scroll-area-custom`, `.custom-scrollbar`, leaflet z-index fixes, print system, `body[data-sticky-cta]` FAB lift.
- **i18n:** next-intl, SL default (no prefix) + EN `/en` (as-needed), 50+ fragment files; dual L-object pattern (§8.7).

---

## 15. TOP PROBLEMS (ranked, for redesign planning)

1. **P-CTA-1** — 7 add-to-trip variants, none global (§4.1).
2. **P-NAV-1** — 17/38 pages without main navigation; hub/shared-trip/my-trips islands (§2.4).
3. **Two planners** `/nacrtuj` vs `/potovanje` split the PLAN stage (§8.1).
4. **Dead link `/načrtuj`** on 190 itinerary pages (§9.1) — must fix even before redesign.
5. **P-STATE-1** — trip membership computed 4 ways; no single "V moji poti" truth (§6.2).
6. **P-CARD-1** — ~22 card grammars, 0–3 competing actions (§5).
7. **P-CLUTTER-1** — planner action bar 5 CTAs; homepage 13 blocks; nav 13 controls (§10).
8. **P-SEARCH-1** — SmartSearch & discovery cards don't feed the trip (§7, §9).
9. **P-CTA-2** — wishlist/trip duality without a bridge; destinations/POIs can't be saved at all (§4.2).
10. **Hidden capabilities** — Start Anywhere, validator, audio, ICS, Go Mode, /potovanje buried (§11).

## 16. NEXT ACTIONS (for D8-B/D9 planning; no code changed in this audit)

1. Fix `/načrtuj` → `/nacrtuj` link (one-line, high-value; separate from redesign PR or its first commit).
2. Design the canonical `AddToTrip` primitive + state vocabulary; map all 7 existing variants to it (regression matrix from §4.1 + §3).
3. Unify page shell (Navigation/Footer) on the 17 orphan pages.
4. Merge or clearly re-scope `/potovanje` vs `/nacrtuj` (decision product-level).
5. Introduce single journey store with selectors for saved/added/scheduled/booked states (§6).
6. Card system consolidation pass (§5) and CTA hierarchy (primary = Add-to-Trip; secondary = open; tertiary = book/external).
7. Surface hidden capabilities per §11 with progressive disclosure in the new EXPLORE/SAVE stages.

*End of D8-A audit. All findings are evidence-based on the code as of `ac75070`; no source files were modified.*
