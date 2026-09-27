/**
 * IT prekrivna plast za events-data.ts (W1-faza-2b, Issue #15 —
 * LLM prevod iz EN vira z jezikovno varovalko, 2026-09-27).
 * Isti vzorec kot events-data-en.ts: slovenski original ostaja vir resnice;
 * identifikatorji/datumi/kategorije so skupni in se NE prevajajo.
 */
import type { EventCategory } from "@/lib/events-data";

export interface EventIt {
  name: string;
  description: string;
}

export const EVENTS_IT: Record<string, EventIt> = {
  "ljubljanski-zimski-festival": {
    name: "Festival Invernale di Lubiana",
    description: "Un importante festival internazionale di musica classica e da camera nel Cankarjev dom, nell'Opera House e nelle chiese di Lubiana. Una tradizione che risale al 1952.",
  },
  "pustni-karneval-ptuj": {
    name: "Kurentovanje — Carnevale di Ptuj",
    description: "Il carnevale più grande della Slovenia e uno dei festival etnografici più importanti d'Europa. Una sfilata di kurents — antiche creature con lingue rosse e campane da vacca — che scacciano l'inverno per le vecchie strade di Ptuj.",
  },
  "planica-nordic-festival": {
    name: "Festival Nordico di Planica",
    description: "La Coppa del Mondo di volo con gli sci nella leggendaria valle di Planica ai piedi delle Ponca. I migliori saltatori del mondo volano oltre 240 metri sul più grande trampolino da volo con gli sci del mondo, insieme a competizioni di sci di fondo e biathlon.",
  },
  "blejski-danovski-festival": {
    name: "Festival Giornate Musicali di Bled",
    description: "Un festival internazionale di musica da camera sul Lago di Bled con concerti di alto livello nel Castello di Bled, sull'Isola di Bled e nelle chiese locali. Musicisti sloveni si uniscono a ospiti internazionali in una romantica cornice alpina.",
  },
  "festival-soca": {
    name: "Festival Soča",
    description: "Un festival sportivo e musicale sul fiume smeraldo Soča con rafting, kayak, canyoning e sfide di adrenalina durante il giorno. Le serate lungo il fiume si riempiono di musica alternativa, reggae e world music.",
  },
  "bled-days-kremsnita": {
    name: "Giornate di Bled con la Kremšnita",
    description: "Una tradizionale celebrazione della torta di crema di Bled (kremšnita) — la famosa fetta di crema sotto un coperchio di pasta sfoglia. Degustazioni di pasticceria, mercato dell'artigianato, festeggiamenti lungo il lago e uno spettacolo di fuochi d'artificio magnifico sopra l'Isola di Bled.",
  },
  "ljubljana-festival": {
    name: "Festival di Lubiana",
    description: "Il festival culturale estivo più grande, antico e importante della Slovenia. Concerti di alto livello di musica sinfonica, opera, balletto e teatro a Križanke e Cankarjev dom, con i nomi più prestigiosi del mondo.",
  },
  "piran-music-nights": {
    name: "Notti Musicali di Pirano",
    description: "Serate musicali romantiche nel chiostro del monastero francescano di Pirano. Concerti di jazz, musica da camera e etnica con artisti internazionali nelle serate di inizio estate sul Mar Adriatico.",
  },
  "kmecji-ohcet": {
    name: "Kmečki ohcet — Matrimonio Contadino Sloveno",
    description: "Una rappresentazione tradizionale di un matrimonio contadino sloveno con ricchi costumi folkloristici, danze d'epoca, animali da fattoria e artigianato. Una celebrazione autentica della vita rurale nei villaggi sloveni.",
  },
  "olive-festival": {
    name: "Festival dell'Olivo",
    description: "Una celebrazione della raccolta delle olive in Istria slovena con degustazioni di olio extra vergine d'oliva, piatti istriani locali, miele, vino e visite guidate degli oliveti sul mare.",
  },
  "festival-stara-trta": {
    name: "Festival della Vecchia Vite",
    description: "Un festival accanto alla vite più vecchia del mondo a Maribor — iscritta nel Guinness dei Primati. Eventi dei produttori di vino, degustazioni di Blaufränkisch, un programma culturale e tradizionali celebrazioni di San Martino sulle rive della Drava.",
  },
  "bozicni-sejmi": {
    name: "Mercatini di Natale a Lubiana e Maribor",
    description: "Mercatini di Natale romantici con bancarelle di artigianato manuale, biscotti al miele, vin brulè e succo di mela spremuto. I centri medievali di Lubiana e Maribor si illuminano con ghirlande e abeti profumanti.",
  },
  "koroska-smucanje": {
    name: "Giorni di Sci a Ribnica na Pohorju",
    description: "Un evento tradizionale di sci a Ribniško Pohorje con un programma musicale e specialità locali. Una giornata in famiglia sulla neve.",
  },
  "prekmurje-bucka": {
    name: "Festival della Zucca e dell'Olio di Semi di Zucca",
    description: "Un festival unico in Prekmurje dedicato alle zucche e all'olio di semi di zucca Prekmurje. Degustazioni, laboratori e musica tradizionale.",
  },
  "dolenjska-cvicek": {
    name: "Festival del Vino Cviček di Novo mesto",
    description: "Una celebrazione del tradizionale vino Dolenjska cviček. Degustazioni di vino, bancarelle gastronomiche e musica lungo il fiume Krka.",
  },
  "bela-krajina-koline": {
    name: "Koline e Artigianato Opanka della Bela Krajina",
    description: "Le tradizionali koline — la festa della macellazione del maiale invernale — in Bela Krajina, con intreccio di granario per le scarpe opanka e musica locale. Cultura autentica della Bela Krajina.",
  },
  "koroska-music": {
    name: "Musica Cubicularis — Sala dei Musicisti Sloveni",
    description: "Un festival di musica da camera a Slovenj Gradec con musicisti sloveni e internazionali in location storiche.",
  },
  "prekmurje-porabje": {
    name: "Porabje — Raduno degli Sloveni delle Regioni Viciniori",
    description: "Un festival culturale a Lendava che unisce gli sloveni della Prekmurje, Porabje e regioni vicine. Musica, danza e piatti tradizionali.",
  },
  "bled-winter-swim": {
    name: "Memoriale del Nuoto Invernale di Bled",
    description: "Un tradizionale memoriale di nuoto invernale sul Lago di Bled. I nuotatori più coraggiosi si tuffano nelle acque gelate del lago nelle mattinate di febbraio. Un evento familiare con cioccolata calda e torta alla panna sulla riva.",
  },
  "zlati-lisjak-maribor": {
    name: "Volpe d'Oro — Coppa del Mondo di Sci Alpino",
    description: "Il tradizionale slalom gigante femminile di Coppa del Mondo su Pohorje. Le migliori sciatrici del mondo competono sul tracciato della Volpe d'Oro davanti a migliaia di spettatori.",
  },
  "vinska-vigred-maribor": {
    name: "Vinska vigred — Festival del Vino",
    description: "Il più grande festival del vino in Slovenia a Maribor con oltre 200 produttori vinicoli da tutte le regioni slovene. Degustazioni, workshop, cucina e musica sulle rive della Drava.",
  },
  "jurjevanje-bela-krajina": {
    name: "Jurjevanje in Bela Krajina",
    description: "Il folklore festival più antico della Slovenia, che celebra la primavera e le tradizioni della Bela Krajina. Una sfilata di uova di Pasqua dipinte, danze tradizionali in costumi folcloristici e musica a Črnomelj.",
  },
  "ljubljanski-maraton": {
    name: "Maratona di Lubiana",
    description: "Una maratona internazionale a Lubiana con distanze di 10 km, mezza maratona e maratona. Migliaia di corridori da tutta Europa corrono attraverso il centro storico, lungo il fiume Ljubljanica e attraverso il parco Tivoli.",
  },
  "pivo-in-cvetje-lasko": {
    name: "Festival della Birra e dei Fiori di Laško",
    description: "Il più grande festival della birra e dei fiori in Slovenia a Laško. Oltre 50.000 visitatori, un mercato della birra, concerti di artisti nazionali e internazionali, una mostra di fiori e fuochi d'artificio.",
  },
  "festival-solinarstva-secovlje": {
    name: "Festival della Salina di Sečovlje",
    description: "Una celebrazione della produzione di sale nelle saline di Sečovlje con presentazione della tradizionale estrazione del sale, degustazioni di prodotti delle saline, frutti di mare e vini locali lungo la costa.",
  },
  "trnfest-ljubljana": {
    name: "Trnfest — Festival Estivo di Trnovo",
    description: "Un tradizionale festival di agosto nel quartiere Trnovo di Lubiana. Concerti all'aperto di jazz, blues e musica mondiale, teatro di strada, workshop creativi e atmosfera serale presso il ponte di Trnovo.",
  },
  "okarina-festival-bled": {
    name: "Festival dell'Ocarina di Bled",
    description: "Un festival etno-musicale internazionale a Bled con musicisti da tutto il mondo. Concerti sull'Isola di Bled, nel castello e lungo il lago. Artisti sloveni e internazionali di musica mondiale.",
  },
  "celjski-sejem": {
    name: "Fiera di Celje",
    description: "La tradizionale fiera di Celje con mostre di artigianato, agricoltura, prodotti locali e veicoli. Un programma accompagnato con musica, degustazioni e intrattenimento per bambini nei padiglioni della fiera.",
  },
  "bled-winter-magic": {
    name: "Magia Invernale di Bled — Villaggio di Natale",
    description: "Un romantico villaggio di Natale sulle rive del Lago di Bled con capanne in legno, manufatti artigianali, biscotti al miele, vin brulé e succo di mela pressato. L'Isola di Bled illuminata da stelle e un abete fragrante.",
  },
  "jamski-sejem-postojna": {
    name: "Fiera della Grotta di Postojna",
    description: "Una tradizionale fiera di dicembre a Postojna vicino alla grotta, con prodotti artigianali della regione carsica, prosciutto, vino Teran, ceramica e luci di Natale. Musica dal vivo ogni sera.",
  },
};

/** IT oznake kategorij dogodkov (W1-2b-2 — zrcali EVENT_CATEGORY_LABELS). */
export const EVENT_CATEGORY_LABELS_IT: Record<EventCategory, string> = {
  festival: "Festival",
  glasba: "Musica",
  sport: "Sport",
  kultura: "Cultura",
  hrana: "Cibo & bevande",
  tradicija: "Tradizione",
};
