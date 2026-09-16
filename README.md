# 🇸🇮 Discover Slovenia AI — AI Tourism Platform

> **AI-poganjana turistična platforma za Slovenijo** — AI načrtovalec potovanj, tržnica lokalnih izdelkov in izkušenj, B2B portali za ponudnike, interaktivni zemljevid in pošten provizijski model: **0 % na direktnih rezervacijah, 12 % izključno na AI kanalu**.

[![CI](https://github.com/markec12345678/Discover-Slovenia-AI/actions/workflows/ci.yml/badge.svg)](https://github.com/markec12345678/Discover-Slovenia-AI/actions/workflows/ci.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791?logo=postgresql)](https://neon.tech/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38B2AC?logo=tailwindcss)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

**Produkcija (primarna):** <https://i-feel-slovenia.onrender.com> (Render, avtomatski deploy iz `main`) · **Sekundarna:** <https://i-feel-slovenia.vercel.app> (Vercel, rate-limit okna — glej runbook)

**Status faz:** P0 ✅ → P1 ✅ → P2 ✅ → P3 ✅ (varnostni auditi) → P4 ✅ (pilotni polish) → P5 ✅ (priprava deploya) → P6 ✅ (sinhronizacija dokumentov) → P7 ✅ (varnostni audit + popravki P0–P2) → P8 ✅ (responsive 390 px + atomarna booking deduplikacija) → P9 ✅ (code freeze + deploy runbook/smoke orodja) → R2/R3 auditi ✅ → FW1 ✅ (kritični audit popravki) → FW2 ✅ (UX quick wins — Mindtrip Tier 1) → FW3 ✅ (AI-first hierarhija UX refaktor) → **MONET ✅ (monetizacijska mreža — 10 partnerjev fail-closed, affiliate + GEO/SEO paket + mobilni UX pass)** — pilot-ready; produkcijo preveri dinamično (smoke skripta, točka 8)

> 🧊 **CODE FREEZE (P9, 2026-09-11):** razvoj za pilot je zaključen — do konca pilota NOVIH funkcij ni (samo popravki napak iz realne uporabe).
>
> - **Odstopanji od zamrznitve (odobrena):** **FW1** `08e8369` — kritični popravki auditov R2/R3 (varnost = dovoljena kategorija pod freeze); **FW2** `629da01` — 8 UX quick wins iz primerjalne analize [Mindtrip.ai](https://mindtrip.ai/); **FW3** `0742a1a` — AI-first hierarhija UX refaktor (progresivno razkrivanje; homepage 22 → 8 blokov, 9 novih strani, CTA »Načrtuj z AI« povsod); **MONET valovi (2026-09-12, uporabnikovo izrecno naročilo — priprava monetizacije):** `d76a772` + `ea4c94a` — monetizacijska mreža 10 partnerjev (hoteli/Booking, izleti/GetYourGuide+Viator, avti/DiscoverCars, leti/Skyscanner, eSIM/Airalo, transferji/Kiwitaxi, transport/Omio, vstopnice/Tiqets, zavarovanje/WN+SafetyWing) — **fail-closed: brez ID-jev se kartice sploh ne izrišejo** (affiliate suite 55/55); **GEO paket** `239e6ce`…`37a6451` — llms.txt/llms-full.txt, RSS 2.0, eksplicitna AI-crawler dovoljenja v robots.txt, IndexNow (326 URL), host-zavedni metadata (og:image/canonical/JSON-LD na dejanskem gostitelju) — 6 indeksacijskih blokad odstranjenih (nevidno za uporabnike, 20 GEO smoke točk); **Mobilni UX pass** `84fdd7e` — 44px tap tarče (2026 standard), razbremenjen mobilni header, berljivejši hero, 2-stolpčna mobilna noga (VLM revizija pred/po); **SEO-2** `7602f65` — host-honest canonical/hreflang/JSON-LD na VSEH straneh (prej ~20 strani hardcodiralo mrtvo domeno discoverslovenia.ai; +7 smoke točk, 43 total); **FW4.3-1** `a6fae59` — EN i18n Phase 1 (318 ključev × 2 jezika, 12 komponent na t(), EN podatki 22 destinacij, AI language param — vizuelno NEspremenjeno za SL; javni vklop 'en' sledi v Phase 2, ko bodo prevodi celoviti po P4-8); **ADRIA-1** (uporabnikovo naročilo »odlično začni po svoji logiki« — jadranski wedge, NE rebrand) — 10 cross-border vodnikov na pravih SSR straneh `/vodici/[slug]` (~100 strani uredniške vsebine: HR/BA/ME/AL road tripovi iz Slovenije), prave fotografije z Wikimedia Commons (CC BY/BY-SA z vidno atribucijo), sitemap 326 → 336 URL, llms.txt/llms-full/rss sinhronizirani (RSS 120 itemov, edini z resničnim pubDate), affiliate + AI CTA fail-closed; **FW4.3-2** `f48304c` — EN Phase 2 javni vklop: angleščina živi na EN whitelisti (jedro lijaka: domov, načrtuj, destinacije, 6 info strani + 308 destinacijskih podstrani — 948 ključev × 2 jezika, 34 namespace-ov), izven whitelisti proxy trajno (308) vrne na slovensko pot (P4-8: nikoli mešanja jezikov, nikoli 404); sitemap 336 → 654 URL (317 EN različic) s hreflang gručami (sl-SI/en-US/x-default); jezikovni preklopnik (dropdown + LanguageToggle pill na straneh brez headerja) s trdo navigacijo; AI chat EN systemPrompt; **ADRIA-EN** `b70c423` — angleške različice 10 jadranskih vodnikov na /en/vodici (full prevodi v src/lib/adria-guides-en, isti slugi = hreflang pari; sitemap 654 → 665 URL, +11 EN; llms.txt/llms-full EN profili; SL tipkarski popravki izvornika).; **SLO-LOOP-1** `265c6e5` — prvi domači krožni vodniki (raziskava: poizvedbe 'Slovenia in 7/10 days' osvajajo izključno neodvisni blogi, platforma ni imela NOG domačega kroga): 4 vodniki × SL+EN (v 7 dneh/420 km, v 10 dneh/800 km, vikend Ljubljana–Bled/120 km, z otroki/420 km) na isti infrastrukturi /vodici/[slug]; hub /vodici z novo sekcijo 'Slovenija v enem krogu'; loop-variante UI besedil prek isSloveniaLoop; hero fotografije Wikimedia CC (VLM presoja, atribucije); sitemap 665 → 673 URL (+8), RSS 120 → 124 (kategorija 'Vodič po Sloveniji'), llms.txt/llms-full nove sekcije; kanonska dejstva po spletni raziskavi (DARS/Petrol, Postojna, Škocjan, Terme Olimia …); validacija 14/14 pariteta SL⇄EN.; **SLO-WINTER-1** `d89ac31` — zimski val (raziskava: s septembrom se gradijo decembrski SERP-i, 'božični sejem Ljubljana'/'smučarski vikend'/'Slovenija pozimi' vrzel brez aktualnih cen): 4 zimski vodniki × SL+EN (Slovenija pozimi/330 km/5 dni, božični vikend Ljubljana/110 km, smučarski vikend primerjalni Vogel/Krvavec/Kranjska Gora/160 km, zima v termah Čatež+Olimia/230 km); hub sekcija 'Slovenija pozimi' na vrhu; kanonska dejstva: sejem 27. 11. 2026–15. 1. 2027, zimske gume 15. 11.–15. 3. (29. člen ZPrCP), Vogel 45/39/23 €, KG 49/30/44 €, Krvavec 45/28 €, Čatež 19/25 €, Aqualuna 15/19 € (družinska 51–67 €); hero 3× Commons CC + 1× AI-generirana termalna (Commons nima zimske); sitemap 673 → 681 URL (+8), RSS 124 → 128, llms.txt/llms-full +2 zimski sekciji; validacija 18/18 pariteta SL⇄EN.; **IMG-FIX** `ce7bf6f` — VLM audit vsebinskih slik (uporabnikovo naročilo »slike se povsod ne ujemajo s tekstom« — varnost = dovoljena kategorija pod freeze, kakovost vsebine pa pogoj pilota): glm-4.5v presoja vseh 69 slik proti imenu+opisu entitete → 58 OK (≥ 8/10), 11 neujemajočih (dravograd = gozd, bled-winter-swim = atletska dvorana …) zamenjanih z AI-generiranimi (natančni prompti iz opisov, »no text no signage«; ljubljanski-zimski-festival zahteval 2. generacijo) — VLM-potrjeno ujemanje ≥ 9/10 vsega; novo lokalno gostovanje public/content/<id>.jpg (sharp JPEG q74 mozjpeg, 106–217 KB) namesto CDN; trajna orodja z resume: audit-content-images.ts, regen-mismatched-images.ts, verify-new-images.ts; **MKT-IMG** `0992192` — tržni val (isti VLM standard za marketplace DB vsebine): vzrok nerelevantnih kartic = seed-demo.ts je dodeljeval slike PO INDEKSU iz skupnega CDN seznama (kavarna z Dravogradovim gozdom …); 31 AI-generiranih per-entitetnih slik (25 kartičnih 1344×768 + 6 produktnih 1024×1024, 88–240 KB) v public/content/marketplace/; VLM 28/31 OK, 3 regenerirane po kritiki specifičnosti; seed per-entitetne dodelitve (26 vnosov) + src/lib/marketplace-image-migration.ts startup migracija prek instrumentation.ts (idempotentna, fail-open, popravi LE vrstice s CDN markerjem — lastniške slike nedotaknjene) → produkcijska Neon DB samodejno migrirana ob prvem zagonu po deployu; E2E test na schema-test.prisma (10+10+6, drugi zagon 0 sprememb); **CDN-MIG** `ab83373` — celoten slikovni pipeline 100 % lokalen: zadnjih 58 CDN slik (21 destinacij + 20 dogodkov + 16 vodnikov + hero) prenesenih in optimiranih v public/content/ (JPEG q74 mozjpeg progressive, vsebinske max 1600 px, hero 1920 px; 5 prevelikih dodatno stisnjenih — kobarid 675→424 KB), imenovanje po entiteti (bled.jpg, pustni-karneval-ptuj.jpg …) → 69 + 31 datotek ≈ 11,3 MB, sfile.chatglm.cn iz vsebine popolnoma odstranjen (ostane samo kot marker DB migracije); fix: statični `import path` v db.ts je podiral edge prevajanje instrumentation.ts (dev 500 na vseh straneh) → dinamičen serverPath(); scripts/migrate-cdn-images.ts (resume + poročilo); **SLO-WINTER-2** `5cd36c7` — drugi zimski val (nadgradnja SLO-WINTER-1: december→februar pokrit celo sezono): 4 zimski vodniki × SL+EN (božični Bohinj s pravljico v Ribčevem Lazu/170 km/3 dni, silvestrovanje Ljubljana + Bled 1. 1./130 km/3 dni, smučanje v januarju — Vogel/KG/Krvavec primerjalnica vrednostnega okna/335 km/4 dni, zimske počitnice z otroki — sankanje/drsanje/Čatež/270 km/4 dni); kanonske cene iz SLO-WINTER-1 (Vogel 45/39/23 €, KG 49/30/44 €, Krvavec 45/28 €, Čatež 19/25 €) + sezonske resnice (februarske počitnice po regijah, sejem do 15. 1.); hero slike iz lokalnega VLM-audited fonda (Commons/z-ai API kvota izčrpana — sharp 1344×768 attention crop); sitemap 681 → 689 URL (+8), RSS 128 → 132, llms.txt/llms-full auto (SLOVENIA_WINTER_GUIDES zanka); validacija 22/22 pariteta SL⇄EN.; **SEO-CACHE** `cbc9d99` — fix produkcijske napake, najdene s sitemap integritetnim auditom (paralelni pregled vseh 689 URL-jev: 61× HTTP 500 izključno na things-to-do/guide straneh — dinamične strani so ob vsakem requestu izvedle 2–3 DB poizvedbe; ob vzporednem obremenjevanju (Googlebot) se Neon pooler connection_limit=1 zamaši → 500 → tveganje izvrženja iz indeksa; zaporedni retest: vse 200 — časovna, ne podatkovna napaka): novo src/lib/seo-page-data.ts — unstable_cache (revalidate 1 h, tags marketplace/seo-pages) za vse DB poizvedbe programatskih strani + try/catch fallback na KLICI (ob napaki DB se sekcije ne izrišejo, stran ostane 200, cache se ne zastrupi); identične poizvedbe/preslikave; validacija tsc/eslint/73 testov + lokalni smoke z mrtvo DB 6/6× 200 (fallback dokazan) + produkcijski re-scan 689/689× 200 pod istimi 12-vzporednimi pogoji, kartice z DB podatki se izrišejo; **PREMIUM-VIZ** `c259e88` — uporabnikovo naročilo (premium vizualna/UX prenova, pogoj: »preveri prvo, ne predpostavljaj; če je kar imamo boljše, ne delaj nič« — po preverjanju ~70 % produkta že premium, izvedena CILJANA prenova 6 točk, hero/navigacija/destinacije/žetoni NE dotaknjeni): (1) itinererji — emoji+modro/vijolični gradienti → fotografske uredniške kartice (6 lokalnih slik, next/image, trajanje na sliki, CTA vedno viden); (2) demo scenariji — isto zdravljenje + »Napiši svoje« zdaj res vodi na /načrtuj (prej scrollIntoView na neobstoječi element = tihi no-op); (3) doživetja — ikonasta mreža → fotografske kartice z naslovom na sliki (scrim) + link na /doživetja; (4) explore hub — dashboard mreža → tipografski uredniški indeks (številke 01–06, las ločnice, nič ikon/fotografij); (5) booking — 10 enakih »PARTNER« kartic → 4 umirjene skupine (Bivanje/Na pot/Doživetja/Varna pot) v vrsticah z las ločnicami — VSI href-i /go/*, rel=sponsored, aria, EU razkritje in strežniško sledenje nespremenjeni (10/10 preverjeno); (6) stats — smaragdni gradient kartica → zbirna paleta; mikro: hero badge brez Sparkles, trust pike poenotene belo, dekorativni emoji iz newsletter/noge odstranjeni (🔗🇸🇮 ostane kot edini signal), navigacija: besedna znamka skrita <360px (2px horizontalni preliv na 320px — predhodna produkcijska napaka, potrjena na produkciji); i18n: +12 alt tipk, +8 skupinskih tipk (SL+EN); validacija: tsc 0, eslint 0, 73/73 testov, agent-browser 9 širin (320–1920, 0 prelivov), kliki 6/6 (itinerer→/načrtuj s poizvedbo, demo, custom, doživetja→/doživetja, hub→/zemljevid), EN+SL izris. **MOBILE-PLANNER** `b8b1ce5` — uporabnikovo naročilo »naredi kaj misliš da je profesionalno« (po predhodni strokovni presoji P0–P3: ~80 % predloga že v produkciji od valov PREMIUM-VIZ/FW4.1, zavrnjeni izmišljeni verification statusi — »ne izmišljaj statusov« je uporabnikovo lastno pravilo; edini profesionalno upravičen del = mobilni planner): lepljiva vrstica dni na /načrtuj (nova komponenta PlannerDayNav, vidna < lg pri ≥ 2 dneh) — dnevni tabi z vodoravnim drsenjem scroll-snap (do 14 dni) in scroll-spy (IntersectionObserver označuje aktiven dan med branjem, klik = mehak preskok), bližnjici Prilagodi (→ AI refiner) in Shrani (→ akcijska vrstica) kot navigacija do obstoječih delov (nič novih funkcij); sidra id/day-card-N na dnevnih karticah + id na refinerju/akcijah s scroll-mt-[130px] lg:scroll-mt-24; prefers-reduced-motion brez animacije; i18n +3 ključi (SL+EN); validacija: tsc 0, eslint 0, 73/73 testov, E2E lokalno — sticky točno 65px pod glavo, scroll-spy sinhron, vsi preskoki pristanejo 130px pod chrome-om, meja 1023 viden/1024 skrit, overflow OK 320–768, EN locale, 0 napak. **WEATHER-CONTEXT** `063a364` — uporabnikovo naročilo »naredi kaj manjka po tvoje« (po predhodni presoji točk 8–12 konkurenčne analize: t11 izbrana kot največja poštena vrzel — najmanj napora, največji učinek; t9 zavrnjena kot že živa, izmišljeni live-statusi spet zavrnjeni): pravo vreme usmerja AI načrt — za znano okno potovanja (startDate ≤ 16 dni) se napoved Open-Meteo za tri regionalna sidra (Bled/Ljubljana/Piran, koordinate iz slovenia-data) pridobi VZPOREDNO z ranking engine (brez latence) in podá AI kot dejstvo (novi rulesi 12/13 SL+EN: ≥ 60 % padavin v regiji dneva → notranje aktivnosti); brez startDate napoved ne gre v prompt (sezonsko načrtovanje ostane pošteno); napoved poravnana z datumom odhoda (start_date/end_date — prej dan i dobil »i-ti dan od danes« tudi za potovanje čez teden) in EN izpis vremena res angleški (weatherCodeToTextEn); fallback: deževni dnevi (večina sidra ≥ 60 %) dobijo notranje/prilagodljive destinacije iz tipa v slovenia-data (jame/terme/mestna jedra) s transparentnim razlogom v opombi, brez napovedi zaporedje identično prej (simulacijsko dokazano); nov PlannerInput.partyType (couple/family/friends/solo): formni čipi »Kdo potuje?« (»Sam« sinhronizira številko skupine), NL parsing iz heroja/kviza/demo, strežniška validacija 400, AI + refine prompt upoštevata sestavo (i18n SL+EN, +6 ključev × 2); validacija: tsc 0, eslint 0, 73/73 testov, build OK, E2E :3100 — payload partyType+startDate, briefing 1/3 sidra (2× Open-Meteo 429 → graceful), AI source z-ai-sdk, izris Dan 1–3, Sam→1 sinhrono, EN locale, 0 console napak. **CROWD-ALTERNATIVES** `e885f23` — uporabnikovo naročilo »nadaljuj po svoji logiki« (t10 po presoji točk 8–12: druga največja vrzel; izmišljeni »BLED IS BUSY TODAY« live-status zavrnjen — ni vira o gneči v realnem času, uporabnikovo lastno pravilo »ne izmišljaj statusov«): poštene opombe o gneči z mirnejšimi alternativami (»kam namesto tja«) — novo src/lib/crowd-alternatives.ts (čiste funkcije): vrhunske točke (Bled, Vintgar, Postojnska jama, Piran, Ljubljana — javno dokumentiran obiskovalni pritisk) julija in avgusta ob vikendih običajno zelo obiskane; ob znanem datumu odhoda vsak tak dan+točka dobi rodno pravilno opombo (SL/EN) + do 2 alternativi iz resničnih podatkov (haversine ≤ 60 km, sezonska ustreznost, razvrstitev po bestFor ∩ interesi potnika, razdalja v km, povezava na /destinacija/[slug]); brez startDate 0 opomb (neznani datumi = ni poštene trditve); /api/itinerary: pogojno prompt pravilo (jutranji termini pred 9:00 / premik na manj obiskane) + crowdNotices na AI in fallback poti (persistirajo se z načrtom); refine: opombe v kontekstu + pogojni hitri predlog; planner UI: umirjena opomba na dnevni kartici + alternativni čipi (i18n +1 ključ × 2); validacija: tsc 0, eslint 0, 73/73 testov, build OK, simulacija 7/7 (junij/september/delavniki nikoli vrhunski; alternative nikoli vrhunske; rod za vseh 5), E2E :3100 — 4 opombe kadar AI razporedi vrhunske točke na julijski vikend, 0 opomb ko jih premakne na ponedeljek (pošteno vedenje), čip pogojen, 390px brez preliva, 0 console napak. **PRAKTIČNI PODATKI (t12-1)** `402af00` — uporabnikovo naročilo »odlično nadaljuj« (t12 faza 1 po presoji točk 8–12): tri neobvezna polja Listing (seasons — JSON sezona obratovanja; weatherSuitability — indoor/outdoor/all-weather; parking — free/paid/street/private/none) — partner ju vnese v owner/admin formi (sezonski čipi Celo leto/Pomlad/Poletje/Jesen/Zima + 2 selecta z »Ni podatka«), javni modal jih prikaže SAMO ob realnem vnosu z oznako vira (»Praktične podatke je vnesel ponudnik.« — nikoli izmišljeno), AI načrtovalnik pa jih dobi v kontekstu partnerjev (deževen dan → »vreme: notranje«; izven sezone neustrezno; SL+EN); obstoječe baze (Render/Neon) dobijo stolpce z idempotentno zagonsko shema migracijo prek instrumentation.ts (additive-only, dialect-aware sqlite PRAGMA / postgres information_schema, fail-open, izklop DSA_DISABLE_SCHEMA_MIGRATION=1 — isti vzorec kot MKT-IMG); profile-completion +3 neobvezna polja (uteži 3+1+1 → skupno točno 100); seed-demo 5/10 primerov; POPRAVLJEN PREDHODEN SESUJEVALNI HROŠČ admin forme (Radix SelectItem value="" → sentinel "none" — forma se prej ni mogla odpreti); validacija: tsc 0, eslint 0, 73/73 testov, build OK, migracijski E2E 20/20 na schema-test.prisma (DROP COLUMN simulacija stare baze → dodani vsi 3; CRUD; idempotentnost), E2E :3100 z mockanim /api/listings (agent-browser network route) — modal izriše Sezona/Ustreznost/Parkirišče ob vnosu (DOM + VLM, desktop + 390px), legacy brez podatkov vrstice skrije, čipi togglirajo (aria-pressed), 0 napak v sveži seji; produkcijski smoke po deployu: /api/listings 200 s seasons poljem = Neon stolpci živi (migracija se je izvedla), obstoječi zapisi ostajajo null (nič izmišljenega), modal se odpira, 0 brskalniških napak. **HUB-SKUPINE (t8)** `5f93cb2` — uporabnikovo naročilo (t8 po presoji točk 8–12, poceni hub varianta): explore-hub ostaja isti tipografski uredniški indeks z ISTIMI 6 povezavami, a razdeljen v tri namenske skupine z umirjenimi kici — NAČRTUJ (zemljevid + vodiči) / DOŽIVI (dogodki + lokali + tržnica) / VEČ (Slovenia Pass); vdoljinske številke 01–06 tečejo čez skupine (uredniška kontinuiteta), las ločnice ostanejo; NOBENE nove povezave — AI načrtovalnik ostaja izključno v hero CTA (brez duplikacije), Tržnica in Slovenia Pass namenoma ohranjeni; i18n +3 ključi × 2 (groupPlan/groupExperience/groupMore); validacija: tsc 0, eslint 0, 73/73 testov, build OK, E2E :3100 — skupine se izrišejo SL+EN, vseh 6 linkov, številčenje 01–06, 390px brez preliva, 0 napak; produkcijski smoke: NAČRTUJ/DOŽIVI + PLAN/EXPERIENCE/MORE živi na produkciji, 0 brskalniških napak. **GEO-A** `5aaeae1` — poprava 22 mrtvih nadrejenih destinacijskih strani (kritična ugotovitev GEO-P2 analize: llms-full.txt je 22× linkal na /destinacija/[slug], ki je bil 404 — AI-agenti so dobivali mrtve URL-je iz same AI-datoteke): nova hub stran /destinacija/[slug] po vzorcu things-to-do — TouristDestination JSON-LD z lastno potjo + containsPlace 10 podstrani, breadcrumb Domov/Destinacije/ime, dejstva (trajanje/budget/strosek/za-kogo/sezona), povezave things-to-do + vodniki + itinererji + sezone, sosednje destinacije iste regije, affiliate blok + AI CTA fail-closed, PageViewTracker + LanguageToggle; EN whitelist +/^\/destinacija\/[^/]+$/ (P4-8: proxy ne preusmerja več 308→404); sitemap 689 → 733 URL (+44, prioriteta 0.9, hreflang gruče sl-SI/en-US/x-default); i18n 48 ključev × 2; ujet in popravljen hrošč med E2E (t() s {name} placeholderjem brez vrednosti → FORMATTING_ERROR 7×); validacija: tsc 0, eslint 0, 73/73 testov, build OK, E2E — 22× 200 SL + 22× 200 EN, jezikovni preklop obojesmeren, neznan slug 404, 0 konzolnih napak; produkcijski smoke po deployu: 44/44× 200, sitemap 733, canonical + hreflang identično things-to-do vzorcu, llms-full 330 destinacija-referenc živih; IndexNow: 44 novih URL-jev poslanih Bing (HTTP 200). **P0-VERIFIKACIJA + EN-FALLBACK FIX** `78a50b3` — uporabnikov P0-A/B/C val (produkcijska regresija / paralelni sitemap test / realni pilotni scenariji): P0-A veriga OK (strani/API/affiliate 8×302 pravilno bez IDjev/Neon migracije žive/praktična polja null na obstoječih vrsticah kot dokumentirano); P0-C ujel in popravlil pravi P4-8 hrošč — fallback pot itinererja je za EN uporabnike vračala mešanje jezikov (vreme EN, notes/taglines/tips/recommendations/rationale/packingList/dež-opomba SL — na produkciji, kjer je AI vedno fallback, je to videl VSak EN uporabnik): generateFallbackItinerary zdaj jezikovno zavedna (EN taglini iz DESTINATIONS_EN, EN recommendations/tips, EN dež-opomba), buildPackingList + buildFallbackRationale + refine fallback opozorilo + refine system/user prompt dobili EN različice (PARTY_PROMPT_LABELS.en), rain-tip v enrichWithRealWeather lokaliziran; SL izhodi bajtno nespremenjeni; validacija: tsc 0, eslint 0, 73/73, E2E s izklopljenim AI — EN fallback 100 % angleško (0 SL ostankov), SL identično, refine opozorila jezikovno pravilna; potrjeno ŽIVO na produkciji (source:fallback + EN besedila). KONFIGURACIJSKA VRZEL (ne koda, odločitev uporabnika): AI na produkciji nikoli delal — PUTER_AUTH_TOKEN ni nastavljen na Render, z-ai-web-dev-sdk pa bere .z-ai-config datoteko (interni baseUrl, nedosegljiv z Rendera) → vedno fallback (UI pošteno pokaže badge Predlog); opcija: PUTER_AUTH_TOKEN env na Render; P0-B: 733/733 URL × 200 zaporedno (konkurenca 3, p50 0,89 s) + link integrity 351/351 vseh 22 hubov + samotne regije (ljubljana/postojnska-jama/crnomelj) pogojene pravilno; obremenitvena občutljivost: 12-vzporedno na hladnem cache podre Render free instanco (502 → samodejno okrevanje ~1 min; prejšnji 689-test je bil na toplem cache — tveganje za indeksiranje zmerno, kronično lahko vodi v deindex; opcija: Render Starter za pilota); P1-B: tipkovnica OK (focus-visible na linkih/gumbovih, Enter aktivira), temni način = namerno light-only (defaultTheme=light, brez stikala). **PILOT-VALIDATION-GATE** `50a109c` (branch `pilot-validation`, 2026-09-14) — uporabnikovo naročilo »produktcijski regresijski audit«: Faza 1 zamrznitev (docs/PILOT-VALIDATION-GATE.md — SHA/deploymenti/pravilo nemira) + 5 obveznih testov proti Render produkciji: (1) URL audit 733/733 × 4 kroge (zaporedno/vzporedno 12 konk./2×/po premoru — prejšnjih 502 padcev NI več; 0 mrtvih linkov na 772 internih; 44/44 canonical/hreflang pravilni; 12× vzporedni API 0 Neon connection napak), (2) 10 realnih AI scenarijev (vsi 200, vremenska logika odlična, EN čist — edini ostanek events[].description SL), (3) geo validator (6 uporabnikovih pravil): 🔴 10 ERROR dni — fallback izbira po interesih BREZ geografskega grupiranja (najslabše 337 km/dan); (4) mobilna zlata pot 320–1280 px (CPTA/navigacija/dan/Prilagodi/Shrani/zemljevid delujejo; 🟡 FAB prekriva dnevni bar pri 320 px), (5) owner tok do moderacije (praktična polja/pending fail-closed/spremembe takoj vidne; admin moderacija potrebuje uporabnikovo geslo). Orodja: scripts/pilot-audit.ts, pilot-scenarios.ts, pilot-geo-validator.ts + rezultati v scripts/pilot-results/. **FAZA 4** (uporabnikovo naročilo »dodaj samo tri izboljšave, če jih testi upravičijo« — gate je potrdil stabilen osnovni tok; docs/PHASE-4-IMPROVEMENTS.md): (1) »Zakaj je to priporočeno?« — vsak postanek dobi razlago IZKLJUČNO iz dejstev (interesi bestFor∩vhod, tip skupine, haversine razdalja ×1,3 z odkritim opozorilom o daljših vožnjah, vremenska ustreznost tipa, sezona; ≤4 dejstva; SL+EN; AI-haluciniran ID → BREZ razlage + invalid_location dogodek) — src/lib/stop-insights.ts + enrich na obeh poteh in po refine-u, prikaz v plannerju in na /pot; (2) »Prilagodi ta dan« — 6 hitrih akcij (Manj vožnje/Primerno za dež/Počasnejši tempo/Več narave/Več hrane/Za družino) SKOZI obstoječi /api/itinerary/refine (opcijska action+day polja): AI pot kot NL ukaz, fallback pot DETERMINISTIČNO (src/lib/refine-actions.ts — čiste transformacije nad istim datasetom: nearest-neighbor preureditev + odstranitev outlierja >100 km, zamenjave zunanjih→notranjih, najšibkejšega→najboljšega po znački; spremembe poročane v changes[], budget preračunan; deluje tudi brez AI žetona — to je uporabnikovo orodje za samo-popravilo geo slabih dni iz Test 3); refiner zdaj dvojezičen (prej trdo SL tudi za EN); (3) »Preveri praktične podatke« — zložljiv blok na postanku SAMO z obstoječimi podatki (trajanje/okvirna cena/sezona/vremenska ustreznost/vir + posodobljeno 2026-09-13) + opozorilo »pred obiskom preveri urnike in cene«; BREZ generičnega Verified; pošteno popravljen noga /pot (prej »vsi kraji preverjeni« — utrjena trditev); (4) pilotna analitika: 19 dogodkov zlate poti (planner_started→submitted→result_rendered→day_adjusted/refined/stop_*/map_opened/provider_detail_opened/affiliate_clicked→itinerary_saved + neuspehi planner_error/empty_result/invalid_location/unrealistic_day/save_failed/refine_failed/user_abandoned_after_result) — src/lib/planner-analytics.ts + POST /api/analytics/event (strežniška whitelist, rate limit 60/min, AnalyticsEvent brez spremembe sheme, anonimni sessionId, brez PII; opustitev = 45 s brez navezave + pagehide keepalive); validacija: tsc 0, eslint 0, phase4-verify 9/9 lokalno, agent-browser 390 px (razlage/praktični/6 čipov/klik akcije/0 preliva), vseh 6 akcij deterministično s siljenim fallbackom (103 km → 0 km, Triglav→Piran, Slovenj Gradec→Postojnska jama). **VERCEL-BUILD** `5d14e18` — konec rdečega niza Vercel deploymentov (build je padal na tipovnih napakah orodij `scripts/*.ts` iz Pilot Validation Gate-a; orodja ostajajo v repu, sedaj tipovno čista). **P0-2 GEO-VALIDACIJA** `d0d7146` — geografsko/časovna validacijska plast nad itinerarji (odobrena rešitev za 🔴 Test 3 vrata: 10 ERROR dni, najslabše 337 km/dan): 6 pravil oceni vsak dan (skupna vožnja ERROR >240 km / WARN >160 km, najdaljša noga haversine ×1,3, časovni okvirji vs. trajanje, dež-neustreznost zunanjih dejavnosti, sezonskost, odstopanje od vprašane regije) na AI in fallback poti + po vsakem refine-u; UI značke !/⚠ na dnevnih karticah + razširljiv validacijski panel z razlogi (planner in /pot). **P0-RECENZIJA** `ce0b5d7` — dokazljiv krog validacija→refine→validacija + popolna sinhronizacija po spremembi (recenzentova zahteva: »deterministični fallback, ki spremeni dan, še ni isto kot validator, ki dokaže, da je novi dan izvedljiv«): `/api/itinerary/refine` vrača `validation {before → changes → after, status pass|warn|still_failing, statusNote}` iz ISTE plasti kot prikaz; budget/events/crowdNotices se preračunajo na dejanski novi strukturi (prej podedovani); zastarela deljiva povezava se ob spremembi umakne (javna `/pot/[shareId]` vedno identična urejeni različici); varovalke `cannot_safely_transform` (haluciniran ID → nič se ne ugiba, poštena opomba) + geo-zavedne zamenjave (kandidat ≤ 80 km od najbližjega postanka — prag poravnan z validatorjem); P1 po isti recenziji: razdalje v razlagah eksplicitno približek z opombo metode (cestni faktor 1,3 — ne navigacijski podatek), analitika `eid` + strežniška deduplikacija brez spremembe sheme + [docs/ANALYTICS-EVENTS.md](docs/ANALYTICS-EVENTS.md) (19 dogodkov z definicijami), `user_abandoned_after_result` → `result_session_ended_without_action` (nevtralna semantika proxy signala). **TAG-ALIGN** `b2ab42f` — neusklajenost oznak interesov (P1 po sledeh iste recenzije): uporabnikova izbira »Hrana & vino« je bila na deterministični (produkcijski!) poti TIHO IGNORIRANA — NLP parser in onboarding sta potiskala `kulinarika`, fallback ocenjevalnik pa išče `hrana` → skupna `normalizeInterests()` na strežniški meji (`/api/itinerary` AI+fallback, `/api/itinerary/refine`; aditivno — neznan ID ostane; dedupe), NLP parser pošilja kanonične vrednosti + ANGLEŠKE ključne besede (prej EN hero vpisi padli na privzete vrednosti — interesi/dnevi/ure/skupina/tip poti/sezona); produkcijski A/B dokaz: `interests ["kulinarika"]` ≡ `["hrana"]` → IDENTIČEN itinerer (piran/ljubljana/kobarid/lendava). **FAZA 5 (MINDTRIP-ANALIZA)** `76b65b5` — uporabnikovo naročilo »analiziraj kaj nam manjka glede MindTripa, kje se nahajamo glede najboljših, najdi druge, primerjaj, razvijaj, nadgrajuj«: web-raziskava (6 poizvedb; aitravel.tools recenzija 4.5/5, layla.ai tier list, voyaige.to 10 plannerjev, monkeytravel 7 plannerjev) + revizija lastne kode → [docs/COMPETITIVE-ANALYSIS-MINDTRIP.md](docs/COMPETITIVE-ANALYSIS-MINDTRIP.md) ( vodilni: geo-validacija z before/after dokazom, refine varovalke, data honesty — noben preizkušeni konkurent tega nima; vrzeli: map-first workspace, Start Anywhere, .ics, stroški vožnje) → 4 vrzeli zaprte v istem sprintu: **F5.1** zemljevid poti NA /nacrtuj ( trip-map-panel.tsx — barvne polyline po dnevih, oštevilčeni markerji znotraj dneva, interaktivna legenda dni, dvosmerna sinhronizacija marker↔kartica; prej zemljevid živel le na /zemljevid+/pot); **F5.2** koledarski izvoz .ics ( lib/ics-export.ts — RFC 5545 VEVENT iz postankov, SL/EN, iskrena opomba pri načrtih brez datuma; Blob download brez strežniškega klica); **F5.3** stroški vožnje gorivo+e-vinjeta ( lib/trip-costs.ts — DriveCosts v ItineraryQuality: km×6,5 l×1,60 €/l + vinjeta po dolžini 8,10/12,80/32,00/106,80 € [AMZS/DARS]; vse predpostavke in viri razkriti v »Kako smo izračunali«; vinjeta pogojna — le avtoceste; 0 km → brez vrstice); **F5.4** »Začni s povezavo« — MindTrip Start Anywhere po slovensko, DETERMINISTIČNO ( POST /api/itinerary/ingest + lib/url-ingest.ts: 22 destinacij × SL+EN sinónimi, diakritika-neobčutljivo, word-boundary [»socca« ne ujame Soče], naslov ×2 → predlog dni/interesov/preferredDestinations → samodejna generacija; zadetki s številkami prikazani PRED generiranjem; PlannerInput.preferredDestinations sanitiziran na meji, fallback pohitritev +2,5 [NE nad sezono/dežem], AI prompt vrstica; SSRF zaščita, 8 s timeout, 1 MB cap, 10/min rate limit; 0 zadetkov → 422 — nič izmišljevanja); +3 analitični dogodki ( ingest_url_attempted/ingest_url_success/ics_download — docs/ANALYTICS-EVENTS.md 22 total); validacija: tsc 0, eslint 0, phase4-verify 13/13 (Render), čisti testi 7/7, E2E ingest→chips→generacija→map filter→marker ring→ICS toast→390 px 0 preliv; odloženo s pisno utemeljitvijo v analizi: živi ceni ( partner API), odpiralni časi ( OSM vir → past lažnih trditev), PWA, community; znana peskovniška ChunkLoadError limitacija ob dolgih E2E sejah dokumentirana ( okoljska, baseline enak — Task 7/8). **F5.5 ODPIRALNI ČASI** `cc3441e` + `fb17950` — naslednja zmaga po analizi ( roadmap item 1): odpiralni časi v validacijski plasti — MindTrip »Louvre je zaprt ob torkih« pariteta po naših pravilih poštenosti: Destination.opening ( opcijsko, SAMO 5 preverjenih vnosov z uradnimi viri: Vintgar nov–mar zaprta [vintgar.si] → ERROR na ravni destinacije; Ptujski grad ob ponedeljkih zaprt [pmpo.si] → WARN; Postojna/Kobarid/Celje odprti vsak dan; Piran muzej preskočen — samo sekundarni vir) + geo-validacija pravili closed_month/closed_weekday ( SAMO z znanim datumom odhoda — brez datuma NE trdimo ničesar; vir VEDNO v sporočilu; SL+EN) + fallback preventiva ( deterministično izloči mesečno zaprte iz bazena — dokaz: december + preferred vintgar → izostane) + AI pravilo in varnostna mreža ( dokaz: AI kljub pravilu razporedil Vintgar decembra → validator javil ERROR s virom) + StopInsights vrstica z virom + dnevna značka tudi pri km=0; validacija: čisti testi 9/9, produkcija UI dokaz prek ?odpri= ( panel + »!« + praktični podatki), 0 napak, 390 px. **F5.6 CESTNI ROUTING ( OSRM)** — roadmap item 2 analize: realne cestne razdalje/časi/geometrija iz javnega OSRM ( OpenStreetMap) v VSEH plasteh ( kvaliteta, geo-validacija, stroški goriva/vinjete, razlage postankov) + zemljevid poti na /nacrtuj zdaj riše PRAVE CESTE ( polna črta; črtkana premica samo fallback); razkritje metode povsod ( osrm/heuristic/mixed — geoValidation.method, quality.routingMethod, besedila SL+EN); predpomnilnik 24 h na par točk ( 462 parov matrike se napolni enkrat), timeout 2,5 s, varovalka, VEDNO fail-open na staro hevristiko — nikoli izjema; odkrito z meritvami: hevristika je lagala v OBEH smerih ( LJ→Piran 133→85 min lažnega časa na avtocesti; Postojna→Črnomelj 105→155 km skritih kilometrov v gorah — pred/po dokaz scripts/road-routing-before-after.ts); validacija: 21 čistih + 8 živih OSRM testov, faza 4 regresija 9/9, VLM potrditev realnih cest, 390 px 0 preliv.; **F8** `1bd4b7e` — Začni s sliko: VLM prebere fotografijo/screenshot → prepoznane destinacije → načrt (determinizem izbire ostaja); **F9** `9449eef` — Pogovor z načrtom: Q&A nad IZRAČUNANIMI dejstvi (razdalje/časi/stroški), AI le frazira, iskreni »ne ugibam« odgovori; **F10** `468642a`+`e5b3797` — produkcjska AI plast: veriga Gemini → Puter → z-ai-sdk + reasoning_effort proračuni; **1.14.0** `d61880e` — OpenRouter kot PRIMARNI AI provider + scripts/ops avtomatizacijska suite; **F11** `d0d227a` — skupinske ankete BREZ računov na deljeni poti (anonimna localStorage identiteta, strežniško štetje glasov; migracijski popravki `4d0ba47`/`21c9025`/`6b1fc55`); **F12** `06ea2df` — skupinski potni dnevnik BREZ računov (vnosi z dnem/oceno/besedilom, ureja samo avtor, tisk = fotoknjiga) + raziskovalna sinteza Mindtrip+forumi `430bcfe` (backlog 8 idej); **F13** `5c17a71` — »Preveri svoj načrt«: deterministični validator TUJIH načrtov (paste iz ChatGPTja/Mindtripa → opozorila, 0 AI žetonov, 10 geo pravil); **F14** `460401b` — uvoz Google Maps shranjenih točk BREZ računov (ime+koordinate, deterministično) + analiza vrzeli vs Mindtrip (sekcije 24–26); **F15** `4c0a8b4` — tempo potovanja (Počasi/Umerjeno/Hitro) v načrtovalniku (backlog #3, Reddit ×2 pritožba); **F16** `62e1e41` — optimalno zaporedje dneva: 2-opt gumb na kartici dneva (0 AI, prihranek km se ponudi SAMO nad pragom 5 km / 5 %); **F17** `dcfb215` — javna telemetrija validatorja: sekcija »Koliko napak ujame naš preverjevalnik« z živimi številkami (strežniški dogodki + 60 s cache) in javnimi študijami (MEM/BBC/Tow); **AI protokol** `abaee88`+`86be72b`+`7158510` — navodila agentu (read-first, 11 korakov) + smer UI načrtovalnika (Mindtrip-style delovna površina, NE kopija)
> - **Koda:** `main` = glej git log (1.21.0 — F17 javna telemetrija validatorja). CI ✅ (Build + Lint/TypeCheck). Kateri commit je v produkciji, preveriš s smoke skripto (točka 8).
> - **Produkcija:** stanje preveri dinamično — `bash scripts/verify/production-smoke.sh` (P8/FW2 markerji, anti-enumeracija, cron fail-closed ×6, Vercel commit status). ✅ Kvota `api-deployments-free-per-day` (zastala pri `8f419eb`, 2026-09-11) se je sprostila 2026-09-12 — vsi nadaljnji deployi zeleni (nazadnje `b2ab42f` / 1.7.2: Vercel READY + alias, Render avtomatsko iz `main`); runbook za primer naslednjega okna: [spodaj](#deploy-po-rate-limit-okni-p9).
> - **Po deployu obvezno:** [produkcjski smoke](#produkcjski-smoke-p9--po-deployu) — `bash scripts/verify/production-smoke.sh` (varni GET preverki + markerji) + ročni brskalniški tokovi + funkcionalni pregled mobilnih tokov na 390 px.
> - **Zavedno odloženo (pred javnim launchem, NI pilot blocker):** rate limiting je per-instance → pred javnim prometom centralizirani limiter (npr. Upstash); `requireOwnership()` admin bypass dokumentiran v kodi (0 klicalcev — past za prihodnji razvoj, ne ranljivost); realni Stripe Checkout za rezervacije šele po poslovni odločitvi po pilotu (zdaj namerno fail-closed 501 v produkciji).
> - **F7** (roadmap item 5 konkurenčne analize — skupnostni vodniki) — **Avtorski vodnik na deljeni poti BREZ računa**: ob shranjevanju pot dobi lastnik tajni editToken (v DB samo SHA-256 hash; živi v localStorage njegovega brskalnika) → na /pot/{shareId} vpiše vodnik: "zakaj ta pot", do 6 nasvetov vezanih na dneve in **"kaj bi storil drugače"** (korektivni verdikt — naš poštenostni diferencator, noben tekmec ne zbere popotnih popravkov). Vodnik se prikaže vsem obiskovalcem (SSR, natisne se z načrtom), galerija skupnosti ga označi z badge-om "Vodnik". Analitika `guide_saved` meri `has_verdict` (koliko skupnosti izraža diferencator). Stran /pot je bila ob tem utrjena (itinerarji brez `recommendations` ne sesedejo več) — 1.10.0, CHANGELOG + COMPETITIVE-ANALYSIS-MINDTRIP.md sekcija 11.
> - **F6.1 + F6.2** (uporabnikovo naročilo "odlično nadaljuj — pushaj sinhroniziraj github in nadaljuj" — Faza 6 po sveži konkurenčni raziskavi sept 2026) — **Pameten pakirni seznam** (vsak predmet z razlogom iz dnevne napovedi + dejanskih postankov: "Dan 3: dež v napovedi", "Postojnska jama → topla plast"; razkrita metoda forecast/season; odkljuki persistirani čez reload in jezik — useSyncExternalStore) in **proračunski panel** (stroški IZ načrta: atrakcije + gorivo + vinjeta, razdelitev na osebo 1–12, osebni cilj z iskrenim "česar NE vključuje: nočitev/hrana"; SL+EN, deluje tudi za stare shranjene načrte) — 1.9.0, CHANGELOG + COMPETITIVE-ANALYSIS-MINDTRIP.md sekciji 8–10.
> - **F5.7** (uporabnikovo naročilo "odlično nadaljuj … primerjaj razvijaj nadgrajuj" — roadmap item 3 analize MindTrip) — **PWA: načrti brez povezave** (SW v2: štirje namenski cache-i z LRU; offline.html izriše shranjene načrte BREZ strežnika; offline zemljevid poti — OSM tile-i; namestitveni gumb + iOS navodila; badge/toast-i za povezavo; manifest id + screenshots za Chrome "richer install UI"; ogrevanje predpomnilnika ob shranjevanju z iskrenim views štetjem (?warm=1); 36/36 testov strategij + E2E; analitika pwa_install_prompted/accepted) — 1.8.3.

---

## 📋 Kazalo

- [Pregled](#pregled)
- [Ključne funkcionalnosti](#ključne-funkcionalnosti)
- [Varnostne plasti (P3)](#varnostne-plasti-p3)
- [Tehnični stack](#tehnični-stack)
- [Arhitektura](#arhitektura)
- [Hitri začetek](#hitri-začetek)
- [Poslovni model](#poslovni-model)
- [Provizijski obračun](#provizijski-obračun)
- [Approval in overitveni workflow](#approval-in-overitveni-workflow)
- [Partner Quality Score](#partner-quality-score)
- [Cron opravila](#cron-opravila)
- [Namestitev](#namestitev)
- [Dokumentacija](#dokumentacija)
- [Konfiguracija](#konfiguracija)

---

## Pregled

**Discover Slovenia AI** je celovita AI-poganjana turistična platforma za Slovenijo. Združuje AI načrtovalca potovanj z multi-turn pogovorom, naravnojezikovno iskanje, interaktivni zemljevid s tisočimi POI, tržnico lokalnih izdelkov in izkušenj, B2C račune popotnikov z deljenimi potovanji ter B2B portale za ponudnike in administratorje.

Platforma rešuje **3 ključne probleme**:

1. **Za turiste** — AI generira personalizirane itinererje v sekundah, brezplačno načrtovanje, direktni in AI-kanal rezervaciji
2. **Za lokalne ponudnike** — self-service portal z onboarding čarovnikom, 0 % provizije na direktnih rezervacijah (glej [konkurenčno analizo](docs/COMPETITIVE-ANALYSIS.md))
3. **Za Slovenijo** — med prvimi platformami, ki povezujejo AI + lokalno + državno-specifično s preverjeno partnersko mrežo

---

## Ključne funkcionalnosti

### 🤖 AI funkcionalnosti

| Funkcija | Opis |
|----------|------|
| **AI Itinerer** | Generira dnevne načrte potovanj (GLM prek Puter API), multi-turn izboljšave |
| **AI Chatbot** | Lebdeči asistent z dostopom do baze (destinacije, lokalci, izdelki, izkušnje) |
| **Naravno-jezikovno iskanje** | "miren vikend ob reki" → AI razume in vrne rezultate |
| **AI Priporočila** | Model izbere 4 najbolj smiselne izdelke/izkušnje (24h cache) |
| **AI POI opisi** | Generira opise za POI iz OpenStreetMap (trajni cache) |
| **AI Auto-tagging** | Lastnik vnese opis → AI predlaga kategorijo + atribute + tagi |
| **AI Vpogledi** | Analiza statistike z actionable insights za owner/admin dashboard |
| **AI SEO FAQ** | Generira FAQ za Google rich snippets (90-dnevni cache) |
| **AI Konzultacije** | Freemium globoke konzultacije z atribucijo rezervacij (30 dni); priporočeni partnerji kot vizualne place cards (slika, ocena, cena, CTA) |

**AI fallback veriga:** Puter → z-ai-web-dev-sdk → rule-based (nikoli 500). AI uporablja **izključno `published`** vsebine, podatki ponudnikov so zajeti v injection-safe ovojnico (`SYSTEM_DATA_GUARD`).

### 🗓️ Načrtovalnik potovanj (delovna površina po vzoru Mindtrip, brez računov)

- **Start kjerkoli**: naravni jezik (hero), povezava do objave, fotografija/screenshot (VLM, F8) ali Google Maps shranjene točke (F14) → načrt
- **Pogovor z načrtom** (F9): odgovori iz IZRAČUNANIH dejstev — AI le frazira, nikoli ne ugiba
- **Deterministična validacija**: OSRM realne cestne razdalje/časi/geometrija (F5.6), odpralni časi z viri (F5.5), cik-cak dnevi, duplikati, km opozorila
- **Preveri svoj načrt** (F13): prilepi tuj načrt (ChatGPT/Mindtrip) → 10 pravil, 0 AI žetonov; **javna telemetrija** (F17): »Koliko napak ujame naš preverjevalnik« z živimi številkami
- **Optimalno zaporedje dneva** (F16): 2-opt gumb — prihranek km se pokaže samo nad pragu, nikoli izmišljen
- **Tempo potovanja** (F15): Počasi / Umerjeno / Hitro vpliva na gostoto dneva
- **Skupinska plast brez računov**: ankete (F11) + potni dnevnik (F12) na deljeni poti (tisk dnevnika = fotoknjiga)
- PWA offline načrti (F5.7), pameten pakirni seznam z razlogi (F6.1), proračun na osebo (F6.2), ICS/deljenje/QR

### 🧭 B2C plast (Faza P1–P2)

- **Računi popotnikov** (email verifikacija + reset gesla z razveljavitvijo sej)
- **Moja potovanja** — shranjevanje, dnevni push opomniki, PDF izvoz, pakirni seznam + **moja naročila/rezervacije** (lokalno sledenje + javni lookup)
- **Priljubljene (wishlist)** — srčki na karticah tržnice in modalih, localStorage, hitri dostop iz navigacije
- **Persistenca AI chata** — zgodovina pogovora preživi refresh (lokalno, FIFO 40, gumb »Počisti pogovor«)
- **Socialna plast** — javna galerija deljenih potovanj, glasovanje, komentarji, všečki, **QR koda deljene poti** (naslovni vnos → QR + tisk)
- **30-dnevna atribucija** — konzultacija → rezervacija (strežniško overjena)
- **A/B testiranje naročnine** z anonimno analitiko

### 🏪 Tržnica

- **Lokalni partnerji** (hoteli, restavracije, aktivnosti) s strežniško moderiranimi profili
- **Izdelki** (kulinarika, vino, med, olje, obrt, spominki)
- **Izkušnje** (turi, degustacije, avanture, wellness) z realnimi rezervacijami
- **Zbirke** za navigacijo (zimske, poletne, romantične, družinske, …)
- Celozaslonski lightbox galerij (izkušnje/izdelki: tipkovnica, števec, thumbnail list)
- Nakupni proces tržnice + košarica + Stripe checkout

### 🗺️ Zemljevid

- 22 destinacijskih markerjev, Leaflet + OpenStreetMap
- Tisoči POI (Overpass API) + Wikipedia in AI opisi
- Vremenska napoved (Open-Meteo) v načrtu potovanj

### 🏢 B2B portali

**Owner Dashboard:**
- **Onboarding čarovnik** (5 korakov; minimalna zahteva je 1 profilna fotografija, več je priporočeno)
- Moji lokalci / Izdelki / Izkušnje (CRUD + AI auto-tag + status moderacije)
- Rezervacije (strežniško validirane, zaključek, prihodek)
- Naročnina (Stripe + paketi, vrata: email verifikacija)
- **Sponzorstva** (Moja sponzorstva + nakupni tok; demo: takojšnja aktivacija, Stripe: redirect)
- Statistika (views, clicks, AI priporočila, ROI, vrednost AI kanala)
- **Provizije** (predogled meseca, izdaja računov, PDF, kartično plačilo)

**Admin Dashboard:**
- **Moderacijska vrsta** — lokalci, izdelki in izkušnje v eni pending seznamu z oznako tipa
- Overitev "Preverjen partner" — eksplicitna admin odločitev (approve znak NE podeli)
- Leadi (homepage B2B prijave — shranjeni v PostgreSQL)
- Statistika / Analytics (MRR, churn, LTV, AI usage) / Indeksacija (SEO)

### 👥 Skupnost

- **"Vprašaj lokalca"** — grounded AI Q&A nad bazo (javna vprašanja = social proof + SEO)
- **UGC recenzije in javna galerija** skupnosti
- Web push obvestila (VAPID) + dnevni opomniki

---

## Varnostne plasti (P3)

Trije neodvisni auditi (auth/authz, booking/Stripe, AI/data) → utrjevanje v 49 datotekah:

| Plast | Mehanizem |
|-------|-----------|
| **Seje** | Razveljavitveni `tokenVersion` ob resetu gesla (stara seja umre v ≤ 60 s) |
| **IDOR/BOLA** | 20/20 lastniških dostopov blokiranih (živo testirano) |
| **Moderacija** | VSE vsebine skozi pending → approve/reject; **re-moderacija** ob spremembi published vsebine |
| **Booking integriteta** | Cena/meje/dedup strežniško; duplikat 409; 48-bit številke rezervacij |
| **Stripe webhook** | Podpis + `ProcessedStripeEvent` dedup (replay-safe) + amount/payment_status verifikacija |
| **Prompt injection** | Podatki ponudnikov v ovojnici, navodila sistemu izven konteksta |
| **Admin** | Timing-safe primerjava gesla na vseh rutah, rate limit |
| **Javne rute** | Izključno `published` vsebine (pending ≠ javen) |
| **Rate limiting** | Prijava, registracija, track, verify, A/B eventi |

---

## Tehnični stack

| Plast | Tehnologija |
|-------|------------|
| Framework | Next.js 16 (App Router, RSC + API Routes) |
| Jezik | TypeScript 5 (strict) |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) + Framer Motion |
| Database | Prisma 6 + PostgreSQL — **Neon** (produkcija in razvoj; Docker alternativa: SQLite v volumenu) |
| Auth | NextAuth.js v4 (credentials, JWT seje, tokenVersion invalidacija) |
| AI | GLM prek Puter API + z-ai-web-dev-sdk fallback |
| Maps | Leaflet + OpenStreetMap Overpass API |
| i18n | next-intl — javno **samo sl** (celoviti prevodi = roadmap C5); infrastruktura pripravljena |
| Email | Nodemailer (demo fallback: console.log) |
| Payments | Stripe (naročnine + provizijski računi; demo mode brez ključev) |
| Deploy | Render (primarni) + Vercel (sekundarni) — avtomatski deploy iz `main` |

---

## Arhitektura

```
Browser → Vercel Edge CDN → Next.js 16 (RSC + API Routes)
                                ├── Neon PostgreSQL (Prisma, pooler)
                                ├── Puter API (GLM AI)
                                ├── OpenStreetMap (POI)
                                ├── Open-Meteo (Weather)
                                ├── Stripe (Payments + webhooks)
                                └── SMTP (Email)
```

**Podatkovni model (25 modelov):** User, Owner, SavedItinerary, TripVote, TripComment, TripLike, Listing, ListingEvent, Product, Experience, Review, Order, Booking, Sponsorship, PageView, AnalyticsEvent, AIUsageLog, AuditLog, LocalQuestion, ProcessedStripeEvent, Consultation, PushSubscription, CommissionInvoice, Lead, NewsletterSubscriber.

---

## Hitri začetek

```bash
# 1. Namesti odvisnosti
bun install

# 2. Nastavi okolje
cp .env.example .env
# Uredi .env — OBVEZNO: DATABASE_URL (PostgreSQL, npr. brezplačni Neon),
# ADMIN_PASSWORD, NEXTAUTH_SECRET (shema je postgresql — SQLite URL ne deluje)

# 3. Postavi bazo (prisma db push + generate)
bun run db:push

# 4. (opcija) demo podatki — partnerji, listingi, izkušnje,
#    izdelki, rezervacije in provizijski račun (idempotentno)
bun run db:seed:demo

# 5. Zaženi dev strežnik
bun run dev

# 6. Odpri http://localhost:3000
```

### Testni računi (demo seed — SAMO lokalna SQLite)

| Vloga | Email | Geslo |
|-------|-------|-------|
| Owner — free partner, provizija 12 % | tina@demo.discoverslovenia.si | demo1234 |
| Owner — premium partner, provizija 0 % | marko@demo.discoverslovenia.si | demo1234 |

Fiksni gesli veljata **izključno** ob lokalu seedu SQLite z `DEV_FIXED_DEMO_PASSWORDS=1` (privzeto seed ustvari naključna gesla; proti remote/postgres bazi se gesla NE izpišejo).

Admin dostop do portala `/admin` poteka prek `ADMIN_PASSWORD` env (ne prek NextAuth računa).

> ⚠️ **Status demo računov (P7-A, 2026-09-11):**
> - Demo seed se na Vercelu NE izvede (build skripta se izklopi pri postgresql shemi).
> - V produkcijski bazi (Neon) so bili demo računi **upokojeni**: `admin@demo` (super_admin) je **izbrisan**; ana/marko/tina/luka imajo **rotirana naključna gesla** + razveljavljene seje. Vsa nekaj javno dokumentirana gesla (`demo1234`, `admin-demo-2026`) na produkciji **ne delujejo več** (preverjeno: 401).
> - Vsebina (lokalci, izdelki, izkušnje) ostaja vidna — upokojeni računi so inertni lastniki demo vsebine, ki je jasno označena (žive številke se prikazujejo dinamično iz baze, `/za-ponudnike`).

---

## Poslovni model

> **Primarni model:** provizija — kot pri Booking.com, a poštenejše.
> Turist plača polno ceno neposredno ponudniku; platforma obračuna provizijo
> **IZKLJUČNO za rezervacije iz AI kanala** (`Booking.source = "consultation"`).
> **Direktne rezervacije so brez provizije** (0 %) — ključna konkurenčna prednost.

### B2C (brezplačno)

Uporabnik nikoli ne plača: AI itinerer, chatbot, "Vprašaj lokalca", iskanje.
Plačljive so le globoke konzultacije (freemium nadgradnja).

### B2B (provizijski model — primarni)

| Partner | Provizija na AI-rezervacije | Naročnina |
|---------|---------------------------|-----------|
| Free | **12 %** | €0 |
| Premium | **0 %** | €149/mes |
| Enterprise | **0 %** | €499/mes |

- Znesek strežniško izračunan iz atribuiranih rezervacij (snapshot stopnje ob izdaji)
- Samodejni mesečni obračun (cron) + e-poštni račun + PDF + kartično plačilo
- Tedensko poročilo "Vrednost AI kanala"

### Beta

Vsi paketi brezplačni do 30 lokalov, nato 30-dnevni grace period.

### Affiliate

Booking.com, DiscoverCars, Viator, Skyscanner.

---

## Provizijski obračun

```
AI konzultacija → rezervacija (source=consultation) → atribucija izkušnji
   → mesečni cron (1. v mesecu) → CommissionInvoice (INV-YYYYMM-XXXXXX)
   → e-poštni račun + dashboard → plačilo (Stripe Checkout / SEPA)
   → status: issued → paid + potrdilo
```

| Komponenta | Tehnologija |
|------------|-------------|
| Izdaja (ročna + cron) | `src/lib/commissions.ts` (idempotentna, snapshot stopnje) |
| API | `/api/owner/commissions` (GET predogled, POST `generate`/`mark_paid`) |
| Samodejni obračun | cron `/api/cron/commission-invoices` (1. v mesecu) |
| PDF račun | `/api/owner/commissions/invoice-pdf` (pdf-lib) |
| Kartično plačilo | `/api/owner/commissions/checkout` + Stripe webhook (dedup + amount check) |
| Audit | `COMMISSION_INVOICE_ISSUED` / `COMMISSION_INVOICE_PAID` |

---

## Approval in overitveni workflow

```
DRAFT → PENDING → APPROVED → PUBLISHED → ARCHIVED
                 ↓
              REJECTED (s strukturiranim razlogom)
```

- Novi lokalci/izdelki/izkušnje začnejo kot `draft` → lastnik odda → `pending` → admin odobri → `published`
- **Re-moderacija:** sprememba objavljene vsebine → nazaj v `pending` (javno skrito do ponovne odobritve)
- AI in javne rute uporabljajo SAMO `published` vsebine

### Znak "Preverjen partner"

Eksplicitna, ločena admin odločitev — **odobritev (approve) znaka NE podeli**.
Admin ga podeli/odvzame z gumbom Overi (BadgeCheck) v Lokali tabu, z audit sledjo
(`LISTING_VERIFIED` / `LISTING_UNVERIFIED`). Znak pomeni: "podatke je preverila ekipa platforme".

### Lead obrazec (B2B lijak)

Homepage prijava ponudnika → model `Lead` (PostgreSQL) → admin Leadi tab
(statusi: nov → kontaktiran → zaključen).

---

## Partner Quality Score (0–100)

| Signal | Utež | Kaj meri |
|--------|------|---------|
| Profile completion | 30 | 13 polj z utežmi |
| Image quality | 15 | Število slik (0–5+) |
| Description quality | 15 | Kratek + dolgi opis |
| AI tags | 10 | Specialitete/tagi |
| Admin verification | 10 | verifiedByAdmin |
| Rating | 10 | Uporabniške ocene |
| Data freshness | 10 | Čas od zadnje posodobitve |

**Featured auto-qualification:** Premium + Q>90 + Verified → Featured.

**AI Ranking Engine:** Relevance 60 % / Quality 15 % / Rating 10 % / Distance 10 % / Premium boost max 5 % — konfigurabilno prek env, transparency labels ob vsakem priporočilu.

---

## Cron opravila

| Urnik (UTC) | Končna točka | Opis |
|---|---|---|
| `0 6 * * *` | `/api/cron/daily-trip-push` | dnevni push opomniki potovanj |
| `0 7 * * *` | `/api/cron/recalculate-status` | preračun statusov |
| `0 8 1 * *` | `/api/cron/commission-invoices` | mesečni obračun provizij |
| `0 8 * * 1` | `/api/cron/weekly-alerts` | tedensko B2B poročilo |
| `0 9 * * *` | `/api/cron/renewal-reminders` | opomniki obnov naročnin |
| `0 10 * * *` | `/api/cron/draft-reminders` | nudge osnutkov (optimistična ključavnica) |

Vsak klic je Bearer zaščiten s `CRON_SECRET` (brez njega 401 — fail-closed).

---

## Namestitev

### Render (primarna produkcija) + Vercel (sekundarna)

- **Render:** push na `main` sproži avtomatski deploy → `i-feel-slovenia.onrender.com` (~4 min, Docker). Primarni produkcijski URL od 2026-09-12 (MONET valovi).
- **Vercel:** push na `main` sproži avtomatski deploy → `i-feel-slovenia.vercel.app` (Hobby kvota deploymentov — glej runbook spodaj)
- Build: `bun install` + `bun run build` (prisma generate v postinstall)
- **Baza: Neon PostgreSQL** (pooler, `connection_limit=1`) — `DATABASE_URL` env
- CI (GitHub Actions): Lint & Type Check + Build proti `postgres:16-alpine` service containerju (P4-7)
- Zastarel demo-SQLITE mehanizem (Faza 4e) se samodejno izklopi pri postgresql shemi — glej docs/DEPLOYMENT.md razdelek 6
- Cron: `vercel.json` (Vercel Cron kliče 6 GET rut — secret prek `Authorization: Bearer <CRON_SECRET>`)

#### Deploy po rate-limit okni (P9)

Hobby račun ima dnevno kvoto deploymentov — `api-deployments-free-per-day` (100 na rolling 24 h). Ko je kvota porabljena, Vercel zavrne ustvarjanje deploymenta: commit status na GitHubu → *failure* (URL vsebuje `upgradeToPro=build-rate-limit`), prek API `payment_required`. Zavrnjen poskus **ne** ustvari deployment objekta (nič ne stane, varno za ponovne poskuse).

**Dogodek 2026-09-11 17:50 UTC (push FW2 `8f419eb`):** kvota 100/100, 0 ostaja. API navaja reset **2026-09-12 17:54:28 UTC (19:54:28 CEST)**; ker je okno rolling in je bil zadnji visible deployment ustvarjen 2026-09-10 20:41 UTC, se kvota lahko sprosti tudi prej — preverjaj z brezplačnim poskusom (točka 1).

1. Počakaj konec okna; preverjaj z zavrnjenim poskusom: `POST /v13/deployments` (zavrnitev = brezplačna, nič ne ustvari; odgovor vsebuje točen `limit.reset`).
2. **Pot A (brez praznega commita):** API deployment iz Git vira: `POST https://api.vercel.com/v13/deployments` s telesom `{"name":"i-feel-slovenia","gitSource":{"type":"github","repoId":<repoId>,"ref":"main"},"target":"production"}` (enakovredno dashboard »Deploy«; zgradi trenutni `main` HEAD).
3. **Pot B:** push kakršnega koli commita na `main` (Git integracija samodejno sproži nov deployment).
4. ⚠️ **NE** izberi »Redeploy« na starem (npr. `d2e371c`) deploymentu — namestil bi STARO kodo; rate-limited zavrnitev namreč ne pusti deployment objekta za redeploy.
5. Preveri uspeh: GitHub commit status (kontekst »Vercel« = ✓ success na zadnjem SHA) **ali** `bash scripts/verify/production-smoke.sh` (točka 8 skripte).

#### Produkcjski smoke (P9 — po deployu)

Avtomatizirani del (varen, brez DB pisanja):

```bash
bash scripts/verify/production-smoke.sh
# opciono (PIŠE v DB — počisti s scripts/db/p9-smoke-cleanup.ts):
SMOKE_BOOKING=1 SMOKE_NEWSLETTER=1 CRON_SECRET=<pravi> bash scripts/verify/production-smoke.sh
```

Celoten checklist (16 točk):

| # | Točka | Kako |
|---|-------|------|
| 1 | homepage | skripta (200 + P8 responsive markerji) |
| 2 | destinacija/detail | skripta (`/destinacija/bled/things-to-do`) |
| 3 | marketplace | skripta (`/za-ponudnike`, `/api/experiences` published-only) |
| 4 | experience detail | ročno (kartica izkušnje na homepage) |
| 5 | booking od začetka do konca | ročno UI **ali** `SMOKE_BOOKING=1` (ustvari + 409 dedup dokaz) |
| 6 | booking lookup | skripta (anti-enumeracija 404) + ročno z pravo številko |
| 7 | login/logout | ročno |
| 8 | owner login | ročno |
| 9 | owner CRUD osnovnega zapisa | ročno (draft → submit) |
| 10 | newsletter | `SMOKE_NEWSLETTER=1` ali ročno |
| 11 | consultation → recommendation → atribucija | ročno (preveri `source=consultation`) |
| 12 | admin authentication | ročno (`/admin` + `ADMIN_PASSWORD`) |
| 13 | 6 cron endpointov z napačnim/pravilnim secretom | skripta (napačen = 401 ×6; pravi = `CRON_SECRET=…`, idempotentno) |
| 14 | AI endpointi + rate limit | skripta (`/api/ai-health` 200; `SMOKE_RATE_LIMIT=1` za 429 — glej opombo o per-instance) |
| 15 | mobilni 390 px | ročno — **funkcionalno**, ne le vizualno |
| 16 | production kaže zadnji `main` | skripta (GitHub Vercel commit status + markerji) |

> Če je vse zeleno → **zamrznjeni repozitorij za pilot**.

### Docker Compose (alternativa — ZASTARELO)

> ⚠️ Docker pot (Pot A) je bila zasnovana v SQLite eri — shema je od Faze 4f `postgresql`, zato SQLite volumen v teh skriptah ne ustreza več. Primarna podprta pot je **Vercel + Neon** (zgoraj); Docker pot osveži ob potrebi po lastnem Postgres vsebniku.

```bash
cp .env.example .env.docker   # izpolni skrivnosti (PostgreSQL URL!)
docker compose up -d --build  # app + cron vsebnik
```

Celoten postopek in odločitvena analiza: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

---

## Dokumentacija

| Dokument | Vsebina |
|----------|---------|
| [PRODUCT-BLUEPRINT.md](PRODUCT-BLUEPRINT.md) | Strateški dokument (FROZEN v1.0) |
| [TECHNICAL-SPECIFICATION.md](TECHNICAL-SPECIFICATION.md) | Implementacijska specifikacija |
| [docs/PILOT-TEST-PROTOCOL.md](docs/PILOT-TEST-PROTOCOL.md) | **Pilot protokol — 10 realnih ponudnikov (go/no-go, checklist)** |
| [docs/PILOT-VALIDATION-GATE.md](docs/PILOT-VALIDATION-GATE.md) | **Pilot Validation Gate — zamrznitev + 5 testov produkcije (rezultati + vrata)** |
| [docs/PHASE-4-IMPROVEMENTS.md](docs/PHASE-4-IMPROVEMENTS.md) | **Faza 4 — tri izboljšave (razlage/ hitre akcije/ praktični podatki) + pilotna analitika** |
| [docs/ANALYTICS-EVENTS.md](docs/ANALYTICS-EVENTS.md) | **Analitika zlate poti — 22 dogodkov (definicije, props, metrike, dedup; F5: ingest/ics)** |
| [docs/COMPETITIVE-ANALYSIS.md](docs/COMPETITIVE-ANALYSIS.md) | **Konkurenčna analiza (GYG/Viator/Withlocals/Kimkim/Bókun/Layla)** |
| [docs/COMPETITIVE-ANALYSIS-MINDTRIP.md](docs/COMPETITIVE-ANALYSIS-MINDTRIP.md) | **Faza 5 analiza vs MindTrip (viri, vrzeli, roadmap, kje smo vodilni)** |
| [docs/OUTREACH-TOOLKIT.md](docs/OUTREACH-TOOLKIT.md) | Snovanje/pristopni e-maili za partnerje |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Produkcijska namestitev |
| [CHANGELOG.md](CHANGELOG.md) | Zgodovina verzij |
| [docs/ADR.md](docs/ADR.md) | Architecture Decision Records |
| [docs/RISK-REGISTER.md](docs/RISK-REGISTER.md) | Tveganja z mitigacijo |
| [docs/DATA-FLOW.md](docs/DATA-FLOW.md) | Tok podatkov |
| [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md) | Varnostni pregled |
| [docs/ACCESSIBILITY-REVIEW.md](docs/ACCESSIBILITY-REVIEW.md) | WCAG 2.1 AA |
| [docs/OBSERVABILITY-PLAN.md](docs/OBSERVABILITY-PLAN.md) | Monitoring in alerting |
| [docs/MIGRATION-STRATEGY.md](docs/MIGRATION-STRATEGY.md) | Varne DB migracije |
| [docs/SEED-STRATEGY.md](docs/SEED-STRATEGY.md) | Dev/demo/prod seed |
| [docs/FEATURE-FLAGS.md](docs/FEATURE-FLAGS.md) | Postopni vklop funkcij |
| [docs/BACKUP-RECOVERY.md](docs/BACKUP-RECOVERY.md) | Backup in recovery |
| [docs/INCIDENT-PLAYBOOK.md](docs/INCIDENT-PLAYBOOK.md) | Kaj narediti ko X odpove |
| [docs/VERSIONING.md](docs/VERSIONING.md) | Verzioniranje |

---

## Konfiguracija

### Environment variables

```bash
# Database — PostgreSQL (shema je postgresql; SQLite URL NE deluje)
# Brezplačna možnost: https://neon.tech → npr.:
DATABASE_URL=postgresql://user:pass@ep-xxxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=1
# (Vrednost s & mora biti v .env v narekovajih, če jo Source-aš v bash!)

# Auth
ADMIN_PASSWORD=CHANGE_ME_TO_RANDOM_32_CHAR_STRING
ADMIN_EMAIL=admin@discoverslovenia.ai
NEXTAUTH_SECRET=GENERIRAJ_RANDOM_SECRET
NEXTAUTH_URL=http://localhost:3000

# Cron (OBVEZNO v produkciji — fail-closed 401 brez njega)
CRON_SECRET=GENERIRAJ_RANDOM_SECRET

# AI (Puter — free tier)
PUTER_AUTH_TOKEN=your-token
PUTER_BASE_URL=https://api.puter.com/puterai/openai/v1/
PUTER_MODEL=z-ai/glm-5.1

# Stripe (optional — demo mode brez ključev)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PREMIUM_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...

# Email (optional — console.log fallback)
SMTP_HOST=localhost
SMTP_PORT=587
SMTP_FROM=Discover Slovenia AI <noreply@discoverslovenia.ai>

# Web push (optional)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@example.com

# Ranking override (optional)
# RANKING_WEIGHTS='{"relevance":60,"quality":15,"rating":10,"distance":10,"premium":5}'
# FEATURED_REQUIREMENTS='{"minPlan":"premium","minQualityScore":90,"requireAdminVerification":true}'
```

---

## License

MIT — see [LICENSE](LICENSE)
