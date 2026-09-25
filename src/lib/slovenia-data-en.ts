/**
 * EN prekrivna plast za slovenia-data.ts (FW4.3 Phase 1).
 * Slovenski original ostaja vir resnice — ta datoteka ponuja angleške
 * prevode tekstovnih polj, ki jih stvari berejo prek getEnDestination().
 * Struktura: Partial po poljih; identifikatorji (id/slug/region/type/bestFor/
 * bestSeason keys, coords, slike, cene) so skupni in se NE prevajajo.
 *
 * Ključi DESTINATIONS_EN = `id` polja iz slovenia-data.ts (38 destinacij —
 * ISSUE #4 §18 VAL 7: pokritost 38/38 po ID je varovana z regresijskim
 * testom; map-view lookupa po `id`, NE po `slug`).
 * Dolžine highlights/activities se ujemajo z originalom (3 ali 4 vnose).
 * Imena destinacij (Bled, Bohinj, Postojnska jama → Postojna Cave …) ostanejo
 * prepoznavna; regionalna/praistedna imena uporabljajo uveljavljena angleška
 * poimenovanja (Isonzo Front, Triglav National Park, Art Nouveau …).
 */
export interface DestinationEn {
  tagline: string;
  description: string;
  highlights: string[];
  activities: string[];
  duration: string;
}

export const DESTINATIONS_EN: Record<string, DestinationEn> = {
  bled: {
    tagline: "The pearl of the Alps with a medieval castle and an island",
    description:
      "Lake Bled, with its one-of-a-kind island crowned by a church and bell tower, is Slovenia's most iconic postcard view. The medieval castle perched on a cliff offers panoramic vistas, while nearby Vintgar Gorge invites a short walk through limestone beside a tranquil river. A slice of Bled cream cake (kremšnita) at a lakeside patisserie is the obligatory sweet indulgence.",
    highlights: ["Bled Island", "Bled Castle", "Vintgar Gorge", "Bled cream cake (kremšnita)"],
    activities: ["Pletna boat ride to the island", "Castle visit", "Gorge walk", "Swimming"],
    duration: "1-2 days",
  },
  bohinj: {
    tagline: "Wild, untouched beauty of Triglav National Park",
    description:
      "Lake Bohinj is the larger, wilder sibling of Lake Bled, lying entirely within Triglav National Park. The Vogel cable car offers panoramic views of the Julian Alps, and Savica Waterfall is a short hike through the forest. Ideal for those seeking tranquility and an active escape into nature.",
    highlights: ["Lake Bohinj", "Vogel", "Savica Waterfall", "Triglav National Park"],
    activities: ["Hiking", "Skiing", "Kayaking", "Vogel cable car"],
    duration: "1-2 days",
  },
  ljubljana: {
    tagline: "A green, creative capital with the Dragon Bridge",
    description:
      "Ljubljana is a small yet lively capital where medieval architecture blends with a contemporary culinary scene. Ljubljana Castle offers panoramic views, Prešeren Square with the Dragon Bridge is the beating heart of the city, and the banks of the Ljubljanica come alive with coffee and conversation.",
    highlights: ["Ljubljana Castle", "Dragon Bridge", "Prešeren Square", "Tivoli Park"],
    activities: ["Castle visit", "Old town walk", "Food tour", "Cycling along the Ljubljanica"],
    duration: "2 days",
  },
  postojna: {
    tagline: "24 km of underground passages and a fairy-tale kingdom of stalactites",
    description:
      "Postojna Cave is Europe's largest show cave system, complete with a one-of-a-kind underground train. It is also home to the olm — an endemic amphibian that inspired legends of baby dragons. Predjama Castle, built into the face of a 123-metre cliff, lies just 9 km away.",
    highlights: ["Underground train", "Stalactites", "Olm (human fish)", "Predjama Castle"],
    activities: ["Cave tour by train", "Predjama Castle visit", "Photography"],
    duration: "1 day",
  },
  piran: {
    tagline: "The Slovenian Venice with stone alleys and Tartini Square",
    description:
      "Piran is a seaside town of Venetian character, where narrow alleys squeeze between stone houses. Tartini Square, the marble-paved main square, is dedicated to the violinist Giuseppe Tartini. The Church of St. George on the hill above offers views over the Adriatic Sea.",
    highlights: ["Tartini Square", "Church of St. George", "The waterfront", "Old alleys"],
    activities: ["Old town walk", "Sunset watching", "Seafood dining", "Salt pans visit"],
    duration: "1 day",
  },
  soca: {
    tagline: "An emerald river through the Julian Alps for adrenaline-fueled adventures",
    description:
      "The Soča is one of the few rivers that keeps its emerald color all year round. It winds through Tolmin and Bovec, offering world-class rafting, kayaking and canyoning. Along the way lie the Soča gorges — natural pools carved into the limestone, perfect for a summer cooldown.",
    highlights: ["Soča gorges", "Bovec", "Tolmin", "Kluže Fortress"],
    activities: ["Rafting", "Kayaking", "Canyoning", "Zip-line"],
    duration: "2-3 days",
  },
  triglav: {
    tagline: "A 2,864 m national symbol with countless trails",
    description:
      "Triglav is Slovenia's highest peak and a national symbol that even features on the country's coat of arms. The ascent demands technical hiking, but with good preparation it is achievable in one or two days. At the summit stands Aljaž Tower — the highest-lying shelter in the country.",
    highlights: ["2,864 m summit", "Aljaž Tower", "Triglav rose", "Hiking"],
    activities: ["Hiking", "Mountaineering", "Photography"],
    duration: "2 days",
  },
  kobarid: {
    tagline: "History, the Isonzo Front and fine dining in a single village",
    description:
      "Kobarid is a small village on the Soča River, famed for the Kobarid Museum, which documents the bloody Isonzo Front of World War I. Napoleon's Bridge over the Soča and the Kolovrat ridge offer panoramic views. Hiša Franko, one of the region's finest restaurants, serves contemporary Tolmin cuisine.",
    highlights: ["Kobarid Museum", "Napoleon's Bridge", "Kolovrat ridge", "Hiša Franko"],
    activities: ["Museum visit", "Hiking", "Culinary experience", "Cycling along the Soča"],
    duration: "1 day",
  },
  maribor: {
    tagline: "Slovenia's second city, home to the world's oldest vine",
    description:
      "Maribor lies on the Drava River, surrounded by the vineyards of Pohorje. The Old Vine, more than 400 years old, is listed in the Guinness Book of Records. The city offers a lively old town core, the wine-growing slopes of Pohorje and skiing in winter.",
    highlights: ["The Old Vine", "Pohorje", "Main Square", "Wine culture"],
    activities: ["Old Vine visit", "Skiing on Pohorje", "Wine tasting", "Old town stroll"],
    duration: "1-2 days",
  },
  portoroz: {
    tagline: "Slovenia's seaside resort with a casino and wellness",
    description:
      "Portorož is Slovenia's best-known seaside resort, with a long sandy beach, wellness hotels and a casino. The seafront promenade links Portorož with Piran, while the Sečovlje Salt Pans offer a unique natural experience and therapeutic mud treatments.",
    highlights: ["The beach", "Casino", "Sečovlje Salt Pans", "Wellness"],
    activities: ["Swimming", "Wellness", "Gaming", "Cycling by the sea"],
    duration: "2-3 days",
  },
  vintgar: {
    tagline: "A short walk through limestone beside a tranquil river",
    description:
      "Vintgar Gorge is a 1.6 km canyon along the Radovna River, just 4 km from Bled. Wooden walkways lead beside crystal-clear water, past a waterfall and natural pools. The walk takes about an hour and is suitable for all ages.",
    highlights: ["Šum Waterfall", "Wooden walkways", "Crystal-clear water", "Natural pools"],
    activities: ["Walking", "Photography", "Nature watching"],
    duration: "1 day",
  },
  rogaska: {
    tagline: "Slovenia's oldest spa town with mineral water",
    description:
      "Rogaška Slatina is an elegant spa resort with a 400-year tradition, famed for Donat Mg mineral water with the highest magnesium content in the world. Art Nouveau architecture, parks and wellness centers offer relaxation all year round.",
    highlights: ["Donat Mg", "Art Nouveau architecture", "Grand Hotel", "Wellness"],
    activities: ["Wellness", "Mineral water tasting", "Park strolls", "Massages"],
    duration: "2 days",
  },
  ptuj: {
    tagline: "Slovenia's oldest town with a Roman past",
    description:
      "Ptuj is the oldest recorded town in Slovenia, founded in Roman times as Poetovio. The medieval castle on the hill offers panoramic views over the Drava, while the old town preserves its Baroque architecture. It is famous for Kurentovanje — the largest carnival festival in Central Europe.",
    highlights: ["Ptuj Castle", "Roman remains", "Kurentovanje", "Drava River"],
    activities: ["Castle visit", "Old town walk", "Carnival festival", "Drava riverside walk"],
    duration: "1 day",
  },
  celje: {
    tagline: "Former seat of the Counts of Celje with an imposing castle",
    description:
      "Celje is Slovenia's third-largest city, known for the medieval castle of the Counts of Celje — once the most influential noble dynasty in the Slovenian lands. The Old Square retains its Baroque façades, and a walking trail winds along the Savinja River.",
    highlights: ["Celje Old Castle", "Old Square", "Savinja River", "Regional Museum"],
    activities: ["Castle visit", "Old town walk", "Museum visit", "Cycling along the Savinja"],
    duration: "1 day",
  },
  "nova-gorica": {
    tagline: "The city of roses on the Italian border",
    description:
      "Nova Gorica is a young city built after World War II, known as the 'city of roses'. It borders the Italian town of Gorizia — the only two European cities sharing a single square (Europe Square). A casino, leafy parks and a Mediterranean atmosphere complete the picture.",
    highlights: ["Europe Square", "Rose Park", "Casino Perla", "Solkan Bridge"],
    activities: ["Park stroll", "Gaming", "Cross-border walk into Italy", "Cycling along the Soča"],
    duration: "1 day",
  },
  "slovenj-gradec": {
    tagline: "An alpine town with a rich musical heritage",
    description:
      "Slovenj Gradec is a historic town in northern Slovenia, surrounded by the Carinthian Alps. It is known for the Hall of Slovenian Musicians and as the birthplace of composer Hugo Wolf. It is an ideal base for hikes up Pohorje and Uršlja Gora.",
    highlights: ["Hall of Slovenian Musicians", "Old Square", "Pohorje", "Uršlja Gora"],
    activities: ["Hiking", "Music concerts", "Old town walk", "Skiing"],
    duration: "1 day",
  },
  dravograd: {
    tagline: "Where the Drava, Meža and Mislinja rivers meet",
    description:
      "Dravograd is a small town in northern Slovenia where three rivers — the Drava, Meža and Mislinja — converge. It is surrounded by the forests of Kozjak and Pohorje. Points of interest include a hydropower plant on the Drava and riverside hiking trails.",
    highlights: ["Confluence of three rivers", "Dravograd Hydropower Plant", "Kozjak", "Hiking"],
    activities: ["Hiking", "Fishing", "Cycling along the Drava", "Nature photography"],
    duration: "1 day",
  },
  "murska-sobota": {
    tagline: "The heart of Prekmurje with a castle by the lake",
    description:
      "Murska Sobota is the center of Prekmurje — the flat Pannonian landscape of northeastern Slovenia. Murska Sobota Castle, beside the lake of the same name, houses the Regional Museum. The town is known for prekmurska gibanica, a traditional layered pastry, and pumpkin seed oil.",
    highlights: ["Murska Sobota Castle", "Sobota Lake", "Prekmurje gibanica (layered pastry)", "Regional Museum"],
    activities: ["Castle visit", "Lakeside walk", "Culinary experiences", "Cycling on the flatlands"],
    duration: "1 day",
  },
  lendava: {
    tagline: "A bilingual town with vineyards and a hilltop castle",
    description:
      "Lendava is Slovenia's easternmost town, right on the Hungarian border. This bilingual Slovenian-Hungarian town boasts a hilltop castle with panoramic views over the vineyards of the Lendavske gorice hills. The area produces premium white wines.",
    highlights: ["Lendava Castle", "Lendavske gorice vineyards", "Bilingual culture", "Wine cellar"],
    activities: ["Wine tasting", "Castle visit", "Cycling through vineyards", "Cross-border walk"],
    duration: "1 day",
  },
  "novo-mesto": {
    tagline: "The capital of Dolenjska on the Krka River",
    description:
      "Novo mesto is the center of the Dolenjska region, built in a loop of the Krka River. The Old Square and its main street retain their medieval character. The town is famous for cviček — the traditional wine of Dolenjska — and for archaeological finds from the Hallstatt culture.",
    highlights: ["Old Square", "Krka River", "Cviček wine", "Archaeological Museum"],
    activities: ["Old town walk", "Wine tasting", "Cycling along the Krka", "Museum visit"],
    duration: "1-2 days",
  },
  otocec: {
    tagline: "Slovenia's only castle on a river island",
    description:
      "Otočec is Slovenia's only castle set on an island, surrounded by the waters of the Krka River. Today it is a luxury hotel with a golf course and wellness facilities. A romantic setting for couples and a starting point for cycling along the Krka.",
    highlights: ["Castle on the island", "Krka River", "Golf", "Wellness"],
    activities: ["Golf", "Wellness", "Cycling along the Krka", "Romantic dinner"],
    duration: "1-2 days",
  },
  crnomelj: {
    tagline: "The heart of Bela krajina on the Kolpa River",
    description:
      "Črnomelj is the center of Bela krajina — a warm, Mediterranean-influenced landscape in southeastern Slovenia on the Kolpa River. It is known for its painted Easter eggs (belokranjska pisanica), heathland and traditional Bela krajina music. The Kolpa offers the warmest swimming water in Slovenia.",
    highlights: ["Kolpa River", "Old Square", "Bela krajina pisanica (painted Easter eggs)", "Heathland (steljniki)"],
    activities: ["Swimming in the Kolpa", "Old town walk", "Cycling through Bela krajina", "Ethnographic museum"],
    duration: "1-2 days",
  },
  // === TASK 62: regional destinations (HR/ME/AL) — same overlay rules ===
  zagreb: {
    tagline: "The Croatian capital with Viennese charm and café culture",
    description:
      "Zagreb is a city at the crossroads of Central and Southeast Europe with a Habsburg-era core: the Upper Town with its covered market and Lotrščak tower, Art Nouveau streets of the lower town, and the lively Dolac market in the morning. Its Advent fair is among Europe's most festive in December, while summer coffee on Tkalčićeva street sets the city's rhythm.",
    highlights: ["Upper Town", "Ban Jelačić Square", "Dolac Market", "Cathedral"],
    activities: ["Upper Town walk", "Museums and galleries", "Advent in December", "Coffee on Tkalčićeva"],
    duration: "2 days",
  },
  "plitvicka-jezera": {
    tagline: "A UNESCO cascade of turquoise lakes and waterfalls",
    description:
      "Croatia's oldest national park is a chain of sixteen lakes spilling into one another over travertine barriers and waterfalls. Wooden footbridges lead alongside the water through the forest, and electric boats cross the largest lake, Kozjak. The water shifts between turquoise and emerald with the season and the light.",
    highlights: ["Veliki Slap", "Lake Kozjak", "Wooden footbridges", "Travertine barriers"],
    activities: ["Footbridge walk", "Boat ride across Kozjak", "Photography", "Veliki Slap viewpoint"],
    duration: "1 day",
  },
  rijeka: {
    tagline: "A capital of culture with Croatia's largest port",
    description:
      "Rijeka is a port city on the Kvarner gulf with an Austro-Hungarian core, the long Korzo promenade and Trsat castle on the hill above. It was a European Capital of Culture in 2020; its Easter carnival is among the largest in Europe. Ferries to the islands and Italy depart from its harbor — the city is the gateway to Kvarner.",
    highlights: ["Korzo", "Trsat Castle", "City Tower", "St. Vitus Cathedral"],
    activities: ["Korzo stroll", "View from Trsat", "Rijeka Carnival", "Ferry trips to the islands"],
    duration: "1-2 days",
  },
  pula: {
    tagline: "A Roman amphitheater on the Adriatic",
    description:
      "Pula is Istria's largest city, home to the best-preserved Roman amphitheater in the world after Rome — the 1st-century Arena still hosts concerts and open-air cinema. The old core with the Golden Gate and the Cathedral of St. Mary presses onto a peninsula, with beaches and Istrian wine villages around the city.",
    highlights: ["Arena amphitheater", "Golden Gate", "Old Town square", "Istrian riviera"],
    activities: ["Arena visit", "Old Town walk", "Swimming", "Istrian wine tasting"],
    duration: "1-2 days",
  },
  zadar: {
    tagline: "The city of sunsets and sea organs",
    description:
      "Zadar is a Dalmatian city on a peninsula with a Roman street plan and the Romanesque Church of St. Donatus. On the waterfront the Sea Organ plays with the waves, beside the Greeting to the Sun — an installation around which crowds gather at dusk; Alfred Hitchcock called the Zadar sunset the most beautiful in the world. The Kornati islands are closest from here.",
    highlights: ["Sea Organ", "Greeting to the Sun", "St. Donatus Church", "Roman ruins"],
    activities: ["Listening to the Sea Organ", "Sunset watching", "Ramparts walk", "Kornati trip"],
    duration: "1-2 days",
  },
  split: {
    tagline: "A living city inside Diocletian's Palace",
    description:
      "The heart of Split is Diocletian's Palace from the 4th century — a Roman complex people still live in: cafés on the Peristyle, a market in the cellars, boutiques in vaulted halls. The Cathedral of St. Domnius is the world's oldest cathedral in continuous use. Marjan hill offers an escape into pines above the city, and ferries to the islands leave from the harbor.",
    highlights: ["Diocletian's Palace", "Peristyle", "St. Domnius Cathedral", "Marjan hill"],
    activities: ["Exploring the palace", "Marjan walk", "Bačvice beach", "Ferry trips to the islands"],
    duration: "2 days",
  },
  hvar: {
    tagline: "The sunniest Adriatic island of lavender and wine",
    description:
      "Hvar has almost 2,800 hours of sunshine a year, a Venetian harbor town and the Fortica fortress on the hill. The island's interior hides lavender fields and vineyards of bogotin-rich pošipina (a local wine). The Pakleni islands lie off the harbor — scree-covered coves for anchoring and swimming.",
    highlights: ["Fortica fortress", "Hvar harbor", "Pakleni islands", "Lavender fields"],
    activities: ["View from Fortica", "Pakleni islands trip", "Pošip wine tasting", "Swimming in the coves"],
    duration: "2-3 days",
  },
  dubrovnik: {
    tagline: "A medieval walled city above the blue Adriatic",
    description:
      "Dubrovnik — the Ragusan republic that rivalled Venice for centuries — is a walled city rising from the sea, its Stradun linking the Pile and Ploče gates. The nearly two-kilometer wall walk is the most famous city stroll on the Adriatic; a cable car climbs to Srđ for the view over the old town and islands. The wooded islet of Lokrum lies just offshore.",
    highlights: ["City walls", "Stradun", "Lokrum island", "Srđ cable car"],
    activities: ["Wall walk", "Franciscan monastery cloister", "Lokrum trip", "Sunset from Srđ"],
    duration: "2-3 days",
  },
  kotor: {
    tagline: "A fjord-like bay with a medieval walled town",
    description:
      "Kotor sits at the end of the Bay of Kotor, which twists between steep mountains like the Mediterranean's only fjord. The UNESCO-protected old town is a grid of squares and lanes; the walls of San Giovanni castle climb 1,200+ steps above the town to a legendary view of the bay. In nearby Perast lies the baroque islet of Our Lady of the Rocks.",
    highlights: ["Kotor Old Town", "San Giovanni walls", "Bay of Kotor", "Perast"],
    activities: ["Old Town walk", "Climb to the walls", "Perast trip", "Bay cruise"],
    duration: "1-2 days",
  },
  budva: {
    tagline: "An old town on a peninsula among beaches and pines",
    description:
      "Budva is Montenegro's most visited seaside town — an old core on a rocky walled peninsula, ringed by beaches (Mogren, Jaz, Slovenska plaža). In summer the streets and terraces are full; in spring and autumn the old town breathes easily. The most photographed sight is the islet of Sveti Stefan with its former fishing village turned hotel.",
    highlights: ["Budva Old Town", "Mogren beach", "Sveti Stefan", "Jaz beach"],
    activities: ["Old Town stroll", "Swimming at Mogren", "Sveti Stefan viewpoint", "Evenings on the waterfront"],
    duration: "1-2 days",
  },
  podgorica: {
    tagline: "A relaxed capital where rivers and mountains meet",
    description:
      "Podgorica is the capital and largest city of Montenegro, built at the confluence of the Morača and Ribnica rivers. Its rhythm comes from the korzo, café terraces and the Millennium Bridge; Stara Varoš preserves remains of the Ottoman town with its clock tower. An excellent base — Lake Skadar, Budva and Durmitor are all day trips away.",
    highlights: ["Millennium Bridge", "Stara Varoš", "Clock tower", "Gorica hill"],
    activities: ["Korzo stroll", "Exploring Stara Varoš", "Coffee by the Morača", "Lake Skadar trip"],
    duration: "1 day",
  },
  durmitor: {
    tagline: "A UNESCO massif above Black Lake and the Tara canyon",
    description:
      "Durmitor National Park is a mountain range scarred by 18 glacial lakes — the best known is Black Lake by Žabljak, the region's mountain capital. The Tara river canyon is the deepest in Europe (1,300 m) and home to rafting between forested banks; the panoramic road over the Sedlo pass links Žabljak with the south. In winter there are ski slopes, in summer hiking trails around the lakes.",
    highlights: ["Black Lake", "Tara Canyon", "Žabljak", "Sedlo pass"],
    activities: ["Walk around Black Lake", "Rafting the Tara", "Panoramic drive over Sedlo", "Skiing in winter"],
    duration: "2-3 days",
  },
  tirana: {
    tagline: "A colorful capital with an Ottoman core and café tempo",
    description:
      "Tirana is a capital that opened up after long decades — painted facades, Skanderbeg Square with the Et'hem Bey Mosque and the clock tower, cafés in the block streets. The Dajti Ekspres cable car climbs to 1,600 m above the city for a view over the plain and the Adriatic; the Bunk'Art museum in a nuclear shelter tells the story of the 20th century.",
    highlights: ["Skanderbeg Square", "Et'hem Bey Mosque", "Bunk'Art", "Mount Dajti"],
    activities: ["Exploring the center", "Dajti cable car", "Museums", "Café culture"],
    duration: "2 days",
  },
  berat: {
    tagline: "The town of a thousand windows below the castle",
    description:
      "Berat is a UNESCO-protected town known as the town of a thousand windows — white Ottoman houses on the Mangalem hill terrace up toward the castle at the top. The old bridge over the Osum river links the Gorica quarter; inside the castle is the Onufri Museum with its icons. Vineyards surround Berat, with tastings offered in traditional houses.",
    highlights: ["Berat Castle", "Mangalem quarter", "Old bridge", "Onufri Museum"],
    activities: ["Mangalem walk", "Castle visit", "Osum bridge", "Wine tasting"],
    duration: "1 day",
  },
  gjirokaster: {
    tagline: "The stone city of grey roofs below a mighty castle",
    description:
      "Gjirokastër is a UNESCO town of stone houses with shingle roofs, built on a steep slope beneath one of the largest Balkan castles. The old bazaar preserves an Ottoman trading street with arches; the birthplace of the writer Ismail Kadare is now a museum. The mountains around the town invite hikes above the valley.",
    highlights: ["Gjirokastër Castle", "Old bazaar", "Stone houses", "Kadare's house"],
    activities: ["Castle visit", "Bazaar stroll", "Ethnographic museum", "Hikes around town"],
    duration: "1 day",
  },
  saranda: {
    tagline: "A sunny Ionian town across from Corfu",
    description:
      "Sarandë is Albania's southernmost seaside town, across from the Greek island of Corfu (a 30-minute ferry). The coast south of town hides Ksamil with its white beaches and islets; inland lies antiquity — Butrint, a UNESCO ancient city between the lake and the channel. The Lëkurësi fortress above town frames the sunset over the Ionian Sea.",
    highlights: ["Ksamil", "Ancient Butrint", "Lëkurësi fortress", "View of Corfu"],
    activities: ["Swimming in Ksamil", "Butrint visit", "Sunset from Lëkurësi", "Ferry to Corfu"],
    duration: "2-3 days",
  },
};

export const COUNTRIES_EN: Record<string, string> = {
  SI: "Slovenia",
  HR: "Croatia",
  ME: "Montenegro",
  AL: "Albania",
};

export const REGIONS_EN: Record<string, string> = {
  gorenjska: "Upper Carniola",
  primorska: "Slovenian Littoral",
  osrednja: "Central Slovenia",
  kras: "Karst",
  stajerska: "Styria",
  koroska: "Carinthia",
  prekmurje: "Prekmurje",
  dolenjska: "Lower Carniola",
  "bela-krajina": "White Carniola",
  // TASK 62: regionalne regije (HR/ME/AL)
  "kontinentalna-hrvaska": "Continental Croatia",
  istra: "Istria",
  kvartner: "Kvarner",
  lika: "Lika",
  dalmacija: "Dalmatia",
  "boka-kotorska": "Bay of Kotor",
  "crnogorsko-primorje": "Montenegrin Coast",
  "osrednja-crna-gora": "Central Montenegro",
  "severna-crna-gora": "Northern Montenegro",
  "osrednja-albanija": "Central Albania",
  "juana-albanija": "Southern Albania",
};

export const INTERESTS_EN: Record<string, string> = {
  narava: "Nature",
  kultura: "Culture",
  hrana: "Food & Wine",
  avantura: "Adventure",
  adrenalin: "Adrenaline",
  romantika: "Romance",
  "družina": "Family",
  wellness: "Wellness",
};

/**
 * GEO-A: bestFor oznake destinacij (slovenia-data.ts) v angleščini.
 * Popolno pokritje VSEH 20 vrednosti, ki se pojavijo v DESTINATIONS —
 * hub stran jih izpiše kot žetone, zato na EN ne sme ostati niti ena
 * slovenska beseda (P4-8: nikoli mešanja jezikov). Varnost: neznan
 * ključ pade nazaj na izvirnik (identiteta, ne izmišljena oznaka).
 */
export const BEST_FOR_EN: Record<string, string> = {
  narava: "Nature",
  kultura: "Culture",
  hrana: "Food & Wine",
  avantura: "Adventure",
  adrenalin: "Adrenaline",
  romantika: "Romance",
  "družina": "Family",
  wellness: "Wellness",
  poletje: "Summer",
  mir: "Peace & Quiet",
  zgodovina: "History",
  vino: "Wine",
  pohodništvo: "Hiking",
  mesto: "City Break",
  fotografija: "Photography",
  zdravje: "Health",
  sprostitev: "Relaxation",
  smučanje: "Skiing",
  festival: "Festivals",
  aktivnosti: "Activities",
};

/** Varno iskanje EN overlay-ja (undefined, če manjka). */
export function getEnDestination(id: string): DestinationEn | undefined {
  return DESTINATIONS_EN[id];
}
