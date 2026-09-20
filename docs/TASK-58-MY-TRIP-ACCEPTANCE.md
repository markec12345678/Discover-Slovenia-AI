# TASK 58 §20–§32 — MY TRIP, POTRDITVE, SPREJEMNI TESTI (1.60.0)

Nadaljevanje `docs/TASK-58-FULL-PROVIDER-JOURNEY.md` (1.59.0) po specifikaciji
naročnika §20–§32. Baseline: `d478cfe` (1.59.0).

## A. Kaj je bilo dodano/spremenjeno

| Del | Datoteka | Vsebina |
|---|---|---|
| MY TRIP (§20) | `src/lib/journey/trip-view.ts` | ČISTA gradilna plast `buildMyTrip()` — ena časovnica: dan prihoda (vpis uporabnika), transferji (trajanje IZ vira), hoteli/restavracije/bencin BREZ izumljenih ur (timeNote pove zakaj), dogodki na SVOJIH realnih datumih, najem = zunanja kartica. Statusi so REALNI (ZUNANJA REZERVACIJA / SAMO INFORMACIJA; CONFIRMED izključno iz provider odgovora) |
| UI MY TRIP | `src/components/journey-trip.tsx` | Časovnica po dneh + potrditveni dokument + gumb za tiskanje |
| Potrditveni dokument (§21) | `trip-view.ts` + `journey-trip.tsx` | Vsa zahtevana polja (Trip/Traveler/Provider/Booking ID/Date/Time/Location/Duration/Price/Currency/Status/Provider link/Cancellation). Booking ID = "Zunanja rezervacija" (NIKOLI izdelana številka); 0 potrjenih danes → iskrena globalna opomba. Tiskanje: `print:hidden` (nav/form/kategorije) + `window.print()` |
| Provider-agnostic (§24) | `orchestrator.ts` + `handoff.ts` | `TRANSFER_INVENTORY_RESOLVERS` registracija (isti vzorec kot ADAPTER_FACTORIES) + `transferInventoryProviders()` IZ registra; najem = zanka prek registra (car_rental + affiliate-only) — ODSTRANJENI vsi if-provider vzorci; oznake virov v prenosu IZ `getProvider().labels` |
| Izolacija odpovedi (§22) | `orchestrator.ts` (+ `supplyHealth`) | Odpoved ENEGA vira → `supplyHealth.degradedProviders` + opomba kategorije; ostale kategorije CELE (testirano: OSM throw + KT dataset missing) |
| Observability (§30) | `src/lib/journey/observability.ts` + `plan/route.ts` | `journey_started` + `supply_searched` (števci + degraded + issues) — neblokirajoče, brez PII/se skrivnosti. Preslikava: `booking_redirected` ≡ obstoječi `affiliate_click` (/go). Prihodnji API_BOOKING dogodki tipizirani (0 ponudnikov danes) |
| Prenos izbir | `src/lib/journey/handoff.ts` | `journeyProductsToSelection()` — FIXED, dedupe, dogodki izpuščeni, registry oznake |
| Sprejemni testi (§25–§26) | `src/lib/__tests__/task58-acceptance.test.ts` | 33 testov: E2E veriga (13 korakov §26), izolacija odpovedi (§22), booking matriks (9), integriteta (6), fixtures≠live (§23) |

## B. Sprejemni scenarij (§26 — določen, zelen)

OPEN → intent (Brnik, 20. 9., 14:00, Maribor) → DISCOVER (3 KT rute + OSM +
3 dogodki + rental kartica) → SELECT (transfer/hotel/restavracija/bencin/
dogodek) → VALIDATE PRICE (€162 od-cena IZ dataset-a; unknown ≠ 0) →
VALIDATE GEO (origin Brnik real; dest Maribor; razdalje) → VALIDATE TIME
(najzgodnejši 15:40; dogodki po prihodu) → VALIDATE IDs (član 9227 ✓;
fabrikantrt 999999999 ✗) → BOOKING CAPABILITIES (0 API_BOOKING; mešanica
EXTERNAL/INFO) → REDIRECT WHERE EXTERNAL (/go/transfers?product=9227) →
PAY WHERE SUPPORTED (samo pri ponudniku — 0 merchant-side) → STORE REAL
CONFIRMATION (izdelana potrditev ZAVRNJENA) → MY TRIP (dni, realni časi,
iskreni statusi, bookingId = zunanja).

## C. Invariante (nove, testno varovane)

1. EXTERNAL ≠ CONFIRMED (prehodi + zapisi) — potrditveni dokument pokaže
   "Zunanja rezervacija", NIKOLI "Potrjena rezervacija" (§21).
2. Čas v časovnici SAMO iz realnih virov (vpis/trajanje/datum/odpiralni čas);
   manjkajoč čas = timeNote (razlog), NE izumljena ura (§20).
3. Odpoved vira ne uniči potovanja (§22) — supplyHealth + ostale kategorije.
4. Produkcija NE vbrizgava fixture adapterjev (opts.adapters = SAMO testi;
   §23) — KT/EVENTS realni, OSM fixture jasno označen v testih.
5. Observability brez PII/se skrivnosti; neblokirajoča (DB odpoved ne pokvari
   odgovora — dokazano v peskovniku).

## D. Regresija

`bun test` **1292/1292** (+33), lint 0, tsc 0 (src). Browser E2E: MY TRIP SL+EN
(časovnica 14:00 ✈️ / 14:00–15:40 🚕 od €162 / Zunanja rezervacija), dokument s
polji §21 (ID 412, št. rezervacije = Zunanja rezervacija, preklic pri
ponudniku), tiskanje brez napak, prenos v načrtovalnik (fiksno, vir: KiwiTaxi
iz registra), 375/390 px 0 preliva, 0 napak konzole, 0 surovih i18n ključev.

## E. Iskrene meje (nespremenjene)

0 poverilnic → 0 API_BOOKING tokov (potrditveni dokument obstaja, a je
prazno-pošten); Overpass v peskovniku trenutno nedosegljiv (kategorijske
opombe, pipeline dokazan s fixture testi); db:push okoljska omejitev
(SQLite↔postgres).
