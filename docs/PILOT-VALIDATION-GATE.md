# PILOT VALIDATION GATE — zamrznitev verzije (Faza 1)

> Datum zamrznitve: **2026-09-14 08:50 UTC**
> Veja: `pilot-validation` (iz `main`)
> Svrha: preveriti, ali trenutna verzija res deluje kot izdelek za pravega turista,
> PRED novim razvojem. Protokol po uporabnikovem Pilot Validation Gate.

---

## Zaklenjena verzija

| Element | Vrednost |
|---|---|
| Commit SHA (veja `pilot-validation`) | `1a8542c` |
| Razvojna koda v produkciji | `78a50b3` (fix P4-8 EN-fallback; `1a8542c` je čisto dokumentacija) |
| Datum zamrznitve | 2026-09-14 08:50 UTC |
| Render deployment | https://i-feel-slovenia.onrender.com (autoDeploy iz `main`) |
| Vercel deployment | NE AKTIVEN — projekt preseljen na Render; `i-feel-slovenia.vercel.app` opuščen |
| Baza | Neon PostgreSQL (produkcijska); Listing shema vsebuje praktična polja (`seasons`, `weatherSuitability`, `parking`) |
| Sitemap | 733 URL (308 SL + 308 EN destinacijskih + hub strani 44 + vodici + jedro) |

## Rezultati zadnjih testov (val P0-VERIFIKACIJA, 2026-09-14)

| Test | Rezultat |
|---|---|
| P0-A veriga (jedro + SEO datoteke + affiliate) | VSE 200/302 pravilno |
| P0-B sitemap vzporedno (12 konk.) | 383–704× 502 — padec kapacitete Render free (0,1 CPU/512 MB) |
| P0-B sitemap zaporedno (3 konk.) | 733/733 × 200, p50 0,89 s |
| P0-C realni scenariji (5) | Ujet hrošč EN-mešanje jezikov → fix `78a50b3` ŽIV v produkciji |
| P1-A hub link integrity | 351/351 internih linkov = 200 |
| P1-B tipkovnica/dark mode | Tipkovnica OK; light-only je design odločitev |

## Znana odprta stanja OB ZAMRZNITVI (niso kode)

1. **AI v produkciji = fallback način** — `PUTER_AUTH_TOKEN` ni nastavljen na Renderu;
   `ai-health` odgovarja `{"status":"fallback"}` (od 1.34.0 klic zahteva
   `CRON_SECRET` — glej INCIDENT-PLAYBOOK). Načrtovalec torej poganja
   deterministični ranking engine (pošteno označen z badge »Predlog«, ne »AI«).
   Konfiguracijska odločitev uporabnika, ne kode.
2. **Render free kapaciteta** — vzporedna obremenitev (~12 konkurentnih zahtevkov na
   hladnem cache) podre instanco (502). Zaporedno ~3 konk. deluje 733/733.
   Opcija: Render Starter.
3. **SMTP** — e-poštni tokovi so demo (strežniški log), če na Renderu niso nastavljeni
   SMTP env spremenljivke (iz starega PILOT-TEST-PROTOCOL.md — preveriti v Test 5).

## PRAVILO ZA ČAS PILOTNE VALIDACIJE

**Med pilotno validacijo se NE dodajajo nove funkcije, razen če test odkrije
konkretno napako.** Dovoljeno: popravki hroščev, validacijska orodja
(testni skripti v `scripts/`), dokumentacija. Prepovedano: novi moduli,
nove arhitekture, nove strani, refaktoriranje.

## Načrt testov (Faza 2)

| # | Test | Vrsta |
|---|---|---|
| 1 | Produkcijski URL audit — zaporedno, vzporedno, 2×, po premoru | HTTP |
| 2 | 10 realnih AI scenarijev (fiksni, ponovljivi) | API/vsebina |
| 3 | Geografska izvedljivost itinererjev (testni validator) | vsebina |
| 4 | Mobilni uporabniški test (320/360/390/768/1280 px) | UI |
| 5 | Pilotni tok ponudnika (owner → podatki → javni prikaz → AI) | UI/API |

Rezultati se zapisujejo v ta dokument po vsakem testu.

---

# REZULTATI — Faza 2 (izvedeno 2026-09-14, 09:00–11:00 UTC)

> Vsi testi izvedeni proti PRODUKCIJI (Render + Neon): https://i-feel-slovenia.onrender.com
> Orodja: `scripts/pilot-audit.ts`, `scripts/pilot-scenarios.ts`, `scripts/pilot-geo-validator.ts` (validacijska orodja — ni sprememb aplikacijske kode)

## TEST 1 — Produkcijski URL audit ✅ VSA VRATA ZELENA

| Pot | SL | EN | Zaporedno | Vzporedno | Opomba |
|---|---|---|---|---|---|
| Homepage | 200 | 200 | OK | OK | p50 376 ms |
| Načrtovalec | 200 | 200 | OK | OK | EN pot je `/en/nacrtuj` — uporabnikova spec "`/en/plan`" ne obstaja (by design) |
| Destinacijski hub (44) | 200 | 200 | OK | OK | 22 SL + 22 EN; vsi s canonical + hreflang + JSON-LD |
| Things to do | 200 | 200 | OK | OK | |
| Guide [type] | 200 | 200 | OK | OK | 4 tipi × 22 destinacij |
| Best-time / Itinerary | 200 | 200 | OK | OK | zahtevata segment: `/poletje`, `/vikend` … |
| SEO datoteke | 200 | — | OK | OK | sitemap 733 URL, robots, llms, llms-full, rss |
| Affiliate `/go/[provider]` | 302 | — | OK | OK | 10 ponudnikov, pravilna interpolacija dest (Bled→booking ss=Bled); brez dest = 400, neznan = 404 (fail-closed) |
| Owner/Admin obrazci | 200 | — | OK | OK | dashboard zaščiten, admin prijavna forma |

**Vzporedni stres (prejšnja težava):**
| Krog | Način | Rezultat |
|---|---|---|
| 1 | zaporedno (733 URL) | 733/733 × 200, p50 311 ms |
| 2 | vzporedno 12 konk. | 733/733 × 200, p50 5,1 s |
| 3 | vzporedno 2× zapored | 733/733 × 200 |
| 4 | po 60 s premoru | 733/733 × 200 |
| API stres | 12× /api/listings vzporedno | 13/13 × 200, **0 Prisma/Neon connection napak** |

**VRATA:** 0 nepričakovanih 5xx ✅ · 0 mrtvih internih linkov (772 preverjenih) ✅ · 0 napačnih canonical/hreflang (44/44 self) ✅ · 0 hub 404 ✅ · sitemap samo veljavni URL ✅

**`connection_limit=1` / vzporedne zahteve: NI PONOVLJENO.** Prejšnji 502-padci (P0-B, 383–704×) so bili na hladnem cache + sočasni cold start; danes vseh 4 krogov 100 % uspešnih. Neon pooler + startup migracije delujejo.

## TEST 2 — 10 realnih AI scenarijev ⚠️ delno (fallback način)

Vseh 10 scenarijev = HTTP 200 (~1 s). `source: "fallback"` — **AI na produkciji izklopljen** (`PUTER_AUTH_TOKEN` ni nastavljen na Renderu; `ai-health` → `{"status":"fallback"}`).

| Kriterij | Rezultat | Opomba |
|---|---|---|
| Upoštevan datum | DA | tripStart/End pravilno (S6: 2027-07-17→19) |
| Upoštevan tip skupine | DELNO | partyType gre v AI prompt; deterministični fallback ga ne uporablja |
| Vreme vpliva na rezultat | DA | S2 (dež): notranje izbire + transparentne opombe + dež-alternativa v tips; realna Open-Meteo napoved |
| Lokacije so realne | DA | vse iz dataseta 22 destinacij |
| Dan geografsko smiseln | NE | glej Test 3 — 10 neizvedljivih dni |
| Časovni razpored izvedljiv | NE | vrzeli 1,0 h vs dejanske vožnje 1,7–2,5 h |
| Alternativa pošteno označena | DA | crowdNotices samo z datumom; prazna ko ni prekrivanja (S6: logika točna — Postojnska ponedeljek) |
| Uporabnik lahko prilagodi | NE | refine vrne nespremenjen itinerer + pošteno opozorilo (AI izklop) |
| Praktični podatki niso izmišljeni | DA | ni izmišljenih urnikov; badge »Predlog« |
| Razumljivo na telefonu | DA | Test 4 |
| EN čist izhod | DA | P4-8 fix deluje; MINOR: `events[].description` ostanejo SL za EN uporabnike |
| Shranjevanje | DA | shareId + `/pot/{id}` (dde08e8edc) |

**VRATA (noben scenarij brez izmišljenih ur/lažnih real-time/nemogočih rut): NEDOSEŽENO** — nemogoče rute so (fallback brez geo-grupiranja); izmišljenih podatkov NI.

## TEST 3 — Geografska izvedljivost 🔴 10 ERROR / 10 WARN (27 dni)

Validator: `scripts/pilot-geo-validator.ts` (haversine × 1,3 cestni faktor, 55 km/h, pravila uporabnika).

| Scenarij | km skupaj | Slabi dnevi |
|---|---|---|
| S1 par 2 dni | 155 | Dan 1: Piran→Ljubljana 122 km + Prekmurje isto pot |
| S2 družina dež | 158 | Dan 1: Postojna→Črnomelj 104 km (1,0 h vrzel vs 1,9 h vožnja) |
| S3 solo | 122 | Dan 1: Ljubljana→Piran 122 km |
| S4 prijatelji | 132 | Dan 2: Postojna→Kobarid 91 km |
| S5 starejši par | 258 | oba dneva (Piran→Ljubljana; Gradec→Lendava 136 km) |
| S6 julij | 337 | VSI 3 dnevi (Bohinj→Gradec, Dravograd→Triglav …) |
| S7 brez datuma | 42 | čisto ✅ |
| S8 | 63 | čisto ✅ |
| S9 | 132 | Dan 2 (isto kot S4) |
| S10 Bled SEO | 17 | čisto ✅ (Gorenjska gruča) |

**Vzrok (korenit):** `generateFallbackItinerary` izbira destinacije IZKLJUČNO po interesih (`bestFor` ujemanje + rating). AI prompt ima pravilo #2 (grupiranje po bližini), deterministični fallback pa ne. Časovni okviri fiksni (09–13/14–18, vrzel 1 h) ne pokrijejo 91–136 km alovk.
**Priporočilo (kandidat za popravilo hrošča, ne nov engine):** geo-grupiranje v fallback (regijske gruče ali nearest-neighbor razvrstitev znotraj dneva) + prilagoditev vrzeli dejanski vožnji.

## TEST 4 — Mobilni uporabniški test ✅ (1 srednja ugotovitev)

| Širina | h-overflow | CTA viden brez drsenja | premajhne tipke |
|---|---|---|---|
| 320 | 0 | DA (y=462/568) | 0 |
| 360 | 0 | DA | 0 |
| 390 | 0 | DA | 0 |
| 768 | 0 | DA | 0 |
| 1280 | 0 | DA | 0 |

**Zlata pot IZVEDENA na produkciji (390 px):** homepage → (vpis + Sestavi pot) → /nacrtuj → Generiraj → rezultat z badge Predlog → izbor Dan 2 (aria-current) → Prilagodi (pošten toast »Delna posodobitev«) → Shrani (POST 200 + deljiva povezava) → Zemljevid (karta se izriše). Napaka 429 prikazana razumljivo (»Napaka pri generiranju« + Poskusi znova) — rate limit 10/10 min zadet pri testu.

**🟡 SREDNJA UGOTOVITEV (320 px):** AI chat FAB (fiksni, z-50, spodaj desno) **prekriva zadnji gumb dneva** (»Dan 2«) takrat, ko je dnevnna navigacija v flow-u blizu dna zaslona (prekriv 56×20 px na sredi klika; klik pristane na FAB). Ko se navigacija prilepi na vrh (sticky top-65), prekrivanja ni — ni trdi blok, a nadležno na najmanjših zaslonih. Pri 360/390 px se ne zgodi.
**Manjše (320 px):** zadnji gumb dneva delno odrezan (30/68 px) — treba horizontalno swipati dnevnega bara (standardni vzorec).

## TEST 5 — Pilotni tok ponudnika ✅ do moderacije (2 koraka blokirana za uporabnika)

| Korak | Rezultat | Dokaz |
|---|---|---|
| Registracija (UI) | ✅ | dashboard + toast »Dobrodošli!« |
| Obrazec: vsa 3 praktična polja | ✅ | sezona (čipi), vreme (combobox), parkirišče (combobox) |
| Prazen vnos | ✅ zavrnjen | native required validacija |
| Napačen vnos (opis < 10) | ✅ zavrnjen | native minLength tooltip; ni POST klica |
| Delni vnos → osnutek | ✅ | POST /api/owner/listings 200 |
| Popoln vnos + shranjevanje | ✅ | parking=paid, seasons=[summer,autumn], weather=indoor, 1 slika — vse shranjeno |
| Neuspešna oddaja (nepopoln profil) | ✅ | 400 + destruktivni toast z manjkajočimi polji |
| Oddaj v pregled | ✅ | POST submit 200 → status=pending |
| Javni prikaz pending | ✅ fail-closed | 0 pojavitev v /api/listings in /lokali |
| Sprememba podatka → ponovni prikaz | ✅ | parking paid→free takoj viden (API brez cache glav) |
| Zastarel podatek / lastUpdated | ⚠️ | polje še ne obstaja (P2-C pravilno odloženo) |
| **Admin moderacija (pending→published)** | ❌ NI MOGOČE | produkcijski `ADMIN_PASSWORD` je uporabnikova skrivnost (lokalni .env je eksplicitno dev-only) |
| **Javni prikaz vrednosti** | ❌ | 0/10 objavljenih lokalov ima praktične podatke (še ni realnih ponudnikov); moj testni lokal čaka na odobritev |
| **AI kontekst** | ❗ N/A | AI izklopljen; fallback nikoli ne bere Listingov → danes 0 tveganja izmišljenih trditev |
| AI ne predstavi kot absolutno dejstvo | ✅ (koda) | prompt: »PREDLAGANI PARTNERJI«, [SPONZORIRANO] oznake, praktični fragmenti kot vrednosti, ne trditve |
| SL/EN prikaz | ✅ (koda) | SEASON/WEATHER/PARKING_LABELS dvojezični; javni modal SL (tržnica izven EN obsega) |

**TESTNI ARTIFAKT ZA UPORABNIKA:** lokal **»Pilot Test Gostilna«** (pending) čaka v admin vrsti — z produkcijskim admin geslom ga odobrite in takoj vidite javni prikaz praktičnih podatkov (parkirišče: zastonj, sezona: poletje/jesen, vreme: notranje). S tem zaprete zadnji korak verige, ki ga jaz nisem mogel.

---

## ZDROŽEN SKLEP — Pilot Validation Gate

| Test | Vrata | Status |
|---|---|---|
| 1 URL audit | 0×5xx, 0 mrtvih linkov, 0 napačnih canonical, 0 hub 404, veljaven sitemap | ✅ ZELENO |
| 2 AI scenariji | ni izmišljenih ur / lažnega real-time / nemogočih rut | ⚠️ rumeno (nemogoče rute so; izmišljenih podatkov ni) |
| 3 Geo izvedljivost | brez očitno slabih dni | 🔴 rdeče (10 ERROR dni) |
| 4 Mobilni tok | celoten tok brez pomoči | ✅ ZELENO (1 srednja 320px ugotovitev) |
| 5 Ponudniški tok | celotna veriga | ✅ do moderacije (2 koraka potrebujeta uporabnikove skrivnosti) |

**Ali trenutna verzija deluje kot izdelek za pravega turista?**
- Infrastruktura, SEO, lokalizacija, affiliate, fail-closed varnost, mobilna zlata pot, ponudniška vstopna vrata: **DA** — stabilno in pošteno (vzporedna težava NI več prisotna).
- Vsebina itinererjev: **NE ŠE** — dokler je AI v fallback načinu, 6/11 testnih itinererjev vsebuje geografsko neizvedljiv dni (do 337 km/dan vožnje v 1-h vrzelmi) in Prilagodi ne deluje. To je TOČNO vrzel, ki jo je uporabnik napovedal (»največja vsebinska vrzel«).

**Tri odločitve uporabnika (konfiguracija, ne razvoj):**
1. `PUTER_AUTH_TOKEN` na Render → vklopi pravi AI (geo-grupiranje prek prompta + refine + citiranje partnerjev). Do takrat izdelek čisto pošteno vozí »Predlog« badge.
2. Produkcijsko admin geslo → odobritev »Pilot Test Gostilna« (zadnji korak ponudniške verige).
3. (Opcijsko) Render Starter — danes ni potreben (vzporedni testi 100 %), a je rezerva za indeksiranje ob hladnem zagonu.

**Kandidati za popravila hroščev (dovoljeno po pravilu zamrznitve):**
1. 🔴 Geo-grupiranje v fallback motorju (+ realne vrzeli med lokacijami) — odpravi 10 ERROR dni.
2. 🟡 FAB prekrivanje dnevnega bara pri 320 px.
3. 🟡 `events[].description` SL v EN itinererjih.
4. ℹ️ Uporabnikova spec poti `/en/plan` ne obstaja — EN načrtovalec je `/en/nacrtuj` (pošteno dokumentirano zgoraj).
