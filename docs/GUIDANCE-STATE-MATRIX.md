# GUIDANCE STATE MATRIX — stanja → akcije (Issue #23, 1.163.0)

> Tabela po vzoru issue §39: | Current State | User Intent | Guidance |
> Primary Action | Source of Truth | Fallback |. Stanje določa IZKLJUČNO
> `selectGuidance()` (deterministično); akcije se izrišejo samo, kadar so
> dejansko mogoče (§9 „Ne prikazuj akcije, ki ni dejansko mogoča").

| Current State | Kdaj nastopi (dejstva) | Guidance (ključ) | Primary Action | Secondary | Source of Truth | Fallback / iskrenost |
|---|---|---|---|---|---|---|
| NEW_USER | prva seja (brez `dsa_first_run_seen`), 0 zbranih, 0 shranjenih, brez go | `newUser` — dobrodošlica + kaj lahko naredi | ODKRIJ → /destinacije | NAČRTUJ, (pomoč prek first-run kartice) | `dsa_first_run_seen`, `getMyTripItems()`, `getSavedTrips()`, `loadGoTrip()` | first-run kartica pokrije to stanje na domov (trak skrit) |
| DISCOVERING | vračajoči (flag viden), prazna zbirka | `discovering` — „kaj te danes zanima?" | ODKRIJ | NAČRTUJ | isto | ne vrača first-run kartice (§19) |
| TRIP_BUILDING | zbirka ≥ 1, načrt ni shranjen, brez go | `building` (+ {count}) | NAČRTUJ → /nacrtuj | ODKRIJ | `dai:my-trip-items` | add-toast ponudi enak naslednji korak na vseh površinah |
| BOOKING_PENDING | načrt shranjen + živi kontekst vidi odprte rezervacije | `bookingPending` | REZERVIRAJ → /nacrtuj | ZAČNI POT | `dai:my-trips` + živi kontekst | BREZ podatka o rezervacijah stanje NE nastopi → TRIP_READY (§31) |
| TRIP_READY | načrt shranjen (≥ 1), pot ni zagnana | `ready` | ZAČNI POT → /moja-potovanja | REZERVIRAJ | `dai:my-trips` | kartice imajo Nadaljuj na poti; planner toast ponudi Zaženi |
| TRIP_STARTED | `dai:go-trip` aktiven; obstaja naslednji postanek (danes ali kasneje) | `started` (+ {next}) / `startedNextDay` (+ {count}) | NADALJUJ NA POTI → /na-poti | MOJA POTOVANJA | `loadGoTrip()` + `buildGoView()` | brez imena cilja → iskreno startedNextDay sporočilo |
| NAVIGATING | živi: approaching/near_destination | `navigating` | NAVIGIRAJ → /na-poti#naslednje | NA POTI | ArrivalContext (#21, samo seja) | trak izven /na-poti tega NE izreče |
| ARRIVED | živi: arrived (GPS + hysteresis) | `arrived` | OPRAVI → /na-poti#naslednje | NA POTI | ArrivalContext (#21) | NEDISMISSIBLE (§40.20); GPS prihod ≠ rezervacija |
| FREE_TIME | živi: okno ≥ 15 min (#22) | `freeTime` (+ {minutes}) | PROST ČAS → /na-poti | NA POTI | free-time.ts (#22) | < 15 min NI stanje (iskrena meja) |
| NEEDS_ATTENTION | živi: health NEEDS_ATTENTION ali konflikti | `needsAttention` | REŠITVE → /na-poti | NA POTI | buildGuardian (#22) | NEDISMISSIBLE; Guardian kartica ostane v /na-poti |
| BLOCKED | živi: health BLOCKED | `blocked` | REŠITVE → /na-poti | NA POTI | buildGuardian (#22) | NEDISMISSIBLE |
| RECOVERY | živi: recovery foldout odprt | `recovery` | REŠITVE → /na-poti | — | recovery.ts (#22) | NEDISMISSIBLE |
| COMPLETED | go aktiven + remaining 0 + vsi kasnejši dnevi 0 + 1+ obdelanih | `completed` (+ {done}/{skipped}) | NAČRTUJ NOVO → /nacrtuj | ODPRI SHRANJENO POT (v2) / MOJA POTOVANJA | `buildGoView()` + done/skipped celega potovanja | dan z nadaljnjimi dnevi OSTANE pri noEntryLeft (zero feature loss) |
| UNKNOWN | izrecna slaba kvaliteta podatkov | `unknown` | — (brez) | ODKRIJ | dataQuality: unknown | brez izmišljanja (§30); shranjena pot ostane dostopna |

## Prioritetni red (determinističen — §32)

`BLOCKED > NEEDS_ATTENTION > ARRIVED > NAVIGATING > RECOVERY > FREE_TIME >
COMPLETED > TRIP_STARTED > TRIP_READY > BOOKING_PENDING > TRIP_BUILDING >
DISCOVERING > NEW_USER > UNKNOWN` (številke v guide-engine.ts; test ⑱
preverja strogo padajoč zaporedje).

## Veriga (5 korakov) — preslikava stanj

| Korak | Stanja |
|---|---|
| 1 ODKRIJ | NEW_USER, DISCOVERING |
| 2 NAČRTUJ | TRIP_BUILDING |
| 3 REZERVIRAJ | TRIP_READY, BOOKING_PENDING |
| 4 NA POTI | TRIP_STARTED, NAVIGATING, ARRIVED, FREE_TIME, NEEDS_ATTENTION, BLOCKED, RECOVERY |
| 5 ZAKLJUČI | COMPLETED |

## Akcije → poti (vse relativne, locale-aware prek i18n Link)

`discover → /destinacije` · `plan → /nacrtuj` · `open_trips → /moja-potovanja`
· `book → /nacrtuj` · `start_trip → /moja-potovanja` · `go_mode → /na-poti`
· `navigate|complete_stop → /na-poti#naslednje` · `free_time|recovery → /na-poti`
· `new_trip → /nacrtuj` · `ask_discover → chat:ask` (pred-izpolnjeno vprašanje,
NIKOLI samodejno poslano — W9 kanon)
