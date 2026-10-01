# Dokazi — Issue #21 (1.161.0): lokalni E2E potek Go Mode

**Datum:** 2026-10-01 · **Način:** agent-browser (headless Chromium) na
lokalnem dev strežniku (`next dev -p 3100`, HEAD 1.161.0).

---

# PRODUKCIJSKI DOKAZI (Render, 1.161.0) — 2026-10-01 ~18:00 UTC

**URL:** `https://i-feel-slovenia.onrender.com` (samodejni deploy iz pusha
`6d7b9e0` = 1.161.0) · **Način:** agent-browser (headless Chromium) na
ŽIVI produkciji, mobilni viewport 390×844 + desktop 1280×800.

> **Iskrena metoda (ista kot lokalno):** headless brskalnik nima GPS
> senzorja — `navigator.geolocation` je bil simuliran z JS override-om
> vtiča (fiksacija na koordinatah postanka, natančnost ±12 m, osvežitev
> 2 s, sveži časovni žigi). VSA ostala logika (hook → buildGoView →
> travel-state → UI) je tekla čez PRODUKCIJSKO kodo in PRODUKCIJSKE
> podatke (pravi FSQ produkti, pravi /api/journey/plan klic) — brez mockov
> plasti. Pravi GPS na mobilni napravi ostaja G2 (zunanja meja).

## Zlata pot, dokazana v produkciji

`/lokali` (dodaj lastna lokala) → `/potovanje` (načrt Brnik → Postojnska
jama, datum 2026-10-01; /api/journey/plan 200; 12 nastanitev, 12
znamenitosti, 12 restavracij, 8 bencinskih, 1 dogodek — realni FSQ viri;
transfer 0 z ISKRENO opombo »Ni rute v objavljenem inventarju«) → izbira
2 znamenitosti (Vivarium, Muzej Krasa) → **Zaženi Na poti (Go Mode)** →
`/na-poti` živi sopotnik → GPS vklop → **prihod** → opravi → **samodejna
progresija** → drugi prihod + wake lock.

## Seznam produkcijskih dokazov

| # | Datoteka | Prikazano |
|---|-----------|-----------|
| 0 | `prod-00-health-render.json` | `/api/health`: status ok, **version 1.161.0**, 22/22 zagonskih preverb uspešnih |
| 1 | `prod-01-home-390.png` | Produkcija živa (domov, mobilni 390×844) |
| 2 | `prod-02-zemljevid.png` | Zemljevid s search rezultati (Lokal Postojnska jama — partner) |
| 3 | `prod-03-prazno-stanje.png` | `/na-poti` brez poti — iskreno prazno stanje (§18) |
| 4 | `prod-04-nacrt-izbire.png` | Journey planner: 2 izbrani postanki, gumb Zaženi Na poti aktiviran |
| 5 | `prod-05-gomode-zdaj.png` | Go Mode ŽIV: ZDAJ postanek (Prihod: Ljubljana Airport Brnik), shema dneva (3 postanki), DANES NAČRTOVANO 2, gumb Vklopi GPS |
| 6 | `prod-06-gps-prihod.png` | **✓ Prišel si na lokacijo Prihod: Ljubljana Airport (Brnik)** + iskrena ločitev »GPS prihod NE potrdi rezervacije« + »natančnost ±12 m · natančnost dobra« (§6) + poštena opomba o premici ×1,3/55 km/h |
| 7 | `prod-07-progresija-vivarium.png` | Po opravitvi SAMODEJNA progresija na **Vivarium** z znacko »Približna lokacija (vir: fsq)« (§4 approximate, poimenovan vir) + trak »NATO: 🏛️ Muzej Krasa« |
| 8 | `prod-08-desktop-1280.png` | Desktop 1280×800 — stanje POTUJENJA preživi reload (dai:go-trip persistanca), hero ostane Vivarium |
| 9 | `prod-09-prihod-vivarium-wakelock.png` | Drugi prihod: **✓ Prišel si na lokacijo Vivarium** + »natančnost ±12 m · natančnost dobra« + **»zaslon ostaja prižgan«** (wake lock D1 aktiven ob GPS) |

**Konzola: 0 napak, 0 page errorjev** skozi celoten potek (agent-browser
errors/console prazna).

## Opomba o Vercel (iskreno)

Push `6d7b9e0` je sprožil samodejni deploy na Render (git integracija).
Vercel ista izdaja NI bila deployana takoj: GitHub App integracija za
`i-feel-slovenia` NI nameščena (0 instalacij — vsi dosedanji Vercel
deployji so bili ustvarjeni prek API-ja), dnevna kvota Hobby načrta
(100 API-deployev/dan) pa je bila izčrpana (reset 2026-10-02 ~17:40 UTC).
Vercel je ob preverbi še vedno strežnil 1.158.1 (health OK). Priporočilo:
namestitev Vercel GitHub App (git deployi ne štejejo v API kvoto).

## Kaj produkcijski dokaz NI (iskrene meje)

- Pravi GPS senzor mobilne naprave (dovoljenja, iOS quirks) — G2.
- Lastni (own) postanek v Go Mode: listing »Postojnska jama — partner«
  ima kategorijo `other` → preslikava v tip `poi` (sloj zemljevida),
  ne v journey kategorije — zato produkcjski potek dokazuje approximate
  (fsq) resnico; exact (own) resnica je dokazana lokalno (02/04/03 zgoraj).
  To je ZAMERNA preslikava podatkovne plasti, ne napaka #21.

---

# Lokalni E2E dokazi (izvirni, 2026-10-01 dopoldne)

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
