# FUNCTION-PARITY-BEFORE — Funkcionalna inventura (PARITY BASELINE)

> **Namen:** GitHub issue #19 »DISCOVER — Premium Product Presentation & 100 % Feature Preservation«, FAZA A — AUDIT.
> Ta datoteka je **PARITY POGODBA**: vsaka funkcija, tu našteta, mora ob koncu predelave (FAZA F) ostati
> preverljivo prisotna. **Funkcija, ki NI na tem seznamu, je lahko tiho izgubljena brez detekcije** — zato
> dokument teži k popolnosti, ne k lepoti proze.
>
> **Baseline:** HEAD `f599e82`, verzija **1.153.2** (QH-2), produkcijsko ŽIVA na Vercelu. Suite 4413/4413, tsc 0, eslint 0.
> **Metoda:** enumeracija iz DATOTEČNEGA SISTEMA (Glob `src/app/**/page.tsx`, `src/app/api/**/route.ts`), branje
> ključnih page/component/lib datotek, spot-check predhodnih auditov 17-A/17-B/QH-1/QH-2 (worklog) — kjer je
> podatek povzet po auditu, je označen »(17-B)« ipd. Preverjeno tudi: docs/PRODUCT-FUNCTIONALITY-MATRIX.md
> (zastarel — 1.110-era, uporabljen le za orientacijo), docs/ANALYTICS-EVENTS.md (dogodki, spot-check v kodi).
>
> **Format vrstice:** `Funkcija | Lokacija | Trenutno obnašanje | Vstopna točka | Cilj/sprememba stanja`

## Števci (baseline)

| Kaj | Številka | Vir |
|---|---|---|
| Strani (`page.tsx`) | **39** (+ `not-found.tsx`) | Glob, 2026-10-01 |
| Ne-API route handlerji | **6** (`sitemap.xml`, `robots.txt`, `rss.xml`, `llms.txt`, `llms-full.txt`, `go/[provider]`) | git ls-files |
| API endpointi (`src/app/api/**/route.ts`) | **144** kanonskih + 1 scaffolding `GET /api` (»Hello, world!«) = 145 datotek | git ls-files |
| Skupaj `route.ts` v `src/app` | **151** | git ls-files |
| Komponente (`src/components/**/*.tsx`) | ~199 (od tega ~48 shadcn/ui primitivov v `ui/`) | git ls-files |
| Lib moduli (`src/lib/**/*.ts`, brez testov) | ~126 | git ls-files |
| Hooks (`src/hooks/`) | 8 (`use-my-trip`, `use-wishlist`, `use-trip-chat`, `use-trip-presence`, `use-trip-version-poll`, `use-toast`, `use-mobile`, `use-supply-query` v lib) | LS |
| Add »Dodaj v mojo pot« površin | **22** (audit 17-B, spot-check 2026-10-01) | 17-B + spot-check |
| Strani z Chatbot komponento | **20** (Grep `from "@/components/chatbot"` = 20 datotek) | Grep |
| Ponudniki v supply registru | **16** (osm, fsq, sto, own, booking, viator, getyourguide, tiqets, kiwitaxi, discovercars, skyscanner, omio, airalo, worldnomads, safetywing, travelpayouts) | registry.ts |
| Affiliate providerji (`/go/*`) | **11** (hotels, cars, activities, flights, insurance, esim, transfers, transport, tickets, viator, getyourguide) | affiliate.ts |
| Funkcijske vrstice v tem dokumentu | **387 tabelnih vrstic** (≈373 funkcij; ostalo so števci/legende) + 22 Add površin (številčni seznam §4.2) | grofje rg |

---

## 1. Rute aplikacije (39 strani + not-found + 6 ne-API handlerjev)

Vse poti so SL-kanon (locale prefix se doda prek proxyja — glej §17). Navedene so vrstice RUTE; funkcionalne
podrobnosti strani so v §2.

| Funkcija | Lokacija | Trenutno obnašanje | Vstopna točka | Cilj/sprememba stanja |
|---|---|---|---|---|
| Domača stran `/` | `src/app/page.tsx` | Hub ODKRIJ: 13 blokov (glej §2.1), hreflang ×6, locale-zavedni metapodatki | `/`, `/en`, `/it`, `/de`, `/fr`, `/es` | — |
| Načrtovalnik `/nacrtuj` | `src/app/nacrtuj/page.tsx` | AI planner + kviz + skupnostne poti (§2.2, §8) | Nav CTA, hero, tab bar | localStorage zadnji načrt, `heroQuery` |
| Zemljevid `/zemljevid` | `src/app/zemljevid/page.tsx` | Leaflet SI+Balkan, FSQ sloj, supply, geo deep-linki (§9) | Nav/tab/ExploreHub | query `?lat&lng&zoom&label` |
| Moja potovanja `/moja-potovanja` | `src/app/moja-potovanja/page.tsx` | Trip hub gost+uporabnik (§2.4, §7) | Nav/tab/badge | sync zbirke ob prijavi |
| Na poti `/na-poti` | `src/app/na-poti/page.tsx` | Go Mode Now&Next, GPS, glas (§10) | Tab POJDI, MyTripView trak | `dai:go-trip` + progress |
| Potovanje `/potovanje` | `src/app/potovanje/page.tsx` | JourneyPlanner čez vse ponudnike (§2.3) | Nav Več/ExploreHub/footer | izbire supply + `dai:go-trip` |
| Destinacije `/destinacije` | `src/app/destinacije/page.tsx` | 38 destinacij, filtri, zbirke (§2.6) | Nav ODKRIJ | — |
| Destinacija hub `/destinacija/[slug]` | `src/app/destinacija/[slug]/page.tsx` | SSG hub ×38: hero, praktično, Add, ChatAskCTA, AffiliateCTA, povezane plasti | Klik destinacije (kartica/iskanje) | `destinationViewed` event (Pass) |
| Things to do `/destinacija/[slug]/things-to-do` | isto drevo | SSG aktivnosti po destinaciji | hub | — |
| Itinerary `/destinacija/[slug]/itinerary/[duration]` | isto drevo | SSG predgenerirani itinererji (5 trajanj) | hub | — |
| Best time `/destinacija/[slug]/best-time-to-visit/[season]` | isto drevo | SSG sezonski vodniki (4 sezone) | hub | — |
| Vodnik `/destinacija/[slug]/guide/[type]` | isto drevo | SSG vodniki po tipu (4 tipi) | hub | — |
| Doživetja `/dozivetja` | `src/app/dozivetja/page.tsx` | ExperiencesSection + MarketplaceSection | Nav Več | modal doživetja |
| Dogodki `/dogodki` | `src/app/dogodki/page.tsx` | EventsCalendar + Add na dogodke | Nav Več | zbirka `kind: event` |
| Lokali `/lokali` | `src/app/lokali/page.tsx` | ListingsSection (filtri/sort/featured-first) | Nav Več | modal lokala |
| Tržnica `/trznica` | `src/app/trznica/page.tsx` | MarketplaceSection (izdelki, košarica) | Nav Več | košarica (cart-store) |
| Vodiči `/vodici` | `src/app/vodici/page.tsx` | BlogSection (ADRIA/SLO-LOOP/WINTER) + AskLocal + GuideAddToTrip | Nav Več | — |
| Vodič detail `/vodici/[slug]` | `src/app/vodici/[slug]/page.tsx` | SSG vsebinski vodnik + AffiliateCtaBlock + GuideAddToTrip + ChatAskCTA | seznam | `destinationViewed` |
| Slovenia Pass `/slovenia-pass` | `src/app/slovenia-pass/page.tsx` | SloveniaPassSection (§20) | Nav Več | `discoverslovenia_pass` |
| Deljena pot `/pot/[shareId]` | `src/app/pot/[shareId]/page.tsx` | SSR skupnostna pot (§15): vsečki, klepet @AI, ankete, dnevnik, stroški, rezervacije, kolaboracija | share URL | +view, vloge, revizije |
| Embed pot `/pot/embed/[shareId]` | `src/app/pot/embed/[shareId]/page.tsx` | Isto jedro brez lupine, CSP frame-ancestors * (samo ta pot) | iframe na tujih straneh | — |
| Konzultacija `/konzultacija/[token]` | `src/app/konzultacija/[token]/page.tsx` | AI konzultacija: ConsultationPartnerCards + RefSetter + DestinationAdd | e-poštna povezava | ref SET + dodaj v pot |
| Primerjava `/primerjava` | `src/app/primerjava/page.tsx` | Iskrena primerjava AI načrtovalnikov | Nav Več/footer | — |
| Vir podatkov `/vir-podatkov` | `src/app/vir-podatkov/page.tsx` | E-E-A-T stran o virih (T1/T2/T3) | footer | — |
| Za ponudnike `/za-ponudnike` | `src/app/za-ponudnike/page.tsx` | JoinUs + PitchDeck + cenik (#pridruzi-se) | footer/nav | lead → /api/leads |
| O strani `/o-strani` | `src/app/o-strani/page.tsx` | E-E-A-T about | footer | — |
| Kontakt `/kontakt` | `src/app/kontakt/page.tsx` | Kontaktni obrazec | footer | — |
| Pogoji `/pogoji-uporabe` | `src/app/pogoji-uporabe/page.tsx` | Pravna stran | footer | — |
| Zasebnost `/politika-zasebnosti` | `src/app/politika-zasebnosti/page.tsx` | Pravna stran | footer | — |
| Zaupanje `/zaupanje-in-varnost` | `src/app/zaupanje-in-varnost/page.tsx` | Varnost/zaupanje | footer | — |
| Prijava `/prijava` | `src/app/prijava/page.tsx` | NextAuth prijava B2C (+ povezava registracija) | Nav RAČUN/footer | seja |
| Pozabljeno geslo `/pozabljeno-geslo` | `src/app/pozabljeno-geslo/page.tsx` | Zahteva za reset | prijava | e-pošta (demo: izpis) |
| Reset gesla `/reset-gesla` | `src/app/reset-gesla/page.tsx` | Novo geslo prek tokena | e-poštna povezava | geslo spremenjeno |
| Preverba e-pošte `/preverba-emaila` | `src/app/preverba-emaila/page.tsx` | Verifikacija B2C računa | e-poštna povezava | emailVerified |
| Admin `/admin` | `src/app/admin/page.tsx` | AdminDashboard (21 admin API, §18) | `/admin` + prijava | DB (listings, leads …) |
| Owner dashboard `/owner/dashboard` | `src/app/owner/dashboard/page.tsx` | B2B nadzorna plošča (23 owner API, §18) | `/owner/prijava` | DB (listings/izdelki/izkušnje/payouts) |
| Owner prijava `/owner/prijava` | `src/app/owner/prijava/page.tsx` | B2B prijava | footer ZA PONUDNIKE | owner seja |
| Owner reset gesla `/owner/reset-gesla` | `src/app/owner/reset-gesla/page.tsx` | Reset B2B | e-pošta | geslo |
| Owner preverba `/owner/preverba-emaila` | `src/app/owner/preverba-emaila/page.tsx` | Verifikacija B2B | e-pošta | emailVerified |
| 404 `not-found.tsx` | `src/app/not-found.tsx` | Blagovna 404 z 2 izhodoma (domov/načrtuj), EN detekcija po poti | katera koli neznana pot | — |
| `sitemap.xml` | `src/app/sitemap.xml/route.ts` | Gostitelju-prilagojen sitemap + hreflang alternati (§17) | GET `/sitemap.xml` | — |
| `robots.txt` | `src/app/robots.txt/route.ts` | Allow-all + disallow /admin,/owner,/api + AI crawlerji + Sitemap | GET `/robots.txt` | — |
| `rss.xml` | `src/app/rss.xml/route.ts` | RSS 2.0: things-to-do + vodniki (edini z resničnim pubDate) | GET `/rss.xml` | — |
| `llms.txt` | `src/app/llms.txt/route.ts` | GEO navigacijski format (llmstxt.org) iz istih podatkov | GET `/llms.txt` | — |
| `llms-full.txt` | `src/app/llms-full.txt/route.ts` | GEO razširjeno (polni opisi destinacij) | GET `/llms-full.txt` | — |
| Affiliate redirect `/go/[provider]` | `src/app/go/[provider]/route.ts` | 302 na partnerja, fail-closed, tracking (§12.3) | CTA po celotni aplikaciji | AnalyticsEvent + PageView |

**Opomba (iskrenost):** `src/app/api/route.ts` (GET `/api` → `{message:"Hello, world!"}`) je scaffolding ostanek —
17-A ga ni štel v 144; tu je izrecno imenovan, da ne izgine neopaženo.

---

## 2. Glavne strani in njihovi primarni sekcije/komponente

### 2.1 Domača stran `/` (page.tsx — 13 blokov, HIDE ≠ DELETE)

| Funkcija | Lokacija | Trenutno obnašanje | Vstopna točka | Cilj/sprememba stanja |
|---|---|---|---|---|
| Hero (AI Concierge) | `sections/hero.tsx` + `hero-quick-input.tsx` + `chat-ask-cta.tsx` | Naravni jezik + 8 intent čipov + ChatAsk CTA | `/` | `sessionStorage heroQuery` → `/nacrtuj` |
| Nadaljuj svojo pot | `welcome-back-wrapper.tsx` | Kontinuacija vračajočega uporabnika | scroll pod herojem | — |
| Vstopna vrstica | `home-entry-row.tsx` | Narava · Hrana · Mesta · Doživetja · Dogodki | klik žetona | pripadajoča stran |
| Priljubljene destinacije | `sections/destinations.tsx` (featured=6) | 6 kartic + CTA na vseh | klik | `/destinacija/[slug]` |
| Doživetja (kategorije) | `sections/experiences.tsx` | Uredniško odkrivanje | klik | `/dozivetja` + modal |
| Priljubljene AI poti | `pre-generated-itineraries-wrapper.tsx` | Predgenerirani itinererji → prenos želje | klik | `heroQuery` event → planner |
| Razišči Slovenijo hub | `sections/explore-hub.tsx` | Povezave nivo-2 (zemljevid/dogodki/lokali/vodiči/tržnica/Pass) | klik | pripadajoče strani |
| Preveri svoj načrt | `sections/plan-check-section.tsx` v `<details>` | Validator TUJIH načrtov (ChatGPT/Mindtrip izvozi), 0 AI | prilepi načrt | `/api/plan-check` |
| Telemetrija validatorja | `sections/validator-telemetry-section.tsx` v `<details>` | Javne lastne številke + citati študij | odpri | `/api/plan-check/stats` |
| Zakaj Slovenija | `sections/stats.tsx` | Trust številke (CountUp) | scroll | — |
| Demo scenariji | `demo-scenarios-wrapper.tsx` | Pilotski scenariji → prenos želje | klik | `heroQuery` event |
| Rezerviraj | `sections/affiliate-section.tsx` | Booking hub (nastanitve/aktivnosti/prevoz/esim …) | klik | `/go/[provider]` |
| Novice + beta + ostalo | `newsletter-section.tsx`, `beta-banner.tsx`, `FunnelTracker`, `LegacyHashRedirect`, `Chatbot` | Prijava na novice, pasica, sledenje lijaka, hash redirecti | scroll/klik | `/api/newsletter/subscribe` |

### 2.2 `/nacrtuj` — glej §8 (ItineraryPlanner + TravelStyleQuiz + CommunityTrips + Chatbot)

### 2.3 `/potovanje` — JourneyPlanner (§12.1): koraki prihod/transfer/nastanitev/aktivnosti/prevoz,
JourneyTrip + JourneyMap + AddToTripButton na izbirah + »Zaženi Na poti« (saveGoTrip).

### 2.4 `/moja-potovanja` — `moja-potovanja-view.tsx`

| Funkcija | Lokacija | Trenutno obnašanje | Vstopna točka | Cilj/sprememba stanja |
|---|---|---|---|---|
| Account vrstica | moja-potovanja-view | Gost: prijava; uporabnik: odjava/račun/pozdrav/verifikacijski banner | mount | nextAuth |
| MyTripView (hub) | `components/my-trip-view.tsx` | Zbirka VEDNO vidna + trak NA POTI (če `dai:go-trip`) + wishlist most | mount | glej §7 |
| Lokalna potovanja (gost) | `lib/my-trips-storage.ts` (getSavedTrips) | Seznam shranjenih načrtov na napravi | mount | odpiranje `/pot/[shareId]` |
| Shranjena potovanja (račun) | GET `/api/user/trips` | Seznam + views + claim iz drugih naprav | mount prijavljeni | DB SavedItinerary |
| Moje AI konzultacije | GET `/api/consultations` | Seznam konzultacij uporabnika | mount prijavljeni | `/konzultacija/[token]` |
| MyOrdersSection | `components/my-orders-section.tsx` | Naročila tržnice po e-pošti | mount | GET `/api/orders/[orderNumber]` |
| MyTripAccountSync | `components/my-trip-account-sync.tsx` | Diff-sync zbirke med sejo (§7.4) | mount prijavljeni | POST/DELETE `/api/my-trip` |
| Chatbot (FAB) | chatbot.tsx | Asistent v hubu (F4) | FAB | glej §11 |

### 2.5 `/pot/[shareId]` — SharedTripScreen (§15): SharedTrip + TripCollaboration + TripPresence +
TripReservations + TripBudgetCard + TripDocumentsCard + TripGuide + TripDiary + TripPolls + TripSocial +
TripPushCard + PrintQr + Chatbot + PageViewTracker + JSON-LD.

### 2.6 Ostale strani — primarne sekcije

| Stran | Primarne komponente |
|---|---|
| `/destinacije` | DestinationsSection (filtri država/regija/tip/cena/ocena + sort) + CollectionsSection + Chatbot |
| `/dozivetja` | ExperiencesSection + MarketplaceSection + Chatbot |
| `/dogodki` | EventsCalendar + Chatbot |
| `/lokali` | ListingsSection (707 vrstic: filtri/sort/fetch/kartice) + ListingModal + Chatbot |
| `/trznica` | MarketplaceSection + ProductModal/kartice + košarica + CheckoutModal + Chatbot |
| `/vodici` + `/vodici/[slug]` | BlogSection + AskLocal + GuideAddToTrip; detail: AffiliateCtaBlock + GuideAddToTrip + ChatAskCTA + PageViewTracker |
| `/slovenia-pass` | SloveniaPassSection → SloveniaPass komponenta (§20) + Chatbot |
| `/za-ponudnike` | JoinUs (lead obrazec) + PitchDeckSection |
| `/konzultacija/[token]` | ConsultationPartnerCards + ConsultationRefSetter + ConsultationDestinationAdd |
| `/admin` | AdminDashboard (+ listing-form, affiliate-stats-panel) |
| `/owner/dashboard` | OnboardingWizard + ListingFormDialog + ProductFormDialog + ExperienceFormDialog + ExperienceAvailabilityDialog + PayoutLedgerPanel + SponsorshipPanel + AutoTagButton + SubscriptionCalculator |

---

## 3. Navigacija (Navigation + MobileTabBar + Footer + orodja)

| Funkcija | Lokacija | Trenutno obnašanje | Vstopna točka | Cilj/sprememba stanja |
|---|---|---|---|---|
| Desktop primarna vrstica | `sections/navigation.tsx` (useNavLinks) | ODKRIJ `/destinacije` · MOJA POT `/moja-potovanja` · ZEMLJEVID `/zemljevid` · POJDI `/na-poti` | klik | navigacija + `shell_nav_clicked` |
| Desktop »Več« dropdown | navigation (useMoreLinks/useToolLinks/useAccountLinks) | 3 skupine: ODKRIJ VEČ (dozivetja, vodici, dogodki, lokali, trznica, slovenia-pass); NAČRTUJ IN ORODJA (/potovanje, /nacrtuj#start-kjerkoli, /primerjava); RAČUN (/prijava) | klik Več | navigacija + analytics (label) |
| Primarni CTA »Načrtuj potovanje« | navigation | Gumb → `/nacrtuj` (korak NAČRTUJ) | klik | navigacija |
| Mobilna tab vrstica | `mobile-tab-bar.tsx` | ODKRIJ \| ZEMLJEVID \| MOJA POT (števčna značka iz zbirke) \| POJDI \| VEČ (odpre Sheet); aktivnost startsWith | klik | navigacija + `shell_nav_clicked {tab,surface:tabbar,items}` |
| Mobilni Sheet meni | navigation (Sheet) | Vse destinacije lupine v 4 skupinah + oznake ×6 jezikov | tab VEČ | navigacija |
| Scroll-aware glass + progress bar | navigation | Prozorna nad herojem → steklena po odscrollu; progress bar branja | scroll | — |
| Noga RAZIŠČI | `sections/footer.tsx` | 8 povezav: destinacije, dozivetja, zemljevid, dogodki, lokali, trznica, vodici, slovenia-pass | klik | navigacija |
| Noga NAČRTUJ | footer | 10: /nacrtuj, /nacrtuj#kviz, /nacrtuj#start-kjerkoli, /primerjava, /#rezerviraj, /moja-potovanja, /na-poti, /potovanje, /prijava | klik | navigacija |
| Noga ZA PONUDNIKE | footer | 4: /za-ponudnike, /owner/prijava, /za-ponudnike#pridruzi-se (×2) | klik | navigacija |
| Noga PRAVNO | footer | 4: /zaupanje-in-varnost, /politika-zasebnosti, /pogoji-uporabe, /kontakt | klik | navigacija |
| Izbirnik jezika | `language-switcher.tsx` | 6 jezikov (zastavica + ime); VIDNOST filtrirana po `isLocaleRoute` (ponuja samo jezike, ki na tej poti živijo) | klik Globe | navigacija na locale prefix |
| Preklop teme | navigation (useTheme) | Svetla/temna (next-themes), 6-jezikovni aria | klik | `.dark` na html |
| Dostopnostne nastavitve | `a11y-controls.tsx` | Dropdown: VISOK KONTRAST + BRALNI NAČIN stikali; prefetri v `dsa-a11y`; OS `prefers-contrast` fallback; no-flash skript v layoutu | klik ikone | `contrast-high`/`reading-mode` razredi na html |
| Pametno iskanje | `smart-search.tsx` (v Navigation) | NL iskanje → `/api/smart-search` (deterministično); skupine destinaciji/lokali/izdelki/doživetja z razlogom; AddToTripButton na vrsticah | ikona Search / `/` | navigacija (destinationHref) ali dodaj v zbirko |
| Košarica | `cart-drawer.tsx` + `lib/cart-store.ts` (zustand persist) | Števčna ikona + Drawer; addItem/remove/updateQuantity/clear; pošiljanje ≥50 € ali vsi shippingFree → 0, sicer 4,90 € | klik ikone | `dai-cart` localStorage + checkout modal |
| Priljubljene (wishlist) | `wishlist-sheet.tsx` (v Navigation) | Srček ikona → Sheet z zbirkami (§16) | klik ikone | `dai-wishlist` localStorage |
| MyTripAccountSync indikator | `my-trip-account-sync.tsx` | Sinhronizacija zbirke z računom (gost: nič) | mount | `/api/my-trip` |
| PWA ikone | `pwa/pwa-header-icons.tsx` | Namestitev PWA / offline namig | ikona v navigaciji | — |
| MyTrip števčna značka | mobile-tab-bar + navigation | Število idej v zbirki (myTripCount) | sprememba zbirke | prikaz count |
| LegacyHashRedirect | `legacy-hash-redirect.tsx` | `/#načrtuj` ipd. → prava ruta | prvi obisk s hash | navigacija |

---

## 4. CTA-ji (primarni/sekundarni + 22 Add površin)

### 4.1 Primarni CTA-ji

| Funkcija | Lokacija | Trenutno obnašanje | Vstopna točka | Cilj/sprememba stanja |
|---|---|---|---|---|
| »Načrtuj potovanje« | navigation (vse strani) | Primarni gumb lupine | klik | `/nacrtuj` |
| Hero vnos + čipi | `hero-quick-input.tsx` | 8 intent čipov (miren vikend, narava+hrana, morje+m gore, romantika, družina, hrana&vino, avantura, brez gužve) | submit/klik | `sessionStorage.heroQuery` → `/nacrtuj` |
| ChatAsk CTA | `chat-ask-cta.tsx` (hero + content pasovi) | Odpre klepet s pred-izpolnjenim vprašanjem (CHAT_ASK_EVENT, max CHAT_ASK_MAX) | klik | klepet odprt |
| »Nadaljuj načrtovanje« | `my-trip-view.tsx` + `wishlist-sheet.tsx` | Handoff zbirke v planner | klik | `setMyTripHandoff()` → `/nacrtuj` |
| »Kam zdaj?« (NA POTI trak) | my-trip-view | Če obstaja `dai:go-trip` | klik | `/na-poti` |
| »Zaženi Na poti« | journey-planner + itinerary-planner (K-7) | Persistira načrt na napravo | klik | `saveGoTrip()` → `/na-poti` |
| »Odkrij destinacije« | my-trip-view (prazna zbirka) | Okvir ODKRIJ | klik | `/destinacije` |
| »Shrani in deli« | itinerary-planner | Shrani načrt na strežnik + shareId | klik | POST `/api/itinerary/save` → `/pot/[shareId]` |
| »Na tržnici od €X« | itinerary-planner čip na postanku | Marketplace stop enrichment (D1) | klik | `/trznica` (filter destinacije) |
| Affiliate CTA bloki | `affiliate-section.tsx`, `affiliate-cta-block.tsx`, `sections/booking-panel.tsx`, product-modal, provider-panel | Rezerviraj pri partnerju | klik | `/go/[provider]?dest=&product=` |
| »Pridruži se« (B2B) | `sections/join-us.tsx` | Lead obrazec ponudnika | submit | POST `/api/leads` |
| Newsletter | `newsletter-section.tsx` | E-poštna prijava | submit | POST `/api/newsletter/subscribe` |

### 4.2 »Dodaj v mojo pot« — 22 kanonskih površin (audit 17-B; spot-check 2026-10-01: vse še prisotne)

Vse pišejo prek `addMyTripItem` (neposredno ali prek `AddToTripButton`/`useMyTrip`) — 0 localStorage bypassov (17-B).

1. Zemljevid POI popup (map-view — Leaflet lastni gumb, F3 write-through: zbirka + supply)
2. Zemljevid ProductModal (supply/product-modal.tsx — AddToTripButton kontrolirani način)
3. Zemljevid kartica produkta (supply/product-card.tsx)
4. Journey planner izbire (sections/journey-planner.tsx)
5. Chatbot kartice krajev (chatbot.tsx — chatPlaceTripItem kanon 1.153.0: T1→destination+SLUG, OSM→product+`osm:node-X`)
6. Klepet skupinski »+« (trip-social — SAMO deljena pot, CAS PATCH; meja poštenja 1.153.0)
7. Planner Dogodki med potovanjem (itinerary-events.tsx — lastni gumb, write-through SAMO dodajanje)
8. EventsCalendar (sections/events-calendar.tsx)
9. DestinationModal (sections/destination-modal.tsx)
10. Destinacija hub gumb (destination-add-to-trip.tsx — prepozna »V moji poti«, dedup)
11. Destinacija things-to-do
12. Konzultacija (consultation-destination-add.tsx)
13. Vodiči seznam (vodici/page.tsx — GuideAddToTrip)
14. Vodič detail (vodici/[slug]/page.tsx — GuideAddToTrip)
15. ListingModal (sections/listing-modal.tsx)
16. ListingsSection kartica (sections/listings.tsx)
17. ExperienceModal (sections/experience-modal.tsx)
18. SmartSearch vrstice rezultatov (smart-search.tsx)
19. WishlistSheet most (wishlist-sheet.tsx → addMyTripItem + setMyTripHandoff)
20. MyTripView wishlist most (my-trip-view.tsx — wishlistTripItemOf)
21. Planner trak »Iz moje poti« (planner-my-trip-strip.tsx)
22. Diff-sync merge (my-trip-sync.ts — union prek addMyTripItem)

Remove/clear površine (prav tako kanonske): gumb/modal/kartice/planner mirror (removeMyTripItem);
MyTripView + strip clear z undo snapshotom (clearMyTripItems); DELETE `/api/my-trip` (single+all).

---

## 5. Dialogi / modali / sheet-i

| Funkcija | Lokacija | Trenutno obnašanje | Vstopna točka | Cilj/sprememba stanja |
|---|---|---|---|---|
| DestinationModal | `sections/destination-modal.tsx` (869 vrstic) | Hub kartica destinacije: podatki, vreme, NearbyListing 2×2, Add | klik destinacije | zbirka + `destinationViewed` (Pass) |
| ListingModal | `sections/listing-modal.tsx` (492) | Praktični podatki lokala, geo, Add, CTA povpraševanja | klik lokala | zbirka `kind: listing` + `listingViewed` |
| ExperienceModal | `sections/experience-modal.tsx` (1956) | Podrobnosti izkušnje, razpoložljivost, rezervacijski obrazec, Add | klik doživetja | zbirka `kind: experience` |
| ProductModal (supply) | `supply/product-modal.tsx` (692) | Univerzalni modal ProviderProduct: vir/status, cena/ocena iskreno, Add (write-through) | klik markerja/kartice | zbirka + supply izbira |
| CollectionModal | `sections/collection-modal.tsx` | Zbirka (kuratorirana kategorija) s produkti/izkušnjami | klik zbirke | `/api/collections/[slug]` |
| WishlistSheet | `wishlist-sheet.tsx` (767) | Sheet priljubljenih z razdelki (§16) | srček v navigaciji | `dai-wishlist` |
| CartDrawer | `cart-drawer.tsx` (413) | Košarica + k checkoutu | ikona košarice | checkout |
| CheckoutModal | `checkout-modal.tsx` | Zaključek nakupa (demo plačilo) | gumb v cart drawerju | POST `/api/checkout` |
| Chatbot dialog | `chatbot.tsx` (1752) — glej §11 | FAB + dialog, mini mapa, pin/unpin, glas | FAB na 20 straneh | glej §11 |
| BookingBridgeDialog | `chat-booking-bridge.tsx` | Kontekstualne ponudbe destinacije iz klepeta (G6) | čip/kartica v klepetu | produkti/rezervacija |
| BookingAssistant | `booking-assistant.tsx` (453) | Povpraševanje ponudniku (4 koraki) → e-pošta | gumb na listingu | POST `/api/listing-inquiry` |
| ConsultationDialog | `consultations/consultation-dialog.tsx` | AI konzultacija v klepetu | homepage/strani | POST `/api/consultations` |
| ImageLightbox | `image-lightbox.tsx` | Povečava slik | klik sliko | — |
| ExperienceAvailabilityDialog | `owner/experience-availability-dialog.tsx` | Koledar razpoložljivosti (lastnik) | owner dashboard | `/api/owner/experiences/[id]/availability*` |
| Owner obrazci (dialogi) | `owner/listing-form.tsx`, `product-form.tsx`, `experience-form.tsx`, `onboarding-wizard.tsx` | Urejanje B2B ponudbe | owner dashboard | owner API-ji |
| My Trip pogledi | `my-trip-view.tsx` (hub) + `planner-my-trip-strip.tsx` (trak) + Sheet Več | Prikaz/akcije zbirke | nav/hub/planner | glej §7 |
| AlertDialog potrditve | itinerary-planner (brisanje dneva s postanki), go-mode (reset) | Destruktivna potrditev | klik | — |

---

## 6. Pomembne interaktivne komponente

| Funkcija | Lokacija | Trenutno obnašanje | Vstopna točka | Cilj/sprememba stanja |
|---|---|---|---|---|
| AddToTripButton | `add-to-trip-button.tsx` (237) | KANONSKI gumb »Dodaj v mojo pot«: nekrontroliran (useMyTrip) ali kontroliran (write-through); aria-pressed; 6 jezikov; toast + undo + FIFO opomba | vse Add površine | `dai:my-trip-items` |
| SmartSearch | `smart-search.tsx` (500) | NL iskanje 0-AI, 4 skupine, razlog zadetka, abort requestId, iskrena napaka | ikona v navigaciji | navigacija / zbirka |
| Chatbot | `chatbot.tsx` | Glej §11 (20 strani) | FAB | — |
| A11yControls | `a11y-controls.tsx` | Glej §3 | ikona | `dsa-a11y` |
| PartnerBadge | `partner-badge.tsx` | Featured > Premium > Verified (standard brez); tooltip | kartice modalov/listingov | — |
| AffiliateBadge | (lokalne izvedbe v karticah) | Affiliate »Prek partnerja« oznaka | supply kartice | — |
| Reveal | `reveal.tsx` | Scroll-reveal fade+dvig, once, prefers-reduced-motion | sekcije strani | — |
| LoadingState / EmptyState / ErrorState | `states/*` (+ `states/index.ts`) | Družina enotnih stanj (aria-live, skeleton, EmptyState z naslednjim dejanjem) | vse nalagalne površine | — |
| OpeningHoursStatus | `opening-hours-status.tsx` | OPEN/CLOSED/UNKNOWN iz lib/opening-hours (DST varno) | planner/journey/go | — |
| CountUp | `count-up.tsx` | Animirane številke (stats) | stats sekcija | — |
| FunnelTracker / PageViewTracker / MapOpenedTracker / SessionLocaleKpi | `funnel-tracker.tsx`, `page-view-tracker.tsx`, `map-opened-tracker.tsx`, `session-locale-kpi.tsx` | Sledenje lijaka (POST /api/track-funnel, /api/admin/track-pageview), `map_opened`, `session_locale` KPI | mount strani | DB PageView/AnalyticsEvent |
| LegacyHashRedirect | glej §3 | hash → rute | mount | navigacija |
| PwaUpdateToast | `pwa/pwa-update-toast.tsx` | Toast »Osveži« ob novi SW verziji (dai:sw-update) | SW update | reload |
| ItineraryAudio (DayAudioButton) | `itinerary-audio.tsx` | Zvočni povzetek dneva — brskalniški TTS (ZERO-AI) | gumb na dnevu | govori |
| GoAudioButton | `sections/go-audio-button.tsx` | PREBERI glasovni vodnik Go Mode (§10) | gumb na /na-poti | govori |
| TripTimeline | `trip-timeline.tsx` | Časovnica dneva načrta + reorder + DayAudio + WeatherChip | planner/shared | načrt |
| TripMapPanel | `trip-map-panel.tsx` | Leaflet pot načrta v plannerju (F5.1) | gumb zemljevid načrta | prikaz poti |
| ItineraryRefiner | `sections/itinerary-refiner.tsx` | Prosti ukazi / hitre akcije (§8) | vrstica nad načrtom | PATCH načrta |
| ItineraryEvents | `itinerary-events.tsx` | Dogodki med/pred potjo + Add | po generaciji | zbirka kind: event |
| ItineraryWeather (WeatherChip) | `itinerary-weather.tsx` | Čip vremena na dnevni kartici (1 zahteva /api/weather na sidro, cap 4, dedupe) | po generaciji | prikaz |
| PackingSmart | `packing-smart.tsx` | Pametni pakirni seznam iz napovedi + postankov; odkljuki persist (ui-persist) | pod načrtom | localStorage |
| BudgetPanel / TripBudgetCard | `budget-panel.tsx`, `trip-budget-card.tsx` | Proračun: 5 vedric resnice (ocena/rezervirano/plačano/na osebo/status) | planner / shared | stroški poti |
| TravelStyleQuiz | `travel-style-quiz.tsx` | 5 vprašanj → 6 stilov → personaliziran heroQuery event | /nacrtuj#kviz | planner prefill |
| DemoScenarios | `demo-scenarios.tsx` | Pilotski scenariji → heroQuery | homepage | planner prefill |
| PreGeneratedItineraries | `pre-generated-itineraries.tsx` | Uredniške AI poti → prenos želje | homepage | planner prefill |
| CommunityTrips | `sections/community-trips.tsx` | Server galerija javnih poti | /nacrtuj, homepage | `/pot/[shareId]` |
| WeatherWidget | `sections/weather-widget.tsx` | Vreme za destinacije (homepage/planner) | — | `/api/weather` |
| StartDateWeatherStrip | `sections/start-date-weather-strip.tsx` | Vreme ob startu potovanja | planner | `/api/weather` |
| MtNotice | `mt-notice.tsx` | Oznaka strojnega prevoda (iskrenost) | EN strani | — |
| ChatMiniMap | `chat-mini-map.tsx` | Pripeta Leaflet mini mapa geo odgovorov (split persist širina) | geo odgovor v klepetu | pin/unpin |
| StopInsights | `stop-insights.tsx` | Razlogi postankov (buildStopReasons) | načrt | — |
| InsightsPanel | `insights-panel.tsx` | Deterministični vpogledi (deterministic-insights) | načrt | — |
| ItineraryQualityCard | `itinerary-quality-card.tsx` | Ocene kakovosti + geo status | načrt | — |
| DaySegmentHeader / PlannerDayNav / PlannerMealStop / PlannerStopLeg / PlannerLegSuggestions / DaySegmentHeader | `planner-*`, `day-segment-*` | Struktura dneva: segmenti, navigacija dneva, kosila (meal-stops), noge poti, predlogi | načrt | načrt |
| PlannerAIControls / PlannerStatusStrip / PlannerSummaryBar / PlannerTrustLine | planner-* | UI st. generiranja (števec/faze/abort), povzetek km/€, zaupanje | načrt | — |
| TripPresence | `trip-presence.tsx` | Števec prisotnih na deljeni poti (socket + fallback) | /pot | prikaz |
| TripForkButton | `trip-fork-button.tsx` | Ustvari lastno kopijo deljene poti | /pot | nova SavedItinerary |
| TripEmbedCode | `trip-embed-code.tsx` | Iframe embed koda za blog | /pot | kopirano |
| SocialShare | `social-share.tsx` | Deljenje poti | /pot | — |
| PushSubscribe / TripPushCard | `push-subscribe.tsx`, `trip-push-card.tsx` | Web push obvestila (VAPID) | /pot | `/api/push/subscribe` |
| ChatAskCta | glej §4.1 | vsebina → klepet | pasovi vsebine | klepet |
| HeroQuickInput | glej §4.1 | hero vnos | homepage | planner |
| CheckoutModal | glej §5 | nakup | košarica | Order |
| StructuredData / SEO / SeoConversion | `structured-data.tsx`, `seo.tsx`, `sections/seo-conversion.tsx` | JSON-LD, hreflangForPath, konverzijski pas | vse strani | — |

---

## 7. My Trip akcije (kanonska zbirka)

### 7.1 Jedro `src/lib/my-trip.ts`

| Funkcija | Lokacija | Trenutno obnašanje | Vstopna točka | Cilj/sprememba stanja |
|---|---|---|---|---|
| addMyTripItem | my-trip.ts | Sanitizacija (10 vrst, dolžine, SAMO notranji `/` href), dedup `kind:refId` (idempotenten — osveži podatke/čas), FIFO kapa 200 (evictedTitle za UI) | vseh 22 površin | `dai:my-trip-items` + event |
| removeMyTripItem | my-trip.ts | Tiho odstrani | gumb/modal/kartica/planner | zbirka + event |
| clearMyTripItems | my-trip.ts | Izprazni (UI drži undo snapshot) | MyTripView + strip | zbirka + event |
| isInMyTrip / getMyTripItems / myTripCount | my-trip.ts | Branja (števčna značka, »V moji poti« stanja) | gumbi/badge | — |
| subscribeMyTrip | my-trip.ts | `dai:my-trip-changed` + cross-tab `storage` → callback | useMyTrip/sync | — |
| writeMyTrip | my-trip.ts (interna) | Zapiše + dispatcha custom event | vse akcije | localStorage + window event |
| setMyTripHandoff / has/consume | my-trip.ts | »Nadaljuj načrtovanje«: sessionStorage zastavica → planner trak | MyTripView/wishlist | `dai:my-trip-handoff` |
| myTripKey | my-trip.ts | Identiteta `kind:refId` | dedup | — |
| useMyTrip | `hooks/use-my-trip.ts` | React vezava (items, count, added, toggle) | komponente | — |

### 7.2 Strežniško zrcalo `/api/my-trip`

| Funkcija | Trenutno obnašanje |
|---|---|
| GET | Seznam predmetov računa (samo B2C seja; 401/403 sicer) |
| POST | UNION-MERGE push (nikoli destruktivno) + FIFO 200 → vrne celoten union; ISTA validacija kot lib |
| DELETE | `{kind, refId}` ali `{all:true}` — eksplicitno odstranjevanje; Prisma uniq userId+kind+refId |

### 7.3 Identitete (1.153.0 kanon)

- T1 destinacija → `destination:<slug>` (klepetov stari `t1-<id>` popravljen v 1.153.0 — chatPlaceTripItem).
- OSM → `product:osm:node-X` (klepet → product, ne `poi:osm-node-X`).
- Supply → `supplyTripItem/supplyTripKind` (lib/supply/my-trip-item.ts) — enota z zbirko.
- Test varovalka: `issue17-canonical-add-identity.test.ts`.

### 7.4 Sinhronizacija `src/lib/my-trip-sync.ts`

| Funkcija | Trenutno obnašanje |
|---|---|
| syncMyTripToServer | Ob prijavi/mountu huba: neprazna lokalna → POST union + merge strežniškega (race-safe); prazna → SAMO GET (pull drugih naprav) |
| startMyTripDiffSync | Posluša dogodke zbirke (ista zavihek + cross-tab), debounce 2,5 s, diff proti senci: dodano → POST, odstranjeno → DELETE; senca se premakne SAMO ob uspehu |

### 7.5 Površine huba

- `/moja-potovanja` → MyTripView (zbirka, odpiranje, odstranjevanje, undo clear, NA POTI trak, wishlist most) — §2.4.
- Deljena pot `/pot/[shareId]` + `/pot/embed/[shareId]` — §15 (zbirka NI del te poti; dodajanje piše v deljeni dokument).
- `lib/my-trips-storage.ts` — sledenje shranjenih poti na napravi (TrackedTrip).

---

## 8. Načrtovalnik `/nacrtuj` (itinerary-planner.tsx, 6041 vrstic)

| Funkcija | Lokacija | Trenutno obnašanje | Vstopna točka | Cilj/sprememba stanja |
|---|---|---|---|---|
| Obrazec (dnevi/interesi/sezona/proračun/skupina/start) | itinerary-planner + `lib/store.ts` (useAppStore) | Validacija (planner-field-validation TASK 82), proračun iz `plan-facts` | `/nacrtuj` | PlannerInput |
| NL vrstica kot PRIMARNI vnos | itinerary-planner (UI sprint) | Naravni jezik → interesi/dni/party/pace (geo-intent parsing) | vpis | obrazec predfill |
| Party type + tempo (WEATHER-CONTEXT, F15) | party-types.ts, pace-types.ts | Sam/pri paru/družina/skupina; relaxed/balanced/packed — vpliva ritem | čipi | input |
| Generiranje (engine auto/deterministic) | POST `/api/itinerary` + `lib/deterministic-itinerary.ts` | AI z rezervo → deterministični motor (0 žetonov) fallback badge; supply-aware kontekst; geo-validacija; quality; budget recompute | submit | Itinerary v pomnilniku |
| Feedback generiranja | `lib/generation-stages.ts` (TASK 77/80) | Števec, faze, timeout 70 s + AbortController (prekliči) | med čakanjem | UX |
| Undo sklad | `lib/itinerary-undo.ts` (§22 val 5) | Sejni undo 10 destruktivnih prehodov | čip UNDO | prejšnje stanje načrta |
| Struktura dneva | `lib/planner-days.ts`, day-segments.ts, `day-segment-header.tsx` | Dan = segmenti (jutro/kosilo/popoldne/večer), meal stops (`lib/meal-stops.ts`) | rezultat | načrt |
| Dodajanje/odstranjevanje dneva | itinerary-planner + AlertDialog (D6-B) | Dodaj dan / izbriši dan Z postanki (potrditev) | gumb | načrt |
| Reorder postankov | `lib/planner-reorder.ts` (T5-D) + grip ročaji | Premik znotraj dneva (gor/dol/lepljenje) | drag/klik | načrt |
| moveStopToDay | itinerary-planner (D6-B) | Prestavitev postanka MED dnevi | gumb na postanku | načrt |
| Hitre akcije »Prilagodi ta dan« | itinerary-planner + `/api/itinerary/refine` | Deterministične/AI akcije (krajša pot, dež alternativa, zamenjaj postanek …) | gumb | načrt + `day_adjusted` |
| Prosti ukazi (refine) | `sections/itinerary-refiner.tsx` + `lib/refine-command-parser.ts` + `lib/refine-actions.ts` | NL ukazi SL/EN/IT/DE/FR/ES → spremembe | vrstica | načrt + `planner_refined` |
| Vprašanja o načrtu | `plan-copilot.tsx` (F9) + POST `/api/itinerary/ask` | Odgovori NAJPREJ izračunani (vir computed), neznano → AI iz dejstev (vir ai), iskren fallback | »Vprašaj o načrtu« | prikaz |
| Vreme v načrtu | `itinerary-weather.tsx` + `lib/itinerary-weather.ts` + `/api/weather` | Chip na dnevu (Open-Meteo, cap 4, dedupe, iskreni statusi) | po generaciji | prikaz + dež alternative |
| Dogodki | `itinerary-events.tsx` + `lib/events-match.ts` + events-data ×5 jezikov | Dogodki MED potjo (matchEventsForItinerary) + ZUNAJ okna; Add v zbirko (write-through dodajanje) | pas pod načrtom | zbirka kind: event |
| Pakirni seznam | `packing-smart.tsx` + `lib/packing-smart.ts`/`packing-list.ts` | Strukturiran seznam iz napovedi + postankov, razlogi, persist odkljukov | pas pod načrtom | ui-persist localStorage |
| Zvok načrta (W7/D2) | `lib/planner-audio.ts` + `itinerary-audio.tsx` | Zvočni povzetek dneva — brskalniški TTS, brkalniška izgovorjava | gumb na dnevu | govor |
| ICS izvoz | `lib/ics-export.ts` (F5.2) + planner gumb | RFC 5545 .ics po postankih (time_slot, GEO, escape, fold); relativni datumi POŠTENO deklarirani | gumb »Koledar« | prenos .ics |
| PDF izvoz | `/api/itinerary/shared/[shareId]/pdf` + `lib/pdf/trip-itinerary-pdf.ts` | PDF deljene poti (T5-D) | `/pot/[shareId]` | prenos .pdf |
| Google Maps izvoz dneva (DAN V ŽEPU, W11) | `lib/gmaps-day-export.ts` | Dan → Google Maps URL (navodila do postankov) | gumb na dnevu | odpre gmaps |
| E-pošta načrta | POST `/api/email-itinerary` | Pošlje načrt na e-pošto | gumb | e-pošta |
| Shrani in deli | POST `/api/itinerary/save` → shareId; linkedTrip sync (TASK 28 live-sync indikator + polling use-trip-version-poll) | Shrani + uredi v place (CAS) + revizije | gumb | DB SavedItinerary + editToken |
| Začni kjerkoli (F3-C, #start-kjerkoli) | itinerary-planner + hash listener | Razširi vir vnosa: povezava (F5.4) / PDF (D3) / slika (F8) / pins (F14) | hash/preklop | ingest → prefill obrazca |
| Začni s povezavo | POST `/api/itinerary/ingest` + `lib/url-ingest.ts` | URL → destinacije (PATTERNS), iskreni nerekognizirani | prilepi URL | prefill |
| Začni s PDF | POST `/api/itinerary/ingest-pdf` | PDF → destinacije (task95) | naloži PDF | prefill |
| Začni s sliko | POST `/api/itinerary/ingest-image` | Slika → VLM prebere imena (method vlm iskren) | naloži/prilepi sliko | prefill |
| Uvozi shranjene točke (F14) | POST `/api/itinerary/ingest-pins` | Glej §13 | naloži datoteko | prefill |
| Iz moje poti trak | `planner-my-trip-strip.tsx` + MY_TRIP_PREFILL_EVENT | Handoff zbirke → predlog destinacij | hub/wishlist → /nacrtuj | prefill |
| Klepet → planner | `lib/chat-add-place.ts` (CHAT_ADD_PLACE_EVENT + stash) | Kraj iz klepeta v odprt načrt ali odložišče; simetričen EN klik odstranitev | klepet + | načrt + zbirka (write-through D8-D) |
| Zemljevid načrta | `trip-map-panel.tsx` (F5.1, Leaflet client-only) | Pot dneva/poti na kartici | gumb | prikaz + `map_opened` |
| Stops along the way | POST/GET `/api/itinerary/stops-along-way` | Postanki na poti (geo-corridor) | planner | predlogi |
| Načrtovano stanje (SELECTION fixed/preferred) | `lib/supply/selection.ts` + `selection-persist.ts` + `apply-fixed.ts` | Izbrani produkti (čipi nad gumbom) FIXED/PREFERRED, removeSelectedProduct | zemljevid/journey | sessionStorage/DB |
| Marketplace enrichment | `lib/marketplace-stop-enrichment.ts` (D1) | Realne cene lastnih izkušenj na postanku (čip »Na tržnici od €X«) | načrt | CTA |
| Kvaliteta/geo kartice | `itinerary-quality-card.tsx`, `lib/quality-score.ts`, `lib/day-quality.ts`, `lib/plan-qa.ts`, `geo-validation.ts` | 0 cik-cak, km/dan, schedule gap, plan-qa QA | rezultat | prikaz |
| Deterministični vpogledi | `insights-panel.tsx` + `lib/deterministic-insights.ts` | Vpogledi brez AI | rezultat | prikaz |
| Pot v Go Mode | itinerary-planner (K-7) → saveGoTrip + router.push | Premostitev v /na-poti | gumb | `dai:go-trip` |
| Persistenca zadnjega načrta | `lib/itinerary-persist.ts` (TASK 99-b — EN pisec) | readLastItinerary/persistItinerary (isti ključ kot klepet) | vsaka sprememba | localStorage |
| Obnovitev deljenega načrta | itinerary-planner (?odpri=) | Hidracija tujega shareId | URL | prikaz + fork |

---

## 9. Zemljevid `/zemljevid` (map-view.tsx, 2367 vrstic + map-section)

| Funkcija | Lokacija | Trenutno obnašanje | Vstopna točka | Cilj/sprememba stanja |
|---|---|---|---|---|
| Leaflet osnova | map-view.tsx (dynamic ssr:false) | Bbox 38 destinacij SI+HR+ME+AL (BALKANS_BOUNDS), markercluster | `/zemljevid` | — |
| Destinacijski markerji | map-view + `lib/slovenia-data.ts` | 38 markerjev (emoji po tipu), klik → popup/modal | klik | destination popup |
| FSQ statični sloj | `lib/map-pins.ts` + `/api/map/pins` + `map-pins-client.ts` | 125.445 točk FSQ Open Places (bencin/restavracije/nastanitve/trgovine), grid agregacija pri nizkem zoomu | zoom | POI popup |
| Supply sloj | `lib/supply/use-supply-query.ts` + `/api/supply/search` + `lib/supply/zoom.ts` | Produktri ponudnikov nad SUPPLY_MIN_ZOOM (zoom gating, strežniški) | zoom ≥ prag | ProductModal |
| Kategorije/čipi filtra | map-view (CATEGORY_FILTERS 13 + GROUP_FILTERS 5) | Atrakcije, muzeji, narava, razgledišča, religiozno, hrana, spanje, bencin, trgovine, transferji, aktivnosti, ture … | klik čipa | vidnost slojev |
| Zoom hint (F12-3) | map-view | »Prikazujem najbolje ocenjene — povečaj za vse« brez tehnične ravni | zoom | prikaz |
| POI popup + write-through (F3) | map-view (lastni gumb v popupu — Leaflet omejitev) | »+ Dodaj v mojo pot« piše v OBE plasti: zbirka (addMyTripItem) + supply (supplyTripItem) | gumb v popupu | `dai:my-trip-items` + supply izbira |
| Iskanje po zemljevidu (F12-1) | map-view + SmartSearch prek Navigation | Zadetki → flyTo + zlati poudarni marker | iskanje | viewport |
| Geo deep link (TASK 86) | map-view (URLSearchParams) | `?lat=&lng=&zoom=&label=` → flyTo + poudarni marker + label | URL | viewport |
| Pot itinererja | map-view (routeCoords/routeByDay iz useAppStore) + JourneyMap | Polyline po dneh (barve), oštevilčeni markerji | iz plannerja/journey | prikaz |
| ProductModal/ProviderPanel | `supply/product-modal.tsx`, `supply/provider-panel.tsx` | Detail produkta + vir/status + write-through Add; plošča ponudnika | klik markerja | zbirka + izbira |
| MapOpenedTracker | `map-opened-tracker.tsx` | `map_opened` analytics | mount strani | DB |
| map-section ( homepage prej) | `sections/map-section.tsx` | Zemljevid na homepageu (zdaj lastna stran; komponenta ostaja) | — | — |

---

## 10. Go Mode `/na-poti` (go-mode.tsx, 1279 vrstic)

| Funkcija | Lokacija | Trenutno obnašanje | Vstopna točka | Cilj/sprememba stanja |
|---|---|---|---|---|
| GoTrip persistenca | `lib/journey/go-persist.ts` | loadGoTrip/saveGoTrip/clearGoTrip + loadGoProgress/saveGoProgress | /potovanje »Zaženi Na poti« | `dai:go-trip` |
| buildMyTrip / buildGoView | `lib/journey/trip-view.ts`, `go-view.ts` | Iz zapisa → kartice Now/Next/dni | mount | prikaz |
| GPS (useGeolocation) | `lib/journey/use-geolocation.ts` | navigator.geolocation.watchPosition; statusi idle/requesting/active/denied/unavailable/error; NE shranjuje sledi | gumb »Vklopi GPS« | položaj v seji |
| NOW & NEXT kartice | go-mode.tsx | Živa ura, naslednja postanka, razdalja/smer (PREMICA — iskrena, ne vozna; `heuristicLeg` iz `lib/road-routing.ts`) | GPS aktiv | prikaz |
| Opravljanje postanka | go-mode + saveGoProgress | En klik »Opravljeno«, povzetek kasnejših dni | klik | progress persist |
| Reset/počisti pot | go-mode + AlertDialog + clearGoTrip | Potrditev pred brisanjem | gumb | `dai:go-trip` odstranjen |
| Vreme na poti | `lib/journey/go-weather.ts` + `/api/weather` | Vreme za cilj dneva (observedTimeLabel iskren) | mount | prikaz |
| Glasovni vodnik »PREBERI« | `sections/go-audio-button.tsx` + `lib/journey/go-audio.ts` | buildStopNarration/buildNearbyNarration — SL oddajanje (spolne oblike števnikov slCardinal, km/min fraze), brskalniški TTS, tekstovni padec | gumb | govor |
| Opening hours na poti | `opening-hours-status.ts` | Ali je naslednji postanek odprt | prikaz | — |
| Zunanje povezave | `lib/journey/go-nav.ts` (goNavLinks, isCoarsePointer) | Google Maps/apple maps navigacija + telefon | gumb | zunaj |
| External handoff zapis | `lib/journey/handoff-record.ts` | recordExternalHandoff — sledenje prehodom | klik zunaj | analytics |
| Offline | 100 % client-side (0 API za načrt) + SW `/na-poti` v PLANS cache + offline.html Go Mode zapisi | Deluje brez signala | letalo | prikaz |

---

## 11. Klepet (chatbot + skupinski klepet)

| Funkcija | Lokacija | Trenutno obnašanje | Vstopna točka | Cilj/sprememba stanja |
|---|---|---|---|---|
| Chatbot FAB + dialog | `chatbot.tsx` (na 20 straneh — Grep potrjen) | Dialog z zgodovino, kategorije čipi, pin/unpin mape, glasovni vhod/izhod | FAB | — |
| Deterministični odgovori | POST `/api/chat` + `lib/chat-engine.ts` + `lib/chat-domain-fallback.ts` | 0 LLM klicev; 38 destinacij + DB (lokali/izdelki/izkušnje) + STO uzemljenje (664 zapisov llms.txt RAG, `lib/rag/*`) + OSM enrichment; `source: database` — NIKDY »ai« | sporočilo | odgovor + sources |
| Jeziki klepeta | /api/chat (language) | sl privzeto; en/it/de domenski; fr/es → preslikava na EN (iskrena meja) | locale | jezik odgovora |
| GEO odgovori | `lib/geo-intent.ts` + `lib/overpass.ts` + ChatMiniMap | Kraji (hrana/pijača/tržnica/spanje/storitve) okoli destinacije iz OSM (T3), 6 s timeout; pripeta mini mapa (split persist širina 320–480) | geo vprašanje | places + mapa |
| T2 viri značke | `lib/rag/sto-llms.ts`, `rag/ground.ts`, `rag/freshness.ts` | Citati slovenia.info (sources) — Landmark ikona | vsak odgovor | prikaz |
| Glasovni klepet | `lib/voice.ts` (STT speechRecognition + TTS speechSynthesis, jezikovne oznake) | Mikrofon gumb + hkratna izgovorjava | gumb Mic | govor/tekst |
| Dodaj kraj iz klepeta | `lib/chat-add-place.ts` (chatPlaceTripItem — kanon 1.153.0; addChatPlaceToItinerary; stashChatPlace brez načrta; readLastItinerary/persistLastItinerary) | Kartica kraja z »+«: v načrt (odprt planner prek CustomEvent) + write-through v zbirko (D8-D) | gumb + | načrt + zbirka |
| Klepet → rezervacija (G6) | `chat-booking-bridge.tsx` | Kontekstualne ponudbe destinacije (Experience/Listing/Product/Affiliate kartice) — NIKOLI checkout v klepetu | čip | produkti |
| Vstopna vprašanja | `lib/chat-ask.ts` (CHAT_ASK_EVENT, CHAT_ASK_MAX) + `chat-ask-cta.tsx` | Vsebina odpre klepet s pred-izpolnjenim UREDLJIVIM vprašanjem | pasovi vsebine | klepet |
| Timeout klienta | chatbot (30 s AbortController) | Iskrena nedosegljivost | počasen odgovor | sporočilo |
| Skupinski klepet @AI | `trip-social.tsx` + `hooks/use-trip-chat.ts` + `/api/trip-comments` + `/api/trip-comments/ai-reply` | Zgodovina = TripComment tabela; polling 6 s (viden zavihek, 2 s overlap, dedupe) + socket chat:new (mini-service 3003, deljena povezava s prisotnostjo); @AI omemba → strežniški odgovor (chat-engine, isAI značka, JSON priloga) | /pot/[shareId] | DB TripComment |
| Dodaj v DELJENO pot | trip-social (addChatPlaceToItinerary + CAS updateItinerary) | Urejanje skupnega dokumenta — osebne zbirke NE dotika (meja poštenja, 1.153.0 komentar) | gumb v skupinskem klepetu | deljena pot |
| Analytics | planner-analytics (chat_group_ai_asked, chat_group_place_added, chat_ask_cta_clicked, chat_map_pinned/unpinned …) | Fire-and-forget POST /api/analytics/event (whitelist) | akcije | DB |

---

## 12. Booking / handoff / tržnica

### 12.1 Journey booking (aktivacija-pripravljeno, iskreno)

| Funkcija | Lokacija | Trenutno obnašanje |
|---|---|---|
| ConfirmationStatus model | `lib/journey/types.ts` | 13 statusov; INITIAL samo SELECTED/EXTERNAL/BOOKING_REQUESTED/DRAFT; EXTERNAL absorptivno — NIKOLI CONFIRMED |
| ALLOWED_TRANSITIONS | `lib/journey/booking.ts` | Zakoniti prehodi; CONFIRMED/PAID/MODIFIED zahtevajo providerBookingId + potrjeno ceno iz provider odgovora (17-B) |
| bookingCapabilityOf | booking.ts | bookingMode → tok: affiliate_redirect/api_bookable/own_marketplace/info_only z iskrenimi labelami |
| POST/GET /api/journey/plan | `api/journey/plan/route.ts` | Journey načrt (orchestrator) prek ponudnikov |
| /api/journey/bookings | + `[bookingNumber]` + `cancel-request` | Življenjski cikel rezervacij (selekcija/statusi) |
| Handoff | `lib/journey/handoff.ts`, `handoff-record.ts`, `itinerary-go.ts` | Prehod na /go ali /na-poti + zapis handoffa |
| Izbire | `lib/journey/selection-mirror.ts`, `lib/supply/selection-persist.ts`, `selection-verify.ts` | Zrcaljenje izbir z zbirko, persist, fail-closed overjanje (rejectedFake) |
| Totals | `lib/journey/totals.ts` (describeTotals) | Seštevanje z razlogom |

### 12.2 Ponudniki (statusi — 17-B, spot-check registry/production-status)

| Ponudnik | Status (user-facing) | Opomba |
|---|---|---|
| osm | LIVE | Overpass poizvedbe v živo |
| fsq | LIVE | Foursquare Open Places dataset (125 k točk) |
| sto | LIVE | RAG llms.txt ingest (664 zapisov) |
| kiwitaxi | LIVE (podatki) | CSV 9614 transferjev; /go transfers monetized:false (pap ID manjka) |
| viator | NOT_CONFIGURED (CODE_READY) | self-serve ključ v env oživi adapter |
| travelpayouts | NOT_CONFIGURED (CODE_READY) | +origin gate |
| getyourguide, tiqets, booking, skyscanner, airalo | PARTNER_ACCESS_REQUIRED | airalo zahteva OBE OAuth2 poverilnici |
| own | PRODUCTION_CONFIGURED / NO_LIVE_DATA | čaka prve partnerjeve listinge |
| discovercars, omio, worldnomads, safetywing | affiliate | register: status "affiliate", active: false, NO_INVENTORY_CAPS — živijo prek /go affiliate kanala (affiliate ≠ inventar) |

Derivacija statusov: `lib/supply/production-status.ts` (LIVE/CONFIGURED/NOT_CONFIGURED/PARTNER_ACCESS_REQUIRED/AFFILIATE_ONLY — LIVE SAMO za PRODUCTION_ACTIVE) iz `production-matrix.ts` (življenjski cikel 11 stopenj + blokirni razlogi + env Boolean PRESENT/MISSING). Register: `lib/supply/registry.ts` (16 ponudnikov, aktiven flag).

### 12.3 Affiliate redirect `/go/[provider]`

- 11 providerjev (AFFILIATE_PROVIDERS); validacija: dest whitelist (canonicalDest — neznan → »Slovenija« fallback, NIKOLI raw), from (samo transfers), product (validator PO providerju: transfers števke, viator alfanum, gyg števke), days 1–30 (insurance).
- KT dataset membership (P2-1): transfers productId, ki ni v kanonskem inventarju → 404 (fail-closed).
- Tracking (NE blokira redirecta): AnalyticsEvent `affiliate_click` {provider, dest, knownDest, monetized, days, from, productId, refPath} + PageView funnelStep affiliate_click; rate limit 60/min samo za DB zapis.
- Redirect 302 na partner URL iz `buildPartnerUrl` (affiliate.ts — env ID-ji SAMO strežniško, fail-closed brez fake ID-jev, monetized:false pri manjkajočem); izhod MORA biti https + ALLOWED_HOSTS po providerju (subdomain `*.` varno).
- Sub-ID parametri iz env (FAZA 7) — brez PII.

### 12.4 Lastna tržnica (demo fail-closed)

| Funkcija | Lokacija | Trenutno obnašanje |
|---|---|---|
| Košarica | `lib/cart-store.ts` + `cart-drawer.tsx` | Zustand persist; shipping logika (≥50 €/allFree → 0, sicer 4,90) |
| Checkout | POST `/api/checkout` + `checkout-modal.tsx` | Server-side izračun; DEMO: brez STRIPE_SECRET_KEY → Order status »paid« + paymentMethod »demo«; PRODUKCIJA brez DSA_DEMO_PAYMENTS=1 → 501 (isStripeDemo FAIL-CLOSED 1.36.0) |
| Naročila | GET `/api/orders/[orderNumber]` | Ogled naročila po številki |
| Rezervacije izkušenj | POST `/api/bookings` (+[bookingNumber], cancel-request) | Demo → confirmed + paymentStatus UNPAID (nikoli »paid« — NI v provizijski osnovo) |
| Stripe | `/api/stripe/checkout`, `/portal`, `/webhook` | Webhook: demo ignorira, prod preverja podpis |
| Payouti | `lib/payout-ledger.ts`, `lib/commissions.ts`, owner payouts API + cron commission-invoices | payoutStatus veriga; komisije SAMO source consultation + paymentStatus paid; demo/unpaid VEČNO not_due |
| BookingAssistant | glej §5 | Povpraševanje (ne rezervacija) |
| Znak ponudbe | `marketplace-types.ts` (PriceClassification itd.), `supply/price-display.ts` | znana cena ≠ živi citat (4 meje README potrjene 17-B) |

---

## 13. Google Pins / uvoz (F14 — Mindtrip »Google Pins«)

| Funkcija | Lokacija | Trenutno obnašanje | Vstopna točka | Cilj/sprememba stanja |
|---|---|---|---|---|
| Uvoz pinov | POST `/api/itinerary/ingest-pins` + `lib/pins-ingest.ts` (403 vrstic) | 3 vhodne oblike: Google Takeout »Saved Places.json« (GeoJSON), KML (`<Placemark>`), navadni besedilni seznam (1 točka/vrstico); MAX_PINS 2000 | planner »Uvozi shranjene točke« (F14) | PinMatch[] → prefill obrazca |
| Ujemanje po imenu | pins-ingest (PATTERNS iz url-ingest) | Besedne meje, diakritika-neobčutljivo, najdaljši vzorec zmaga | — | destinacije |
| Ujemanje po koordinatah | pins-ingest (haversineKm) | Najbližja destinacija v polmeru PIN_COORD_RADIUS_KM = 25 km | — | destinacije |
| Iskrena meja | pins-ingest (pinsUnmatched) | »N točk izven naših 22/38« se izpiše — nič se ne izmišljuje | — | prikaz |
| UI povratna info | itinerary-planner (ingestPinsMeta.format geojson/kml/text) | Prikaz prepoznane oblike + števci | po uvozu | prikaz |
| Analytics | ingest_pins_attempted/success (matches, pins, format, locale) | Dokumentirano v ANALYTICS-EVENTS.md | uvoz | DB |
| Test varovalka | `__tests__/pins-ingest.test.ts` | — | — | — |

---

## 14. Računi / uvoz rezervacij (TripItov model — TASK 31)

| Funkcija | Lokacija | Trenutno obnašanje | Vstopna točka | Cilj/sprememba stanja |
|---|---|---|---|---|
| Parse rezervacije | POST `/api/journey/bookings/parse` + `lib/reservation-text-parse.ts`, `lib/reservation-ics-parse.ts`, `lib/email-mime-parse.ts` | PDF/slika/besedilo/ICS/e-pošta → polja rezervacije (ponudnik, št., datumi); DOKUMENT SE NE SHRANI (samo izluščeni podatki) | deljena pot (TripReservations) | predogled |
| Zapis uvožene/ročne rezervacije | POST `/api/journey/bookings/import` | source USER (ročno) / IMPORTED (parse + potrditev); status DRAFT (nepotrjen parse) / CONFIRMED (uporabniško potrjeno — sme nositi providerBookingId + confirmedPrice + importData); validni ponudniki: kanonski slugi + manual | potrditev v UI | DB JourneyBooking |
| E-poštni uvoz | POST `/api/journey/bookings/email-inbound` | Inbound potrditvena e-pošta → parse (TASK 31) | e-poštni webhook/klient | JourneyBooking |
| ImportedReservation helper | `lib/imported-reservation.ts` | providerSlugFromName, importedProductId, isKnownProviderSlug | — | — |
| Rezervacije na poti | `trip-reservations.tsx` + `/api/itinerary/bookings` | Seznam + uvoz + preverjanje stanja | /pot/[shareId] | DB |
| Dokumenti (račun) | `trip-documents-card.tsx` + `/api/trip/[shareId]/documents` | Vrsta: potrditev/vavčer/vstopnica/**račun**/zapisek; format pdf/slika/besedilo/povezava; SAMO metapodatki + zunanja https povezava (datoteka ostane pri uporabniku); brisanje samo avtor; max 100/pot, 25/avtor | /pot | DB TripDocument |
| Stroški (denar) | `/api/trip/[shareId]/expenses` + `trip-budget-card.tsx` | kind booked/paid, USER-asserted EUR ≤100.000; vsote računa lib/trip-budget (ocena ≠ strošek) | /pot | DB TripExpense |

---

## 15. Socialno / skupinske poti (/pot/[shareId])

| Funkcija | Lokacija | Trenutno obnašanje | Vstopna točka | Cilj/sprememba stanja |
|---|---|---|---|---|
| SSR zaslon deljene poti | `app/pot/shared-trip-screen.tsx` | Vrata SHARE_ID_RE + isPublic + resolveTripRole (zasebne → 404); views statistika; JSON-LD; matchEventsForItinerary; vse komponente spodaj | /pot/[shareId] | DB view |
| SharedTrip (izris) | `components/shared-trip.tsx` + `trip-timeline.tsx` | Načrt + timeline + WeatherChip + DayAudio + PackingSmart + print + QR (PrintQr) | mount | prikaz |
| Vloge/kolaboracija | `trip-collaboration.tsx` + `/api/trip/[shareId]/collaborators` + `/accept` | ?invite=token trak; OWNER upravlja vabila/vloge/odvzem + javna/zasebna + preimenovanje CAS (409 konflikt); EDITOR preimenuje | /pot | DB TripCollaborator |
| Revizije | `/api/trip/[shareId]/revisions` + `lib/trip-version.ts` + use-trip-version-poll + fetchTripRevisions | Zgodovina sprememb + live-sync indikator + vsebina revizije | /pot | DB |
| Prisotnost | `trip-presence.tsx` + `lib/trip-presence-socket.ts` | Števil prisotnih (socket 3003, deljen singleton; mrtv → polling) | /pot | prikaz |
| Všečki | `trip-social.tsx` + `/api/trip-likes` | Srčki (anonimni clientId iz lib/client-identity, 1 glas/odjem) | /pot | DB |
| Glasovanje lokacij | `/api/trip-vote` (POST/DELETE/GET, uniq shareId+locationKey+voterId, idempotentno) | Glasovi obiskovalcev za destinacije itinererja (7-b) | /pot | DB |
| Skupinski klepet @AI | glej §11 (trip-social + use-trip-chat + /api/trip-comments[/ai-reply]) | Klepet + @AI svetovalec + dodaj kraja v deljeno pot | /pot | DB TripComment |
| Ankete | `trip-polls.tsx` + `/api/poll` + `/api/poll/vote` | Ustvari (2–6 možnosti), glasuj/prestavi glas, zaključi/izbriše (avtor); optimistični UI z revert | /pot | DB |
| Dnevnik | `trip-diary.tsx` + `/api/diary` | Tekstovni dnevnik brez računov: dan + kraj + ocena 1–5 + besedilo; urejanje/brisanje svojih | /pot | DB TripDiary |
| Stroški | glej §14 | booked/paid + TripBudgetCard 5 vedric | /pot | DB |
| Dokumenti | glej §14 | Metapodatki dokumentov (račun/vavčer …) | /pot | DB |
| Push obvestila | `trip-push-card.tsx` + `/api/push/subscribe`/`unsubscribe` + cron daily-trip-push/weekly-alerts | Web push za pot (VAPID) | /pot | DB PushSubscription |
| Vodnik poti | `trip-guide.tsx` + `/api/trip-guide` | AI vodnik skupine (GuideData) | /pot | prikaz |
| Fork | `trip-fork-button.tsx` | Lastna kopija tujega javnega načrta | /pot | nova SavedItinerary |
| Embed + deljenje | pot/embed + `trip-embed-code.tsx` + `social-share.tsx` + print + print-qr | iframe embed, deljenje, tisk z QR | /pot | — |
| CommunityTrips | `sections/community-trips.tsx` | Javna galerija poti (viralni loop) | homepage/nacrtuj | /pot/{shareId} |

---

## 16. Zbirke / wishlist / favorites (W3)

| Funkcija | Lokacija | Trenutno obnašanje | Vstopna točka | Cilj/sprememba stanja |
|---|---|---|---|---|
| Wishlist shramba | `lib/wishlist-storage.ts` | getWishlist/addToWishlist/removeFromWishlist/subscribeWishlist/openFromWishlist (cross-tab dogodki, defenzivno) | srčki na karticah | `dai-wishlist` localStorage |
| WishlistSheet | `wishlist-sheet.tsx` | List z razdelki: »Vse« + PO DESTINACIJI (groupWishlistEntriesByDestination) + PO TEMI (groupWishlistByTheme — someday kolekcije); EmptyState s CTA v tržnico; AddToTripButton most; telemetrija | srček v navigaciji | zbirka/handoff |
| Wishlist kategorije | `lib/wishlist-collections.ts` | WISHLIST_THEME_LABELS (narava/hrana/mesta/obrt …) + WISHLIST_OTHER_LABEL | shranjevanje | kategorija zapisa |
| Wishlist → Moja pot | `lib/wishlist-trip-bridge.ts` (wishlistTripItemOf) + MY_TRIP_PREFILL_EVENT | Most v hub/planner (isti prefill dogodek kot trak) | gumb v sheet/hub | zbirka + `/nacrtuj` |
| useWishlist | `hooks/use-wishlist.ts` | React vezava | kartice/modali | — |
| Kurirane zbirke | `lib/collections.ts` (8 zbirk: zimski/poletni paketi, romantični, družinski, kulinarika, avantura, eko, luxury) + `/api/collections/[slug]` | Filtri (kategorije/atributi/destinacije/cena) aplikacija na products+experiences | CollectionsSection / CollectionModal | prikaz |
| CollectionsSection + modal | `sections/collections.tsx`, `sections/collection-modal.tsx` | Prikaz in odpiranje zbirk | /destinacije | — |
| Srčki na površinah | ProductModal, destination/experience/listing modali, kartice | Dodaj med priljubljene | srček | `dai-wishlist` |
| Test varovalka | `__tests__/w3-collections.test.ts` | — | — | — |

---

## 17. Večjezičnost (6 jezikov)

| Funkcija | Lokacija | Trenutno obnašanje | Vstopna točka | Cilj/sprememba stanja |
|---|---|---|---|---|
| Routing konfig | `src/i18n/routing.ts` | locales sl/en/it/de/fr/es; defaultLocale sl; `localePrefix: "as-needed"` (SL brez prefixa) | vsak request | — |
| EN whitelist | routing (EN_STATIC_ROUTES 19 poti + EN_DESTINATION_SUBROUTES ×5 vzorcev + EN_ADRIA_ROUTES /vodici/[slug]) | Kje angleščina ŽIVI (jedro lijaka + info + L-poti trznica/dozivetja/lokali/dogodki/moja-potovanja) | — | — |
| IT/DE whitelist | routing (ITDE_STATIC_ROUTES 11 + destinacijske pod-poti ×5) | W1: jedro + zemljevid + načrtovalnik + destinacijske plasti | — | — |
| FR/ES whitelist | routing (FRES_STATIC_ROUTES 11 + pod-poti ×5) | W12: 1:1 vzorec W1 | — | — |
| isLocaleRoute | routing | Generalizacija: ali ima POT različico v podanem javnem jeziku | jezikovni preklopnik, hreflang, sitemap | — |
| localePrefix | routing | "" za sl, "/en" itd. | meta/canonical | — |
| Custom i18n proxy | `src/proxy.ts` | Zazna prefix → nastavi x-next-intl-locale → rewrite brez prefixa (brez [locale] segmenta!) + NEXT_LOCALE cookie; /sl → 308 na /; varovalka proti standalone zanki (interni marker, strip zunanjih headerjev 19e-3); prefix poti BREZ različice → **308 na slovensko pot** (nikoli 404, nikoli mešanje) | vsak page request | rewrite/308 |
| LanguageSwitcher | `language-switcher.tsx` | 6 jezikov z zastavicami; VIDNOST po isLocaleRoute (ponuja samo obstoječe); stripLocalePrefix za cilj | klik | navigacija v locale |
| hreflang | `components/seo.tsx` (hreflangForPath) + strani | x-html alternate ×6 (samo za whitelistne poti) | vsaka stran | head |
| Sitemap z hreflang | `lib/sitemap-urls.ts` + `/sitemap.xml` | 371 SL URL + EN + IT/DE + FR/ES različice → 3546 URL (I17 produkcijska evidence) z xhtml:link alternati — skupaj 24.576 hreflang vnosov | GET /sitemap.xml | — |
| Prevodi | `src/i18n/messages/{sl,en,it,de,fr,es}.json` + `src/i18n/fragments/*` (~45 fragmentov ×2 jezika) | getLocale/getMessages v layoutu; fragmenti za strani | — | — |
| Podatkovne plasti | `lib/slovenia-data{-en,-it,-de,-fr,-es}.ts`, `events-data{-en,-it,-de}.ts`, `adria-guides{-en}` | Overlayji destinacij/dogodkov/vodnikov po jeziku | strani | — |
| MT notice | `mt-notice.tsx` | Iskrena oznaka strojnega prevoda kjer primerno | — | — |
| Honest limit L-poti | routing/proxy | L-vzorčne poti (inline SL/EN slovarji) za it/de/fr/es → 308 fallback SL (dokumentirano) | /it/trznica ipd. | 308 |

---

## 18. API endpointi (144 kanonskih, po domenah)

Skupine (števci preverjeni z git ls-files + awk): **owner 23 · admin 21 · itinerary 13 · cron 8 · user 6 ·
trip 6 · journey 5 · analytics 4 · stripe 3 · push 3 · bookings 3 · listings 3 · experiences 3 · pois 3 ·
products 2 · destinations 2 · recommendations 2 · trip-comments 2 · poll 2 · plan-check 2 · ostalo 58**
(= 28 posamičnih endpointov po 1 + 6 skupin po 3 + 6 skupin po 2; 86 + 58 = 144 točno).

| Domena | Endpointi | Povzetek obnašanja |
|---|---|---|
| owner (23) | register, forgot-password, reset-password, verify-email, login prek /owner/prijava strani + auth; analytics, auto-tag, bookings, sponsorship, subscription, payouts(2), commissions(3), listings(3), products(2), experiences(5) | B2B: CRUD ponudbe, koledar razpoložljivosti, payouti/komisije, avtomatske oznake |
| admin (21) | pending, approve/[id], reject/[id], verify, listings(3), analytics, ai-usage, affiliate-stats, audit-log, indexing, leads, leads-dashboard, push/send, sponsorships, status-counts, subscriptions(2), logout, track-pageview | Adminacija: moderacija listingov, vpogledi, indeksacija, push, naročnine |
| itinerary (13) | (root POST/GET), ask, refine, save, shared/[shareId](+revisions,+pdf), bookings, stops-along-way, ingest, ingest-pdf, ingest-image, ingest-pins | Pogon načrtovalnika (§8), deljenje, uvozi |
| cron (8) | commission-invoices, recalculate-status, draft-reminders, renewal-reminders, kiwitaxi-reingest, sto-reingest, daily-trip-push, weekly-alerts | Redna vzdrževalna opravila (Vercel cron) |
| user (6) | register, forgot-password, reset-password, verify-email, trips, trips/claim | B2C računi + lastništvo poti |
| trip (6) | [shareId](GET/PATCH), expenses, collaborators(+accept), version, documents | Skupnostna plast deljene poti (§15) |
| journey (5) | plan, bookings, bookings/[bookingNumber]/cancel-request (v bookings 3 skupaj), bookings/import, bookings/parse, bookings/email-inbound | Ponudniki/rezervacije (§12, §14) |
| analytics (4) | event (whitelist VALID_EVENTS), funnel, ab-event, provider-roi | Pilotna analitika (ANALYTICS-EVENTS.md) |
| stripe (3) | checkout, portal, webhook | Demo fail-closed (§12.4) |
| push (3) | subscribe, unsubscribe (+sw.js handlerji) | Web push |
| bookings (3) | bookings, [bookingNumber], [bookingNumber]/cancel-request | Lastna tržnica izkušenj |
| listings (3) | listings, [slug], [slug]/track | Javni imenik lokalov (QH-2: limit varovalka + featured/rating sort) |
| experiences (3) + 2 | experiences, [slug], [slug]/availability | Javne izkušnje + razpoložljivost |
| pois (3) | pois, pois/[id], pois/describe | OSM/FSQ POI + lazy describe |
| products (2) | products, products/[slug] | Javni izdelki tržnice |
| destinations (2) | destinations, destinations/[slug] | Javni JSON destinacij |
| recommendations (2) | recommendations/experiences, recommendations/products | Priporočila |
| trip-comments (2) | trip-comments, trip-comments/ai-reply | Skupinski klepet + @AI |
| poll (2) | poll, poll/vote | Ankete deljene poti |
| plan-check (2) | plan-check, plan-check/stats | Validator tujih načrtov + telemetrija |
| ostali (58) | auth/[...nextauth], beta-status, chat, checkout, smart-search, collections/[slug], insights, debug-db, trip-guide, diary, health, ai-health, ai/sources, weather, leads, trip-vote, trip-likes, consultations, reviews, newsletter/subscribe, email-itinerary, my-trip, orders/[orderNumber], supply/search, ask-local, map/pins, track-funnel, listing-inquiry (28 × 1) + experiences/[slug](+availability), pois/[id](+describe), products/[slug], destinations/[slug], recommendations/*, trip-comments/ai-reply, poll/vote, plan-check/stats (6 × 2) | Glej posamične sekcije zgoraj (§7, §9, §11, §12, §15, §16) |

---

## 19. PWA / offline

| Funkcija | Lokacija | Trenutno obnašanje | Vstopna točka | Cilj/sprememba stanja |
|---|---|---|---|---|
| manifest.json | `public/manifest.json` (113 vrstic) | Ikone 192/512, name, shortcuts (task75), theme | namestitev | instalirana PWA |
| sw.js (sw3) | `public/sw.js` (410) | Strategije: shared/* network-first; OSM tile-i cache-first (dai-tiles LRU 600); slike dai-img LRU 120; statika dai-shell LRU 400; HTML network-first s fallbackom zadnjega → /offline.html; /pot/* + /na-poti → dai-plans (40, ≤250 KB); NIKOLI /api/* (razen shared), /admin, /owner, non-GET; push + notificationclick; activate počisti legacy cache | obisk | predpomnilniki |
| offline.html | `public/offline.html` (741) | Samoizpolnitvena stran: seznam načrtov iz localStorage/cache (Go Mode zapisi V2 + matrika zmožnosti) | brez signala | prikaz načrtov |
| sw-register | `components/sw-register.tsx` | Registracija v OBEH okoljih (dev ?dev=1 — caching izklopljen, push aktiven); updateViaCache none; SKIP_WAITING; dai:sw-update dogodek | mount layouta | SW aktiven |
| PwaUpdateToast | `pwa/pwa-update-toast.tsx` | Toast »Osveži« ob novi verziji | dai:sw-update | reload |
| PwaHeaderIcons | `pwa/pwa-header-icons.tsx` | Namestitev/offline namig v navigaciji | navigacija | — |
| Test varovalke | `__tests__/task73-offline-gomode.test.ts`, `task78-offline-days.test.ts`, `task75-pwa-shortcuts.test.ts`, `issue4-wave4-offline.test.ts` | — | — | — |

---

## 20. Slovenia Pass (/slovenia-pass + gamifikacija)

| Funkcija | Lokacija | Trenutno obnašanje | Vstopna točka | Cilj/sprememba stanja |
|---|---|---|---|---|
| Logika (ena točka resnice) | `lib/pass-logic.ts` (379 vrstic; QH-1 1.153.1) | Točke: itineraryGenerated +50 / destinationViewed +10 / listingViewed +5; regije; značke; idempotentno nagrajevanje (lastItineraryKey hash); PASS_REGIONS = kanonskih 9 SLOVENSKIH regij (master »vseh 9« šteje SAMO te — balkanski obiski se zapišejo pošteno, a NE štejejo); computeUnlockedBadges (persistirano ∪ pogoji); countVisitedSlovenianRegions; freshPass() — vsako privzeto branje dobi LASTNE tabele (plitva kopija popravek) | dogodki | `discoverslovenia_pass` |
| Dogodki POSLUŠA | pass-logic + `slovenia-pass.tsx` | `itineraryGenerated` {destinationIds, locations?}, `destinationViewed` {destinationId}, `listingViewed` {listingId} | window CustomEvent | pass stanje |
| Dogodki ODPOŠILJE | pass-logic | `passUpdated` (komponenta znova prebere) + `passToast` {message} (lahek toast 3 s) | mutacija | UI osvežitev |
| 3 razpošiljalci | itinerary-planner (itineraryGenerated), destination-modal (destinationViewed), listing-modal (listingViewed) | QH-1: source-contract varovalka (5 listenerjev + 3 razpošiljalci) | akcije uporabnika | dogodki |
| Komponenta | `slovenia-pass.tsx` (301) | Kartica potnega lista: točke, števec X/9, značke (6: nature/food/activity/local/explorer/master), naslednja regija, toast | /slovenia-pass | prikaz |
| Sekcija + stran | `slovenia-pass-section.tsx` + `app/slovenia-pass/page.tsx` (+Chatbot) | Stran s CTA v odkrivanje | Nav Več / ExploreHub / footer | — |
| Test varovalka | `__tests__/issue17-slovenia-pass.test.ts` (43 varovalk — QH-1) | — | — | — |

---

## Aneks A — Funkcije, ki jih iz kode NISEM mogel popolnoma preveriti (iskreni seznam)

1. **`GET /api` (scaffolding »Hello, world!«)** — obstoj potrjen; ali ga kdo kliče, nisem preverjal (nizka prioriteta; 17-A ga ni štel).
2. **Socket mini-service 3003 (trip chat/presence)** — klientna plast preverjena (`trip-presence-socket.ts`, use-trip-chat); strežniške strani socket servisa v tem repozitoriju nisem pregledal (live delovanje odvisno od deploymenta — klient ima polling fallback, kanon G2).
3. **Cron dejanski razporedi na Vercelu** — route handlerji obstajajo (8); vercel.json cron konfiguracijo nisem odpiral v tej seji (17-A jo ni izpodbijal).
4. **Podrobnosti owner/admin UI tokov** (vseh 44 lastnosti dashboardov) — komponente importirane in z enumerated API-ji; posamičnih obrazcev nisem bral vrstico-po-vrstici (obseg; API kontrakti so zbrani v §18).
5. **`debug-db`** — ruta obstaja; zaščitena stanja nisem preverjal v tej seji.
6. **`sections/map-section.tsx`** — komponenta obstaja in JE montirana (`src/app/zemljevid/page.tsx` jo uvaža — preverjeno); cele datoteke nisem bral, ker je njeno jedro map-view.tsx prebrano (§9).
7. **Produkcijski env** — .env realnost (samo DATABASE_URL + VERCEL_TOKEN) povzeta po 17-B; nisem ponovno odpiral .env (enak zaključek pri QH-1/QH-2).

## Aneks B — Viri

- Datotečni sistem @ HEAD `f599e82` (1.153.2): Glob/Grep/Read pregled ~70 ključnih datotek (strani, komponente, lib, route handlerji, public/).
- worklog.md vnosi 17-A (39 strani/144 API inventura), 17-B (22 Add površin, provider/marketplace iskrenost), QH-1 (Slovenia Pass), QH-2 (Lokali) — spot-check: vse števke, ki jih citiram, so bile na novo preverjene ali se ujemajo z današnjo enumeracijo.
- docs/ANALYTICS-EVENTS.md (dogodki plannerja — spot-check v planner-analytics.ts), docs/PRODUCT-FUNCTIONALITY-MATRIX.md (samo orientacija — zastarel, 1.110-era).
- Števka »24.576 hreflang vnosov« iz I17 produkcijske evidence (sitemap v živo); v kodi: 3546 URL-jev × alternati.

*Konec dokumenta — PARITY BASELINE za Issue #19 FAZA F primerjavo.*
