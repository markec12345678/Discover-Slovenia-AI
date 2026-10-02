# 🇸🇮 Discover Slovenia AI

> **AI potovalni concierge za Slovenijo in jadransko regijo (SI · HR · ME · AL).**
> Načrtovanje večdnevnih potovanj iz naravnega jezika, odkrivanje 125.446 krajev,
> orkestracija čez ponudnike (transferji, nastanitve, hrana, bencin) in ena časovnica
> potovanja — s sistemom, ki vedno iskreno pokaže, kaj je dejansko živo in kaj ni.
> Od različice 1.116.0 (Issue #9) je jedro **100 % deterministično — 0 AI žetonov**
> (isti vhod → isti načrt); AI ostaja le kot opcijska vizija za razumevanje slik.

[![CI](https://github.com/markec12345678/Discover-Slovenia-AI/actions/workflows/ci.yml/badge.svg)](https://github.com/markec12345678/Discover-Slovenia-AI/actions/workflows/ci.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791?logo=postgresql)](https://neon.tech/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38B2AC?logo=tailwindcss)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

| | |
|---|---|
| **Live aplikacija** | <https://i-feel-slovenia.onrender.com> (Render, primarna) · <https://i-feel-slovenia.vercel.app> (Vercel, sekundarna) |
| **Dokumentacija** | [docs/](docs/) · [CHANGELOG.md](CHANGELOG.md) · [SECURITY.md](SECURITY.md) |
| **Stanje** | v1.163.4 ŽIVA · 4757 testov · VERIGA DISCOVER ISSUE-jev ZAKLJUČENA IN PRODUKCIJSKO DOKAZANA (1.–2. 10. 2026): ISSUE #22 (TRAVEL GUARDIAN) ZAPRT (1.162.0–1.163.3) — Guardian sloj čez celotno življenjsko dobo poti (zbiralnik pred odhodom, jutranji ZAČNI DAN cikel stanj z GPS zavrnitvijo/aktivacijo, opozorila zamuda/blizu/termin, terminal POT ZAKLJUČENA, update-pot tok z PATCH na mestu) — 20 produkcijskih dokazov, vseh 13 §26 dostavljivcev PRODUCTION VERIFIED (Render + Vercel; `docs/evidence/issue22/`) · ISSUE #23 (GUIDED PLATFORM EXPERIENCE) ZAPRT (1.163.0/1) — vodena plast (first-run, »Ne vem« vodena pot, NAČRTUJ trak, hub veriga, returning banner, terminal POT ZAKLJUČENA) — 8 produkcijskih dokazov · ISSUE #21 (DISCOVER — LIVE TRIP NAVIGATOR) ZAPRT (1.161.0/1) — produkcijsko dokazan · ISSUE #20 preostanek = SAMO zunanji blokerji (Stripe račun, Viator/affiliate/SendGrid ključi — uporabnik); pripravljenost na vstavitev ključev utrjena 1.163.4 (`.env.example` POPOLN — 12 prej nedokumentiranih produkcijskih imen dodanih, mrtvi APP_URL odstranjen, STRIPE_PUBLISHABLE_KEY pošteno NEBRAAN; pogodbenski test env dokumentacije varuje drift) · prej ISSUE #21 (DISCOVER — LIVE TRIP NAVIGATOR) jedro (1. 10. 2026): kanonični TRAVEL state (`upcoming/active/navigating/near_destination/arrived/completed/skipped` — čista plast `travel-state.ts`, VESOJ ločena od JourneyBooking rezervacij; GPS prihod NIKOLI ne potrdi rezervacije) + ARRIVAL DETECTION (geofence `clamp(60 m, accuracy+10 m, 150 m)` + hystereza 75 m + min. stabilnost 8 s) z UX »Približuješ se — X m« → »✓ Prišel si na lokacijo« (`role="status"`, zaključek ostaja izrecna uporabnikova potrditev) + PRESKOK pod nadzorom uporabnika (gumb + razdelek + Obnovi, ločena persistenca `dai:go-skipped`) + SAMODEJNA NAPREDOVANJA (naslednji cilj zasede kartico brez vračanja v planer) + STABILNI VSEBINSKI KLJUČI (`itin-d{dan}-{dest}` — napredek preživi preureditev načrta; prej pozicijski ključi so razveljavili cel dan) + GPS cikel (1× auto-retry prehodnih napak, izrecna zastarelost fiksacije) + REZERVACIJSKA PREKRIVKA v Go Mode (SAMO branje — isti GET kanal kot MOJA POT) + glasovne fraze prihoda (0 AI); 81 novih testov, `docs/LIVE-TRIP-NAVIGATOR.md` (10 arhitekturnih odločitev §23); meje iskrene: turn-by-turn ostaja zunanji, ETA hevristika, multi-device napredek dokumentiran · prej ISSUE #20 (DISCOVER — Production Activation & Live Supply Readiness) FAZA 2 (1. 10. 2026): §4 B2C checkout AKTIVACIJSKA POT ZAKLJUČENA — `/api/checkout` (izdelki) in `/api/bookings` (izkušnje) sta prej bila 501 TODO tudi ob ključih; zdaj: pending rezervacija (atomarna zaloga/kapaciteta) → Stripe Checkout Session (`metadata.type=marketplace_order|marketplace_booking`, 60-min okno) → `{ url }` → webhook `checkout.session.completed` (edini writer »paid«/»confirmed«; P3b-6 preverba zneska) + `expired|async_payment_failed` sprostitve + `PaymentReturnBanner` na /trznica in /dozivetja; brez ključev iskreno 503 (NE 501) — stanje NOT CONFIGURED do Stripe računa; 37 novih testov (`issue20-marketplace-checkout`), iskrena popravka oznake faze 1 v statusnem dokumentu · prej FAZA 1 (1. 10. 2026): lastna tržnica PRODUKCIJSKO PREVERJENA skozi celotno pot (2 geo listinga: supply → marker → POI popup → Dodaj v mojo pot → hub; dokazi `docs/evidence/issue20/`) → matrika own dvignjena PRODUCTION_CONFIGURED → **LIVE_DATA_VERIFIED** (Stripe checkout ostaja iskren NOT CONFIGURED bloker) · NOV `bun run activation:check` (§11: iskren izpis ACTIVE/CONFIGURED/NOT CONFIGURED/BLOCKED za vseh 16 providerjev, 12 testov) · `docs/PRODUCTION-ACTIVATION-STATUS.md` (§5 master matrika) · README usklajen (4413/4142 popravek §12) · prej ISSUE #19 (DISCOVER — Premium Product Presentation) ZAPRT 1. 10. 2026: koherentna premium prezentacija z **ZERO FEATURE LOSS** — faza A inventura [`docs/FUNCTION-PARITY-BEFORE.md`](docs/FUNCTION-PARITY-BEFORE.md) (39 strani, 144 API, 387 funkcij, 20 območij) → B izhodišče [`BASELINE-VISUAL.md`](docs/BASELINE-VISUAL.md) (triaža REALNO vs ARTEFAKT) → C-1/2/3 implementacija (CTA hierarhija + 3-stopnjska elevacija, tipografski žeton `--foreground-subtle` + 48/48 naslovi, ritem py-20 — 20 datotek, +66/−24, 0 API dotikov) → D regresija po fazah (4413/4413, lint 0, tsc 0) → E responsive [`RESPONSIVE-VERIFICATION.md`](docs/RESPONSIVE-VERIFICATION.md) (72 meritev: 5 širin × 7 površin + 6 jezikov @320 + desktop; 0 prelivov, 0 noAlt; 4 prezentacijski popravki dotikalnih tarč WCAG 2.5.8) → F revizor [`FUNCTION-PARITY-AFTER.md`](docs/FUNCTION-PARITY-AFTER.md) (verdikt 0 izgub / 100 % pariteta) → G produkcijska kontrola na Vercelu 1.156.0 (3 zlate poti: hero čip → načrtovalnik s samodejnim 3-dnevnim itinererjem; Bled → Dodaj → hub Moja pot; zemljevid iskanje → POI popup → Dodaj v OBE plasti + ✓ Dodano; desktop 1280 + mobil 390 ×7 + 320 prag 0 preliva; 0 page/console napak; 13 dokazov `qh19-faza-g/`) · CI zelen · RENDER (primarna) AutoDeploy obnovljen — ISSUE #10 ZAPRT 1. 10. 2026 (drift 13+ verzij razrešen: catch-up job + lastnikov vklop AutoDeploy) · VERCEL (sekundarna) · lint 0 · tsc 0 |

**Kazalo:** [Trenutno stanje](#trenutno-stanje) · [Kaj lahko uporabnik počne](#kaj-lahko-uporabnik-počne) ·
[Geografska pokritost](#geografska-pokritost) · [Journey orkestracija](#journey-orkestracija) ·
[Iskrenost podatkov](#iskrenost-podatkov) · [Providerji](#providerji) · [Booking status](#booking-status) ·
[Glavne poti](#glavne-poti) · [Tehnologija](#tehnologija) · [Hitri začetek](#hitri-začetek) ·
[Konfiguracija](#konfiguracija-env) · [Deployment](#deployment) · [Poslovni model](#poslovni-model) ·
[Dokumentacija](#dokumentacija) · [Razvojna zgodovina](#razvojna-zgodovina)

---

## Trenutno stanje

### 🔴 Danes živi (live)

| Zmožnost | Vir |
|---|---|
| Načrtovanje potovanj v slovenščini, angleščini, italijanščini in nemščini (multi-turn, nikoli 500) — **100 % deterministično jedro** (Issue #9, 0 AI žetonov: isti vhod → isti načrt; tudi izboljšave, klepet, iskanje in vpogledi) | lastni `deterministic-itinerary` + deterministični chat engine |
| Skupinski klepet z @AI na deljenih poteh — deterministični domenski odgovori v skupinskem pogovoru; značka AI je strežniška (klient je ne more ponarediti; 1.131.0) | lastni chat-engine (0 žetonov) |
| Odkrivanje krajev: **125.446 krajev v 4 državah** | Foursquare OS Places (lokalna množica, Apache-2.0) |
| Živi POI sloj po viewportu zemljevida | OpenStreetMap Overpass API |
| Uradna turistična vsebina (RAG) | slovenia.info `llms.txt` (STO) |
| Transfer odkrivanje z objavljenimi realnimi cenami | KiwiTaxi partner feed (CSV) |
| Živo vreme (trenutno + dnevna napoved; po dnevih poti v MY TRIP in v dnevnih karticah itinerarja — načrtovalnik + deljen načrt) | Open-Meteo (brez ključa) |
| Zvočni povzetek dneva itinerarja (gumb »Poslušaj« v glavi dneva; načrtovalnik + deljen načrt + MY TRIP) + **glasovni vodič v Go Mode** (»Preberi postanek na glas« + »Kaj je v bližini« — 1.138.0) | brskalniški speechSynthesis (0 strežniških klicev, izgovor po kosih ≤ 960 znakov) |
| Segmentacija dneva Jutro / Popoldan / Večer + poštene etape med postanki (🚗 ~X km · ~Y min, isti vir kot značke km dni) na vseh površinah načrta | lastna lib day-segments + OSRM legs |
| **38 kuriranih destinacij** v 4 državah + EN · IT · DE različice | lastni destinacijski register |
| Journey orkestracija, MY TRIP časovnica, natisljivi potrditveni dokument | lastna koda |
| Zunanje booking predaje (`/go`) in affiliate preusmeritve — 9 partnerjev na načrtovalniku (nastanitev, aktivnosti, vstopnice, najem, vlaki, transferji, leti, eSIM, zavarovanje) | 16-provider omrežje |
| Dvojezična booking plošča načrtovalnika (vsi naslovi, opisi, CTA-ji, prazna stanja in opis zavarovanja z dnevi načrta — SL + EN; 1.85.0) | next-intl (`planner.booking`, 33 ključev) |
| Polni booking lifecycle potovanja (14 statusov, zadnji DRAFT iz Issue #4, + prehodi; POST/GET/PATCH `/api/journey/bookings` — checkout handoff zapisi EXTERNAL, MY TRIP prekrivka iz realnih vrstic, provider prehodi fail-closed za žetonom; 1.86.0) | Prisma `JourneyBooking` + `lib/journey/booking.ts` |
| Marketplace payout + customer state (payoutStatus not_due→due→processing→paid, gostov zahtevek preklica z AuditLog, lastnikova vidnost; 1.86.0) | Prisma `Booking` + `lib/marketplace-types.ts` |
| **Deterministični motor načrta kot naravna pot** (`engine="deterministic"`: 0 LLM žetonov, 100 % reproducibilno, isti vhod → isti načrt; ISTA validacijska/obogatitvena veriga kot AI pot — supply, vreme, OSRM, geo-validacija; stikalo "Z AI / Brez AI" v UI; 1.87.0) | `lib/deterministic-itinerary.ts` + `/api/itinerary` |
| Lastna tržnica (partnerji, izdelki, izkušnje) z lastnim checkoutom in pini na supply zemljevidu (listingi in izkušnje s koordinatami) | lastna baza + Stripe (tehnična aktivacijska pot zaključena 1.158.0 — do ključev iskren demo mode / 503) |

### 🟡 Pripravljeno, čaka na aktivacijo ponudnika

- **7 API adapterjev je kodirano-pripravljenih** (Viator, GetYourGuide, Tiqets, Booking,
  Skyscanner, Airalo, Travelpayouts) — vrata so živo preverjena, vsak adapter je priklopljen
  v **iskreno praznem stanju**, dokler poverilnica ni v env. To NI aktivna API integracija.
- **Affiliate plast deluje ŽE DANES brez poverilnic** (fail-closed čiste povezave): vsaka
  `/go/*` preusmeritev vodi na delujočo partnerjevo stran (`monetized: false` — nikoli
  lažnega trackinga); ko poverilnica pride v env, se monetizacija prižge **brez spremembe
  kode**. Načrtovalnik pokriva vseh 9 partnerjev (1.84.0: + Tiqets vstopnice, + zavarovanje
  z `days` iz dolžine načrta).
- **Booking arhitektura** — `JourneyBooking` stanjski model, potrditvena validacija,
  provider-agnostic registracija resolverjev — zamrznjena v stanju „activation ready".
- **Ni še aktivirano:** API booking, webhook ingest ponudnikov, živi citati/rezervacije,
  odpovedi in refundacije.

### Meje, ki jih sistem izrecno ločuje

- **Odkrivanje ≠ rezervacija** — rezultat iskanja ni potrjena rezervacija.
- **Affiliate preusmeritev ≠ inventar** — globoka povezava ni hotelska/letalska zaloga.
- **Zunanja rezervacija ≠ potrjena rezervacija** — številka rezervacije pomeni
  „Zunanja rezervacija", dokler provider ne vrne svoje.
- **Znana cena ≠ živi citat** — objavljena „od"-cena iz feeda ni potrjena cena ob poizvedbi.

---

## Kaj lahko uporabnik počne

- **Načrtovanje potovanj — 100 % deterministično (0 AI žetonov, Issue #9)** —
  naravni jezik (SL/EN + IT/DE na `/it/nacrtuj` in `/de/nacrtuj`), izboljšave v
  pogovoru; vhodi: besedilo, fotografija/screenshot (opcijska vizija), PDF,
  shranjene točke Google Maps.
  Med generiranjem: statusna vrstica z **dejanskim števcem**, fazo
  po značilnem vrstnem redu strežnika in gumbom **Prekliči** (tiho, brez
  izgube obrazca); odmor > 90 s → ločena jasna napaka (`aria-live` za
  bralnike zaslonov). Ob **regeneraciji obstoječi načrt NE izgine** — ostane
  viden, zamegljen in neinteraktiven (miška in tipkovnica) pod statusno
  vrstico; tudi ob napaki regeneracije stari načrt ostane na zaslonu.
- **Odkrivanje destinacij** — 38 kuriranih profilov s filtri po **državi, regiji, tipu,
  ceni (€–€€€) in oceni (★)**; programske podstrani (things-to-do, itinerary,
  best-time-to-visit, guide).
- **Interaktivni zemljevid** — Leaflet + OSM; FSQ sloj 125.446 krajev (nastanitve,
  restavracije, atrakcije, plaže, bencinske črpalke), transfer rute KiwiTaxi in pini
  lastne tržnice (lokalni in izkušnje s koordinatami — glob-povezava iz imenika vodi
  na zemljevid točno na lokaciji lokala).
- **Večdnevni itinererji z deterministično validacijo** — OSRM realne cestne razdalje/časi,
  odpiralni časi, cik-cak opozorila, 2-opt optimizacija zaporedja (namerni vrstni red
  uporabnika — FIXED izbire in lastni dodatki — se zamrzne, regresijska suita 1/2/14 dni),
  „preveri tuj načrt"
  (10 pravil, 0 AI žetonov), živo vreme v glavah dni (Open-Meteo, sidro po dnevih),
  zvočni povzetek (TTS — cel načrt ali posamezni dan; načrtovalnik, deljena
  povezava in MY TRIP), dnevi razdeljeni na segmente Jutro / Popoldan / Večer
  z etapami med postanki (ista številka kot v podrobnem pogledu — nikoli
  izmišljenih minut),
  pogovor z načrtom.
- **Journey načrtovanje čez ponudnike** — prihod → transfer → nastanitev →
  znamenitosti (odprti viri po 4 državah) → hrana → bencin → dogodki v enem
  načrtu, ki upošteva dejanske zmogljivosti virov.
- **MY TRIP** — ena časovnica po dneh; vsaka postavka nosi realni status
  (Zunanja rezervacija / Samo informacija); **živa dnevna napoved po dnevih
  potovanja** (Open-Meteo — čip pri vsakem dnevu z realnim, DST-varnim
  datumom (koledarska aritmetika — preklop na zimski čas ne podvoji
  datuma dneva); pretekli
  dnevi/dnevi čez ~16-dnevni horizont vira iskreno brez čipa, vir izrecno
  naveden); **zvočni povzetek dneva** (gumb »Poslušaj« — popotnik posluša
  svoj načrt, tisk dokumenta ostane čist); **pas zdravja virov** (katere vire ni bilo mogoče doseči ob
  generiranju — imena iz registra, „nič izmišljenega", ostalo potovanje
  deluje; zdravo stanje = brez pasa, ne tiska se); natisljivi
  potrditveni dokument (čipi vremena, zvok in pas zdravja se ne tiskajo).
- **Na poti (Go Mode)** — Now&Next sopotnik MED potovanjem: živa ura, naslednja
  postanka načrta, razdalja in smer do nje (GPS, premica — izrecno ne vozna),
  **živo vreme pri naslednji postanki** (Open-Meteo: trenutno stanje + današnja
  napoved, vir in čas meritve izrecno navedena), **navigacijski handoff**
  (gumb „Navigiraj": na mobilnem geo: URI → sistemski izbirnik navigacijskih
  aplikacij — Google Maps, Waze, Organic …; na namizju Google Maps URL; cilj
  so realne koordinate postanka, ne iskanje po imenu), opravljanje z enim
  klikom, prihodnji dnevi; **glasovni vodič** (1.138.0 — »Preberi postanek na
  glas«: izgovor izključno iz dejstev kartice [naslov, ponudnik, termin,
  lokacija, GPS-razdalja, trajanje]; »Kaj je v bližini«: destinacije okoli
  živega GPS z imeni, razdaljami in smermi; brskalniška sinteza govora — 0
  strežniških klicev, slovenske številke v besedah za pravilen izgovor);
  načrt je shranjen na napravi in deluje tudi brez
  signala (vreme je edina plast, ki potrebuje signal — ob izpadu iskrena
  opomba).
- **Klepet na vsebinskih površinah (W9, 1.130.0)** — vse 38 destinacijskih
  pod-poti (hub, things-to-do, best-time, guide, itinerary) imajo klepet;
  vstopne točke v vsebini odprejo klepet s **pred-izpolnjenim UREDITLJIVIM
  vprašanjem** — nikoli se ne pošlje samodejno (uporabnik vidi, uredi in sam
  pritisne Pošlji).
- **Skupinski klepet z @AI (W2, 1.131.0)** — na deljenih poteh (`/pot/[shareId]`)
  skupina klepeta v živo (osveževanje vsakih 6 s); omeni @AI in strežnik izda
  domenski odgovor z značko »AI svetovalec« — značka je strežniška, klient je
  ne more ponarediti.
- **Kolekcije priljubljenih (W3, 1.132.0)** — seznam »Priljubljene« dobi
  preklope Vse / Po destinaciji / Po temi (hrana, kultura, aktivnosti, mir …)
  in gumb **Načrtuj**, ki zbirko »someday« prenese v načrtovalnik.
- **Sezonski pas heroja (W4, 1.134.0)** — domača stran diha s sezono
  (mesec → sezona, 0 AI, isti opisi kot bestTime); sezonski CTA odpre klepet
  po W9 kanonu.
- **Visok kontrast + bralni način (W5, 1.135.0)** — dostopnost po vzoru
  slovenskih nacionalnih standardov: meni ob preklopu teme, stanje se zapomni
  (brez utripa ob ponovnem nalaganju); `prefers-contrast: more` se spoštuje,
  izrecna človekova izbira pa zmaga nad sistemskim.
- **Dogodki kot odkrivanje (W6, 1.136.0)** — pas »Kaj se dogaja izven tvojih
  datumov« na načrtovalniku: dogodki na istih destinacijah/regijah, ki se NE
  prekrivajo z okvirjem potovanja + CTA za vstopnice (iskrena partnerska
  nota, sledeča G6 poti).
- **Razpršitev v klepetu (W8, 1.137.0)** — odgovori o javno dokumentiranih
  gnečah točkah (Bled, Vintgar, Postojna, Piran, Ljubljana) dobijo iskreno
  opombo o vzorcu obiskanosti + 2 najbližji mirnejši alternativi z razdaljo —
  predlog, nikoli skrito preusmerjanje.
- **Transferji** — odkrivanje iz objavljenega KiwiTaxi feeda z realnimi cenami;
  rezervacija prek zunanje predaje `/go`.
- **Najem avtomobilov** — odkrivanje prek affiliate sloja z zunanjim handoffom
  (ni lastni inventar).
- **Dogodki** — koledar dogodkov (slovenski viri); na načrtovalniku datumsko
  ujemanje (dogodki MED tvojim obiskom) + brskalni pas izven datumov (W6).
- **Tržnica** — lokalni partnerji, izdelki in izkušnje z lastnim checkoutom;
  partner/admin ob ustvarjanju vnese pin lokacije (geo koordinate — tudi v onboarding
  čarovniku), javni imenik pa glob-povezuje na zemljevid točno na lokaciji;
  B2B portala za ponudnike (`/owner`) in administratorje (`/admin`).
- **Slovensko + angleško + italijansko + nemško + francosko + špansko izkušnja** —
  SL privzeto, EN na jedru lijaka (`/en/…`), IT/DE na domači strani,
  destinacijah, zemljevidu in načrtovalniku (`/it/…`, `/de/…` — W1,
  1.126.0–1.129.0), FR/ES na domači strani, destinacijah, destinacijskih
  pod-potih, zemljevidu, načrtovalniku in klepetu (`/fr/…`, `/es/…` — W12: faza 1
  [1.144.0: jedro odkrivanja + svetovanja] + faza 2a [1.145.0:
  /destinacija/* ×38 + /zemljevid 6-jezičen z FR/ES iskanjem in razlogi
  zadetkov] + faza 2b [1.146.0: /fr/nacrtuj + /es/nacrtuj — planner
  pogon 6-jezičen: Q&A, pakirni seznam, hitre akcije, NL ukazni parser
  z diakritiko ç/ñ, ICS/zvočni izvozi, dogodki dedijo EVENTS_EN] +
  faza 2c [1.147.0: klepet — domenska plast vrača PRAVE FR/ES odgovore
  (33 L tabel, ~150 namenskih vzorcev, FR/ES overlayji + razpršitveni
  namig)]; celoten jedrni lijak je 6-jezičen]);
  poti brez različice se varno preusmerijo (308), nikoli mešanje jezikov.
- **PWA** — načrti brez povezave (aktivno Go Mode potovanje tudi na splošni offline
  strani), pameten pakirni seznam z razlogi, proračun na osebo,
  ICS/QR deljenje; bližnjice ikone aplikacije (4) vodijo na dejanske strani
  (načrtuj/zemljevid/tržnica/destinacije — testno varovane); dnevi na
  offline strani nosijo REALNE datume (»Dan N · torek, 14. septembra«,
  DST-varna koledarska aritmetika — ISTA kot online načrtovalnik od
  1.74.1; source-contract testi, preklop dokazan v pasu Europe/Ljubljana).

Vsaka zmožnost zgoraj je preverjena v kodi; zmožnost, ki obstaja samo v načrtu,
ni navedena.

---

## Geografska pokritost

**Odkrivanje (discovery) — 4 države (FSQ OS Places, snapshot 2025-02-06):**

| Regija | Krajev | Stanje |
|---|---:|---|
| Slovenija | 18.010 | Live |
| Hrvaška | 88.331 | Live |
| Črna gora | 10.285 | Live |
| Albanija | 8.820 | Live |
| **Skupaj** | **125.446** | Live |

OSM sloj je geografsko nevtralen (po viewportu), torej pokriva vse štiri države.

**Kurirana/provider plast — odvisna od vira (NE enako globoko povsod):**

| Plast | Pokritost |
|---|---|
| Destinacijski register (kurirani profili) | 38 destinacij v 4 državah (SI 22 · HR 8 · ME 4 · AL 4) |
| Transferji (KiwiTaxi feed) | Rute, ki se dotikajo Slovenije (iz/v SI) + regionalne rute, kjer feed dejansko vsebuje podatke; kjer jih ni (npr. Dubrovnik, Kotor, Tirana) → iskreno „ni transfernih rut" |
| Uradna vsebina STO (RAG) | samo Slovenija |
| Dogodki | samo Slovenija |
| Fallback načrtovalnik (AI odpoved) | privzeto slovenski bazen; regionalne destinacije samo na izrecno željo |
| AI supply kontekst | slovenski bbox (~4 deg²); regija samo izrecno |

Platforma **ne trdi** enake globine journey/provider pokritosti v vseh štirih državah —
plast je točno taka, kot jo dejansko nosi vir.

---

## Journey orkestracija

```
Uporabnikova želja (naravni jezik)
        ↓
Destinacija / čas / preference (38-destinacijski register, 4 države)
        ↓
Provider capability registry (16 ponudnikov, zmogljivosti po viru)
        ↓
Dejansko dostopni viri (4 viri PRODUCTION_ACTIVE + lastna tržnica PRODUCTION_CONFIGURED; preostali iskreno prazni)
        ↓
Validacija (geo-koherenca, realni časi, cik-cak, duplikati)
        ↓
Journey produkti (transferji, nastanitve, znamenitosti, hrana, bencin, dogodki)
        ↓
Itinerer + MY TRIP (časovnica po dneh, status vsake postavke)
        ↓
Na poti / Go Mode (Now&Next na napravi: GPS razdalja/smer, opravljeni postanki)
        ↓
Zunanja predaja (/go) ali — po aktivaciji — API booking
```

Sistem uporablja **provider capability registry** (`src/lib/supply/registry.ts` +
strojno berljiva `production-matrix.ts`): ne predpostavlja, da ima vsak ponudnik
enake zmogljivosti. Cene, razpoložljivost in vrsta dostopa so klasificirane po viru
(LIVE_PRICE / FROM_PRICE / UNKNOWN / NOT_SUPPORTED), matrika in register pa sta
testovno zaklenjena proti driftu (ena resnica).

---

## Iskrenost podatkov

To je tehnično pravilo sistema, ne marketinška obljuba:

| Ločevanje | Pomen |
|---|---|
| Inventar vs affiliate | povezava do partnerja NI zaloga sob/sedežev/avtov |
| Znana cena vs „od"-cena | objavljena spodnja meja NI živi citat |
| Razpoložljivost vs unknown | brez dokaza nikoli „available" — vedno „neznano" |
| Zunanja vs potrjena rezervacija | št. rezervacije overi šele provider |
| Provider potrditev vs stanje klienta | klient nikoli ne „izmisli" potrditve |
| Uradni vir vs uredniška kuracija (1.99.0 §18) | 9/38 destinacij ima curl-preverjen zunanji vir; 29 je iskreno označenih „uredniška kuracija" — nikoli izmišljen vir; AS-OF datum vezan na git zgodovino (test past) |

**Manjkajoči podatki ponudnika se prikažejo kot nedosegljivi/neznani — nikoli izmišljeni.**
Vsak adapter je fail-closed: manjkajoča poverilnica = prazna plast + jasna opomba
(not-configured / partner-approval-required), nikoli napaka in nikoli lažni podatki.

---

## Providerji

| Provider | Zmožnost | Vrsta dostopa | Stanje |
|---|---|---|---|
| **FSQ** (Open Places) | odkrivanje krajev (4 države) | odprti podatki (lokalna množica) | **PRODUCTION_ACTIVE** |
| **OSM** | odkrivanje POI (viewport) | odprti podatki (žive poizvedbe) | **PRODUCTION_ACTIVE** |
| **STO** (slovenia.info) | uradna vsebina (RAG) | statična vsebina | **PRODUCTION_ACTIVE** |
| **KiwiTaxi** | transfer odkrivanje | partner CSV feed + affiliate | **PRODUCTION_ACTIVE** (rezervacija zunanja) |
| Viator | izleti/aktivnosti (API) | affiliate deep-link | CODE_READY / NOT_CONFIGURED |
| GetYourGuide | izleti/aktivnosti (API) | affiliate deep-link | CODE_READY / PARTNER_APPROVAL_REQUIRED |
| Tiqets | vstopnice (API) | affiliate deep-link | CODE_READY / PARTNER_APPROVAL_REQUIRED |
| Booking | nastanitve (API) | affiliate deep-link | CODE_READY / PARTNER_APPROVAL_REQUIRED |
| Skyscanner | leti (API) | affiliate deep-link | CODE_READY / PARTNER_APPROVAL_REQUIRED (izhodišče = produktna vrzel) |
| Airalo | eSIM (API) | affiliate deep-link | CODE_READY / PARTNER_APPROVAL_REQUIRED |
| Travelpayouts | podatkovni API | search API | CODE_READY / NOT_CONFIGURED (self-serve) |
| DiscoverCars | najem avtov | affiliate deep-link | CONTRACT_VERIFIED / BLOCKED (B4B pogodba) |
| Omio | transport | affiliate deep-link | CONTRACT_VERIFIED / PARTNER_APPROVAL_REQUIRED |
| WorldNomads | zavarovanje | affiliate only | CONTRACT_VERIFIED (brez API) |
| SafetyWing | zavarovanje | affiliate only | CONTRACT_VERIFIED (brez API) |
| Lastna tržnica | partnerji/izdelki/izkušnje + geo pini (supply zemljevid) | direktni booking | **PRODUCTION_CONFIGURED** (geo sloj živ — listingi in izkušnje s koordinatami; stopnja NE prečka v ACTIVE, dokler živi partnerji s pini niso dokazljivi) |

Stanja so izpeljana iz [`src/lib/supply/production-matrix.ts`](src/lib/supply/production-matrix.ts)
(strojno berljiva matrika življenjskega cikla; človeška različica s runbooki:
[docs/PROVIDER-APPLICATIONS.md](docs/PROVIDER-APPLICATIONS.md)).
Affiliate preusmeritev ≠ živi inventar — dokler ključ ni v env, adapterji strežejo
iskreno prazne sloje.

---

## Booking status

**Aktivno danes:**
- Zunanje booking predaje prek `/go/[provider]` (transferji, najem, affiliate cilji)
  — uporabnik rezervira pri ponudniku; platforma ne predstavlja, da je rezervacija
  potrjena.
- Affiliate preusmeritve (Viator, Booking, DiscoverCars, Skyscanner, …).
- Lastna tržnica: VSI lastni tokovi (naročnina premium/enterprise,
  sponzorstva, provizijski računi, izdelki, izkušnje) imajo PRAVO Stripe
  Checkout aktivacijsko pot (1.158.0): izdelki/izkušnje → pending vrstica
  (atomarna rezervacija zaloge/kapacitete) → Stripe Checkout Session →
  webhook `checkout.session.completed` (edini writer »paid«/»confirmed«;
  preverba payment_status + zneska) → e-pošta + povratni banner;
  `checkout.session.expired | async_payment_failed` rezervacijo sprostita.
  Brez `STRIPE_SECRET_KEY` je tržnica iskreno zaprta s 503 (demo veja samo
  z izrecnim `DSA_DEMO_PAYMENTS=1` — nikoli tiho fake plačilo); do ključev
  status NOT CONFIGURED (zunanji aktivacijski bloker, ne tehnična luža).

**Pripravljeno (arhitektura, NE predstavljati kot produkcijsko aktivno):**
- 7 provider API adapterjev (CODE_READY) — aktivacija samo z realno poverilnico,
  brez spremembe kode.
- `JourneyBooking` stanjski model + potrditvena validacija (številko rezervacije
  overi provider, ne klient).

**Ni še aktivirano:**
- API booking pri ponudnikih, webhook ingest, živi citat/rezervacija življenjski cikel,
  odpovedi/refundacije.

---

## Glavne poti

| Pot | Namen |
|---|---|
| `/` | domača stran — AI lijak |
| `/nacrtuj` | AI načrtovalnik itinererjev (jezik/slika/PDF/Maps → načrt) |
| `/potovanje` | journey načrtovalnik čez ponudnike (prihod/transfer/nastanitev/znamenitosti/hrana/bencin) + MY TRIP s potrditvenim dokumentom (postavke po dneh, skupna cena §16) in pasom zdravja virov (§22 — samo ob odpovedi vira) |
| `/na-poti` | Go Mode — Now&Next sopotnik med potovanjem (GPS razdalje, opravljeni postanki; načrt na napravi — HTML v PLANS cache, LRU-varno) |
| `/destinacije` | 38 destinacij s filtri (država/regija + čipi interesa; tip/cena/ocena v zložljivih „Več filtrov"), razvrščanjem (priporočeno/ocena/cena) in ceno (≈ €) na kartici |
| `/destinacija/[slug]` | hub destinacije + programske podstrani |
| `/zemljevid` | interaktivni zemljevid (FSQ + OSM + transfer plasti) |
| `/moja-potovanja` | shranjena potovanja, naročila, deljene poti |
| `/trznica` · `/lokali` · `/dozivetja` | tržnica lokalnih partnerjev |
| `/dogodki` | koledar dogodkov |
| `/vodici` | ADRIA vodniki (SL + EN) |
| `/konzultacija` | globoke konzultacije (freemium; deterministične od Issue #9) |
| `/primerjava` | iskrena primerjava AI načrtovalcev |
| `/slovenia-pass` | digitalni potni list z značkami |
| `/vir-podatkov` | transparentnost virov (supply) |
| `/pot/[shareId]` | deljeno potovanje |
| `/go/[provider]` | zunanja booking predaja |
| `/za-ponudnike` · `/owner` · `/admin` | B2B portali |

Angleščina živi na `/en/…` (jedro lijaka: načrtuj, destinacije, zemljevid, potovanje,
na poti, vodici, info strani); italijanščina in nemščina na `/it/…` in `/de/…`
(domov, destinacije, zemljevid, načrtovalnik — W1); ostale poti so slovenske
(neveljavne locale poti → varni 308, nikoli 404). Polni API: `/api/journey/plan`,
`/api/journey/bookings`, `/api/itinerary`, `/api/chat`, `/api/cron/*` in ostali
endpointi v `src/app/api/`.

---

## Tehnologija

| Plast | Tehnologija |
|---|---|
| Framework | Next.js 16 (App Router, RSC + API Routes) |
| Jezik | TypeScript 5 (strict) |
| Styling | Tailwind CSS 4 + shadcn/ui + Framer Motion |
| Podatki | Prisma 6 + PostgreSQL (Neon) — 30 modelov |
| Avtentikacija | NextAuth.js v4 (JWT seje, `tokenVersion` invalidacija) |
| i18n | next-intl — SL privzeti + EN/IT/DE/FR/ES whitelist (EN: jedro lijaka; IT/DE: domov, destinacije, zemljevid, načrtovalnik — W1; FR/ES: jedro odkrivanja + svetovanja — W12) |
| AI | SAMO opcijska vizija (razumevanje slik): Gemini → z-ai-web-dev-sdk VLM rezerva; jedro 100 % deterministično — 0 žetonov (Issue #9) |
| Zemljevid | Leaflet + OSM Overpass; FSQ OS Places lokalna množica |
| Plačila | Stripe (checkout + webhooki; fail-closed brez ključev) |
| Zagon / CI | bun · GitHub Actions (lint, typecheck, build) |
| Deploy | Render (primarni) + Vercel (sekundarni) |

---

## Hitri začetek

```bash
git clone https://github.com/markec12345678/Discover-Slovenia-AI.git
cd Discover-Slovenia-AI
bun install

cp .env.example .env
# uredi .env — OBVEZNO:
#   DATABASE_URL   (PostgreSQL, npr. brezplačni Neon; SQLite URL NE deluje)
#   ADMIN_PASSWORD (naključno, min 32 znakov)
#   NEXTAUTH_SECRET (openssl rand -base64 32)
#   CRON_SECRET    (cron endpointi so brez njega fail-closed 401)

bun run db:push          # shema v bazo (prisma generate teče v postinstall)
bun run db:seed:demo     # (opcija) demo partnerji/listingi/rezervacije
bun run dev              # http://localhost:3000
```

Podatkovni množici **FSQ (125.446 krajev)** in **KiwiTaxi transfer feed** sta
že v repozitoriju (`data/fsq-places/`, `data/kiwitaxi-routes.json`) — brez
dodatnih prenosov. Osvežitev feedov: `bun run fsq:ingest` / `bun run kiwitaxi:ingest`
(runbook v [`src/lib/supply/providers/fsq/dataset.ts`](src/lib/supply/providers/fsq/dataset.ts)).

Preverjanje:

```bash
bun test                 # 4757 testov (4756 pass + 1 DB-gated fail brez baze —
                         #  CI-semantika; z veljavno postgres bazo teče tudi ta)
bun run lint             # eslint
bunx tsc --noEmit        # tipi
bun run activation:check # iskren izpis aktivacije vseh 16 providerjev (Issue #20 §11)
```

Demo računi (samo lokalni seed; fiksni gesli veljata le z
`DEV_FIXED_DEMO_PASSWORDS=1`): `tina@demo.discoverslovenia.si` /
`marko@demo.discoverslovenia.si` — geslo `demo1234`. Admin portal `/admin`
se overi z `ADMIN_PASSWORD` env (ne prek NextAuth) — od 1.100.0 prek
httpOnly HMAC session piškotka (60 min; geslo ne živi v brskalniku,
glava `x-admin-password` ostane sprejeta za skripte).

---

## Konfiguracija (env)

Kategorije — celoten seznam z navodili je v [`.env.example`](.env.example):

- **Baza** — `DATABASE_URL` (PostgreSQL/Neon; shema je `postgresql`)
- **Avtentikacija / admin** — `ADMIN_PASSWORD`, `NEXTAUTH_*`
- **Cron** — `CRON_SECRET` (obvezno v produkciji; brez njega 401)
- **AI (OPCIJSKO — samo vizija)** — `GEMINI_API_KEY` (Issue #9 ZERO-AI: jedro deluje brez AI ključev; vizija samo za razumevanje slik)
  (strežniški env, nikoli `NEXT_PUBLIC_`)
- **Provider poverilnice** — `VIATOR_API_KEY`, `GETYOURGUIDE_API_TOKEN`,
  `TIQETS_API_KEY`, `BOOKING_API_KEY`, `SKYSCANNER_API_KEY`,
  `AIRALO_CLIENT_ID`/`AIRALO_CLIENT_SECRET`, `TRAVELPAYOUTS_TOKEN` (vsaka manjkajoča =
  iskreno prazen sloj, brez napak)
- **Affiliate** — partner ID-ji (npr. `KIWITAXI_PAP_ID`, `BOOKING_AFFILIATE_ID`,
  `VIATOR_AFFILIATE_URL`)
- **Plačila** — `STRIPE_*` (brez ključev so produkcijski plačilni tokovi zaprti —
  fail-closed; demo veja samo z `DSA_DEMO_PAYMENTS=1`)
- **Lokalna množica** — `FSQ_PLACES_DIR` (privzeto `./data/fsq-places`)
- **Opcijsko** — SMTP, web push (VAPID), ranking uteži

> **Skrivnosti nikoli ne smejo priti v repozitorij.** Vsa poverilnica so
> strežniški env (glej [SECURITY.md](SECURITY.md)).

---

## Deployment

- **Render (primarna produkcija):** push na `main` → <https://i-feel-slovenia.onrender.com>
  (Stanje 29. 9. ~08:40 UTC: **v1.102.0 — KORENSKI VZROK DOKAZAN z API diagnostiko** [lastnik je prilepil RENDER_API_KEY, Task ID 20]: free plan kvota **500 build minut/mesec IZČRPANA** — ~50 uspešnih build-ov × ~4 min od 11.–25. 9.; zadnji uspeh 5eb96e5 [v1.102.0] 25. 9. 11:28 UTC, vsak deploy od 11:36 naprej [50+] zavrnjen v **~1 s = PRE-BUILD zavrnitev** [builder se niti ne zažene — ročno potrjeno: trigger=api zavrnjen v 1 s; prava build napaka bi trajala minute]; kvota se **ponastavi 1. 10. 2026** — nameščen **SAMODEJNI RENDER CATCH-UP job v prod-monitor.yml** [vsake 3 h, idempotenten: če je Render za mainom → POST /deploy; fast-reject zavrnitve ne trošijo minut; 24 h hlajenje po resni build napaki — varovanje kvote; API ključ v GitHub secret RENDER_API_KEY, sealed box]; skript end-to-end validiran proti živi API; **ŽIVO validiran 29. 9. 08:28 UTC** — prvi pravi tek catch-up joba (workflow_dispatch): zaznal drift 58cee1f → POST dep-datndcg93c1s73bagvf0 → zavrnjen v 0,8 s → klasificiran »PRE-BUILD zavrnitev ~1 s — kvota, ni napaka« → exit 0 ZELEN; pričakovani potek: 1. 10. ~00–09 UTC samodejni build → live 1.140.2 → smoke zelen → e-poštni alarmi prenehajo; alternativa za takojšnjo uveljavitev: lastnikova nadgradnja Render načrta [odstrani limit build minut])
- **Vercel (sekundarna):** push na `main` → <https://i-feel-slovenia.vercel.app>
  (zadnja preverjena uskladitev 29. 9. 08:32 UTC — dispatch tek 36542925633 [živa CI validacija]: health 1.140.2 ×3, smoke 18/18 ok, verzija ≡ repo, /pot SSR gate ZELEN; prej 06:45 UTC — Z API, žetona obnovljena: 1.140.2 ≡ dpl_69UyBXW7 [0417df5, 05:22 UTC] + dpl_89KYTdUd [b7f07be, 05:01 UTC] oba READY, health 1.140.2, /pot/embed SSR markerji ✓; 1.140.2 [LCP /pot: vzporeden Leaflet uvoz + monitor SSR rezervacije] ŽIVA od 29. 9. ~05:07 UTC — WEBHOOK je ta push sam uveljavil (brez API ukaza: .env je bil ob restartu okolja 04:38 UTC prepisan na samo DATABASE_URL, VERCEL_TOKEN izgubljen — OBNOVLJENO 29. 9. ~06:40 UTC: lastnik je prilepil sveža VERCEL_TOKEN + GITHUB_TOKEN žetona, oba verificirana proti živim API-jem [Vercel /v2/user 200, GitHub repo 200 + push dovoljenje]; obrambna kopija ključev izven repa /home/z/.env-keys-backup, chmod 600); produkcijski dokazi v lcp-1402-evidence/ (Lighthouse pred/pos obe poti, timeline-before/after, SSR dokazi); prejšnja uskladitev 28. 9. 20:31 UTC: 1.140.1 ≡ dpl_8CAWQCx7
  [iz 4545690] — CLS popravek na /pot poteh ŽIV v produkciji: obe poti
  0.3805/0.3393 → 0.0000 [Performance API 412×823 + Lighthouse mobile/simulate
  nad produkcijo z 0 runWarnings + SSR dokazi — cls-1401-evidence/];
  uvedla ga je samodejni uvajalni nadzornik v poskusu 2 ob 20:27:53 UTC, ko
  se je rolling okno kvote sprostilo ~23 h pred napovedanim resetom
  (29. 9. 20:11 UTC); nadzornik se je samodejno ustavil 20:42:53 po
  idempotenčni preverbi; iskreno: uspešen odgovor API-ja ni vseboval uid na
  vrhu, zato ga je skripta razvrstila kot „nenavaden“ — deployment potrjen z
  GET /v6/deployments; webhook za push 512ee07 je ostal tih (isti vzorec kot
  a1f4095/5608f9e); zaporedje dneva: 1.140.0 uvedena 19:14 UTC prek API
  ukaza [dpl_GQGhgLzQ] → push 512ee07 20:07:49 UTC → API zavrnjen s kvoto
  [api-deployments-free-per-day 100/100 — drugi projekti lastnika] →
  nadzornik 20:12 → uspeh 20:27:53 → živa 20:31; hladen prvi obisk ~90 s
  (znani pojav, topla instanca ~1 s); Render — AutoDeploy obnovljen 1. 10.
  2026 [Issue #10 ZAPRT: catch-up job + samodejni build pusha eb7432f v ~7 min;
  obe produkciji 1.156.2 ≡ main; 1.157.0 = faza 1 issueja #20])
- **Baza:** Neon PostgreSQL (pooler, `connection_limit=1`); migracije na produkcijo:
  `./scripts/ops/migrate-deploy.sh "<neon-url>"`
- **CI (GitHub Actions):** lint + typecheck + build proti `postgres:16-alpine`
- **Cron (8 opravil, `vercel.json`, Bearer `CRON_SECRET`):**

| Urnik (UTC) | Endpoint | Opis |
|---|---|---|
| `0 6 * * *` | `/api/cron/daily-trip-push` | dnevni push opomniki |
| `0 7 * * *` | `/api/cron/recalculate-status` | preračun statusov |
| `0 8 1 * *` | `/api/cron/commission-invoices` | mesečni obračun provizij |
| `0 8 * * 1` | `/api/cron/weekly-alerts` | tedensko B2B poročilo |
| `0 9 * * *` | `/api/cron/renewal-reminders` | opomniki obnov |
| `0 10 * * *` | `/api/cron/draft-reminders` | nudge osnutkov |
| `30 7 * * 2` | `/api/cron/sto-reingest` | osvežitev STO virov |
| `30 7 * * 3` | `/api/cron/kiwitaxi-reingest` | osvežitev KT feeda |

- **Po deployu:** `bash scripts/verify/production-smoke.sh` (varni GET preverki,
  cron fail-closed, markerji verzije)
- Podrobni postopki, runbooki in okvare: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## Poslovni model

- **B2C:** brezplačno — AI načrtovalec, klepet, iskanje, „vprašaj lokalca"; plačljive
  so le globoke konzultacije (freemium).
- **B2B (primarni):** provizija **12 % izključno na rezervacijah iz AI kanala**,
  **0 % na direktnih rezervacijah** (free); premium €149/mes in enterprise €499/mes
  (0 %). Mesečni obračun + računi (cron) + kartično plačilo (Stripe).
- **Affiliate:** provizije prek `/go` omrežja (Viator, Booking, DiscoverCars,
  Skyscanner, WorldNomads, SafetyWing, …).
- **Beta:** vsi paketi brezplačni do 30 lokalov.

---

## Dokumentacija

**Produkt**
[PRODUCT-BLUEPRINT.md](PRODUCT-BLUEPRINT.md) ·
[TECHNICAL-SPECIFICATION.md](TECHNICAL-SPECIFICATION.md) ·
[docs/COMPETITIVE-ANALYSIS.md](docs/COMPETITIVE-ANALYSIS.md) ·
[docs/COMPETITIVE-ANALYSIS-MINDTRIP.md](docs/COMPETITIVE-ANALYSIS-MINDTRIP.md) ·
[docs/OUTREACH-TOOLKIT.md](docs/OUTREACH-TOOLKIT.md) ·
[docs/PILOT-TEST-PROTOCOL.md](docs/PILOT-TEST-PROTOCOL.md) ·
[docs/PILOT-VALIDATION-GATE.md](docs/PILOT-VALIDATION-GATE.md)

**Arhitektura**
[docs/ADR.md](docs/ADR.md) ·
[docs/DATA-FLOW.md](docs/DATA-FLOW.md) ·
[docs/DATA-LAYERS-RAG.md](docs/DATA-LAYERS-RAG.md) ·
[docs/ANALYTICS-EVENTS.md](docs/ANALYTICS-EVENTS.md) ·
[docs/FEATURE-FLAGS.md](docs/FEATURE-FLAGS.md)

**Providerji in journey**
[docs/TASK-53-ALL-PROVIDERS-READY.md](docs/TASK-53-ALL-PROVIDERS-READY.md) ·
[docs/PROVIDER-APPLICATIONS.md](docs/PROVIDER-APPLICATIONS.md) ·
[docs/TASK-58-FULL-PROVIDER-JOURNEY.md](docs/TASK-58-FULL-PROVIDER-JOURNEY.md) ·
[docs/TASK-58-JOURNEY-AUDIT.md](docs/TASK-58-JOURNEY-AUDIT.md) ·
[docs/TASK-58-MY-TRIP-ACCEPTANCE.md](docs/TASK-58-MY-TRIP-ACCEPTANCE.md) ·
[docs/TRAVEL-SUPPLY-MAP-AUDIT.md](docs/TRAVEL-SUPPLY-MAP-AUDIT.md)

**Operacije**
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) ·
[docs/BACKUP-RECOVERY.md](docs/BACKUP-RECOVERY.md) ·
[docs/INCIDENT-PLAYBOOK.md](docs/INCIDENT-PLAYBOOK.md) ·
[docs/OBSERVABILITY-PLAN.md](docs/OBSERVABILITY-PLAN.md) ·
[docs/MIGRATION-STRATEGY.md](docs/MIGRATION-STRATEGY.md) ·
[docs/SEED-STRATEGY.md](docs/SEED-STRATEGY.md) ·
[docs/VERSIONING.md](docs/VERSIONING.md)

**Varnost**
[SECURITY.md](SECURITY.md) ·
[docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md) ·
[docs/ACCESSIBILITY-REVIEW.md](docs/ACCESSIBILITY-REVIEW.md)

**Validacija / auditi**
[docs/TASK-49-PRODUCT-READINESS-AUDIT.md](docs/TASK-49-PRODUCT-READINESS-AUDIT.md) ·
[docs/TASK-51-GEOGRAPHIC-COHERENCE.md](docs/TASK-51-GEOGRAPHIC-COHERENCE.md) ·
[docs/TASK-56-P2-HARDENING.md](docs/TASK-56-P2-HARDENING.md) ·
[CHANGELOG.md](CHANGELOG.md)

Varnostni mechanismi v kratkem: vsa vsebina skozi moderacijo
(draft → pending → published, re-moderacija ob spremembi), `tokenVersion`
invalidacija sej ob resetu gesla, lastniški dostopi (IDOR/BOLA), Stripe webhook
podpis + dedup, prompt-injection ovojnica (`SYSTEM_DATA_GUARD`), fail-closed cron,
rate limiting na občutljivih poteh.

---

## Razvojna zgodovina

Podrobna zgodovina implementacije (naloge, auditi, odločitve, živi dokazi) se vodi
ločeno od tega README-ja: [CHANGELOG.md](CHANGELOG.md) (vse verzije po Keep a
Changelog), [docs/](docs/) (dokumentacija nalog in auditov) ter git zgodovina.
Pravila za razvoj in prispevke: [AGENTS.md](AGENTS.md) · [CONTRIBUTING.md](CONTRIBUTING.md).
Trenutna verzija: **1.163.5**.

---

## License

MIT — see [LICENSE](LICENSE)
