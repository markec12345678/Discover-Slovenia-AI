import { db } from "@/lib/db";

// Seed 10 slovenskih lokalov — mix free/premium/enterprise
const listings = [
  // === HOTELI ===
  {
    name: "Hotel Vila Bled",
    slug: "hotel-vila-bled",
    description: "Elegantno boutique hotel ob Blejskem jezeru z bleščečim pogledom na otok.",
    longDescription:
      "Hotel Vila Bled je nekdanja poletna rezidenca predsednika Tita, preurejena v luksuzno boutique hotel. Nudi panoramske poglede na Blejsko jezero, zasebno plažo, wellness in vrhunsko kuhinjo. Idealen za pare in poslovne potnike.",
    category: "hotel",
    destinationId: "bled",
    destinationName: "Bled",
    address: "Cesta Svobode 18, 4260 Bled",
    phone: "+386 4 575 37 10",
    email: "recepcija-vb@brdo.si",
    website: "https://brdo.si",
    images: JSON.stringify([
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&h=800&fit=crop&q=80",
      "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=1200&h=800&fit=crop&q=80",
    ]),
    plan: "enterprise",
    featured: true,
    verified: true,
    rating: 4.9,
    reviewCount: 847,
    priceRange: "€€€",
    openingHours: "24/7 recepcija",
    specialties: JSON.stringify(["Jezerski pogled", "Wellness", "Fine dining", "Zasebna plaža"]),
    ownerEmail: "info@vilabled.si",
  },
  {
    name: "Hotel Park Ljubljana",
    slug: "hotel-park-ljubljana",
    description: "Sodoben hotel v središču Ljubljane, 5 min od Prešernovega trga.",
    longDescription:
      "Hotel Park je sodoben hotel v središču Ljubljane z odlično povezavo do glavnih znamenitosti. Nudi udobne sobe, restavracijo z lokalno kuhinjo in brezplačen WiFi. Idealen za mestne oglede.",
    category: "hotel",
    destinationId: "ljubljana",
    destinationName: "Ljubljana",
    address: "Tabor 9, 1000 Ljubljana",
    phone: "+386 1 300 2500",
    email: "info@hotelpark.si",
    website: "https://www.hotelpark.si",
    images: JSON.stringify([
      "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=1200&h=800&fit=crop&q=80",
    ]),
    plan: "premium",
    featured: true,
    verified: true,
    rating: 4.5,
    reviewCount: 1234,
    priceRange: "€€",
    openingHours: "24/7 recepcija",
    specialties: JSON.stringify(["Center mesta", "Družinski prijazen", "Parkirišče"]),
    ownerEmail: "info@hotelpark.si",
  },
  {
    name: "Piran Boutique Hotel",
    slug: "piran-boutique-hotel",
    description: "Zgodovinski hotel v središču Pirana z razgledom na Jadransko morje.",
    longDescription:
      "Boutique hotel v prenovljeni secesijski vili v središču Pirana. Vse sobe imajo pogled na morje ali staro mesto. Sledilna razdalja do Tartinijevega trga in plaže.",
    category: "hotel",
    destinationId: "piran",
    destinationName: "Piran",
    address: "Kajližarjevo nabrežje 6, 6330 Piran",
    phone: "+386 5 671 0000",
    website: "https://www.piran-boutique.si",
    images: JSON.stringify([
      "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=1200&h=800&fit=crop&q=80",
    ]),
    plan: "premium",
    featured: true,
    verified: true,
    rating: 4.7,
    reviewCount: 523,
    priceRange: "€€€",
    openingHours: "24/7 recepcija",
    specialties: JSON.stringify(["Morski pogled", "Zgodovinska stavba", "Center"]),
    ownerEmail: "info@piran-boutique.si",
  },
  // === RESTAVRACIJE ===
  {
    name: "Restavracija JB",
    slug: "restavracija-jb",
    description: "Michelin priporočena restavracija v Ljubljani z avtorsko kuhinjo.",
    longDescription:
      "Restavracija JB vodi chef Janez Bratovž, eden najbolj priznanih slovenskih kuharjev. Ponuja sezonsko menije z lokalnimi sestavinami in vrhunsko vinsko karto z več kot 500 etiketami.",
    category: "restaurant",
    destinationId: "ljubljana",
    destinationName: "Ljubljana",
    address: "Miklošičeva 19, 1000 Ljubljana",
    phone: "+386 1 430 70 70",
    email: "info@jb-slo.com",
    website: "https://jb-slo.com",
    images: JSON.stringify([
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&h=800&fit=crop&q=80",
    ]),
    plan: "enterprise",
    featured: true,
    verified: true,
    rating: 4.8,
    reviewCount: 432,
    priceRange: "€€€",
    openingHours: "Pon-Pet 12:00-23:00, Sob 18:00-23:00",
    specialties: JSON.stringify(["Michelin priporočilo", "Fine dining", "Sezonski meni", "Vinska karta"]),
    ownerEmail: "info@restavracijajb.si",
  },
  {
    name: "Penzion Berc",
    slug: "penzion-berc",
    description: "Steakhouse z 60-letno tradicijo v Bledu — vrhunski zrezki in izbor 150+ slovenskih vin.",
    longDescription:
      "Penzion Berc je znan steakhouse v Bledu z 60-letno tradicijo. Specializirani za vrhunske zrezke in slovenske mesne specialitete. Ponujajo izbor več kot 150 slovenskih vin. Sproščen ambient za gurmane in ljubitelje dobrega mesa. Penzion ponuja tudi luksuzne namestitve.",
    category: "restaurant",
    destinationId: "bled",
    destinationName: "Bled",
    address: "Ljubljanska cesta 4, 4260 Bled",
    phone: "+386 4 574 18 38",
    website: "https://www.penzion-berc.si",
    images: JSON.stringify([
      "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?w=1200&h=800&fit=crop&q=80",
    ]),
    plan: "premium",
    featured: false,
    verified: true,
    rating: 4.6,
    reviewCount: 287,
    priceRange: "€€",
    openingHours: "Pon-Ned 11:00-22:00",
    specialties: JSON.stringify(["Tradicionalna kuhinja", "Lokalne sestavine", "Družinski ambient"]),
    ownerEmail: "info@penzionberc.si",
  },
  {
    name: "Stara trta",
    slug: "restavracija-trta",
    description: "Restavracija ob najstarejši trti na svetu (450+ let) v Mariboru — štajerski jedi in vrhunska vina.",
    longDescription:
      "Stara trta je restavracija v Mariboru ob najstarejši trti na svetu, ki je stara več kot 450 let. Ponuja tradicionalne štajerske jedi in vrhunska slovenska vina. Vinski degustacije in edinstveno vzdušje ob simbolu Maribora.",
    category: "restaurant",
    destinationId: "maribor",
    destinationName: "Maribor",
    address: "Vojašniška 8, 2000 Maribor",
    phone: "+386 2 251 5100",
    email: "info@najstarejsatrta.si",
    website: "https://najstarejsatrta.si",
    images: JSON.stringify([
      "https://images.unsplash.com/photo-1547595628-c61a29f496f0?w=1200&h=800&fit=crop&q=80",
    ]),
    plan: "free",
    featured: false,
    verified: false,
    rating: 4.4,
    reviewCount: 156,
    priceRange: "€€",
    openingHours: "Pon-Sob 11:00-23:00",
    specialties: JSON.stringify(["Vinska klet", "Štajerska kuhinja"]),
  },
  // === AKTIVNOSTI ===
  {
    name: "Soča Rafting Bovec",
    slug: "soca-rafting-bovec",
    description: "Vrhunski rafting po Soči z izkušenimi vodniki. Adrenalin in narava.",
    longDescription:
      "Soča Rafting Bovec ponuja profesionalne rafting ture po najbolj razburljivih odsekih Soče. Izkušeni vodniki, vrhunska oprema in varnost na prvem mestu. Primerno za začetnike in izkušene.",
    category: "activity",
    destinationId: "soca",
    destinationName: "Reka Soča",
    address: "Trg golobarskih žrtev 16, 5230 Bovec",
    phone: "+386 5 389 6300",
    website: "https://www.socarafting.si",
    images: JSON.stringify([
      "https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=1200&h=800&fit=crop&q=80",
    ]),
    plan: "premium",
    featured: true,
    verified: true,
    rating: 4.9,
    reviewCount: 1247,
    priceRange: "€€",
    openingHours: "Apr-Oct: 8:00-19:00",
    specialties: JSON.stringify(["Rafting", "Izkušeni vodniki", "Varna oprema", "Družinski prijazen"]),
    ownerEmail: "info@socarafting.si",
  },
  {
    name: "Vogel Cable Car",
    slug: "vogel-cable-car",
    description: "Žičnica na Vogel s panoramskimi pogledi na Bohinjsko jezero in Triglav.",
    longDescription:
      "Žičnica Vogel pelje potnike na 1535 m nadmorske višine s čudovitimi pogledi na Bohinjsko jezero, Triglav in Julijske Alpe. Pozimi smučišče, poleti pohodništvo in paraglajding.",
    category: "activity",
    destinationId: "bohinj",
    destinationName: "Bohinj",
    address: "Ribčev Laz 14, 4265 Bohinjsko jezero",
    phone: "+386 4 572 3300",
    website: "https://www.vogel.si",
    images: JSON.stringify([
      "https://images.unsplash.com/photo-1551524559-8af4e6624178?w=1200&h=800&fit=crop&q=80",
    ]),
    plan: "free",
    featured: false,
    verified: true,
    rating: 4.7,
    reviewCount: 892,
    priceRange: "€",
    openingHours: "Poletje: 8:00-17:00, Zima: 8:00-16:00",
    specialties: JSON.stringify(["Panoramski pogled", "Smučanje", "Pohodništvo"]),
  },
  // === BAR ===
  {
    name: "Čolnarna Bar Ljubljana",
    slug: "colnarna-bar-ljubljana",
    description: "Priljubljen bar ob Ljubljanici s teraso in koktelimi.",
    longDescription:
      "Čolnarna je priljubljeno srečanje ob reki Ljubljanici z odprto teraso, koktelimi in lokalnimi pivi. Sproščen ambient za večerne oglede mesta.",
    category: "bar",
    destinationId: "ljubljana",
    destinationName: "Ljubljana",
    address: "Petkovškovo nabrežje 5, 1000 Ljubljana",
    phone: "+386 1 251 4444",
    images: JSON.stringify([
      "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=1200&h=800&fit=crop&q=80",
    ]),
    plan: "free",
    featured: false,
    verified: false,
    rating: 4.3,
    reviewCount: 234,
    priceRange: "€€",
    openingHours: "Pon-Ned 10:00-02:00",
    specialties: JSON.stringify(["Kokteli", "Terasa ob reki", "Lokalna piva"]),
  },
  // === TRANSPORT ===
  {
    name: "Bled Taxi & Tours",
    slug: "bled-taxi-tours",
    description: "Zasebni prevozi in vodeni ogledi po Blejski regiji in Triglavskem narodnem parku.",
    longDescription:
      "Bled Taxi & Tours ponuja zasebne prevoze z letališča, vodene ogledi Bleda, Bohinja, Vintgarja in Triglavskega narodnega parka. Izkušeni lokalni vozniki-turistični vodniki.",
    category: "transport",
    destinationId: "bled",
    destinationName: "Bled",
    address: "Ljubljanska cesta 2, 4260 Bled",
    phone: "+386 41 234 567",
    website: "https://www.bledtaxi.si",
    images: JSON.stringify([
      "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=1200&h=800&fit=crop&q=80",
    ]),
    plan: "premium",
    featured: false,
    verified: true,
    rating: 4.8,
    reviewCount: 178,
    priceRange: "€€",
    openingHours: "24/7",
    specialties: JSON.stringify(["Letališki prevozi", "Vodeni ogledi", "Zasebni prevozi"]),
    ownerEmail: "info@bledtaxi.si",
  },
];

async function main() {
  console.log("🌱 Seeding listings...");

  // Počisti obstoječe
  await db.listing.deleteMany({});

  for (const listing of listings) {
    await db.listing.create({
      data: {
        ...listing,
        viewCount: Math.floor(Math.random() * 2000) + 100,
        clickCount: Math.floor(Math.random() * 300) + 10,
      },
    });
    console.log(`  ✅ ${listing.name} (${listing.plan})`);
  }

  const count = await db.listing.count();
  console.log(`\n✨ Seeded ${count} listings!`);
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
