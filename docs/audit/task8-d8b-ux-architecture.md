# TASK 8 — D8-B UX ARCHITECTURE (v1.112.0 "The Spine" + phased plan)

Inputs: D8-A audit (`task8-d8a-ux-audit.md`), benchmark matrix (`task8-benchmark-matrix.md`), research docs 1+2.
Core principle: **Hide complexity — never remove capability.** One simple travel journey on top of the full platform.

---

## 1. INFORMATION ARCHITECTURE (user-facing)

```
DISCOVER  →  EXPLORE            →  SAVE         →  ADD            →  PLAN                →  GO
"Kaj želiš   destinacije, zemljevid,   Shrani (srček)   + Dodaj v mojo pot   /nacrtuj = NAČRTOVALNIK   /na-poti (Go Mode)
doživeti?"   dogodki, lokali,       (ideje)          (Moja pot —        /potovanje = ponudniška      /pot/[shareId] (dela pot
/ hero +     doživetja, tržnica,                     zbirka, ne         spremljevalnica)              z družino)
entry row    vodiči, SmartSearch                      razpored!)
```

- The user never needs to know what SmartSearch/Journey are internally (issue §58).
- Routes stay as-is (SEO contracts preserved, issue §51). IA is expressed through **navigation, cards, CTAs and states**, not route renames.

## 2. STATE MODEL — one visible lifecycle (issue §40)

| State | Vocabulary (SL/EN) | Where true | Visual |
|---|---|---|---|
| Discovered | (card visible) | any discovery surface | base card |
| Opened | (visited) | detail/modal | — |
| **Saved** | Shrani / Save | wishlist `dai:my-wishlist` (experiences/products) | srček, terracotta fill |
| **Added to trip** | **V moji poti / In my trip** | **NEW `dai:my-trip-items` store** | emerald filled pill ✓ |
| Scheduled | Načrtovano / Planned | planner itinerary (addedEvents/selection/stops) | subtle "V načrtu" chip |
| Booked | Rezervirano / Booked | bookings/orders state | existing badge systems |
| On the way | Na poti | Go Mode `dai:go-trip` | existing |
| Completed | Opravljeno | Go Mode progress | existing |

**Rule:** Shrani ≠ V moji poti ≠ Načrtovano ≠ Rezervirano — never conflated (issue §40). The my-trip store is the *collection* layer (ADD); the planner remains the *scheduling* layer (PLAN). No second planner, no duplicate trip model (issue §43): the store holds lightweight references + display data only; scheduling truth stays in the itinerary.

## 3. ADD-TO-TRIP — canonical system (fixes P-CTA-1 + P-STATE-1)

### 3.1 Domain lib `src/lib/my-trip.ts` (pure, SSR-safe, framework-free)
- `MyTripItem = { kind: 'destination'|'poi'|'listing'|'event'|'experience'|'product'|'guide'|'community'|'import'|'ai', refId: string, title: string, subtitle?: string, href: string, image?: string, addedAt: number, source?: string }`
- Identity: `kind:refId` (dedupe on add → idempotent).
- Storage: localStorage `dai:my-trip-items` (cap 200, FIFO overflow, honest toast "Najstarejša ideja zamenjana").
- Cross-tab/panel sync: custom event `dai:my-trip-changed` (existing wishlist pattern `dai:wishlist-changed`).
- API: `getMyTripItems()`, `addMyTripItem(item): {added:boolean}`, `removeMyTripItem(kind,refId)`, `clearMyTripItems()`, `isInMyTrip(kind,refId)`, `myTripCount()`, `MY_TRIP_STORAGE_KEY`, `MY_TRIP_CHANGED_EVENT`.
- React binding `src/hooks/use-my-trip.ts` (client): `useMyTrip()` → items, count, isIn(kind,refId), add, remove; subscribes to event + storage; hydration-safe (initial render = empty, sync in effect → **no hydration mismatch**; same pattern as wishlist).
- No PII. No server round-trip in v1 (guest-first; server reflection = later phase with trip claim).

### 3.2 Canonical primitive `src/components/add-to-trip-button.tsx`
- Props: `item: MyTripItem`, `variant: 'full' | 'compact' | 'icon'`, `className?`.
- States: idle → `+ Dodaj v mojo pot` (icon variant: Plus icon, aria-label full); added → `V moji poti ✓` (emerald, `aria-pressed="true"`); click when added → toast with `Odpri pot` action → `/moja-potovanja#moja-pot` (and on /moja-potovanja itself: scrolls/highlights).
- Touch target ≥44px in all variants (`min-h-11` full/compact; icon variant `size-11`).
- i18n: internal `L = {sl, en}` (dominant portable pattern, e.g. wishlist-sheet) — locale from `useLocale()` (next-intl) with `'sl'` default.
- Toast on add: "Dodano v mojo pot" + action "Odpri pot" (existing sonner Toaster).
- Visual grammar: primary emerald outline → filled when added (distinct from wishlist terracotta heart and from scheduled gray chip).

### 3.3 Write-through adapters (map all 7 existing variants — audit §4.1)
| Existing variant | v1.112 mapping |
|---|---|
| 1. events "Dodaj v mojo pot" (planner) | unchanged mechanics (addedEvents = SCHEDULED) + item registered in store with scheduled display "V načrtu" in Moja pot |
| 2. product-modal "Dodaj v moj načrt" (map) | button relabels to canonical, keeps `addProductToSelection` AND registers item (write-through) |
| 3. product-card "V načrt" (map panel) | same write-through, compact variant |
| 4. journey-planner "Dodaj v načrt" | registers item (selection mechanics unchanged) |
| 5. chatbot icon "+" | visual upgrade to canonical compact/icon (44px, labeled aria), handlers unchanged |
| 6. destination-modal "Zgradi novo pot okoli X" | stays (advanced, full regeneration) + NEW canonical full-variant button above it: add destination itself to Moja pot |
| 7. planner-leg-suggestions "Dodaj" | unchanged (scheduling-context micro action) |
| SmartSearch rows | NEW compact add (fixes P-SEARCH-1) |
| /dogodki EventCard, /lokali ListingModal, destination hub + things-to-do, guides/blog, consultation partner cards | NEW canonical adds (fix dead ends §9.2,4,5,8,9,11) |
| WishlistSheet rows | NEW "Dodaj v mojo pot" (bridge, fixes §9.7) |
| Community trip card | v1: "Odpri" preserved; fork-into-planner = later phase (honestly documented) |

## 4. MOJA POT — the collection view (`/moja-potovanja`)

New section at top of `/moja-potovanja` (id=`moja-pot`), shown when items exist:
- Title "Moja pot" + count; grouped by kind (Destinacije / Lokali in POI / Dogodki / Doživetja / Izdelki / Ostalo).
- Row: image/thumb (or kind icon), title, context line, `Odpri` (href) + `Odstrani`; scheduled items get subtle "V načrtu" chip.
- Primary CTA: **Nadaljuj načrtovanje** → sets sessionStorage `dai:my-trip-handoff` (items payload) → `/nacrtuj` (established handoff pattern like `heroQuery`).
- Empty state (when zero items AND no saved trips): unified empty with "Razišči" CTA → `/destinacije` (issue §32).
- Existing sections (Moja potovanja list, consultations, orders) unchanged below — zero loss.

## 5. PLANNER INTEGRATION (`/nacrtuj`)

- **"Iz moje poti" strip** (client, above the form, visible only when store non-empty OR handoff present): chips with item titles + "Uporabi v načrtu" (destinations → prefill destination chips; events → `addedEvents` after generation or immediate if itinerary exists; experiences/products → existing `selectedProducts` context strip; poi/listing → chat-stash-equivalent context notes) + "Počisti". Honest labels, no silent regeneration.
- **Action bar declutter:** 5 CTAs → primary `Shrani in deli` + secondary `Na poti` (Go) + overflow `Več` menu (E-pošta, .ics, Poslušaj when audio, Natisni). All actions preserved (issue §42) — regression-checked by tests.

## 6. NAVIGATION & SHELL

### 6.1 Shell unification (fixes P-NAV-1 — 17 orphan pages)
All public pages render `Navigation` (solid) + `Footer`: `/destinacija/[slug]` + 4 subroutes, `/pot/[shareId]`, `/moja-potovanja`, `/primerjava`, `/konzultacija/[token]`, `/prijava`, `/preverba-emaila`, `/reset-gesla`, `/pozabljeno-geslo`, `/o-strani`, `/kontakt`, `/vir-podatkov`, `/zaupanje-in-varnost`, `/pogoji-uporabe`, `/politika-zasebnosti`. Page-specific headers become content (breadcrumbs stay on destination pages). `LanguageToggle` floating pill is removed **only where Navigation's LanguageSwitcher now covers the same action** (EN-whitelisted pages); on SL-only pages keep behavior honest (no EN version exists — switcher already hides; toggle removed there too after verifying it adds no capability). LanguageSwitcher whitelist unchanged (no fake EN).

### 6.2 Mobile bottom tab bar (new `src/components/mobile-tab-bar.tsx`)
- Visible `<lg` on pages with the shell; 5 tabs: **Razišči** (/destinacije) · **Zemljevid** (/zemljevid) · **Načrtuj** (/nacrtuj, center, emphasized) · **Moja pot** (/moja-potovanja, count badge = store count) · **Več** (opens the existing full mobile Sheet menu — all 13 destinations preserved).
- Chat FAB lifts above the bar (existing `data-sticky-cta` mechanism reused/renamed).
- `StickyMobileCTA` retired on shell pages (its "Načrtuj z AI" = tab; "Za ponudnike" = Več + footer) — kept on non-shell surfaces (owner/admin) if any use it.
- Active state from pathname; safe-area padding `pb-[env(safe-area-inset-bottom)]`; 44px+ targets; sr-only labels.

### 6.3 Desktop
- Header unchanged (5 links + right controls) — already lean; "Za ponudnike" ghost stays.
- Extra space → map+list and timeline+map already exist; card grids widen (audit §28 satisfied by existing responsive work).

## 7. HOMEPAGE HIERARCHY (issue §7 — declutter, zero loss)

New order (all 13 blocks preserved, positions adjusted):
1. Hero: "Kaj želiš doživeti?" + HeroQuickInput (8 intent chips + Start Anywhere link)
2. **Nadaljuj svojo pot** (WelcomeBackWrapper — raised; also shows Moja pot count + last itinerary)
3. Entry row: Narava · Hrana · Mesta · Doživetja · Dogodki (visual chips → existing sections/routes: /destinacije?tema=…, /lokali, /destinacije?mesta, /dozivetja, /dogodki)
4. DestinationsSection (featured 6)
5. ExperiencesSection + PreGeneratedItineraries (editorial discovery)
6. ExploreHub (all-entry directory — condensed)
7. PlanCheckSection + ValidatorTelemetrySection (collapsed `<details>` progressive disclosure)
8. StatsSection, DemoScenariosWrapper, AffiliateSection, NewsletterSection, BetaBanner (bottom/below fold)
9. Footer, Chatbot, mobile tab bar
- StickyMobileCTA retired (tab bar covers it). No block deleted.

## 8. CARD GRAMMAR (applied to key discovery cards in this phase)

Structure: image (aspect 4/3 or 16/10, `rounded-t-xl`) → title (line-clamp-1, semibold) → one context line (muted, line-clamp-1) → minimal meta row → actions: **primary AddToTrip (full on modal/detail, compact on grid cards)** + secondary `Odpri` (ghost) + optional heart. Surface radius `rounded-xl`, `p-4`/`p-3` mobile, consistent shadow-sm → hover:shadow-md. Applied in this phase to: DestinationCard/Modal, EventCard (calendar), ListingCard/Modal, marketplace experience/product cards, supply ProductCard/Modal, SmartSearch rows, experiences category cards (link cards stay simple). Other cards harmonize in later phase.

## 9. TRUTH VOCABULARY (booking/availability — issue §21/§38)

Unified labels (existing integrations untouched): `Rezerviraj` (real booking), `Preveri ponudbo` (affiliate/deep link), `Odpri ponudnika` (handoff/external), `Cena od …` (from-price), `Cena trenutno ni na voljo`, `Razpoložljivost ni preverjena`, `SAMO INFORMACIJA` (external lifecycle). NEVER convert unknown → confirmed.

## 10. ZERO-LOSS SAFETY NET

- Regression matrix seeded from audit §3 (66 capabilities) — final matrix in CHANGELOG/report.
- Source-contract tests updated ONLY with intentional-change explanations (issue §52).
- All storage keys preserved (`dai:*`), all API contracts untouched, all routes untouched (except none), PWA/SW untouched (except adding pages to shell is additive), i18n routing untouched.

## 11. PHASING

- **v1.112.0 (this wave, "The Spine"):** §3 canonical system + §4 Moja pot + §5 planner strip/declutter + §6 shell/tab bar + §7 homepage order + §8 card grammar on key cards + 404 fix (`/načrtuj` bug) + tests + browser QA + regression matrix.
- **Next waves (documented, not started):** /potovanje↔/nacrtuj deeper merge decision, EN coverage extension for SL-only surfaces, community trip fork, Go Mode visual-calm deep pass, full skeleton/empty/error family rollout, my-trip server reflection + claim-on-login, wishlist→trip auto-bridge suggestions.
