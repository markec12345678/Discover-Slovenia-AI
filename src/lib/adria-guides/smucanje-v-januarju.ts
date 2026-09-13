// SLO-WINTER-2 — Smučanje v januarju (SL).

import type { AdriaGuide } from "./types";

export const ADRIA_GUIDES_WINTER_JANUAR: AdriaGuide[] = [
  {
    slug: "smucanje-v-januarju",
    title: "Smučanje v januarju: najcenejši in najbolj snežen mesec",
    metaTitle: "Smučanje v januarju: zakaj je to najboljši mesec",
    description:
      "Januarski smučarski odmor na treh gurah: Vogel, Kranjska Gora in Krvavec s snežno gotovostjo, krajšimi vrstami in ceno dneva pod 50 evrov.",
    excerpt:
      "Januar je mesec, ki ga smučarska aritmetika najbolj ljubi: sneg je na vrhuncu, februarske šolske počitnice še niso prispele, nastanitve so pod prazničnimi cenami, na treh gurah pa dan še vedno stane pod 50 evrov. Ta vodnik preizkusi Vogel, Kranjsko Goro in Krvavec v štirih dneh in 335 kilometrih — primerjalnica, ki jo naslednje leto uporabite kot odločitev.",
    route: "Ljubljana → Vogel → Kranjska Gora → Ljubljana → Krvavec → Ljubljana",
    countries: ["SI"],
    days: 4,
    km: 335,
    heroImage: "/adria/smucanje-v-januarju.jpg",
    heroAlt:
      "Smučarji na zasneženi progredi januarja, svež smučarski sneg pod modrim nebnim, gore v ozadju in proga, ki se vija po pobočju",
    author: "Marko Kovač",
    date: "2026-09-14",
    readTime: 9,
    stops: [
      {
        name: "Bohinj (Vogel)",
        country: "SI",
        nights: 1,
        highlight:
          "Prva gura je hkrati najbolj alpska: Vogel pod Triglavom, kamor žičnica pelje nad jezero, dneva pa meri 45 evrov za odraslega, 39 za mladino in 23 za otroka. Januarja je sneg tu najdebelejši in razgled najširši — to je gura, po kateri se ostale merijo. Od Ljubljane okoli 85 kilometrov.",
      },
      {
        name: "Kranjska Gora",
        country: "SI",
        nights: 1,
        highlight:
          "Druga nočitev v vasi, ki pozimi živi smučanje: proge nad Kranjsko Goro, dnevna karta 49 evrov za odraslega, 30 za otroka in 44 za mladino, ter večer v sprehodnem centru, kjer se smučarji zbirajo po zaprtju žičnic. Od Bohinja je okoli 65 kilometrov čez Bled in Jesenice.",
      },
      {
        name: "Ljubljana (Krvavec)",
        country: "SI",
        nights: 1,
        highlight:
          "Zadnji smučarski dan je hkrati najbolj mesten: Krvavec je od Ljubljane dobrih 50 minut vožnje — dnevna karta stane 45 evrov za odraslega in 28 za otroka — zato se zadnja nočitev izide v glavnem mestu. Povratek z gure v Ljubljano je kratek; kdor ima radi večerne ure pod lučkami, jih tu dobi.",
      },
    ],
    sections: [
      {
        heading: "Zakaj januar in ne februar",
        body: [
          "Slovenska zima pozna mesec, ki ga smučarski vodniki premalo povzdigujejo. Januar ima največ snega — zima je do tedaj naredila svoje in dnevi so še kratki, zato gure delujejo v polnem zimskem načinu. Februar prinese šolske počitnice, ki se po regijah menjavajo v dveh tednih — tedaj se vrste pri žičnicah podaljšajo, cene nastanitev pa skrajšajo razpoložljivost. Januar je mesec pred tem: prostor na progi, prostor v gostilni na guri in cena, ki je še pod praznično.",
          "Drugi račun je cena dneva. Vogel januarja stane 45 evrov, Kranjska Gora 49 in Krvavec 45 — vse tri pod mejo petdeset, otroške karte pa od 23 do 30 evrov. Večdnevne karte, ki jih vsa tri smučišča prodajajo, znesejo na dan ceneje kot ločeni dnevi; popoldanske karte, ki jih kdor pride iz službe pozno, izberejo, pa odrežejo jutranji del cene. Januar je edini mesec, v katerem te tri izbire resnično nekaj štejejo — snežna gotovost namreč pomeni, da tudi popoldne ne tvegamo.",
          "Tretji račun je čisto človeški: januarja na gurah ni prazničnega vrveža. Med božičnimi in novim letom je vse polno ljudi, ki smučajo enkrat na leto; februara so tu šolske počitnice z otroškimi tečaji; marca prihaja pomlad s krajšimi progami. Januar je mesec, v katerem so na gurah predvsem tisti, ki smučajo radi — in to se pozna v vsaki vrsti in vsakem pogledu.",
        ],
        list: [
          {
            title: "Cena januarskega dneva",
            text: "Vogel 45 evrov odrasli / 39 mladina / 23 otroci; Kranjska Gora 49 / 44 / 30; Krvavec 45 / 28 otroci. Vse tri gure ostanejo pod 50 evrov na odraslega dneva.",
          },
          {
            title: "Pred februarskimi počitnicami",
            text: "Šolske zimske počitnice se vrstijo v februarju — januar jih še ni. Vrste pri žičnicah so krajše, termini smučarskih šol prosteješi, nastanitve dostopneje.",
          },
          {
            title: "Snežna gotovost",
            text: "Januar je statistično najbolj zanesljiv mesec za smučarski sneg v slovenskih Alpah — zima je naredila svoje, sončne dneve pa še dopušča. Proge so odprte v polni dolžini.",
          },
          {
            title: "Večdnevne in popoldanske karte",
            text: "Trije dnevi na isti guri se vedno izidejo ceneje kot trije ločeni; popoldanska karta pa je januarja varna izbira, ker sneg tvegano ni — razliko na računu pa vidi takoj.",
          },
        ],
      },
      {
        heading: "Dan 1: Ljubljana → Vogel (85 kilometrov)",
        body: [
          "Prvi dan je alpski. Vozite čez Bled do Bohinja — slabih osemdeset kilometrov, ki se zadnjih trideset vzpenjajo v dolino — in žičnico vzamete takoj, ker Vogel v januarju zjutraj pričakuje najboljši sneg in najmanj ljudi. Gura je velika: proge od zgornje postaje navzdol, razgled na Triglav in jezero, ki leži pod vami kot na dlanu. Nesmučarji se vozijo z istimi žičnicami — karta za razgled je cenejša od smučarske, dopoldne na terasi zgornje postaje pa je januarja tista luksuzna ura, ki si jo smučarji ne morejo privoščiti.",
          "Začetni smučarji so na Voglu doma: proge z laganim naklonom ob sredini, šola z urejenimi termini in prostor, ki januarja ni mesečno zaseden. Otroška karta stane 23 evrov — med najugodnejšimi v državi — in ravno zato je Vogel gura, na kateri družine začenjajo. Zimske gume so na tej poti obvezne po zakonu in po zdravi pameti; verige imejte v prtljažniku, ker se jutranji vzpon v dolino zgodi v temi.",
          "Popoldne vozite na Kranjsko Goro — okoli 65 kilometrov čez Bled in Jesenice — in se nastanite za nočitev — naslednja bo v Ljubljani. Večer v Kranjski Gori je smučarski večer, kakor ga veste iz zgodb: center vasi v sprehodni razdalji, gostilne z lokalnimi jedmi in tišina, ki jo naredi utrujenost. Dva dni sta za to pot prava številka — prvi dan je gorski, drugi pa pripada vasi in njenim progam.",
        ],
      },
      {
        heading: "Dan 2: Kranjska Gora — dan in večer vasi",
        body: [
          "Kranjska Gora je januarja v tem, kar je februarja želja: proge brez čakanja, ki jih žičnice peljejo eno za drugo, v center pa se po smučanju sproščeno pride peš. Dnevna karta stane 49 evrov za odraslega, 44 za mladino in 30 za otroka — najvišja med tremi gurami tega vodnika, a tudi najbolj raznolika: proge od lažjih do težjih, legendarna lokacija pod Vitrancem in večerni center, ki deluje po zaprtju. Januarja so tu predvsem smučarji, ki pridejo radi — to je gura z najbolj »smučarsko« identiteto med tremi.",
          "Popoldne izkoristite prednost Kranjske Gore, ki je drugim nedostopna: odprtine, ki jih pozimi ni — Rateče in Planica so v isti dolini, kjer so svetovni skoki, in januarski večer v tem delu sveta je vreden samega potovanja. Kdor raje ostane v vasi, pa izbere večerno nego v eni od lokalnih wellness ponudb: smučarski dan se konča v savni ali na masaži, ne v avtu. Vsa ta izbira je na razdalji, ki jo v februarju naredijo vrste.",
          "Ponoči spite tu — jutri se začne najdaljša etapa tega vodnika, povratek v Ljubljano z avtocesto čez Karavanke. Zadnji večer v Kranjski Gori je tisti, ki ga januar naredi posebnega: vas pod snegom, brez počitniške vrveži, z jedmi, ki se v smučarskih gostilnah strežejo po domače. Račun za dan: 49 evrov karta + večerja v ceni, ki januarja ni praznična.",
        ],
      },
      {
        heading: "Dan 3: povratek v Ljubljano in Krvavec (155 kilometrov)",
        body: [
          "Tretji dan ima dva dela: povratek in zadnjo guro. Od Kranjske Gore do Ljubljane je okoli 85 kilometrov — avtocesta čez Karavanke je hitra, a januarski jutranji mraz rad naredi iz jutranje vožnje tisto, kar je: previdno. Vozite zjutraj, ko so ceste služene, in se v Ljubljani ustavite za pravi zajtrk ter odložite prtljago — popoldne se namreč gre na Krvavec.",
          "Krvavec je od Ljubljane okoli 50 kilometrov in žičnica dobro uro — to je gura, ki jo glavno mesto ima za svoje. Dnevna karta stane 45 evrov za odraslega in 28 za otroka, kar je med otroškimi kartami najugodnejša v tem vodniku. Krvavec je tudi gura večernih ur: v zimski sezoni osvetljene proge na izbrane večere podaljšujejo dan, kar v januarju, ko tema pada kmalu po štirih, ni majhna stvar. Za tiste, ki se od mestne sobe peljejo na popoldansko karto, je to najboljša kombinacija v državi.",
          "Zadnja nočitev je v Ljubljani — mestni večer po treh gurah je ravno pravšen kontrast: večerja v centru, sprehod po zimski mestni podobi, kjer se luči še vedejo do 15. januarja, in jutro, v katerem se zbudiš kot smučar, ne kot turist. Štirje dnevi se tukaj sklenejo v eno pripoved: tri gure, trije značaji, en mesec, ki je vse to naredil možno.",
        ],
      },
      {
        heading: "Primerjalnica: katera gura za koga",
        body: [
          "Vogel je gura razgleda in alpskega značaja: najvišja med tremi, s pogledom na Triglav in jezero, otroška karta 23 evrov pa naredi družinsko izbiro. Izberite ga, če hočete sneg, ki ga januar resnično ima, in dan, ki je hkrati gorski izlet. 85 kilometrov od Ljubljane je še sprejemljivo za dnevni izlet, a nočitev v Bohinu ga naredi pravega.",
          "Kranjska Gora je gura vasi in izbire: najdražja karta (49 evrov), a najbolj raznolika ponudba prog, center v sprehodni razdalji in Planica v isti dolini. Izberite jo, če je smučanje del dneva in ne ves dan — in če hočete večer, ki je sam po sebi vsebina. Najboljša izbira za smučarje, ki pridejo z družino, ki ne smuča vsaka enako dobro.",
          "Krvavec je gura mestne bližine in večernih ur: 45 evrov odrasli in 28 otroci — otroška karta je tu najugodnejša — ter osvetljene proge na izbrane večere. Izberite ga, če živite v Ljubljani ali bližnji okolici, ali če hočete smučanje kombinirati z mestnim vikendom. Od vseh treh je edina, na katero se iz glavnega mesta pride v uri — to je januarju vredno.",
        ],
        list: [
          {
            title: "Vogel — alpska izbira",
            text: "45/39/23 evrov. Najbolj zanesljiv sneg, pogled na Triglav, najugodnejša otroška karta med visokimi gurami. Za družine in tiste, ki hočejo pravi gorski dan.",
          },
          {
            title: "Kranjska Gora — vasi in izbire",
            text: "49/44/30 evrov. Najdražja, a najbolj raznolika; center vasi v sprehodni razdalji, Planica v isti dolini. Za smučarje, ki jim večer ni odveč.",
          },
          {
            title: "Krvavec — bližina in večeri",
            text: "45/28 evrov otroci — najugodnejša otroška karta. Osvetljene proge na izbrane večere, dobrih 50 minut od Ljubljane. Za mestni vikend s smučanjem.",
          },
        ],
      },
    ],
    practical: [
      {
        title: "Zimske gume in verige",
        text: "Od 15. novembra do 15. marca so zimske gume zakonsko obvezne; na poti na Vogel in Kranjsko Goro — kjer se vozite v gorskih dolinah — sodijo v prtljažnik tudi verige. Jutranji vzponi se zgodbijo v temi in mrazu, ceste pa so sicer služene. Preverite jih pred potjo, ne na parkirišču.",
      },
      {
        title: "Vinjeta",
        text: "Tedenska e-vinjeta za osebni avto stane 16 evrov in pokriva avtocestne odseke tega kroga — do Bleda za Vogel in čez Karavanke za povratek iz Kranjske Gore. Kupite jo na evinjeta.dars.si ali na bencinskem servisu; velja od izbrane ure naprej.",
      },
      {
        title: "Večdnevne karte",
        text: "Vogel, Kranjska Gora in Krvavec prodajajo večdnevne karte, ki znesejo na dan ceneje kot ločeni dnevi. Kdor ostane dva dni na isti guri, naj vzame dvodnevno karto; kdor pa kot ta vodnik preizkuša tri, plača tri enodnevne. Januarja so te karte še pod prazničnimi cenami.",
      },
      {
        title: "Oprema v najem",
        text: "Vsa tri smučišča imajo šole in najemnice opreme — smuči in palice za dan se gibljejo v dvocifrnih evrih, otroška oprema pa je dostopna in urejena. Kdor smuča enkrat ali dvakrat na leto, ima račun enostavnejši v najemu kot v lastništvu; lastnike pa januar razveseli suhi prtljažnik.",
      },
      {
        title: "Kratki dnevi in vreme",
        text: "Januar se kmalu po 16. uri zgubi v mrak — načrtujte prihode zjutraj, da bo cel smučarski dan videl svetlobo. Krvavčeve osvetljene proge na izbrane večere so edina izjema; oblačne dni pa preverite s snežno razmero pred odhodom, ker se v gorah vreme obrne hitro.",
      },
      {
        title: "Vrste in terminali",
        text: "Januarske vrste pri žičnicah so kratke — toda zjutraj so najkrajše. Kdor pride do devete, se pelje brez čakanja; kdor pride po deseti, pa na velikih gurah vseeno stane minute, ne ure. Kartne blagajne so zdaj digitalne: karte kupite zjutraj na blagajni ali vnaprej prek spleta.",
      },
      {
        title: "Spanje",
        text: "Januarske nočitve so pod prazničnimi in pod februarskimi — to je drugi razlog za ta mesec. V Bohinu in na Kranjski Gori izbirate med hoteli, pansijoni in apartmaji; v Ljubljani pa med vsemi mestnimi razredi. Rezervirajte teden prej, ne mesec — januar tega ne zahteva.",
      },
    ],
    faqs: [
      {
        question: "Zakaj je januar najboljši mesec za smučanje?",
        answer:
          "Ker združuje najdebelejši sneg, najkrajše vrste in najnižje cene nastanitev. Snežna odeja je do januarja narejena, šolske počitnice, ki napolnijo februarske gure, še niso prispele, praznične cene pa so se končale z novim letom. Dan na Voglu, Kranjski Gori ali Krvavcu še vedno stane pod 50 evrov.",
      },
      {
        question: "Koliko stane smučarski dan v Sloveniji?",
        answer:
          "Dnevna karta januarja: Vogel 45 evrov za odraslega, 39 za mladino in 23 za otroka; Kranjska Gora 49, 44 oziroma 30 evrov; Krvavec 45 evrov za odraslega in 28 za otroka. Večdnevne karte so na dan ceneje, popoldanske pa prirežejo jutranji del cene.",
      },
      {
        question: "Katere gure so primerne za začetnike?",
        answer:
          "Vse tri iz tega vodnika: Vogel ima proge z laganim naklonom in šolo z urejenimi termini, Krvavec je z mestne bližine najlažji za prvi dan, Kranjska Gora pa najbolj uravnoteženo izbiro lažjih in srednjih prog. Za otroke je Vogel z otroško karto 23 evrov najugodnejša visoka gura.",
      },
      {
        question: "Ali se februarja ne splača bolj?",
        answer:
          "Februar ima šolske počitnice z družinskimi paketi — a tudi z vrstami in polnimi termini. Januar je za odrasle smučarje in mirnejše družine boljša izbira; februar pa za tiste, ki potrebujejo otroške tečaje v tednu počitnic. Ceno dneva februar ne spremeni — spremeni le čakanje.",
      },
      {
        question: "Kdaj so osvetljene proge?",
        answer:
          "Krvavec pozimi na izbrane večere podaljšuje delovanje z osvetljenimi progami — januarju, ko tema pada kmalu po štirih, to podaljša smučarski dan. Točne termine objavi smučišče pred sezono; Vogel in Kranjska Gora večerno smučanje v tem obsegu nimata.",
      },
      {
        question: "Kaj če ni snega?",
        answer:
          "Januar je snežno najzanesljivejši mesec, so pa vse tri gure visoko nad morskimi gladinami — in vsa tri imajo tehniko zasneževanja za suhe začetke sezone. Najbolj suha različica tega vodnika je januar ob katerikoli razlagi vremena.",
      },
      {
        question: "Kako izbrati med tremi gurami?",
        answer:
          "Vogel za alpski dan in razgled na Triglav, Kranjska Gora za vas, ki živi smučanje, Krvavec za bližino in večerne ure iz Ljubljane. Ta vodnik vse tri preizkusi v štirih dneh — kdor izbira eno, naj bere primerjalnico v njem in se odloči po svojem dnevu, ne po reklamah.",
      },
    ],
    relatedSlugs: ["smuci-vikend-iz-ljubljane", "bozicni-bohinj", "zimske-pocitnice-z-otroki"],
    relatedSloveniaIds: ["triglav", "bohinj", "ljubljana"],
  },
];
