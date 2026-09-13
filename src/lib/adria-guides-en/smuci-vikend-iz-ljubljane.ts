// SLO-WINTER-1 — Ski weekend from Ljubljana (EN).

import type { AdriaGuide } from "../adria-guides/types";

export const ADRIA_GUIDES_EN_WINTER_SMUCI: AdriaGuide[] = [
  // Comparative ski weekend: Ljubljana → Bohinj (Vogel) → Ljubljana; Krvavec and Kranjska Gora as the alternatives.
  {
    slug: "smuci-vikend-iz-ljubljane",
    title: "Ski weekend from Ljubljana: Vogel, Krvavec or Kranjska Gora",
    metaTitle: "Ski weekend from Ljubljana: Vogel, Krvavec or Kranjska Gora",
    description:
      "Three days, 160 kilometres and a comparison of three ski resorts — Vogel, Krvavec or Kranjska Gora — with pass prices, winter tyres and where to sleep.",
    excerpt:
      "Three days, 160 kilometres and one decision: Vogel, Krvavec or Kranjska Gora? How to choose a resort, when winter tyres become law and why both nights belong to Bohinj.",
    route: "Ljubljana → Bohinj → Ljubljana",
    countries: ["SI"],
    days: 3,
    km: 160,
    heroImage: "/adria/smuci-vikend-iz-ljubljane.jpg",
    heroAlt:
      "The snow-covered Vogel ski resort above Lake Bohinj: snowy huts beneath Julian Alps peaks and white slopes on a winter day",
    author: "Tanja Novak",
    date: "2026-10-27",
    readTime: 9,
    stops: [
      {
        name: "Bohinj",
        country: "SI",
        nights: 2,
        highlight:
          "Two nights beneath Vogel: the gondola lifts you straight from the valley by the lake onto the runs with the finest view in the country, while the evenings belong to the inns of Bohinjska Bistrica and walks beside the frozen lake. It is 80 kilometres from Ljubljana.",
      },
    ],
    sections: [
      {
        heading: "Which resort to choose: Vogel, Krvavec or Kranjska Gora",
        body: [
          "This is the easiest escape into snow that Ljubljana allows: Bohinj lies 80 kilometres away — 55 to Bled on the motorway, then 25 down the valley to the lake — and exactly the same back, 160 kilometres across three days in total. The stages are short, so the resort you choose matters more than the driving. Three winter frames apply, the ones summer guides keep quiet about: the season runs from December to March, darkness falls soon after 16:00, and winter tyres are a legal requirement from 15 November to 15 March, not a suggestion.",
          "Three resorts, three philosophies. Vogel sits 80 kilometres from Ljubljana and pulls you up by gondola straight from the valley beside Lake Bohinj; a day pass comes to around €45 for adults, €39 for young skiers and seniors and €23 for children, and the view of the lake from the runs is the finest in the country. Krvavec, around 35 kilometres out, is the nearest and built for a shorter day: around €45 for adults and €28 for children. Kranjska Gora, around 90 kilometres away, is the furthest — around €49 for adults, €44 for young skiers and €30 for children — and pays you back with night skiing on the Vitranc slope and a village that stays awake in the evening. The main route of this guide goes to Vogel; Krvavec and Kranjska Gora stand here as the alternatives.",
        ],
        list: [
          {
            title: "Vogel — the view over the lake",
            text: "A gondola from the valley and around 80 kilometres from Ljubljana; a day pass of €45/39/23 and a view neither of the other two can offer. The choice when the scenery matters as much as the piste.",
          },
          {
            title: "Krvavec — for time and a shorter day",
            text: "Around 35 kilometres from Ljubljana, the shortest drive of the three; a day pass around €45 for adults and €28 for children. You ski here when Saturday cannot be a whole day.",
          },
          {
            title: "Kranjska Gora — for the evening hours",
            text: "Around 90 kilometres and a pass around €49/44/30, repaid with night skiing on the Vitranc and a village that does not sleep after dark. Choose it when the evening counts as much as the piste.",
          },
        ],
      },
      {
        heading: "Friday: 80 kilometres to the valley",
        body: [
          "The Friday drive is short and legible: 55 kilometres of motorway to Bled and 25 down the valley along the Sava Bohinjka to the lake. The motorway stretch runs on the e-vignette — the weekly one costs €16 and covers every Slovenian section — after which the road leaves speed behind and drops into a valley where snow often lies from Bled onwards. Check your tyres before you set off: from 15 November to 15 March winter tyres are required by law, even when the road is dry and bare, and all-season tyres with at least 3 millimetres of tread count as winter equipment.",
          "Arrange the arrival so that the drive is the last tiring thing of the day. The inns of Bohinjska Bistrica serve dinner among locals, and by the lake the bridge and the church of St John at Ribčev Laz are reason enough for a short walk under the frost — darkness falls soon after 16:00, and the lights in the valley come on early. Sleeping in Bohinj comes noticeably cheaper than in Bled: the same Gorenjska landscape, fewer postcards, a smaller bill. Spend both nights here and drive to the gondola in the morning; it waits at the far end of the lake.",
        ],
      },
      {
        heading: "Saturday: Vogel and the morning runs",
        body: [
          "Saturday is the day you came for, so start early. The lifts at Vogel usually start turning around half past eight, and whoever stands at the gondola before the first cabin skis a piste that is still their own; later in the morning Saturday Slovenia begins flowing out of the valley and the lift queues breathe differently. A day pass costs around €45 for adults, €39 for young skiers and seniors and €23 for children. For slower mornings there is a half-day version: it is valid from 11:30 and costs around €38, €33 and €20.",
          "Whoever in your party does not ski is not sentenced to the valley. The panoramic gondola rides above the resort purely for the view: a return ticket costs around €32 for adults, €28 for young visitors and seniors and €15 for children, a single one around €24, €21 and €12. The top station is a terrace from which the lake is visible in full and the Julian Alps continue into the horizon. In the afternoon the sun softens the lower runs and the terraces fill up, and the loveliest hours on the snow remain the opening and the last descents — with lunch and a view in between.",
        ],
        list: [
          {
            title: "The first cabin",
            text: "Vogel usually opens around half past eight, and the hours just after opening are the coldest, quietest and most beautiful of the day. Sleep in and you get the same mountain — with a different queue.",
          },
          {
            title: "The half-day pass",
            text: "Valid from 11:30 and costing around €38 for adults, €33 for young skiers and seniors and €20 for children. Take it when the morning starts slowly, or when you prefer softened afternoon snow.",
          },
          {
            title: "The gondola for non-skiers",
            text: "A return ticket around €32/28/15, a single around €24/21/12. The view of the lake and the Julian Alps stands even when the pistes rest, and it is reason enough for the weekend.",
          },
        ],
      },
      {
        heading: "Sunday: the frozen lake and the dash home",
        body: [
          "The Sunday morning belongs to the lake. In winter Bohinj sometimes freezes into a white plain, and a walk along the shore is a silence the summer guides cannot promise: no boats on the water, barely a passer-by at the bridge at Ribčev Laz and the church of St John. And a rule every winter guide owes its reader: do not walk on the ice. It is not safe, even if a local is strolling across it — the view from the bank is the same, the risk is not. A coffee by the quiet shore is the finest possible start to the drive home.",
          "Plan the departure before lunch. The 80 kilometres back run along the same route — 25 to Bled and 55 by motorway to Ljubljana — and whoever clings to breakfast drives ahead of the column that stirs out of Gorenjska towards the capital after the Sunday lunch. A short stop at Bled is worth it: the island and the castle stand almost empty in winter, and the pletna boats, the flat wooden boats with standing oarsmen, do not run. Do not put Vintgar Gorge in the plan — it is open roughly from April to October, and in winter it simply is not.",
        ],
      },
      {
        heading: "When it gets crowded — and what if there is no snow",
        body: [
          "Two dates are exposed in skiing like no others: the Christmas week and the February half-term holidays. Then the whole of Slovenia squeezes onto all three resorts, accommodation in the valleys gets pricier, and a weekend that should be an escape turns into a crowd with skis. If you can choose, choose January or March: the same snow, considerably fewer people. Sort out equipment hire before the weekend — the larger centres across Gorenjska stock everything, but in busy weeks the racks empty fast, and children's gear empties first.",
          "And what if there is not enough snow? The resorts open with it: Vogel usually around 19 December, and the season tends to run until around 4 April — the opening depends on the snow cover every single year, so check the conditions before you leave. If such a weekend catches you in Bohinj, it is not wasted: the panoramic gondola rides even without skiing, the return ticket costs around €32, and a frozen lake in the valley is a reason to come back even without skis.",
        ],
        list: [
          {
            title: "The dates to skip",
            text: "The Christmas week and February, with the school winter holidays: full pistes, pricier beds, packed car parks. January and March hold the same snow and considerably more room.",
          },
          {
            title: "Hire before the weekend",
            text: "You can rent every piece of kit in the larger centres of Ljubljana and Gorenjska, but reserve it before the weekend; at Christmas and in February it empties first — and children's gear before everything else.",
          },
          {
            title: "If there is no snow",
            text: "The Vogel gondola rides for the view even when the pistes rest: a return ticket around €32. The view of the lake and the Julian Alps does not wait for the snow cover.",
          },
        ],
      },
    ],
    practical: [
      {
        title: "Winter tyres are the law",
        text: "From 15 November to 15 March a car in Slovenia must be on winter tyres — an obligation under the road traffic rules, not a recommendation, and it applies even when the road is dry. All-season tyres with at least 3 millimetres of tread count as winter equipment. Winter checks on the roads towards Gorenjska are not rare.",
      },
      {
        title: "The e-vignette for the motorway",
        text: "The motorway stretch between Ljubljana and Bled runs on the e-vignette: the weekly one for a car costs €16, bought at evinjeta.dars.si or at a petrol station and valid from the hour you choose. Anyone who would rather avoid it drives through Kranj and Radovljica — slower, but free of charge.",
      },
      {
        title: "Equipment hire",
        text: "Skis, bindings and helmets are rented in the larger sports centres of Ljubljana and Gorenjska; prices vary by centre, and a reservation saves you a morning of searching. Before Christmas and in February, book early — that is when the kit runs out, children's gear before anything else.",
      },
      {
        title: "Short days and the morning routine",
        text: "In December and January darkness falls soon after 16:00, yet skiing remains a daylight sport: the morning hours are the coldest, quietest and emptiest, while the pistes soften and fill in the afternoon. The same goes for the roads — the morning run to Gorenjska is calm, the Sunday afternoon one is a convoy.",
      },
      {
        title: "Sleeping in Bohinj",
        text: "Two nights beneath Vogel are the weekend Bled cannot sell you: the same landscape and snow, fewer postcards and usually a smaller bill. Guesthouses, rooms and apartments around Bohinjska Bistrica and the lake fill up first at Christmas and in February — book early then.",
      },
      {
        title: "Money and cards",
        text: "Slovenia is in the eurozone, so there is no currency to change; cards are accepted from the gondola to the inn. Keep some cash for smaller huts and out-of-the-way stops where the terminal occasionally fails — beyond that, this weekend has almost no use for it.",
      },
      {
        title: "Fuel",
        text: "Fuel prices are regulated: 95-octane petrol costs around €1.67 a litre and diesel around €1.94 a litre, with only symbolic differences between stations. The longest stage of the weekend is 80 kilometres — fill up without a strategy.",
      },
    ],
    faqs: [
      {
        question: "Which ski resort is best for beginners?",
        answer:
          "Krvavec. The runs are gentler, the drive from Ljubljana the shortest (around 35 kilometres), and you can cut the day short if needed — if skiing does not take, you lose the least. Kranjska Gora is mostly easy to intermediate and a good second choice; Vogel is intermediate and the most beautiful, which makes it better from the second day of skiing than the first.",
      },
      {
        question: "When do the ski resorts open?",
        answer:
          "It depends on the snow — usually in mid-December. Vogel normally opens around 19 December and skis until around 4 April; Krvavec and Kranjska Gora follow a similar rhythm. Before the weekend, always check the timetables and conditions on the resorts' official pages, because no two years are alike.",
      },
      {
        question: "Do I need winter tyres?",
        answer:
          "Yes, and it is not a matter of taste: from 15 November to 15 March winter tyres are required by law in Slovenia, even when the road is dry. All-season tyres with at least 3 millimetres of tread count as winter equipment. Without them you risk a fine at a check — and, with snow on the road, far more than a fine.",
      },
      {
        question: "How much does a day of skiing cost?",
        answer:
          "At Vogel around €45 for adults, €39 for young skiers and seniors and €23 for children; at Krvavec around €45 for adults and €28 for children; in Kranjska Gora around €49 for adults, €44 for young skiers and €30 for children. Vogel also has a half-day pass, valid from 11:30, for around €38 for adults. Add the equipment hire, which you should reserve in advance.",
      },
      {
        question: "Can I take the gondola up Vogel without skiing?",
        answer:
          "Yes. The panoramic gondola lifts you from the valley beside Lake Bohinj to a viewing station: a return ticket costs around €32 for adults, €28 for young visitors and seniors and €15 for children, a single one around €24, €21 and €12. The top station is a starting point for walks and terraces with views of the lake and the Julian Alps — half a day even for those who never touch a ski.",
      },
      {
        question: "Is this weekend worth it with children?",
        answer:
          "It is. Children pay the child rate — around €23 at Vogel, €28 at Krvavec and €30 in Kranjska Gora — and children's equipment hire should be reserved before the weekend, because it empties first. The first turns are easiest at Krvavec; in February expect the school winter holidays: more people and pricier beds. Where ski schools are available, sign up in advance — children's slots fill fastest.",
      },
      {
        question: "What if there is too little snow at the weekend?",
        answer:
          "Check the conditions before you leave: the opening depends on the snow cover every year, and Vogel usually starts turning around 19 December. If the pistes are resting, the weekend in Bohinj is not lost — the panoramic gondola rides for the view (a return ticket around €32), the lake sometimes freezes into a white plain, and the inns in the valley are warm. The skiing can fall through; Gorenjska cannot.",
      },
    ],
    relatedSlugs: ["slovenija-pozimi", "slovenija-v-7-dneh", "slovenija-z-otroki"],
    relatedSloveniaIds: ["bohinj", "ljubljana"],
  },
];
