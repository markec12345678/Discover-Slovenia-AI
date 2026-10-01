# Dokazi — Issue #21 (1.161.0): lokalni E2E potek Go Mode

**Datum:** 2026-10-01 · **Način:** agent-browser (headless Chromium) na
lokalnem dev strežniku (`next dev -p 3100`, HEAD 1.161.0).

> **Iskrena metoda:** sandbox ZAVRNE dovoljenje za geolokacijo (brskalnik
> brez uporabniškega posredovanja) — pravi `navigator.geolocation` tok NI
> možen v peskovniku. GPS je bil simuliran z JS override-om vtiča
> (`watchPosition` → fiksacija 46.3612, 14.1090, natančnost ±12 m,
> osvežitev 2 s) — ena od gnezdenih poti do prave naprave v produkciji
> (G2). VSA ostala logika (hook → buildGoView → travel-state → UI) je
> tekla čez PRODUCTION kodo, brez mockov plasti.

## Seznam dokazov

| # | Datoteka | Prikazano |
|---|-----------|-----------|
| 1 | `01-prazno-stanje.png` | `/na-poti` brez shranjene poti — iskreno prazno stanje („Ni aktivnega potovanja") |
| 2 | `02-naslednji-postanek-geo-znacke.png` | Naslednji postanek **Blejski grad** z znacko **„Preverjena lokacija"** (provider own — §4 exact); zemljevid dneva izpusti postanek brez geo („2 postankov" od 3 — fail-closed) |
| 3 | `03-gps-prihod-bled.png` | GPS vklopljen: **„✓ Prišel si na lokacijo Blejski grad"** + iskrena ločitev („GPS prihod NE potrdi rezervacije") + **„natančnost ±12 m · natančnost dobra"** (novi razred natančnosti §6) |
| 4 | `04-progresija-vintgar.png` | Po opravitvi samodejna progresija na **Soteska Vintgar** z znacko **„Približna lokacija (vir: fsq)"** (§4 approximate — vir poimenovan) + traku „Nato" |
| 5 | `05-brez-lokacije.png` | Postanek brez geo (**Kavarna Zima**): gumb NAVIGIRAJ IZRECNO ne obstaja + opomba **„Lokacija ni znana — navigacija ni na voljo"** (§18-7 — ne tiha luknja) |
| 6 | `06-mobilni-pogled.png` | Odzivnost 390×844 (telefon) — ZDAJ hierarhija ostane berljiva |

## Kaj je dokazano (preslikava na §25 acceptance criteria)

- **B. ZAČETEK POTI:** Vklopi GPS → fiksacija + natančnost vidna (3).
- **C. MED POTJO:** razdalja/smer, navigacijska akcija, naslednji cilj (2–4).
- **D. PRIHOD:** near → arrived po pravilih (geofence + stabilnost 8 s),
  travel state ARRIVED, booking ločen („NE potrdi rezervacije") (3).
- **E. NASLEDNJA TOČKA:** samodejna progresija po opravitvi (4).
- **§4 GEO POGODBA:** vse tri resnice — exact (2), approximate (4),
  missing (5) — prikazane iskreno, navigacija fail-closed.
- **§6:** razred natančnosti prikazan ob ±X m (3).

## Kaj dokaz NI (iskrene meje)

- Pravi GPS na mobilni napravi (dovoljenja, iOS quirks) → produkcija G2.
- Wake Lock dejansko pridržan (headless Chromium brez zaslona — logika je
  pokrita z unit/source-contract testi `issue21-wake-lock.test.ts`).
- Native Live Activities / Dynamic Island — platformna meja spletne
  aplikacije (dokumentirano v LIVE-TRIP-NAVIGATOR.md, ZUNANJE MEJE).
