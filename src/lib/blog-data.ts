// Slovenski blog članki — SEO vsebina za "I Feel Slovenia" platformo.
// 6 člankov, ki pokrivajo naravo, kulinariko, kulturo, avanturo in nasvete.

export type BlogCategory =
  | "narava"
  | "kulinarika"
  | "kultura"
  | "avantura"
  | "nasveti";

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string; // 1-2 stavka povzetek
  content: string; // markdown vsebina (3-5 odstavkov)
  image: string;
  category: BlogCategory;
  author: string;
  date: string; // ISO datum
  readTime: number; // minute
  relatedDestination?: string; // id destinacije iz slovenia-data.ts
}

export const BLOG_CATEGORIES: { value: BlogCategory | "all"; label: string }[] = [
  { value: "all", label: "Vsi" },
  { value: "narava", label: "Narava" },
  { value: "kulinarika", label: "Kulinarika" },
  { value: "kultura", label: "Kultura" },
  { value: "avantura", label: "Avantura" },
  { value: "nasveti", label: "Nasveti" },
];

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "blejsko-jezero-vodic",
    title: "Blejsko jezero: Vodič za popoln obisk",
    excerpt:
      "Blejsko jezero je najbolj prepoznavna slovenska razglednica. Spoznajte najboljše čas obiska, kaj početi in kako izkoristiti dan ob alkanskem biseru.",
    content: `## Zakaj Blejsko jezero?

Blejsko jezero je nedvoumen simbol Slovenije — srednjeveški grad na pečini, otok s cerkvijo sred jezera in kristalno čista voda obkrožena z Julijci. Le 45 minut vožnje od Ljubljane in 2 uri od Dunaja, Bled je idealen za enodnevni izlet ali romantični vikend.

## Najboljši čas obiska

Najlepše je od **maja do oktobra**, ko so temperature prijetne in jezero primerno za plavanje. Zjutraj ob šesti uri jezeru vlada tišina in mehka jutranja svetloba — raj za fotografije. Pozimi jezero včasih zaledeni in ponuja edinstven prizor, a večina aktivnosti je takrat omejena.

## Kaj ne sme manjti

1. **Pletna vožnja do otoka** — tradicionalna lesena čolna, ki jih vlečejo s posebnimi vesli, vodijo že generacije Bledcev. Voznja traja 15 minut, nato se 99 stopnic vzpenja do cerkve.
2. **Blejski grad** — najstarejši slovenski grad (prvič omenjen 1011) s skoraj 100 metrov visoke pečine ponuja najboljši razgled na jezero.
3. **Vintgarska soteska** — 1,6 km dolga soteska ob reki Radovni, le 4 km stran.
4. **Kremšnita** — v slaščičarni Smon ob jezeru so to znamenito sladico pripravljali že od leta 1953.

## Nasveti za obisk

- **Vstopnice za grad**: ~€15 za odrasle, vključuje muzej in razgledišče.
- **Pletna vožnja**: ~€16 na osebo (pogosto čakalne vrste ob vikendih).
- **Brezplačno**: sprehod okoli jezera (3,5 km, ~1 ura), plavanje na plavalnem pomolu.
- Najem kolesa (€10/dan) je odličen način za raziskovanje okolice.

## Kje spati

Izbira je velika — od luksuznega Grand Hotel Toplice ob jezeru do prijaznih penzionov v vaseh Podhom in Ribno. Rezervirajte zgodaj, še posebej poleti.`,
    image: "https://sfile.chatglm.cn/images-ppt/65ea408c89ea.jpg",
    category: "narava",
    author: "Tanja Novak",
    date: "2025-03-12",
    readTime: 5,
    relatedDestination: "bled",
  },
  {
    slug: "soca-adrenalinski-vodnik",
    title: "Soča: Adrenalinski vodnik za poletje",
    excerpt:
      "Smaragdna reka med Julijci je raj za adrenalinže. Od raftinga do canyoninga — spoznajte najboljše adrenalinske aktivnosti ob Soči.",
    content: `## Smaragdna lepota

Reka Soča je ena redkih rek na svetu, ki ohranja svojo značilno smaragdno barvo skozi vse leto. Vije se 138 km skozi Tolmin, Bovec in Kobarid, skozi Julijce in Triglavski narodni park. Njen slavni opis »reka, ki teče neba« je zapisal pesnik Simon Gregorčič.

## Najboljše adrenalinske aktivnosti

### Rafting
Klasična tura od Bovca do Trnega ob Soči traja 2 uri in je primerna tudi za začetnike. Cena: €35–45 na osebo. Najboljši pogoji so od maja do septembra.

### Kajakaštvo
Za izkušene veslače Soča ponuja odseke razreda III–IV. Začetniki lahko začnejo na umirjenem odseku pri Srpenici. Tura z vodičem: €50–65.

### Canyoning
Sestopanje po divjih grapah s skoki v naravne bazene, drsenje po naravnih toboganih. Suša, Fratarca in Predelica so najbolj znane soteske. Cena: €50–70, trajanje 3–4 ure.

### Zip-line
Pletena mreža jeklenic nad dolino Učja (najdaljša 700 m) omogoča let nad drevesnimi krošnjami. €40–55.

## Kaj storiti za vreme

Soška dolina je redko deževna poleti, a pozorno spremljajte vremensko napoved — nevihte v gorah lahko povzročijo nenadno dvig vode. V primeru dežja obiščite:

- **Kobaridski muzej** — zgodovina Soške fronte
- **Trdnjava Kluže** — utrdba iz 15. stoletja
- **Tolminska korita** — najgloblja soteska v Sloveniji

## Kje počivati

Bovec je epicenter aktivnosti, a Cezsoča in Čezsoča ponujajo tišje nastanitve. Za avanturiste je na voljo tudi kamp Soča Rocks.`,
    image: "https://sfile.chatglm.cn/images-ppt/5f720abe0af2.jpg",
    category: "avantura",
    author: "Matej Horvat",
    date: "2025-02-18",
    readTime: 6,
    relatedDestination: "soca",
  },
  {
    slug: "slovenska-kulinarika-7-jedi",
    title: "Slovenska kulinarika: 7 jedi ki jih morate poskusiti",
    excerpt:
      "Od štrukljev do potice — slovenska kuhinja je presenetljivo raznolika. Tu je 7 jedi, ki definirajo slovensko mizo.",
    content: `## Mali narod, velika kulinarična raznolikost

Slovenska kuhinja je križanje treh svetov — alpskega, sredozemskega in panonskega. Na majhnem ozemlju boste našli sveže morske sadeže, divjačino iz gozdov, vinske sorte, ki jih drugod ne poznajo, in sladice, ki se prenašajo skozi generacije.

## 7 jedi, ki jih morate poskusiti

### 1. Štruklji
Kuhani ali pečeni zavitki iz vlečenega testa s skoraj neštetimi polnili — od tunine do oreščkov. Najbolj znani so s toleranco, jabolkom ali makom.

### 2. Žlikrofi
Idrijski žlikrofi so slovenska različica raviolijev — mali dvignjeni žepki iz testa s krompirjevo oblogo. Zaščiteni z oznako tradicionalne uglednosti od leta 2002.

### 3. Kranjska klobasa
Zaščitena z geografsko označbo EU. Sestavine: svinjsko meso, slanina, česen, sol in poper. Nikoli ne dodajamo krompirja ali mleka. Najboljša je z žgancem in kislim zeljem.

### 4. Ajdovi žganci
Tradicionalna jed kmečke kuhinje — ajdova kaša z drobtinami, pogosto postrežena s kislim mlekom ali ocvirki. Preprosto, nasitno in polno pomembnih mineralov.

### 5. Soška postrv
Slovenska Soča je dom soške postrvi — endemit z rožnatim mesom. Pripravljajo jo na žaru, v bujonski juhi ali prekajeno. Najboljša je sveže ujeta, seveda.

### 6. Prekmurska gibanica
Najbolj znana slovenska sladica — plastnata pita s skuto, makom, orehi in jabolki. Vsaka plast je ločena z vlečenim testom. Zaščitena z oznako tradicionalne uglednosti.

### 7. Potica
Praznični zavitek, ki ga pripravljajo za vsako slovensko priložnost — od božiča do porok. Klasična je z orehi ali rozinami, a obstaja več kot 80 različic.

## Kje jih poskusiti

Za pristno izkušnjo obiščite restavracije **Hiša Franko** (Kobarid), **Gostilna As** (Ljubljana) ali **Ošterija Debeluh** (Brežice). Za proračunsko varianto poizkusite lokalne **gostilne** v vaseh, kjer se recepti prenašajo skozi generacije.`,
    image:
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&h=800&fit=crop&q=80",
    category: "kulinarika",
    author: "Petra Kovač",
    date: "2025-01-22",
    readTime: 7,
  },
  {
    slug: "triglav-vzpon-vodic",
    title: "Triglav: Vzpon na najvišji vrh Slovenije",
    excerpt:
      "Triglav (2864 m) je narodni simbol in najvišji vrh Slovenije. Pripravite se pravilno — vodnik o opremi, poteh in najboljšem času za vzpon.",
    content: `## Zakaj Triglav?

Triglav ni le najvišji vrh Slovenije — je narodni simbol, ki krasa državni grb. Legenda pravi, da je pravi Slovenec dolžan vsaj enkrat v življenju stopiti na njegov vrh. Na njem stoji Aljažev stolp, najvišje ležeče zatočišče v državi.

## Dve glavni poti

### 1. Preko Triglavske koče (lahka variant, 2 dni)
Najbolj priljubljena smer. Iz doline Vrata po markantni poti do Triglavske koče (1525 m), prenočitev, naslednji dan vzpon preko Tominškove poti. Najtežji del je vzpon po grebenu z jeklenicami.

### 2. Preko Staničeve koče (težja variant, 2 dni)
Lepa, a zahtevnejša pot. Zahteva več plezanja po fixnih vrvih.

### Enodnevni vzpon?
Možen je za izkušene pohodnike, a priporočamo prenočitev — poleg tega boste videli sončni vzhod z vrha.

## Oprema

**Obvezno:**
- Pohodni čevlji z dobrim oprijemom
- Čelada (padajo kamenje)
- Najmanj 2 l vode
- Topla oblačila (tudi poleti je na vrhu 10–15 °C)
- Klopčič in predpasnik za sedenje na grebenu
- Razdalja med jeklenicami je 20–30 m — uporabite samozavarovanje

**Priporočeno:**
- Pohodne palice
- Klobuk in sončna očala
- Rezervne nogavice
- Prva pomoč

## Najboljši čas

Vzpon je mogoč od **julija do septembra**. Zunaj te sezone so razmere alpske, potrebna je zimska oprema in izkušnje. Tudi poleti preverite vremensko napoved — nevihte v gorah so nevarne.

## Nasveti

- Rezervirajte prenočišče v koči vsaj 2 meseca vnaprej (poleti polne).
- Začnite zgodaj zjutraj (ob 5–6 uri) za varnejše razmere na grebenu.
- Na vrhu ne ostanite predolgo — vreme se lahko hitro spremeni.
- Spoštljivo do narave: vzemite smeti s seboj.

Triglav ni cilj — je pot. Uživajte v pohodu, ne le v vrhu.`,
    image: "https://sfile.chatglm.cn/images-ppt/f1fdf5ca02fe.jpg",
    category: "avantura",
    author: "Blaž Zupan",
    date: "2025-02-03",
    readTime: 8,
    relatedDestination: "triglav",
  },
  {
    slug: "piran-slovenska-obala-24-ur",
    title: "Piran in slovenska obala v 24 urah",
    excerpt:
      "Kako izkoristiti 24 ur na slovenski obali? Spoznajte Piran, Portorož in soline Sečovlje v enem dnevu — z najboljšo hrano in razgledi.",
    content: `## Slovenska obala — majhna a čudovita

Slovenija ima le 47 km obale, a je vsak meter vreden obiska. Piran je najbolj slikovito mestece — beneško arhitekturo, ozke uličice in Tartinijev trg. Portorož je bolj sodoben, z hoteli in casinojem. Soline Sečovlje so naravni rezervat z edinstveno solinsko tradicijo.

## Jutranji sprehod po Piranu

Začnite dan ob 8. uri na Tartinijevem trgu — srednjeevropsko največji marmornati trg. Včasih je bil pristanišče, zdaj je srce mesta. Spoznajte rojstno hišo violinista Giuseppeja Tartinija (1692–1770), katerega kip stoji na sredini trga.

Vzpnite se po strmih stopnicah do **cerkve sv. Jurija** (14. st.) — najboljši razgled na mesto in morje. Zvonik je replika beneškega zvonika sv. Marka.

## Kosilo: morska hrana

Slovenska obala ponuja najboljšo morsko hrano v državi. Top priporočila:

- **Pavel** (Piran) — fine dining z lokalnimi sestavinami
- **Fritolin pri Cantini** (Izola) — sveža riba na preprost način
- **Ribic** (Portorož) — lokalna gostilna z odličnimi morskimi sadeži

Naročite **sipe na žaru**, **črn riž s squidom** ali **tuno iz Koperja**.

## Popoldan: soline Sečovlje

10 minut vožnje od Portoroža so soline Sečovlje — edinstven solinski rezervat z 700-letno tradicijo. Sprehodite se po solnih poljih, spoznajte delo solinarjev in obiščite muzej. Vstop: €5.

Tukajšnje **soline so dom najmanjše kopenske želve v Sloveniji** — navadne močvirnice. Če imate srečo, jih boste opazili.

## Večer: sončni zahod in vino

Piran je znan po sončnih zahodih. Najboljši razgled je s pomola ob cerkvi sv. Jurija, kjer se za obzorjem potopi v Jadransko morje. Po zahodu se usedite v eno od občanskih vinotek in poskusite **malvazijo** ali **refošk** — dve lokalni sorti.

## Nasveti za enodnevni obisk

- **Parkirajte v Fiesi** (€1,5/h) in se peljite z avtobusom v Piran (brezplačno).
- Če imate čas, obiščite še Koper in Izolo — avtobusni prevozi vozijo vsakih 30 minut.
- Kopalna sezona je od junija do septembra.
- Najem kolesa (€10/dan) je odličen način za obisk cele obale.`,
    image: "https://sfile.chatglm.cn/images-ppt/1ca2f342127f.jpg",
    category: "kultura",
    author: "Maja Dolenc",
    date: "2025-03-04",
    readTime: 6,
    relatedDestination: "piran",
  },
  {
    slug: "zima-v-sloveniji-smucanje-thermalni",
    title: "Zima v Sloveniji: Smučanje in termalni vrelci",
    excerpt:
      "Slovenska zima ponuja dve strani — adrenalinsko smučanje na Julijcih in sprostitev v termalnih vrelcih. Spoznajte najboljše destinacije za zimske mesece.",
    content: `## Dvojna slovenska zima

Slovenska zima je presenetljiva. En dan smučate po prahu na 2000 m višine, naslednji dan se sproščate v 38 °C topli termalni vodi. Vse to v pol dneh vožnje. Za tiste, ki iščejo aktivno zimo, je Slovenija skrita evropska destinacija.

## Najboljše smučišča

### Kranjska Gora
Najbolj znano smučišče v Sloveniji z 18 progami in 30 km prog. Vsako leto gosti svetovni pokal v alpskem smučanju (Vitranc). Primerno za družine in začetnike. Dnevna karta: €38–45.

### Mariborsko Pohorje
Največje nočno smučanje v Sloveniji in dom legendarnega Zlati lisjak smučarskega tekmovanja. 41 km prog, le 10 min od središča Maribora. Dnevna karta: €33–40.

### Vogel (Bohinj)
Smučanje z najlepšim razgledom v Sloveniji — pogled na Bohinjsko jezero in Triglav. 22 km prog, višina 1800 m. Dnevna karta: €37–42.

### Kanin (Bovec)
Najvišje ležeče smučišče v Sloveniji (do 2300 m). Pogosto odprto do maja. Zahtevnejše proge, primerno za izkušene smučarje. Dnevna karta: €42–48.

## Termalni vrelci

Po napornem dnevu na smučišču ni nič boljšega kot topla termalna voda. Slovenska termalna mesta imajo dolgo tradicijo.

### Rogaška Slatina
Elegantno zdravilišče z 400-letno tradicijo. Mineralna voda Donat Mg z najvišjo vsebnostjo magnezija na svetu. Bazeni z vodo do 36 °C.

### Terme Čatež
Največje termalno letovišče v Sloveniji s poletno in zimno različico bazenov. Idealno za družine. Voda do 36 °C.

### Terme Dobrna
Najstarejše slovensko zdravilišče (1418). Romantično vzdušje, manj komercialno kot druge terme. Odlično za pare.

### Terme Olimia
Sodobno zdravilišče z wellness centrom in največjim kompleksom savn v Sloveniji (Sauna Village). Voda do 35 °C.

## Idealni zimski vikend

**Petek**: Prihod v Kranjsko Goro, smučanje popoldan, večerja v gostilni.
**Sobota**: Zjutraj smučanje, popoldan prevoz do Terme Čatež (1,5 h vožnje), sprostitev v termalni vodi.
**Nedelja**: Jutranji zajtrk, savna, pot domov.

## Nasveti za zimski obisk

- **Snežne razmere** spremljajte na portalu slovenia.info.
- **Družinski paketi**: mnoga smučišča ponujajo brezplačne karte za otroke do 6 let.
- **Termalna letovišča** so pogosto cenejši od smučiščnih hotelov — kombinacija je smiselna.
- **Decembrski božični sejmi** v Ljubljani in Mariboru so obvezni obisk.`,
    image:
      "https://images.unsplash.com/photo-1551524559-8af4e6624178?w=1200&h=800&fit=crop&q=80",
    category: "nasveti",
    author: "Saša Krajnc",
    date: "2025-01-08",
    readTime: 7,
  },
];

// Pomožne funkcije
export function getPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

export function getPostsByCategory(category: BlogCategory | "all"): BlogPost[] {
  if (category === "all") return BLOG_POSTS;
  return BLOG_POSTS.filter((p) => p.category === category);
}
