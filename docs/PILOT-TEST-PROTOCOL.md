# PILOT TEST — 10 realnih slovenskih ponudnikov

> Protokol za pilot test po P3 validacijskem auditu (commit `fab3f77`).
> Status dokumenta: **v1.1 — usklajeno s stanjem kode na HEAD `1cfd247` (v1.89.1), 2026-09-23.**
> Točke, označene z ✅ POPRAVLJENO, so bile po P4-1 odpravljene v kasnejših verzijah (P4-2a, P4-2b, P4-6, P4-9, 1.89.x) in so bile znova preverjene v kodi.
> Produkcija: `i-feel-slovenia.onrender.com` (Render, primarna) · `i-feel-slovenia.vercel.app` (Vercel, sekundarna) — oba na isti verziji in isti bazi (Neon PostgreSQL)

---

## 1. ISKRENA OCENA PRIPRavljenosti (go/no-go)

### ✅ DELUJE (preverjeno v produkciji, UI end-to-end)

| Korak | Status | Dokaz |
|---|---|---|
| Registracija lastnika (direktni URL) | ✅ | Register → dashboard v ~30 s, čarovnik se sam odpre |
| Onboarding čarovnik (5 korakov) | ✅ | Popolnost 53 %→82 %, oddaja v pregled |
| Moderacija (lokal/izdelek/izkušnja) | ✅ | Admin vidi pending z oznako tipa, odobri → objavljeno |
| Javna vidljivost (homepage + tržnica) | ✅ | Objavljen lokal/izkušnja vidna takoj po odobritvi |
| Gastovo povpraševanje po lokalu | ✅* | Zabeleženo v DB (ListingEvent `lead`) |
| Rezervacija izkušnje (cena strežniško) | ✅ | 45 €×2 = 90 €, št. `IF-EXP-<48-bit>` |
| Owner: Rezervacije + zaključek | ✅ | Prihodek 90 €, gumb Zaključi deluje |
| Provizije (12 % samo AI kanal) | ✅ | Direktna rezervacija = 0 € provizije (by design) |
| Email verifikacijska vrata (P3) | ✅ | Nepreverjen → nadgradnja blokirana z jasnim napako |
| Admin plošča + logout | ✅ | Timing-safe geslo, session čisti |
| AI načrtovalec (fallback) | ✅* | 3-dnevni itinerer z vremenom/proračunom |

### ⚠️ OLAJŠAVE, KI JIH PILOT POTREBUJE (pripravi PRED testom)

| # | Težava | Vpliv na pilota | Stanje / rešitev |
|---|---|---|---|
| 1 | **SMTP ni konfiguriran** — vsa e-pošta je demo (samo strežniški log). | Blokira: verifikacijo e-pošte → plačljive funkcije; geslo-reset; obvestila o rezervacijah | **EXTERNAL CONFIGURATION (a):** nastavi SMTP env spremenljivke na Render (primarni) IN Vercel (Resend/Postmark/Brevo SMTP — brez spremembe kode) ALI **(b)** pilot ponudnikom ročno nastavi `emailVerified` v DB. ⚠️ Pomembno: v produkciji demo e-pošta sedaj **redigira URL-je** (varnostni popravek P7-C1) — povezav za verifikacijo/reset NI več mogoče prebrati iz strežniških logov; brez SMTP je edina pot ročna nastavitev `emailVerified` v DB |
| 2 | ~~Obrazec "Pridruži se" na homepage vrne 500~~ | — | ✅ **POPRAVLJENO (P4-2a):** `/api/leads` zdaj piše v PostgreSQL (model `Lead`); admin zavihek "Leadi" dela (nov/kontaktiran/zaklucen); homepage B2B lijak je živ. Direktni URL `/owner/prijava` ostaja priporočen za pilota |
| 3 | ~~Povpraševanja gostov so za lastnika NEVIDNA~~ | — | ✅ **POPRAVLJENO (P4-6):** owner dashboard ima KPI "Povpraševanja gostov" (ListingEvent `lead`); povpraševanja gostov so viden del statistike |
| 4 | ~~Onboarding zahteva 3 URL-je fotografij~~ | — | ✅ **POPRAVLJENO (P4-9):** čarovnik zahteva **vsaj 1 URL fotografije** |
| 5 | **Stripe demo način** — rezervacije/naročila so navidezna | Pilot mora vedeti, kdaj je plačilo navidezno | **Dejansko stanje (1.89.1):** demo v produkciji zahteva izrecno zastavico `DSA_DEMO_PAYMENTS=1` (Render in Vercel) — brez nje rezervacije/naročila vrnejo **501** (fail-closed, ni tihih fake plačil). Demo rezervacija je potrjena a NEPLAČANA (`unpaid`) in ne vstopi v provizijsko osnovo. Naročnina ima PRAVI Stripe Checkout (zahteva `STRIPE_SECRET_KEY`). **Pilot korak F.3 bo vrnil 501, razen če pred testom nastaviš `DSA_DEMO_PAYMENTS=1` v produkciji** |
| 6 | **AI fallback način** — planer dela (destinacije, vreme), a NE citira lokalov | Osnovna vrednost "AI te priporoča" je oslabela | **Delno popravljeno (1.89.0):** zero-AI KLEPET zdaj gradi odgovore iz realnih DB lokalov/izdelkov/izkušenj (`chat-domain-fallback`); deterministični PLANER še vedno ne citira konkretnih lokalov — pričakovanja pilotu postavi tako |
| 7 | ~~"Preverjen partner" znak samodejno ob odobritvi~~ | — | ✅ **POPRAVLJENO (P4-2b):** znak se NE podeli samodejno — je ločena izrecna admin akcija (`/api/admin/listings/[id]/verify`). Za pilot: po odobritvi lokal znaka še nima; znak zahteva ločeno verifikacijo |

### Odločitev
- **GO za pilot** z direktnimi URL-ji in osredotočenjem na: onboarding → objava → odkrivanje → rezervacija izkušnje → dashboard provizij.
- **Ni GO** za: e-poštni tokove brez SMTP (razen ročna nastavitev `emailVerified`) in rezervacije v produkciji brez `DSA_DEMO_PAYMENTS=1` (sicer 501).

---

## 2. TESTNI PROTOCOL — 1 ponudnik (ponovi × 10)

Vsak ponudnik ~45 min. Vsi koraki na **produkciji** (`i-feel-slovenia.onrender.com`, primarna; sicer `i-feel-slovenia.vercel.app`).
Admin dostop: `/admin` (geslo iz `.env` → `ADMIN_PASSWORD`).

### A. Priprava (ti, pred srečanjem)
1. ✅ Zberi od ponudnika: ime, ime podjetja, e-pošta, telefon, vsaj 1 URL fotografije (več je bolje), kratek+dolgi opis, naslov, urnik, spletno stran.
2. ✅ Preveri produkcijo: `/api/debug-db` → 401 (živ znak nove kode).
3. ✅ (če ne nastaviš SMTP) pripravi skript za `emailVerified` nastavitev.

### B. Registracija (5 min — ponudnik sam)
1. Odpre `/owner/prijava` (povezava je tudi v nogi homepagea in na tržnici; direktni URL ostaja najhitrejša pot).
2. Zavihek **Registracija** → izpolni (ime, podjetje, e-pošta, telefon, geslo ×2, GDPR).
3. ➜ dashboard se odpre, onboarding čarovnik se sam zažene.

### C. Onboarding čarovnik (15 min)
1. Korak 1: ime, kategorija, destinacija, telefon, naslov.
2. Korak 2: kratek (1–2 stavka) + dolgi opis.
3. Korak 3: **vsaj 1 URL fotografije** (pripravi vnaprej!).
4. Korak 4: spletna stran, urnik, cenovni razred (opcijsko — Preskoči).
5. Korak 5: **Oddaj v pregled** → vidi kartico z statusom "V pregledu".

### D. Moderacija (5 min — ti)
1. `/admin` → zavihek **Pregled** → vidiš lokal z oznako tipa.
2. Preglej vsebino → **Odobri in objavi lokal**.

### E. Javna kontrola (5 min — s ponudnikom skupaj)
1. Osveži homepage → lokal viden v seznamu (kategorija Restavracija ipd.).
2. Odpri "Podrobnosti" → preveri: fotke, opis, kontakt, urnik. ("Preverjen partner" znak še NI prisoten — podeli se šele z ločeno admin verifikacijo, glej §1.7.)
3. (Opcijsko) izpolni testno povpraševanje → vidi "Povpraševanje poslano" → lastnik ga vidi v statistiki "Povpraševanja gostov" (glej §1.3).

### F. Izkušnja + rezervacija (10 min)
1. Owner dashboard → **Izkušnje** → Dodaj (ime, opis, cena, trajanje, min/max, jezik, meeting point, naslov, ponudnik).
2. Status "V pregledu" → ti: `/admin` → **Odobri in objavi izkušnjo**.
3. Gost (ti v anonymnem oknu): homepage → Tržnica → zavihek **Izkušnje** → za izkušnjo → **Rezerviraj** → datum/osebe/podatki → **Potrdi** → številka `IF-EXP-…`, skupaj = cena×osebe. (Predhodno preveri, da je `DSA_DEMO_PAYMENTS=1` nastavljen v produkciji — sicer ta korak vrne 501.)
4. Owner: **Rezervacije** → vidi rezervacijo + prihodek → **Zaključi**.

### G. Poslovni zaključek (5 min)
1. Owner: **Provizije** → 12 %, 0 € (direktna rezervacija) → razloži model: provizija samo iz AI kanala.
2. Owner: **Naročnina** → pokaži pakete (BETA brezplačno). Če želi nadgraditi: blokira ga e-pošta verifikacija (dokler ne nastaviš SMTP/emailVerified).
3. Owner: **Statistika** → ogledi/kliki se štejejo (klikni lokal kot gost 2–3× predhodno).

### H. Opazuj in zapiši (med celim testom)
- Kje se ponudnik zatika (klikni, vprašanja, izrazi "kaj pomeni to?").
- Čas posameznih faz (B–G).
| Ponudnik | Datum | Registracija | Onboarding | Moderacija | Rezervacija | Zatiki | Opombe |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| … | | | | | | | |

### Merila uspeha pilota
- ≥ 8/10 ponudnikov pride do oddanega locala brez pomoči pri vnosu.
- ≥ 7/10 ponudnikov samostojno doda izkušnjo.
- 10/10 rezervacij potečejo strežniško pravilno (cena, številka).
- Kvalitativno: kateri korak je najbolj "vreden" ponudnikom (povratna informacija za ceno/pakete).

---

## 3. KNOWN-LIMITATIONS BRIEFING (povej vsakemu ponudniku)

1. **Beta = brezplačno:** vsi paketi 0 € med beto; nič se ne zaračuna (demo način; produkcija zahteva `DSA_DEMO_PAYMENTS=1`, sicer rezervacija vrne 501).
2. **E-pošta:** brez SMTP nastavitve obvestila ne pridejo — gledaj portal (dashboard).
3. **AI priporočila:** klepet brez AI ključa priporoča realne lokale iz baze (osnovno, a iskreno); polni AI pride z aktivacijo modela.
4. **Moderacija:** vsaka objava/prememba gre skozi naš pregled (varnost predstavitve).
5. **Provizija:** 12 % samo za goste, ki jih prinese AI konzultacija; direktne rezervacije = 0 €.

---

## 4. TEHNIČNI DETAJLI ZA VODJO PILOTA

- **Direktni URL-ji:** ponudniki `/owner/prijava`; admin `/admin`.
- **Čiščenje po testu:** testne podatke briši po FK vrstnem redu (booking → listingEvent → experience → listing → owner) prek prisma skripte; preveri baseline: Owner 5, Listing 10 (published), Product 6, Experience 10, User 0, Booking 5.
- **Znaki nove kode v produkciji:** `/api/debug-db` brez gesla → 401.
- **Reset gesla (ponudnik pozabi):** demo mode → izvede se prek DB (`verificationToken`/reset token) ali počakaj na SMTP.
- **Rate limiti:** prijava 10/15 min/IP; povpraševanja 10/h; rezervacije 10/h — pri skupinskem testiranju na enem IP-ju naletiš na limite (ponudnikom povej, da se "preveč poskusov" izzve z ~10 min pavze).
- **Knjiga najdb P4-1 (generalna vaba):** v `worklog.md` pod Task ID P4-main.
