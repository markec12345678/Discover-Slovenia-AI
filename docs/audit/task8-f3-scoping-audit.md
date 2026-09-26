# TASK 8 / ISSUE #8 — FAZA 3 SCOPING AUDIT (F3)

Agent: 38-a (Explore, read-only). Baseline: Faza 1 (v1.112.0, "The Spine") + Faza 2 (v1.113.0, "Zbirka je račun + skupnost") merged per worklog Task 36/37.
Scope: (§1) two planners map + merge options, (§2) loading/empty/error family, (§3) Start Anywhere lift, (§4) wishlist→trip bridge, (§5) recommended Faza 3 scope.
**No source code changed.** All line numbers from current working tree (`itinerary-planner.tsx` = 5,694 lines, `journey-planner.tsx` = 806 lines).

Inputs: worklog.md (Task 36-a…36-e, 36, 37-d, 37-c, 37), docs/audit/task8-d8a-ux-audit.md, docs/audit/task8-d8b-ux-architecture.md, docs/audit/task8-feature-regression-matrix.md ("NAMERNO ODLADNJENO v fazo 3: /potovanje↔/nacrtuj združitev · EN razširitev · Start Anywhere dvig"), D8-B §11 next waves (adds: skeleton/empty/error family rollout, wishlist→trip auto-bridge).

---

## §1 THE TWO PLANNERS (issue §43 "NO PARALLEL APP")

### 1a. What each page renders + entry points

**/nacrtuj — `src/app/nacrtuj/page.tsx` (101 lines, server component)**
- `Navigation solid` (:58) → page header (Badge + h1 + subtitle + USP line, :60–84) → **`ItineraryPlanner`** (`src/components/sections/itinerary-planner.tsx`, **5,694 lines**, :87) → `TravelStyleQuiz` (:90) → `CommunityTrips` in `Reveal` (:93–95) → `Footer` + `Chatbot`.
- Metadata via `plannerPage` fragment; canonical/hreflang via `hreflangForPath` (:30–51).

**/potovanje — `src/app/potovanje/page.tsx` (94 lines, server component)**
- `Navigation` (non-solid, print:hidden, :66–68) → hero section (Badge "Celotno potovanje" + h1 "Eno potovanje, vsi ponudniki" + subtitle, :70–82) → **`JourneyPlanner`** (`src/components/sections/journey-planner.tsx`, **806 lines**, :85) → `Footer` + `Chatbot` (:88–91).
- TASK 58 header comment (:13–23): "CELOTNO POTOVANJE ČEZ VSE PONUDNIKE" — arrival (Brnik, time) → transfer → accommodation → attractions (open sources SI+HR+ME+AL) → events → restaurants → petrol → rental.

**Entry points — `/nacrtuj` (many):** Navigation desktop CTA "Načrtuj z AI" (navigation.tsx:324) + mobile Sheet CTA (:410); MobileTabBar center tab "Načrtuj" (mobile-tab-bar.tsx:98); footer "Načrtuj" + "#kviz" (footer.tsx:67–68); hero quick input `router.push` (hero-quick-input.tsx:69); shared-trip.tsx:769; community-trips.tsx:268; go-mode.tsx:600,1148; sticky-mobile-cta.tsx:79 (home only); legacy-hash-redirect.tsx:19–20 (#načrtuj, #kviz); my-trip-view.tsx:148 ("Nadaljuj načrtovanje"); pot/error.tsx:56; not-found.tsx:53; vodici/[slug]:437; destinacija hub/itinerary/things-to-do/best-time/guide CTA blocks (546/277/324/305/635); primerjava:273; moja-potovanja-view.tsx:280,426; journey-planner handoff `router.push` (journey-planner.tsx:294); PWA shortcut (task75: "AI načrtovalec"); sitemap-urls.ts:111 (priority 0.9).

**Entry points — `/potovanje` (very few):**
- **footer.tsx:78** — "Načrtuj celo potovanje (prevozi, nastanitev, aktivnosti)" in the plan column. **The only global navigation entry.**
- go-mode.tsx:594 — empty-state PRIMARY CTA (no saved plan → "Sestavi potovanje" → /potovanje, secondary → /nacrtuj :600) and go-mode.tsx:1149 — "Nazaj na načrt" for **v1** Go records (v2 records → /pot/[shareId] or /nacrtuj, :1144–1148).
- mobile-tab-bar.tsx:102 — **activation only**: the "Načrtuj" tab lights up when on /potovanje, but no tab/sheet link points TO /potovanje (Sheet = 5 navLinks + 5 secondaryLinks, navigation.tsx:40–67 — /potovanje absent).
- sitemap-urls.ts:119 (priority 0.8) + EN whitelist routing.ts:83 (with comment: "jedro lijaka za tuje turiste").
- **Homepage: zero links to /potovanje** (grep `potovanje|nacrtuj` in app/page.tsx → no matches; hero routes to /nacrtuj).

### 1b. Overlap vs unique capabilities

**Overlap (both pages do "planning"):**
- Origin/destination/date/travelers form (journey-planner.tsx:218–266 vs planner form formData).
- Product selection with honest truth badges (journey price/booking badges :183–211 vs supply product-modal truth rows).
- Canonical AddToTripButton on both (see §1d).
- Map view (JourneyMap journey-planner.tsx:516–521 vs planner map tab).
- Go Mode launch (journey `startGoMode` :302–306, V1 record, vs planner "Zaženi Na poti" action bar → itinerary-go.ts V2 record).
- A "MY TRIP" timeline view (JourneyTrip inside /potovanje vs planner workbench + /pot/[shareId] timeline).
- Weather per day (JourneyTrip TASK 66 chips vs itinerary weather).
- Audio day summaries (JourneyTrip TASK 91 vs planner Poslušaj).

**UNIQUE to /potovanje (must survive ANY merge — zero feature loss):**
1. **Supply search across all providers** — `/api/journey/plan` → `lib/journey/orchestrator.ts` (789 lines: searchSupply + Kiwitaxi transfers + local transfer inventories + open-source attractions (FSQ/OSM, TASK 63) + EVENTS + restaurants + petrol + rental affiliates).
2. **7 category columns** — transfer/accommodation/attractions/events/restaurants/petrol/rental (journey-planner.tsx:173–181 `ALL_CATS`), toggleable chips (:438–458).
3. **Supply truth badge vocabulary** — OD CENA / CENA NEZNANA / CENA VIRA / LIVE · NA VOLJO / LIVE · NI NA VOLJO / RAZPOLOŽLJIVOST NEZNANA / REZERVACIJA PRI PONUDNIKU / SAMO INFORMACIJA / SAMO POVEZAVA PARTNERJA (:97–112, priceBadge :183–200, bookingBadge :202–211).
4. **JourneyMap with pin status tiers** (§13; mapProducts :332–339, selected-state pin override).
5. **Vehicle-class chips for transfers** (real source data, :651–667) + **earliest-arrival computation** (arrival time + transfer duration, :142–147 + :502–509).
6. **JourneyTrip confirmation document** (§21) — printable Trip/Traveler/Provider/Booking ID/Date/Time/Location/Duration/Price/Status/Provider link/Cancellation table; print mode hides the rest (:312–322, journey-trip.tsx).
7. **Journey totals semantics** (§16) — confirmed/known/estimated (od-cene) grid + describeTotals (:736–770).
8. **Supply health strip** (TASK 74 §22) — which sources failed, fail-closed honesty (journey-trip.tsx:63–69).
9. **Petrol prices category + rental affiliate provider cards** (cat.providers, :553–574).
10. **"Nadaljuj v načrtovalnik" handoff** (FIXED semantics — AI never silently replaces user selection, :287–295 + hint :125–132).
11. External handoff lifecycle evidence on every product card CTA (recordExternalHandoff, :679–699).

**UNIQUE to /nacrtuj (the product core):** AI itinerary generation (/api/itinerary), refine loop (itinerary-refiner), AI controls (planner-ai-controls), full editing (drag/drop stops, add/remove days, undo history), **Start Anywhere imports** (#start-kjerkoli tabs: link/image/PDF/pins, :2961–3023), NL quick input (:2902–2959), quiz + community trips on-page, supply-selection chips panel with FIXED/PREFERRED/SUGGESTED cycling (:3886–3945), save & share (SavedItinerary + editToken + shareId), PDF/ICS/email exports, per-day booking panels, events add-to-plan (itinerary-events write-through), "Več o tvoji poti" extras, PlannerMyTripStrip ("Iz moje poti" collection strip, :2901).

### 1c. Handoff mechanics — `dai:supply-selection`

- **Writers:**
  - `journey-planner.tsx:287–295` — `handoff()`: `journeyProductsToSelection(selectedProducts, lang)` → `useAppStore.getState().setSelectedProducts(items)` **AND** `persistSelection(items)` → `router.push("/nacrtuj")`. Dual write covers same-session SPA nav (store) + reload/new tab (sessionStorage).
  - `lib/supply/selection.ts:84,126` — add/remove from map surfaces (product-modal/product-card write-through).
  - `itinerary-planner.tsx:3908–3917` — chip state cycling/removal in the planner's selection panel.
  - `planner-my-trip-strip.tsx:297–298` — products from the My Trip collection → selection (same canonical dual-write).
- **Reader:** `lib/store.ts:73` — `useAppStore` initial state = `readPersistedSelection()` (validates provider/providerProductId/title, selection-persist.ts:16–34).
- **Shape:** `SelectedProviderProduct[]` — `{provider, providerProductId, type, title, lat?, lng?, locationName?, price?, availability?, source (label from registry), bookingUrl?, selectionState:"fixed"}` (handoff.ts:43–58). **Events excluded** (:39 — not bookable products), dedupe by canonical id (:40–42).
- **Consumption:** planner chips panel (itinerary-planner.tsx:3891–3945) + AI prompt context `buildSelectedProductsContext` (api/itinerary/route.ts:505, blocks at :697/:748) + refiner (itinerary-refiner.tsx:289–291) + AI controls (planner-ai-controls.tsx:278–281).
- One-way only: no mechanism carries planner state back to /potovanje.

### 1d. "Dodaj v mojo pot" (AddToTripButton) surfaces per planner (after Faza 1+2)

- **/nacrtuj:** no direct AddToTripButton inside ItineraryPlanner's own cards; collection touchpoints are (a) `PlannerMyTripStrip` above the form (:2901 — collection→planner bridge, NOT an add button), (b) itinerary-events write-through (event toggle → addMyTripItem, add-only), (c) supply selection panel does NOT write to the collection (SCHEDULED layer by design, D8-B §2).
- **/potovanje:** controlled AddToTripButton write-through on **every** product card (journey-planner.tsx:632–646; `added={isSelected}`, toggle adds/removes BOTH the journey selection (`toggleProduct`) AND the collection (`addMyTripItem`/`removeMyTripItem`); events excluded :623).
- Both pages share: Navigation (invisible MyTripAccountSync driver from F2-A), MobileTabBar ("Moja pot" count badge), Chatbot (PlaceRow canonical 44px add, chatbot.tsx:448).

### 1e. Tab bar / Navigation wiring

- MobileTabBar "Načrtuj" tab → `/nacrtuj` (mobile-tab-bar.tsx:97–103); `/potovanje` only ACTIVATES that tab (match: `p === "/nacrtuj" || p.startsWith("/potovanje")`, :102; header comment :29 "oba načrtovalnika — D8-B IA: PLAN"). No tab, no Sheet link, no desktop nav link, no homepage link points TO /potovanje — **footer + Go Mode only** (§1a). So a mobile user who lands on /potovanje sees "Načrtuj" highlighted, but can never discover /potovanje from the tab bar; a user on /nacrtuj has no path to /potovanje at all.

### 1f. Duplicate trip model? — YES (partial, one-way mirrored)

Five coexisting representations of "the user's trip":
1. **JourneyPlanner `selected` Set<string>** (journey-planner.tsx:227) — ephemeral React state; `journey` itself is React state, **lost on reload** (admitted in go-persist.ts:4 comment) and **cleared on every new search** (`setSelected(new Set())`, :260).
2. **`dai:my-trip-items`** collection (canonical since Faza 1) — written one-way from /potovanje via the controlled button (:632–646).
3. **`dai:supply-selection`** (sessionStorage) + `useAppStore.selectedProducts` — the /nacrtuj FIXED-selection channel.
4. **`dai:go-trip`** (localStorage; V1 = journey+selectedIds from /potovanje, V2 = itinerary MyTripView+shareId from /nacrtuj — go-persist.ts:25–52).
5. **/nacrtuj itinerary state** — `useAppStore.itinerary` + `discoverslovenia_last_itinerary` + server `SavedItinerary` + `dai:my-trips` list.

**Drift scenarios (real, verifiable):**
- **DRIFT A:** new `plan()` clears `selected` (:260) but does NOT remove previously written `dai:my-trip-items` → /moja-potovanja keeps showing products "V moji poti" that /potovanje no longer shows selected.
- **DRIFT B:** removing an item from the collection on /moja-potovanja does not un-select it on /potovanje (controlled button never listens to `dai:my-trip-changed`; no reverse sync).
- D8-B §2 "No second planner, no duplicate trip model (issue §43)" is honored at the COLLECTION layer (kind:refId identity), but /potovanje still keeps its own selection+tour model that only one-way mirrors into the collection.

### MERGE OPTIONS (evaluate: ZERO FEATURE LOSS · SEO · effort)

**Option A — "Supply-companion reframe" (keep both routes, one visible flow)**
- Changes: reframe /potovanje in copy/labels as the **supply/logistics step of the ONE planner** (e.g. hero: "Ponudniki in logistika za tvoj načrt"); add quiet cross-links both directions — /nacrtuj gets an honest "Iščeš prevoz, nastanitev, realne cene? → Celotno potovanje" line (near the supply chips panel :3886 or in the Več overflow), /potovanje already hands off to /nacrtuj; optionally prefill the journey form destination from `dai:my-trip-items` destinations (same read pattern as PlannerMyTripStrip); add /potovanje to the mobile Sheet secondaryLinks (navigation.tsx:58–67).
- Zero loss: **YES** — routes, components, APIs, storage keys untouched.
- SEO: **positive** — /potovanje gains its first internal links beyond footer (currently footer-only; sitemap priority 0.8 with no in-content links pointing at it).
- Effort: **LOW** (labels + 3 links + 1 prefill + tests).
- Residual: two URLs still exist — but framed as one flow (user sees "Načrtuj" tab on both; mobile-tab-bar.tsx:102 already implements this framing).

**Option B — "Full absorption" (columns move into /nacrtuj; /potovanje redirects)**
- Changes: JourneyPlanner becomes a supply step/section of ItineraryPlanner; /potovanje 301 → /nacrtuj#ponudniki; sitemap/hreflang/EN whitelist/footer/Go Mode v1-record backlinks all updated; handoff becomes in-page state; JourneyTrip + confirmation doc + supply health + totals all need a home in the 5,694-line planner.
- Zero loss: **achievable but highest-risk** — the planner is already D8-A's most cluttered surface (~15 stacked sections); adding 800 lines of supply columns worsens P-CLUTTER-1 unless a tab/step restructure is done simultaneously; Go Mode V1 records and print CSS must keep working.
- SEO: **medium risk** — retires a ranked, EN-whitelisted, sitemap-listed URL ("celotno potovanje po Sloveniji" head terms); 301 passes equity but the page disappears; contradicts D8-B §1 "Routes stay as-is (SEO contracts preserved, issue §51)".
- Effort: **HIGH** (UI restructure + redirect matrix + test migration + analytics).
- Verdict: defer — not a "measured" Faza 3 move; revisit only with evidence that users treat /potovanje as a dead end (funnel data).

**Option C — "One label, two doors + bidirectional bridge" (compatibility hardening)**
- Changes: keep both surfaces; unify user-facing vocabulary (both are "Načrtuj" family — already true on mobile via tab activation); make the mirror **bidirectional and reconciled**: on JourneyPlanner mount, hydrate `selected` from `isInMyTrip` (collection = source of truth for the mirror) and/or reconcile on `dai:my-trip-changed`; fix DRIFT A (new plan() either preserves collection — collection ≠ selection — or shows honest notice); add the reverse link /nacrtuj→/potovanje.
- Zero loss: **YES** (behavior fixes only).
- SEO: **no loss**, better internal linking.
- Effort: **LOW–MEDIUM** (sync semantics + tests for drift scenarios).

**Recommendation: A + C combined** (reframe + cross-links + prefill + drift reconciliation), with **B explicitly deferred** to a data-informed decision after Faza 3. This satisfies §43 (one visible planner, `dai:my-trip-items` as the single collection truth) without touching a single SEO contract.

---

## §2 LOADING / EMPTY / ERROR STATE FAMILY (issue §31/§32/§33, D8-A P-STATE-2)

### 2a. Does a unified family exist? — NO

- Only shared primitive: `src/components/ui/skeleton.tsx` (15 consumer files in src/components).
- **7 separate local `EmptyState` implementations**: marketplace.tsx:1056, events-calendar.tsx:419, booking-panel.tsx:548, listings.tsx:554, destinations.tsx:658, app/owner/dashboard/page.tsx:680, app/moja-potovanja/moja-potovanja-view.tsx:566.
- No `LoadingState`/`ErrorState` component anywhere; no shared grammar (icon+title+desc+CTA vs plain text vs dashed box vs amber row vs destructive Alert).

### 2b. Patterns currently in use (counts, current tree)

- `Skeleton` import: 15 files (components) — marketplace, listings, weather-widget, go-mode, destination-modal, experience-modal, product-modal(s), ask-local, collection-modal, my-orders, sponsorship-panel, review-section, itinerary-planner, sidebar.
- `Loader2`/spinner: 49 files (components) — incl. journey-planner, smart-search, chatbot, all trip-* cards, plan-copilot, planner-ai-controls, consultation-dialog…
- `animate-pulse`: 8 files (smart-search, chatbot, map-section, shared-trip, insights-panel, planner-leg-suggestions, validator-telemetry, skeleton itself).
- Error grammars: amber text row `role="alert"` (smart-search.tsx:251–259); destructive `Alert` + retry (itinerary-planner.tsx:2750–2766; moja-potovanja-view.tsx:384–390); dashed destructive box + retry (listings.tsx:222–229); plain red `<p role="alert">` (journey-planner.tsx:470–474); owner 503 banners; supply degraded banner.
- Loading grammar gold standard already in-repo: planner generation status bar — real elapsed time + phase (`generatingStage`), cancel button, `role="status" aria-live="polite"`, skeletons `aria-hidden`, old plan blurred + `inert` + `aria-busy` (itinerary-planner.tsx:2685–2748, 4031–4048; TASK 77/80). SmartSearch follows a close variant (3 pulse rows + spinner + elapsed seconds + slow hint ≥5 s, smart-search.tsx:268–292).

### 2c. "Nalagam…" leaks (D8-A §13) — exact locations

Hardcoded Slovenian (never localized — correct on SL pages, latent leak the moment EN extends):
- aria-labels: moja-potovanja-view.tsx:271,394 ("Nalagam potovanja"), my-orders-section.tsx:478,520 ("Nalagam naročila/rezervacije"), owner/sponsorship-panel.tsx:296, prijava-view.tsx:128 ("Nalagam").
- Visible text: marketplace.tsx:453,465 ("Nalagam izdelke/izkušnje..."), listings.tsx:205 ("Nalagam lokale..."), shared-trip.tsx:79 ("Nalagam zemljevid…"), trip-diary.tsx:907, trip-polls.tsx:613, trip-collaboration.tsx:611, admin-dashboard.tsx:1745,2516,2619, join-us.tsx:642, owner/dashboard/page.tsx:369,1963.
- All of these live on **SL-only routes today** (moja-potovanja, trznica, lokali, pot, auth, owner/admin — none on the EN whitelist, routing.ts:59–88), so no live EN leak; the planner/SmartSearch/map surfaces on EN-whitelisted routes are properly bilingual (map-view.tsx:110, provider-panel.tsx:54, SmartSearch L). **Consequence: F3-B (i18n-safe states) is a hard prerequisite for F3-E (EN extension).**

### 2d. Top user-visible async surfaces — what each does today

| # | Surface | Loading | Empty | Error |
|---|---|---|---|---|
| 1 | SmartSearch (nav, all pages) | 3 pulse rows + spinner + elapsed s + slow hint ≥5 s | "Ni zadetkov za…" centered | amber row role=alert (K-5 truthful) |
| 2 | /nacrtuj AI generation | **GOLD**: status bar w/ stages+elapsed+Cancel, skeletons, old plan blurred+inert | demo-preview empty card (:2768+) | destructive Alert + retry |
| 3 | /potovanje journey search | button spinner "Iskanje po virih …" (:460–468) only | count "0" per category | plain red text (:470–474) |
| 4 | /moja-potovanja | 2× pulse blocks + hardcoded aria (:271,394) | EmptyState + CTA /nacrtuj (:276–282, :421–428) | destructive Alert (:384–390) |
| 5 | /trznica marketplace | Product/ExperienceSkeleton grids + "Nalagam…" tab text (:453–515) | local EmptyState (:1056) | degraded banner (supply) |
| 6 | /lokali listings | 6× ListingSkeleton + counter text (:216–221) | local EmptyState (:554) | dashed destructive box + retry (:222–229) |
| 7 | /zemljevid map-view | POI spinner row "Nalagam POI-je…" bilingual (:1231–1232) | honest empty POI states | source-status badges |
| 8 | weather-widget | 3 Skeleton pieces (:79–84) | honest absence | silent absence (by design) |
| 9 | chatbot | "thinking" text + pulse dots (:1264) | — | red retry chip (:1300) |
| 10 | /dogodki events-calendar | none needed (static dataset, client filter) | "Ni dogodkov za izbrane filtre" + EmptyState (:184–193) | n/a |
| 11 | /destinacije | none needed (static + client filter) | EmptyState + "Počisti filtre" (destinations.tsx:658) | n/a |
| 12 | destination/experience/product modals | skeleton lines (destination-modal; supply product-modal :462–464) | honest unknowns | availability badges |
| 13 | /pot/[shareId] shared-trip | text-only "Nalagam zemljevid…" (shared-trip.tsx:79) for dynamic map | — | live-sync banner variants |
| 14 | /na-poti go-mode | geolocation states + skeletons | **2-CTA empty state → /potovanje + /nacrtuj** (:592–605) | GPS status vocabulary |
| 15 | JourneyTrip weather/audio chips | honest absence per day (TASK 66/91) | no chip without date/forecast | source-failure note, not error |

**Surfaces with NO deliberate loading behavior (sudden swap / blank):** /potovanje category columns (results appear at once after spinner — no skeletons); shared-trip map import (text only); wishlist sheet + MyTripView (synchronous — fine); /dogodki, /destinacije, /vodici (SSG/static — fine, no loading needed).

### 2e. Rollout candidates (priority order)

1. **The family itself**: `src/components/states/` — `LoadingState` (spinner+label+optional skeleton rows, `role="status" aria-live="polite"`), `EmptyState` (icon+title+desc+CTA ≥44px), `ErrorState` (destructive or amber variant + retry), L-pattern SL/EN, i18n-safe (no hardcoded strings) — modeled on the planner status bar (2b gold standard).
2. /potovanje search + category columns (biggest gap on a core page).
3. /moja-potovanja (unify + fix hardcoded aria).
4. /trznica marketplace (already good — adopt family, keep skeletons).
5. /lokali listings (adopt family).
6. map-view POIs + shared-trip map import.
7. wishlist sheet empty + MyTripView (empty grammar w/ next-action CTA — D8-A §13 "wishlist weak, no link").
8. chatbot thinking states.
9. go-mode (mostly good — align visuals).
10. journey-trip / trip-* cards (SL-only surfaces; needed only as EN-extension prep).

---

## §3 START ANYWHERE (issue §25)

### Current access points (verified)

1. **Homepage hero secondary line** — hero-quick-input.tsx:147–159: "Imaš že svoje vire? Začni od drugje — povezava, slika, PDF ali Google pins" (sl.json:40 / en.json:40) → `{prefix}/nacrtuj#start-kjerkoli`. Deliberately secondary (Issue #3: dominant input stays the single AI question; HIDE ≠ DELETE).
2. **Planner block** — itinerary-planner.tsx:2971–3023 (`id="start-kjerkoli"`, scroll-mt-130): **4 tabs** — Povezava (link paste, F5.4), Slika (image/VLM, F8), PDF (D3), Google pins (F14). Mount handler (:944–957) expands the form (`setFormExpanded(true)`) + smooth-scrolls when hash = `#start-kjerkoli`/`#start-anywhere` — needed because a restored plan leaves the form collapsed.
3. **NOT anywhere else**: MobileTabBar "Načrtuj" → plain /nacrtuj (no hash); Navigation CTA → plain; footer plan column has `/nacrtuj#kviz` but **no #start-kjerkoli** (footer.tsx:67–68); mobile Sheet — nothing; quiz/community — nothing.

### "Measured lift" options (lift ≠ hero; import must NOT become the main homepage action)

1. **Above-the-fold visibility on /nacrtuj itself**: the import block only shows when the form is expanded; with a restored plan it is one expand-click + scroll away. Add the 4-tab row (or a compact "Začni s svojimi viri →" toggle) to the always-visible form header — the planner is where intent already lives. (Lowest risk, highest relevance.)
2. **Footer parity**: add `{ href: "/nacrtuj#start-kjerkoli", key: "planStartAnywhere" }` next to planQuiz (footer.tsx:67–68 pattern) — footer is the only place /potovanje is discoverable today; Start Anywhere deserves the same floor.
3. **Mobile "Več" sheet**: add "Začni kjerkoli" (→ /nacrtuj#start-kjerkoli) to secondaryLinks (navigation.tsx:58–67) — mobile users currently have zero non-hero path.
4. **Planner page USP row**: nacrtuj/page.tsx:79–82 shows one Wand2 USP line; add a second quiet line with the same anchor ("Imaš že svoje vire? Povezava, slika, PDF ali Google pins") — same wording as the hero line, one vocabulary.
5. **Homepage (optional, stays secondary)**: keep the line under the chips but ensure it survives on mobile (text-xs — verify tap target ≥44px height via py padding); do NOT promote into the input row.
6. **Measurement hook**: planner-analytics already fires session events (plannerSessionId, fireStartedOnce :2922) — add an ingest-mode attribution counter so lift success is measurable (imports per session by entry point).

Recommended: 1 + 2 + 3 + 4 (+6 for measurement). All zero-loss; none touch the hero hierarchy.

---

## §4 WISHLIST→TRIP BRIDGE (architecture §11 "wishlist→trip auto-bridge suggestions")

### Current state

- **Storage**: `dai:my-wishlist` localStorage, FIFO 60 (lib/wishlist-storage.ts:18–19); `WishlistEntry {id, type: experience|product, name, image, price, destination (free text), slug, savedAt}` (:38–49); sync via `dai:wishlist-changed` + cross-tab storage event (:184–196); modal-open via `dai:open-from-wishlist` + pending key `dai:wishlist-pending-open` → /trznica (:207–227).
- **Components**: `WishlistHeartButton` (wishlist-sheet.tsx:67–120; terracotta heart, used on marketplace product+experience cards marketplace.tsx:717,887, experience-modal.tsx:333, product-modal.tsx:244); `WishlistSheet` (nav heart + count badge + right panel, :127–234); empty state = "Ni še nič shranjenega. Klikni srček…" (weak, no link — D8-A §13).
- **What D8-D already covered** (the manual bridge): every wishlist row carries the canonical AddToTripButton (compact ≥sm + icon on mobile, wishlist-sheet.tsx:322–331) mapped by `wishlistTripItem` (:242–258) — kind = entry.type, refId = entry.id, href fallback /trznica, source 'priljubljene'; identity `kind:refId` dedupes against marketplace adds.

### Gap analysis — what auto-bridge would ADD beyond the manual per-row add

1. **No aggregate action**: nothing turns the whole wishlist into planning input — no "Sestavi pot iz priljubljenih" (group by destination → prefill planner destinations + selection, exactly what PlannerMyTripStrip does for dai:my-trip-items).
2. **No proactive suggestion**: the app never notices "3 priljubljene stvari so na Bledu" (§11 "auto-bridge suggestions"); no nudge on /moja-potovanja or /nacrtuj, no wishlist count anywhere outside the nav heart.
3. **No destination normalization**: `entry.destination` is free text (wishlist-storage.ts:45) — a bridge needs the same id/slug resolution PlannerMyTripStrip already implements (destinationIdOf, planner-my-trip-strip.tsx:146–149).
4. **No awareness between the two "save" systems**: heart (Shrani) and AddToTrip (V moji poti) are intentionally distinct vocabularies (D8-B §2), but nothing communicates "všeč ≠ v poti" — no gentle upsell from saved → added.
5. **No server reflection for wishlist**: F2-A reflected dai:my-trip-items to UserTripItem; wishlist remains device-local (honest footer note "Shranjeno lokalno v tvojem brskalniku", wishlist-sheet.tsx:226–230).
6. **Scheduling must stay out of scope**: auto-bridge should stop at the COLLECTION/prefill layer (D8-B §2: planner remains the scheduling truth — no silent AI generation, same rule as PlannerMyTripStrip "NO silent AI", planner-my-trip-strip.tsx:47–48).

### Concrete auto-bridge shape (recommended)

- "Iz priljubljenih" strip (or section) inside MyTripView + a compact variant on PlannerMyTripStrip: group wishlist entries by resolved destination → chips with counts → "Uporabi v načrtu" fires the SAME `dai:my-trip-prefill` CustomEvent + per-item quick-add to collection (reuse wishlistTripItem).
- Optional suggestion toast/banner when ≥3 wishlist entries share a destination (rate-limited, dismissible).
- Honest fallback for unresolvable destination text (chip without prefill, link to /trznica).
- Effort: LOW–MEDIUM; zero-loss; no new storage keys (reads dai:my-wishlist only).

---

## §5 RECOMMENDED FAZA 3 SCOPE (dependency order)

1. **F3-A — Planners: one flow, bidirectional bridge (Option A+C)** — the §43 decision. Reframe /potovanje copy as the supply/logistics step of the one planner; cross-links both ways (/nacrtuj ↔ /potovanje; /potovanje into mobile Sheet secondaryLinks); journey-form destination prefill from my-trip destinations; **fix DRIFT A/B** (hydrate/reconcile journey `selected` from `isInMyTrip`; new-plan() no longer silently strands collection items). Defer full absorption (Option B) with an explicit data decision. Tests: source-contract (links/labels/prefill) + drift scenarios (functional, task8-my-trip-core pattern).
2. **F3-B — Unified state family + top-10 rollout** — build `states/` components (§2e); roll out in priority order; eliminate hardcoded "Nalagam" strings (aria + visible) via L-pattern/t(); adopt planner status bar as the canonical loading grammar. **Prerequisite for F3-E.**
3. **F3-C — Start Anywhere measured lift** (§3 recs 1–4 + measurement counter; hero untouched).
4. **F3-D — Wishlist auto-bridge** (§4 concrete shape; collection-layer only, no silent scheduling).
5. **F3-E — EN extension of SL-only surfaces** (only after F3-B; each surface individually gated by isEnRoute + bilingual states).

Dependencies: F3-A sets the one-planner frame the other waves render inside; F3-B before F3-E; F3-C and F3-D are independent small waves that can run in parallel with F3-B. All waves keep ZERO FEATURE LOSS posture (regression matrix update + source-contract tests per established pattern).

---

*Audit artifacts: this file only. No source changes. Evidence greps preserved in session; counts re-runnable via rg (Skeleton=15 files, animate-spin=49, animate-pulse=8 in src/components).*
