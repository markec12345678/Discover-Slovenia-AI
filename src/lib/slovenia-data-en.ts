/**
 * EN prekrivna plast za slovenia-data.ts (FW4.3 Phase 1).
 * Slovenski original ostaja vir resnice — ta datoteka ponuja angleške
 * prevode tekstovnih polj, ki jih stvari berejo prek getEnDestination().
 * Struktura: Partial po poljih; identifikatorji (id/slug/region/type/bestFor/
 * bestSeason keys, coords, slike, cene) so skupni in se NE prevajajo.
 *
 * Ključi DESTINATIONS_EN = `id` polja iz slovenia-data.ts (22 destinacij).
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

/** Varno iskanje EN overlay-ja (undefined, če manjka). */
export function getEnDestination(id: string): DestinationEn | undefined {
  return DESTINATIONS_EN[id];
}
