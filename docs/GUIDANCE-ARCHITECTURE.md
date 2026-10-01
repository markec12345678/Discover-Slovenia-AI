# GUIDANCE ARCHITECTURE — vodena plast platforme (Issue #23, 1.163.0)

> **Discover mora biti vodič po lastni platformi.** En kanonični odgovor na
> vprašanje *"Kaj mora Discover uporabniku pokazati zdaj?"* — determinističen,
> brez AI kot vira resnice, brez podvajanja obstoječih sistemov.

## 1. Jedro: `src/lib/guidance/`

| Datoteka | Vloga |
|---|---|
| `types.ts` | `GuidanceState` (14 stanj + UNKNOWN), `GuidanceInput/Output`, `GuidanceAction`, `GuidanceGoFacts`, `GuidanceLiveContext` |
| `guide-engine.ts` | `selectGuidance(input) → Guidance` — ČISTA funkcija: isti vhodi → isti izhod; ura je parameter; 0 I/O |
| `guidance-snapshot.ts` | `readGuidanceInput(surface, opts)` — klientni bralec, ki sestavi vhod IZKLJUČNO iz kanoničnih virov; + trajno stanje (`dai:guided-tour`, `dsa_first_run_seen`) |

**Vzorec:** `trip-health.ts` iz #22 (dejstva → stanje, brez mnenj). Revizija
Faze A (3 agenti, HEAD 1.162.4) je potrdila, da je "kaj je naslednji korak"
inteligenca do zdaj živela SAMO v Go Mode (NASLEDNJE/Guardian/day-start) in v
planner internih — #23 jo posploši na celo platformo.

## 2. Vhodni viri (0 novih virov resnice)

| Kanonični vir | Bralec | Kaj da |
|---|---|---|
| `dai:my-trip-items` | `getMyTripItems()` | števec zbirke (TRIP_BUILDING) |
| `dai:my-trips` | `getSavedTrips()` | števci shranjenih načrtov (TRIP_READY) |
| `dai:go-trip` (v1/v2) | `loadGoTrip()` + `buildMyTrip()` | aktivna pot (TRIP_STARTED/…) |
| `dai:go-progress` / `dai:go-skipped` | `loadGoProgress()` / `loadGoSkipped()` | done/skipped → COMPLETED |
| `buildGoView()` projekcija | `go-view.ts` | next/remaining/laterDays/nextStopTitle |
| živi kontekst (#21/#22) | poda /na-poti klicatelj | arrival/health/conflicts/freeTime/recovery |
| `dsa_first_run_seen` | NOVO (guidance-snapshot) | prvi obisk (first-run kartica) |

**Zasebnost (§16/§30):** trak NE bere GPS pozicije — nikoli. Izpis nosi samo
števce + javno ime naslednjega postanka. Živi kontekst obstaja samo v seji
/na-poti (isti nepersistirani vzorec kot ArrivalContext iz #21). Analitika
nosi SAMO ključe (`state`/`surface`/`action`) — brez PII, brez koordinat.

## 3. Stanja in prioriteta (§32, usklajeno s #21/#22)

```
BLOCKED(100) > NEEDS_ATTENTION(90) > ARRIVED(80) > NAVIGATING(70) >
RECOVERY(60) > FREE_TIME(50) > COMPLETED(45) > TRIP_STARTED(40) >
TRIP_READY(30) > BOOKING_PENDING(25) > TRIP_BUILDING(20) >
DISCOVERING(10) > NEW_USER(5) > UNKNOWN(0)
```

- Sredi-pot stanja zahtevajo **živi kontekst** — trak izven /na-poti ga NIMA
  in si ga ne izmišljuje → iskreno TRIP_STARTED (§30).
- `BOOKING_PENDING` ZAHTEVA dejanski podatek o odprtih rezervacijah — brez
  njega stanje NE nastopi (lažni statusi so prepovedani, §31).
- `UNKNOWN` — izrecna negotovost (`dataQuality: "unknown"`), brez akcij.
- Kritična stanja (BLOCKED/NEEDS_ATTENTION/ARRIVED/RECOVERY) NISO
  dismissible (§40.20); zavrnitev traku ne skrije Guardian kartic v Go Mode.

## 4. Veriga: ODKRIJ → NAČRTUJ → REZERVIRAJ → NA POTI → ZAKLJUČI

5-stopenjski napredek (točke) na traku (domov) in hub indikatorju. Korak je
IZPELJAN iz stanja (`chainOf()`), nikoli posebej shranjen.

## 5. Površine in montaža (§33: en trenutek → ena razlaga → ena akcija)

| Površina | Komponenta | Vloga | Sidro |
|---|---|---|---|
| Domov (prvi obisk) | `guidance/first-run-card.tsx` | dobrodošlica + 5 nameri + „Ne vem — pokaži mi" | pod hero (namesto welcome banerja — NIKOLI oba) |
| Domov (sicer) | `guidance/guidance-strip.tsx` | stanje-veden trak | pod HomeEntryRow |
| Hub /moja-potovanja | `guidance/chain-progress.tsx` | SAMO informacijski napredek (obstoječi CTA-ji ostanejo primarni) | glava razdelka #moja-pot |
| /nacrtuj | toast nadgradnja (brez traku — planner ima svoje CTA) | po SHRANI: Zaženi Na poti akcija + opis naslednjih korakov | handleSaveShare |
| Go Mode /na-poti | `go-mode/trip-complete.tsx` | terminalno stanje COMPLETED | namestena v veji `view.next == null` |
| Dodajanje (vse površine) | add-to-trip toast | + „Načrtuj potovanje" akcija | handleClick |
| Welcome baner | trip-profile.tsx | stanje-vedno nadaljevanje (aktivna pot / zbirka / povzetek) | drugi obisk+ |

**Trajanje stanj zavrnjenih:** trak = `sessionStorage
dai:guidance-strip:{surface}:{state}` (naslednja seja se ponudi znova —
progresivno); first-run = `dsa_first_run_seen` (trajno); tour =
`dai:guided-tour` (izklopi se samodejno ob TRIP_STARTED — `first_run_completed`).

## 6. »Ne vem — pokaži mi« (§18)

NI tutorial. Klik name → `dai:guided-tour=1` + preusmeritev na /destinacije.
Od tega trenutka trak (domov/hub) vodi skozi verigo z poudarjeno oznako
VODENA POT; vsak korak je ena razlaga + ena primarna akcija; ob dosegu
zagona poti se tour samodejno zaključi (dogodek `first_run_completed`).
Zlata pot: NE VEM → DISCOVER → ADD (toast pove naslednji korak) → MY TRIP
(chain indikator) → PLAN (toast po shranitvi) → START (trak/baner) → GO.

## 7. CURRENT → NEW matrix (zero feature loss dokaz)

| Obstalo (prej) | Zdaj | Status |
|---|---|---|
| WelcomeBackBanner povzetek (knowsLabel/quizCta) | ohranjen kot fallback, pred njim stanje-vedne veje | OHRANJENO + razširjeno |
| `#kviz` povezava v bannerju | popravek na `/nacrtuj#kviz` (prej mrtvo sidro) | POPRAVLJENO |
| TripProfileOnboarding modal (286 vrstic) | ODSTRANJEN — bil mrtva koda (nikoli montiran, SL-only, 0 testov) | NIČ izgubljene funkcije |
| My Trip hub CTA (Odkrij/Nadaljuj/Kam zdaj) | nedotaknjeni + chain indikator nad njimi | OHRANJENO + dodano |
| Planner akcijska vrstica (Shrani/Zaženi) | nedotaknjena; toast dobi akcijo + opis | OHRANJENO + razširjeno |
| add-to-trip toast „Odpri pot" | ostaja PRVI; „Načrtuj" dodan za njim | OHRANJENO + dodano |
| Go Mode `GO_LABELS.noEntryLeft` | ohranjeno za dan z nadaljnjimi dnevi; COMPLETED kartica za pravi konec | OHRANJENO + razširjeno |
| BetaBanner (dno strani) | ohranjena; zavrnitev postane trajna | OHRANJENO + izboljšano |
| visitCount (dvojna semantika — hrošč) | dodajanje destinacije/onboarding ne štejeta več obiskov | POPRAVLJENO |

## 8. i18n (iskrena meja)

- ns `guidance` — **6 jezikov** (SL/EN/IT/DE/FR/ES), ~47 ključev; pariteto
  izsiljuje `task71-i18n-parity.test.ts` (froze na vseh 6).
- welcomeBack razširitev (7 ključev) — 6 jezikov + fragmenti sl/en usklajeni.
- Go Mode COMPLETED — L-canon `{sl, en}` (obstoječa dokumentirana meja:
  /na-poti je izven IT/DE/FR/ES whitelist — revizija infra).

## 9. Analitika (§35)

8 dogodkov (`guidance_shown/action_clicked/dismissed/completed`,
`first_run_started/completed`, `intent_selected`, `next_step_completed`) —
3-datotečna zaklenjenost (klient union → strežniška whitelist →
docs/ANALYTICS-EVENTS.md), pariteto izsiljuje `w3-collections.test.ts`.
Props: samo `state`/`surface`/`action`/`intent` ključi — 0 PII.

## 10. Testi

- `issue23-guidance-core.test.ts` (21): stanja, tranzicije, prioritete,
  akcije, determinizem (100×), zasebnost (prepovedani ključi), UNKNOWN.
- `issue23-guidance-ux.test.ts` (25): source-contract vseh integracij,
  a11y pogodbe, zero-feature-loss zasidranja, popravki, analitika, i18n.
- Regresija: 4.710 pass (+21 nad 4.689), 0 odpovedi produktov.

## 11. Odnos do #20/#21/#22

- #21 (Live Trip Navigator): GoView projekcija je vhod; arrival ostaja
  lastnik GPS-a; COMPLETED stanje je naravna posledica remaining/laterDays.
- #22 (Travel Guardian): health/conflicts/freeTime/recovery so ŽIVI vhodi
  (samo znotraj /na-poti); trak jih izven ne izmišljuje.
- #20 (Production Activation): booking resnica ostaja v
  ConfirmationStatus — BOOKING_PENDING zahteva dejanski podatek (§31);
  trak nikoli ne izreče „rezervirano".
