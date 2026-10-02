# Issue #24 — UI/UX & WORKFLOW BENCHMARK ROUND 2 — produkcijski dokazi (2026-10-02, ~15:00 UTC)

Produkcija: **Render `i-feel-slovenia.onrender.com`, verzija 1.163.4** (commit `19b5755`, živ tudi na Vercelu).
Metoda: agent-browser (Chromium), izmere `scrollWidth` vs `clientWidth` po drsenju.
Rezultat skupno: **0 horizontalnega prelivanja na vseh preverjenih širinah, 0 napak strani, 0 konzolnih napak.**

| Posnetek | Širina | Površina | Preverjeno |
|---|---|---|---|
| `home-390.png` | 390×844 | `/` domov — hero, čipi, navigacija | 0 preliv; hidracija: žela → CTA omogočen |
| `home-1440.png` | 1440×900 | `/` domov — desktop, scroll-glass header | 0 preliv |
| `destinacije-390.png` | 390×844 | `/destinacije` — hub 38 destinacij | 0 preliv |
| `destinacija-bled-390.png` | 390×844 | `/destinacija/bled` — stran destinacije | 0 preliv; gumb »Dodaj v mojo pot« prisoten |
| `add-toast-390.png` | 390×844 | po kliku Dodaj | stanje `V moji poti` + števec `1` na spodnji navigaciji (write-through obeh plasti) |
| `nacrtuj-390.png` | 390×844 | `/nacrtuj` — načrtovalnik | 0 preliv |
| `nacrtuj-1440.png` | 1440×900 | `/nacrtuj` — desktop | 0 preliv |
| `moja-potovanja-gost-390.png` | 390×844 | `/moja-potovanja` — hub za gosta | 0 preliv; chain-progress + CTA |
| `na-poti-empty-390.png` | 390×844 | `/na-poti` — Go Mode prazno stanje | 0 preliv; dvojni CTA (Sestavi / Načrtuj z AI) |
| `zemljevid-390.png` | 390×844 | `/zemljevid` — interaktivni zemljevid | 0 preliv |
| `veck-sheet-390.png` | 390×844 | mobilni list »Več« | 15 povezav + jezik/tema/a11y + CTA; tarče ≥44 px |

Dodatne izmere (brez posnetka): 320×800 vseh 6 zaslonov = 0 preliv;
430×932 (`/`, `/nacrtuj`, `/na-poti`) = 0 preliv; 1280×800 (`/`, `/nacrtuj`, `/na-poti`, `/zemljevid`) = 0 preliv.

**PRODUCTION REALITY opomba (P0 operativno iz poročila):** istega dne izmerjeni
hladni zagonski časi Render free tier — 3× zaporedni timeout (25 s / 40 s / 60 s)
po ~20 min nedejavnosti, po bujenju vse poti 200. Vercel odgovarja sekundno.
Vir analize: `docs/UIUX-BENCHMARK-2026-10-02.md` §0/§1.
