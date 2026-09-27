# Competitive Research: Layla, Roam Around, Google Gemini/AI Mode + Mindtrip outage delta

**Task ID:** 20 (completes the interrupted parallel research of Task 19 — screenshots existed, notes were missing) · **Agent:** main-agent · **Date:** 2026-09-27/28 (sandbox time)
**Scope:** Platforms NOT covered by `docs/UX-WORKFLOW-BENCHMARK-2026-09-27.md` (Alma, Mindtrip, Stardrift, Wanderlog) nor by `research/wonderplan-tripplanner.md` (Wonderplan, Trip Planner AI).
**Method:** Orphaned screenshots from the interrupted 19-a session were analyzed with VLM (z-ai vision), then every claim was re-verified live via curl (redirect chains, HTTP codes, HTML identity) + 10 web searches. Two third-party articles were bot-blocked during the original session (CloudFront 403 / Vercel checkpoint) — captured as headline screenshots only.

---

## 1. MINDTRIP — OUTAGE (delta check, verified live) ⚠

**The closest AI rival is dark right now.** Live curl verification (2026-09-27/28):

| URL | Result |
|---|---|
| `https://mindtrip.ai` | **302 → `https://images.mindtrip.ai/heroku/construction.html`** → 200 "Under Construction" |
| `https://mindtrip.ai/login` | 200 — same construction page |
| `https://api.mindtrip.ai` | 200 — same construction page |
| `https://app.mindtrip.ai` | connection failure (no usable response) |

Construction page content (fetched live): title *"Under Construction | mindtrip."*; body *"Sorry we missed you! **Mindtrip** is under construction. Please check back for exciting updates!"* — no login, no notify-me CTA, no nav/footer (screenshot: `mindtrip-homepage-delta.png`, first evidence 2026-09-27 18:32).

**Signals:**
- The redirect target lives under **`/heroku/`** on their images CDN — a strong infrastructure-migration tell (Heroku forced migration era), i.e. this looks like an ops event, not a graceful sunset.
- **No press coverage found** of the outage. Meanwhile reviews from days earlier still rank Mindtrip top-of-category: imean.ai "Best AI Trip Planners for 2026" (Sep 23, 2026: "combines a conversational planning assistant with maps, photos…") and aizzie.ai "Best Free AI Trip Planners in 2026" (Sep 22, 2026: "turn articles, videos, photos or Google Maps into a trip plan") — the review cycle lags reality.
- Mindtrip's pre-outage trajectory (for the record, from the 2026-09-27 morning benchmark + searches): TUI Musement partnership (Nov 2025), Glacier Country Montana DMO white-label integration, Italian gastronomy-tourism ecosystem partnership (2025), Sabre+PayPal agentic checkout (Q2 2026), Events/Collections/group-chat-@Mindtrip workflows.

**Benchmark implications:**
1. **Reliability is a moat.** The category leader most-cited for workflow depth went fully dark (marketing + app + API) without a single news story. Our uptime discipline + provenance/AS-OF truth layers are a *demonstrable* differentiator, not just a design principle.
2. **Strategic acquisition window:** while Mindtrip is dark, demand for "Mindtrip alternative" / general AI-trip-planner searches meets a construction page. Time-boxed SEO/outreach opportunity (see benchmark addendum, gap W10).
3. **Process lesson:** the 2026-09-27 morning benchmark described Mindtrip's live features; by evening they were gone. Delta checks are a standing necessity — field state changes faster than review cycles.

---

## 2. LAYLA (layla.ai — chat-first, now Expedia-backed)

**Corporate chain (verified across sources):** Layla AI GmbH (Belziger Str. 69-71, Berlin, HRB 247135 B, MD Saad Saeed) **acquired Roam Around** (PhocusWire — corroborated by top7.hr's citation Aug 19, 2026) → **Expedia Group acquired Layla on 2026-07-31** ("stays standalone for now"; thepaypers/deeparrival/eturbonews/36kr). Layla = the chat-first consolidation vehicle of this category, now with Expedia inventory behind it.

**Live state (verified by curl/browser):**
- `layla.ai` → **HTTP 429** for datacenter traffic; in-browser it answers with a **Vercel Security Checkpoint** ("Failed to verify your browser, Code 21" — screenshot `layla-vercel-security-checkpoint-block.png`). The wall blocks automation and some legitimate users (VPN/private mode). The actual UX could not be audited directly — profile assembled from tripplanner.ai's own copy + reviews.
- **Domain churn:** `itslayla.com` (the former "It's Layla" marketing domain) is now an **unrelated Shopify fashion store** named "Layla" (theme "Dwell", shop `hgjvg7-94.myshopify.com`, collection-card layout — verified in HTML). The brand's original domain is gone from travel. `itslayla.com/plan|/planner` → 404.
- `tripplanner.ai` operates as Layla's SEO front-end (see 19-b notes): every CTA deep-links into `layla.ai/chat?ask=<intent-matched prompt>&utm_medium=tripplanner`.

**Product profile (from tripplanner.ai copy + reviews + top7.hr):**
- Chat-first, full-funnel: first destination idea → full itinerary (flights, hotels, transfers, experiences) → **booking clicks** (Skyscanner flights, Booking.com `aid=2233658`, GetYourGuide activities) — now deepening with Expedia Group inventory.
- "Plan Together" = solo-user conversational refinement: swap museums for food tours, shorten a train transfer, add a Florence day trip, upgrade hotels — itinerary + costs + travel times recalculate.
- Claims "8M+ trips planned, 4.9★ average" (unverifiable, attributed to the funnel brand).
- Regional positioning quote (top7.hr, Aug 19, 2026): *"Layla AI je berlinski startup koji je napravio korak dalje od tipičnog generatora itinerara. Pokriva cijeli proces — od prve ideje o destinaciji do klikanja na [rezervaciju]"* — the whole process from first idea to booking click.
- felloai's category verdict: *"If you like planning by conversation, choose Layla."*

**One unattributable observation, filed honestly:** during the interrupted 19-a session, a Layla-related navigation landed on **wonderplan.ai** (screenshot `layla-redirect-lands-wonderplan.png` shows Wonderplan's login modal; `layla-itslayla-domain-now-clothing-store.png` shows Wonderplan's landing). No Layla URL redirects to Wonderplan today (verified: all `layla.ai/*` bot-wall 429, `itslayla.com/*` Shopify/404). Most likely a search-result/ad artifact in that session — recorded as funnel-churn anecdote, **not** a claim.

**Benchmark implications:** Layla is the strongest *conversational* competitor (chat depth + Expedia supply), but its funnel architecture (domain churn, bot-walls, brand fusion across tripplanner.ai/layla.ai, unverifiable social proof) is the opposite of our provenance/no-login honesty stack. Nothing new to copy; confirms our G5 chat+split-map and G6 booking-bridge are the right honest equivalents.

---

## 3. ROAM AROUND (roamaround.app — live legacy property)

Still independently live (HTTP 200, verified today): *"Roam Around - Ultimate AI Travel Planner"*. Three screenshots from the interrupted session, VLM-analyzed and consistent with the live site.

**(a) First-run UX (from screenshots):**
- Landing (`roamaround-app-landing.png`): split hero — left "TRAVEL WITH EASE" pill + H1 **"Your Personal Travel Planner"**; right full-bleed alpine-lake photo. Nav: logo + "Sign in". CTA below the fold: **"Plan a trip"**.
- Itinerary result (`roamaround-app-itinerary-london-3d.png`): centered header card ("3 day itinerary for London" + thumbnail) → **social sharing module**: WhatsApp/Telegram/Twitter/Facebook/LinkedIn/Reddit icons, **"Share and earn 3 free tokens"** + *"They get 5 tokens for signing up with your link"* → "Embed on your site" (WordPress + copy-link + code icons) → text-based itinerary: intro paragraph + "**Day 1:**" narrative paragraphs with inline links (Tower Bridge…). **No map view observed anywhere.**
- Login gate (`roamaround-app-plan-ljubljana-attempt.png`): clicking "Plan a trip" (a Ljubljana plan was being attempted) opens a modal: **"Login required — Help us prevent spam — Sign in with Google"** — a hard gate with an anti-spam rationale (i.e. token-burn protection).

**(b) Live verification today:** landing page H2s = "Simple Pricing", "What people are saying", "Start Planning Your Next Adventure"; 6 token mentions, "Plan a trip" ×2. Token pricing tiers persist.

**(c) Model:** freemium **token economy** — free tokens on signup (5 via referral), earn-by-sharing (3 per share), paid token tiers; Google sign-in gate; embeddable itineraries for bloggers; itineraries are text+links only.

**Status:** acquired by Layla (PhocusWire); the site runs on as a legacy/parallel property — brand retention on organic search while Layla absorbed the tech. **Benchmark implications:** the *share-and-earn token loop* and *embed* are the two patterns worth noting — we deliberately don't gamify referrals (honesty stack; complexity + fraud surface), and our /pot community share is unconditional. Logged under "what we don't copy (for now)" in the addendum.

---

## 4. GOOGLE GEMINI / AI MODE — travel feature timeline (official sources)

Screenshots from the interrupted session (7 pages) + searches. Third-party coverage was bot-blocked (engadget → CloudFront 403; shattered.io → Vercel checkpoint), but all four Google blog posts were captured:

| Date | Source | What |
|---|---|---|
| **Nov 17, 2025** | blog.google, Julie Farago (VP Eng, Search) | **"New ways to plan travel with AI in Search"** — AI Mode travel planning: itinerary building, deal finding, "turning your plans into bookings" |
| **Nov 19, 2025** | extremetech (snippet) | "Tell AI Mode what kind of trip you want… and **Canvas quickly generates an itinerary**" + hotel/flight price tools |
| **Jan 14, 2026** | blog.google, Molly McHugh-Johnson | **"Try these tips to plan a trip with Canvas in AI Mode"** — Google now *teaches prompting* for trip planning (iterative refinement as canon) |
| **Apr 17, 2026** | blog.google | **"7 ways to travel smarter this summer, with help from Google"** — planning + deals + destination exploration round-up |
| **Aug 6, 2026** | blog.google, Sarah Armstrong | **"How Gemini plans such detailed vacation itineraries for you"** — Gemini itineraries "juggling existing plans" alongside personal preferences |
| ongoing | gemini.google.com | **Gems** — premade + custom AI experts with persistent instructions/persona (users can build a travel-planner Gem) |
| Sep 16, 2026 | NYT | "Planning a Trip With A.I.? Here's How to Do It Better." — mainstream how-to-prompt/verify guidance cycle |

**Benchmark implications — the commoditization thesis:**
- Generic *chat → itinerary → booking* is now a **free feature of the world's default search engine** (and Gemini/Gems at the free AI tier). Any planner whose core value is "AI writes you an itinerary" is competing with free-from-Google.
- Moats that survive commoditization: **vertical data depth** (curated Slovenia supply, events, weather), **provenance/truth layers** (nobody's), **offline/on-trip mode** (GPS Go mode — Google Search can't), **community** (/pot), **no-login plans**, **deterministic engine** (verifiable, no hallucination). Our stack is precisely the anti-commoditization stack — the Gemini timeline *validates* the strategy rather than opening new UI gaps.
- One directional note: Google's "juggling existing plans" (Aug 2026) mirrors our ingest/Start-Anywhere equivalents; Gems-style persistence is adjacent to preference accumulation, which we deliberately rejected (§5 of the benchmark).

---

## 5. Benchmark takeaways vs "Discover Slovenia AI" (all 10 platforms now covered)

| Dimension | Layla (+tripplanner.ai) | Roam Around | Gemini / AI Mode | Discover Slovenia AI (us) |
|---|---|---|---|---|
| Entry | SEO guides → chat deep-links (pre-filled prompts) | Landing → hard Google login → NL plan | It's the search box (free, default) | / home: search + intent chips + map; destination pages ×4 languages |
| Planning | Chat-first full funnel (flights/hotels/activities) | Text itinerary, no map | Canvas iterative prompting | Deterministic engine + NL refine + drag/drop + split map + weather |
| Booking | Skyscanner/Booking/GetYourGuide → Expedia inventory | None (text links only) | Flights/hotels price tools in Search | G6 bridge: own-supply marketplace + partner panel (honest review-first) |
| Collaboration | Solo chat ("Plan Together") | None | Gems persistence (solo) | CAS + 5 roles + revisions + polls + presence (W2 = trip chat gap) |
| Community | tripplanner.ai gallery (broken 404s) | None | — | /pot live (revisions, reservations, wishlist) |
| Export | Unverified (bot-wall) | Embed + share links | — | PDF + ICS + audio + offline Go |
| Trust | Unverifiable "8M+ trips, 4.9★"; bot-walls; brand fusion | Token incentive loop | Google-grade defaults | Provenance + AS-OF + honest counters (G4 canon) |
| Live reliability (observed) | layla.ai bot-walled; tripplanner 404s/auth errors | Live (legacy) | Google-grade | Production healthy (1.128.0) |
| **Mindtrip** | — | — | — | **Offline (construction page, whole estate)** |

**Category picture after full coverage (10 platforms):** the field is consolidating around two poles — *chat-first funnels with OTA money* (Layla←Expedia; Mindtrip←Sabre/PayPal, now dark) and *free defaults* (Google AI Mode/Gemini). Everyone else is either a login-walled quiz generator (Wonderplan), an SEO funnel (tripplanner.ai), or a legacy token property (Roam Around). **Nobody in the category combines: no-login plans + deterministic engine + provenance layers + offline GPS mode + own-supply marketplace + community plans.** The W-gap list (W1–W8) plus two new patterns (below) is the complete, honest distance to the field.

---

## Search log
- "Mindtrip AI travel planner down under construction shut down news" · "mindtrip.ai site down construction page September 2026" (recency 60d) · "Mindtrip travel startup funding partnership DMO white label 2026"
- "Layla acquires Roam Around AI itinerary builder PhocusWire" · "top7.hr Top 7 AI planera za putovanja 2026 Layla"
- "Google AI Mode Canvas trip itinerary planning travel features 2026" · "Gemini Gems travel planner custom instructions itinerary Google Trips revival" · "blog.google \"New ways to plan travel with AI in Search\"" · "blog.google Canvas AI Mode plan a trip tips prompts" · "blog.google Gemini detailed vacation itineraries agentic planning August 2026" · "extremetech Google AI-powered travel tools AI Mode Canvas itinerary November 2025"
- Live curl verification: mindtrip.ai (root/login/api/app), layla.ai (+www/plan/planner), itslayla.com (HTML identity + 404 probes), roamaround.app (title/H2/token scan), blog.google URL probes.

## Screenshot references
`mindtrip-homepage-delta.png` · `layla-itslayla-domain-now-clothing-store.png` · `layla-redirect-lands-wonderplan.png` · `layla-vercel-security-checkpoint-block.png` · `roamaround-app-landing.png` · `roamaround-app-itinerary-london-3d.png` · `roamaround-app-plan-ljubljana-attempt.png` · `gemini-blog-canvas-ai-mode-nov2025.png` · `gemini-blog-canvas-tips-jan2026.png` · `gemini-blog-summer-tips-apr2026.png` · `gemini-blog-how-gemini-plans-trips-aug2026.png` · `gemini-gems-official-page.png` · `gemini-engadget-ways.png` (403) · `gemini-shattered-io-5ways.png` (bot-wall)
