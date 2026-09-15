// ADRIA-EN — angleški prevod jadranskih vodnikov 5–6 (part1 745–937 + part2 1–200).

import type { AdriaGuide } from "../adria-guides/types";

export const ADRIA_GUIDES_EN_5_6: AdriaGuide[] = [
  // 5. A systematic practical guide to the Croatian coast, from Istria to Konavle.
  {
    slug: "hrvaska-obala-prakticni-vodnik",
    title: "The Croatian coast from Istria to Konavle: a practical guide",
    metaTitle: "Croatian coast practical guide: tolls, ferries, beaches",
    description:
      "A practical guide from Istria to Konavle: when to go south, free and paid beaches, HAC tolls, Jadrolinija ferries, parking, sleeping and sea temperatures.",
    excerpt:
      "Everything the Croatian coast teaches you the expensive way, in one guide: months and crowds, section-by-section tolls, ferries, parking, sleeping and the sea from May to October.",
    route: "Ljubljana → Rijeka → Zadar → Split → Dubrovnik",
    countries: ["SI", "HR"],
    days: 7,
    km: 1000,
    heroImage: "/adria/hrvaska-obala-prakticni-vodnik.jpg",
    heroAlt:
      "A pebble beach beside the clear Adriatic Sea with boats at their moorings and the shade of pine trees in the afternoon light",
    author: "Tanja Novak",
    date: "2026-08-04",
    readTime: 13,
    stops: [
      {
        name: "Ljubljana",
        country: "SI",
        nights: 0,
        highlight:
          "The reference point: from Ljubljana it is around 120 kilometres to Rijeka, roughly 460 to Split and around 690 to Dubrovnik — every calculation on the coast begins with these numbers.",
      },
      {
        name: "Rijeka",
        country: "HR",
        nights: 1,
        highlight:
          "First stop and the gateway south: the Korzo in the centre, Trsat above the city, and the choice — detour to Senj on the coastal road or stay on the motorway to Zadar.",
      },
      {
        name: "Zadar",
        country: "HR",
        nights: 2,
        highlight:
          "The Sea Organ and the sunset as an introduction to the coast: an old town on a peninsula, open sea to the west, and a base from which you walk everywhere.",
      },
      {
        name: "Split",
        country: "HR",
        nights: 2,
        highlight:
          "The hub of the coast: the palace, the ferry port for the islands and the jumping-off point for the south — in practical arithmetic, Split is the centre around which everything revolves.",
      },
      {
        name: "Dubrovnik",
        country: "HR",
        nights: 1,
        highlight:
          "The corridor's final stop: the City Walls in the morning, Lokrum before the afternoon sun, and the arithmetic that it is a good 200 kilometres from Split, across the Pelješki Bridge.",
      },
    ],
    sections: [
      {
        heading: "When to head south: months, crowds and the sea",
        body: [
          "The coast's calendar is built around the school holidays. July and August bring the peak of everything: the sea at its warmest, 24 to 26 degrees, accommodation at its most expensive, and motorways that on Saturdays come closest to resembling car parks. June and September are the opposite — the sea still at around 22 and 23 degrees respectively, the crowds thinning, and prices settling by a quarter or a third. For most trips this is the only sensible choice.",
          "The tail of the calendar is just as useful. May opens the coast with a brisk sea, 18 to 20 degrees, and empty streets; October in the south often still holds at around 20 degrees, and Dubrovnik breathes again once the cruise ships thin out. Winter on the coast is not a subject for this guide. The decision is therefore a simple one: warm and full, or milder and calm — the middle way, June and September, is best.",
        ],
        list: [
          {
            title: "May",
            text: "Sea at 18 to 20 degrees; bracing swimming, a coast without crowds and the lowest prices of the season.",
          },
          {
            title: "June",
            text: "Around 22 degrees; the first month in which swimming is entirely pleasant, and the crowds still calm.",
          },
          {
            title: "July and August",
            text: "From 24 to 26 degrees; the peak of the temperature — and of prices, traffic and crowds on every front.",
          },
          {
            title: "September and October",
            text: "Around 23 degrees, still 20 in the south in October; the best balance between warm and calm.",
          },
        ],
      },
      {
        heading: "Beaches: what is free and what you pay for",
        body: [
          "Most of the Croatian coast is public and open to all: pebbles, rocks and concrete slabs reached by steps, with the water the same for everyone. What you pay for is not the beach but the equipment on it — a parasol and a sunlounger on an organised beach in season costs what you would pay at home for two museum tickets. Hotels as a rule do not fence off their own stretch of shore: most hotel beaches are open to everyone, with only the sunloungers reserved.",
          "The wild corners — coves reached by gravel track or by boat — are free and often the loveliest of all, but they come without shade, drinking water or lifeguards, which is better learnt before you arrive than on the spot. For a family with small children an organised beach is the rational choice: the shallows, parasol and shower cost their due, and the children stay in sight from one place. The coast's practical rule: pebbles in the morning, shade in the afternoon — any other division of the day you arrange yourselves.",
        ],
      },
      {
        heading: "HAC tolls: no vignette, pay section by section",
        body: [
          "Croatia runs its tolls on an old-fashioned system: there is no vignette, and at the end of every motorway section stands a toll booth where you pay for the stretch you have driven. From Rijeka to Split reckon on some €30, and from Split to Dubrovnik, across the Pelješki Bridge, on around €10. For the whole corridor from Istria to Konavle, then, around €40 in one direction — the money the coastal road saves you, you pay for in time you would rather not.",
          "You clear the toll booths in three ways: with cash at the booth window, by card in the automated lanes, or with an ENC device, an electronic box for the windscreen that deducts without stopping. The ENC pays for itself if you drive to Croatia several times a year; for a single holiday a card is entirely sufficient. The Slovenian part of the route is covered by the e-vignette — a weekly one for a car costs around €16 — and it is valid only in Slovenia, which you need to know before the first toll booth, not after it.",
        ],
      },
      {
        heading: "Jadrolinija ferries: islands without surprises",
        body: [
          "Jadrolinija is the main ferry operator on the coast and its ferries are part of the local logic: Split is the hub for Brač, Hvar, Šolta and Vis, where a Dalmatian day can begin on deck. In summer a reservation is mandatory for a car — and literally so: tickets for July and August sell out weeks in advance, and on the day of departure there is no room on board even with luck on your side. Foot passengers get a ticket on the day itself, but at the height of the season a queue rules for them too.",
          "Booking takes place online, and on the day of sailing you check in at least an hour before departure, because boarding closes before the ship casts off — arrive late and you are on the next sailing, not this one. The price of the crossing is calculated on the length of the car, and passengers pay their own fare. The catamarans, which carry foot passengers only, are the alternative for trips without a car, and in summer they rescue the days when a car deck would cost you half a morning.",
        ],
      },
      {
        heading: "Towns, parking and sleeping: where the money goes",
        body: [
          "The old town centres are closed to cars, and around them revolve paid zones that grow dearer with the hour of the day in season. The strategy is always the same: car into a car park on the edge, and then on foot — in Zadar behind the peninsula, in Split around the harbour and Bačvice, in Dubrovnik in Gruž or above the city. Leave nothing on view in the car; a smashed window is among the dearer souvenirs of a holiday.",
          "Sleeping is the most flexible item in the budget. Campsites are the cheapest form of the coast and rest in them is no worse, only different; rooms in private accommodation cost less than hotels, and lodging five to ten kilometres inland less still. In July and August there is little to be saved without a reservation; June and September are the months in which the price is still open to discussion.",
        ],
      },
      {
        heading: "Safety, the sea and things that go missing",
        body: [
          "The coast is safe, but not naive. On crowded town beaches work thieves who hunt for bags and phones left on towels while their owners swim; documents and cash therefore stay in the safe at your accommodation, and only what survives sea water goes to the beach. Leave nothing on view in the car, not even the satnav in its mount — a replacement window costs more than everything that was in it.",
          "The sea keeps its own calendar of small dangers: sea urchins among the rocks are sidestepped with rubber shoes, jellyfish are mostly harmless but know how to ruin a swim. The more serious business in summer is drought: fire risk means a ban on open flames and parking only on made-up surfaces, because dry grass beneath a car is a serious cause of wildfires. In trouble, call 112 — in summer the lifeguard stations are within sight of the beach.",
        ],
      },
    ],
    practical: [
      {
        title: "Tolls section by section",
        text: "Croatia has no vignette: you pay tolls at the HAC booths section by section, in cash or by card. From Rijeka to Split reckon on around €30, and from Split to Dubrovnik across the Pelješki Bridge on around €10. The Slovenian e-vignette covers only the home stretch — a weekly one costs around €16.",
      },
      {
        title: "Ferries in summer",
        text: "Jadrolinija is the main ferry operator; a reservation is mandatory for a car in summer, and tickets for July and August run out weeks in advance. On the day of sailing check in at least an hour before departure, as boarding closes earlier. The catamarans carry foot passengers and are the alternative for trips without a car.",
      },
      {
        title: "Parking in towns",
        text: "The old centres are closed to cars; the paid zones grow dearer with the hour of the day in season. Park on the edge — Zadar behind the peninsula, Split around the harbour, Dubrovnik in Gruž — and go on foot. Leave nothing on view in the car.",
      },
      {
        title: "A cheaper night",
        text: "Campsites are the cheapest coast there is; private rooms and apartments cost less than hotels, and lodging five to ten kilometres inland less still. In June and September prices settle by a quarter to a third. Booking directly with the owner often bypasses the commission of the big platforms.",
      },
      {
        title: "Safety on the beach",
        text: "Thefts of phones and bags on crowded beaches are no legend: documents stay in the safe, and swimming takes turns with watching your things. Sea urchins call for rubber shoes, and under fire-risk warnings the bans on open flames and parking on dry grass apply. In trouble, call 112.",
      },
      {
        title: "The sea month by month",
        text: "May 18 to 20 degrees, June around 22, July and August 24 to 26, September around 23, October still 20 in the south. The southern half of the coast is a degree or two warmer than the northern. For swimming without a shiver, choose June or September.",
      },
    ],
    faqs: [
      {
        question: "How much are the tolls from Rijeka to Dubrovnik?",
        answer:
          "Roughly €40: around €30 from Rijeka to Split, and around €10 from Split to Dubrovnik, across the Pelješki Bridge. You pay at the booths section by section, in cash or by card. The old coastal road is free, but slower by exactly as much as it is beautiful.",
      },
      {
        question: "Do I have to book the ferry in advance?",
        answer:
          "For a car in summer, yes — and weeks ahead: tickets for July and August sell out. Foot passengers get a ticket on the day, but at the height of the season crowds rule for them too. Book as soon as you know your dates, and read the conditions for changes.",
      },
      {
        question: "Which beaches are free?",
        answer:
          "Most of them: the pebbles, rocks and concrete slabs along the entire coast are public and open to all. You pay only for the equipment — the sunloungers and parasols on organised beaches. Hotels as a rule do not close their stretch of shore to visitors.",
      },
      {
        question: "When is the sea at its warmest?",
        answer:
          "In July and August, from 24 to 26 degrees. June sits at around 22 and September at around 23 — both perfectly swimmable. From Split southwards, add a degree or two.",
      },
      {
        question: "Where is it cheapest to sleep?",
        answer:
          "In campsites and private rooms; five to ten kilometres from the sea the price drops further. June and September are the months in which the price can still be discussed; July and August are not. Booking directly with the owner often bypasses the platforms' commission.",
      },
      {
        question: "Is it safe to leave things on the beach?",
        answer:
          "No: thefts of bags and phones on crowded beaches are not an urban legend. Documents and cash stay at your accommodation, and on the beach you take turns minding your things while you swim. Leave nothing on view in the car — a smashed window is a dearer souvenir of the holiday.",
      },
      {
        question: "Which month is the best choice?",
        answer:
          "June or September, depending on what you are after: June for freshness and the first swims, September for a warm sea and calm towns. At the end of September it is still summer in the south. Choose July and August only if there is no other way you can travel.",
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

  // 6. A practical guide to car hire: what to arrange before the car crosses a border.
  {
    slug: "najem-avta-cross-border",
    title: "Renting a car for a trip from Slovenia to Croatia, Bosnia, Montenegro and Albania",
    metaTitle: "Car hire for the south: Croatia, Bosnia, Montenegro, Albania",
    description:
      "When to rent instead of taking your own car, what to check with the agency, border crossings into Bosnia, Montenegro and Albania, and the deposit.",
    excerpt:
      "A practical guide to renting a car that will cross borders: what must be in the contract, what on the green card, how much deposit they block and when renting pays off.",
    route: "Ljubljana → Zagreb → Sarajevo → Mostar → Split → Ljubljana",
    countries: ["SI", "HR", "BA"],
    days: 7,
    km: 1200,
    heroImage: "/adria/najem-avta-cross-border.jpg",
    heroAlt:
      "A row of cars parked in the sunshine outside a car rental office building, with a motorway road sign in the background",
    author: "Tanja Novak",
    date: "2026-08-07",
    readTime: 12,
    stops: [
      {
        name: "Ljubljana",
        country: "SI",
        nights: 0,
        highlight:
          "Pick-up: before you get behind the wheel, confirm that Bosnia and any countries further south are written into the contract, not merely promised verbally.",
      },
      {
        name: "Zagreb",
        country: "HR",
        nights: 1,
        highlight:
          "The first leg and the first HAC toll booth; in the evening, Tkalćićeva street, which shows how a hired car breathes again after the motorway.",
      },
      {
        name: "Sarajevo",
        country: "BA",
        nights: 2,
        highlight:
          "Baščaršija, ćevapi and the Tunnel of Hope — two days that justify the surcharge for the Bosnian crossing in the contract.",
      },
      {
        name: "Mostar",
        country: "BA",
        nights: 2,
        highlight:
          "Stari most and the tekke at Blagaj by the source of the Buna, with the Kravice waterfalls within reach of a day trip from the city.",
      },
      {
        name: "Split",
        country: "HR",
        nights: 1,
        highlight:
          "Diocletian's Palace and a farewell on the Riva before the final leg home, on which the tolls are not included in the rental price.",
      },
    ],
    sections: [
      {
        heading: "Your own car or a hire car: do the maths first",
        body: [
          "Most Slovenes take their own car south, and that is mostly a sound decision. A hire car comes into its own when the family car is too old or too small for a long journey, when you want seats that your back still approves of after 1,500 kilometres, or when, immersed in the countries of the south, you would rather not think about what becomes of the car once you are home again. The decision is always arithmetic and never sentiment.",
          "With your own car you reckon with wear, a possible extension of your insurance cover to the south, and the fact that every fault on the road remains yours. With a hire car the costs are more visible: the rental fee, the country surcharges, the deposit, and the time you burn on the phone to the agency. For a week or two your own car is as a rule cheaper; the rental starts to win when the route is long and the countries along it number four.",
          "Because a car hired from a Slovenian agency also means a Slovenian parts supply and a Slovenian helpline, this guide is written chiefly from the point of view of picking the car up at home. The same logic holds for hiring in Zagreb or Split — only the contract is then Croatian, and the crossings are governed by its terms.",
        ],
        list: [
          {
            title: "What you add to your own car",
            text: "Wear and maintenance after a long journey, extending your motor insurance cover to the chosen countries, and arranging the green card with your insurer.",
          },
          {
            title: "What you add to a rental",
            text: "The rental fee, a surcharge for every chosen country, the deposit blocked on your card, and a slightly shorter holiday spent on the small print of the contract.",
          },
          {
            title: "When the rental wins",
            text: "A long loop through several countries, an ageing car at home, travel in the hottest part of the summer, and any case in which you need an air-conditioning system that actually works.",
          },
          {
            title: "When your own car wins",
            text: "A shorter route, a proven car and a driver whose insurance and documents are in order — for a week of Croatia the maths almost always comes down on its side.",
          },
        ],
      },
      {
        heading: "The contract and permission to cross the border",
        body: [
          "The most important document on this journey is neither the map nor your passport, but the rental contract. Every country you intend to drive in must be named in it explicitly. For Croatia the approval goes without saying and questions are never asked; for Bosnia and Herzegovina it has to be requested, while for Montenegro and Albania it can happen that the agency will not grant it regardless of the surcharge. So put the question before you book, not first at pick-up.",
          "Smaller domestic agencies near the southern border like to exclude these countries, fearing damage on the poorer roads; the larger international ones usually allow them for a one-off or a daily surcharge. Whatever you were told on the phone should end up in the contract as well: verbal approval at the handing over of the keys means nothing if it proves otherwise at the border or after an accident.",
          "While arranging the crossings, check the mileage allowance too. For a journey through the south choose a deal with unlimited kilometres, otherwise every detour around the Bay of Kotor or through Herzegovina will cost you more than it is worth. If you share the driving, every driver should be entered in the contract — this item, too, is cheaper arranged before departure than paid as a penalty after an accident.",
        ],
      },
      {
        heading: "Insurance, the green card and the deposit",
        body: [
          "Basic insurance with damage cover is included in the price, but as a rule with an excess that comes out of your own pocket in an accident. Extra cover that lowers or removes the excess pays for itself on any journey that takes you along stone-paved streets, gravel tracks and island roads. Above all check whether glass, tyres and the undercarriage are covered, because those are precisely the three items that suffer most in the south.",
          "The green card is the document that proves the car carries third-party insurance abroad, and it belongs to the agency's fleet. For Croatia the entry is always covered, for Bosnia usually, while for Montenegro and Albania an entry is not guaranteed. Ask for the card at pick-up and read it: the countries are marked on it with their codes, and a crossed-out code means you are not going there.",
          "The deposit is blocked on a credit card at pick-up — debit cards are often not accepted — and released after your return, which can take several weeks. The amount depends on the category of vehicle and the size of the excess, usually somewhere between a few hundred and over a thousand euros, so leave enough room on the card's limit. Photograph the condition of the car at pick-up and again at return; five minutes with a phone saves an argument at least twice in a lifetime.",
        ],
      },
      {
        heading: "One-way rentals: when they make sense",
        body: [
          "A one-way rental — pick-up in Ljubljana, return in Split or Zagreb — is possible above all with the larger agencies, but the surcharge is as a rule high, and higher still for cross-border combinations, often the price of several days' hire. So it pays off only if you are coming home by ferry without the car or by plane — in other words, when a round trip by road simply is not possible.",
          "For the classic loop from Slovenia down south and back, only a return rental makes sense. Handing the car back at the same agency holds no surprises, and the rental desks at Ljubljana's Brnik airport stay open further into the evening, which on a late return proves more convenient than it seems at the moment of booking.",
          "When planning the return, check the rental office's hours for Sundays and public holidays, and the option of handing in the keys outside opening hours. If you are returning the car at six in the morning before setting off on the next leg, you want the handover on record, not dependent on when someone comes to open the office.",
        ],
      },
      {
        heading: "Prices, booking and the hidden items",
        body: [
          "The price of a rental follows a pronounced seasonal rhythm. For July and August book as early as spring, because the best ratios of price to category sell out early, and in summer only the dearer classes and the automatics are left. June and September can bring a distinctly lower daily rate, and a weekly rental is cheaper than a week's worth of daily rates — the difference covers an extra day or so on the coast.",
          "The price you see at booking rarely includes everything. The surcharges to examine: the young-driver fee, if anyone is under twenty-five; the additional-driver fee; a child seat, if one is needed; pick-up at the airport; the surcharge for every country you cross; and fuel under the full-to-full arrangement, which is the fairest solution and the only one we recommend.",
          "Choose the size of the car for the south, not for the motorway. A compact is a mercy in the narrow streets of Hvar, Kotor and Mostar, and the car parks are laid out for cars from a time when there were fewer of them. A convertible or an off-roader brings a story from this road; a compact brings peace of mind.",
        ],
      },
      {
        heading: "A sample week with a hired car",
        body: [
          "So that the handbook does not remain pure theory, here is a loop on which everything above proves itself in practice: seven days, around 1,200 kilometres, two countries outside the Schengen area in a single contract. On the first day you drive to Zagreb; on the second you continue through the Posavina and the border control to Sarajevo, arriving in time for an afternoon stroll through Baščaršija.",
          "The third and fourth days belong to Sarajevo: one day for the old town, from the Sebilj fountain to the Vijećnica and the Latin Bridge, the other for the Tunnel of Hope and the cable car up Trebević. On the fifth day the valley of the Neretva carries you past Konjic to Mostar; the sixth is for Stari most, Blagaj and the Kravice waterfalls. On the seventh you come back along the coast, through Split, and home by motorway — that day is the longest, so start it early.",
          "On this loop the contract must name Croatia and Bosnia and Herzegovina, and the green card must carry the BA entry. Tolls are paid as you go: in Slovenia the e-vignette applies, which on a domestic fleet is as a rule covered by the registration — but confirm that at pick-up; in Croatia you pay section by section at the toll booths; in Bosnia you meet individual low tolls on the motorway sections.",
        ],
      },
    ],
    practical: [
      {
        title: "Permission to cross the border",
        text: "Every country you intend to drive in must be entered explicitly in the rental contract. For Croatia the approval goes without saying, for Bosnia and Herzegovina it has to be requested, and for Montenegro and Albania it can happen that the agency will not grant it. Driving into a country that is not in the contract voids the insurance cover.",
      },
      {
        title: "The green card with a rental",
        text: "The card belongs to the agency's fleet, so ask for it together with the contract and check the entries: Croatia is always covered, Bosnia often, while Montenegro and Albania are not guaranteed one. A crossed-out code on the card means you are not driving into that country with that car.",
      },
      {
        title: "The deposit and cards",
        text: "The deposit is blocked at pick-up on a credit card; debit cards are often not accepted. The release after your return can take up to several weeks, so leave room on the limit. Photograph the condition of the car at pick-up and at return, however unnecessary the pictures may seem.",
      },
      {
        title: "Vignettes and tolls on the way",
        text: "A domestic fleet as a rule has the Slovenian e-vignette in order, but confirm that at pick-up. Croatia has no vignette: you pay the tolls section by section at the HAC booths, and they are not included in the rental. In Bosnia, Montenegro and Albania you meet individual tolls, which you likewise pay separately.",
      },
      {
        title: "Documents to carry in the car",
        text: "Keep the rental contract, a copy of the vehicle registration and the fleet's green card in the car. At checks in the countries outside the Schengen area they will want to see them, so keep them in the glovebox within reach, not under the luggage at the bottom of the boot.",
      },
      {
        title: "When to book",
        text: "For July and August book as early as spring: the choice of categories and prices is then at its widest, while in peak season only the dearer classes remain. A weekly rental is cheaper than a week's worth of daily rates, and June and September bring lower prices without the peak crowds.",
      },
    ],
    faqs: [
      {
        question: "Can I drive a car hired in Slovenia to Bosnia, Montenegro and Albania?",
        answer:
          "It depends on the agency and the contract. The international companies usually allow the Bosnian crossing for a surcharge, while Montenegro and Albania are often excluded from the contracts. So settle the question before you book: the countries must be written into the contract, and verbal approval at the handing over of the keys does not count.",
      },
      {
        question: "What happens if I drive a hired car into a country that is not in the contract?",
        answer:
          "You are in breach of contract: the insurance cover lapses, and any damage, theft or breakdown you would settle yourself, up to the value of the car. If your route unexpectedly leads into such a country, report to the agency before the crossing and arrange the surcharge and the entry.",
      },
      {
        question: "How much deposit will they block?",
        answer:
          "The amount depends on the category of the car and the size of the excess; usually it is a sum of a few hundred to over a thousand euros. It is blocked on a credit card at pick-up and released after your return and an inspection of the condition, which can take several weeks — in the meantime, keep your card's limit as free as possible.",
      },
      {
        question: "Does a one-way rental pay off — pick-up in Ljubljana, return in Split?",
        answer:
          "Only in rare cases. The inter-city surcharge is high, the cross-border one higher still, often more than several days of hire. It pays off if you are returning by plane or by ferry without the car; otherwise take a circular rental and bring the car back to the same agency.",
      },
      {
        question: "Do I need a green card if I hire a car?",
        answer:
          "The card belongs to the agency's fleet and you receive it together with the contract. What matters are the entries on it: Croatia is always covered, while for Bosnia, Montenegro and Albania you check the code at pick-up. If there is no entry, you are not driving in that direction with that car.",
      },
      {
        question: "When is a hire car cheaper?",
        answer:
          "Outside the peak of the season. June and September can be considerably kinder than August, and a weekly rental cheaper than a week's worth of daily rates. Book early, choose unlimited mileage and return the car with a full tank — those three moves together bring the most.",
      },
    ],
    relatedSlugs: [
      "kotor-crna-gora-iz-slovenije",
      "albanija-z-avtom-iz-slovenije",
      "hrvaska-obala-prakticni-vodnik",
    ],
    relatedSloveniaIds: ["ljubljana", "maribor", "celje"],
  },
];
