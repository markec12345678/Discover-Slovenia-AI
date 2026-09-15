# PILOT TEST — 10 realnih slovenskih ponudnikov

> Protokol za pilot test po P3 validacijskem auditu (commit `fab3f77`).
> Status dokumenta: **v1.0 — po generalni vaji (P4-1) v produkciji 2026-09-11.**
> Produkcija: `i-feel-slovenia.vercel.app`

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

| # | Težava | Vpliv na pilota | Odlaga / rešitev |
|---|---|---|---|
| 1 | **SMTP ni konfiguriran** — vsa e-pošta je demo (samo strežniški log). Lastnik vidi "povezava poslana", a nič ne pride. | Blokira: verifikacijo e-pošte → plačljive funkcije; geslo-reset; obvestila o rezervacijah; nudge emaile | **(a)** Nastavi SMTP env spremenljivke v Vercel (Resend/Postmark/Brevo — brez spremembe kode) ALI **(b)** pilot ponudnikom ročno nastavi `emailVerified` v DB in vsi gledajo dashboard |
| 2 | **Obrazec "Pridruži se" na homepage vrne 500 v produkciji** (`/api/leads` piše v `data/leads.json` — Vercel FS je read-only). Admin zavihek "Leadi" je vedno prazen. | Edini self-service B2B lijak je mrtev | Pilot ponudnikom pošlji **direktni URL `/owner/prijava`** (obvezno!). Obrazec popravi ali skrij kasneje (odločitev uporabnika — feature freeze) |
| 3 | **Povpraševanja gostov so za lastnika NEVIDNA** — statistika "Lead-i" šteje B2B prijave (leads.json), zavihek Rezervacije = samo izkušnje, e-pošta = demo | Lastnik ne ve, da je kdaj povprašal gost | Pilot scenarij osredotoči na **rezervacije izkušenj** (te so vidne); povpraševanja izpusti ali ročno beri ListingEvent |
| 4 | **Onboarding zahteva 3 URL-je fotografij** | Pravi ponudniki imajo fotke na telefonu, ne URL-je | Pripri predhodno 3 URL-je fotografij za vsakega ponudnika (njihova spletna stran/FB) ali jim pomagaj v skupnem klicu |
| 5 | **Stripe demo način** — rezervacije se takoj potrdijo, naročnina (če je email preverjen) se aktivira brez plačila | Vsi "plačilni" dogodki so navidezna | Povej ponudnikom odkrito: "med beto se nič ne zaračuna" (sporočilo je že v UI) |
| 6 | **AI fallback način** — planer dela (destinacije, vreme), a NE citira lokalov | Osnovna vrednost "AI te priporoča" je oslabela | Postavi pričakovanja: pilot meri **platformo in lijak**, AI citiranje pride z aktivacijo modela |
| 7 | **"Preverjen partner" znak samodejno ob odobritvi** (ne po dejanski verifikaciji) | Kozmetična varnost komunikacije | Ni blokator; odloči kasneje, ali znak pomeni kaj več |

### Odločitev
- **GO za pilot** z direktnimi URL-ji in osredotočenjem na: onboarding → objava → odkrivanje → rezervacija izkušnje → dashboard provizij.
- **Ni GO** za: javni marketing ponudnikom prek homepage (napaka 500), e-poštni tokovi brez SMTP.

---

## 2. TESTNI PROTOCOL — 1 ponudnik (ponovi × 10)

Vsak ponudnik ~45 min. Vsi koraki na **produkciji** (`i-feel-slovenia.vercel.app`).
Admin dostop: `/admin` (geslo iz `.env` → `ADMIN_PASSWORD`).

### A. Priprava (ti, pred srečanjem)
1. ✅ Zberi od ponudnika: ime, ime podjetja, e-pošta, telefon, 3+ URL-je fotografij, kratek+dolgi opis, naslov, urnik, spletno stran.
2. ✅ Preveri produkcijo: `/api/debug-db` → 401 (živ znak nove kode).
3. ✅ (če ne nastaviš SMTP) pripravi skript za `emailVerified` nastavitev.

### B. Registracija (5 min — ponudnik sam)
1. Odpre `/owner/prijava` (POŠLJI MU TA URL — ni povezave z homepage!).
2. Zavihek **Registracija** → izpolni (ime, podjetje, e-pošta, telefon, geslo ×2, GDPR).
3. ➜ dashboard se odpre, onboarding čarovnik se sam zažene.

### C. Onboarding čarovnik (15 min)
1. Korak 1: ime, kategorija, destinacija, telefon, naslov.
2. Korak 2: kratek (1–2 stavka) + dolgi opis.
3. Korak 3: **vsaj 3 URL-je fotografij** (pripravi vnaprej!).
4. Korak 4: spletna stran, urnik, cenovni razred (opcijsko — Preskoči).
5. Korak 5: **Oddaj v pregled** → vidi kartico z statusom "V pregledu".

### D. Moderacija (5 min — ti)
1. `/admin` → zavihek **Pregled** → vidiš lokal z oznako tipa.
2. Preglej vsebino → **Odobri in objavi lokal**.

### E. Javna kontrola (5 min — s ponudnikom skupaj)
1. Osveži homepage → lokal viden v seznamu (kategorija Restavracija ipd.).
2. Odpri "Podrobnosti" → preveri: fotke, opis, kontakt, urnik, "Preverjen partner" znak.
3. (Opcijsko) izpolni testno povpraševanje → vidi "Povpraševanje poslano" (a ne pričakuj da ga lastnik vidi — glej §1.3).

### F. Izkušnja + rezervacija (10 min)
1. Owner dashboard → **Izkušnje** → Dodaj (ime, opis, cena, trajanje, min/max, jezik, meeting point, naslov, ponudnik).
2. Status "V pregledu" → ti: `/admin` → **Odobri in objavi izkušnjo**.
3. Gost (ti v anonymnem oknu): homepage → Tržnica → zavihek **Izkušnje** → P4r izkušnja → **Rezerviraj** → datum/osebe/podatki → **Potrdi** → številka `IF-EXP-…`, skupaj = cena×osebe.
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

1. **Beta = brezplačno:** vsi paketi 0 € med beto; nič se ne zaračuna (Stripe demo).
2. **E-pošta:** med beto obvestila morda ne pridejo — gledaj portal (dashboard).
3. **AI priporočila:** trenutno osnovna (rule-based); polni AI pride pred komercialno fazo.
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
