/**
 * MIGRACIJA: Popravi napačne podatke lokalcev
 *
 * Problem: Mnogi lokali v bazi imajo napačne telefone, spletne strani,
 * naslove ali opise ki se ne ujemajo z resničnostjo.
 *
 * Rešitev: Posodobi specifične lokalce po slug-ih s pravilnimi podatki,
 * izbriše testni "Owner2 Hotel".
 *
 * Usage: bun run scripts/fix-listings-data.ts
 */

import { db } from "@/lib/db";

interface ListingUpdate {
  slug: string;
  data: Record<string, unknown>;
}

const fixes: ListingUpdate[] = [
  // 1. Hotel Otočec → Hotel Grad Otočec (pravi website, telefon, naslov)
  {
    slug: "hotel-otocec",
    data: {
      name: "Hotel Grad Otočec",
      website: "https://grad-otocec.com",
      phone: "+386 8 205 0300",
      address: "Grajska cesta 2, 8222 Otočec",
      email: "booking@terme-krka.eu",
      longDescription:
        "Hotel Grad Otočec je edini slovenski grad na otoku reke Krke, preurejen v luksuzen hotel. Ponuja 18-luknjično golf igrišče, wellness center, restavracijo z vrhunsko kuhinjo in romantično vzdušje za pare. Idealna lokacija za oddih v naravi Dolenjske.",
    },
  },

  // 2. Restavracija As → Gostilna AS (pravi website, odstrani napačnega chef-a)
  {
    slug: "restavracija-as",
    data: {
      name: "Gostilna AS",
      website: "https://www.gostilnaas.si",
      phone: "+386 1 425 88 22",
      address: "Ciril-Metodov trg 3, 1000 Ljubljana",
      description:
        "Zgodovinska gostilna v središču Ljubljane z bogato tradicijo in Michelin priporočilo.",
      longDescription:
        "Gostilna AS je legendarna ljubljanska gostilna z dolgoletno tradicijo. Ponuja širok izbor slovenskih mesnih jedi, tradicionalnih specialitet in vrhunskih vin. Michelin priporočena restavracija v umirjeni pešpoti blizu centra mesta. Družinsko vodena z osebnim pridihom.",
    },
  },

  // 3. Hotel Vila Bled — pravi website (brdo.si) in telefon
  {
    slug: "hotel-vila-bled",
    data: {
      website: "https://brdo.si",
      phone: "+386 4 575 37 10",
      email: "recepcija-vb@brdo.si",
    },
  },

  // 4. Penzion Berc — pravi naslov (Bled, ne Begunje), telefon, website, steakhouse opis
  {
    slug: "penzion-berc",
    data: {
      phone: "+386 4 574 18 38",
      website: "https://www.penzion-berc.si",
      address: "Ljubljanska cesta 4, 4260 Bled",
      description:
        "Steakhouse z 60-letno tradicijo v Bledu — vrhunski zrezki in izbor 150+ slovenskih vin.",
      longDescription:
        "Penzion Berc je znan steakhouse v Bledu z 60-letno tradicijo. Specializirani za vrhunske zrezke in slovenske mesne specialitete. Ponujajo izbor več kot 150 slovenskih vin. Sproščen ambient za gurmane in ljubitelje dobrega mesa. Penzion ponuja tudi luksuzne namestitve.",
    },
  },

  // 5. Hotel Grand Plaza Portorož → Grand Hotel Portorož (pravo ime, 4* superior)
  {
    slug: "hotel-grand-plaza-portoroz",
    data: {
      name: "Grand Hotel Portorož",
      website: "https://www.lifeclass.net",
      phone: "+386 5 690 11 00",
      description:
        "4* superior hotel ob morju v Portorožu z zasebno plažo in wellness centerjem LifeClass.",
      longDescription:
        "Grand Hotel Portorož je ekskluziven 4* superior hotel ob morju v Portorožu. Ponuja zasebno plažo, wellness center LifeClass, bazene z morsko vodo in restavracijo z mediteransko kuhinjo. Idealen za wellness oddih in romantične pobegne. Skupaj z相邻 hoteli tvori LifeClass resort.",
    },
  },

  // 6. Hotel Triglav Bled — pravi naslov, telefon, Michelin priporočena (ne zvezdica)
  {
    slug: "hotel-triglav-bled",
    data: {
      address: "Kolodvorska cesta 33, 4260 Bled",
      phone: "+386 4 575 26 10",
      email: "info@hoteltriglavbled.si",
      longDescription:
        "Hotel Triglav Bled je eleganten boutique hotel z Michelin priporočeno restavracijo 1906, le 5 min sprehoda od Blejskega jezera. Ponuja panoramske poglede na Triglav in Julijce, wellness center ter vrhunsko kulinarično izkušnjo z lokalnimi sestavinami. Restavracija 1906 ponuja tradicionalne jedi z modernim pridihom.",
    },
  },

  // 7. Restavracija JB — pravi telefon in website
  {
    slug: "restavracija-jb",
    data: {
      phone: "+386 1 430 70 70",
      website: "https://jb-slo.com",
      email: "info@jb-slo.com",
    },
  },

  // 8. Hiša Franko — 3 Michelin zvezdice (ne 1)
  {
    slug: "hisa-franko",
    data: {
      description:
        "Restavracija Ane Roš s tremi Michelin zvezdicami v Kobaridu ob Soči.",
      longDescription:
        "Hiša Franko vodi chef Ana Roš, ki je bila leta 2017 razglašena za najboljšo žensko chef na svetu (The World's 50 Best Restaurants). Restavracija ima 3 Michelin zvezdice in ponuja inovativno tolminsko kuhinjo z lokalnimi sestavinami in 7-urno degustacijsko izkušnjo. Vinska klet z več kot 1200 etiketami. Ena najboljših restavracij na svetu.",
    },
  },

  // 9. Restavracija Trta → Stara trta (pravo ime, 450+ let, pravi kontakti)
  {
    slug: "restavracija-trta",
    data: {
      name: "Stara trta",
      website: "https://najstarejsatrta.si",
      phone: "+386 2 251 5100",
      email: "info@najstarejsatrta.si",
      description:
        "Restavracija ob najstarejši trti na svetu (450+ let) v Mariboru — štajerski jedi in vrhunska vina.",
      longDescription:
        "Stara trta je restavracija v Mariboru ob najstarejši trti na svetu, ki je stara več kot 450 let. Ponuja tradicionalne štajerske jedi in vrhunska slovenska vina. Vinski degustacije in edinstveno vzdušje ob simbolu Maribora. Hiša najstarejše trte na svetu z lastnim muzejem.",
    },
  },

  // 10. Hotel City Ljubljana → City Hotel Ljubljana (pravo ime, kontakti)
  {
    slug: "hotel-city-ljubljana",
    data: {
      name: "City Hotel Ljubljana",
      website: "https://www.cityhotel.si",
      phone: "+386 1 239 00 00",
      email: "info@cityhotel.si",
      longDescription:
        "City Hotel Ljubljana je sodoben 4* superior hotel v središču mesta z odlično lokacijo za raziskovanje Ljubljane. Nudi udobne sobe, restavracijo, fitness in brezplačno WiFi. 5 min do Prešernovega trga in žičnice na Ljubljanski grad. 197 modernih sob.",
    },
  },
];

async function main() {
  console.log("=== MIGRACIJA: Popravljam napačne podatke lokalcev ===\n");

  let updated = 0;
  let notFound = 0;

  for (const fix of fixes) {
    const listing = await db.listing.findUnique({
      where: { slug: fix.slug },
      select: { id: true, name: true },
    });

    if (!listing) {
      console.log(`⚠️  Ni najden: ${fix.slug}`);
      notFound++;
      continue;
    }

    const result = await db.listing.update({
      where: { slug: fix.slug },
      data: fix.data,
    });

    console.log(`✅ Posodobljen: ${listing.name} → ${result.name}`);
    updated++;
  }

  // 11. Izbriši testni "Owner2 Hotel"
  const deleted = await db.listing.deleteMany({
    where: { slug: "owner2-hotel" },
  });
  console.log(`\n🗑️  Izbrisan testni "Owner2 Hotel": ${deleted.count} zapisov`);

  console.log(`\n=== POVZETEK ===`);
  console.log(`✅ Posodobljeni: ${updated} lokalci`);
  console.log(`⚠️  Ni najdeni: ${notFound}`);
  console.log(`🗑️  Izbrisani: ${deleted.count} testni`);

  // Prikaži končno stanje
  const total = await db.listing.count();
  console.log(`📊 Skupno lokalov v bazi: ${total}`);
}

main()
  .catch((e) => {
    console.error("❌ Napaka:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
