# ISSUE #4 §2 — TRIP DOMAIN MAP: kje danes živijo podatki o enem potovanju

> **Datum:** 2026-09-24 · **Revizija:** v1.92.0 (`a72011e`) · **Metoda:**
> read-only audit (3 vzporedne raziskave: domena poti, Go Mode §8, deljenje §13).
> **Spremembe ob pisanju tega dokumenta:** 0 — to je obvezni predpogoj
> Issue #4 §2 (»Najprej pokaži, kaj že obstaja«), pred enotenjem.

---

## A. SKLEP VEDNOU (executive)

**8 strežniških modelov se ŽE združuje prek `SavedItinerary.shareId`**;
stran `/pot/[shareId]` je de facto bralni agregator (RSC bere: načrt +
vodnik + glasovi + komentarji + všečki + ankete + dnevnik + dogodki +
push kartico). Normalizacija v Issue-jev seznam modelov (TripDay/
TripItem/Reservation/…) **ne obstaja in je NE uvajamo** — snapshot JSON +
čiste izračunane plasti (cost-truth, geo-validation, itinerary-quality)
so dokazano zdrav nad istim JSON (VAL 1).

**Prazni polji sta samo dve:** Documents (§15 — namerno prihodnji val) in
Collaborators/permissions (§13 — ta val). **Največja strukturna vrzel:**
`dai:go-trip` v2 zapis NE nosi shareId → Go Mode je otok, ki se ne more
pridružiti strežniški poti (popravek tega vala).

---

## B. STREŽNIŠKA PLAST (prisma/schema.prisma)

| Model | Vrhnje polje | Identiteta poti | Vloga |
|---|---|---|---|
| `SavedItinerary` (93–112) | `itinerary` JSON (`Itinerary`: days/locations/weatherEstimated/legs/geoValidation/budgetValidation), `formData` (zasebni), `name`, `views`, `editTokenHash` | **shareId** (javni) + `userId?` (lastništvo) | jedro — vsak »Shrani« = NOVA vrstica (ni verzij) |
| `JourneyBooking` (595–626) | status (13 stopenj), `providerProductId`, `confirmedPrice`, `confirmationUrl` | `(provider, productId)` + `shareId?`/`sessionKey?` | §3 lifecycle (VAL 1: EXTERNAL živ) |
| `TripGuide` (120–136) | avtor, intro, verdict, tips | `shareId` unique | avtorski vodnik (editToken/userId lastništvo) |
| `TripVote` (142–151) | `locationKey`, `voterId` | `(shareId, locationKey, voterId)` unique | skupinsko odločanje |
| `TripComment` (156–165) | `authorName`, `text` | `shareId` | razprava |
| `TripLike` (170–178) | `clientId` | `(shareId, clientId)` unique | podpora |
| `TripPoll` + `TripPollVote` (185–214) | question/options | `shareId` / `(pollId, voterId)` | ankete |
| `TripDiaryEntry` (223–237) | dayIndex, rating, `authorClientId` | `shareId` | edini post-trip koncept |
| `PushSubscription` (816–842) | kind="trip", `tripStart/End` | `shareId?` | retention kanal |
| `Booking` + `Order` (lastna tržnica) | bookingNumber/email | BREZ shareId | namerno ločeno (B2B) |

**Stolpci, ki jih SavedItinerary NIMA (in jih ta val doda):**
`updatedAt`/`contentVersion` (sočasno urejanje §13) in `isPublic`
(revokacija javne povezave §13) — vse additive-only.

---

## C. KLIENTSKA PLAST (vse keys)

| Ključ | Oblika | Pomen za §2 |
|---|---|---|
| `dai:go-trip` (go-persist.ts:20) | v1 `{journey, selectedIds}` / **v2 `{view: MyTripView}`** | **BREZ shareId (vrzel!)** — Go Mode otok |
| `dai:go-progress` (go-persist.ts:21) | `entryKey→ISO` | opravljeni postanki (naprava) |
| `dai:my-trips` (my-trips-storage.ts:17) | `[{shareId, name, savedAt}]` FIFO 50 | gostovo zgodovina + claim ob prijavi |
| `discoverslovenia_last_itinerary` | `{itinerary, formData}` 250 KB | ne-shranjen osnutek |
| `dsa_edit_token_{shareId}` | tajni žeton (hash v DB) | avtorstvo vodnika/lastništvo |
| `discoverslovenia_voter` / `_comment_name` | anonimni clientId/ime | skupnostna identiteta (ne-prenosljiva) |
| `dai:supply-selection` (session) | izbor FIXED/PREFERRED | vpliva na generacijo (VAL 1 E2E) |
| `dsa_packing_check`, `dsa_budget_goal` | odkljuki pakiranja / cilj | potno stanje na napravi |
| `dsa_planner_sid` | anonimna seja | sessionKey JourneyBooking |
| SW `dai-plans-v1` | 40× /pot/* + JSON | offline snapshot |

---

## D. KONCEPT → KJE ŽIVI DANES → VRZEL (Issue §2 checklist)

| Koncept | Kje danes | Vrzela |
|---|---|---|
| plan/itinerary | `SavedItinerary.itinerary` JSON | denormaliziran snapshot — ZDRAV |
| destinations/places | `LocationVisit.destination_id` + T1 dataset | PlaceReference model NE uvajamo |
| reservations | `JourneyBooking` + `booking_*` polja v JSON (VAL 1) | vez mehka, a delujoča |
| booking handoffs | EXTERNAL vrstice + `/go/[provider]` | §3 živ (VAL 1) |
| confirmed data | `providerBookingId` (samo PATCH kanal) | čaka poverilnice (iskreno) |
| costs | izračunano: dayCostSummary (VAL 1) | Expense model NE uvajamo (ocena ≠ strošek) |
| budget | `total_budget` + budgetValidation + `dsa_budget_goal` | cilj per-napraka (zasebnost) |
| documents | **NIČ** (izvozi: mail/PDF/.ics/TTS) | §15 prihodnji val |
| weather | `DayPlan.weather` + `weatherEstimated` + /api/weather | zamrznjena ocena ob save (iskreno) |
| route | `routeGeometry` + `legs` + `geoValidation` | **legs se IZPUŠČA v Go Mode (§8 ta val)** |
| packing | `packingList` JSON + `dsa_packing_check` | per-napraka odkljuki |
| notes | `LocationVisit.notes` + komentarji | zadostuje |
| collaborators | **BREZ modela** | **§13 ta val (TripCollaborator)** |
| votes/comments/likes/polls/diary | 5 modelov na shareId | živi |
| offline snapshot | SW cache + offline.html | best-effort (dokazano) |
| Go Mode | `dai:go-trip` 100 % klient | **shareId vrzel (ta val)** |
| post-trip history | zaporedje vrstic (vsak save = nova) | verzioniranje = contentVersion (ta val) |

---

## E. ODLOČITEV (kaj ta val naredi, kaj NE)

**NAREDI (VAL 2, v1.93.0):**
1. **`GET /api/trip/[shareId]`** — enoten bralni agregator: načrt
   (povzetek dni/postankov/datumov), vodnik, skupnostne številke,
   rezervacije (EXTERNAL/SELECTED), verzija (`contentVersion`,
   `updatedAt`), vloga klicalca, sodelujoči (za lastnika) — **0 novih
   težkih modelov, 0 podvajanja content-route** (ta ostane edini vir
   full itinererja).
2. **`dai:go-trip` v2 nosi `shareId`** → Go Mode premosti na strežniško
   pot (povezava »Odpri shranjeno pot«).
3. **§8 legs v Go Mode** — vozni časi (OSRM/ocena) potujejo z načrtom.
4. **§13 `TripCollaborator`** (EDITOR/COMMENTER/VIEWER; PENDING/ACTIVE/
   REVOKED) + `updatedAt`/`contentVersion` (CAS sočasnost) + `isPublic`
   (revokacija povezave) — additive-only, javne povezave ostanejo
   javne (nazaj kompatibilno).
5. **Prvi mutabilni endpoint** `PATCH /api/itinerary/shared/[shareId]`
   (rename + zamenjava načrta) z vlogo ≥ EDITOR + compare-and-swap.

**NE naredi (zavestno):** normalizacija v TripDay/TripItem (velika
migracija, ni dokazane vrednosti), Documents (§15), Expense model
(ocena NI strošek — §14 bo ločil), multi-device Go progres
(zasebnost-per-napraka je zavedna odločitev).

**Dokazovalni standard:** testi + E2E + 0 izgube funkcij (ista disciplina
kot VAL 1).
