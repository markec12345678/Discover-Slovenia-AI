// ADRIA-1a — jadranski vodniki (1–5): severni koridor — Hrvaška in kombinacije s Slovenijo.

import type { AdriaGuide } from "./types";

export const ADRIA_GUIDES_PART1: AdriaGuide[] = [
  // 1. Kronska road trip relacija Ljubljana → Dubrovnik v osmih dneh.
  {
    slug: "ljubljana-dubrovnik-road-trip",
    title: "Road trip Ljubljana–Dubrovnik: kronska jadranska relacija v osmih dneh",
    metaTitle: "Road trip Ljubljana–Dubrovnik: Plitvice, Split, Ston",
    description:
      "Osem dni in 1 500 kilometrov od Ljubljane do Dubrovnika: Plitvice zgodaj zjutraj, Dioklecijanova palača, Pelješki most in ostrige v Stonu.",
    excerpt:
      "Najdaljša jadranska relacija, ki jo v enem dopustu še naredite humano: Plitvice, Split, Dubrovnik in Ston, skupaj okoli 1 500 kilometrov.",
    route: "Ljubljana → Plitvice → Split → Dubrovnik → Ston → Ljubljana",
    countries: ["SI", "HR"],
    days: 8,
    km: 1500,
    heroImage: "/adria/ljubljana-dubrovnik-road-trip.jpg",
    heroAlt:
      "Pogled z dubrovniškega obzidja na staro mestno jedro z rdečimi strehami, proti otočku Lokrum in prostrani jadranski modrini",
    author: "Tanja Novak",
    date: "2026-07-21",
    readTime: 11,
    stops: [
      {
        name: "Ljubljana",
        country: "SI",
        nights: 0,
        highlight:
          "Izhodišče in zadnja noč doma: od Ljubljane je do Plitvic dobrih 250 kilometrov po avtocesti mimo Zagreba, prva etapa pa se začne pred zoro.",
      },
      {
        name: "Plitvice",
        country: "HR",
        nights: 1,
        highlight:
          "Nočitev ob robu parka in vstop ob odprtju: zgornja in spodnja jezera, slapovi ter lesene steze, ki jih množice ob tej uri še niso zasedle.",
      },
      {
        name: "Split",
        country: "HR",
        nights: 2,
        highlight:
          "Dioklecijanova palača, v kateri danes živijo ljudje, kava na Rivi in vzpon na Marjan za pogled na otoke — dva dneva sta ravno prav.",
      },
      {
        name: "Dubrovnik",
        country: "HR",
        nights: 3,
        highlight:
          "Tri noči za mesto, ki drži svoj sloves: Obzidje v zgodnjem jutru, otoček Lokrum s čolnom in večeri pod zidovi namesto popoldanskih množic.",
      },
      {
        name: "Ston",
        country: "HR",
        nights: 1,
        highlight:
          "Obzidje nad mestom, solane in ostrige iz Mali Stona na zadnji nočitev potovanja; zadnji dan pa ena sama dolga etapa po avtocesti domov.",
      },
    ],
    sections: [
      {
        heading: "Osem dni na najdaljši domači relaciji",
        body: [
          "Med vsemi potovanji, ki jih iz Ljubljane naredite na Jadran, je ta najdaljša in hkrati še čisto znotraj enega dopusta. Do Splita je približno 460 kilometrov, do Dubrovnika okoli 690, s povratkom in ovinkom čez Plitvice pa se števec ustavi pri približno 1 500. Osem dni je spodnja meja, pri kateri ta krog ostane dopust in ne postane garnitura etap: vsak krajši poskus pobere eno od postaj, vsak dan več pa vrača tistih nekaj ur, ki jih v avtu porabite za gledanje morja.",
          "Ritem je premišljen. Prvi dan gre po avtocesti mimo Zagreba do Plitvic, dobrih 250 kilometrov, drugi dan teče skozi park in popoldne naprej proti Splitu, potem pa se vožnje umirijo. Split dobi dve noči, Dubrovnik tri, ker je od vseh postaj najdražji in si zasluži več kot en pohod; Ston na korenu Pelješaca doda zadnji pravi jadranski večer. Zadnji dan je dolg — od Stona do Ljubljane je kakšnih 620 kilometrov — in zato se začne ob zori.",
        ],
      },
      {
        heading: "Plitvice: vstopnine, ure in množice",
        body: [
          "Vstopnina se giblje med približno 25 in 40 evrov glede na obdobje: pozimi je park najcenejši in najbolj sam, julija in avgusta pa najdražji in najbolj poln. Karto za vrh sezone kupite po spletu, ker se dnevne kvote lahko izčrpajo, in sicer za prvi možni termin. Vstopi potekajo po urniku, ki se s sezono premika — ob vrhuncu sezone se park odpira okoli sedme — in ravno zato nočitev v bližini parka ni razvada, ampak taktika: zjutraj ste pred vrati pred prvim avtobusom.",
          "Množic ne morete izničiti, lahko pa jih obidete. Ob koncih tedna so steze polne od dopoldneva dalje, največ ljudi pa je med deseto in štirinajsto uro. Načrt je star kot park: prvi del ogleda opravite pred deveto, za drugi pa izberite daljšo različico poti okoli spodnjih jezer, kjer se gneča redči. Ogled vzame od štirih do šestih ur hoje po leseni stezi in zahteva udobne čevlje; kopalnice pustite za kasneje, saj v jezerih plavanje ni dovoljeno.",
        ],
        list: [
          {
            title: "Karta po spletu",
            text: "V juliju in avgustu dnevne kvote zmanjkajo; karto kupite vnaprej in izberite najzgodnejši možni termin.",
          },
          {
            title: "Vstop ob odprtju",
            text: "Ob vrhuncu sezone se park odpira okoli sedme; ob deveti so pred vrati že prvi avtobusi.",
          },
          {
            title: "Delovnik proti koncu tedna",
            text: "Ponedeljek in petek sta še človeška dneva; sobota prinese največ obiskovalcev, nedeljsko dopoldne pa je polno izletnikov.",
          },
          {
            title: "Izbira poti",
            text: "Daljša različica okoli spodnjih jezer traja več ur, a je manj polna; krajša pot naredi ogled za en dopoldne.",
          },
        ],
      },
      {
        heading: "Split: palača, v kateri se živi",
        body: [
          "Dioklecijanova palača ni spomenik, ki ga obiščete, ampak mesto, v katerem živijo: stanovanja, kavarne in trgovice so zrasle v rimskih zidovih, Peristil je izgubil cesarja in dobil gnečo. Sama palača je prosta; plačate podzemlje in zvonik stolnice, oba pa sta vredna cene, ker sprehod spremenita v ogled. Za pogled na celoten prstan zidov in otoke se vzpnite na zvonik — počasi, ker stopnic ni malo.",
          "Riva je ulica, ki si jo zapomnite: obala s palmami, kjer se jutro začne s kavo ob morju. Nad mestom se dviga Marjan, gozdnata vzpetina s kamnitimi stopnicami in razgledi; pol ure hoje in Split je pod vami v celoti. Dve noči sta za Split prava mera: en dan za palačo, Rivo in Marjan, drugi pa za izlet — Trogir je pol ure stran, na Brač in Hvar pa se iz pristanišča odpeljete s trajektom, ki v sezoni zahteva rezervacijo.",
        ],
      },
      {
        heading: "Pelješki most in zgodba o Neumu",
        body: [
          "Do julija 2022 je bila edina cestna povezava med Splitom in Dubrovnikom tista čez ozek bosanski koridor pri Neumu. Na dvajsetih kilometrih bi dvakrat prestopili mejo — na Karasovićih vstopili v Bosno in Hercegovino, pri Debelih Bregovih pa se vrnili na Hrvaško — in ob vsaki kontroli stali v koloni, ki je bila poleti dolga tudi uro in več. Izkušeni vozniki so znali koridor obvoziti po vijugastih cestah čez Pelješac, večina pa si je mejo preprosto privoščila kot del poti na jug.",
          "Pelješki most, odprt julija 2022, je to zgodbo zaključil: prečkanje nad Malim Stonom je danes običajna avtocestna etapa, od Splita do Dubrovnika pa je okoli 200 kilometrov brez ene same kontrole. Za vožnjo čez most ne potrebujete ničesar, kar ne bi imeli sicer — cestnino poravnate po odsekih kot drugod — pot pa se po prehodu spusti na Pelješac, polotok vinogradov in školjčnih nasadov, ki je sam po sebi razlog, da navigacijo vsaj enkrat prevarate.",
        ],
      },
      {
        heading: "Dubrovnik: Obzidje, Lokrum in zgodnje jutro",
        body: [
          "Obzidje je razlog, da ljudje pridejo v Dubrovnik, in stvar, ki jo večina naredi narobe. Celoten obhod meri dobrih 2 000 metrov kamnite steze, poleti brez sence, vstopnina pa je med višjimi na Jadranu. Čudeža, ki bi to spremenil, ni, je pa ura: ob odprtju ste na stezi pred množicami in pred soncem, ob enajsti pa ste spodaj s kavo, medtem ko se nad vami odpirajo sončniki. Računajte dobri dve uri, vodo in pokrivalo.",
          "Lokrum je druga polovica dubrovniškega jutra: čoln iz starega pristanišča pelje deset minut na otoček z botaničnim vrtom, slanim jezerom in pečinami za skakanje; zadnji povratek odplove pred večerom, kar se splača zapomniti, preden se usedete v kavarno. Za spanje imejte v računu, da je staro mestno jedro najdražji del mesta: v Lapadu in Gružu ste dobrih pol ure hoje stran, nočitev pa lahko stane tretjino manj. V avgustu to ni prihranek, ampak nočitev več.",
        ],
      },
      {
        heading: "Ston, ostrige in dolga etapa domov",
        body: [
          "Ston na korenu Pelješaca je nasprotje Dubrovnika: obzidje, a brez množic, solane, ki delujejo po stoletnem redu, in konobe, v katerih školjke prihajajo z nasadov, ki jih vidite skozi okno. Nad mestom se vije kakih pet kilometrov srednjeveškega obzidja; vzpon vzame kakšni uri in pol, nagrada pa je Pelješac na eni strani in zaliv na drugi. Ostrige iz Mali Stona se pojedo ob obali, kamenice pa kupite s seboj v hladilni torbi za nedeljski zajtrk.",
          "Zadnji dan je od Stona do Ljubljane okoli 620 kilometrov — dolgo, a po avtocesti brez presenečenj, zato ga začnite ob zori in si privoščite odmor vsaki dve uri. Če se lahko podaljšate za en dan, razdelite povratek z nočitvijo na Kvarnerju ali v Zadru: Opatija in Crikvenica vračata severni del etape, Zadar pa še zadnji zahod sonca pri morskih orglah. V obeh primerih se krog konča, kot se spodobi — s pogledom na morje, ki traja do zadnjega priključka.",
        ],
      },
    ],
    practical: [
      {
        title: "Vlaknine in ure Plitvic",
        text: "Vstopnina se giblje med 25 in 40 evrov glede na obdobje; v juliju in avgustu jo kupite po spletu, za najzgodnejši možni termin. Oglede začnite ob odprtju parka — ob koncih tedna je ob deseti uri na stezah že največ ljudi. V jezerih plavanje ni dovoljeno, karte za otroke in študente pa so ugodnejše.",
      },
      {
        title: "Cestnine HAC po odsekih",
        text: "Hrvaška nima vinjete: cestnine plačujete na zaplatkah po odsekih, s kartico ali gotovino, za ta krog pa računajte s kakšnimi 50 do 60 evri. Slovenska e-vinjeta pokriva le domači del poti; tedenska za osebni avto stane okoli 16 evrov. Za pogoste prevoze se splača ENC-naprava.",
      },
      {
        title: "Obzidje Dubrovnika",
        text: "Obhod meri dobrih 2 000 metrov in poleti ni sence: ob odprtju je steza še prazna, ob enajsti pa polna. Vlaknina je med dražjimi na Jadranu, ogled pa vzame dobri dve uri. Vzemite vodo in pokrivalo, karto pa kupite za prvi termin dneva.",
      },
      {
        title: "Spanje ob poti",
        text: "Pri Plitvicah pansiji v Rakovici, Grabovcu in Korenici stojijo petnajst minut od vstopov in se v sezoni polnijo prvi. V Splitu nočitev zahodno od centra prihrani denar brez izgube časa; v Dubrovniku sta Lapad in Gruž cenejša od starega mesta. Za julij in avgust rezervirajte vsaj tri mesece poprej.",
      },
      {
        title: "Meja, dokumenti in denar",
        text: "Hrvaška je v Evropski uniji, v schengenskem območju in od 1. januarja 2023 tudi v evro območju: mejnih kontrol med Slovenijo in Hrvaško ni več, za dokumente zadošča osebna izkaznica. Menjalnica ne pride v poštev; kartice sprejemajo povsod, za tržnice in manjše konobe pa imejte tudi gotovino.",
      },
      {
        title: "Množice in križarke",
        text: "Vsi veliki cilji te poti imajo isti sovražnik: popoldne. Plitvice in Obzidje ob odprtju, dubrovniško staro mesto pa po šesti uri, ko se skupine vračajo na ladje. V Dubrovniku so najboljši dnevi tisti, ko v pristanišču ni križarke; urnik prihodov je javen in ga preverite dan prej.",
      },
      {
        title: "Kdaj na pot",
        text: "Junij in september sta na tej relaciji najlepša meseca: morje je toplo, množice manjše, nastanitve cenejše. Julij in avgust prineseta vrhunec vsega, tudi gneče. Maj je svež in zelo primeren za Plitvice, oktober pa na jugu pogosto še dovolj topel za Obzidje.",
      },
    ],
    faqs: [
      {
        question: "Koliko stane vstopnina za Plitvice?",
        answer:
          "Med približno 25 in 40 evrov, odvisno od obdobja: pozimi najmanj, v juliju in avgustu največ. Otroci in študenti imajo popuste, karta pa vključuje tudi vožnjo z ladjo po največjem jezeru. Za vrh sezone jo kupite po spletu, ker se dnevne kvote lahko izčrpajo.",
      },
      {
        question: "Ali na poti v Dubrovnik prestopim bosansko mejo?",
        answer:
          "Ne. Do julija 2022 je cesta tekla čez koridor Neum z dvema kontrolama — Karasovići ob vstopu v Bosno, Debeli Brijeg ob povratku na Hrvaško — poleti pa se je pred vsako zadržalo tudi uro in več. Pelješki most je relacijo zaprl znotraj Hrvaške; od Splita do Dubrovnika je danes okoli 200 kilometrov brez prestopa.",
      },
      {
        question: "Kdaj je najboljši čas za obhod Obzidja?",
        answer:
          "Ob odprtju, poleti med sedmo in osmo uro zjutraj. Steza meri dobrih 2 000 metrov in je brez sence, zato popoldne ni pametno niti zaradi vročine niti zaradi množic. Voda in pokrivalo sta obvezna, ogled pa traja dobri dve uri.",
      },
      {
        question: "Koliko cestnin poravnam na tem krogu?",
        answer:
          "Na hrvaških avtocestah od Ljubljane prek Plitvic in Splita do Dubrovnika ter nazaj računajte s približno 50 do 60 evri, odvisno od povratne poti. Cestnine plačujete po odsekih na zaplatkah; hrvaške vinjete ni. V Sloveniji velja e-vinjeta, ki pokriva le domači del poti.",
      },
      {
        question: "Ali je osem dni dovolj za ta krog?",
        answer:
          "Da, a brez rezerve za izlete, ki jih slišite po poti. Jedro — Plitvice, Split, Dubrovnik in Ston — se v osmih dneh naredi humano; deveti dan bi šel na Hvar ali v Kvarner. Krajše od sedmih dni ne priporočamo, ker se pot spremeni v vožnjo.",
      },
      {
        question: "Kje spat pri Plitvicah?",
        answer:
          "V okolici Rakovice, Grabovca ali Korenice, petnajst minut od vstopov. Nastanitve so pretežno pansionske in se v sezoni polnijo prve, zato rezervirajte zgodaj. Nočitev v bližini parka je taktika: zjutraj ste pred vrati pred prvim avtobusom.",
      },
      {
        question: "Kaj videti na povratku iz Stona?",
        answer:
          "Osnovna različica vozi domov v enem dnevu, okoli 620 kilometrov, in se začne ob zori. Če imate dan več, razdelite povratek z nočitvijo na Kvarnerju — Opatija, Crikvenica — ali v Zadru. V Zadru se ob morskih orglah poda še zadnji zahod sonca tega potovanja.",
      },
    ],
    relatedSlugs: [
      "slovenija-hrvaska-10-dni",
      "bled-plitvice-split",
      "hrvaska-obala-prakticni-vodnik",
    ],
    relatedSloveniaIds: ["ljubljana", "bled", "postojna"],
  },

  // 2. Kombinirani dopust: Slovenija + Hrvaška v desetih dneh — "oba dopusta v enem".
  {
    slug: "slovenija-hrvaska-10-dni",
    title: "Slovenija in Hrvaška v desetih dneh: oba dopusta v enem",
    metaTitle: "Slovenija in Hrvaška v 10 dneh: Bled, Plitvice, Split",
    description:
      "Deset dni, 1 350 kilometrov: Bled, Ljubljana in Postojna na začetku, Plitvice, Zadar in Split na jugu, Piran na koncu. Za Slovence z gosti in za tujce.",
    excerpt:
      "Desetdnevni načrt, ki v enem dopustu združi alpski svet, kraško podzemlje in jadransko obalo — napisan za Slovence, ki gostom pokažejo vse, in za tujce, ki želijo oboje.",
    route: "Ljubljana → Bled → Postojna → Plitvice → Zadar → Split → Piran",
    countries: ["SI", "HR"],
    days: 10,
    km: 1350,
    heroImage: "/adria/slovenija-hrvaska-10-dni.jpg",
    heroAlt:
      "Jezero Bled z otočkom in gradom nad vodno gladino, v ozadju Julijske Alpe pod jutranjo svetlobo",
    author: "Marko Kovač",
    date: "2026-07-24",
    readTime: 12,
    stops: [
      {
        name: "Ljubljana",
        country: "SI",
        nights: 0,
        highlight:
          "Dan prihodov in prvi sprehod: staro mestno jedro ob Ljubljanici, Prešernov trg in večer ob reki, preden se naslednje jutro pot zavije proti Blejskemu jezeru.",
      },
      {
        name: "Bled",
        country: "SI",
        nights: 2,
        highlight:
          "Dve noči za jezero z otočkom, grad na skali, sotesko Vintgar in izlet v Bohinj — alpski del dopusta, v katerem jutranja megla šteje za atrakcijo.",
      },
      {
        name: "Postojna",
        country: "SI",
        nights: 0,
        highlight:
          "Enodnevni postanek na poti na jug: dvorane Postojnske jame z vlakcem, razstava jamskih živali in Predjama z gradom v steni, potem pa volan proti Plitvicam.",
      },
      {
        name: "Plitvice",
        country: "HR",
        nights: 1,
        highlight:
          "Nočitev ob parku in vstop ob odprtju: šestnajst jezer v kaskadah, slapovi med njimi in lesene steze, po katerih se hoja raztegne na pol dneva.",
      },
      {
        name: "Zadar",
        country: "HR",
        nights: 2,
        highlight:
          "Morske orglje na pomolu, zahod sonca, ki ima v Zadru svojo ligo, in staro mesto iz rimskih ulic — dve noči sta ravno prav za ritem obale.",
      },
      {
        name: "Split",
        country: "HR",
        nights: 3,
        highlight:
          "Tri noči za največje mesto na tej poti: Dioklecijanova palača, Riva, Marjan in izleti na Hvar, Brač ali v Trogir — izbira je odvisna od vetra.",
      },
      {
        name: "Piran",
        country: "SI",
        nights: 1,
        highlight:
          "Zadnja nočitev na slovenski obali: piransko staro mesto na rtu, večerja z ribami in soline v Sečovljah, od doma pa je od tod le še ura in pol.",
      },
    ],
    sections: [
      {
        heading: "Zamisel: dva dopusta v enega",
        body: [
          "Za Slovence je ta načrt odgovor na vprašanje, ki se vrne vsako poletje: gostje so tu teden dni in želijo videti vse, od Bleda do morja. Namesto da bi jim pokazali le domačo polovico, jih peljete čez mejo in jim v enem dopustu vrnete oba sveta — alpe, kraško podzemlje, slapove in obalo, skupaj kakšnih 1 350 kilometrov, razdeljenih tako, da noben dan ni samo vožnja. Gostje namreč vidijo Slovenijo, kot jo vidimo sami: kot deželo, ki ima morje na dosegu enega dopusta.",
          "Tujcem ista pot prav tako sede, ker se zaciklira na Ljubljani: pristanite na Brniku, izposodite avto in v desetih dneh odvozite najboljšo kombinacijo, ki jo ta del Evrope ponuja. Cezmejnost tu ni zapleta — od 1. januarja 2023 je Hrvaška z nami v schengenskem območju in v evru, tako da ni ne menjalnice ne kontrole, je pa morje, ki ga Slovenija nima. Deset dni je prava dolžina: krajše bi stisnilo Split, daljše pa bi se izgubilo.",
        ],
      },
      {
        heading: "Prvi dnevi: Ljubljana, Bled, Bohinj",
        body: [
          "Prvi večer pripada Ljubljani, ker se vsaka ta pot začne in konča v njej: sprehod ob Ljubljanici čez Tromostovje, trg zvečer in vzpenjačka na grad, če se dan še drži. Naslednje jutro gre pot na Bled, dobrih 55 kilometrov oziroma pod uro vožnje, kjer se potovanje prvič ustavi zares. Dve noči ob jezeru pomenita jutro z meglo nad vodo, sprehod okrog jezera in pletna na otoček; drugi dan se izgubi v Vintgarju ali Bohinju, odvisno od tega, kdo v avtu odloča.",
          "Alpski del je na začetku z razlogom. V juliju so jutra v Gorenjski sveža — prijeten kontrast s tem, kar pride kasneje — gorskemu delu pa se ob koncu potovanja nihče več ne bi vrnil. Bled je tudi najlažji začetek za goste: vsi ga poznajo s slik, prvi sprehod ob jezeru pa razpihne celoten avto. Iz Bleda se tretji dan zapelje skozi Ljubljano na jug, prvič čez mejo, ki je ne boste niti opazili.",
        ],
      },
      {
        heading: "Podzemlje na poti: Postojna in Predjama",
        body: [
          "Iz Bleda se do Postojnske jame pripelje skozi Ljubljano, skupaj kakšnih 105 kilometrov, torej z jutranjim zavojem za kavo pod dve uri. Jama je vodena po terminih: vlakec pripelje do dvoran, skozi katere se sprehodi še ura in pol, v jami pa je vse leto med osmimi in desetimi stopinjami, zato jakna gre zraven tudi, ko je zunaj trideset. Karto s terminom kupite vnaprej — najboljši dopoldanski vhodi se v sezoni razprodajo.",
          "Kilometer naprej stoji Predjama, grad, zabit v steno, pod katero se odpira jama, skozi katero so vitezi nekoč prihajali do vode. Ogled je kratek in narejen za popoldne, potem pa se pot resno zavije na jug: do Plitvic je od tod kakih 220 kilometrov — čez Rijeko po obalni strani ali čez Zagreb po avtocesti, odvisno od tega, ali vas bolj motijo kamioni ali vijuge. Nočitev je ob robu parka, ker jutranji vstop ni priporočilo, ampak pogoj.",
        ],
      },
      {
        heading: "Plitvice: prehod v drugo deželo",
        body: [
          "Nočitev ob Plitvicah je del taktike. Vstopnine se gibljejo med 25 in 40 evrov glede na obdobje, ob koncih tedna se steze napolnijo še pred dopoldnevom, zato spimo petnajst minut od vstopa in vstopimo ob odprtju: šestnajst jezer v kaskadah, slapovi med njimi in lesene steze, po katerih se hoja raztegne na pol dneva, se ob deveti uri še da slišati, ob enajsti pa le še videti. Za goste je to ponavadi dan, ki ga na poti nazaj omenjajo največkrat.",
          "Iz parka se popoldne pelje v Zadar, kakih 110 kilometrov po avtocesti oziroma dobro uro, kamor se prispe še za kopanje in prvo obalno večerjo. Ta etapa je hrbtenica načrta: naredite jo enkrat, potem pa se pot le še spušča po obali proti Splitu in nazaj. Če vam zmanjka diha, je edina dovoljena krajšava zadnji blejski dan — nikoli vrstni red, sicer se vozite nazaj.",
        ],
      },
      {
        heading: "Obala: Zadar in trije dnevi v Splitu",
        body: [
          "Zadar je uvod v obalo, ki deluje bolje, kot se sliši. Staro mesto na polotoku je zraslo iz rimskih ulic, na zahodnem pomolu pa stojijo Morske orglje — stopnice z cevmi, v katere valovi potiskajo zrak in iz njih igrajo svoj part. Ob njih je Pozdrav sonca, krog, ki zvečer utripa, ob zahodu, ki ga je Alfred Hitchcock imenoval najlepšega na svetu. Dve noči sta ravno prav: en dan za staro mesto in kopanje, drugi za izlet na Ugljan, če se skupina odloči za čoln in ne za avto.",
          "Split je največja postaja potovanja in njen najbolj mestni del: tri noči pomenijo Dioklecijanovo palačo, ki jo prebivalci nosijo na hrbtu vsak dan, jutranjo Rivo, večerni Marjan in čas za izlet. Trogir je pol ure stran, na Hvar in Brač pa pelje trajekt iz pristanišča — v sezoni ga rezervirajte, če mislite voziti avto na palubo. Nastanitev izberite na zahodnem delu mesta ali pri Bačvicah, kjer parkiranje ne postane vsakodnevna razprava.",
        ],
      },
      {
        heading: "Piran: slovo na slovenski strani",
        body: [
          "Zadnja etapa je najdaljša in edina, ki terja poln dan: od Splita do Pirana je po obalni strani kakih 490 kilometrov, po avtocesti čez Zagreb pa še nekaj več. Odpeljite se zjutraj, s popoldanskim prihodom pa vam Piran da točno to, kar takrat potrebujete: morje na dosegu roke, ozke ulice brez avta in večerjo z ribami na rtu. Prihod v Piran je najdražja nočitev potovanja — in vredna vsakega evra.",
          "Zadnja nočitev v Sloveniji je praktična toliko kot čustvena: Slovenci so naslednji dan doma v uri in pol, tujci pa se na Brnik zapeljejo po isti cesti, po kateri so prispeli. Zjutraj se lahko odpravite še na soline v Sečovljah, kjer se zadnjič pogleda v bela polja solnih bazenov, potem pa se potovanje, ki se je začelo ob Ljubljanici, konča ob isti reki. Načrt se s tem zaokroži, skupina pa se naslednje jutro zbudi doma — to je vse, kar od dopusta hočete.",
        ],
      },
    ],
    practical: [
      {
        title: "Meja, dokumenti, denar",
        text: "Hrvaška je v Evropski uniji in schengenskem območju, od 1. januarja 2023 tudi v evro območju: kontrol na meji ni, zadošča osebna izkaznica, menjalnica pa ne pride v poštev. Kartice sprejemajo povsod, gotovino imejte za tržnice in manjše konobe. Evropska kartica zdravstvenega zavarovanja velja v obeh državah.",
      },
      {
        title: "Cestnine HAC",
        text: "Hrvaška vinjeta ne obstaja: cestnine plačujete po odsekih na zaplatkah HAC, s kartico ali gotovino, in za hrvaški del tega načrta računajte s kakšnimi 40 do 50 evri. Slovenska e-vinjeta pokriva le domači del; tedenska za osebni avto stane okoli 16 evrov. Za pogoste prevoze se splača ENC-naprava.",
      },
      {
        title: "Plitvice: vstopnina in termin",
        text: "Med 25 in 40 evrov glede na obdobje; v juliju in avgustu karto kupite po spletu in izberite najzgodnejši termin. Ob koncih tedna vstopajte ob odprtju parka, saj se steze napolnijo pred dopoldnevom. Vstopnina vključuje vožnjo z ladjo po največjem jezeru.",
      },
      {
        title: "Postojnska jama",
        text: "Ogledi potekajo vodeno po urniku; termin rezervirajte vnaprej, saj se dopoldanski časi v sezoni razprodajo. V jami je vse leto 8 do 10 stopinj, jakna je obvezna tudi v avgustu. Predjama je kilometer stran in se z jamskim ogledom lepo dopolni v popoldnevu.",
      },
      {
        title: "Rezervacije",
        text: "Bled, Zadar, Split in Piran se za julij in avgust polnijo zgodaj; tri mesece poprej je varna meja. Pri Plitvicah izbirajte med pansiji v Rakovici, Grabovcu in Korenici. V Splitu iščite nastanitev s parkirnim mestom, v Piranu pa se odločite med starim mestom in cenejšo okolico.",
      },
      {
        title: "En avto, več svetov",
        text: "Načrt je narejen za en avto: vse etape so pod tremi urami, razen zadnjega dne, ki se ga začne zgodaj. Prtljaga štirih ljudi nima čudežne rešitve — pakirajte po dnevih, ne po osebah. Vsak naj ima pri roki vodo, kremo in jakno, ker se vreme med postajami menja.",
      },
      {
        title: "Kdaj na pot",
        text: "Junij in september sta optimalna: morje je dovolj toplo, množice manjše, cene nižje. V juliju in avgustu rezervacije niso priporočilo, ampak pogoj. Maj je čudovit za alpski del potovanja, za obalo pa premalo topel; oktober na jugu še drži toplo morje.",
      },
    ],
    faqs: [
      {
        question: "Ali za Hrvaško potrebujem potni list?",
        answer:
          "Ne, zadošča osebna izkaznica: Hrvaška je v Evropski uniji in schengenskem območju. Enako velja za otroke — vsak ima svoj dokument. Potni list vzemite le, če načrtujete podaljšek v Bosno, Črno goro ali Albanijo.",
      },
      {
        question: "Kako poteka meja med Slovenijo in Hrvaško?",
        answer:
          "Kontrol ni več: od vstopa Hrvaške v schengensko območje 1. januarja 2023 se čez mejo pelje kot po domači cesti. Načrtovati je treba le promet, saj so obalne ceste ob vrhu sezone počasne same po sebi. Ruto ne izbirajte več po mejah, ampak po času vožnje.",
      },
      {
        question: "Kako plačujem cestnine na Hrvaškem?",
        answer:
          "Po odsekih na zaplatkah HAC — vinjete ni. Plačate lahko z gotovino ali kartico, za pogoste prevoze pa obstaja ENC-naprava. V Sloveniji za isti avto velja e-vinjeta, ki pokriva le slovenske ceste; tedenska stane okoli 16 evrov.",
      },
      {
        question: "Koliko stane vstopnina za Plitvice?",
        answer:
          "Od približno 25 do 40 evrov glede na obdobje, z popusti za otroke in študente. V sezoni karto kupite po spletu za najzgodnejši termin, ker dnevne kvote zmanjkajo. Cena vključuje ladjo po največjem jezeru in celoten sistem stez.",
      },
      {
        question: "Kaj če imam namesto desetih le sedem dni?",
        answer:
          "Izpustite eno od obalnih postaj: brez Zadra pridete v Split dan prej, brez enega blejskega dne pa se obala podaljša. Vrstni red ohranite — razrez je vedno cenejši od preurejanja. Sedem dni pokrije Bled, jamo, Plitvice in Split; Hvar ostane za naslednjič.",
      },
      {
        question: "Se ta načrt poda z majhnimi otroki?",
        answer:
          "Da, ker nobena etapa ni daljša od treh ur in ker ima vsak del svoj ribalon: jezero, jamo, slapove in morje. Otrokom vzemite čevlje z dobrim podplatom, saj so lesene steze na Plitvicah dolge. Zadnji dan je edini dolg; naredite ga z odmori in zgodnjim odhodom.",
      },
    ],
    relatedSlugs: [
      "ljubljana-dubrovnik-road-trip",
      "bled-plitvice-split",
      "hrvaska-obala-prakticni-vodnik",
      "istria-vikend-iz-slovenije",
    ],
    relatedSloveniaIds: ["bled", "ljubljana", "postojna", "piran"],
  },

  // 3. Hitri teden: Bled → Ljubljana → Postojnska jama → Plitvice → Zadar → Split.
  {
    slug: "bled-plitvice-split",
    title: "Bled, Plitvice in Split: hitri teden od Alp do Jadrana",
    metaTitle: "Bled, Plitvice in Split: hitri teden na Jadran",
    description:
      "Sedemdnevni načrt od Bleda do Splita v eni smeri: Ljubljana, Postojnska jama, Plitvice in Zadar na poti. Vrstni red, ki ne vozi nazaj, z vstopninami.",
    excerpt:
      "Teden, ki se začne ob Blejskem jezeru in konča na Rivi v Splitu — sedem dni, ena smer, brez voženj nazaj.",
    route: "Bled → Ljubljana → Postojnska jama → Plitvice → Zadar → Split",
    countries: ["SI", "HR"],
    days: 7,
    km: 900,
    heroImage: "/adria/bled-plitvice-split.jpg",
    heroAlt:
      "Lesene steze nad turkiznimi jezeri Plitvic s slapovi, po katerih hodijo obiskovalci v jutranji svetlobi",
    author: "Tanja Novak",
    date: "2026-07-28",
    readTime: 9,
    stops: [
      {
        name: "Bled",
        country: "SI",
        nights: 0,
        highlight:
          "Prvo jutro ob jezeru: sprehod okrog Blejskega jezera, pogled na grad s skale in pletna na vodi, potem pa petdeset minut vožnje do Ljubljane.",
      },
      {
        name: "Ljubljana",
        country: "SI",
        nights: 1,
        highlight:
          "Večer v starem mestnem jedru ob Ljubljanici, jutranja kava na tržnici in vzpenjačka na grad, preden se pot nadaljuje proti kraškemu podzemlju.",
      },
      {
        name: "Postojnska jama",
        country: "SI",
        nights: 0,
        highlight:
          "Ura in pol podzemlja z vlakcem in sprehodom ob stalaktitih; v jami je vse leto med osmimi in desetimi stopinjami, zato jakna ostane pri roki.",
      },
      {
        name: "Plitvice",
        country: "HR",
        nights: 1,
        highlight:
          "Nočitev ob parku in jutro ob odprtju: kaskade jezer, slapovi in lesene steze — vstopnina se giblje med 25 in 40 evrov glede na obdobje.",
      },
      {
        name: "Zadar",
        country: "HR",
        nights: 2,
        highlight:
          "Morske orglje na pomolu, na katerih valovi igrajo, in zahod sonca, ki ga je Alfred Hitchcock imenoval najlepšega na svetu — zvečer, ne čez dan.",
      },
      {
        name: "Split",
        country: "HR",
        nights: 2,
        highlight:
          "Dioklecijanova palača kot mestno jedro, Riva za jutranjo kavo in Marjan za pogled na otoke; od tod je domov dobrih 460 kilometrov avtoceste.",
      },
    ],
    sections: [
      {
        heading: "Vrstni red, ki ne vozi nazaj",
        body: [
          "Ta teden ima eno pravilo, ki ga je vredno ubogati: poteka v eni smeri in nobenega kilometra ne naredi dvakrat. Zaporedje — Bled, Ljubljana, jama, Plitvice, Zadar, Split — je razporejeno tako, da je vsaka etapa krajša od treh ur: od Bleda do Ljubljane petdeset minut, od Ljubljane do Postojne dobrih petdeset kilometrov, od jame do Plitvic kakih dve uri in pol, od Plitvic do Zadra pa še manj. Edina prava vožnja ostane za konec, in to je njen smisel.",
          "Konec v Splitu je premišljen. Jug je najtoplejši del poti, zato vsak dodan dan tam prinese več kot dodan dan na severu; iz Splita pa vodita dva izhoda — avtocesta, ki vas v enem dnevu in dobrih 460 kilometrih pripelje nazaj v Ljubljano, ali letališče, s katerim tujci krog zaprejo brez povratka. Slovenci večinoma izberejo prvo in zadnjo noč prespijo doma; oboje je legitimno, odločitev pa se naredi ob rezervaciji, ne na parkirišču.",
        ],
      },
      {
        heading: "Prva 48 ur: jezero, mesto, podzemlje",
        body: [
          "Prvo jutro pripada Bledu: sprehod okrog jezera traja kakšno uro in pol po razgibani stezi, pogled na grad s skale stoji ob poti, pletna pa vozijo, dokler je sezona. Po kosilu se zapelje v Ljubljano, petdeset minut po avtocesti, kjer večer poteče po znanem vrstnem redu: Tromostovje, trg, vzpenjačka na grad, večerja ob Ljubljanici. Naslednje jutro še tržnica in kava, potem pa volan proti jugozahodu.",
          "Postojnska jama je prvi postanek, ki ga kdor koli pomoti: v resnici je ura in pol sistemov dvoran, v katere vlakec le pripelje, ogled pa je voden po terminih, v jami, ki drži vse leto od osmih do deset stopinj, pa jakna ni marketinški dodatek. Kilometer naprej stoji Predjama, grad, zabit v steno; če ima dan še dve uri, jih porabite tam. Zvečer prispete k Plitvicam, kakih dvesto dvajset kilometrov stran, in spite ob parku.",
        ],
      },
      {
        heading: "Plitvice: ura odloči vse",
        body: [
          "Plitvice so najbolj občutljiv del poti, ker so najbolj znane — in ker njihova lepota ne trpi le ob vremenu, ampak tudi ob uri. Vstopnina se giblje med 25 in 40 evrov glede na obdobje; v sezoni jo kupite po spletu in z najzgodnejšim terminom, ker se dnevne kvote izčrpajo. Park odpirajo po urniku, ob koncih tedna pa se steze napolnijo pred deveto. Nočitev ob parku zato ni luksuz, ampak del iste taktike.",
          "Ogled vzame od štirih do šestih ur, odvisno od izbrane poti; daljša različica okoli spodnjih jezer je manj polna in lepša, krajša pa naredi dopoldne. Iz parka se popoldne pelje v Zadar, kakih 110 kilometrov po avtocesti oziroma dobro uro, kamor se prispe še za kopanje in prvo obalno večerjo. Tako se najdaljša notranja etapa poti razdeli na dva obvladljiva dneva in noben dan ne ostane samo vožnja.",
        ],
      },
      {
        heading: "Zadar: orglje, pomol in zahod",
        body: [
          "Zadar je mesto, ki se prodaja s tremi stvarmi, in vse tri so proste: starim mestnim jedrom na polotoku, ki je ohranilo rimski pravokotnik ulic, Morskimi orglami na zahodnem pomolu in zahodom sonca, ki ga je Alfred Hitchcock, ne povsem natančno, imenoval najlepšega na svetu. Orglje so stopnice z cevmi, v katere valovi potiskajo zrak — zvok je bolj ambient kot koncert, a se ob njem zahod vsakega večera odigra pred polno tribuno.",
          "Dve noči v Zadru pomenita jutro za Kalelargo in tržnico, popoldne za kopanje na bližnjih prodnatih plažah in en večer, ki ga prepustite pomolu. Če se skupina odloči za izlet, so od tod vožnje s čolni na Kornate — a ta teden jih ni v računu; prepuščajo se tistim, ki so za Jadran vzeli teden več. Zadar je tu predvsem oddih med dvema daljšima dnema, in to vlogo opravi odlično.",
        ],
      },
      {
        heading: "Split: zaključek z morjem pred pragom",
        body: [
          "Zadnji dve noči sta rezervirani za Split, ker ima ta teden pravilno končnico: mesto, v katerem se zadnji dan lahko zgodi karkoli — palača, Riva, Marjan, izlet na Hvar ali samo spanje do odhoda. Dioklecijanova palača je živelo mestno jedro, v katerem ne plačate sprehoda, ampak le posamezne dele: podzemlje in zvonik. Zadnji večer na Rivi je tradicionalno najdaljši večer potovanja.",
          "Za Slovence se pot tukaj odloči med dvema možnostma: vožnja domov v enem kosu, dobrih 460 kilometrov po avtocesti oziroma štiri ure in pol z odmori, ali razdelitev z nočitvijo ob poti, če se zadnji večer predolgo obesi. Tujci imajo letališče pol ure od centra in let, ki potrdi smiselnost vrstnega reda. V obeh primerih velja isto pravilo: naslednjič začnite tako, kot ste končali — na jugu.",
        ],
      },
    ],
    practical: [
      {
        title: "Plitvice: vstopnina in termin",
        text: "Med 25 in 40 evrov glede na obdobje; v juliju in avgustu karto kupite po spletu za najzgodnejši termin, saj kvote zmanjkajo. Vstopajte ob odprtju parka — ob koncih tedna se steze napolnijo pred deveto. Ogled vzame od štirih do šestih ur, zato načrtujte zanj celo jutro.",
      },
      {
        title: "Postojnska jama",
        text: "Vodeni ogledi potekajo po urniku; termin rezervirajte vnaprej, saj se dopoldani v sezoni razprodajo. V jami je vse leto 8 do 10 stopinj — jakna tudi poleti. Celoten ogled z vlakcem in sprehodom traja uro in pol; Predjama je kilometer stran in se lepo prime k popoldnevu.",
      },
      {
        title: "Etape in odhodi",
        text: "Vse etape razen zadnje so krajše od treh ur; vozni dnevi se začnejo zgodaj, da so popoldnevi prosti. Edina dolga vožnja je povratek iz Splita — dobrih 460 kilometrov. Če se vam zdi predolg, ga razdelite z nočitvijo v Zadru ali na Kvarnerju.",
      },
      {
        title: "Cestnine HAC",
        text: "Hrvaške vinjete ni: cestnine plačate po odsekih na zaplatkah HAC, s kartico ali gotovino. Na tej ruti je hrvaške avtoceste malo — glavna odseka sta Zagreb–Plitvice in povratek iz Splita. Slovenska e-vinjeta pokriva le domači del; tedenska stane okoli 16 evrov.",
      },
      {
        title: "Zadar: pomol brez avta",
        text: "Staro mestno jedro je zaprto za avto: pustite ga na plačljivem parkirišču na robu in vsa zadržanja opravite peš. Morske orglje in Pozdrav sonca sta na zahodnem pomolu, do katerega vodita deset minut hoje iz katerega koli dela starega mesta. Zvečer je zahod sonca ura, okoli katere se vse vrti.",
      },
      {
        title: "Split: kam z avtom",
        text: "Palača in označeni center sta zaprta za avto; parkirajte na plačljivih conah okoli pristanišča ali Bačvic in se sprehodite do jedra. Boljša rešitev je nastanitev s parkirnim mestom na zahodu mesta. Trajekti na otoke odhajajo iz pristanišča — v sezoni rezervirajte, če vozite avto na palubo.",
      },
    ],
    faqs: [
      {
        question: "Zakaj se teden konča v Splitu in ne v Zadru?",
        answer:
          "Ker je Split najbolj povezan konec te smeri: od tod vodi avtocesta naravnost v Ljubljano, dobrih 460 kilometrov, tujcem pa ostaja letališče. Zadar kot cilj bi pomenil krajše potovanje, a tudi manj morja na koncu. Vrstni red je narejen tako, da se etape krajšajo proti koncu.",
      },
      {
        question: "Koliko časa vzamem za Plitvice?",
        answer:
          "Od štirih do šestih ur, odvisno od poti; daljša različica okoli spodnjih jezer je manj polna. Vstop ob odprtju je pogoj za mir, ob koncih tedna še zlasti. Karta vključuje vožnjo z ladjo po največjem jezeru — naredite jo, saj je del izkušnje.",
      },
      {
        question: "Kdaj poslušati Morske orglje?",
        answer:
          "Ob zahodu sonca, ko se pomol napolni in valovi dvigujejo. Zvok je odvisen od valov in vetra, zato ni vsak večer enak. Orglje in Pozdrav sonca sta brezplačna in dostopna ves dan — čez dan so le manj slišni.",
      },
      {
        question: "Ali se ta načrt naredi v petih dneh?",
        answer:
          "Naredi, a z izgubo: skrajšate Bled na jutro, Ljubljano na večer ali izpustite Zadar. Vrstni red ohranite vedno — krajšanje gre na račun postaj, nikoli vrstnega reda, sicer se vozite nazaj. Pet dni pokrije Bled, jamo, Plitvice in Split.",
      },
      {
        question: "Kako se vrnem iz Splita?",
        answer:
          "Po avtocesti v enem dnevu: dobrih 460 kilometrov, okoli štiri ure in pol z odmori. Odidite bodisi zgodaj zjutraj bodisi po kosilu, da se izognete popoldanskemu vrhu. Če se vam ne mudi, razdelite povratek z nočitvijo v Zadru ali na Kvarnerju.",
      },
      {
        question: "Ali je Postojnska jama vredna postanka, če smo jo že videli?",
        answer:
          "Odvisno, kako dolgo je bilo. Ogledi se sicer ponavljajo, a krajšanje dovoljeno je: peljite se naravnost na Plitvice in prihranite kakšni dve uri. Če jo preskočite, izpustite edini kraški del potovanja — to je edina cena.",
      },
    ],
    relatedSlugs: [
      "slovenija-hrvaska-10-dni",
      "ljubljana-dubrovnik-road-trip",
      "hrvaska-obala-prakticni-vodnik",
    ],
    relatedSloveniaIds: ["bled", "vintgar", "ljubljana", "postojna"],
  },

  // 4. Vikend izlet v Istro: petek–nedelja, obala + griči + Pula.
  {
    slug: "istria-vikend-iz-slovenije",
    title: "Vikend v Istri iz Slovenije: Piran, griči, Rovinj in Pula",
    metaTitle: "Vikend v Istri iz Slovenije: Motovun, Rovinj, Pula",
    description:
      "Petek, sobota, nedelja: Piran in obala na začetku, griči s tartufi sredi, Rovinj in Pula na koncu. Okoli 420 kilometrov in vse v enem vikendu.",
    excerpt:
      "Istra je najbližja tuja pokrajina, ki se obnaša, kot da je vaša: sol, griči, tartufi in rdeča streha za vsakim ovinkom — trije dnevi in 420 kilometrov.",
    route: "Ljubljana → Piran → Umag → Novigrad → Grožnjan → Motovun → Oprtalj → Rovinj → Pula",
    countries: ["SI", "HR"],
    days: 3,
    km: 420,
    heroImage: "/adria/istria-vikend-iz-slovenije.jpg",
    heroAlt:
      "Motovun na hribu nad dolino Mirne s srednjeveškim obzidjem, vinogradi in cipresami, pod poznopoletno svetlobo",
    author: "Marko Kovač",
    date: "2026-07-31",
    readTime: 8,
    stops: [
      {
        name: "Ljubljana",
        country: "SI",
        nights: 0,
        highlight:
          "Petkov izhod po avtocesti proti Obali: dobrih 130 kilometrov do Pirana, najboljša odhodna ura pa tista, ki vas na obalo privede še pred dopoldanskim vrhom.",
      },
      {
        name: "Piran",
        country: "SI",
        nights: 0,
        highlight:
          "Sol in sonce za uvod: sprehod po piranskem rtu, Tartini trg in pogled z obzidja, preden se čez Dragonjo zapelje v hrvaško Istro.",
      },
      {
        name: "Novigrad",
        country: "HR",
        nights: 1,
        highlight:
          "Prva nočitev v severni Istri: Novigrad s konobami ob obali, popoldan na plaži in večerja z ribami; Umag je ob predvečerju na dosegu roke.",
      },
      {
        name: "Grožnjan",
        country: "HR",
        nights: 0,
        highlight:
          "Vas umetnikov na hribu: galerije v kamnitih hišah, ateljeji in razgled čez dolino, ki ga zvok klavirja iz kake hiše še podaljša.",
      },
      {
        name: "Motovun",
        country: "HR",
        nights: 0,
        highlight:
          "Najbolj znan grič Istre: obzidje okrog starega mesta, razgled na dolino Mirne in gozdovi okoli nje, iz katerih prihajajo tartufi za vašo nedeljsko malico.",
      },
      {
        name: "Oprtalj",
        country: "HR",
        nights: 0,
        highlight:
          "Najmirnejši od gričev: freske na pročeljih kamnitih hiš, prazna glavna ulica in razgled, za katerega se zdi, da je vikend naredil zanj.",
      },
      {
        name: "Rovinj",
        country: "HR",
        nights: 1,
        highlight:
          "Osrednja točka vikenda: staro mesto na rtu, ulica Grisia, cerkev sv. Eufemije z zvonikom za panoramo in sobotnji večer, ki traja do polnoči.",
      },
      {
        name: "Pula",
        country: "HR",
        nights: 0,
        highlight:
          "Zadnji ovinek pred domov: rimska arena v središču mesta, ogled v dobri uri in pol, potem pa kakšnih 140 kilometrov do Ljubljane.",
      },
    ],
    sections: [
      {
        heading: "Logika treh dni",
        body: [
          "Vikend v Istri deluje le, če je vsak dan naperjen v svojo smer. Petek pelje naravnost na obalo: Ljubljana, Piran in čez Dragonjo do Umaga in Novigrada, kjer vas čakata prva nočitev in še topli del dneva. Sobota se dvigne v griče — Grožnjan, Motovun, Oprtalj — in zvečer spusti v Rovinj, ki si zasluži edini pravi večer potovanja. Nedelja je sestavljena iz jutranjega Rovinja in puljske arene, ki stoji kakih 35 kilometrov južneje, potem pa pelje domov.",
          "Ta razpored ni poljuben. Obala v petek popoldne deluje, ker je morje najboljši način, da se služba izbriše iz telesa; griči v soboto dopoldne, ker je v hribih prijetno pred pripeko in ker so vas tam, ko tržnice in konobe še dihajo; Rovinj zvečer, ker je njegovo staro mesto narejeno za noč. Nedeljski del je logistika: Pula je na poti domov le z majhnim ovinkom, arena pa ogled, ki ga naredite med prtljago in kosilom ob cesti.",
        ],
      },
      {
        heading: "Petek: Piran, meja in severna obala",
        body: [
          "Iz Ljubljane se na Obalo pride v dobri uri in pol; če se na mizo postavi petek v juliju, dodajte še pol ure potrpežljivosti za promet. Piran je postanek, ki ga ta smer zahteva: mesto na rtu, ki je zraslo iz solin, z ulicami, v katere avto nima kaj iskati. Parkirajte pred starim mestom in se sprehodite do Tartinijevega trga; pogled z obzidja na zaliv stoji za stopnicami.",
          "Čez Sečovlje–Dragonjo se preide kot po domači cesti — Hrvaška je od 1. januarja 2023 v schengenskem območju, kontrol ni, a prelaz je ozek, zato se poletni petki in nedelje vendarle zapeljejo z zamudo, ki je ne povzroča policija, ampak promet sam. Umag je prvi hrvatski kraj na poti: staro mestno jedro na rtu, marina in obala za sprehod, ne za celodnevno zadrževanje. Novigrad, deset kilometrov južneje, je postaja, kjer petek dejansko pristane — konobe ob obali, plaža in večerja z ribami.",
        ],
      },
      {
        heading: "Sobota: griči, tartufi in malvazija",
        body: [
          "Sobotno jutro zapusti obalo in se povzpne v notranjost, kjer Istra spremeni barvo: rdeča zemlja, vinogradi, ciprese in griči, ki so videti, kot da so jih nasuli z namenom. Grožnjan je prvi — vas umetnikov z galerijami v kamnitih hišah, ki pošteno živi od svojega slovesa. Motovun je drugi in glavni: obzidje nad dolino Mirne, v kateri se pod hrasti skriva najbolj znana hrvaška poslastica.",
          "Tartufi so gospodarstvo te doline: jeseni in pozimi jih iz gozda vlečejo psi z izurjenim nosom, poleti pa konobe jedi delajo iz olj in konzerv, ki jih prodajajo trgovine v Livadah, sredi doline pod Motovunom. Naročite fuže s tartufi in kozarec malvazije — belo sorto, ki se je za ta teren razvila prav tu — in kosilo je narejeno. Oprtalj, zadnji grič, je najmirnejši: freske na pročeljih, prazna ulica in razgled, za katerega se zdi, da je narejen zanj.",
        ],
        list: [
          {
            title: "Grožnjan",
            text: "Vas umetnikov z galerijami in ateljeji; obiščite jo dopoldne, ko so vrata odprta in senca še dolga.",
          },
          {
            title: "Motovun",
            text: "Obzidje nad dolino Mirne; parkirajte pod mestom in se po stopnicah vzpnite v dobrih desetih minutah.",
          },
          {
            title: "Livade",
            text: "Središče tartufne doline pod Motovunom; nakup olj, patéjev in konzerv za domači nadaljevanje.",
          },
          {
            title: "Oprtalj",
            text: "Najtišji grič s freskami na pročeljih; postanek pol ure, ki ga nikoli ne obžalite.",
          },
        ],
      },
      {
        heading: "Rovinj: sobotni večer in nedeljsko jutro",
        body: [
          "Iz gričev se v Rovinj pride v dobri uri; prihod po petih popoldne je nalašč, ker mesto takrat mehča. Staro jedro se drži rta kot gnezdo: ulica Grisia z ateljeji, ribiška obala z barvami hiš in cerkev sv. Eufemije, katere zvonik je edini razlog, da se v staro mesto vzpenjate s štetjem stopnic. Večerja je v konobi na obali, sobotna noč pa se v Rovinju ne konča ob polnoči iz načela.",
          "Nedeljsko jutro pripada praznemu mestu: pred osmo so v ulicah le ribiči in peki, zvonik se odpira zjutraj, pogled s kroga okoli cerkve pa sega čez obalo vse do zaliva. Ta ura je razlog, da je druga nočitev prav tu in ne v Puli: vikend se zbudi v mestu, ki je jutranje najlepše, potem pa se odpravi proti domu s postankom, ki ga poznajo vsi.",
        ],
      },
      {
        heading: "Nedelja: Pula in etapa domov",
        body: [
          "Pula je od Rovinja oddaljena kakih 35 kilometrov in njen amfiteater je največji spomenik, ki ga boste na tem vikendu srečali: arena iz prvega stoletja, v kateri so gledalci sedeli za gladiatorje, danes pa poleti tudi za koncerte. Ogled vzame dobri uri in pol z okolico, mestno jedro pa je kratek sprehod stran. Vstopnina ni zanemarljiva, a je arena med stvarmi, kjer se o vrednosti ni treba pogajati.",
          "Doma ste v dobrih dveh urah — kakih 140 kilometrov čez Buje, Plovanijo in Koper. Nedeljskega povratniškega prometa ne morete izničiti, lahko pa ga obidete: če iz Pule odidete pred enajsto, ste na slovenski strani, preden se obalna cesta spremeni v kolono. Vikend se s tem zapre pri približno 420 kilometrih, treh dneh in enem dolgu, ki ga poravnate naslednjič — v Istri namreč vedno ostane kakšna nedokončana ulica.",
        ],
      },
    ],
    practical: [
      {
        title: "Meja na Dragonji",
        text: "Kontrol ni: Hrvaška je v schengenskem območju od 1. januarja 2023. A prelaz pri Sečovljah je ozek, poleti ob petkih in nedeljah pa se promet sam od sebe zadrži — zamuda pol ure ni redkost. Čezmejno etapo naredite zgodaj zjutraj, ne ob enajstih.",
      },
      {
        title: "Spanje v dveh bazah",
        text: "Petkova nočitev v severni Istri — Umag, Novigrad — je cenejša od sobotne v Rovinju, zato bazo menjajte tako, kot narekuje ta načrt. Za julij in avgust rezervirajte dva do tri meseje vnaprej. Izven vrha sezone je soba najdena še isti teden.",
      },
      {
        title: "Tartufi: kdaj in kje",
        text: "Sveži tartufi pridejo z jesenjo in zimo, poleti pa konobe jedi pripravljajo iz olj in konzerv. V Livadah, pod Motovunom, je nakup domač načrt: olje in paté preživita pot domov in še dišita po vikendu. Belega tartufa kupujte le v sezoni, po gramih in pri preverjenih trgovcih.",
      },
      {
        title: "Cestnine in vinjeta",
        text: "Po Istri se vozite po državnih cestah, kjer cestnin ni; avtoceste na tej ruti praktično ni. Slovenska e-vinjeta pokriva domači del — tedenska stane okoli 16 evrov — hrvaške vinjete pa ni niti treba, ker obstaja ne bi. Gorivo je na obeh straneh primerljivo.",
      },
      {
        title: "Parkiranje v mestih",
        text: "V Piranu parkirajte pred starim mestom in vstopite peš; v Motovunu na parkirišču pod mestom, vzpon pa naredite po stopnicah. V Rovinju izberite plačljivo cono na robu starega mesta, v Puli pa parkirišča ob areni. V avtu ne pustite ničesar na videz.",
      },
      {
        title: "Kdaj v Istro",
        text: "Maj, junij, september in oktober so za griče najlepši meseci; julij in avgust za morje, a z množicami, ki v Rovinju niso šala. Konec septembra je zlato obdobje: toplo morje, začetek tartufne sezone in nižje cene. Za prvi obisk vzemite topel mesec.",
      },
    ],
    faqs: [
      {
        question: "Koliko kilometrov je ta vikend?",
        answer:
          "Okoli 420: od Ljubljane do Pirana dobrih 130, petkova etapa do Novigrada še dobrih 30, sobota čez griče v Rovinj kakih 100 in nedelja z Pulo domov preostanek. Vse skupaj se naredi v treh dneh brez ene same dolge vožnje.",
      },
      {
        question: "Koliko traja prestop meje na Dragonji?",
        answer:
          "Nekaj minut, kontrol ni — Hrvaška je v schengenskem območju. V vrhu sezone pa se ob prehodu ustavi promet sam: kolona je posledica ozke ceste, ne policije. Zato zgodaj zjutraj ali pozno zvečer, ne ob petih popoldne.",
      },
      {
        question: "Kdaj je sezona tartufov?",
        answer:
          "Jesen in zima: beli tartuf ima vrhunec od oktobra do decembra, poleti svežih ni. Vse leto so v ponudbi olja, patéji in jedi iz konzerviranih tartufov, ki so boljši, kot zvenijo. Za svežega se vrnite septembra ali oktobra.",
      },
      {
        question: "Ali se splača vzpon na Motovun?",
        answer:
          "Da — parkirišče je pod mestom, vzpon po stopnicah vzame dobrih deset minut, zgoraj pa je obzidje s pogledom na dolino Mirne. V pripeki se vzpenjajte zjutraj. Notranjost mesta je manjša, kot pričakujete, a prav zato deluje.",
      },
      {
        question: "Kaj narediti z otroki?",
        answer:
          "Severna obala je otroška: plaže v Novigradu in Umagu so plitve in urejene. V gričih so vzponi kratki, s koleščki pa ne gre — mlajše nosite v nosilki. Puljska arena na vse naredi vtis, v Rovinju pa se otroci najbolje znajdejo na pomolu s sladoledom.",
      },
      {
        question: "Kje jesti?",
        answer:
          "V konobah, ne v restavracijah: severna obala za ribe, griči za fuže s tartufi in pršut, Rovinj za vse skupaj z malvazijo. Rezervacija za sobotno večerjo v Rovinju je modrost, ne pikica. Za sladoled velja pravilo najkrajše vrste.",
      },
    ],
    relatedSlugs: [
      "slovenija-hrvaska-10-dni",
      "hrvaska-obala-prakticni-vodnik",
      "hrvaski-otoki-iz-slovenije",
    ],
    relatedSloveniaIds: ["piran", "portoroz", "ljubljana"],
  },

  // 5. Sistematičen praktični priročnik hrvaške obale od Istre do Konavlja.
  {
    slug: "hrvaska-obala-prakticni-vodnik",
    title: "Hrvaška obala od Istre do Konavlja: praktični priročnik",
    metaTitle: "Hrvaška obala praktično: cestnine, trajekti, plaže",
    description:
      "Priročnik obale od Istre do Konavlja: kdaj na jug, plačljive in proste plaže, cestnine HAC, trajekti Jadrolinija, parkiranje, spanje in temperatura morja.",
    excerpt:
      "Vse, kar se na hrvaški obali naučite drago, v enem vodniku: meseci in množice, cestnine po odsekih, trajekti, parkiranje, spanje in morje od maja do oktobra.",
    route: "Ljubljana → Rijeka → Zadar → Split → Dubrovnik",
    countries: ["SI", "HR"],
    days: 7,
    km: 1000,
    heroImage: "/adria/hrvaska-obala-prakticni-vodnik.jpg",
    heroAlt:
      "Prodnata plaža ob prozornem Jadranskem morju z barkami na vezu in senco borov v popoldanski svetlobi",
    author: "Tanja Novak",
    date: "2026-08-04",
    readTime: 13,
    stops: [
      {
        name: "Ljubljana",
        country: "SI",
        nights: 0,
        highlight:
          "Referenčna točka: od Ljubljane je do Rijeke okoli 120 kilometrov, do Splita približno 460, do Dubrovnika pa okoli 690 — vsak račun na obali se začne s temi številkami.",
      },
      {
        name: "Rijeka",
        country: "HR",
        nights: 1,
        highlight:
          "Prva postaja in vrata na jug: korzo v središču, Trsat nad mestom in izbira — zaviti v Senj po obalni cesti ali ostati na avtocesti do Zadra.",
      },
      {
        name: "Zadar",
        country: "HR",
        nights: 2,
        highlight:
          "Morske orglje in zahod sonca kot uvod v obalo: staro mesto na polotoku, odprto morje na zahodu in prenočišče, iz katerega se do vsega sprehodi.",
      },
      {
        name: "Split",
        country: "HR",
        nights: 2,
        highlight:
          "Vozlišče obale: palača, pristanišče za trajekte na otoke in izhodišče za jug — za praktične račune je Split središče, okoli katerega se vse vrti.",
      },
      {
        name: "Dubrovnik",
        country: "HR",
        nights: 1,
        highlight:
          "Končna točka koridorja: Obzidje v jutranji uri, Lokrum pred popoldanskim soncem in račun, da je od Splita sem dobrih 200 kilometrov čez Pelješki most.",
      },
    ],
    sections: [
      {
        heading: "Kdaj na jug: meseci, množice in morje",
        body: [
          "Koledar obale je narejen okoli šolskih počitnic. Julij in avgust prineseta vrhunec vsega: morje je najtoplejše, 24 do 26 stopinj, nastanitve najdražje, avtoceste ob sobotah pa najbolj podobne parkiriščem. Junij in september sta nasprotje — morje ima še vedno okoli 22 oziroma 23 stopinj, gneča se redči, cene pa se umirijo za četrtino ali tretjino. Za večino potovanj je to edina pametna izbira.",
          "Rep koledarja je prav tako uporaben. Maj odpre obalo s svežim morjem, 18 do 20 stopinj, in praznimi ulicami; oktober na jugu pogosto še drži okoli 20 stopinj, Dubrovnik pa se tedaj sprosti križark. Zima na obali ni tema za ta priročnik. Odločitev je torej preprosta: toplo in polno ali zmernejše in umirjeno — sredina, junij in september, je najboljša.",
        ],
        list: [
          {
            title: "Maj",
            text: "Morje 18 do 20 stopinj; sveže kopanje, obala brez gneče in najnižje cene sezone.",
          },
          {
            title: "Junij",
            text: "Okoli 22 stopinj; prvi mesec, v katerem je kopanje povsem prijetno, množice pa še mirne.",
          },
          {
            title: "Julij in avgust",
            text: "Od 24 do 26 stopinj; vrhunec temperature — tudi cen, prometa in množic na vseh ploščah.",
          },
          {
            title: "September in oktober",
            text: "Okoli 23 stopinj, na jugu še 20 v oktobru; najboljše razmerje med toplim in mirnim.",
          },
        ],
      },
      {
        heading: "Plaže: kaj je prosto in kaj plačljivo",
        body: [
          "Večina hrvaške obale je javna in prosto dostopna: prod, skale in betonske plošče, do katerih vodijo stopnice, voda pa je enaka za vse. Plačljivo ni plaža, ampak oprema na njej — sončnik in ležalnik na organizirani plaži v sezoni stane toliko, kot bi doma plačali dvakratni ogled muzeja. Hoteli svojih bregov praviloma ne zapirajo: večina hotelskih plaž je dostopna vsem, le ležalniki so rezervirani.",
          "Divje kote — zalivi, do katerih vodi makadam ali čoln — so brezplačni in pogosto najlepši, a brez senc, pitne vode in reševalcev, kar se bolje ve prej kot na kraju. Organizirana plaža je za družino z majhnimi otroki racionalna izbira: plitvina, sončnik in tuš stanejo svoje, otroci pa so vidni z enega mesta. Praktično pravilo obale: zjutraj prod, popoldne senca — vse ostale razdelitve si naredite sami.",
        ],
      },
      {
        heading: "Cestnine HAC: brez vinjete, po odsekih",
        body: [
          "Hrvaška cestnine ureja po staromodnem sistemu: vinjete ni, na koncu vsakega avtocestnega odseka pa stoji zaplatka, kjer se plača prevožen del. Od Rijeke do Splita računajte s kakšnimi 30 evri, od Splita do Dubrovnika, čez Pelješki most, pa z okoli 10. Za celoten koridor od Istre do Konavlja torej okoli 40 evrov v eno smer — denar, ki ga obalna cesta prihrani, plačate s časom, ki ga raje ne bi.",
          "Zaplatke prehajate na tri načine: z gotovino pri okencu, s kartico na avtomatskih stezah ali z ENC-napravo, elektronsko škatlico za vetrobransko steklo, ki odšteva brez ustavljanja. ENC se splača, če na Hrvaško vozite večkrat na leto; za en dopust je kartica povsem dovolj. Slovenski del poti pokriva e-vinjeta — tedenska za osebni avto stane okoli 16 evrov — in velja izključno v Sloveniji, kar je treba vedeti pred prvo zaplatko, ne po njej.",
        ],
      },
      {
        heading: "Trajekti Jadrolinija: otoki brez presenečenj",
        body: [
          "Jadrolinija je glavni trajektar na obali in njeni trajekti so del mestne logike: Split je vozlišče za Brač, Hvar, Šolto in Vis, na katerih se dalmatinski dan lahko začne s palubo. Poleti je za avto rezervacija obvezna — in to dobesedno: karte za julij in avgust se razprodajo tedne naprej, na dan odhoda pa prostora na krovu ni niti s srečo. Peš potniki pridejo na karto isti dan, a tudi zanje v vrhu sezone vlada vrsta.",
          "Rezervacija poteka po spletu, na dan plovbe pa se prijavite vsaj uro pred odhodom, ker se vkrcavanje zapre pred odplulom — z zamudo pridete na naslednjo plovbo, ne na isto. Cena vožnje se računa po dolžini avta, potniki pa plačajo svoje. Katamarani, ki vozijo le peš potnike, so alternativa za izlete brez avta in poleti rešijo dneve, ko bi s palubo zamudili pol dopoldneva.",
        ],
      },
      {
        heading: "Mesta, parkiranje in spanje: kje ostane denar",
        body: [
          "Stara mestna jedra so zaprta za avto, okoli njih pa se vrtijo plačljive cone, ki se v sezoni dražijo z uro dneva. Strategija je vedno ista: avto na parkirišče na robu in noge — v Zadru za polotok, v Splitu okoli pristanišča in Bačvic, v Dubrovniku v Gružu ali nad mestom. V avtu ne pustite ničesar na videz; razbito steklo je med dražjimi spomini dopusta.",
          "Spanje je najbolj prilagodljiva postavka računa. Kampi so najcenejša oblika obale in počitek v njih ni slabši, le drugačen; sobe v zasebni ponudbi stanejo manj od hotelov, nastanitve pet do deset kilometrov v zaledju pa še manj. V juliju in avgustu se brez rezervacije ni kaj za varčevati; junij in september sta meseca, ko se o ceni še da govoriti.",
        ],
      },
      {
        heading: "Varnost, morje in stvari, ki se izgubijo",
        body: [
          "Obala je varna, a ne naivna. Na polnih mestnih plažah delajo tatovi, ki iščejo torbice in telefone, ostavljene na brisačah med kopanjem; dokumenti in denar zato ostanejo v sefu nastanitve, na plažo pa gre tisto, kar preživi morsko vodo. V avtu ne pustite ničesar na videz, tudi ne navigatorja na držalu — nadomestilo za okno je dražje od vsega, kar je bilo v njem.",
          "Morje ima svoj koledar drobnih nevarnosti: morski ježki ob skalah se izognejo z gumijastimi čevlji, meduze so večinoma neškodljive, a znajo pokvariti plavanje. Poleti je resnejša stvar suša: požarna ogroženost pomeni prepoved odprtega ognja in parkiranje le na urejenih površinah, kajti suha trava pod avtom je resen vzrok požarov. Ob težavah pokličite 112 — reševalne postaje so poleti na vidik od plaže.",
        ],
      },
    ],
    practical: [
      {
        title: "Cestnine po odsekih",
        text: "Vinjete na Hrvaškem ni: cestnine plačujete na zaplatkah HAC po odsekih, z gotovino ali kartico. Od Rijeke do Splita računajte okoli 30 evrov, od Splita do Dubrovnika čez Pelješki most pa okoli 10. Slovenska e-vinjeta pokriva le domači del — tedenska stane okoli 16 evrov.",
      },
      {
        title: "Trajekti poleti",
        text: "Jadrolinija je glavni trajektar; za avto je rezervacija poleti obvezna in karte za julij ter avgust zmanjkajo tedne naprej. Na dan plovbe se prijavite vsaj uro pred odhodom, saj vkrcavanje zaprejo prej. Katamarani vozijo peš potnike in so alternativa za izlete brez avta.",
      },
      {
        title: "Parkiranje v mestih",
        text: "Stara jedra so zaprta za avto; plačljive cone se v sezoni dražijo z uro dneva. Avto postavite na robu — Zadar za polotokom, Split okoli pristanišča, Dubrovnik v Gružu — in uporabite noge. V avtu ne pustite ničesar na videz.",
      },
      {
        title: "Cenejša nočitev",
        text: "Kampi so najcenejša obala; zasebne sobe in apartmaji stanejo manj od hotelov, nastanitve pet do deset kilometrov v zaledju pa še manj. Junij in september se cene umirijo za četrtino do tretjine. Rezervacija direktno pri lastniku pogosto obide provizijo velikih platform.",
      },
      {
        title: "Varnost na plaži",
        text: "Kraje telefonov in torbic na polnih plažah niso legenda: dokumenti ostanejo v sefu, kopanje pa se izmenjuje s varovanjem stvari. Morski ježki zahtevajo gumijaste čevlje, ob požarni ogroženosti pa veljajo prepovedi odprtega ogenja in parkiranja po suhi travi. Ob težavah pokličite 112.",
      },
      {
        title: "Morje po mesecih",
        text: "Maj 18 do 20 stopinj, junij okoli 22, julij in avgust 24 do 26, september okoli 23, oktober na jugu še 20. Južni del obale je za stopinjo ali dve toplejši od severnega. Za kopanje brez obliva izberite junij ali september.",
      },
    ],
    faqs: [
      {
        question: "Koliko cestnin je od Rijeke do Dubrovnika?",
        answer:
          "Kakšnih 40 evrov: od Rijeke do Splita okoli 30, od Splita do Dubrovnika, čez Pelješki most, pa okoli 10 evrov. Plačilo poteka na zaplatkah po odsekih, z gotovino ali kartico. Stara obalna cesta je brezplačna, a počasnejša za točno toliko, kolikor je lepša.",
      },
      {
        question: "Ali moram trajekt rezervirati vnaprej?",
        answer:
          "Za avto poleti da, in to tedne poprej: karte za julij in avgust se razprodajo. Peš potniki pridejo na karto na dan, a v vrhu sezone tudi zanje vlada gneča. Rezervacijo naredite, takoj ko znate datume, in preberite pogoje za spremembo.",
      },
      {
        question: "Katere plaže so brezplačne?",
        answer:
          "Večina: prod, skale in betonske plošče ob celotni obali so javne in prosto dostopne. Plačujete le opremo — ležalnike in sončnike na organiziranih plažah. Hoteli svojih bregov obiskovalcem praviloma ne zapirajo.",
      },
      {
        question: "Kdaj je morje najtoplejše?",
        answer:
          "V juliju in avgustu, od 24 do 26 stopinj. Junij ima okoli 22, september okoli 23 — oboje je povsem plavalno. Od Splita proti jugu dodajte stopinjo ali dve.",
      },
      {
        question: "Kje spati najceneje?",
        answer:
          "V kampih in zasebnih sobah; pet do deset kilometrov od morja se cena še zniža. Junij in september sta meseca, ko se o ceni govori, julij in avgust pa ne. Direktna rezervacija pri lastniku pogosto obide provizijo platform.",
      },
      {
        question: "Je varno pustiti stvari na plaži?",
        answer:
          "Ni: kraje torbic in telefonov na polnih plažah niso mestna legenda. Dokumenti in denar ostanejo v nastanitvi, na plaži pa se med kopanjem izmenjujete pri varovanju. V avtu ne pustite ničesar na videz — razbito steklo je dražji spomin dopusta.",
      },
      {
        question: "Kateri mesec je najboljša izbira?",
        answer:
          "Junij ali september, odvisno, kaj iščete: junij za svežino in prvo kopanje, september za toplo morje in umirjena mesta. Konec septembra je na jugu še vedno poletje. Julij in avgust izberite le, če vas drugače ne pride.",
      },
    ],
    relatedSlugs: [
      "ljubljana-dubrovnik-road-trip",
      "hrvaski-otoki-iz-slovenije",
      "najem-avta-cross-border",
      "kotor-crna-gora-iz-slovenije",
    ],
    relatedSloveniaIds: ["ljubljana", "piran", "portoroz"],
  },
];
