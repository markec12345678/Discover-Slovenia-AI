# Task 8 / §3–§4 Benchmark Web Research — Part 2: Google Maps · Airbnb · Tripadvisor (+ 8 additional products)

- **Task ID:** 36-c (part 2 of 2) · GitHub Issue #8 "WORLD-CLASS DISCOVERY UX 2.0"
- **Date of research:** 2026-09-26 · **Baseline:** v1.111.1 (HEAD ac75070)
- **Method:** live web research (z-ai `web_search` + `page_reader` on key URLs; raw extracts in `/tmp/research/*.json` this session). Interaction architecture only, no branding.
- **Part 1 (separate doc, same session):** `task8-benchmark-research-1.md` — Mindtrip · ALMA · Wanderlog.
- **Legend:** [R] = page read in full this session; [S] = search-result snippet (quoted/paraphrased from the indexed snippet only); UNKNOWN = could not be verified from sources.
- **Rule compliance:** every claim below carries its source URL. Where a claim rests only on a snippet, it is marked [S]. No numbers were invented; metric claims come from the cited pages.

---

## 1. GOOGLE MAPS (maps.google.com / mobile app)

### 1.1 Overview
The world's default place-discovery surface: a map-first app with a three-tab mobile shell — **Explore** ("Choose where to go"), **You** ("Create lists, recall places, find your saved trips, notifications, and messages"), **Contribute** ("Share experiences, add info and reviews, and fix problems") [R: support.google.com/maps/answer/144349]. Saving a place is a one-tap act that files it into named lists (default lists: **Favorites, Want to go, Travel plans, Starred places, Saved places**) [R: support.google.com/maps/answer/7280933]. Lists are private by default, shareable as links, and can be opened to group editing [R: 7280933]. The "You" tab aggregates Recently saved / Nearby saved / Visited / Timeline / My maps / Reservations [R: support.google.com/maps/answer/9948049 + 144349].

### 1.2 Strongest patterns (evidence-backed)

| # | Pattern | What the source says | Source URL |
|---|---------|----------------------|-----------|
| G1 | **One-tap save from any place surface** | "To save a place: … Click or search for a business, place, or a set of coordinates. Click **Save** and select a list." Save works identically on computer, phone and tablet: "Save your favorite places on Maps to easily find them on any computer, phone, or tablet." | [R] https://support.google.com/maps/answer/3184808 |
| G2 | **Named default lists encode intent** | Default lists are "Favorites, Want to go, Travel plans, Starred places, Saved places"; custom lists can be created with a name, emoji icon and description. (You can't edit icons of the default lists — they are semantic anchors.) | [R] https://support.google.com/maps/answer/7280933 |
| G3 | **Lists are toggleable map layers** | "Hide on your map: Hide your saved places. / Show on your map: Show your saved places." A saved list is not just a bookmark folder — it becomes a visible map overlay. | [R] https://support.google.com/maps/answer/7280933 |
| G4 | **Shared lists with invite-to-edit + follow** | Sharing options: "Send a link to view… Private: Only you can find your lists. Shared: Anyone with your link can find your lists." Collaboration: "Invite others to edit a shared list." And: "If you follow a list made by someone else, their saved places will show up in Saved. **The places also appear as suggested locations in Google Maps.**" | [R] https://support.google.com/maps/answer/7280933 |
| G5 | **Save is private by default; privacy is explicit** | "Only you can find your saved places unless you create and share a list of places. Google may anonymously share combined information about users' saved places." | [R] https://support.google.com/maps/answer/3184808 |
| G6 | **Save from third-party embedded maps** | "If a website has a map embedded from Google Maps, you can save that place to your Google Account… Your star and the website name will appear on both the computer and mobile app versions of Google Maps." (Save travels across surfaces — including websites that embed the map.) | [R] https://support.google.com/maps/answer/3184808 |
| G7 | **The You tab = personal recall engine (search + filter + bulk)** | "Under 'Your recent places,' you can find places you recently searched for, got directions to, viewed, or saved. You can **search and filter** the list." Bulk action: "Touch and hold the place you'd like to select. To select other places, tick the check box… Tap **Save**. Select an existing list or create a new one." | [R] https://support.google.com/maps/answer/9948049 |
| G8 | **Time- and distance-scoped recall shelves** | "Recently saved: Find places you've saved within the last few months. If you haven't saved any places in the last 180 days, 'Recently saved' will be unavailable." / "Nearby saved: Find nearby places that you've saved. If your saved places aren't within 25km (about 16mi), 'Nearby saved' will be unavailable." | [R] https://support.google.com/maps/answer/9948049 |
| G9 | **Explore = area-scoped, event-aware discovery feed** | "You can find detailed reviews and descriptions of the most popular establishments and hotspots in your selected area. You can also search for local events, trendy restaurants, and things to do." (2018 relaunch coverage adds that the tab is "very picture-forward" and built to help you "find nearby events or restaurants that you might want to visit.") | [R] https://support.google.com/maps/answer/144349 ; [S] https://www.droid-life.com/2018/06/26/… (snippet) |
| G10 | **Personalized match score on places ("Your Match")** | "Every restaurant or bar on Google Maps now comes with a 'Your match'…" percentage of how likely you are to enjoy a place, computed from "What Google Maps knows about a business. Your previous…" activity. | [S] https://www.timesnownews.com (snippet) ; [S] https://www.elitedaily.com (snippet) |
| G11 | **Place sheet carries a canonical content model** | Google's own Places UI Kit (the embeddable version of the Maps place card) exposes exactly: `address, rating, type, price, opening hours, website, phone number, summary, reviews, media (photos), attribution` — i.e. photo → identity → rating/price → practical facts → actions, "maintaining the trusted Google UX that users know." | [R] https://mapsplatform.google.com/maps-products/places-ui-kit |
| G12 | **Place entry ends in immediate actions** | "After you find a place on the map, you can: **Get directions to it.** Get info like business hours and menus. Find Street View imagery." Every place is actionable the moment it is visible. | [R] https://support.google.com/maps/answer/144349 |
| G13 | **Data ownership / export** | "Export your saved lists: Go to takeout.google.com… Select a destination, frequency, and file format." | [R] https://support.google.com/maps/answer/7280933 |

### 1.3 Known weaknesses / limits (from sources)
- **Scale ceiling on lists:** "Saved Lists are limited to 3,000 entries. Lists with more entries may not display properly." [R: 3184808]
- **Starred places are second-class:** "You can't share starred places." [R: 7280933]
- **Feature churn / trust in continuity:** users on Tripadvisor's Facebook channels advise "copying your places into Excel to save them offline for the future in case tripadvisor removes the map" — the same anxiety applies to any free planner. [S: facebook.com/Tripadvisor video post, snippet]
- Group planning ("long-press to share a shortlist of places into a conversation") was launched in 2018 but is not covered in current help docs — current state UNKNOWN beyond shared lists. [S: newsweek.com 2018, snippet; support docs]

### 1.4 Interaction principles extracted (Google Maps)
1. Save is a **one-tap, zero-form act** — name/category comes from the list you file it into, not from a dialog.
2. **Intent-encoded default lists** ("Want to go" vs "Favorites") turn a flat bookmark pile into a decision-ready shortlist.
3. A saved collection should be a **map layer**, not just a list — seeing your saves *in place* is the payoff.
4. Personal recall needs **search, filters and bulk-select** the moment it exceeds ~20 items.
5. The place sheet is a **standard, predictable contract** (photo → identity → rating/price → hours → actions) — users navigate it at a glance because it never re-orders itself.

---

## 2. AIRBNB (airbnb.com)

### 2.1 Overview
Search-led marketplace with two co-equal result surfaces: **list-results** ("a list of rectangular cards that contain on them the listing image, price, rating, and other details") and **map-results** ("oval pins on a map showing the listing price") [R: arxiv.org/html/2407.00091v1]. Search starts from exactly three inputs — destination, check-in/checkout dates, guests [R: airbnb.com/help/article/479] — with filtering progressive behind a Filters button; saving is a **heart → wishlist** act with collaboration built in [R: article/1236]; after booking, discovery continues *inside the trip* via a shared map of nearby places of interest [R: article/4192].

### 2.2 Strongest patterns (evidence-backed)

| # | Pattern | What the source says | Source URL |
|---|---------|----------------------|-----------|
| A1 | **Three-field search contract** | "Start your search by adding the following: Destination / Check-in and checkout dates / Total number of guests and pets." Everything else is refinement. | [R] https://www.airbnb.com/help/article/479 |
| A2 | **Autocomplete as search quality** | "Autocomplete: When searching for a destination, get relevant place suggestions, improved place naming, and fewer duplicates." | [R] https://www.airbnb.com/help/article/252 |
| A3 | **Search by point of interest, with walk-time semantics** | "Search for different points of interest—such as a specific neighborhood, landmark, or street… (ex: 'Sagrada Familia, Barcelona')… The results will show how far each listing is from your searched place. For example… a particular listing is a **5 minute walk from the Eiffel Tower**." | [R] https://www.airbnb.com/help/article/252 |
| A4 | **Map = the dominant search engine** | "Overall the search box generates **20%** of searches, **the rest coming from maps**" — panning the map re-queries with implicit bounds. "The map is a quick way to review the listings in relation to areas of interest… You can zoom in or move around the map to find additional listings that don't appear at first." | [R] https://arxiv.org/html/2407.00091v1 ; [R] https://www.airbnb.com/help/article/252 |
| A5 | **Split view on desktop, full-screen map on mobile** | "When using Airbnb search on web browsers, the results are laid out as a **grid of listing cards on the left. On the right the results are displayed on a map**." Engineering paper: "users can view a **full-screen map on mobile devices and a half-screen map on web browsers**." | [R] https://arxiv.org/html/2407.00091v1 ; [S] https://airbnb.tech/…/TB-254MapsRankingOptimizationInAirbnb…pdf (snippet) |
| A6 | **Tiered visual hierarchy on the map (mini-pins)** | "In addition to the ovals with price, we create a smaller oval pin without the price display… mini-pins **draw less user attention by design; click-through rates for mini-pins is 8 times less than regular map pins**." | [R] https://arxiv.org/html/2407.00091v1 |
| A7 | **Attention is center-biased; decluttering beats completeness** | "User attention is maximum towards the center of the map, and decays radially outwards." Restricting pins to the most bookable listings raised bookings — and a controlled experiment proved the gain is **focus, not urgency** ("Bookings for Treatment2 drop by 1.5%… urgency is not at all responsible"). | [R] https://arxiv.org/html/2407.00091v1 |
| A8 | **Card anatomy = image, price, rating before click** | List-results are "rectangular cards that contain on them the **listing image, price, rating, and other details**." | [R] https://arxiv.org/html/2407.00091v1 |
| A9 | **Progressive, recommended filters** | "By selecting **Filters**, refine your search…" and "When you select Filters, you may see a row of filters that are **recommended for you**… based on filters you've used in the past and filters that guests doing a similar search found useful." (Type of stay, price range, rooms and beds, amenities, booking options, standout stays, property type, accessibility, host language.) | [R] https://www.airbnb.com/help/article/479 |
| A10 | **Category-first serendipity** | 2022 Summer Release: "The 56 Airbnb Categories include more than 4 million [homes]… **As you view different categories, the map intelligently zooms to show you where the homes are located.**" "Airbnb Categories – A new way to search that makes it easy to **discover millions of homes you never knew existed**." Horizontal icon sub-nav: "Click on any of the 61 sub nav icons, and icon-specific places pop up immediately on a Google-powered map." | [S] https://news.airbnb.com/the-airbnb-2022-summer-release/ (snippet) ; [S] https://www.hospitalitynet.org/news/4110979.html (snippet) ; [S] https://code.likeagirl.io/a-ux-study-of-airbnbs-iconic-horizontal-scroll-sub-navigation-207dce011284 (snippet) |
| A11 | **Flexible-dates browsing mode** | "Feeling spontaneous? You can use the **Flexible** tab to search for weekend stays, weekly stays, or monthly stays… when selecting check in and check out dates, you can choose to show results within a certain number of days (for example, + or - 3 days)." | [R] https://www.airbnb.com/help/article/252 |
| A12 | **Heart save with context memory** | "Simply click or tap the **heart** on any listing… You can save the listing to an existing wishlist, or create a new wishlist. **When you save multiple listings from the same search, they will automatically be added to the same wishlist.**… **Wishlist entries are saved with the dates you originally searched.**" | [R] https://www.airbnb.com/help/article/1236 |
| A13 | **Wishlist = multiplayer decision object** | "Wishlist collaborators who are logged in to Airbnb can **add and view notes, vote up or down on listings, change proposed trip dates, and update the guest count**." Plus view-only link sharing. | [R] https://www.airbnb.com/help/article/1236 |
| A14 | **Saves feed ranking (discovery quality loop)** | "The algorithm evaluates the popularity of a listing… including **how often guests save a listing to their wishlist**, how often guests book, and how often guests message the host." | [R] https://www.airbnb.com/help/article/39 |
| A15 | **Discovery inside the booked trip (nearby map + itinerary)** | "Explore restaurants, attractions, and hidden gems near your stay, then save the ones you love to your map or itinerary, **all without leaving the app**… Selecting a pin on the map will show you more details… **The distance in time from the place you booked will also show on the map**… Click **Add to itinerary** and select a date… Choosing the time of day is optional." Honesty rule: "Saving a place of interest to your itinerary **does not make a booking**… It's just a way to keep track." | [R] https://www.airbnb.com/help/article/4192 |
| A16 | **Cross-sell is context-ranked, not banner-dropped** | "If a guest has a home reservation, the algorithm may **rank higher experiences and services that are available nearby during the dates of that reservation**." | [R] https://www.airbnb.com/help/article/39 |
| A17 | **Graceful result relaxation is stated policy** | "If there aren't enough high quality listings available that match a guest's search criteria, we may show other listings that we think might appeal to the guest, **even if they do not meet all of the guest's criteria**." Map and list may intentionally differ: "the listings that appear on the map may differ from those that appear in the list." | [R] https://www.airbnb.com/help/article/39 |
| A18 | **Mobile behavior** | Mobile map is full-screen with a top card (arxiv Fig. 8/discussion); on mobile users "cannot interact with both list-results and map-results at the same time" — the two surfaces are exclusive modes. | [R] https://arxiv.org/html/2407.00091v1 |

### 2.3 Known weaknesses / criticism
- **No keyword search at all:** "It's not currently possible to search by keyword." [R: article/479]
- **Map occlusion anti-pattern (found & fixed):** "The topmost listing card **covers the bottom part of the map, making pins in this region unreachable**. The issue is fixed following this discovery." (mobile web) [R: arxiv 2407.00091v1]
- **Over-restrictive pin caps are visible to users** as fewer results; the engineering trade-off (declutter vs. completeness) is deliberate but constant. [R: arxiv 2407.00091v1]
- **Filter panel breadth:** 10+ filter groups behind one button is the acknowledged cost of a marketplace this wide (documented as the full filter taxonomy). [R: article/479]

### 2.4 Interaction principles extracted (Airbnb)
1. Ask for the **minimum viable query** (where/when/who) — defer everything else to filters and the map.
2. The map is not a results view, it is **the query itself** (80% of searches) — pan = intent.
3. On maps, **what you show** (selection, tiers, pin styling) matters more than order — attention is spatial, center-biased.
4. Save (heart) must **remember the search context** (dates) so a wishlist can convert without re-entry.
5. The highest-intent discovery surface is **inside a confirmed booking**: nearby pins, time-distance, add-to-day, co-traveler sharing.
6. Ranking may **relax criteria honestly** rather than show an empty state — but the card must still say why it's there.

---

## 3. TRIPADVISOR (tripadvisor.com)

### 3.1 Overview
Review-mass travel guidance platform whose planning layer is **Trips**: "Discover and save millions of top-rated attractions, activities, restaurants and places to stay with Trips, Tripadvisor's free trip planner" — "Build a trip with your saves or use AI to get custom recommendations, **collaborate with friends**, and organize your trip ideas" [R: tripadvisor.com/Trips; nav item "Plan with AI"]. The AI Trip Builder (Jul 2023, OpenAI-based) was **rebuilt in Aug 2024** around saves-first, categories-not-days — "doubled the rate at which travelers save the resulting recommendations and improved surveyed customer satisfaction by 10%" [R: medium.com/tripadvisor].

### 3.2 Strongest patterns (evidence-backed)

| # | Pattern | What the source says | Source URL |
|---|---------|----------------------|-----------|
| T1 | **Saves are the planning unit; AI is optional and on-demand** | "We moved away from the standard format of a day-by-day itinerary and reorganized the recommendations into **uniquely formed categories** that are relevant to the destination and the traveler's interests. This resulted in an **easy-to-scan set of recommendations with the flexibility to save what you're interested in and leave the rest behind**. After refining your list, you can choose to have AI organize it into a daily plan, **or just save the list to return to later**." | [R] https://medium.com/tripadvisor/cracking-the-code-to-the-ai-travel-planner-27d8d0f222c8 |
| T2 | **Users enjoy planning — don't do all the work for them** | "Most AI travel planners have designed their products based on the assumption that travelers want all of the work done for them… **we learned through user research that our travelers really enjoy planning their trips.** They want to spend time discovering things to do and places to eat… This added level of discovery and flexibility **meets the traveler where they are** in the planning journey and ushers them more gently through their unique planning process." | [R] same |
| T3 | **Structured input beats free-text prompt (quiz → save → AI)** | "Trip Advisor starts by asking **multiple-choice questions**… destination, dates, kind of trip (solo, partner, friends, family), what you're interested in… It then presents a series of ideas that you can **uncheck** if you're not interested. Using the **'saved'** activities and restaurants, Trip Advisor builds your day-by-day itinerary." Third-party verdict: "This gave me a lot more flexibility and control… **felt more familiar and intuitive**." | [R] https://www.sevencorners.com/blog/travel-tips/should-you-use-ai-to-plan-your-vacation |
| T4 | **"For you" continuous inspiration rail** | "There's also a '**For you**' tab that offers even more ideas. Maybe I want to see more museums or do more outdoor activities. I can check the listings in 'For you' and the AI will add them to my itinerary." | [R] same |
| T5 | **Relevance from owned community data, not generic LLM** | "We developed our own recommender model that directly analyzes our millions of English-language traveler reviews… **reducing our latency from ~40 seconds to about ~6.5 seconds** on average… a **30% increase in the perceived quality** of our recommendations." | [R] https://medium.com/tripadvisor/cracking-the-code-to-the-ai-travel-planner-27d8d0f222c8 |
| T6 | **Original 2023 funnel: inspiration → generated day-by-day → save/edit/share** | "analyzes Tripadvisor's more than one billion user-generated reviews and opinions to create day-by-day itineraries based on the user's input of a destination, travel dates, who they are traveling with and the types of activities they are interested in… Users can save, edit and share the itinerary." | [R] https://www.phocuswire.com/tripadvisor-travel-planning-tool-powered-by-openai |
| T7 | **Saved trip → map-only view of your saves** | Forum: "Go to your Saved Trips and pick a saved trip folder. **A map will show with just the places you saved.**" | [S] https://www.tripadvisor.com/ShowTopic-g1-i12105-k6628185-… (snippet) |
| T8 | **Collaboration as a first-class verb** | Trips page: "Build a trip with your saves or use AI to get custom recommendations, **collaborate with friends**, and organize your trip ideas." | [R] https://www.tripadvisor.com/Trips |
| T9 | **Mobile behavior** | AI builder is "accessible via desktop and mobile web" (Phocuswire, 2023); the Trips page itself is responsive web with app-style nav ("Plan with AI / Rewards / Discover / Review"). Deep native-app behavior: UNKNOWN from this session's sources. | [R] https://www.phocuswire.com/… ; [R] https://www.tripadvisor.com/Trips |

### 3.3 Known weaknesses / criticism
- **2023 v1 got the planning psychology wrong:** "while our product was being heavily used, it wasn't solving the traveler's problems in the right way… (1) travelers felt the recommendations lacked relevancy, and (2) travelers were in their early stages of trip planning and sought greater flexibility." [R: medium.com/tripadvisor]
- **40-second latency** in v1 (fixed to ~6.5 s). [R: same]
- **Geographic incoherence in generated days:** "One day it had me driving unnecessarily from one side of town to the next and back again; **it could have done a better job of grouping things geographically**." [R: sevencorners.com]
- **Soft constraints ignored:** "It also struggled with the 'family-friendly' aspect. For example, it recommended a **party bus rental** one day." [R: sevencorners.com]
- **Scale of saves breaks organization:** "I have more than 200 trips (maybe 500?) saved on tripadvisor but I can't find an easy way to find them as the only sort options don't do…" [S: tripadvisor.com support forum, snippet]
- **Saves misused as wishlists:** "I have several trips saved that are in fact just a list of wish list of restaurants/attractions for any desired location." [S: tripadvisor.com Ideas-to-improve-Itinerary thread, snippet]
- **Data-permanence anxiety:** users advise "copying your places into Excel… in case tripadvisor removes the map [view]". [S: facebook.com/Tripadvisor, snippet]

### 3.4 Interaction principles extracted (Tripadvisor)
1. **Saves-first, AI-second:** generate scannable categorized ideas → let users save/reject → AI organizes saved items into days only on request (2× save rate, +10% CSAT).
2. Structured multiple-choice input outperforms a blank prompt box for cold-start planning.
3. Relevance must come from **your own review/community corpus**; generic LLM output is the weakest layer.
4. Latency is a feature: 40 s → 6.5 s is the difference between "used" and "loved".
5. Day-by-day output is the **end** of the funnel, not the beginning.

---

## 4. ADDITIONAL PRODUCTS (one strongest pattern each)

### 4.1 Google Travel / Google Trips — *trips as containers, and the cost of removing them*
The Google Trips mobile app (auto-grouped Gmail reservations, offline itineraries) was discontinued in August 2019 — "most of its features had been absorbed into Google Maps and Google [Travel]" [S: blog.vacation-planner.app]. Google Travel's later "trip summary" (viewing past/upcoming Gmail trips) was itself eliminated in May 2023 "in a move to prioritize resources" [S: finance.yahoo.com]. Today travel.google.com is Flights-first; its discovery layer is an AI flexible search: "**Describe your ideal trip, and let Google Flights find the best deals for you**," plus Explore/price-tracking surfaces [R: travel.google.com]. Meanwhile the trips-as-containers role migrated into Maps' You tab ("saved trips… Reservations") [R: support.google.com/maps/answer/144349]. **Signal:** the container concept survives; the standalone reservations-aggregator app did not — Gmail-parsing trip containers are table stakes (TripIt, Mindtrip receipts, Tineo all sell exactly this) but not a moat.

### 4.2 Booking.com — *the anti-pattern reference*
Booking.com's discovery strength (dense filters, map, review volume) is inseparable from its documented pressure mechanics: "**X people are looking at this property**" is the canonical scarcity/urgency example in design literature [S: fastercapital.com snippet; S: hackernoon.com "The Psychology of Scarcity Messages" — "'X people are looking right now' transforms into invisible peer pressure"]. The UK CMA investigated hotel booking sites over "pressure selling" and discount claims (warning letters, 2018; formal changes agreed Feb 2019) [S: bbc.co.uk/news (Jun 28, 2018); S: insidermedia.com (Feb 6, 2019)]. Princeton's large-scale study formalizes the categories: **Countdown Timers (393 instances) and Limited-time Messages (88)** impose deadlines that accelerate decisions; "Activity Notifications" fake peer demand; more popular sites are *more* likely to use them [R: webtransparency.cs.princeton.edu/dark-patterns/]. **Signal:** urgency works in A/B tests and corrodes trust + invites regulation; Airbnb's team explicitly tested focus-vs-urgency and proved focus was the real driver (§A7).

### 4.3 Roadtrippers — *route-first discovery: the line is the query*
The homepage is literally a two-field form: Starting Point → Destination → Go, with a mode switch: "Plan with **autopilot** (Roadtrippers Autopilot™ creates your itinerary based on what we've learned from over **42 million trips**)" or "Plan on your own — **Explore and discover stops by yourself**" [R: roadtrippers.com]. Value prop: "All plans include access to curated road trip guides, **Extraordinary Places, and 5 million points of interest**," surfaced as "colorful icons on our map" [R: roadtrippers.com]. Reviewers praise stop handling: "intuitive in adding stops and easy to reorder and change stops as necessary" [S: apps.apple.com, snippet], and "mapping, budgeting, booking, and navigation in one place" [S: pilotplans.com, snippet]. **Weaknesses:** hard stop quotas by tier (3 stops free → 20 → 50 → 150) [R: roadtrippers.com] and map readability complaints ("once you select a route and go to the map to find the route numbers…" [S: play.google.com, snippet]). **Signal:** for corridor products, discover *along the path*, and never cap the plan mid-enthusiasm.

### 4.4 Polarsteps — *zero-effort capture, journal as by-product*
"By automatically recording your route using your phone's GPS, Polarsteps allows you to build a map of everywhere you've been with **minimal effort**. Much like a digital scrapbook, you can then personalise your travel log with photos, videos and journal entries… you can create a **step** per location" [R: mattsnextsteps.com/polarsteps-review/]. Tracking works offline and syncs later; sharing is follow-along or link; the profile becomes lifetime stats (countries, days travelled) [R: same]. It also suggests steps from photos: "I love that it **suggests steps based on photos you take** in different locations" [S: apps.apple.com, snippet]. Free core; Plus adds 3D maps, playback, more travel buddies [R: same]. **Weaknesses:** sync reliability ("Suddenly lost all photos from previous trips" [S: apps.apple.com, snippet]). **Signal:** during-trip capture must be automatic; photos are the cheapest structured-trip input; reliability of saved memories is the product.

### 4.5 TripIt — *forward-an-email → structured itinerary*
"Central location to **forward on all your bookings** including flights, hotels and other transportation… Automate trip creation by turning on integration of TripIt with your email service… **Keep track of information offline**… TripIt can simplify this. It'll even **calculate your layover times and pull out important information like confirmation/reservation codes on the front screen**… the app even allows **sharing of trips for collaboration**" [R: callumelsdon.com/travel-app-review-tripit/]. Corroborated: "Automatically builds itineraries from forwarded booking confirmations · Supports sharing, calendar feeds, offline access, and document storage" [S: itechguides.com, snippet]; "syncs with your inbox and calendar to automatically add travel plans" [S: thesmbguide.com, snippet]. **Weakness:** third-party editorial content (Covid guidance) went stale [R: callumelsdon.com]. **Signal:** the lowest-friction import in travel is email; the itinerary's job is to surface confirmation codes + timing math at the moment of need, offline.

### 4.6 Komoot — *sport-specific map planning*
"Whether you're looking for **smooth asphalt for your road bike, singletracks for your mountain bike, or peaceful trails for your hikes, komoot helps you generate sport-specific routes** tailored to your needs and preferences" [R: komoot.com]. Discovery filters: "Filter by **distance, difficulty, or public transport links**, and set off with confidence" [R: komoot.com]. Navigation: "turn-by-turn voice navigation and offline maps" [R: komoot.com]. Scale: "Join 45 million outdoor enthusiasts… 4.8/5 based on more than 300k user ratings" [R: komoot.com]. Reviewers: "create and follow routes that are based on **riding type and ability**" [S: bikeradar.com, snippet]; desktop↔mobile sync is native ("Whether you prep like a pro on your desktop or plan a route on the go, komoot automatically syncs…") [S: play.google.com, snippet]. **Weaknesses:** route choices on busier roads, poor turn prompts [S: forum.cyclinguk.org, snippet]. **Signal:** the *activity profile* changes the map's semantics (surfaces, difficulty) — one map, many sport grammars; public-transport links as a first-class filter.

### 4.7 AllTrails — *filter-by-attributes trail discovery + community freshness*
Trail discovery is attribute-driven: "Finding new hikes based on **location, difficulty, length, and features**" [S: timeside.com, snippet]; "Comprehensive Trail Database… including a **3D flyover**, making it easy to discover new hikes. Offline [maps]" [S: shesgoingsolo.co.uk, snippet]. Cards surface community freshness: "see important information related to each trail, **including recent trail reviews**" [S: thekaspack.com, snippet]. Works fully offline via GPS [S: maketecheasier.com, snippet]; ~50M users in 150+ countries [S: mortonsonthemove.com, snippet]; now moving up-funnel into planning: "AllTrails now advertises a **Backpacking Route Assistant that creates a personalized multi-day itinerary**" [S: dirtbagmaps.com, snippet]. **Signal:** attribute filters + recency-weighted community reports are the discovery stack; "recent conditions" is a trust feature Maps-style ratings don't provide.

### 4.8 GetYourGuide — *category-first things-to-do search*
Flow: search destination → "Tours with the **highest reviews rank highest**" → filter taxonomy: "For first-time visitors / Landmarks & monuments / Entry tickets / Family-friendly activities / Culture & History / Guided tours / Viewing points" plus Duration and (behind **See More Categories**) Private Tours [R: theatlasheart.com/getyourguide-review/]. "Using the filters… **cuts my results in half, sometimes more**. From there, it's easier to find tickets." Serendipity quote: "I often find **opportunities I hadn't thought of, like sandboarding or kayaking through caves**." Badges: "the Best-Seller certificate indicates the highest quality tours" [R: same]. **Weaknesses:** self-guided audio tours are "listed as 'Other Experience'… I had to click on the tours to check that they were in fact audio or visual tours" — taxonomy debt; downloads route through third-party agency apps [R: same]. **Signal:** persona-shaped categories ("first-time visitors") outperform generic type filters; badges compress quality signals pre-click.

---

## 5. CONVERGENT HIGH-SIGNAL PATTERNS TABLE

| Pattern | Google Maps | Airbnb | Tripadvisor | Others | Why it works |
|---|---|---|---|---|---|
| **1. One-tap save to a named collection (heart/star → list)** | Save → list; defaults encode intent (Want to go / Favorites / Travel plans) [R: 3184808, 7280933] | Heart → wishlist; same-search saves auto-bucket [R: 1236] | Save ideas to a Trip; uncheck what you don't want [R: sevencorners] | AllTrails favorites; Mindtrip Favorite→collection (Part 1); GYG wishlist | Memory without commitment: reversible, zero-form, instantly re-findable [R: 3184808; 1236] |
| **2. Save remembers its context** | Save works from any surface incl. embedded website maps [R: 3184808] | "Wishlist entries are saved with the dates you originally searched" [R: 1236] | Quiz answers (dates, party, interests) persist into the trip [R: sevencorners] | TripIt confirmations carry booking facts [R: callumelsdon] | Re-entry without re-specifying; wishlist → booking is one step |
| **3. Map as the search engine (pan/zoom = query)** | Explore tab = area-scoped feed of "hotspots… events, trendy restaurants, things to do" [R: 144349] | 80% of searches originate from map movement; map bounds are implicit queries [R: arxiv 2407.00091] | Saved trip folder → map of just those places [S: TA forum] | Roadtrippers: the route *line* is the query [R: roadtrippers.com] | Spatial intent is richer than form fields; browsing stays in context |
| **4. Split view desktop / map-sheet mobile** | Place sheet keeps map pannable behind it (bottom-sheet pattern; NN/g cites Maps' nonmodal destination sheet) [S: nngroup.com search snippet] | Cards-left/map-right grid on web; full-screen map + top card on mobile [R: arxiv 2407.00091; S: airbnb.tech] | UNKNOWN (web-first builder) | Komoot: desktop planner ↔ mobile sync [S: play.google.com] | Parallel browse (list) + inspect (map) on large screens; single-focus modalities on small |
| **5. Visual hierarchy / tiering on the map** | Default list layers hide/show on map [R: 7280933]; Extraordinary-places icons (Roadtrippers analog) | Regular price-pins vs mini-pins (8× lower CTR by design); center-biased attention [R: arxiv 2407.00091] | — | Roadtrippers colorful "Extraordinary Places" icons [R: roadtrippers.com] | Decluttering beats completeness; attention is scarce and spatially biased [R: arxiv §6–7] |
| **6. Photo-first card with price/rating before click** | Explore "very picture-forward" [S: droid-life]; place sheet = media → rating → price → hours → actions [R: Places UI Kit] | List cards: image, price, rating, details [R: arxiv 2407.00091] | Listing photos + review counts everywhere [R: /Trips copy: "top-rated"] | GYG "tours with the highest reviews rank highest" + Best-Seller badge [R: theatlasheart] | Users triage visually; the card must answer "is this for me?" without a click |
| **7. Progressive filtering: 3 primary inputs + chips + More** | Search-first; filters under Explore categories [R: 144349] | Destination/dates/guests → Filters button → 10 groups + recommended-for-you filters [R: 479] | Multiple-choice quiz (destination/dates/party/interests) [R: sevencorners] | GYG category chips + Duration + See More [R: theatlasheart]; Komoot distance/difficulty/transit [R: komoot.com]; AllTrails location/difficulty/length/features [S: timeside] | Serves both modes: "just want to browse" vs "know exactly what you want" [R: 479] |
| **8. Category-first serendipity for unknown-unknowns** | Events + trending in Explore [R: 144349] | 56 Categories — "discover millions of homes you never knew existed"; map zooms to category [S: news.airbnb.com] | Destination+interest-shaped categories in rebuilt builder [R: medium.com/tripadvisor] | GYG "For first-time visitors…"; RT "Extraordinary Places" [R: theatlasheart; roadtrippers.com] | Broadens consideration set; persona-shaped labels self-select better than type filters |
| **9. Discovery inside an existing trip/booking** | You tab holds Reservations + Saved trips [R: 144349] | Nearby POI map around booked stay; time-distance; add-to-day; shared pins [R: 4192]; context-ranked cross-sell [R: 39] | Saves feed the AI builder post-quiz [R: sevencorners] | TripIt (post-booking container); Polarsteps (in-trip steps) [R: callumelsdon; mattsnextsteps] | Highest intent = after commitment; the trip is the context that makes nearby suggestions relevant |
| **10. Collaboration on the saved object** | Shared lists: invite-to-edit, follow (→ suggestions) [R: 7280933] | Wishlist collaborators: notes, votes up/down, date/guest edits [R: 1236]; trip map co-pinning [R: 4192] | "Collaborate with friends" on Trips [R: /Trips] | TripIt trip sharing [R: callumelsdon]; Polarsteps Travel Buddies [R: mattsnextsteps]; Mindtrip group chat (Part 1) | Travel decisions are group decisions; voting/comments de-risk the plan |
| **11. AI as on-demand organizer, not auto-itinerary** | — (Your Match % only [S: timesnownews]) | — | Rebuilt builder: save-first → "choose to have AI organize it into a daily plan, or just save the list" [R: medium.com/tripadvisor] | Google Flights: "describe your ideal trip" AI deal search [R: travel.google.com]; AllTrails Route Assistant [S: dirtbagmaps] | "Travelers really enjoy planning"; control + scannability beat a done-for-you wall of days [R: medium.com/tripadvisor] |
| **12. Offline as first-class behavior** | Offline areas + shortcuts [R: 144349 refs] | — | — | Komoot offline maps + voice nav [R: komoot.com]; AllTrails GPS offline [S: maketecheasier]; TripIt offline [R: callumelsdon]; Polarsteps offline tracking [R: mattsnextsteps] | Travel happens in connectivity gaps; plans must survive them |

---

## 6. ANTI-PATTERNS OBSERVED IN THE WILD (do NOT copy)

| # | Anti-pattern | Who / evidence | Source URL |
|---|---|---|---|
| AP1 | **Manufactured urgency & scarcity** ("X people are looking at this property", countdown timers, "limited time" without deadline) | Booking.com as the canonical example; CMA warning letters + agreed changes after hotel-booking probe; Princeton: 393 countdown timers, 88 limited-time messages across 11K sites; more popular sites use dark patterns *more* | [S] https://fastercapital.com (snippet) ; [S] https://www.bbc.co.uk/news (2018, snippet) ; [S] https://www.insidermedia.com (Feb 2019, snippet) ; [R] https://webtransparency.cs.princeton.edu/dark-patterns/ |
| AP2 | **AI day-by-day itinerary before relevance/control** (v1 Tripadvisor: relevancy complaints, early-stage users wanted flexibility, 40 s latency) | Tripadvisor's own post-mortem | [R] https://medium.com/tripadvisor/cracking-the-code-to-the-ai-travel-planner-27d8d0f222c8 |
| AP3 | **Map occlusion** — a floating card covering the lower map region makes pins unreachable | Airbnb mobile web (found via 2-D CTR analysis, then fixed) | [R] https://arxiv.org/html/2407.00091v1 |
| **AP4** | **Geographic incoherence in generated days** (zigzag across town; no geo-grouping) | Tripadvisor AI builder test | [R] https://www.sevencorners.com/blog/travel-tips/should-you-use-ai-to-plan-your-vacation |
| AP5 | **Ignoring soft constraints** (family-friendly filter → party bus recommendation) | Tripadvisor AI builder test | [R] same |
| AP6 | **Organization collapse at save-scale** (200–500 saved trips, no useful sort/search) | Tripadvisor support forum | [S] https://www.tripadvisor.com/ShowTopic-g1-i12105-k15441212-… (snippet) |
| AP7 | **Paywalling the plan mid-enthusiasm** (3 stops free → 20/50/150 by tier) | Roadtrippers pricing grid | [R] https://roadtrippers.com/ |
| AP8 | **Taxonomy debt** (self-guided audio tours hidden under "Other Experience"; check-every-card to know what it is) | GetYourGuide | [R] https://theatlasheart.com/getyourguide-review/ |
| AP9 | **Stale/unverifiable editorial data** (outdated Covid rules; "not feeding me admission prices from 2023"; hallucinated restaurants from generic LLMs) | TripIt review; Seven Corners test of AI planners | [R] https://callumelsdon.com/travel-app-review-tripit/ ; [R] https://www.sevencorners.com/… |
| AP10 | **Losing user-saved memories** (sync failure losing trip photos) | Polarsteps App Store reviews | [S] https://apps.apple.com (Polarsteps listing, snippet) |
| AP11 | **Removing export/ownership paths → users export to Excel defensively** | Tripadvisor community advice | [S] https://www.facebook.com/Tripadvisor/videos/… (snippet) |
| AP12 | **No keyword search at all** (filter-only world forces browse when users have a specific word in mind) | Airbnb help doc | [R] https://www.airbnb.com/help/article/479 |

---

## 7. THE 10 STRONGEST CONVERGENT INTERACTION PRINCIPLES (distilled)

1. **One-tap save into intent-named collections** is the atomic unit of discovery (GM Save→"Want to go"; AB heart→wishlist; TA save-to-trip) — never a form, never a dialog with required fields.
2. **Save must carry its context** (searched dates, source surface, party size) so it can convert later without re-entry (AB wishlist dates; TripIt confirmations).
3. **The map is the query**: panning/routing is how users actually search (80% of Airbnb searches; Roadtrippers' route line) — build map-native filtering, not just list filters.
4. **Tiered visual hierarchy on maps beats completeness** (AB mini-pins 8× less attention; center-biased attention) — curate which pins shout.
5. **Card = photo + price/rating + one identity line before the click** (AB cards; GM place sheet content model; GYG Best-Seller badge) — triage happens on the card, not in the detail.
6. **Progressive filtering from a 3-field contract** (where/when/who) with persona-shaped category chips and a "More" refuge (AB; GYG; Komoot; AllTrails).
7. **Category-first serendipity** surfaces what users didn't think to ask for (AB 56 Categories; GYG "first-time visitors"; RT Extraordinary Places; GM events/trending).
8. **Discovery continues inside the booked trip**: nearby map with *time-distance*, add-to-day, co-traveler sharing (AB 4192 + context-ranked cross-sell; GM You-tab reservations).
9. **AI organizes on demand; humans curate first** — saves/categories in, day-by-day only when asked (TA rebuild: 2× saves, +10% CSAT; latency 40 s→6.5 s).
10. **Collaboration lives on the saved object** (votes, notes, shared editable lists/maps — GM invite-to-edit, AB wishlist voting, TA trips, TripIt sharing) — a share link alone is the 2015 version of collaboration.

**Cross-check with Part 1 (Mindtrip/ALMA/Wanderlog):** principles 1, 6, 9, 10, 12 (offline) and the "answer inside the response / logistics first" ALMA findings are the same convergence seen from the AI-native products — the incumbents' mechanics and the AI-natives' mechanics meet on: *save-first, map-native, category-serendipity, AI-on-demand, collaborate-in-plan, offline-first*.

---

## 8. SOURCES CONSULTED (all URLs)

**Read in full this session [R]:**
1. https://support.google.com/maps/answer/7280933 — Create a list of places (Google Maps Help)
2. https://support.google.com/maps/answer/3184808 — Save favorite places (Google Maps Help)
3. https://support.google.com/maps/answer/144349 — Get started with Google Maps (tabs, Explore/You/Contribute)
4. https://support.google.com/maps/answer/9948049 — Find your places & lists in the You tab
5. https://mapsplatform.google.com/maps-products/places-ui-kit — Places UI Kit (place card content model)
6. https://www.airbnb.com/help/article/39 — How search results work
7. https://www.airbnb.com/help/article/252 — Search for Airbnb home listings
8. https://www.airbnb.com/help/article/479 — Using search filters
9. https://www.airbnb.com/help/article/1236 — Use wishlists to save listings
10. https://www.airbnb.com/help/article/4192 — Find and save places of interest near a home
11. https://arxiv.org/html/2407.00091v1 — Learning to Rank for Maps at Airbnb (Haldar et al., 2024)
12. https://www.tripadvisor.com/Trips — Trips landing (JS-gated; tagline + nav captured)
13. https://medium.com/tripadvisor/cracking-the-code-to-the-ai-travel-planner-27d8d0f222c8 — Cracking the code to the AI travel planner (Tripadvisor Tech, Jan 2025)
14. https://www.phocuswire.com/tripadvisor-travel-planning-tool-powered-by-openai — Tripadvisor integrates OpenAI (Jul 2023)
15. https://www.sevencorners.com/blog/travel-tips/should-you-use-ai-to-plan-your-vacation — Hands-on test of 5 AI planners incl. Trip Builder (Aug 2025)
16. https://mattsnextsteps.com/polarsteps-review/ — Polarsteps honest review
17. https://callumelsdon.com/travel-app-review-tripit/ — TripIt app review
18. https://theatlasheart.com/getyourguide-review/ — GetYourGuide review (2026)
19. https://www.komoot.com/ — Komoot homepage (product copy)
20. https://roadtrippers.com/ — Roadtrippers homepage (product copy + pricing grid)
21. https://travel.google.com/ — Google Flights / travel.google.com
22. https://webtransparency.cs.princeton.edu/dark-patterns/ — Dark Patterns at Scale (Mathur et al., CSCW 2019)

**Search-result snippets only [S] (used with snippet-level caution):**
23. https://airbnb.tech/…/TB-254MapsRankingOptimizationInAirbnb_20250505doNotRead.pdf — full-screen mobile / half-screen web map
24. https://news.airbnb.com/the-airbnb-2022-summer-release/ — 56 Categories, map zoom per category
25. https://www.hospitalitynet.org/news/4110979.html — Summer Release mirror (Categories, Split Stays)
26. https://code.likeagirl.io/a-ux-study-of-airbnbs-iconic-horizontal-scroll-sub-navigation-207dce011284 — 61-icon sub-nav
27. https://www.droid-life.com/2018/06/26/… — Explore tab "very picture-forward" (snippet)
28. https://www.timesnownews.com / https://www.elitedaily.com / https://www.androidauthority.com / https://www.gsmarena.com / https://searchengineland.com / https://www.newsweek.com / https://www.fonearena.com — 2018 Explore/For You/Your Match/Group planning coverage (snippets)
29. https://www.businessghana.com / https://www.itechguides.com — saved-places tab: favorites/want-to-go/starred/custom lists (snippets)
30. https://www.nngroup.com (bottom-sheets article, search snippet) — nonmodal bottom sheet in Google Maps
31. https://www.tripadvisor.com/ShowTopic-g1-i12105-k6628185-… — saved trip → map view (snippet)
32. https://www.tripadvisor.com/ShowTopic-g1-i12105-k15441212-… — 200+ saved trips unfindable (snippet)
33. https://www.tripadvisor.com/ShowTopic-g1-i12104-k14660679-… — itinerary improvement ideas (snippet)
34. https://www.facebook.com/Tripadvisor/videos/plan-really-good-trips/… — "copy into Excel" advice (snippet)
35. https://apps.apple.com (Roadtrippers listing; Polarsteps listing + reviews; Komoot listing) — snippets
36. https://play.google.com/store/apps/details?id=com.roadtrippers — route-number complaint (snippet)
37. https://play.google.com/store/apps/details?id=com.polarsteps — automatic route tracking copy (snippet)
38. https://play.google.com/store/apps/details?id=de.komoot.android — desktop/mobile sync copy (snippet)
39. https://www.pilotplans.com (Roadtrippers review; Komoot review) — snippets
40. https://dinkumtribe.com — Roadtrippers family review (snippet)
41. https://ideausher.com — Polarsteps offline/3D-map/battery description (snippet)
42. https://www.itechguides.com/tripit-review/ (2026) + https://www.thesmbguide.com + https://traveltalk.nz — TripIt email-forward behavior (snippets)
43. https://www.bikeradar.com — Komoot riding-type/ability routes (snippet)
44. https://forum.cyclinguk.org — Komoot route-quality criticism (snippet)
45. https://www.trustpilot.com (komoot.com reviews) — snippet
46. https://www.shesgoingsolo.co.uk — AllTrails database/3D flyover (snippet)
47. https://thekaspack.com — AllTrails trail info + recent reviews (snippet)
48. https://timeside.com — AllTrails location/difficulty/length/features discovery (snippet)
49. https://maketecheasier.com — AllTrails offline GPS (snippet)
50. https://www.mortonsonthemove.com — AllTrails 50M users (snippet)
51. https://dirtbagmaps.com — AllTrails Backpacking Route Assistant; Komoot Premium multi-day planner (snippet)
52. https://www.groupon.com/coupons/blog/tripadvisor-trip-planning-guide — AI planner entry via Trips page (snippet)
53. https://blog.vacation-planner.app — Google Trips discontinued Aug 2019, absorbed into Maps/Travel (snippet)
54. https://finance.yahoo.com — Google Travel eliminated trip summary feature (May 2023, snippet)
55. https://thepointsguy.com — 2019 trips surfaced at google.com/travel (snippet)
56. https://fastercapital.com — Booking.com "X people are looking at this property" as urgency example (snippet)
57. https://hackernoon.com — Psychology of scarcity messages (snippet)
58. https://www.bbc.co.uk/news (Jun 28, 2018) — CMA warning letters to booking sites (snippet)
59. https://www.insidermedia.com (Feb 6, 2019) — booking sites agreed changes after CMA probe (snippet)

**Not accessible this session (404/Cloudflare/JS-gate — claims NOT used beyond snippets):** news.airbnb.com full release page, hospitalitynet full text, droid-life/fonearena article bodies, nngroup.com bottom-sheets full article, several 404'd review URLs (androidauthority, itechguides lists page, theplanetd, pilotplans review bodies, deceptive.design Expedia page, gov.uk CMA press release URL, Yahoo Finance article body, tineo.ai blog).

---

## 9. TRANSLATION TO ISSUE #8 (short design implications — research-derived only)

1. **Save-loop first:** every card (destination, experience, POI, event) gets a one-tap save into intent-named shelves ("Želim obiskati" / "Priljubljeno" / per-trip) — mirroring G1–G2, A12, T1.
2. **Map = query surface:** pan/route re-filter results; pin tiers for promoted vs ordinary supply (A4–A7); never let UI occlude the lower map region (AP3).
3. **Card contract:** photo → title → rating/price → 1 action row, identical everywhere (G11, A8).
4. **Search contract:** destination/dates/party + category chips + "More filters"; keyword search must ALSO exist (AP12).
5. **Post-booking discovery tab:** booked trip → nearby pins with time-distance → add-to-day → share with co-travelers (A15–A16).
6. **AI on demand:** generate categorized idea cards → user saves/rejects → "organize my day" as an explicit button (T1–T3); geo-group days (AP4) and honor soft constraints (AP5).
7. **Collaboration on the object:** shared editable list/trip with votes and notes (G4, A13, T8).
8. **Honesty rules:** no fake urgency (AP1), no over-promising what a save does ("does not make a booking" — A15), visible limits (3,000-entry style caps documented, AP6).

*(These implications are research conclusions for the Issue #8 design phase, not implemented changes.)*
