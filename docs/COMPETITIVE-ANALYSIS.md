# KONKURENČNA ANALIZA — kaj imajo najboljši/najdražji, kar mi nimamo

> Vir: web research 2026-09-11 (GetYourGuide, Viator, Withlocals, Kimkim, Bókun, Layla/Mindtrip).
> Kontekst: po P3 auditu + P4-1 generalni vabi. Feature freeze velja — to je **seznam za odločanje**, ne sprint backlog.

---

## 1. Referenčni modeli (kako zaslužijo)

| Platforma | Provizija | Model | Ključni mehanizem |
|---|---|---|---|
| **GetYourGuide** | 20–30 % (volumenski popusti) | Provizija na VSE končane rezervacije | Real-time dostopnost + instant potrditev + centralni Supplier Portal |
| **Viator/TripAdvisor** | 20–35 % + 29 $/izdelek (enkratno) | Provizija + listing fee | "List once" — distribucija čez celoten TripAdvisor omrežje |
| **Withlocals** | 25–43 % (!) | Provizija | Zasebni/osebni touri, gostitelji nastavijo urnik |
| **Kimkim** | provizija (boutique) | Custom itinerari | Mreža lokalnih specialistov + advisor program |
| **Bókun** (softver) | 49–499 $/mes + 1–1,5 % | SaaS + fee | Booking widget na LASTNI strani ponudnika + 50+ OTA kanalov |
| **Layla / Mindtrip** (AI) | 49 $/leto (B2C) | Freemium | Žive cene, PriceLock, video vsebina |

**Naša pozicija (wedge):** 12 % SAMO na AI-atribuirane rezervacije; direktne rezervacije 0 %. To je cenično močnejše od vseh (GYG vzame 20–30 % na vsem). A wedge deluje LE, če AI kanal resnično prnaša goste — trenutno AI v fallback mode.

---

## 2. VRZELI — kaj nimamo, po pomembnosti za naš model

### 🔴 A. Zaupanje gostov (blokira konverzijo)

| # | Kar imajo oni | Naše stanje | Zakaj pomembno |
|---|---|---|---|
| A1 | **Overjena mnenja samo po končani rezervaciji** (GYG/Viator/Withlocals) | Gumb "Napiši prvo mnenje" odprt vsem (nepreverjeno) | Nepreverjena mnenja = lažne ocene; TripAdvisor je uničil zaupanje mnogim platformam |
| A2 | **Double-blind reviews** (gost ↔ ponudnik, odkritje po objavi obeh) | Nič | Zavaruje goste pred povračilnimi mnenji ponudnikov |
| A3 | **Quality review SLA** (Viator: 7 dni) | Imamo moderacijo ✓ | Paritetno — naše je celo hitrejše (beta) |

### 🔴 B. Transakcijska infrastruktura (blokira pravi denar)

| # | Kar imajo oni | Naše stanje | Zakaj pomembno |
|---|---|---|---|
| B1 | **Real-time dostopnost + instant potrditev** (GYG zahteva!) | Ročna izbira datuma; demo auto-potrditev | GYG to ZAHTEVA od ponudnikov ker gostje pričakujejo; mi nimamo koledarja kapacitet |
| B2 | **Plačilo kartico ob rezervaciji + samodejni izplačili ponudnikom** (bi-tedensko/mesečno, PayPal/banka) | Stripe demo; izplačil NI (samo naš CommissionInvoice) | Ponudnik mora sam terjati denar od gosta → trenje; GYG vzame denar in izplača |
| B3 | **Payout ledger / settlement report** | Nič | Računovodstvo ponudnika (kdor je dobil koliko) |

### 🟡 C. Operativna orodja ponudnika (zadržanje/retention)

| # | Kar imajo oni | Naše stanje | Zakaj pomembno |
|---|---|---|---|
| C1 | **Koledar razpoložljivosti** (kapaciteta/dan, blackout, sezona) | Samo min/max skupina | Brez tega ponudnik ne more preprečiti overbookinga |
| C2 | **Supplier Portal s poslovnimi metrikami** | Imamo dashboard ✓ (ogledi/kliki/rezervacije/provizije) | Paritetno osnovno; manjka razčlenitev po kanalu/terminu |
| C3 | **Booking widget za LASTNO spletno stran ponudnika** (Bókun!) | Nič | Bókunov glavni prodajni argument — ponudnik dobi rezervacijski sistem ZA VSE svoje kanale |
| C4 | **API/channel connectivity** (Bókun, TourCMS, TicketingHub → GYG) | Nič javnega API-ja za ponudnike | Za večje ponudnike ki imajo lastne sisteme |
| C5 | **Samodejni prevodi vsebin** (GYG ~20 jezikov) | Listing ima polje jeziki, vsebina sl-only | Naša tržišča: tujci — nemško/italijansko/angleško bistveno |
| C6 | **Distribucijsko omrežje** (Viator: list once → TripAdvisor + partnerji) | Samostojno | Težko dohajljivo — a partnerstva (slovenia.info?) možna |

### 🟡 D. AI konkurenca (naša domovina!)

| # | Kar imajo oni | Naše stanje | Zakaj pomembno |
|---|---|---|---|
| D1 | **Žive cene + PriceLock** (Layla) | Rule-of-thumb cene (~€400/3 dni) | Naše AI planer cene niso realne |
| D2 | **Video vsebina v priporočilih** (Layla, short-form) | Statične slike | Gen-Z konverzija |
| D3 | **Deep data integracije** (Mindtrip) | Published listings only | Paritetno načeloma; kvaliteta odvisna od modela |

---

## 3. Kaj imamo MI, kar oni NIMAJJO (edenčna prednost)

1. **0 % provizija na direktnih rezervacijah** — vsi drugi vzamejo 20–43 % na VSEM
2. **AI konsultacije z atribucijo citatov** — ponudnik vidi TOČNO kdaj ga je AI priporočil (GYG tega pojma nima — oni so iskanje/plačana vidljivost)
3. **Provizijski model Booking-style (12 % samo AI kanal)** — revolucionarno pošten za ponudnike
4. **Slovenščina-first** + lokalna moderacija ekipe
5. **Onboarding čarovnik 5 korakov** (GYG registracija je bolj birokratska)

---

## 4. PRIPOROČILO — naslednji koraki po pilotu (odločitev uporabnika)

### Pred monetizacijo (NUJNO — cenični wedge zahteva zaupanje):
1. **A1: Mnenja samo po končani rezervaciji** — poveži Review z Booking ID (majhen fix: rate-limit + bookingNumber validacija)
2. **B2/B3: Pravi Stripe + payout sled** — brez tega smo "inquiry platforma", ne marketplace
3. **B1: Osnovni koledar razpoložljivosti** — vsaj kapaciteta/dan + blackout datumi (prepreči overbooking pri 10 ponudnikih)

### Po prvih 10–20 ponudnikih (rast):
4. **C5: Prevodi vsebin** (nemščina, italijanščina, angleščina) — naše tržišče so TUJCI
5. **C3: Embed widget** za lastne strani ponudnikov (Bókun playbook — postalj nas "rezervacijski sistem" ne le "kanal")
6. **D1: Realne cene v AI** — poveži AI planer z dejanskimi cenami izkušenj (12 % provizija postane utemeljena)

### Strateško (izbira):
7. **Partnerstvo s slovenia.info/STO** namesto tekmovanja z Viator distribucijo
8. **C4: javni API** ko bodo večji ponudniki spraševali

---

## 5. Iskrena primerjava v eni povedi

> GetYourGuide je "resnicna" marketplace z 20–30 % provizijo na vsem; mi smo "pripravljenostna" platforma z 12 % samo na AI kanalu — dokler ne dodamo pravih plačil, overjenih mnenj in koledarja, smo konkurentni na POŠTENOSTI do ponudnikov, ne na obsegu.
