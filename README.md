# 🇸🇮 Discover Slovenia AI

> **AI potovalni concierge za Slovenijo in jadransko regijo (SI · HR · ME · AL).**
> Načrtovanje večdnevnih potovanj iz naravnega jezika, odkrivanje 125.446 krajev,
> orkestracija čez ponudnike (transferji, nastanitve, hrana, bencin) in ena časovnica
> potovanja — s sistemom, ki vedno iskreno pokaže, kaj je dejansko živo in kaj ni.
> Od različice 1.116.0 (Issue #9) je jedro **100 % deterministično — 0 AI žetonov**
> (isti vhod → isti načrt); AI ostaja le kot opcijska vizija za razumevanje slik.

[![CI](https://github.com/markec12345678/Discover-Slovenia-AI/actions/workflows/ci.yml/badge.svg)](https://github.com/markec12345678/Discover-Slovenia-AI/actions/workflows/ci.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791?logo=postgresql)](https://neon.tech/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38B2AC?logo=tailwindcss)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

| | |
|---|---|
| **Live aplikacija** | <https://i-feel-slovenia.onrender.com> (Render, primarna) · <https://i-feel-slovenia.vercel.app> (Vercel, sekundarna) |
| **Dokumentacija** | [docs/](docs/) · [CHANGELOG.md](CHANGELOG.md) · [SECURITY.md](SECURITY.md) |
| **Stanje** | v1.150.0 · 4291 testov (ZA PUSHOM — CI sledi — polna git zgodovina v CI od 1.100.2; API-dim zlata pot v vsakem CI pushu + brskalniški offline E2E in Lighthouse/CWV vrata na voljo prek browser-e2e.yml/lighthouse.yml) · lint 0 · tsc 0 · ISSUE #16 FAZA 3 (1.150.0): ZEMLJEVID POI POPUP KANONSKI WRITE-THROUGH — gumb „+ Dodaj v mojo pot" na POI popupu zdaj piše v OBE plasti (zbirka dai:my-trip-items z source „zemljevid" + supply izbira; prej SAMO supply — napačna semantika, zadnja površina brez kanonskega dodajanja); idempotentno (dedup kind:refId), enak vzorec kot ProductModal/ProductCard; suite 4291/4291 (+6 varovalk issue16-f3), tsc 0, lint 0; dev E2E dokazano (iskanje → 100 POI → klik „Kavarna Mango" → OBE plasti potrjeni + idempotentnost + 0 napak — dokazi issue16-dokazi/f3-*.png) · prej: VERCEL 1.149.0 ŽIVA (webhook je za push 011c308 SAM uveljavil 30. 9. ~11:15 UTC / ~13:15 slovensko, health potrjen: {"status":"ok","version":"1.149.0"} — ISSUE #16 FAZA 2 PRODUKCIJSKA POTRDITEV: /moja-potovanja hub VEDNO viden [eval: „Moja pot — Tukaj bo zrasla tvoja pot… Zbirka je še prazna… Odkrij destinacije"] + korak POJDI živ [seed dai:go-trip V2 → trak „NA POTI — Tvoja pot je v teku… Kam zdaj?" na produkciji; 0 konzolnih/page napak; dokaza issue16-dokazi/prod-f2-hub-{prazno,go-trak}.png]) · ISSUE #16 FAZA 2 (1.149.0): MOJA POT HUB — MyTripView VEDNO viden (prazna zbirka = okvir ODKRIJ s CTA „Odkrij destinacije"; prej: return null tišina) + korak POJDI: trak „NA POTI" s primarnim CTA „Kam zdaj?" → /na-poti ko je dai:go-trip aktiven (prej hub NI imel NOBENEGA vhoda v Go Mode — največja vrzel audita #16 za hub; hydration-varna detekcija); suite 4285/4285 (+13 novih varovalk issue16-f2-my-trip-hub), tsc 0, lint 0; dev E2E dokazano (prazno stanje + zbirka + GO trak — 0 napak, dokazi issue16-dokazi/f2-*.png) · prej: VERCEL 1.148.0 ŽIVA (webhook je za push 036f7f7 SAM uveljavil 30. 9. ~10:35 UTC / ~12:35 slovensko, health potrjen: {"status":"ok","version":"1.148.0"} — ISSUE #16 FAZA 1 PRODUKCIJSKA POTRDITEV: desktop navigacija Odkrij · Moja pot · Zemljevid · Pojdi + „Več“ [a11y drevo: link Odkrij/Moja pot/Zemljevid/Pojdi + button Več], „Več“ dropdown odprt z 10 menuitemi v 3 skupinah; mobilna tab vrstica Odkrij | Zemljevid | Moja pot | Pojdi | Več [eval izris]; /na-poti 200 z aria-current=page na zavihku POJDI; 0 konzolnih/page napak; dokazi issue16-dokazi/prod-{desktop-nav16,desktop-vec-dropdown16,mobile-pojdi-aktivna16}.png) · ISSUE #16 FAZA 1 (1.148.0): LUPINA ENEGA POTOVANJA — mobilna tab vrstica ODKRIJ | ZEMLJEVID | MOJA POT | POJDI | VEČ (POJDI lastni zavihek — prej pokopan pod Več; MOJA POT sredinski hub s števčno značko na kroglici; NAČRTUJ živi v kontekstu Moja pot [/nacrtuj + /potovanje osvetlita MOJA POT]; oznake ×6 Odkrij/Pojdi) + desktop Odkrij · Moja pot · Zemljevid · Pojdi + „Več“ DropdownMenu s skupinami Odkrij več / Načrtuj in orodja / Račun (progressive disclosure #16 §5) + mobilni Sheet pregrupiran v 15 povezav (ZERO LOSS: vseh 13 prejšnjih + 2 novi [Primerjava, Prijava — prej samo noga]) + 10 novih nav i18n ključev ×6 (zadnja 2 hardkodirana SL niza Sheet-a prevedena); suite 4272/4272, tsc 0, lint 0; dev E2E dokazano (desktop dropdown 3 skupine, mobil 390px vrstica + Sheet skupine, /na-poti aria-current=page na POJDI, 0 napak — dokazi issue16-dokazi/) · prej: VERCEL 1.147.0 ŽIVA (webhook je za push 280a6eb SAM uveljavil 30. 9. ~08:55 UTC / ~10:55 slovensko, health potrjen: {"status":"ok","version":"1.147.0"} — W12 FAZA 2C PRODUKCIJSKA POTRDITEV: PRODUKCIJSKI KLEPET v FR (POST /api/chat language=fr „Que faire à Bled ?“ → 200 v 2,9 s: „Bled (Slovénie) : Perle des Alpes avec son château médiéval et son île. Note 4.8/5, visite recommandée : 1-2 jours, coût estimé à partir de €25 par personne.“ + aktivnosti + „Note sur l’affluence“ [razpršitev W8 ×6] — 0 SL/EN uhodov [„Ocena“/„Rated“ NE]) in ES („hola“ → „¡Hola! 🇸🇮 Puedo ayudarte… 38 destinos“; „¿Dónde puedo comer en Liubliana?“ → „Proveedores locales de nuestra base… valoración 4.7/5… Dime un destino“ — namenski nabor ES deluje); /fr 200 francoski naslov + mtNotice „Traduction automatique“; /es 200 španski naslov; BRSKALNIŠKI DOKAZ na produkciji (/fr klepet widget → FR odgovor izrisan, 0 konzolnih napak, dokaz w12-dokazi/fr-prod-klepet-2c.png); regresije 2a/2b zelene (/fr/destinacija/bled 200, /fr/nacrtuj 200); CI na 280a6eb zelen (suite 4272/4272, run 36692354655); amend UUID sporočila sesule seje → čista zgodovina) · W12 FAZA 2C (1.147.0): klepet 6-jezičen — domenska plast vrača PRAVE FR/ES odgovore (chat-domain-fallback +308: ChatLang ×6, 33 L() tabel fr/es, COUNTRY_LABELS/RATING_WORD/FROM_PRICE_PER_PERSON, localizedDest z FR/ES overlayji; 11 naborov ključnih besed +~150 FR/ES vzorcev; /api/chat direktnejsi threading — prehodna EN-preslikava odstranjena; crowd-alternatives razpršitev FR/ES; destination-modal zadnjih 8 SL-only nizov na pick() ×6); suite 4272/4272 (+2), tsc 0, lint 0; dev zlata pot brskalniško dokazana (obe jezika, 0 napak — dokaza w12-dokazi/{fr,es}-klepet-bled-2c.png); W12 S TEM ZAKLJUČEN — celoten jedrni lijak 6-jezičen (odkrivanje+svetovanje+destinacije+zemljevid+načrtovalnik+klepet) · prej: 1.146.0 ŽIVA (webhook je za push 1c06494 SAM uveljavil 29. 9. ~23:15 UTC / ~1:15 slovensko 30. 9., health potrjen: {"status":"ok","version":"1.146.0"} — W12 FAZA 2B PRODUKCIJSKA POTRDITEV: /fr/nacrtuj 200 z naslovom „Planificateur de voyage — Slovénie“ + og:locale fr_FR + hreflang gruča 7 jezikov; PRODUKCIJSKA GENERACIJA deluje (gumb „Générer l’itinéraire“ → „Votre itinéraire de 3 jours“ + 9 FR hitrih akcij „Moins de conduite/Adapté à la pluie/…“ + FR taglini postankov „Sauvage et intouchable, la beauté du parc national du Triglav“ + „Pourquoi cet arrêt : correspond à tes intérêts (nature)“ + vreme „partiellement nuageux“); PRODUKCIJSKI Q&A („Que faut-il mettre dans ma valise ?“ → pametni pakirni seznam FR z 10 artikli + razlogi, „calculé“ značka); /es/nacrtuj 200 + sveža ES generacija (razlogi „coincide con tus intereses · cerca de las otras paradas · en temporada (verano)“ + tagline „esmeralda entre los Alpes Julianos“ + „parcialmente nublado“); meja živi (/fr/trznica → 308 → SL); sitemap 3548 URL (+2: /fr/nacrtuj + /es/nacrtuj v sitemapu z hreflang gručami); 0 konzolnih/page napak na produkciji; dokazi w12-dokazi/{fr-prod-nacrtuj-itinerer,fr-prod-nacrtuj-qa,es-prod-nacrtuj-itinerer}.png) · W12 FAZA 2B (1.146.0): načrtovalnik 6-jezičen — planner pogon (plan-qa vzorci/primeri/11 odgovorov, packing-smart, QUICK_ACTIONS ×9, NL ukazni parser ~159 FR/ES vzorcev z ç/ñ diakritiko, ICS voyage-/viaje- izvozi, DAY_SEGMENT_LABELS, planner-audio) + komponente (copilot/ai-controls/events/trust-line/refiner/audio) + API threading (ask/refine/weather + geo-validation + stop-insights + weather-utils) + dogodki FR/ES dedijo EVENTS_EN (§38); KVALITETA: 173 neprevedenih messages nizov popravljenih (fr/es/it/de) + nov varovalni test w12-translation-quality; 2 SL uhoda odkrita in popravljena med E2E (stop-insights komponenta, deterministic-itinerary taglineOf); suite 4270/4270 (+22), tsc 0, lint 0; dev zlata pot brskalniško dokazana (FR Q&A „Voyage entier : ~215 km…“, refine 200, mobil 390px brez preliva, 0 napak — dokazi w12-dokazi/) · prej: 1.145.0 ŽIVA (webhook je za push cc53946 SAM uveljavil 29. 9. ~20:40 UTC, health potrjen: {"status":"ok","version":"1.145.0"} — W12 FAZA 2A PRODUKCIJSKA POTRDITEV: /fr/zemljevid 200 z naslovom „Carte interactive de la Slovénie et des Balkans“ + hreflang fr-FR + francosko statistiko/legendo; PRODUKCIJSKO ISKANJE na /fr/zemljevid deluje („restaurants à Ljubljana“ → „Destination Ljubljana — Correspond à votre recherche (mots-clés: ljubljana · catégorie: food)“, 0 konzolnih napak); /es/zemljevid 200; /fr/destinacija/bled 200 (naslov „Bled — Perle des Alpes… | Guide de voyage en Slovénie“ + og:locale fr_FR + „Que faire à Bled“ + regija „Haute-Carniole“); /es/destinacija/piran/things-to-do 200 (pod-poti žive); meja faze 2b živa na produkciji (/fr/nacrtuj → 308 → SL); sitemap 3546 URL (2404 + 1142: FR/ES destinacijske pod-poti ×570 ×2 + /zemljevid ×2, hreflang gruče); CI na cc53946 zelen (suite 4248/4248); dokaza w12-dokazi/{fr-prod-zemljevid,fr-prod-zemljevid-iskanje}.png) · W12 FAZA 2a (1.145.0): FR/ES destinacijske plasti (/destinacija/* ×38 — overlayji živi na straneh) + zemljevid 6-jezičen (T slovarji ×6, taksonomija ×6, iskanje z ~90 FR/ES sinonimi + razlogi zadetkov) + sitemap 2404 → 3546 URL; dev zlata pot brskalniško dokazana — /fr/zemljevid iskanje s francoskimi razlogi, preklop stikala FR→ES, /es/destinacija/bled „La perla de los Alpes“ + „Qué hacer en Bled“, mobil 390px 0 preliva, 0 napak (dokazi w12-dokazi/) · prej: 1.144.0 ŽIVA (webhook je za push d976fa4 SAM uveljavil 29. 9. ~18:40 UTC, health potrjen: {"status":"ok","version":"1.144.0"} — W12 PRODUKCIJSKA POTRDITEV: /fr 200 s francoskim naslovom „Planificateur de voyages IA" + og:locale fr_FR + mtNotice + francosko vsebino; /es 200; meja faze 1 živa na produkciji (/fr/zemljevid → 308 → SL); sitemap +18 FR/ES URL-jev (9 poti × 2, hreflang gruča 7 jezikov); dokaz w12-dokazi/fr-prod-home.png (0 konzolnih napak); CI na d976fa4 zelen (suite 4239/4239); squash commit d976fa4 je popravil obe UUID sporočili sesule seje (9060ca8 + d7f157b); dev zlata pot brskalniško dokazana pred pushom — Bledov modal s FR overlayjem „Perle des Alpes", switcher 6 jezikov, portorož FR živ; 5 hroščev odpravljenih v zaključni fazi: necitirani JS ključi generatorja (500!), ključi s presledkom v LLM odgovoru, homepage LOCALE_META/COLLAPSIBLE brez fr/es, regija-test tipkarska 21, wishlist testa na 4-jezikovni kanoni) · prej: 1.140.2 ŽIVA (webhook je za push b7f07be SAM uveljavil ~05:07 UTC 29. 9., health preverjen 05:10 UTC — izjemno: brez API ukaza, ki tokrat NI BIL MOČEN, ker je okolje ob restartu 04:38 UTC prepisalo .env na SAMO DATABASE_URL [VERCEL_TOKEN in vsi ostali ključi izgubljeni — OBNOVLJENO 29. 9. ~06:40 UTC: lastnik je prilepil sveža VERCEL_TOKEN + GITHUB_TOKEN žetona, oba verificirana proti živim API-jem — Vercel API zmožnost nazaj (deployment listing: dpl_69UyBXW7 + dpl_89KYTdUd oba READY), GitHub API push/repo dostop nazaj; obrambna kopija ključev izven repa (/home/z/.env-keys-backup, chmod 600); monitor 29. 9. ~06:45 UTC: Vercel job ZELEN (tek 04:42), skupni run rdeč SAMO zaradi Render drifta v1.102.0 (Issue #7, lastnikova akcija, rdeč od 26. 9.) — GitHub schedule zamiki/preskoki tekov so platformno vedenje, workflow active; nov /pot gate korak še ni pognal v CI (dodal se po zadnjem teku 04:42; ukazna pred-verifikacija 200 + oba markerja na ŽIVI 1.140.2 sveže potrjena 06:44 UTC)]; [OPS 3. restart okolja 08:07 UTC: .env spet pobrisan (3. incident), tokrat je z njim padel TUDI ~/.env-keys-backup — nova lekcija: celoten reset peskovnika pobriše tudi backup izven repa; obnova BREZ lastnikove akcije: GITHUB_TOKEN rešen iz git remote URL (žeton je vgrajen v origin — preživi reset), RENDER_TOKEN iz lastnikovega sporočila, VERCEL_TOKEN izgubljen (3.×) a NI kritičen — vse avtonomne poti [webhook uvajanje, CI monitor, catch-up] delujejo brez njega; ŽIVA VALIDACIJA 08:28–08:32 UTC z workflow_dispatch tekom 36542925633: (1) MONITOR-RETRY 2 — Vercel job ZELEN, smoke 18/18 ok [ob 07:05 je isti job padel 16/2 na lažnem rdečem; retry z -m 150 je v teku rešil hladen zagon ~133 s], verzija 1.140.2 ≡ repo ×3; (2) render-catchup — prvi živi tek ZELEN: drift → POST dep-datndcg93c1s73bagvf0 → zavrnjen v 0,8 s → klasificiran kot PRE-BUILD zavrnitev (kvota, ni napaka); (3) nov /pot SSR gate — PRVI CI tek, ZELEN (200 + h-[500px] + »Načrt po dnevih«); skupni run rdeč IZKLJUČNO zaradi Render drift joba — dizajniran verziji alarm Issue #7, izgine ob resetu kvote 1. 10.]; PRODUKCIJSKI DOKAZ LCP 1.140.2: embed perf 0.58 → 0.81 (+0.23, LCP 4727 → 3609 ms −24 %, TBT 820 → 255 ms) / polna LCP 2708 → 1961 ms −28 % [Lighthouse mobile/simulate nad produkcijo, 0 runWarnings, funkciji ogreti; CLS 0 na obeh OHRANJENO; časovnica: map chunk +15 ms za koncem vala 2 namesto +117 ms — uvoz ob evaluaciji modula, VZPOREDNO s hidratacijo; SSR dokazi identični 1.140.1; dokazi v lcp-1402-evidence/]; + samodejna preverba SSR rezervacije /pot v monitorju vsakih 3 h [zaprtje vrzeli, ki je pustila CLS 0.38 skozi — nov korak prod-monitor.yml: h-[500px] + »Načrt po dnevih« v strežniškem HTML javne poti bb183cd77d; recept za CI Lighthouse razširitev v E2E-GATES.md §T4]; prej: 1.140.1 ŽIVA (dpl_8CAWQCx7 iz 4545690, uvedena 28. 9. 20:27:53 UTC — samodejni uvajalni nadzornik je uspel v poskusu 2, ko se je rolling okno kvote sprostilo ~23 h pred napovedanim resetom 29. 9. 20:11 UTC; nadzornik se samodejno ustavil 20:42:53 po idempotenčni preverbi, kvota ni zapravljena; iskreno: uspešen odgovor API-ja ni vseboval uid na vrhu → skripta ga je razvrstila kot „nenavaden“, deployment potrjen z GET /v6/deployments; webhook za push 512ee07 ostal tih — isti vzorec kot a1f4095/5608f9e); PRODUKCIJSKI CLS DOKAZ 1.140.1: obe /pot poti 0.3805/0.3393 → 0.0000 [Performance API 412×823: 0 zamikov, 0 napak, 0 konzole, brez preliva; Lighthouse mobile/simulate nad produkcijo: CLS 0 na obeh (embed perf 0.58/LCP 4.7 s; polna perf 0.80/LCP 2.7 s; 0 runWarnings); SSR dokazi: h-[500px] + „Nalagam“ + 3 preconnecti na a/b/c.tile.openstreetmap.org + odsek „Načrt po dnevih“ v strežniškem HTML — pred popravkom vse ODSOTNO; dokazi v cls-1401-evidence/ (cls-after-prod-embed.png, cls-after-prod-full.png, lighthouse-prod-1.140.1.json, posodobljena summary.md + layout-shift-sources.json)]; hladen prvi obisk ~90 s (znani pojav, topla ~1 s); prejšnji uvod dneva: 1.140.0 živa (dpl_GQGhgLzQ, preverjena 28. 9. 19:14 UTC; dokazi v prod-1400-evidence/: glave obeh poti curl-dokazane [embed frame-ancestors * + ALLOWALL; polna stran DENY/'none' nespremenjeno], embed stran brez lupine + atribucija, REALNA MEDDOMENSKA vdelava [lokalna simulacija bloggerjeve strani iframe-a produkcijsko pot — Document 200 + hidracijski chunki + 0 CSP napak]; prejšnji dogodki dneva: a1f4095 zatavil na kvoti 17:07 UTC → kvota se je sprostila isti večer → webhook sam uveljavil 1c27a83/a049313 [dpl_4DfXBdeJ, dpl_87S2wytU]; Render zaostaja — lastnikova akcija, Issue #7) · ISSUE #15 ZAKLJUČENA — WORKFLOW BENCHMARK V0+V1+V2 + KPI §6 + DODATEK D, vsi vali W1–W10 + W1 KPI + D7 (1.126.0–1.140.1: [W1] IT+DE jeziki v 4 fazah — odkrivanje/svetovanje, destinacije+zemljevid, planner 4-jezično, /it/nacrtuj + /de/nacrtuj odprta [1.129.0]; [W1 KPI] jezikovni dogodek seje session_locale — delež sej po jeziku iz root layouta + konverzijski lijak s planner_started{locale}, enkrat na (seja, locale) [1.139.0]; [D7] blog-embed deljenih poti — javna pot ponudi ČIST iframe snippet (»Vdelaj na svojo stran ali blog«, WordPress Po meri HTML) → živ prikaz na /pot/embed/[shareId] (brez lupine/urejalnih ploskev, atribucijski pas, CSP frame-ancestors * SAMO za to pot, ostalo XFO DENY; klikjacking analiza: brez pooblaščenih ploskev + SameSite=Lax piškotki; telemetrija trip_embed_copied + page_view /pot/embed/*; Roam Aroundov vzorec BREZ token ekonomije) [1.140.0]; [PERF 1.140.1] CLS na /pot poteh 0.3805/0.3393 → ~0 — SSR rezervacija zemljevida (deriveRoute čista funkcija iz PROPA namesto prazne Zustand shrambe + fiksna višinska ovojnica za dynamic ssr:false) + preconnect na a/b/c OSM ploščice; odkrito s prvim Lighthouse dimom nad ŽIVO produkcijo (5 kanonskih strani vrat vse NAD izhodišči 1.107.0 — 14 verzij brez perf regresije); [PERF 1.140.2] LCP na /pot poteh — Leaflet uvoz se začne ob EVALUACIJI MODULA (vzporedno s hidratacijo; prej serijsko ~445 ms za njo — izmerjena produkcijska časovnica), window varovalka za SSR/bun-test varnost, NAMERNO samo /pot (map-section nedotaknjen — drugod bi ~450 KB prednalaganja pokvarilo NJIHOV LCP); + samodejna preverba SSR rezervacije /pot v prod-monitorju vsakih 3 h (zaprtje vrzeli: /pot ni bil v nobenem samodejnem pregledu — zato je CLS 0.38 ušel); [W9] kontekstualni deep-link vsebina→klepet — klepet + pred-izpolnjeno UREDITLJIVO vprašanje na 38×5 destinacijskih pod-poteh, nikoli samodejno poslano [1.130.0]; [W2] skupinski klepet z @AI na deljenih poteh — strežniška značka AI, klient je ne more ponarediti [1.131.0]; [W3] kolekcije priljubljenih — Vse/Po destinaciji/Po temi + most Načrtuj [1.132.0]; [W10] okno Mindtrip alternativa — /primerjava terenska sekcija z datiranimi preverbami 28. 9. 2026 + FAQ [1.133.0]; [W4] sezonski pas heroja — mesec→sezona 0 AI, CTA po W9 kanonu [1.134.0]; [W5] visok kontrast + bralni način — STB standard, prefers-contrast z izrecnim človeškim prepisom [1.135.0]; [W6] dogodki kot odkrivanje — pas dogodkov izven datumov + CTA za vstopnice po G6 poti [1.136.0]; [W8] razpršitev kot AI načelo — iskrena opomba o gneči + 2 najbližji mirnejši alternativi v klepetu, 0 LLM [1.137.0]; [W7] glasovni vodič v Go Mode — izgovor postanka izključno iz dejstev kartice + destinacije okoli živega GPS, brskalniški speechSynthesis [1.138.0]) · ISSUE #13 ZAKLJUČENA (1.121.0–1.124.0 — UX benchmark 2026 G1–G9: cross-day drag, iskreni social proof, najboljši dnevi, persistent split mapa, most klepet→rezervacija, email-forward vstop, drag ghost/snap duša, mobilna bottom-nav dokaz) · ISSUE #12 (1.118.0–1.120.2 — map-first Discovery [zemljevid vedno aktiven ob iskanju], POI terminologija iz uporabniškega jezika, desktop razpored §9 + mobilni rezultati sheet §10) · ISSUE #11 (1.117.0 — realne cene tržnice na postankih načrta) · ISSUE #9 ZAKLJUČENA — ZERO-AI / DETERMINISTIC-FIRST (1.116.0 — LLM veriga ODSTRANJENA iz jedra: načrtovanje, izboljšave, klepet, iskanje, vpogledi, konzultacije 100 % deterministični [0 žetonov, izmerjeno: klepet 12–29 ms, iskanje 11–52 ms]; edini AI ostanek je OPCIJSKA vizija [Gemini → z-ai VLM rezerva]; strežniški TTS nadomeščen z brskalniškim speechSynthesis [0 strežniških klicev]) · ISSUE #7 ZAKLJUČENA — PRODUCTION GOLDEN-PATH RECONCILIATION (1.115.1 — audit G1–G13: HEAD 4fcc380 ≡ CI ≡ Vercel v1.115.0 [smoke 18/18, sitemap 1224 URL] ≡ standalone build [zlata pot 10/10, offline E2E 7/7, mobilni UX 390px 0 napak]; odkrit P1: RENDER 13 VERZIJ ZA MAINOM [v1.102.0 — trojni dokaz: health verzija + sitemap 1220≠1224 + /en/trznica 308≠200; ni popravljivo iz repa → lastnikova akcija: Render dashboard deploy main + pregled build logov]; NOVA VERZIJSKA VRATA DEPLOJA: functional-smoke.sh --expect-version + prod-monitor obe produkciji preverjata verzijo ≡ repo → drift je RDEČ alarm, ne tiho zelen [dokazano živo: Vercel ✅ / Render ❌]; popravljena 2 dokazana P3: save pokvarjen JSON 500→400 + enotna SHARE_ID_RE validacija GET/PDF/PATCH; matrika + dokazi v docs/audit/issue7-production-reconciliation.md) · ISSUE #8 ZAKLJUČENA — Faza 4 „EN zaključek lijaka“ (1.115.0 — F3-E: EN whitelista odpre /trznica + /dozivetja + /lokali + /dogodki + /moja-potovanja [en vir resnice isEnRoute: proxy strežba + jezikovno stikalo + hreflang + sitemap /en URL-ji — vse samodejno]; tržnica 61+ L listov + generateMetadata SL/EN; booking stack 209 L listov [modali/cart/checkout — booking-panel ŽE dvojezičen TASK 98, zaklenjen s pogodbami]; moja-potovanja 43+ listov + „FROM FAVOURITES“ trak EN; dogodki s CELIM EN PODATKOVNIM SLOJEM [EVENTS_EN 30 dogodkov + kategorije + meseci]; lupina NAV_L [zadnje 3 SL pušči aria na EN straneh] + review-section L + CATEGORY_LABELS_EN konsolidacija v skupnem libu; §38 iskrene meje [EN-only tiha nota na /en/trznica + /en/lokali — katalog je PODATEK ponudnikov v SL, NO FAKE DATA]; +162 testov [3663], 28/28 viewportov brez preliva, §47/§58 dokazano brskalniško, 0 izgube) · ISSUE #8 Faza 3 „En načrtovalnik, umirjena stanja“ (1.114.0 — §43 NO PARALLEL APP: /potovanje okvirjen kot korak ponudnikov ENEGA načrtovalnika [vrstica odnosa + povezava na AI načrtovalnik + Sheet Več dostop + preoblikovana noga + predlogi destinacij „Iz moje poti“] + DRIFT A/B popravljeni [zbirka = resnica ogledala izbir: re-search rehidrira, odstranitev iz zbirke živo deselecta — selection-mirror.ts] + DRUŽINA STANJ states/ [LoadingState aria-live + EmptyState CTA + ErrorState retry — prevzem: /potovanje kategorije skeleti, moja-potovanja, tržnica, lokali, shared-trip, wishlist prazno, events, destinacije; ~12 „Nalagam“ → SL/EN L-pattern] + START ANYWHERE dvig [4 nova dostopna mesta + ingest_completed merjenje; NIKOLI hero] + WISHLIST MOST [„Iz priljubljenih“ trak v MyTripView + prefill združitev v plannerju — zbirka-sloj, brez tihega AI]; +99 testov, matrika 31/31+6 · 0 izgube) · ISSUE #8 Faza 2 „Zbirka je račun + skupnost“ (1.113.0 — STREŽNIŠKA REFLEKSIJA zbirke „Moja pot“ [Prisma UserTripItem + /api/my-trip union-merge/DELETE + startup migracija + diff-sync gonilev MyTripAccountSync v Navigation + prijava sync + pull na /moja-potovanja — cross-device, Google Maps „Want to go“ vzorec, gost ostaja čisto lokalno] + FORK skupnostne/deljene poti [„Shrani kot svojo kopijo“ na /pot/[shareId]: lasten shareId + editToken → popolnoma ureljiva lastna kopija v „Moja potovanja“] + „Dodaj v mojo pot“ na vodičih [detail + 22 kartic seznama] + konzultacijskih destinacijah + GO MODE pomiritev [§24: hero 1 vrstica, GPS pod NEXT — hierarhija NOW→NEXT→WHEN→HOW→CONTEXT]; +85 testov, matrika 31/31 · 0 izgube) · ISSUE #8 / TASK 36 Faza 1 „The Spine“ (1.112.0 — Discovery UX 2.0: živi benchmark [Mindtrip/ALMA/Wanderlog + GMaps/Airbnb/Tripadvisor +9, 86 virov] → benchmark matrika 15 UX področij + D8-B arhitektura DISCOVER→EXPLORE→SAVE→ADD→PLAN→GO → KANONSKI „Dodaj v mojo pot“ [ena zbirka dai:my-trip-items + primitiva ≥44px SL/EN + write-through na zemljevidu/klepetu/journey/dogodkih + NOVE površine: destinacije modal/hub, SmartSearch, dogodki, lokali, doživetja, wishlist most] + pogled „Moja pot“ na /moja-potovanja + trak „Iz moje poti“ v načrtovalniku [prefill SAMO prazne izbire] + mobilna tab vrstica [Razišči·Zemljevid·Načrtuj·Moja pot·Več] + enotna lupina na 17 sirot straneh + hierarhija domače strani [13 blokov ohranjenih, validator v <details>] + akcijska vrstica 5→2+Več + hard 404 /načrtuj popravljen + regresijska matrika 31/31 zmožnosti 0 izgube [docs/audit/task8-*.md]) · TASK 35 (1.111.1 — payout sweep števec olderOpenCount [nadgradnja TASK 34]: GET /api/owner/payouts vrača olderOpenCount [odprte NEVEZANE postavke STROGO pred poravnavanim mesecem; tekoči mesec in vezane postavke izključene], gumb izdaje + sweep hint zrcalita strežniški pogoj issuePayoutSettlement — BREZ lažnih overcountov] + DETERMINISTIČEN PDF izvoz [ModDate past pdf-lib: dokument-datum vezan na vhod — createdAt poti / issuedAt računa; fiksni pas LJ v nogi; CI flaky na Bun ≥ 1.4 vzporednem runnerju odpravljen]) · TASK 34 (1.111.0 — payout ledger [Tier 2 #2, mandat COMPETITIVE-ANALYSIS B3 »računovodstvo ponudnika«]: knjigovodska evidenca prihodkov po rezervacijah [PayoutEntry — bruto/stopnja/provizija/neto snapshot; FW1: samo plačane nepreklicane; idempotentno samo-zdravljenje evidence ob ogledu] + mesečne poravnave [PayoutSettlement — zajem »vse odprto do vključno meseca« [sweep pozneje plačanih], anti-race settle v transakciji, audit sled] + CSV računovodsko poročilo [;/BOM/decimalka vejica] + zavihek Izplačila — BREZ prenosov denarja [B2 Stripe Connect ostaja prihodnji korak]) · TASK 33 (1.110.0 — koledar razpoložljivosti izkušnje [Tier 2 #1]: kapaciteta/dan + blackout dnevi + sezona [tudi čezletna] v DB, ATOMARNA preprečitev overbookinga v SERIALIZABLE transakciji POST /api/bookings, lastniški mesečni urejevalnik z obsegi, proaktivni status v gostovskem modalu) · TASK 32 (1.109.0 — EN blog [16 popolnih prevodov člankov + dvojezična BlogSection na /vodici in /en/vodici] + čiščenje mrtvih de.json/it.json, 308 legacy preusmeritve ohranjene) · TASK 31 (1.108.0 — uvoz rezervacij prek e-pošte [TripItov model]: čist RFC 5322/MIME bralnik [RFC 2047 glave, QP/base64, multipart, .ics/.pdf priloge] + zavihek E-pošta + dormant webhook email-inbound [žeton DSA_EMAIL_INBOUND_TOKEN, DRAFT-only, idempotentno]) · TASK 30 (1.107.0 — Lighthouse + Core Web Vitals REGRESIJSKA vrata: mobile/simulate nad standalone buildom, 5 strani × 7 pragov, baseline + iskrene meje v [docs/E2E-GATES.md](docs/E2E-GATES.md)) · TASK 28 (1.106.0 — live-sync indikator poti: polling contentVersion vsakih 20 s + banner „Osveži" brez CRDT/WS; žeton »overjena rezervacija« pri mnenjih: strežniški snimak Review.verified iz JourneyBooking CONFIRMED) · ISSUE #6 D6-B/D6-C (1.105.0 — ICS rezervacijski parser + PDF izvoz SL/EN z nogami km/min + rezervacijami + premik postankov MED dnevi + varna odstranitev dneva s potrditvijo + PRAVI brskalniški offline E2E z omrežno emulacijo [docs/E2E-GATES.md]) · ISSUE #5 ZAKLJUČEN (T5-D 1.104.0 — M1 deterministični parser rezervacij + M7 planner urejanja + M8 PDF izvoz + M9 arhiv skript + M10 CI API-e2e; končni odgovor: jedro deluje BREZ AI ključa/providerjev/Stripe, dokazano v CI) · ISSUE #5 T5-C (1.103.0 — dokumentacijska resnica: FEATURE-FLAGS.md usklajen · revenue-analysis.ts pot popravljen · zlata pot #1 browser-dokazana: načrtuj → Brez AI → načrt → shrani → /pot/[shareId] reopen) · ISSUE #5 T5-B (1.102.0 — fix valu 1: H1 SmartSearch mrtvi kliki ZAPRTI z browser dokazom · H2 geo-distance konsolidacija ×11 → 1 modul · M3 chat trda meja 25 s + klientni abort · M4/M5/M6 testne vrzeli zaprte, +107 testov) · ISSUE #5 T5-A (1.101.0 — samo bralni audit: produktno-funkcijska matrika 95 zmožnosti + AI-revizija 25 klicnih mest v [docs/PRODUCT-FUNCTIONALITY-MATRIX.md](docs/PRODUCT-FUNCTIONALITY-MATRIX.md); 0 BLOCKER · 2 HIGH (SmartSearch mrtvi kliki, haversine ×11 duplikacija) · 11 MEDIUM; jedro potrjeno na audit ravni: deluje z nič AI ključi/providerjev/Stripe) · UX redesign Issue #3 + TASK 4 UX FIX PASS · ISSUE #4 VAL 1 (§3 lifecycle · §6 cene · §9 ure · §11 AI metering) + VAL 2 (§2 Trip enoten objekt · §8 Go Mode real-time kontekst · §13 sodelovanje z dovoljenji) + VAL 3 (§4 import rezervacij s parse→potrditev · §7 transport resnica · §14 proračun 5 vedric) + VAL 4 (§5 provider capability matrika · §10 deterministična personalizacija brez AI · §15 dokumenti poti · §16 offline z realnim E2E dokazom + dnevna navigacija Go Mode) + VAL 5 (§17/§19 enotna svežina FRESH/STALE/UNKNOWN/LIVE + provenance · §20 razložljiva priporočila z why vrstico · §22 trip versioning/undo — sejni undo sklad + strežniške revizije z obnovitvijo) + VAL 6 (§21 optimizacija zaporedja — namerni vrstni red zamrznjen intentLocked + regresijska suita celotne matrike) + VAL 7 (§18 destinacijska vsebina — provenance plast: 9 uradnih virov + 29 iskrenih uredniških kuracij, as-of resnica z git pastjo, vir/odpiralni čas/posodobljeno na hub+modal, addressCountry resnica za 16 tujih destinacij, NiST odkrito dokumentiran) + VAL 8 (§23+§24 share/private varnost — importData leak zaprt, robots.txt en vir resnice, claim prevzem zahteva editToken, vabila 7 dni TTL, admin geslo iz localStorage → httpOnly HMAC seja, rate limiti na vseh prej odprtih poteh, D5 dokumentiran z Upstash receptom) · HOTFIX 1.99.1 (schema provider past — obe smeri varovani + pre-commit varovalka) · HOTFIX 1.100.1 (migrate:baseline checksum samoozdravitev — git-znan zgodovinski allowlist, optimistični UPDATE, pravi drift ostane ujet; produkcija health ok) · HOTFIX 1.100.2 (CI rdeč od VAL 7 — shallow-klon git-resnica past; fetch-depth: 0 + preskok ob shallow klonu) · HOTFIX 1.100.3 (migration drift vrata — updatedAt DB default past iz VAL 2; baseline usklajen, samoozdravitvena veriga) · ZEMLJEVID 1.95.1 (SW CSP fix bele slike + Slovenija&Balkan z 125k pini) · CORE deluje brez AI ključa (Issue #2 — sedaj tudi formalno dokazano v T5-A matriki) |

**Kazalo:** [Trenutno stanje](#trenutno-stanje) · [Kaj lahko uporabnik počne](#kaj-lahko-uporabnik-počne) ·
[Geografska pokritost](#geografska-pokritost) · [Journey orkestracija](#journey-orkestracija) ·
[Iskrenost podatkov](#iskrenost-podatkov) · [Providerji](#providerji) · [Booking status](#booking-status) ·
[Glavne poti](#glavne-poti) · [Tehnologija](#tehnologija) · [Hitri začetek](#hitri-začetek) ·
[Konfiguracija](#konfiguracija-env) · [Deployment](#deployment) · [Poslovni model](#poslovni-model) ·
[Dokumentacija](#dokumentacija) · [Razvojna zgodovina](#razvojna-zgodovina)

---

## Trenutno stanje

### 🔴 Danes živi (live)

| Zmožnost | Vir |
|---|---|
| Načrtovanje potovanj v slovenščini, angleščini, italijanščini in nemščini (multi-turn, nikoli 500) — **100 % deterministično jedro** (Issue #9, 0 AI žetonov: isti vhod → isti načrt; tudi izboljšave, klepet, iskanje in vpogledi) | lastni `deterministic-itinerary` + deterministični chat engine |
| Skupinski klepet z @AI na deljenih poteh — deterministični domenski odgovori v skupinskem pogovoru; značka AI je strežniška (klient je ne more ponarediti; 1.131.0) | lastni chat-engine (0 žetonov) |
| Odkrivanje krajev: **125.446 krajev v 4 državah** | Foursquare OS Places (lokalna množica, Apache-2.0) |
| Živi POI sloj po viewportu zemljevida | OpenStreetMap Overpass API |
| Uradna turistična vsebina (RAG) | slovenia.info `llms.txt` (STO) |
| Transfer odkrivanje z objavljenimi realnimi cenami | KiwiTaxi partner feed (CSV) |
| Živo vreme (trenutno + dnevna napoved; po dnevih poti v MY TRIP in v dnevnih karticah itinerarja — načrtovalnik + deljen načrt) | Open-Meteo (brez ključa) |
| Zvočni povzetek dneva itinerarja (gumb »Poslušaj« v glavi dneva; načrtovalnik + deljen načrt + MY TRIP) + **glasovni vodič v Go Mode** (»Preberi postanek na glas« + »Kaj je v bližini« — 1.138.0) | brskalniški speechSynthesis (0 strežniških klicev, izgovor po kosih ≤ 960 znakov) |
| Segmentacija dneva Jutro / Popoldan / Večer + poštene etape med postanki (🚗 ~X km · ~Y min, isti vir kot značke km dni) na vseh površinah načrta | lastna lib day-segments + OSRM legs |
| **38 kuriranih destinacij** v 4 državah + EN · IT · DE različice | lastni destinacijski register |
| Journey orkestracija, MY TRIP časovnica, natisljivi potrditveni dokument | lastna koda |
| Zunanje booking predaje (`/go`) in affiliate preusmeritve — 9 partnerjev na načrtovalniku (nastanitev, aktivnosti, vstopnice, najem, vlaki, transferji, leti, eSIM, zavarovanje) | 16-provider omrežje |
| Dvojezična booking plošča načrtovalnika (vsi naslovi, opisi, CTA-ji, prazna stanja in opis zavarovanja z dnevi načrta — SL + EN; 1.85.0) | next-intl (`planner.booking`, 33 ključev) |
| Polni booking lifecycle potovanja (13 statusov + prehodi; POST/GET/PATCH `/api/journey/bookings` — checkout handoff zapisi EXTERNAL, MY TRIP prekrivka iz realnih vrstic, provider prehodi fail-closed za žetonom; 1.86.0) | Prisma `JourneyBooking` + `lib/journey/booking.ts` |
| Marketplace payout + customer state (payoutStatus not_due→due→processing→paid, gostov zahtevek preklica z AuditLog, lastnikova vidnost; 1.86.0) | Prisma `Booking` + `lib/marketplace-types.ts` |
| **Deterministični motor načrta kot naravna pot** (`engine="deterministic"`: 0 LLM žetonov, 100 % reproducibilno, isti vhod → isti načrt; ISTA validacijska/obogatitvena veriga kot AI pot — supply, vreme, OSRM, geo-validacija; stikalo "Z AI / Brez AI" v UI; 1.87.0) | `lib/deterministic-itinerary.ts` + `/api/itinerary` |
| Lastna tržnica (partnerji, izdelki, izkušnje) z lastnim checkoutom in pini na supply zemljevidu (listingi in izkušnje s koordinatami) | lastna baza + Stripe (demo mode brez ključev) |

### 🟡 Pripravljeno, čaka na aktivacijo ponudnika

- **7 API adapterjev je kodirano-pripravljenih** (Viator, GetYourGuide, Tiqets, Booking,
  Skyscanner, Airalo, Travelpayouts) — vrata so živo preverjena, vsak adapter je priklopljen
  v **iskreno praznem stanju**, dokler poverilnica ni v env. To NI aktivna API integracija.
- **Affiliate plast deluje ŽE DANES brez poverilnic** (fail-closed čiste povezave): vsaka
  `/go/*` preusmeritev vodi na delujočo partnerjevo stran (`monetized: false` — nikoli
  lažnega trackinga); ko poverilnica pride v env, se monetizacija prižge **brez spremembe
  kode**. Načrtovalnik pokriva vseh 9 partnerjev (1.84.0: + Tiqets vstopnice, + zavarovanje
  z `days` iz dolžine načrta).
- **Booking arhitektura** — `JourneyBooking` stanjski model, potrditvena validacija,
  provider-agnostic registracija resolverjev — zamrznjena v stanju „activation ready".
- **Ni še aktivirano:** API booking, webhook ingest ponudnikov, živi citati/rezervacije,
  odpovedi in refundacije.

### Meje, ki jih sistem izrecno ločuje

- **Odkrivanje ≠ rezervacija** — rezultat iskanja ni potrjena rezervacija.
- **Affiliate preusmeritev ≠ inventar** — globoka povezava ni hotelska/letalska zaloga.
- **Zunanja rezervacija ≠ potrjena rezervacija** — številka rezervacije pomeni
  „Zunanja rezervacija", dokler provider ne vrne svoje.
- **Znana cena ≠ živi citat** — objavljena „od"-cena iz feeda ni potrjena cena ob poizvedbi.

---

## Kaj lahko uporabnik počne

- **Načrtovanje potovanj — 100 % deterministično (0 AI žetonov, Issue #9)** —
  naravni jezik (SL/EN + IT/DE na `/it/nacrtuj` in `/de/nacrtuj`), izboljšave v
  pogovoru; vhodi: besedilo, fotografija/screenshot (opcijska vizija), PDF,
  shranjene točke Google Maps.
  Med generiranjem: statusna vrstica z **dejanskim števcem**, fazo
  po značilnem vrstnem redu strežnika in gumbom **Prekliči** (tiho, brez
  izgube obrazca); odmor > 90 s → ločena jasna napaka (`aria-live` za
  bralnike zaslonov). Ob **regeneraciji obstoječi načrt NE izgine** — ostane
  viden, zamegljen in neinteraktiven (miška in tipkovnica) pod statusno
  vrstico; tudi ob napaki regeneracije stari načrt ostane na zaslonu.
- **Odkrivanje destinacij** — 38 kuriranih profilov s filtri po **državi, regiji, tipu,
  ceni (€–€€€) in oceni (★)**; programske podstrani (things-to-do, itinerary,
  best-time-to-visit, guide).
- **Interaktivni zemljevid** — Leaflet + OSM; FSQ sloj 125.446 krajev (nastanitve,
  restavracije, atrakcije, plaže, bencinske črpalke), transfer rute KiwiTaxi in pini
  lastne tržnice (lokalni in izkušnje s koordinatami — glob-povezava iz imenika vodi
  na zemljevid točno na lokaciji lokala).
- **Večdnevni itinererji z deterministično validacijo** — OSRM realne cestne razdalje/časi,
  odpiralni časi, cik-cak opozorila, 2-opt optimizacija zaporedja (namerni vrstni red
  uporabnika — FIXED izbire in lastni dodatki — se zamrzne, regresijska suita 1/2/14 dni),
  „preveri tuj načrt"
  (10 pravil, 0 AI žetonov), živo vreme v glavah dni (Open-Meteo, sidro po dnevih),
  zvočni povzetek (TTS — cel načrt ali posamezni dan; načrtovalnik, deljena
  povezava in MY TRIP), dnevi razdeljeni na segmente Jutro / Popoldan / Večer
  z etapami med postanki (ista številka kot v podrobnem pogledu — nikoli
  izmišljenih minut),
  pogovor z načrtom.
- **Journey načrtovanje čez ponudnike** — prihod → transfer → nastanitev →
  znamenitosti (odprti viri po 4 državah) → hrana → bencin → dogodki v enem
  načrtu, ki upošteva dejanske zmogljivosti virov.
- **MY TRIP** — ena časovnica po dneh; vsaka postavka nosi realni status
  (Zunanja rezervacija / Samo informacija); **živa dnevna napoved po dnevih
  potovanja** (Open-Meteo — čip pri vsakem dnevu z realnim, DST-varnim
  datumom (koledarska aritmetika — preklop na zimski čas ne podvoji
  datuma dneva); pretekli
  dnevi/dnevi čez ~16-dnevni horizont vira iskreno brez čipa, vir izrecno
  naveden); **zvočni povzetek dneva** (gumb »Poslušaj« — popotnik posluša
  svoj načrt, tisk dokumenta ostane čist); **pas zdravja virov** (katere vire ni bilo mogoče doseči ob
  generiranju — imena iz registra, „nič izmišljenega", ostalo potovanje
  deluje; zdravo stanje = brez pasa, ne tiska se); natisljivi
  potrditveni dokument (čipi vremena, zvok in pas zdravja se ne tiskajo).
- **Na poti (Go Mode)** — Now&Next sopotnik MED potovanjem: živa ura, naslednja
  postanka načrta, razdalja in smer do nje (GPS, premica — izrecno ne vozna),
  **živo vreme pri naslednji postanki** (Open-Meteo: trenutno stanje + današnja
  napoved, vir in čas meritve izrecno navedena), **navigacijski handoff**
  (gumb „Navigiraj": na mobilnem geo: URI → sistemski izbirnik navigacijskih
  aplikacij — Google Maps, Waze, Organic …; na namizju Google Maps URL; cilj
  so realne koordinate postanka, ne iskanje po imenu), opravljanje z enim
  klikom, prihodnji dnevi; **glasovni vodič** (1.138.0 — »Preberi postanek na
  glas«: izgovor izključno iz dejstev kartice [naslov, ponudnik, termin,
  lokacija, GPS-razdalja, trajanje]; »Kaj je v bližini«: destinacije okoli
  živega GPS z imeni, razdaljami in smermi; brskalniška sinteza govora — 0
  strežniških klicev, slovenske številke v besedah za pravilen izgovor);
  načrt je shranjen na napravi in deluje tudi brez
  signala (vreme je edina plast, ki potrebuje signal — ob izpadu iskrena
  opomba).
- **Klepet na vsebinskih površinah (W9, 1.130.0)** — vse 38 destinacijskih
  pod-poti (hub, things-to-do, best-time, guide, itinerary) imajo klepet;
  vstopne točke v vsebini odprejo klepet s **pred-izpolnjenim UREDITLJIVIM
  vprašanjem** — nikoli se ne pošlje samodejno (uporabnik vidi, uredi in sam
  pritisne Pošlji).
- **Skupinski klepet z @AI (W2, 1.131.0)** — na deljenih poteh (`/pot/[shareId]`)
  skupina klepeta v živo (osveževanje vsakih 6 s); omeni @AI in strežnik izda
  domenski odgovor z značko »AI svetovalec« — značka je strežniška, klient je
  ne more ponarediti.
- **Kolekcije priljubljenih (W3, 1.132.0)** — seznam »Priljubljene« dobi
  preklope Vse / Po destinaciji / Po temi (hrana, kultura, aktivnosti, mir …)
  in gumb **Načrtuj**, ki zbirko »someday« prenese v načrtovalnik.
- **Sezonski pas heroja (W4, 1.134.0)** — domača stran diha s sezono
  (mesec → sezona, 0 AI, isti opisi kot bestTime); sezonski CTA odpre klepet
  po W9 kanonu.
- **Visok kontrast + bralni način (W5, 1.135.0)** — dostopnost po vzoru
  slovenskih nacionalnih standardov: meni ob preklopu teme, stanje se zapomni
  (brez utripa ob ponovnem nalaganju); `prefers-contrast: more` se spoštuje,
  izrecna človekova izbira pa zmaga nad sistemskim.
- **Dogodki kot odkrivanje (W6, 1.136.0)** — pas »Kaj se dogaja izven tvojih
  datumov« na načrtovalniku: dogodki na istih destinacijah/regijah, ki se NE
  prekrivajo z okvirjem potovanja + CTA za vstopnice (iskrena partnerska
  nota, sledeča G6 poti).
- **Razpršitev v klepetu (W8, 1.137.0)** — odgovori o javno dokumentiranih
  gnečah točkah (Bled, Vintgar, Postojna, Piran, Ljubljana) dobijo iskreno
  opombo o vzorcu obiskanosti + 2 najbližji mirnejši alternativi z razdaljo —
  predlog, nikoli skrito preusmerjanje.
- **Transferji** — odkrivanje iz objavljenega KiwiTaxi feeda z realnimi cenami;
  rezervacija prek zunanje predaje `/go`.
- **Najem avtomobilov** — odkrivanje prek affiliate sloja z zunanjim handoffom
  (ni lastni inventar).
- **Dogodki** — koledar dogodkov (slovenski viri); na načrtovalniku datumsko
  ujemanje (dogodki MED tvojim obiskom) + brskalni pas izven datumov (W6).
- **Tržnica** — lokalni partnerji, izdelki in izkušnje z lastnim checkoutom;
  partner/admin ob ustvarjanju vnese pin lokacije (geo koordinate — tudi v onboarding
  čarovniku), javni imenik pa glob-povezuje na zemljevid točno na lokaciji;
  B2B portala za ponudnike (`/owner`) in administratorje (`/admin`).
- **Slovensko + angleško + italijansko + nemško + francosko + špansko izkušnja** —
  SL privzeto, EN na jedru lijaka (`/en/…`), IT/DE na domači strani,
  destinacijah, zemljevidu in načrtovalniku (`/it/…`, `/de/…` — W1,
  1.126.0–1.129.0), FR/ES na domači strani, destinacijah, destinacijskih
  pod-potih, zemljevidu, načrtovalniku in klepetu (`/fr/…`, `/es/…` — W12: faza 1
  [1.144.0: jedro odkrivanja + svetovanja] + faza 2a [1.145.0:
  /destinacija/* ×38 + /zemljevid 6-jezičen z FR/ES iskanjem in razlogi
  zadetkov] + faza 2b [1.146.0: /fr/nacrtuj + /es/nacrtuj — planner
  pogon 6-jezičen: Q&A, pakirni seznam, hitre akcije, NL ukazni parser
  z diakritiko ç/ñ, ICS/zvočni izvozi, dogodki dedijo EVENTS_EN] +
  faza 2c [1.147.0: klepet — domenska plast vrača PRAVE FR/ES odgovore
  (33 L tabel, ~150 namenskih vzorcev, FR/ES overlayji + razpršitveni
  namig)]; celoten jedrni lijak je 6-jezičen]);
  poti brez različice se varno preusmerijo (308), nikoli mešanje jezikov.
- **PWA** — načrti brez povezave (aktivno Go Mode potovanje tudi na splošni offline
  strani), pameten pakirni seznam z razlogi, proračun na osebo,
  ICS/QR deljenje; bližnjice ikone aplikacije (4) vodijo na dejanske strani
  (načrtuj/zemljevid/tržnica/destinacije — testno varovane); dnevi na
  offline strani nosijo REALNE datume (»Dan N · torek, 14. septembra«,
  DST-varna koledarska aritmetika — ISTA kot online načrtovalnik od
  1.74.1; source-contract testi, preklop dokazan v pasu Europe/Ljubljana).

Vsaka zmožnost zgoraj je preverjena v kodi; zmožnost, ki obstaja samo v načrtu,
ni navedena.

---

## Geografska pokritost

**Odkrivanje (discovery) — 4 države (FSQ OS Places, snapshot 2025-02-06):**

| Regija | Krajev | Stanje |
|---|---:|---|
| Slovenija | 18.010 | Live |
| Hrvaška | 88.331 | Live |
| Črna gora | 10.285 | Live |
| Albanija | 8.820 | Live |
| **Skupaj** | **125.446** | Live |

OSM sloj je geografsko nevtralen (po viewportu), torej pokriva vse štiri države.

**Kurirana/provider plast — odvisna od vira (NE enako globoko povsod):**

| Plast | Pokritost |
|---|---|
| Destinacijski register (kurirani profili) | 38 destinacij v 4 državah (SI 22 · HR 8 · ME 4 · AL 4) |
| Transferji (KiwiTaxi feed) | Rute, ki se dotikajo Slovenije (iz/v SI) + regionalne rute, kjer feed dejansko vsebuje podatke; kjer jih ni (npr. Dubrovnik, Kotor, Tirana) → iskreno „ni transfernih rut" |
| Uradna vsebina STO (RAG) | samo Slovenija |
| Dogodki | samo Slovenija |
| Fallback načrtovalnik (AI odpoved) | privzeto slovenski bazen; regionalne destinacije samo na izrecno željo |
| AI supply kontekst | slovenski bbox (~4 deg²); regija samo izrecno |

Platforma **ne trdi** enake globine journey/provider pokritosti v vseh štirih državah —
plast je točno taka, kot jo dejansko nosi vir.

---

## Journey orkestracija

```
Uporabnikova želja (naravni jezik)
        ↓
Destinacija / čas / preference (38-destinacijski register, 4 države)
        ↓
Provider capability registry (16 ponudnikov, zmogljivosti po viru)
        ↓
Dejansko dostopni viri (4 viri PRODUCTION_ACTIVE + lastna tržnica PRODUCTION_CONFIGURED; preostali iskreno prazni)
        ↓
Validacija (geo-koherenca, realni časi, cik-cak, duplikati)
        ↓
Journey produkti (transferji, nastanitve, znamenitosti, hrana, bencin, dogodki)
        ↓
Itinerer + MY TRIP (časovnica po dneh, status vsake postavke)
        ↓
Na poti / Go Mode (Now&Next na napravi: GPS razdalja/smer, opravljeni postanki)
        ↓
Zunanja predaja (/go) ali — po aktivaciji — API booking
```

Sistem uporablja **provider capability registry** (`src/lib/supply/registry.ts` +
strojno berljiva `production-matrix.ts`): ne predpostavlja, da ima vsak ponudnik
enake zmogljivosti. Cene, razpoložljivost in vrsta dostopa so klasificirane po viru
(LIVE_PRICE / FROM_PRICE / UNKNOWN / NOT_SUPPORTED), matrika in register pa sta
testovno zaklenjena proti driftu (ena resnica).

---

## Iskrenost podatkov

To je tehnično pravilo sistema, ne marketinška obljuba:

| Ločevanje | Pomen |
|---|---|
| Inventar vs affiliate | povezava do partnerja NI zaloga sob/sedežev/avtov |
| Znana cena vs „od"-cena | objavljena spodnja meja NI živi citat |
| Razpoložljivost vs unknown | brez dokaza nikoli „available" — vedno „neznano" |
| Zunanja vs potrjena rezervacija | št. rezervacije overi šele provider |
| Provider potrditev vs stanje klienta | klient nikoli ne „izmisli" potrditve |
| Uradni vir vs uredniška kuracija (1.99.0 §18) | 9/38 destinacij ima curl-preverjen zunanji vir; 29 je iskreno označenih „uredniška kuracija" — nikoli izmišljen vir; AS-OF datum vezan na git zgodovino (test past) |

**Manjkajoči podatki ponudnika se prikažejo kot nedosegljivi/neznani — nikoli izmišljeni.**
Vsak adapter je fail-closed: manjkajoča poverilnica = prazna plast + jasna opomba
(not-configured / partner-approval-required), nikoli napaka in nikoli lažni podatki.

---

## Providerji

| Provider | Zmožnost | Vrsta dostopa | Stanje |
|---|---|---|---|
| **FSQ** (Open Places) | odkrivanje krajev (4 države) | odprti podatki (lokalna množica) | **PRODUCTION_ACTIVE** |
| **OSM** | odkrivanje POI (viewport) | odprti podatki (žive poizvedbe) | **PRODUCTION_ACTIVE** |
| **STO** (slovenia.info) | uradna vsebina (RAG) | statična vsebina | **PRODUCTION_ACTIVE** |
| **KiwiTaxi** | transfer odkrivanje | partner CSV feed + affiliate | **PRODUCTION_ACTIVE** (rezervacija zunanja) |
| Viator | izleti/aktivnosti (API) | affiliate deep-link | CODE_READY / NOT_CONFIGURED |
| GetYourGuide | izleti/aktivnosti (API) | affiliate deep-link | CODE_READY / PARTNER_APPROVAL_REQUIRED |
| Tiqets | vstopnice (API) | affiliate deep-link | CODE_READY / PARTNER_APPROVAL_REQUIRED |
| Booking | nastanitve (API) | affiliate deep-link | CODE_READY / PARTNER_APPROVAL_REQUIRED |
| Skyscanner | leti (API) | affiliate deep-link | CODE_READY / PARTNER_APPROVAL_REQUIRED (izhodišče = produktna vrzel) |
| Airalo | eSIM (API) | affiliate deep-link | CODE_READY / PARTNER_APPROVAL_REQUIRED |
| Travelpayouts | podatkovni API | search API | CODE_READY / NOT_CONFIGURED (self-serve) |
| DiscoverCars | najem avtov | affiliate deep-link | CONTRACT_VERIFIED / BLOCKED (B4B pogodba) |
| Omio | transport | affiliate deep-link | CONTRACT_VERIFIED / PARTNER_APPROVAL_REQUIRED |
| WorldNomads | zavarovanje | affiliate only | CONTRACT_VERIFIED (brez API) |
| SafetyWing | zavarovanje | affiliate only | CONTRACT_VERIFIED (brez API) |
| Lastna tržnica | partnerji/izdelki/izkušnje + geo pini (supply zemljevid) | direktni booking | **PRODUCTION_CONFIGURED** (geo sloj živ — listingi in izkušnje s koordinatami; stopnja NE prečka v ACTIVE, dokler živi partnerji s pini niso dokazljivi) |

Stanja so izpeljana iz [`src/lib/supply/production-matrix.ts`](src/lib/supply/production-matrix.ts)
(strojno berljiva matrika življenjskega cikla; človeška različica s runbooki:
[docs/PROVIDER-APPLICATIONS.md](docs/PROVIDER-APPLICATIONS.md)).
Affiliate preusmeritev ≠ živi inventar — dokler ključ ni v env, adapterji strežejo
iskreno prazne sloje.

---

## Booking status

**Aktivno danes:**
- Zunanje booking predaje prek `/go/[provider]` (transferji, najem, affiliate cilji)
  — uporabnik rezervira pri ponudniku; platforma ne predstavlja, da je rezervacija
  potrjena.
- Affiliate preusmeritve (Viator, Booking, DiscoverCars, Skyscanner, …).
- Lastna tržnica: naročnina (premium/enterprise) ima PRAVI Stripe Checkout
  (zahteva `STRIPE_SECRET_KEY`); checkout izdelkov/izkušenj je DEMO ali 501 —
  real-money tok (Stripe Checkout Session) je aktivacijski blocker (TODO),
  ne varnostna napaka: demo veja samo z izrecnim `DSA_DEMO_PAYMENTS=1`,
  sicer produkcija fail-closed 501 (nikoli tiho fake plačilo).

**Pripravljeno (arhitektura, NE predstavljati kot produkcijsko aktivno):**
- 7 provider API adapterjev (CODE_READY) — aktivacija samo z realno poverilnico,
  brez spremembe kode.
- `JourneyBooking` stanjski model + potrditvena validacija (številko rezervacije
  overi provider, ne klient).

**Ni še aktivirano:**
- API booking pri ponudnikih, webhook ingest, živi citat/rezervacija življenjski cikel,
  odpovedi/refundacije.

---

## Glavne poti

| Pot | Namen |
|---|---|
| `/` | domača stran — AI lijak |
| `/nacrtuj` | AI načrtovalnik itinererjev (jezik/slika/PDF/Maps → načrt) |
| `/potovanje` | journey načrtovalnik čez ponudnike (prihod/transfer/nastanitev/znamenitosti/hrana/bencin) + MY TRIP s potrditvenim dokumentom (postavke po dneh, skupna cena §16) in pasom zdravja virov (§22 — samo ob odpovedi vira) |
| `/na-poti` | Go Mode — Now&Next sopotnik med potovanjem (GPS razdalje, opravljeni postanki; načrt na napravi — HTML v PLANS cache, LRU-varno) |
| `/destinacije` | 38 destinacij s filtri (država/regija + čipi interesa; tip/cena/ocena v zložljivih „Več filtrov"), razvrščanjem (priporočeno/ocena/cena) in ceno (≈ €) na kartici |
| `/destinacija/[slug]` | hub destinacije + programske podstrani |
| `/zemljevid` | interaktivni zemljevid (FSQ + OSM + transfer plasti) |
| `/moja-potovanja` | shranjena potovanja, naročila, deljene poti |
| `/trznica` · `/lokali` · `/dozivetja` | tržnica lokalnih partnerjev |
| `/dogodki` | koledar dogodkov |
| `/vodici` | ADRIA vodniki (SL + EN) |
| `/konzultacija` | globoke konzultacije (freemium; deterministične od Issue #9) |
| `/primerjava` | iskrena primerjava AI načrtovalcev |
| `/slovenia-pass` | digitalni potni list z značkami |
| `/vir-podatkov` | transparentnost virov (supply) |
| `/pot/[shareId]` | deljeno potovanje |
| `/go/[provider]` | zunanja booking predaja |
| `/za-ponudnike` · `/owner` · `/admin` | B2B portali |

Angleščina živi na `/en/…` (jedro lijaka: načrtuj, destinacije, zemljevid, potovanje,
na poti, vodici, info strani); italijanščina in nemščina na `/it/…` in `/de/…`
(domov, destinacije, zemljevid, načrtovalnik — W1); ostale poti so slovenske
(neveljavne locale poti → varni 308, nikoli 404). Polni API: `/api/journey/plan`,
`/api/journey/bookings`, `/api/itinerary`, `/api/chat`, `/api/cron/*` in ostali
endpointi v `src/app/api/`.

---

## Tehnologija

| Plast | Tehnologija |
|---|---|
| Framework | Next.js 16 (App Router, RSC + API Routes) |
| Jezik | TypeScript 5 (strict) |
| Styling | Tailwind CSS 4 + shadcn/ui + Framer Motion |
| Podatki | Prisma 6 + PostgreSQL (Neon) — 30 modelov |
| Avtentikacija | NextAuth.js v4 (JWT seje, `tokenVersion` invalidacija) |
| i18n | next-intl — SL privzeti + EN/IT/DE/FR/ES whitelist (EN: jedro lijaka; IT/DE: domov, destinacije, zemljevid, načrtovalnik — W1; FR/ES: jedro odkrivanja + svetovanja — W12) |
| AI | SAMO opcijska vizija (razumevanje slik): Gemini → z-ai-web-dev-sdk VLM rezerva; jedro 100 % deterministično — 0 žetonov (Issue #9) |
| Zemljevid | Leaflet + OSM Overpass; FSQ OS Places lokalna množica |
| Plačila | Stripe (checkout + webhooki; fail-closed brez ključev) |
| Zagon / CI | bun · GitHub Actions (lint, typecheck, build) |
| Deploy | Render (primarni) + Vercel (sekundarni) |

---

## Hitri začetek

```bash
git clone https://github.com/markec12345678/Discover-Slovenia-AI.git
cd Discover-Slovenia-AI
bun install

cp .env.example .env
# uredi .env — OBVEZNO:
#   DATABASE_URL   (PostgreSQL, npr. brezplačni Neon; SQLite URL NE deluje)
#   ADMIN_PASSWORD (naključno, min 32 znakov)
#   NEXTAUTH_SECRET (openssl rand -base64 32)
#   CRON_SECRET    (cron endpointi so brez njega fail-closed 401)

bun run db:push          # shema v bazo (prisma generate teče v postinstall)
bun run db:seed:demo     # (opcija) demo partnerji/listingi/rezervacije
bun run dev              # http://localhost:3000
```

Podatkovni množici **FSQ (125.446 krajev)** in **KiwiTaxi transfer feed** sta
že v repozitoriju (`data/fsq-places/`, `data/kiwitaxi-routes.json`) — brez
dodatnih prenosov. Osvežitev feedov: `bun run fsq:ingest` / `bun run kiwitaxi:ingest`
(runbook v [`src/lib/supply/providers/fsq/dataset.ts`](src/lib/supply/providers/fsq/dataset.ts)).

Preverjanje:

```bash
bun test                 # 4142 testov (4133 pass + 9 prej-oddanih okoljskih OSRM —
                         #  potrebujejo zunanji routing servis, niso regresija)
bun run lint             # eslint
bunx tsc --noEmit        # tipi
```

Demo računi (samo lokalni seed; fiksni gesli veljata le z
`DEV_FIXED_DEMO_PASSWORDS=1`): `tina@demo.discoverslovenia.si` /
`marko@demo.discoverslovenia.si` — geslo `demo1234`. Admin portal `/admin`
se overi z `ADMIN_PASSWORD` env (ne prek NextAuth) — od 1.100.0 prek
httpOnly HMAC session piškotka (60 min; geslo ne živi v brskalniku,
glava `x-admin-password` ostane sprejeta za skripte).

---

## Konfiguracija (env)

Kategorije — celoten seznam z navodili je v [`.env.example`](.env.example):

- **Baza** — `DATABASE_URL` (PostgreSQL/Neon; shema je `postgresql`)
- **Avtentikacija / admin** — `ADMIN_PASSWORD`, `NEXTAUTH_*`
- **Cron** — `CRON_SECRET` (obvezno v produkciji; brez njega 401)
- **AI (OPCIJSKO — samo vizija)** — `GEMINI_API_KEY` (Issue #9 ZERO-AI: jedro deluje brez AI ključev; vizija samo za razumevanje slik)
  (strežniški env, nikoli `NEXT_PUBLIC_`)
- **Provider poverilnice** — `VIATOR_API_KEY`, `GETYOURGUIDE_API_TOKEN`,
  `TIQETS_API_KEY`, `BOOKING_API_KEY`, `SKYSCANNER_API_KEY`,
  `AIRALO_CLIENT_ID`/`AIRALO_CLIENT_SECRET`, `TRAVELPAYOUTS_TOKEN` (vsaka manjkajoča =
  iskreno prazen sloj, brez napak)
- **Affiliate** — partner ID-ji (npr. `KIWITAXI_PAP_ID`, `BOOKING_AFFILIATE_ID`,
  `VIATOR_AFFILIATE_URL`)
- **Plačila** — `STRIPE_*` (brez ključev so produkcijski plačilni tokovi zaprti —
  fail-closed; demo veja samo z `DSA_DEMO_PAYMENTS=1`)
- **Lokalna množica** — `FSQ_PLACES_DIR` (privzeto `./data/fsq-places`)
- **Opcijsko** — SMTP, web push (VAPID), ranking uteži

> **Skrivnosti nikoli ne smejo priti v repozitorij.** Vsa poverilnica so
> strežniški env (glej [SECURITY.md](SECURITY.md)).

---

## Deployment

- **Render (primarna produkcija):** push na `main` → <https://i-feel-slovenia.onrender.com>
  (Stanje 29. 9. ~08:40 UTC: **v1.102.0 — KORENSKI VZROK DOKAZAN z API diagnostiko** [lastnik je prilepil RENDER_API_KEY, Task ID 20]: free plan kvota **500 build minut/mesec IZČRPANA** — ~50 uspešnih build-ov × ~4 min od 11.–25. 9.; zadnji uspeh 5eb96e5 [v1.102.0] 25. 9. 11:28 UTC, vsak deploy od 11:36 naprej [50+] zavrnjen v **~1 s = PRE-BUILD zavrnitev** [builder se niti ne zažene — ročno potrjeno: trigger=api zavrnjen v 1 s; prava build napaka bi trajala minute]; kvota se **ponastavi 1. 10. 2026** — nameščen **SAMODEJNI RENDER CATCH-UP job v prod-monitor.yml** [vsake 3 h, idempotenten: če je Render za mainom → POST /deploy; fast-reject zavrnitve ne trošijo minut; 24 h hlajenje po resni build napaki — varovanje kvote; API ključ v GitHub secret RENDER_API_KEY, sealed box]; skript end-to-end validiran proti živi API; **ŽIVO validiran 29. 9. 08:28 UTC** — prvi pravi tek catch-up joba (workflow_dispatch): zaznal drift 58cee1f → POST dep-datndcg93c1s73bagvf0 → zavrnjen v 0,8 s → klasificiran »PRE-BUILD zavrnitev ~1 s — kvota, ni napaka« → exit 0 ZELEN; pričakovani potek: 1. 10. ~00–09 UTC samodejni build → live 1.140.2 → smoke zelen → e-poštni alarmi prenehajo; alternativa za takojšnjo uveljavitev: lastnikova nadgradnja Render načrta [odstrani limit build minut])
- **Vercel (sekundarna):** push na `main` → <https://i-feel-slovenia.vercel.app>
  (zadnja preverjena uskladitev 29. 9. 08:32 UTC — dispatch tek 36542925633 [živa CI validacija]: health 1.140.2 ×3, smoke 18/18 ok, verzija ≡ repo, /pot SSR gate ZELEN; prej 06:45 UTC — Z API, žetona obnovljena: 1.140.2 ≡ dpl_69UyBXW7 [0417df5, 05:22 UTC] + dpl_89KYTdUd [b7f07be, 05:01 UTC] oba READY, health 1.140.2, /pot/embed SSR markerji ✓; 1.140.2 [LCP /pot: vzporeden Leaflet uvoz + monitor SSR rezervacije] ŽIVA od 29. 9. ~05:07 UTC — WEBHOOK je ta push sam uveljavil (brez API ukaza: .env je bil ob restartu okolja 04:38 UTC prepisan na samo DATABASE_URL, VERCEL_TOKEN izgubljen — OBNOVLJENO 29. 9. ~06:40 UTC: lastnik je prilepil sveža VERCEL_TOKEN + GITHUB_TOKEN žetona, oba verificirana proti živim API-jem [Vercel /v2/user 200, GitHub repo 200 + push dovoljenje]; obrambna kopija ključev izven repa /home/z/.env-keys-backup, chmod 600); produkcijski dokazi v lcp-1402-evidence/ (Lighthouse pred/pos obe poti, timeline-before/after, SSR dokazi); prejšnja uskladitev 28. 9. 20:31 UTC: 1.140.1 ≡ dpl_8CAWQCx7
  [iz 4545690] — CLS popravek na /pot poteh ŽIV v produkciji: obe poti
  0.3805/0.3393 → 0.0000 [Performance API 412×823 + Lighthouse mobile/simulate
  nad produkcijo z 0 runWarnings + SSR dokazi — cls-1401-evidence/];
  uvedla ga je samodejni uvajalni nadzornik v poskusu 2 ob 20:27:53 UTC, ko
  se je rolling okno kvote sprostilo ~23 h pred napovedanim resetom
  (29. 9. 20:11 UTC); nadzornik se je samodejno ustavil 20:42:53 po
  idempotenčni preverbi; iskreno: uspešen odgovor API-ja ni vseboval uid na
  vrhu, zato ga je skripta razvrstila kot „nenavaden“ — deployment potrjen z
  GET /v6/deployments; webhook za push 512ee07 je ostal tih (isti vzorec kot
  a1f4095/5608f9e); zaporedje dneva: 1.140.0 uvedena 19:14 UTC prek API
  ukaza [dpl_GQGhgLzQ] → push 512ee07 20:07:49 UTC → API zavrnjen s kvoto
  [api-deployments-free-per-day 100/100 — drugi projekti lastnika] →
  nadzornik 20:12 → uspeh 20:27:53 → živa 20:31; hladen prvi obisk ~90 s
  (znani pojav, topla instanca ~1 s); Render znano zaostaja za mainom —
  lastnikova akcija deploy iz dashboarda, Issue #7)
- **Baza:** Neon PostgreSQL (pooler, `connection_limit=1`); migracije na produkcijo:
  `./scripts/ops/migrate-deploy.sh "<neon-url>"`
- **CI (GitHub Actions):** lint + typecheck + build proti `postgres:16-alpine`
- **Cron (8 opravil, `vercel.json`, Bearer `CRON_SECRET`):**

| Urnik (UTC) | Endpoint | Opis |
|---|---|---|
| `0 6 * * *` | `/api/cron/daily-trip-push` | dnevni push opomniki |
| `0 7 * * *` | `/api/cron/recalculate-status` | preračun statusov |
| `0 8 1 * *` | `/api/cron/commission-invoices` | mesečni obračun provizij |
| `0 8 * * 1` | `/api/cron/weekly-alerts` | tedensko B2B poročilo |
| `0 9 * * *` | `/api/cron/renewal-reminders` | opomniki obnov |
| `0 10 * * *` | `/api/cron/draft-reminders` | nudge osnutkov |
| `30 7 * * 2` | `/api/cron/sto-reingest` | osvežitev STO virov |
| `30 7 * * 3` | `/api/cron/kiwitaxi-reingest` | osvežitev KT feeda |

- **Po deployu:** `bash scripts/verify/production-smoke.sh` (varni GET preverki,
  cron fail-closed, markerji verzije)
- Podrobni postopki, runbooki in okvare: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

---

## Poslovni model

- **B2C:** brezplačno — AI načrtovalec, klepet, iskanje, „vprašaj lokalca"; plačljive
  so le globoke konzultacije (freemium).
- **B2B (primarni):** provizija **12 % izključno na rezervacijah iz AI kanala**,
  **0 % na direktnih rezervacijah** (free); premium €149/mes in enterprise €499/mes
  (0 %). Mesečni obračun + računi (cron) + kartično plačilo (Stripe).
- **Affiliate:** provizije prek `/go` omrežja (Viator, Booking, DiscoverCars,
  Skyscanner, WorldNomads, SafetyWing, …).
- **Beta:** vsi paketi brezplačni do 30 lokalov.

---

## Dokumentacija

**Produkt**
[PRODUCT-BLUEPRINT.md](PRODUCT-BLUEPRINT.md) ·
[TECHNICAL-SPECIFICATION.md](TECHNICAL-SPECIFICATION.md) ·
[docs/COMPETITIVE-ANALYSIS.md](docs/COMPETITIVE-ANALYSIS.md) ·
[docs/COMPETITIVE-ANALYSIS-MINDTRIP.md](docs/COMPETITIVE-ANALYSIS-MINDTRIP.md) ·
[docs/OUTREACH-TOOLKIT.md](docs/OUTREACH-TOOLKIT.md) ·
[docs/PILOT-TEST-PROTOCOL.md](docs/PILOT-TEST-PROTOCOL.md) ·
[docs/PILOT-VALIDATION-GATE.md](docs/PILOT-VALIDATION-GATE.md)

**Arhitektura**
[docs/ADR.md](docs/ADR.md) ·
[docs/DATA-FLOW.md](docs/DATA-FLOW.md) ·
[docs/DATA-LAYERS-RAG.md](docs/DATA-LAYERS-RAG.md) ·
[docs/ANALYTICS-EVENTS.md](docs/ANALYTICS-EVENTS.md) ·
[docs/FEATURE-FLAGS.md](docs/FEATURE-FLAGS.md)

**Providerji in journey**
[docs/TASK-53-ALL-PROVIDERS-READY.md](docs/TASK-53-ALL-PROVIDERS-READY.md) ·
[docs/PROVIDER-APPLICATIONS.md](docs/PROVIDER-APPLICATIONS.md) ·
[docs/TASK-58-FULL-PROVIDER-JOURNEY.md](docs/TASK-58-FULL-PROVIDER-JOURNEY.md) ·
[docs/TASK-58-JOURNEY-AUDIT.md](docs/TASK-58-JOURNEY-AUDIT.md) ·
[docs/TASK-58-MY-TRIP-ACCEPTANCE.md](docs/TASK-58-MY-TRIP-ACCEPTANCE.md) ·
[docs/TRAVEL-SUPPLY-MAP-AUDIT.md](docs/TRAVEL-SUPPLY-MAP-AUDIT.md)

**Operacije**
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) ·
[docs/BACKUP-RECOVERY.md](docs/BACKUP-RECOVERY.md) ·
[docs/INCIDENT-PLAYBOOK.md](docs/INCIDENT-PLAYBOOK.md) ·
[docs/OBSERVABILITY-PLAN.md](docs/OBSERVABILITY-PLAN.md) ·
[docs/MIGRATION-STRATEGY.md](docs/MIGRATION-STRATEGY.md) ·
[docs/SEED-STRATEGY.md](docs/SEED-STRATEGY.md) ·
[docs/VERSIONING.md](docs/VERSIONING.md)

**Varnost**
[SECURITY.md](SECURITY.md) ·
[docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md) ·
[docs/ACCESSIBILITY-REVIEW.md](docs/ACCESSIBILITY-REVIEW.md)

**Validacija / auditi**
[docs/TASK-49-PRODUCT-READINESS-AUDIT.md](docs/TASK-49-PRODUCT-READINESS-AUDIT.md) ·
[docs/TASK-51-GEOGRAPHIC-COHERENCE.md](docs/TASK-51-GEOGRAPHIC-COHERENCE.md) ·
[docs/TASK-56-P2-HARDENING.md](docs/TASK-56-P2-HARDENING.md) ·
[CHANGELOG.md](CHANGELOG.md)

Varnostni mechanismi v kratkem: vsa vsebina skozi moderacijo
(draft → pending → published, re-moderacija ob spremembi), `tokenVersion`
invalidacija sej ob resetu gesla, lastniški dostopi (IDOR/BOLA), Stripe webhook
podpis + dedup, prompt-injection ovojnica (`SYSTEM_DATA_GUARD`), fail-closed cron,
rate limiting na občutljivih poteh.

---

## Razvojna zgodovina

Podrobna zgodovina implementacije (naloge, auditi, odločitve, živi dokazi) se vodi
ločeno od tega README-ja: [CHANGELOG.md](CHANGELOG.md) (vse verzije po Keep a
Changelog), [docs/](docs/) (dokumentacija nalog in auditov) ter git zgodovina.
Pravila za razvoj in prispevke: [AGENTS.md](AGENTS.md) · [CONTRIBUTING.md](CONTRIBUTING.md).
Trenutna verzija: **1.150.0**.

---

## License

MIT — see [LICENSE](LICENSE)
