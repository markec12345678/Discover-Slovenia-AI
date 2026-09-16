/**
 * EN prekrivna plast za events-data.ts (FW4.3 Phase 2, 1.29.0 — uporabnikova
 * revizija #13: "EN še ni 100 % semantično čist — events[].description v
 * slovenščini"). Slovenski original ostaja vir resnice — ta datoteka ponuja
 * angleške prevode tekstovnih polj (name + description), ki jih
 * matchEventsForItinerary prebere pri lang="en". Struktura: Partial po id-ju;
 * identifikatorji (id, datumi, kategorije, regije, slike, priceRange,
 * website) so skupni in se NE prevajajo (enak vzorec kot
 * slovenia-data-en.ts / DESTINATIONS_EN).
 *
 * Ključi EVENTS_EN = `id` polja iz events-data.ts (30 dogodkov).
 * Imena dogodkov ostanejo prepoznavna (Kurentovanje, Trnfest, Okarina …);
 * uveljavljena angleška poimenovanja se uporabijo, kjer obstajajo
 * (Golden Fox, Old Vine Festival, Shrovetide Carnival …).
 */
import type { EventCategory } from "@/lib/events-data";

export interface EventEn {
  name: string;
  description: string;
}

export const EVENTS_EN: Record<string, EventEn> = {
  "ljubljanski-zimski-festival": {
    name: "Ljubljana Winter Festival",
    description:
      "A top international festival of classical and chamber music in Cankarjev dom, the Opera House and Ljubljana's churches. A tradition dating back to 1952.",
  },
  "pustni-karneval-ptuj": {
    name: "Kurentovanje — Ptuj Shrovetide Carnival",
    description:
      "Slovenia's largest carnival and one of Europe's most important ethnographic festivals. A procession of kurents — ancient creatures with red tongues and cow bells — chases winter away through the old streets of Ptuj.",
  },
  "planica-nordic-festival": {
    name: "Planica Nordic Festival",
    description:
      "The Ski Flying World Cup in the legendary Planica valley beneath the Ponca peaks. The world's best jumpers fly over 240 metres on the world's largest ski flying hill, alongside cross-country and biathlon competitions.",
  },
  "blejski-danovski-festival": {
    name: "Bled Music Days Festival",
    description:
      "An international chamber music festival on Lake Bled with top-class concerts in Bled Castle, on Bled Island and in the local churches. Slovenian musicians join international guests in a romantic Alpine setting.",
  },
  "festival-soca": {
    name: "Soča Festival",
    description:
      "A sports-and-music festival on the emerald Soča River with rafting, kayaking, canyoning and adrenaline challenges by day. Evenings by the river fill with alternative, reggae and world music.",
  },
  "bled-days-kremsnita": {
    name: "Bled Days with Kremšnita",
    description:
      "A traditional celebration of the Bled cream cake (kremšnita) — the famous cream slice under a puff-pastry lid. Pastry tastings, a craft market, lakeside festivities and a magnificent fireworks display above Bled Island.",
  },
  "ljubljana-festival": {
    name: "Ljubljana Festival",
    description:
      "Slovenia's largest, oldest and most important summer culture festival. Top-class concerts of symphonic music, opera, ballet and theatre at Križanke and Cankarjev dom, featuring the world's most prominent names.",
  },
  "piran-music-nights": {
    name: "Piran Music Nights",
    description:
      "Romantic music evenings in the cloister of Piran's Franciscan monastery. Jazz, chamber music and ethno concerts with international guests on early summer nights by the Adriatic Sea.",
  },
  "kmecji-ohcet": {
    name: "Kmečki ohcet — Slovenian Farm Wedding",
    description:
      "A traditional re-enactment of a Slovenian farm wedding with rich folk costumes, old-fashioned dances, livestock and crafts. An authentic celebration of rural life in villages across Slovenia.",
  },
  "olive-festival": {
    name: "Olive Festival",
    description:
      "A celebration of the olive harvest in Slovenian Istria with tastings of extra virgin olive oils, local Istrian dishes, honey, wine and guided tours of olive groves by the sea.",
  },
  "festival-stara-trta": {
    name: "Old Vine Festival",
    description:
      "A festival beside the world's oldest vine in Maribor — listed in the Guinness Book of Records. Winemakers' events, Blaufränkisch tastings, a cultural programme and traditional St. Martin's Day celebrations on the banks of the Drava.",
  },
  "bozicni-sejmi": {
    name: "Christmas Markets in Ljubljana and Maribor",
    description:
      "Romantic Christmas markets with stalls of handmade crafts, honey biscuits, mulled wine and pressed apple juice. The medieval old cores of Ljubljana and Maribor light up with garlands and fragrant fir trees.",
  },
  "koroska-smucanje": {
    name: "Ribnica na Pohorju Ski Days",
    description:
      "A traditional skiing event on Ribniško Pohorje with a music programme and local specialities. A family day in the snow.",
  },
  "prekmurje-bucka": {
    name: "Pumpkin and Pumpkin Seed Oil Festival",
    description:
      "A unique festival in Prekmurje dedicated to pumpkins and Prekmurje pumpkin seed oil. Tastings, workshops and traditional music.",
  },
  "dolenjska-cvicek": {
    name: "Cviček Wine Festival in Novo mesto",
    description:
      "A celebration of traditional Dolenjska cviček wine. Wine tastings, culinary stalls and music by the Krka River.",
  },
  "bela-krajina-koline": {
    name: "Bela Krajina Koline and Opanka Craft",
    description:
      "Traditional koline — the winter pork-butchering feast — in Bela Krajina, with corn-plaiting of opanka shoes and local music. Authentic Bela Krajina culture.",
  },
  "koroska-music": {
    name: "Musica Cubicularis — Hall of Slovenian Musicians",
    description:
      "A chamber music festival in Slovenj Gradec featuring Slovenian and international musicians in historic venues.",
  },
  "prekmurje-porabje": {
    name: "Porabje — Gathering of Slovenians from Neighbouring Regions",
    description:
      "A cultural festival in Lendava connecting Slovenians from Prekmurje, Porabje and neighbouring regions. Music, dance and traditional dishes.",
  },
  "bled-winter-swim": {
    name: "Bled Winter Swimming Memorial",
    description:
      "A traditional winter swimming memorial on Lake Bled. The bravest swimmers plunge into the lake's icy water on February mornings. A family event with hot chocolate and cream cake on the shore.",
  },
  "zlati-lisjak-maribor": {
    name: "Golden Fox — Alpine Skiing World Cup",
    description:
      "The traditional World Cup women's giant slalom on Pohorje. The world's best female skiers compete on the Golden Fox course before thousands of spectators.",
  },
  "vinska-vigred-maribor": {
    name: "Vinska vigred — Wine Festival",
    description:
      "Slovenia's largest wine festival in Maribor with more than 200 winemakers from all Slovenian regions. Tastings, workshops, cuisine and music on the banks of the Drava.",
  },
  "jurjevanje-bela-krajina": {
    name: "Jurjevanje in Bela Krajina",
    description:
      "Slovenia's oldest folklore festival, celebrating spring and Bela Krajina tradition. A procession of painted Easter eggs, traditional dances in folk costumes and music in Črnomelj.",
  },
  "ljubljanski-maraton": {
    name: "Ljubljana Marathon",
    description:
      "An international marathon in Ljubljana with 10 km, half-marathon and marathon distances. Thousands of runners from across Europe run through the old town, along the Ljubljanica and through Tivoli Park.",
  },
  "pivo-in-cvetje-lasko": {
    name: "Beer and Flowers Festival Laško",
    description:
      "Slovenia's largest beer and flower festival in Laško. More than 50,000 visitors, a beer market, concerts by domestic and international acts, a flower exhibition and fireworks.",
  },
  "festival-solinarstva-secovlje": {
    name: "Sečovlje Salt-Making Festival",
    description:
      "A celebration of salt-making in the Sečovlje salt pans with a presentation of traditional salt production, tastings of salt-pan products, seafood and local wines by the coast.",
  },
  "trnfest-ljubljana": {
    name: "Trnfest — Trnovo Summer Festival",
    description:
      "A traditional August festival in Ljubljana's Trnovo quarter. Open-air jazz, blues and world music concerts, street theatre, creative workshops and evening buzz by the Trnovo Bridge.",
  },
  "okarina-festival-bled": {
    name: "Okarina Festival Bled",
    description:
      "An international ethno-music festival on Bled with musicians from around the world. Concerts on Bled Island, in the castle and by the lake. Slovenian and international world-music performers.",
  },
  "celjski-sejem": {
    name: "Celje Fair",
    description:
      "The traditional Celje fair with exhibitions of crafts, agriculture, local products and vehicles. An accompanying programme with music, tastings and children's entertainment at the fairgrounds.",
  },
  "bled-winter-magic": {
    name: "Bled Winter Magic — Christmas Village",
    description:
      "A romantic Christmas village on the shore of Lake Bled with wooden cabins, handmade crafts, honey biscuits, mulled wine and pressed apple juice. Bled Island lit up with stars and a fragrant fir tree.",
  },
  "jamski-sejem-postojna": {
    name: "Postojna Cave Fair",
    description:
      "A traditional December fair in Postojna near the cave, with handmade products of the Karst region, prosciutto, teran wine, pottery and Christmas lights. Live music every evening.",
  },
};

/**
 * EN oznake kategorij dogodkov (zrcali EVENT_CATEGORY_LABELS iz
 * events-data.ts — isti ključi, angleške oznake za UI).
 */
export const EVENT_CATEGORY_LABELS_EN: Record<EventCategory, string> = {
  festival: "Festival",
  glasba: "Music",
  sport: "Sport",
  kultura: "Culture",
  hrana: "Food & drink",
  tradicija: "Tradition",
};

/** EN prekrivni vnos za dogodek (ali undefined, če ga ni — fallback na SL). */
export function getEventEn(id: string): EventEn | undefined {
  return EVENTS_EN[id];
}
