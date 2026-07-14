// Slovenski blog članki — SEO vsebina za "Discover Slovenia AI" platformo.
// 16 člankov, ki pokrivajo naravo, kulinariko, kulturo, avanturo in nasvete.

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
    image: "https://sfile.chatglm.cn/images-ppt/ed8d38609552.jpg",
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
      "https://sfile.chatglm.cn/images-ppt/d08bfb619a1a.jpg",
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
    image: "https://sfile.chatglm.cn/images-ppt/0cbde96d84ea.jpg",
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
    image: "https://sfile.chatglm.cn/images-ppt/5b98e63b6641.jpg",
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
      "https://sfile.chatglm.cn/images-ppt/24e0319040cc.jpg",
    category: "nasveti",
    author: "Saša Krajnc",
    date: "2025-01-08",
    readTime: 7,
  },
  // === NOVI ČLANKI — Task 30-a (+10 = 16 skupaj) ===
  {
    slug: "vintgarska-soteska-vodic",
    title: "Vintgarska soteska: Vodič po naravnem bisuu ob Bledu",
    excerpt:
      "1,6 km dolga soteska ob reki Radovni le 4 km od Bleda — lesen most, slap Šum in kristalno čista voda. Vse za popoln obisk.",
    content: `## Naravni biser 4 km od Bleda

Vintgarska soteska (Vintgar Gorge) je 1,6 km dolga soteska, ki jo je reka Radovna vrezala v apnenec med Bledom in Gorami. Odkrita leta 1891, ko je lokalni župan Jakob Žumer ob nizki vodi stopil v sotesko in presenečen objavil naravni biser. Od takrat je ena najbolj obiskanih naravnih znamenitosti v Sloveniji.

## Sprehod po lesenih potih

Skozi sotesko vodijo lesene poti, vrezane v skalne stene ob reki. Pohod traja 1-1,5 ure in je primeren za vse starosti. Ob poti boste videli brzice, tolmune, naravne bazene in končno slap Šum — največji slovenski rečni slap po pretoku.

## Kaj si ogledati

1. **Slap Šum** — 13 metrov visok slap, ki zaključuje sotesko
2. **Leseni mostovi** — podirljive konstrukcije, vrezane v skalne stene
3. **Hudomušnica** — najbolj razburljiv del soteske z najhitrejšo vodo
4. **Razgledna točka** — pogled na Blejsko kotlino in Košuto

## Najboljši čas obiska

Soteska je odprta od aprila do oktobra. Najlepše je v **juniju in septembru**, ko je voda najbolj bistra. V juliju in avgustu je mnogo obiskovalcev — začnite zgodaj zjutraj ob 8. uri. Po dežju se voda dvigne in soteska postane še bolj dramatična, a so lahko lesene poti zaprte zaradi visoke vode.

## Nasveti za obisk

- **Vstopnica**: €10 za odrasle, €2 za otroke. Parkirišče je brezplačno.
- **Vremenska omejitev**: pri visoki vodi sotesko zaprejo — preverite na spletni strani.
- **Oblačila**: lahka pohodna obutev, v soteski je 5-10 °C hladneje kot zunaj.
- **Fotoaparati**: vzemite polarizacijski filter za manj odsevov na vodi.

## Kombinacija z Bledom

Vintgarska soteska je idealen dodatek k obisku Bleda. Priporočamo jutranji obisk soteske (8:00) in popoldanski Bled — grad in kremšnita. Skupaj naredite popoln enodnevni izlet.`,
    image:
      "https://sfile.chatglm.cn/images-ppt/4cf4cf182837.jpg",
    category: "narava",
    author: "Lara Zupan",
    date: "2025-04-05",
    readTime: 5,
    relatedDestination: "vintgar",
  },
  {
    slug: "cvicek-in-dolenjska-kuhinja",
    title: "Cviček in dolenjska kuhinja: Vodič po lokalnih okusih",
    excerpt:
      "Cviček je kralj dolenjskih vin, dolenjska kuhinja pa je kmečka, enostavna in polna okusa. Spoznajte najboljše jedi in vinarje.",
    content: `## Cviček — dolenjski kralj

Cviček je tradicionalno dolenjsko vino z zaščiteno označbo porekla. Narejen iz mešanice rdečih in belih sort (žlahtna metka, modra frankinja, kraljevina, laški rizling). Nizka vsebnost alkohola (8-10%), sveža kislina, rdeča barva z rubinastim odtenkom. Cviček je namenjen vsakodnevni mizi in najboljša spremljava dolenjski kulinariki.

## Kulinarična dediščina Dolenjske

Dolenjska kuhinja je kmečka, enostavna in polna okusa. Temelji na lokalnih sestavinah — krompirju, zelju, svinjini, divjačini in gobah. Vsaka jed ima svojo zgodovino in pripada določenemu letnemu času.

## 5 jedi, ki jih morate poskusiti

### 1. Štruklji
Dolenjski štruklji so kuhani ali pečeni zavitki iz vlečenega testa, najpogosteje s skuto, tolaranco ali jabolki. Postrežejo se kot priloga ali sladica.

### 2. Matevž
Tradicionalna jed iz bobov in krompirja, pireja z ocvirki. Bogata z beljakovinami, enostavna za pripravo, popolnoma slovenska.

### 3. Ajdovi žganci
Ajdova kaša z drobtinami, postrežena s kislim mlekom ali ocvirki. Preprosto, nasitno in polno mineralov.

### 4. Koline in krvavica
Koline so v Dolenjski še vedno pomemben december dogodek. Krvavica (krvna klobasa) z ajdovo kašo in drobnim drobtinami je klasika.

### 5. Pogača
Dolenjska pogača je kvasna pogača s cracklingi (ocvirki). Postreže se topla, najbolje z rcviii.

## Najboljše vinarije

- **Vinska klet Cviček** (Novo mesto) — specializirana za cviček z degustacijami
- **Klet Golje** (Vipava) — bolj primorska, a odlična kombinacija
- **Domačija Škerl** (Dolenjske Toplice) — družinska klet z avtentično kuhinjo

## Kulinarična tura po Dolenjski

Za popolno izkušnjo rezervirajte 1-dnevno vinsko-kuharično turo: jutranja degustacija v Novem mestu, kosilo v domačiji ob Krki, popoldanski sprehod po Otočcu in večerna večerja v gradu. Cena: €80-120 na osebo.

## Nasveti

- Cviček je najboljši svež — ne hranite ga dlje kot 1 leto.
- Dolenjske gostilne so pogosto zaprte ob nedeljah zvečer — preverite odpiralne ure.
- Najboljši čas za obisk: september in oktober, ko so trgatev in koline.`,
    image:
      "https://sfile.chatglm.cn/images-ppt/4b0974438031.jpg",
    category: "kulinarika",
    author: "Petra Kovač",
    date: "2025-07-12",
    readTime: 6,
    relatedDestination: "novo-mesto",
  },
  {
    slug: "bohinj-pozimi",
    title: "Bohinj pozimi: Smučanje, pohodi in tople jazbe",
    excerpt:
      "Bohinj pozimi je tihi, snežni raj. Smučanje na Voglu, pohodi na Komno in sprostitev v toplih jazbah — vodnik za zimski obisk.",
    content: `## Zimski mir v Triglavskem narodnem parku

Bohinj pozimi je vse, kar Bled ni — tihi, divji, pristen. Ko se turistični vrvež Bleda poleže, Bohinj ohranja svoj mir. Snežne planine, zaledeno jezero in dim iz kaminov v vaseh. Za tiste, ki iščejo pravo alpsko zimo, je Bohinj najboljša izbira.

## Smučanje na Voglu

Vogel je smučišče z najlepšim razgledom v Sloveniji — pogled na Bohinjsko jezero in Triglav s smučarske žičnice. 22 km prog, višina 1800 m. Dnevna karta: €37-42. Smučišče je odprto od decembra do aprila, najboljše razmere so v februarju in marcu.

Za družine z otroki je idealno vzporedno smučišče Soriška planina — manjše, cenejše in manj obiskano.

## Pohodi v zimskem času

### Komna (1520 m)
Najlažji zimski pohod. Iz Koče na Voglu z vlečnico, nato 2 uri pohoda do Komne. Prenočitev v planinski koči, vrnitev naslednji dan. Pogled na Julijce.

### Slap Savica
Znamenit slap Savica je dostopen tudi pozimi. 20-minutni sprehod iz parkirišča. Zima je najbolj dramatičen čas — slap delno zamrzne.

### Pokljuka
Planina Pokljuka je smučarska in biatlonska arena. Zimske turneje po gozdu in planotah, dostopno z avtom.

## Topla jazba v naravi

Bohinj ima dolgo tradicijo toplih jazb. Najbolj znana je **Jazba v Stari Fužini** — lesena zgradba z vrtoglavim pogledom na zasneženo dolino. Vstop: €25 za 2 uri.

## Kje jesti in spati

- **Hotel Jezero** (Ribčev Laz) — leži ob jezeru, sproščujoče vzdušje
- **Penzion Mantova** (Stara Fužina) — družinski penzion z odlično kuhinjo
- **Gostilna Rupa** (Stara Fužina) — tradicionalna bohinjska kuhinja

Za proračunsko varianto: apartmaji v vasi Srednja vas (€50-70/noc).

## Nasveti za zimski obisk

- **Zimska oprema**: snežne verige obvezne za avto, smučarska oprema v najemu na Voglu.
- **Vremenska napoved**: preverite na planinske-razmere, preden greste v gore.
- **Odprtje prog**: Vogel odpre, ko je vsaj 30 cm snega — sledite na vogel.si.
- **Bohinjsko jezero**: vsako leto preveri ali jezero zamrzne — ne zaupajte ledu, če ni uradno odprto za drsanje.

Bohinj pozimi ni le destinacija — je izkušnja miru in narave v njeni najbolj pristni obliki.`,
    image:
      "https://sfile.chatglm.cn/images-ppt/cd8b734ba670.jpg",
    category: "narava",
    author: "Lara Zupan",
    date: "2025-04-18",
    readTime: 6,
    relatedDestination: "bohinj",
  },
  {
    slug: "kolesarjenje-ob-dravi",
    title: "Kolesarjenje ob Dravi: Od Maribora do Ptuja",
    excerpt:
      "Kolesarska pot ob Dravi je ena najlepših v Sloveniji. 35 km od Maribora do Ptuja skozi vinograde in vasice. Vodnik za enodnevni izlet.",
    content: `## Kolesarski raj ob reki Dravi

Kolesarska pot Drava je 35 km dolga proga od Maribora do Ptuja, ki poteka ob reki Dravi. Ena najbolj priljubljenih kolesarskih poti v Sloveniji, primerna za družine in rekreativce. Teren je raven, asfaltiran, ločen od avtomobilskega prometa.

## Izhodišče: Maribor

Začnite v Mariboru, na Lentu — najstarejšem delu mesta ob Dravi. Ogled Stare trte (najstarejša trta na svetu, 400+ let) in Glavnega trga. Pred najemom kolesa (€15/dan) se okrepčajte z lokalno kavo v eni od lentnih kavarn.

## Kolesarjenje skozi Halozanske vinograde

Po 10 km zapustite Maribor in vstopite v Halozanske vinograde. Cesta se vije ob Dravi skozi vasice:
- **Mariborsko jezero** — umetno jezero, poletna plaža
- **Kamnica** — prva vasica z vinsko kletjo
- **Limbuš** — lokalno znana po rečni terasi s pogledom
- **Selnica ob Dravi** — tradicionalna kmečka vas

## Postanek v Vurberku

Na polovici poti je Vurberk — vas z gradom (turška utrdba iz 13. stoletja) in eno najstarejših vinskih kleti v regiji. Postanite za kosilo v gostilni Vurberk — tradicionalna štajerska kuhinja z renskim rizlingom.

## Prihod v Ptuj

Po 35 km in 3-4 urah kolesarjenja prispete v Ptuj — najstarejše mesto v Sloveniji. Obvezno si oglejte:
- **Ptujski grad** na hribu nad mestom z muzejem
- **Stari trg** z baročno mestno hišo
- **Rimske izkopanine** — ostanki Poetovie
- **Terme Ptuj** — za sprostitev po kolesarjenju

## Najem koles in logistika

- **Najem kolesa**: v Mariboru na postajah Sobotnič (€15/dan)
- **Vračilo kolesa**: v Ptuju v lokalu Sobotnič ali vrnitev v Mariboru z vlakom (€5)
- **Osebno kolo**: povsod dovoljeno, klobuk obvezn
- **Lokalni prevoz**: vlak Ptuj-Maribor vozí vsako uro, prevoz koles €3

## Nasveti

- **Najboljši čas**: april do oktober. Najlepše v maju (cvetoče sadno drevje) in septembru (trgatev).
- **Vreme**: poleti je vetrno — pripravite se na prevladujoč severni veter.
- **Oprema**: klobuk, sončna očala, vsaj 2 l vode na osebo.
- **Družine**: pot je primerna za otroke od 8. leta dalje. Za manjše otroke priporočamo kolesarski prikolico.

Kolesarjenje ob Dravi je idealen enodnevni izlet, ki združuje naravo, zgodovino in kulinariko v eni nepozabni izkušnji.`,
    image:
      "https://sfile.chatglm.cn/images-ppt/528b9cc50ea4.jpg",
    category: "avantura",
    author: "Matej Horvat",
    date: "2025-05-22",
    readTime: 5,
    relatedDestination: "maribor",
  },
  {
    slug: "kam-na-pohorju",
    title: "Kam na Pohorju: Vodnik po smučanju, pohodih in turizmu",
    excerpt:
      "Pohorje je največja slovenska planota — smučanje, pohodi, gondola in tradicionalna kuhinja. Vodnik po najboljših destinacijah na Pohorju.",
    content: `## Pohorje — največja slovenska planota

Pohorje je največja slovenska planota, ki se razprostira od Maribora do Slovenj Gradca. Pozimi smučišče, poleti pohodniški raj. Dolžina 60 km, najvišji vrh Črni vrh (1543 m). Najbolj znani centri: Mariborsko Pohorje, Ribniško Pohorje in Kope.

## Smučanje pozimi

### Mariborsko Pohorje
Največje smučišče v Sloveniji z 41 km prog in največjim nočnim smučanjem. Domača proga legendarnega Zlati lisjak (svetovni pokal v ženskem veleslalomu). Dnevna karta: €33-40. Odprto od decembra do marca.

### Ribniško Pohorje
Družinsko smučišče, manj obiskano. 13 km prog, primerno za začetnike in otroke. Dnevna karta: €25-30. Počitniške hišice in apartmaji v bližini.

### Kope
Najbolj zahodni del Pohorja ob meji z Avstrijo. Manjše smučišče, odlično za turno smuko in tekaško smučanje.

## Pohodi poleti

### Črni vrh (1543 m)
Najvišji vrh Pohorja. Izhodišče v Slovenj Gradcu, 4-5 ur pohoda. Na vrhu razgledni stolp z najboljšim pogledom na Koroško.

### Bistriški slom
Eden najlepših slapov na Pohorju. 20 m visok, dostopen z avtom. Vhod €3, otvoritveno od maja do oktobra.

### Lovrenška jezera
Sedem visokogorskih jezer na višini 1500 m. Dostopno iz Hoč s pohodom 3 ure. Edinstvena flora in favna.

## Turizem in atrakcije

### Gondola Mariborsko Pohorje
Najnovejša atrakcija — gondola izpod Maribora na vrh Pohorja. 10 minut vožnje, panoramski pogled na mesto in vinograde. Vstop: €12 povratno.

### Hubelj in Dvojni izvir
Največji izvir na Pohorju, ki napaja reko Hubelj. Dostopen iz Slovenj Gradca, pohod 1,5 ure.

### Boč
Najvzhodnejši del Pohorja, botanični rezervat z redkimi rastlinami. Pohod iz Poljčane (2 uri).

## Kulinarične znamenitosti Pohorja

- **Pohorski žlikrofi** — lokalna različica idrijskih žlikrofov, s kurjim mesom
- **Pohorska omaka** — gosta gobeva omaka z žganci
- **Bukovniška voda** — tradicionalni bukov sok iz lokalnih dreves
- **Pohorski sir** — trdi sir iz kmetijskih sirarn na pašnikih

## Kje spati

- **Hotel Arena** (Mariborsko Pohorje) — sodoben 4* hotel ob smučišču
- **Planinska koča Črni vrh** — preprosta koča na vrhu, prenočitev €25
- **Turistična kmetija Žigon** (Ribnica na Pohorju) — družinska kmetija s hrano
- **Apartmaji Ribnica** — samostojni apartmaji €50-70/night

## Nasveti

- **Smučarske karte** pred rezervirajte na spletu (20% popust)
- **Pohodne poti**: preverite na planinske-razmere, da so odprte
- **Družine**: Mariborsko Pohorje je najboljše za otroke (vsestranska ponudba)
- **Večerna aktivnost**: nočno smučanje na Mariborskem Pohorju vsak petek in soboto

Pohorje je celoletna destinacija, ki ponuja nekaj za vsak okus — od adrenalina na smučišču do miru v gozdu.`,
    image:
      "https://sfile.chatglm.cn/images-ppt/34d0335d5c60.jpg",
    category: "nasveti",
    author: "Blaž Zupan",
    date: "2025-11-08",
    readTime: 7,
    relatedDestination: "maribor",
  },
  {
    slug: "slapovi-slovenije",
    title: "Slapovi Slovenije: 10 najlepših za obisk",
    excerpt:
      "Slovenija je dežela slapov — od 80-metrskega Bokovega do najbolj obiskanega Blediškega. Spoznajte 10 najlepših slapov in kako jih obiskati.",
    content: `## Dežela slapov

Slovenija je ena najbogatejših dežel z slapovi na svetu glede na površino. Več kot 300 večjih slapov, večina v alpski in predalpski regiji. So naravni bisji, ki popestrijo vsak pohod. Tukaj je 10 najlepših slapov za obisk.

## 1. Slap Boka (106 m)

Najvišji slovenski slap, ki pada izpod vrha Bokove peči v Soško dolino. Dostopen iz vasi Žaga pri Bovcu (1 ura pohoda). Najbolj dramatičen spomladi, ko je voda najmočnejša.

## 2. Slap Savica (78 m)

Najbolj znan slovenski slap — zaključuje Vintgarsko sotesko in napaja Bohinjsko jezero. Poezijo »Krst pri Savici« je France Prešeren navdihnil ravno ob tem slapu. Vstop €3, dostopen z avtom.

## 3. Slap Kozjak (15 m)

Najbolj slikovit slovenski slap v soteski Kozjak pri Kobaridu. Pada v kraško vrtačo, obdan z zeleno modrim tolmunom. Vstop €3, dostop 20 min iz Kobarida.

## 4. Slap Peričnik (52 m)

Slap v vasi Gozd Martuljek, le 5 km od Kranjske Gore. Dvoplasten, s potjo za hrbtom slapa. Dostopen z avtom, brezplačno.

## 5. Slap Šum (13 m)

Slap, ki zaključuje Vintgarsko sotesko. Najbolj obiskan slovenski slap zaradi soteske. Vstop v sotesko €10.

## 6. Slap Rinka (90 m)

Slap v Logarski dolini (Solčavska regija). Eden najlepših slovenskih slapov, pade izpod Okrešlja. Vstop €3, dostopen z avtom do izhodišča.

## 7. Slap Kozjača (30 m)

Skriti slap v dolini Kamniške Bistrice. Pohod 3 ure iz izhodišča, najboljši v maju in juniju.

## 8. Slap Virje (12 m)

Manjši, a romantičen slap v vasi Virje ob reki Bistrica. Dostopen z avtom, idealen za kopanje poleti.

## 9. Slap Bistriški slom (20 m)

Slap na Pohorju pri Bistrici. Dostopen z avtom, vstop €3. Najboljši za družine.

## 10. Slap Iglica (28 m)

Slap v dolini Vrat pod Triglavom. Pada izpod stene Mojstrovke. Dostopen z avtom, pogled iz glavne ceste.

## Najboljši čas obiska

- **Pomlad (april-junij)**: najmočnejši pretok, najbolj dramatičen videz
- **Poletje (julij-avgust)**: manj vode, a bolj dostopno in vreme stabilno
- **Jesen (september-oktober)**: listje v barvah, manj obiskovalcev
- **Zima**: nekateri slapovi zamrznejo — edinstven prizor, a dostop otežen

## Oprema za obisk slapov

- **Pohodni čevlji** — drsne skalne površine
- **Klobuk in sončna očala** — tudi v senci odsevi
- **Polarizacijski filter** za fotoaparat — odstrani odseve na vodi
- **Dežni plašč** — ob visokem pretoku je vodna prha

## Nasveti

- **Spoštujte naravo**: ne stopajte v vodo blizu slapu — erozija lahko povzroči padec
- **Varnost**: otroci naj bodo pod nadzorom — tolmuni so globoki
- **Foto**: najboljši čas za fotografiranje je jutranja ali večerna svetloba

Slovenski slapovi so naravna galerija, ki jo obiščete lahko v eni pustolovščini.`,
    image:
      "https://sfile.chatglm.cn/images-ppt/a21f41691a36.jpg",
    category: "narava",
    author: "Lara Zupan",
    date: "2025-05-09",
    readTime: 7,
  },
  {
    slug: "ljubljana-v-48-urah",
    title: "Ljubljana v 48 urah: Popoln itinerer za vikend",
    excerpt:
      "Kako izkoristiti 48 ur v Ljubljani? Vodnik po najboljših znamenitostih, restavracijah in skritih kotičkih slovenske prestolnice.",
    content: `## Ljubljana — majhna a čarobna prestolnica

Ljubljana je ena najmanjših evropskih prestolnic — komaj 300.000 prebivalcev. A kar manjka v velikosti, nadomešča v čaru. Srednjeveški grad na hribu, Zmajev most, zelene obale Ljubljanice in živahna kulinarična scena. 48 ur je dovolj za popoln vpogled.

## Dan 1: Zgodovina in kultura

### Jutro (9:00-13:00)
Začnite na **Prešernovem trgu** — glavnem trgu z Zmajevim mostom in Plečnikovo cerkvijo. Sprehod po Tromostovju (trije mostovi) do **Plečnikove tržnice** — odprte tržnice z lokalno hrano.

Ob 10:00 se vzpnite z **žičnico na Ljubljanski grad** (€10 povratno). Na vrhu obiščite muzej, razgledni stolp in virtualno trdnjavo. Kosilo v restavraciji na gradu z mestnim pogledom.

### Popoldan (14:00-18:00)
Sprehod po **Starem trgu** — najstarejši ulici mesta z baročnimi hišami. Obiščite **Mestni muzej** in **Muzej novejše zgodovine**. Sprostitev ob Ljubljanici s kavo v eni od rečnih kavarn.

### Večer (19:00-)
Večerja v **Restavraciji As** — Michelin priporočena slovenska kuhinja. Po večerji sprehod po **Metelkovi** — alternativni četrti z ulično umetnostjo in barvo.

## Dan 2: Narava in lokalno življenje

### Jutro (9:00-12:00)
Zajtrk v **Kavarni Zvezda** (tradicionalne slovenske slaščice). Sprehod po **Tivoli parku** — največjem ljubljanskem parku z ribniki in razstavami v dvorcu Tivoli.

Ob 11:00 obiščite **Botanični vrt** — najstarejši v Sloveniji (1810). Vstop brezplačen.

### Popoldan (13:00-18:00)
Kosilo v **Gostilni As** ali **Čolnarni** — lokalna kuhinja. Popoldanski ogled **Muzeja moderne umetnosti** (Moderna galerija) na Cankarjevem nabrežju.

Kratka vožnja z avtobusom do **Šiške** — boemske četrti z ulico Trubarjevo cesto, kjer so številne butike, kavarne in ulični festivali.

### Večer (19:00-)
Zadnja večerja v **Restavraciji JB** — vrhunec slovenske kulinarike. Po večerji koncert v **Križankah** (poletni festival) ali pijača v eni od vinotek na Starem trgu.

## Najboljše restavracije

- **Restavracija As** (€€€) — avtorska slovenska kuhinja
- **Restavracija JB** (€€€) — Janez Bratovž, Michelin priporočilo
- **Sestica** (€€) — tradicionalna slovenska kuhinja
- **Čolnarna** (€€) — bar ob Ljubljanici
- **Klobasarna** (€) — Kranjska klobasa za hitro kosilo

## Kaj narediti v 2 dneh — skriti biseri

- **Prešernova spomenik** ob sončnem zahodu
- **Plečnikova hiša** — muzej arhitekta Karantanije
- **Krakovo** — emblematična četrt z lesenimi hišami
- **Šance** — ostanki srednjeveških obzidij na Gradu

## Nasveti

- **Ljubljanska kartica** (€15) — brezplačen javni prevoz in popusti
- **Brezplačni ogledi** z lokalnimi vodniki vsak dan ob 11:00
- **Vreme**: Ljubljana je med najbolj deževnimi mesti v Sloveniji — vedno imejte dežni plašč
- **Javni prevoz**: mestni avtobusi vozijo vsakih 10-15 min, kartica €1,3

## Lokalni nasveti

- **Vikend**: v soboto zjutraj obiščite tržnico Open Kitchen (marec-oktober)
- **Festivali**: poletni festival Ljubljana (julij-avgust), Trnfest (avgust)
- **Kava**: najboljša v Kavarni Zvezda ali Čolnarni
- **Kruh**: pekovska hiša Pekarna Pečar

Ljubljana je mesto, ki ga odkrijete počasi. 48 ur je dovolj za okus — vendar boste hoteli več.`,
    image:
      "https://sfile.chatglm.cn/images-ppt/650260f2f384.jpg",
    category: "kultura",
    author: "Maja Dolenc",
    date: "2025-09-05",
    readTime: 8,
    relatedDestination: "ljubljana",
  },
  {
    slug: "prekmurska-gibanica-zgodovina-in-recept",
    title: "Prekmurska gibanica: Zgodovina, legenda in pravi recept",
    excerpt:
      "Prekmurska gibanica je kraljica slovenskih sladic. Spoznajte njeno zgodovino, legendo o poroki in pravi tradicionalni recept za pripravo doma.",
    content: `## Kraljica slovenskih sladic

Prekmurska gibanica je najbolj znana slovenska sladica. Plastnata pita s skuto, makom, orehi in jabolki, vsaka plast ločena z vlečenim testom. Zaščitena z oznako tradicionalnega ugleda od leta 2010. Pristna prekmurska gibanica je lahko le ena — tista iz Prekmurja.

## Zgodovina in legenda

Prva pisna omemba prekmurske gibanice sega v leto 1828, ko jo je omenil Jožef Košič v svojem delu o Prekmurju. Legenda pravi, da je bila gibanica poročna jed — nevesta je morala pred poroko pripraviti gibanico za ženina. Če je bila dobra, je bila poroka blagoslovljena.

Druga legenda pravi, da je bila gibanica rezervirana za najboljše goste — vsaka plast je predstavljala eno od štirih letnih časov: skuta (pomlad), mak (poletje), orehi (jesen), jabolka (zima).

## Sestavine

### Za testo:
- 500 g ostre moke
- 200 ml tople vode
- 100 g masla (stopljenega)
- 1 jajce
- Ščepec soli

### Za plasti:
- **Skutna**: 500 g skute, 2 jajci, 100 g sladkorja, 1 vanilijev sladkor
- **Makova**: 200 g maka, 100 g sladkorja, 200 ml mleka
- **Orehova**: 200 g mletih orehov, 100 g sladkorja, 100 ml mleka
- **Jabolčna**: 500 g jabolk (naribanih), 50 g sladkorja, 1 žlica cimeta

### Za med:
- 200 g masla (stopljenega za premaz)

## Postopek

### 1. Priprava testa (30 min)
Vse sestavine zamesite v gladko, prožno testo. Razdelite na 8 enakih kosov. Pokrijte s krpo in pustite 30 minut počivati.

### 2. Razvaljanje testo
Vsako testo razvlecite na vlažni prt čim bolj tanko — tako tanko, da vidite skozi. To je ključno za pravo gibanico.

### 3. Plastenje v pekač
1. Dno pekača (30x20 cm) namažite z maslom
2. Prvo plast testa položite na dno, premaz z maslom
3. Drugo testo — premaz s skutno plastjo
4. Tretje testo — premaz z makom
5. Četrto testo — premaz z orehi
6. Peto testo — premaz z jabolki
7. Šesto testo — premaz s skuto (ponovno)
8. Sedmo testo — premaz z makom (ponovno)
9. Osmo testo — vrh, premaz z maslom

### 4. Pečenje (60 min)
Pecite v pečici pri 180 °C približno 60 minut, dokler ni vrh zlatorumen. Če prevroči, pokrijte z alu folijo.

### 5. Ohlajanje
Pustite 2 uri, da se ohladi. Razrežite na 12 kosov.

## Kje poskusiti pravo gibanico

- **Slaščičarna Murska** (Murska Sobota) — najbolj znana
- **Lendavska slaščičarna** (Lendava) — prava prekmurska gibanica
- **Kmečko gospodarstvo Novak** (Ptuj) — domača različica
- **Slaščičarna Zvezda** (Ljubljana) — ljubljanska varianta

## Zanimivosti

- Skupna teža ene gibanice: ~2 kg
- Število kalorij na kos: ~450 kcal
- Cena v slaščičarni: €2,5-3,5 na kos
- Cena celega pekača: €20-30

## Nasveti za pripravo

- **Testo**: mora biti prožno, da se da vleči tanko. Če se trga, dodajte malo vode.
- **Skuta**: uporabite polnomastno skuto za kremno teksturo.
- **Pečica**: predgrevajte 15 minut, da je pečenje enakomerno.
- **Hranjenje**: v hladilniku do 5 dni, zamrznete do 3 mesece.

Prekmurska gibanica ni le sladica — je slovenska kulinarična dediščina v vsakem grižljaju.`,
    image:
      "https://sfile.chatglm.cn/images-ppt/1cfd5ad8d032.jpg",
    category: "kulinarika",
    author: "Petra Kovač",
    date: "2025-06-15",
    readTime: 7,
    relatedDestination: "murska-sobota",
  },
  {
    slug: "vinogradi-stajerske-turizem",
    title: "Vinogradi Štajerske: Vodnik po vinskih turističnih kleteh",
    excerpt:
      "Štajerska je ena najpomembnejših slovenskih vinorodnih regij. Spoznajte najboljše vinske kleti, degustacije in nastanitve v vinogradih.",
    content: `## Štajerska — slovenska Toskana

Štajerska vinorodna regija je ena najlepših vinskih pokrajin v Srednji Evropi. Valoviti vinogradi nad Dravo, tradicionalne vinske kleti in sodobni arhitekturni biseri. Vinogradniška tradicija sega v rimsko dobo, današnji vinarji pa povezujejo tradicijo s sodobnimi tehnikami.

## Najbolj znane vinske kleti

### 1. Vinska klet Stara trta (Maribor)
Vinska klet ob najstarejši trti na svetu (400+ let). Degustacije modre frankinje in drugih štajerskih sort. Vodeni ogled s sommelierjem.

### 2. Vinska klet Pullus (Ptuj)
Ena najstarejših vinskih kleti v Sloveniji (1239). Znana po rumenem muškatu in laškem rizlingu. Ogled kleti z degustacijo 5 vin.

### 3. Vinogradništvo Spodnja Polaneč (Haloze)
Družinska klet v Halozah. Specializirana za avtohtone sorte. Pogled na Dravo in Boč z vrha vinograda.

### 4. Verus (Ormož)
Sodobna vinska klet z inovativnim pristopom. Znana po Sauvignonu in Traminec. Sodobna arhitektura med vinogradi.

### 5. Vina Kvitsiani (Ljutomer)
Družinska klet v Prlekiji. Tradicionalne sorte z ekološko pridelavo. Degustacije s prleško gibanico.

## Štajerske avtohtone sorte

### Modra frankinja
Najbolj znana štajerska rdeča sorta. Sveže, z malinovo aromo. Serverirati pri 14-16 °C.

### Rumeni muškat
Sladko belo vino z intenzivno cvetlično aromo. Aperitiv ali sladica.

### Renski rizling
Klasično belo vino z mineralno aromo. Serverirati z ribami ali perutnino.

### Traminec
Aromatično belo vino z rožno aromo. Tradicionalno slovensko svatovno vino.

### Žlahtnina
Avtohtona štajerska bela sorta. Sveže, blago, s sadno aromo.

## Vinske ture

### 1-dnevna tura Maribor
- Jutranji ogled Stare trte (Maribor)
- Degustacija v Vinski kleti Stara trta
- Kosilo v restavraciji ob Dravi
- Popoldanski ogled Maribora
- Cena: €60-80 na osebo

### 2-dnevna tura Haloze
- Dan 1: Maribor + Stara trta, prenočitev v vinogradu
- Dan 2: Haloze (Vinogradništvo Polaneč), Ptujska klet Pullus, Ptuj
- Cena: €180-220 na osebo

### 3-dnevna tura Štajerska
- Dan 1: Maribor + Vinska vigred festival (marec)
- Dan 2: Haloze + Jeruzalem
- Dan 3: Ptuj + Ormož + Ljutomer
- Cena: €350-450 na osebo

## Najboljše nastanitve v vinogradih

- **Hotel Brot** (Maribor) — center, sodoben 4*
- **Vinogradniška hiša Špičak** (Haloze) — družinska nastanitev
- **Bed & Breakfast Verus** (Ormož) — sodoben B&B v vinogradih
- **Vinska klet Pullus Apartma** (Ptuj) — apartma nad kletjo

## Najboljši čas za obisk

- **Marec**: Vinska vigred (Maribor) — največji festival vina
- **Maj**: flowering v vinogradih, najlepše vinograde vidite
- **September-oktober**: trgatev, festivale, degustacije
- **November**: martinovanje (sv. Martin, 11. november) — krst mladih vin

## Nasveti

- **Degustacije**: rezervirajte vsaj 2 dni vnaprej, še posebej poleti
- **Vozite se**: v Štajerski je javni prevoz slab — najem avtomobila priporočljiv
- **Lokalni festivali**: vsak vikend v septembru in oktobru je nekje trgatev
- **Vinogradi**: najboljši pogled izvrh od Mariborskega Pohorja

## Kaj kupiti domov

- **Modra frankinja** (Maribor) — najbolj znano štajersko vino
- **Rumeni muškat** (Haloze) — sladko, za posebne priložnosti
- **Žlahtnina** (Jeruzalem) — avtohtona sorta, redka drugod
- **Bučno olje** (Prekmurje) — odlična spremljava štajerskih vin

Štajerska vinogradniška regija ni le vinska destinacija — je kulinarična in naravna izkušnja, ki jo boste dolgo zapomnili.`,
    image:
      "https://sfile.chatglm.cn/images-ppt/2b43ef1e28ac.jpg",
    category: "kulinarika",
    author: "Petra Kovač",
    date: "2025-10-18",
    readTime: 8,
    relatedDestination: "ptuj",
  },
  {
    slug: "triglavski-narodni-park-vodic",
    title: "Triglavski narodni park: Vodič po edinem slovenskem narodnem parku",
    excerpt:
      "Triglavski narodni park je edini narodni park v Sloveniji. 840 km² alpske narave z vrhovi, dolinami, jezera in slapovi. Spoznajte najlepše kotičke.",
    content: `## Edini slovenski narodni park

Triglavski narodni park (TNP) je edini narodni park v Sloveniji, ustanovljen leta 1981. Obsega 840 km² v severozahodnem delu države — skoraj ves obseg Julijcev. Imenovan po Triglavu (2864 m), najvišjem slovenskem vrhu, ki krasa državni grb.

## Tri zaščititvene cone

TNP je razdeljen na tri cone z različnimi režimi varstva:

- **1. cona (strogi rezervat)**: 4% površine, brez človeškega vpliva
- **2. cona (prvo varstvo)**: 33% površine, omejene aktivnosti
- **3. cona (kultivirana pokrajina)**: 63% površine, kmetijska zemljišča in naselja

## Najlepše doline

### Dolina Trenta
Najbolj znana dolina v TNP, izvir Soče. Pohodi na planine, vijugasta cesta do Vršiča.

### Dolina Vrata
Dolina pod severno steno Triglava. Izhodišče za vzpon na Triglav preko Triglavske koče.

### Dolina Krma
Mirna dolina z alpskimi planinami. Dostopna z avtom, izhodišče za pohode na Triglav preko Kredarice.

### Dolina Tamar
Zaprta dolina ob meji z Avstrijo. Smučanje pozimi, pohodi poleti.

## Najbolj znana jezera

### Bohinjsko jezero
Največje naravno jezero v Sloveniji, znotraj TNP. 4 km dolgo, do 45 m globoko. Žičnica Vogel, slap Savica, ribolov.

### Blejsko jezero
Blejsko jezero ni v TNP, a leži ob robu parka. Znameniti otok z cerkvijo.

### Krnska jezera
Visokogorska jezera v Julijskih Alpah. Krnsko jezero (1383 m) je največje visokogorsko jezero v Sloveniji.

## Pohodi v TNP

### Vzpon na Triglav (2864 m)
Najbolj znani slovenski pohod. Preko Triglavske koče (2 dni) ali enodnevni za izkušene. Aljažev stolp na vrhu.

### Slap Savica
Kratek pohod iz Bohinja. 78 m visok slap, navdih za Prešernovo Krst pri Savici.

### Komna (1520 m)
Planina nad Bohinjem z razgledom na Julijce. 2 uri pohoda iz Koče na Voglu.

### Krn (2244 m)
Pohod na vrh s pogledom na Soško dolino. 4 ure iz Lomca. Med 1. svetovno vojno frontna črta.

### Mangart (2679 m)
Tretji najvišji vrh Slovenije. Dostopen preko Mangartskega sedla, zahteven pohod.

## Naravne znamenitosti

### Korita Soče
Naravni bazeni vrezani v apnenec ob Soči. Več lokacij: Kobarid, Bovec, Srpenica.

### Tolminska korita
Najgloblja soteska v Sloveniji (60 m globoko). Sotoče Soče in Tolminke.

### Vintgarska soteska
1,6 km dolga soteska ob reki Radovni. Lesene poti ob kristalno čisti vodi.

### Slap Boka
Najvišji slovenski slap (106 m). Dostopen iz vasi Žaga pri Bovcu.

## Divje živali v TNP

- **Gams** — najpogostejša velika žival v Julijskih Alpah
- **Kozorog** — najredkejši, načrtovano ojačana populacija
- **Snežni volk** — najredkeji zver, zaščitena vrsta
- **Rjavi medved** — prisoten, a redek v TNP
- **Planinski orel** — največja ptica v Alpah

## Kje spati

### Planinske koče
- **Triglavska koča na Doliču** (2151 m) — izhodišče za Triglav
- **Koča na Voglu** (1535 m) — nad Bohinjem
- **Dom v Tamarju** (1100 m) — v Tamarju
- **Koča pri Izviru Soče** (760 m) — Trenta

### Hoteli in apartmaji
- **Hotel Jezero** (Bohinjsko jezero) — 4* ob jezeru
- **Hotel Dolec** (Kobarid) — boutique hotel
- **Apartmaji Bovec** — družinski apartmaji v Bovcu

## Nasveti za obisk

- **Najboljši čas**: junij do september, ko so planine odprte in vreme stabilno
- **Oprema**: pohodni čevlji, dežni plašč, topla oblačila (tudi poleti je v gorah hladno)
- **Vreme**: vedno preverite vremensko napoved pred pohodom
- **Vstopnine**: v TNP ni splošne vstopnine, a nekatere atrakcije (Vintgar, Savica) imajo vstopnine
- **Parkirišča**: večina parkirišč je plačljivih (€3-5/dan)
- **Javni prevoz**: poleti vozijo avtobusi do izhodišč pohodov

## Varovanje narave

- Ne trgajte rož (zaščitene so)
- Ne zastrupljajte vode (tudi ne z milom)
- Ne sprehajajte se izven markiranih poti
- Ne prihajajte preblizu divjih živali
- Vzemi smeti s seboj

Triglavski narodni park je slovenski naravni biser. Spoštujte ga, da bo ostal lep tudi za naslednje generacije.`,
    image:
      "https://sfile.chatglm.cn/images-ppt/29777d33ec2d.jpeg",
    category: "narava",
    author: "Blaž Zupan",
    date: "2025-08-08",
    readTime: 9,
    relatedDestination: "triglav",
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
