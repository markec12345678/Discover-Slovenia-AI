// ============================================================================
// F9 — PLAN Q&A: deterministično odgovarjanje na vprašanja O NAČRTU
// ============================================================================
//
// MindTrip je "chat-first": uporabnik se pogovarja z načrtom. Naš odgovor
// (vrzel #9 konkurenčne analize): vprašanje se NAJPREJ obdela
// DETERMINISTIČNO — namen (intent) se prepona z regex vzorci (SL+EN+IT+DE,
// diakritika-neobčutljivo), odgovor pa se sestavi IZ IZRAČUNANIH dejstev
// (plan-facts.ts — iste čiste funkcije kot prikaz). Deluje tudi brez AI
// žetonov (kot hitre akcije refine). Šele če namen ni prepoznan, vprašanje
// + list dejstev gresta k AI z STROGIM navodilom: odgovarjaj IZKLJUČNO iz
// dejstev.
//
// Čista funkcija — isto na strani strežnika in klienta (testirano).
//
// W1-faza-2b-2 (1.129.0): vzorci namenov + odgovori so 4-jezični
// (PL pogodba — it/de eksplicitna, dedovanje EN samo kot prehodna varovalka).
//

import type { Itinerary, PlannerInput } from "@/lib/types";
import { buildPlanFacts, renderFactsSheet, type PlanFacts, type PlanLang } from "@/lib/plan-facts";
import { formatDrivingMinutes } from "@/lib/itinerary-quality";
import { buildSmartPackingList } from "@/lib/packing-smart";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { PL } from "@/lib/planner-lang";

// ---------------------------------------------------------------------------
// Tipi
// ---------------------------------------------------------------------------

/** Deterministični odgovor (namen + besedilo). */
export interface PlanQaAnswer {
  intent: string;
  text: string;
}

/** Živa dnevna napoved, poravnana z dnevi načrta (strežnik jo pridobi
 *  iz Open-Meteo, če je odhod znotraj ~16-dnevnega horizonta). */
export interface PlanForecastDay {
  day: number;
  text: string;
  tempMax: number;
  /** Max verjetnost padavin (%) — null, če vir ne vrne. */
  rainProb: number | null;
}

export interface PlanQaInput {
  /** Uporabnikovo vprašanje (SL/EN/IT/DE, prost tekst). */
  question: string;
  itinerary: Itinerary;
  input?: PlannerInput | null;
  lang?: PlanLang;
  /** Opcijsko: živa napoved za dneve načrta (obogati vremenski odgovor). */
  forecast?: PlanForecastDay[] | null;
}

// ---------------------------------------------------------------------------
// Normalizacija vprašanja (SL+EN+IT+DE, diakritika-neobčutljivo)
// ---------------------------------------------------------------------------

/** Odstrani slovenske/hrvaške/italijanske/nemške diakritike za neobčutljivo ujemanje. */
function stripDiacritics(s: string): string {
  return s
    .toLowerCase()
    .replace(/[čć]/g, "c")
    .replace(/ž/g, "z")
    .replace(/š/g, "s")
    .replace(/đ/g, "d")
    .replace(/[àáâä]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôö]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/ß/g, "ss");
}

// ---------------------------------------------------------------------------
// Prepoznavanje dneva ("dan 2", "2. dan", "day 3", "giorno 2", "tag 3", "zadnji dan" ...)
// ---------------------------------------------------------------------------

const ORDINALS: Record<string, number> = {
  prvi: 1, prva: 1, prvo: 1, first: 1,
  drugi: 2, druga: 2, drugo: 2, second: 2,
  tretji: 3, tretja: 3, tretje: 3, third: 3,
  cetrti: 4, cetrta: 4, cetrto: 4, fourth: 4,
  peti: 5, peta: 5, peto: 5, fifth: 5,
  // W1-2b-2: IT/DE ordinali (žigosani brez diakritike — stripDiacritics)
  primo: 1, prima: 1, secondo: 2, seconda: 2, terzo: 3, terza: 3,
  quarto: 4, quarta: 4, quinto: 5, quinta: 5,
  erster: 1, erste: 1, zweiter: 2, zweite: 2,
  dritter: 3, dritte: 3, vierter: 4, vierte: 4, funfter: 5, funfte: 5,
};

/** Izlušči sklic na dan iz vprašanja; veljaven ali izven obsega. */
function extractDayRef(
  q: string,
  days: number
): { day?: number; outOfRange?: number } {
  // "dan 2" / "dnevu 3" / "day 4" / "giorno 2" / "tag 3" / "jour"
  const m1 = q.match(/(?:\bdan\b|\bdneva\b|\bdnevu\b|\bday\b|\bgiorno\b|\bgiornata\b|\btag\b|\bgiornata)\s*0?(\d{1,2})\b/);
  if (m1) {
    const n = Number(m1[1]);
    if (n >= 1 && n <= days) return { day: n };
    return { outOfRange: n };
  }
  // "2. dan" / "3. dnev" / "2nd day" / "2. tag" / "2° giorno"
  const m2 = q.match(/0?(\d{1,2})(?:\.|°|st|nd|rd|th)\s*(?:dan|dnev|day|tag|giorno)/);
  if (m2) {
    const n = Number(m2[1]);
    if (n >= 1 && n <= days) return { day: n };
    return { outOfRange: n };
  }
  // "prvi dan" / "zadnji dan" / "first day" / "last day" / "primo/ultimo giorno" / "erster/letzter tag"
  if (/(prvi|prva|zadnji|zadnja|first|last|primo|ultima|ultimo|erster|erste|letzter|letzte)\s+(dan|dnev|day|giorno|giornata|tag)/.test(q)) {
    const last = /(zadnji|zadnja|last|ultima|ultimo|letzter|letzte)/.test(q);
    const n = last ? days : 1;
    if (n >= 1 && n <= days) return { day: n };
  }
  // "drugi dan" / "tretji dan" / "second day" / "secondo giorno" / "zweiter tag" ...
  const m3 = q.match(
    /(prvi|drugi|tretji|cetrti|peti|prva|druga|tretja|cetrta|peta|prvo|drugo|tretje|cetrto|peto|first|second|third|fourth|fifth|primo|prima|secondo|seconda|terzo|terza|quarto|quarta|quinto|quinta|erster|erste|zweiter|zweite|dritter|dritte|vierter|vierte|funfter|funte)\s+(dan|dnev|day|giorno|giornata|tag)/
  );
  if (m3 && ORDINALS[m3[1]]) {
    const n = ORDINALS[m3[1]];
    if (n >= 1 && n <= days) return { day: n };
    return { outOfRange: n };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Predlogi vprašanj (žetoni v UI + iskren fallback)
// ---------------------------------------------------------------------------

export const EXAMPLE_QUESTIONS: Record<PlanLang, string[]> = {
  sl: [
    "Koliko km in vožnje je na celotni poti?",
    "Kateri dan je najbolj natrpan?",
    "Koliko bo stalo (skupaj in na osebo)?",
    "Kaj je na dan 1?",
    "Kaj naj pakiram?",
  ],
  en: [
    "How many km and driving overall?",
    "Which day is the busiest?",
    "How much will it cost (total and per person)?",
    "What's on day 1?",
    "What should I pack?",
  ],
  it: [
    "Quanti km e quanta guida in tutto?",
    "Quale giorno è il più intenso?",
    "Quanto costerà (totale e per persona)?",
    "Cosa c'è il giorno 1?",
    "Cosa devo mettere in valigia?",
  ],
  de: [
    "Wie viele km und Fahrt insgesamt?",
    "Welcher Tag ist der vollste?",
    "Wie viel wird es kosten (gesamt und pro Person)?",
    "Was ist an Tag 1?",
    "Was soll ich einpacken?",
  ],
};

/** Iskren odgovor, ko namen ni prepoznan in AI ni na voljo. */
export function buildUnknownAnswer(lang: PlanLang): string {
  const examples = (EXAMPLE_QUESTIONS[lang] ?? EXAMPLE_QUESTIONS.en)
    .slice(0, 3)
    .map((q) => `„${q}“`)
    .join("; ");
  return PL(lang, {
    sl: `Na to ne morem odgovoriti iz izračunanih dejstev o načrtu — ugibati pa ne bom. Poskusi: ${examples}. (Za spremembe načrta uporabi „Prilagodi itinerer“ spodaj.)`,
    en: `I can't answer that from the computed plan facts — and I won't guess. Try one of these: ${examples}. (For changes to the plan, use “Adjust the itinerary” below.)`,
    it: `Non posso rispondere a questo dai dati calcolati del piano — e non tirerò a indovinare. Prova con: ${examples}. (Per modifiche al piano usa „Adatta l'itinerario“ qui sotto.)`,
    de: `Das kann ich aus den berechneten Planfakten nicht beantworten — und ich rate nicht. Versuche: ${examples}. (Für Änderungen am Plan nutze „Reiseplan anpassen“ unten.)`,
  });
}

// ---------------------------------------------------------------------------
// Slovenska dvojina/množina (jezikovna kakovost) + IT/DE pravila
// ---------------------------------------------------------------------------

/** Število postankov s pravilno obliko (SL: 1 postanek, 2 postanka, 3–4 postanki, 5+ postankov). */
function stopsWord(n: number, lang: PlanLang): string {
  if (lang === "en") return n === 1 ? "stop" : "stops";
  if (lang === "it") return n === 1 ? "tappa" : "tappe";
  if (lang === "de") return n === 1 ? "Stopp" : "Stopps";
  if (n === 1) return "postanek";
  if (n === 2) return "postanka";
  if (n >= 3 && n <= 4) return "postanki";
  return "postankov";
}

/** Število dni s pravilno obliko (SL: 1 dan, 2 dni, 3–4 dnevi, 5+ dni). */
function daysWord(n: number, lang: PlanLang): string {
  if (lang === "en") return n === 1 ? "day" : "days";
  if (lang === "it") return n === 1 ? "giorno" : "giorni";
  if (lang === "de") return n === 1 ? "Tag" : "Tage";
  if (n === 1) return "dan";
  if (n === 2) return "dni";
  if (n >= 3 && n <= 4) return "dnevi";
  return "dni";
}

// ---------------------------------------------------------------------------
// Pomožniki za izpis
// ---------------------------------------------------------------------------

function eur(n: number): string {
  return `${Math.round(n)} €`;
}

function drivingLabel(minutes: number, lang: PlanLang): string {
  const f = formatDrivingMinutes(minutes);
  return f === "—"
    ? PL(lang, { sl: "brez vožnje", en: "no driving", it: "senza guida", de: "ohne Fahrt" })
    : `~${f}`;
}

function routingNote(facts: PlanFacts, lang: PlanLang): string {
  if (facts.routingMethod === "osrm") {
    return PL(lang, { sl: "realne ceste (OSRM)", en: "real roads (OSRM)", it: "strade reali (OSRM)", de: "echte Straßen (OSRM)" });
  }
  if (facts.routingMethod === "mixed") {
    return PL(lang, { sl: "mešano OSRM + ocena", en: "mixed OSRM + estimate", it: "misto OSRM + stima", de: "gemischt OSRM + Schätzung" });
  }
  return PL(lang, { sl: "ocena, haversine × 1.3", en: "estimate, haversine × 1.3", it: "stima, haversine × 1,3", de: "Schätzung, Haversine × 1,3" });
}

// ---------------------------------------------------------------------------
// Namenski vzorci (vrstni red = specifičnost) — SL+EN+IT+DE
// ---------------------------------------------------------------------------

interface IntentPattern {
  intent: string;
  re: RegExp;
  /** Zahteva veljaven sklic na dan (sicer vzorec ne velja). */
  needsDay?: boolean;
}

const PATTERNS: IntentPattern[] = [
  { intent: "help", re: /(kaj (lahko )?vprasam|kaj znas|kaj lahko vpras|pomoc|help|what can i ask|how (does|do|to use))|\bkako deluje|cosa posso chiedere|come funziona|aiuto|was kann ich fragen|wie funktioniert|hilfe/ },
  { intent: "packing", re: /(pakir|prtljag|kaj (si )?vzeti s|what to pack|should i pack|do i need to pack|packing list|luggage|kaj vzeti|kaj s sabo|what.*to bring|valigi|mettere in valigia|cosa portare|cosa devo portare|cos.*packen|einpacken|packliste|gepack|was soll ich mitnehmen|koffer)/ },
  { intent: "weather", re: /(vreme|vremensk|\bdez\b|padavin|weather|\brain\b|forecast|napoved|meteo|prevision|piogg|regen|wetter|vorhersage|niederschlag)/ },
  { intent: "busiest", re: /(natrpan|najbolj poln|najbolj utruj|utrujal|busiest|most packed|most tiring|most intense|heaviest day|najzahtevne|piu intenso|il piu intenso|giorno piu|impegna|anstrengend|anstrengendste|voliste|vollste|intensivste|belastendste)/ },
  { intent: "warnings", re: /(opozoril|izvedljiv|feasib|warning|težav|tezav|problem|zapr|closure|closed|izvedljivost|avvis|fattibil|proble|chius|probleme|warnung|machbar|warnun|geschloss|schliess)/ },
  { intent: "family", re: /(otrok|otroc|druzin|family|\bkids\b|children|starost|bambin|famiglia|con bambini|adatto ai bambini|kindern|familien|kinder|kinderfreundlich)/ },
  { intent: "stops_total", re: /(koliko postank|how many stops|how many places|how many locations|postankov skupaj|stevilo postank|quante tappe|numero di tappe|quanti luoghi|wie viele stopps|wie viele orte|anzahl stopps)/ },
  { intent: "drive_day", re: /(\bkm\b|kilomet|razdalj|distance|voznj|driving|how long|kako dolgo|vozila|vozim|guida|quanti km|distanza|come arrivare|fahrt|fahren|wie lange|autofahrt|strecke)/, needsDay: true },
  { intent: "drive_total", re: /(\bkm\b|kilomet|razdalj|distance|voznj|driving|how long|kako dolgo|vozila|vozim|guida|quanti km|distanza|come arrivare|fahrt|fahren|wie lange|autofahrt|strecke)/ },
  { intent: "cost_day", re: /(stane|stalo|cena|ceno|how much|cost|budget|proracun|drago|expensive|costa|costo|quanto|prezzo|budget|caro|kosten|kostet|wie viel|teuer|budget)/, needsDay: true },
  { intent: "cost_total", re: /(stane|stalo|cena|ceno|how much|cost|budget|proracun|drago|expensive|costa|costo|quanto|prezzo|budget|caro|kosten|kostet|wie viel|teuer|budget)/ },
  { intent: "day_plan", re: /(kaj|what|plan|program|schedule|dela|do|see|poglej|cosa|programma|vedere|visita|piano|was|programm|sehen|machen|besichtigen)/, needsDay: true },
];

// ---------------------------------------------------------------------------
// Gradi odgovore (SL+EN+IT+DE) — vsi iz dejstev
// ---------------------------------------------------------------------------

function answerHelp(lang: PlanLang): string {
  const ex = (EXAMPLE_QUESTIONS[lang] ?? EXAMPLE_QUESTIONS.en)
    .map((q) => `„${q}“`)
    .join(" · ");
  return PL(lang, {
    sl: `Odgovarjam iz izračunanih dejstev o tvojem načrtu — vsaka številka je preračunana, ne ugibana. Vprašaj me o: skupni vožnji/km, najbolj natrpanem dnevu, stroških (atrakcije + vožnja), posameznem dnevu, vremenu v načrtu, pakiranju ali opozorilih o izvedljivosti. Primeri: ${ex}`,
    en: `I answer from computed plan facts — every number is calculated, never guessed. Ask me about: total driving/km, the busiest day, costs (attractions + driving), a specific day, the weather in the plan, packing, or feasibility warnings. Examples: ${ex}`,
    it: `Rispondo dai dati calcolati del tuo piano — ogni numero è calcolato, mai tirato a indovinare. Chiedimi di: guida totale/km, il giorno più intenso, i costi (attrazioni + guida), un giorno specifico, il meteo nel piano, la valigia o gli avvisi di fattibilità. Esempi: ${ex}`,
    de: `Ich antworte aus berechneten Planfakten — jede Zahl ist berechnet, nie geraten. Frag mich nach: Gesamtfahrt/km, dem vollsten Tag, Kosten (Sehenswürdigkeiten + Fahrt), einem bestimmten Tag, dem Wetter im Plan, dem Packen oder Machbarkeitswarnungen. Beispiele: ${ex}`,
  });
}

function answerDrive(facts: PlanFacts, lang: PlanLang, day?: number): string {
  if (day !== undefined) {
    const d = facts.perDay.find((p) => p.day === day);
    if (!d) return buildUnknownAnswer(lang);
    return PL(lang, {
      sl: `Dan ${d.day}: ~${d.km} km vožnje, ${drivingLabel(d.drivingMinutes, "sl")} med ${d.stops} ${stopsWord(d.stops, "sl")}: ${d.names.join(", ")}. (${routingNote(facts, "sl")} — isti vir kot plošča izvedljivosti.)`,
      en: `Day ${d.day}: ~${d.km} km of driving, ${drivingLabel(d.drivingMinutes, "en")} between ${d.stops} ${stopsWord(d.stops, "en")}: ${d.names.join(", ")}. (${routingNote(facts, "en")} — same source as the feasibility panel.)`,
      it: `Giorno ${d.day}: ~${d.km} km di guida, ${drivingLabel(d.drivingMinutes, "it")} tra ${d.stops} ${stopsWord(d.stops, "it")}: ${d.names.join(", ")}. (${routingNote(facts, "it")} — stessa fonte del pannello di fattibilità.)`,
      de: `Tag ${d.day}: ~${d.km} km Fahrt, ${drivingLabel(d.drivingMinutes, "de")} zwischen ${d.stops} ${stopsWord(d.stops, "de")}: ${d.names.join(", ")}. (${routingNote(facts, "de")} — gleiche Quelle wie das Machbarkeitspanel.)`,
    });
  }
  const avg = facts.days > 0 ? Math.round(facts.drivingMinutes / facts.days) : 0;
  const longest = facts.perDay.reduce<(PlanFacts["perDay"][number] | null)>(
    (a, b) => (b.drivingMinutes > (a?.drivingMinutes ?? -1) ? b : a),
    null
  );
  const longestLine = longest
    ? PL(lang, {
        sl: ` Največ za volanom: dan ${longest.day} (${longest.km} km).`,
        en: ` Longest behind the wheel: day ${longest.day} (${longest.km} km).`,
        it: ` Più tempo al volante: giorno ${longest.day} (${longest.km} km).`,
        de: ` Längste Zeit am Steuer: Tag ${longest.day} (${longest.km} km).`,
      })
    : "";
  return PL(lang, {
    sl: `Celotna pot: ~${facts.tripKm} km, ${drivingLabel(facts.drivingMinutes, "sl")} na ${facts.days} ${daysWord(facts.days, "sl")} — povprečno ${drivingLabel(avg, "sl")} na dan.${longestLine} (${routingNote(facts, "sl")}.)`,
    en: `Whole trip: ~${facts.tripKm} km, ${drivingLabel(facts.drivingMinutes, "en")} across ${facts.days} ${daysWord(facts.days, "en")} — on average ${drivingLabel(avg, "en")} per day.${longestLine} (${routingNote(facts, "en")}.)`,
    it: `Viaggio intero: ~${facts.tripKm} km, ${drivingLabel(facts.drivingMinutes, "it")} in ${facts.days} ${daysWord(facts.days, "it")} — in media ${drivingLabel(avg, "it")} al giorno.${longestLine} (${routingNote(facts, "it")}.)`,
    de: `Ganze Reise: ~${facts.tripKm} km, ${drivingLabel(facts.drivingMinutes, "de")} über ${facts.days} ${daysWord(facts.days, "de")} — im Schnitt ${drivingLabel(avg, "de")} pro Tag.${longestLine} (${routingNote(facts, "de")}.)`,
  });
}

function answerBusiest(facts: PlanFacts, lang: PlanLang): string {
  if (!facts.busiest) {
    return PL(lang, {
      sl: "Ne morem razvrstiti dni po obsegu — samo en dan ima postanke.",
      en: "I can't rank days by load with this plan (only one day has stops).",
      it: "Non posso classificare i giorni per carico con questo piano (un solo giorno ha tappe).",
      de: "Ich kann die Tage nach Last nicht ordnen — nur ein Tag hat Stopps.",
    });
  }
  const b = facts.busiest;
  const q = facts.quietest;
  const quietLine = q
    ? PL(lang, {
        sl: ` Najlažji je dan ${q.day} (${formatDrivingMinutes(q.loadMinutes)} skupaj).`,
        en: ` The lightest is day ${q.day} (${formatDrivingMinutes(q.loadMinutes)} total).`,
        it: ` Il più leggero è il giorno ${q.day} (${formatDrivingMinutes(q.loadMinutes)} in totale).`,
        de: ` Der leichteste ist Tag ${q.day} (${formatDrivingMinutes(q.loadMinutes)} insgesamt).`,
      })
    : "";
  return PL(lang, {
    sl: `Najbolj natrpan je dan ${b.day}: ${b.stops} ${stopsWord(b.stops, "sl")} [${b.names.join(", ")}], ${b.km} km + aktivnosti = ${formatDrivingMinutes(b.loadMinutes)} skupnega obsega.${quietLine} „Obseg“ = vožnja + aktivnosti, izračunano — ne občutek. Če je preveč, uporabi hitro akcijo „Počasnejši tempo“.`,
    en: `The busiest day is day ${b.day}: ${b.stops} ${stopsWord(b.stops, "en")} [${b.names.join(", ")}], ${b.km} km + activities = ${formatDrivingMinutes(b.loadMinutes)} of total load.${quietLine} “Load” = driving + activities, computed — not a feeling. If it's too much, use the quick action “Slower pace”.`,
    it: `Il giorno più intenso è il giorno ${b.day}: ${b.stops} ${stopsWord(b.stops, "it")} [${b.names.join(", ")}], ${b.km} km + attività = ${formatDrivingMinutes(b.loadMinutes)} di carico totale.${quietLine} „Carico“ = guida + attività, calcolato — non una sensazione. Se è troppo, usa l'azione rapida „Ritmo più calmo“.`,
    de: `Der vollste Tag ist Tag ${b.day}: ${b.stops} ${stopsWord(b.stops, "de")} [${b.names.join(", ")}], ${b.km} km + Aktivitäten = ${formatDrivingMinutes(b.loadMinutes)} Gesamtlast.${quietLine} „Last“ = Fahrt + Aktivitäten, berechnet — kein Gefühl. Wenn es zu viel ist, nutze die Schnellaktion „Langsameres Tempo“.`,
  });
}

function answerCost(facts: PlanFacts, lang: PlanLang, day?: number): string {
  if (day !== undefined) {
    const d = facts.perDay.find((p) => p.day === day);
    if (!d) return buildUnknownAnswer(lang);
    return PL(lang, {
      sl: `Dan ${d.day}: atrakcije ${eur(d.cost)} (${d.names.join(", ")}). Nočitev, hrana in nakupi NISO vključeni.`,
      en: `Day ${d.day}: attractions cost ${eur(d.cost)} (${d.names.join(", ")}). Accommodation, food and shopping are NOT included.`,
      it: `Giorno ${d.day}: le attrazioni costano ${eur(d.cost)} (${d.names.join(", ")}). Pernottamento, cibo e acquisti NON sono inclusi.`,
      de: `Tag ${d.day}: Sehenswürdigkeiten kosten ${eur(d.cost)} (${d.names.join(", ")}). Übernachtung, Essen und Einkäufe sind NICHT enthalten.`,
    });
  }
  const perPerson = facts.groupSize > 0 ? facts.estimatedCost / facts.groupSize : facts.estimatedCost;
  const drive = facts.driveCosts;
  const total = facts.estimatedCost + (drive?.totalEur ?? 0);
  const lines: string[] = [];
  lines.push(
    PL(lang, {
      sl: `Atrakcije: ${eur(facts.estimatedCost)} → ${eur(perPerson)} na osebo (${facts.groupSize} oseb).`,
      en: `Attractions: ${eur(facts.estimatedCost)} → ${eur(perPerson)} per person (${facts.groupSize}).`,
      it: `Attrazioni: ${eur(facts.estimatedCost)} → ${eur(perPerson)} a persona (${facts.groupSize} persone).`,
      de: `Sehenswürdigkeiten: ${eur(facts.estimatedCost)} → ${eur(perPerson)} pro Person (${facts.groupSize} Personen).`,
    })
  );
  if (drive) {
    lines.push(
      PL(lang, {
        sl: `Vožnja: gorivo ${eur(drive.fuelEur)} + vinjeta ${eur(drive.vignetteEur)} = ${eur(drive.totalEur)} (tarife AMZS/DARS — vinjeta samo ob avtocestah).`,
        en: `Driving: fuel ${eur(drive.fuelEur)} + vignette ${eur(drive.vignetteEur)} = ${eur(drive.totalEur)} (AMZS/DARS tariffs — vignette only if you use motorways).`,
        it: `Guida: carburante ${eur(drive.fuelEur)} + vignetta ${eur(drive.vignetteEur)} = ${eur(drive.totalEur)} (tariffe AMZS/DARS — vignetta solo se usi le autostrade).`,
        de: `Fahrt: Kraftstoff ${eur(drive.fuelEur)} + Vignette ${eur(drive.vignetteEur)} = ${eur(drive.totalEur)} (AMZS/DARS-Tarife — Vignette nur bei Autobahnnutzung).`,
      })
    );
    lines.push(
      PL(lang, {
        sl: `Skupaj načrt ≈ ${eur(total)}.`,
        en: `Plan total ≈ ${eur(total)}.`,
        it: `Totale piano ≈ ${eur(total)}.`,
        de: `Plan gesamt ≈ ${eur(total)}.`,
      })
    );
  } else {
    lines.push(
      PL(lang, {
        sl: `Stroški vožnje: neznani — načrt nima koordinat in ne ugibam.`,
        en: `Driving costs: unknown — the plan has no coordinates, and I won't guess.`,
        it: `Costi di guida: sconosciuti — il piano non ha coordinate e non tirerò a indovinare.`,
        de: `Fahrkosten: unbekannt — der Plan hat keine Koordinaten, und ich rate nicht.`,
      })
    );
  }
  lines.push(
    PL(lang, {
      sl: `Nočitev, hrana in nakupi NISO vključeni.`,
      en: `Accommodation, food and shopping are NOT included.`,
      it: `Pernottamento, cibo e acquisti NON sono inclusi.`,
      de: `Übernachtung, Essen und Einkäufe sind NICHT enthalten.`,
    })
  );
  if (facts.budgetGoal) {
    const diff = facts.budgetGoal - facts.estimatedCost;
    lines.push(
      diff >= 0
        ? PL(lang, {
            sl: `Tvoj proračunski cilj: ${facts.budgetGoal} € — atrakcije se izidejo, ostane še ${eur(diff)}.`,
            en: `Your budget goal: €${facts.budgetGoal} — attractions fit with ${eur(diff)} to spare.`,
            it: `Il tuo obiettivo di budget: ${facts.budgetGoal} € — le attrazioni rientrano, avanzano ancora ${eur(diff)}.`,
            de: `Dein Budgetziel: ${facts.budgetGoal} € — die Sehenswürdigkeiten passen, es bleiben noch ${eur(diff)}.`,
          })
        : PL(lang, {
            sl: `Tvoj proračunski cilj: ${facts.budgetGoal} € — samo atrakcije so že ${eur(-diff)} čez.`,
            en: `Your budget goal: €${facts.budgetGoal} — attractions alone are ${eur(-diff)} over.`,
            it: `Il tuo obiettivo di budget: ${facts.budgetGoal} € — solo le attrazioni superano già di ${eur(-diff)}.`,
            de: `Dein Budgetziel: ${facts.budgetGoal} € — allein die Sehenswürdigkeiten sind schon ${eur(-diff)} darüber.`,
          })
    );
  }
  return lines.join(" ");
}

function answerWeather(
  facts: PlanFacts,
  lang: PlanLang,
  forecast?: PlanForecastDay[] | null
): string {
  const lines: string[] = [];

  if (forecast && forecast.length > 0) {
    lines.push(
      PL(lang, {
        sl: `Živa napoved za tvoje datume (Open-Meteo, horizont ~16 dni):`,
        en: `Live forecast for your dates (Open-Meteo, ~16-day horizon):`,
        it: `Previsione live per le tue date (Open-Meteo, orizzonte ~16 giorni):`,
        de: `Live-Vorhersage für deine Termine (Open-Meteo, ~16-Tage-Horizont):`,
      })
    );
    for (const f of forecast.slice(0, 5)) {
      const rain =
        f.rainProb !== null
          ? ` · ${f.rainProb} % ${PL(lang, { sl: "padavin", en: "rain", it: "pioggia", de: "Regen" })}`
          : "";
      lines.push(
        `• ${PL(lang, { sl: `Dan ${f.day}`, en: `Day ${f.day}`, it: `Giorno ${f.day}`, de: `Tag ${f.day}` })}: ${f.text}, ${f.tempMax} °C${rain}`
      );
    }
    const rainy = forecast.filter((f) => (f.rainProb ?? 0) >= 50);
    if (rainy.length > 0) {
      lines.push(
        PL(lang, {
          sl: `Dež verjeten na dan(e) ${rainy.map((r) => r.day).join(", ")} — hitra akcija „Primerno za dež“ zamenja zunanje postanke tega dneva.`,
          en: `Rain likely on day(s) ${rainy.map((r) => r.day).join(", ")} — the quick action “Rain-suitable” swaps outdoor stops on that day.`,
          it: `Pioggia probabile nei giorni ${rainy.map((r) => r.day).join(", ")} — l'azione rapida „Adatto alla pioggia“ sostituisce le tappe all'aperto di quel giorno.`,
          de: `Regen wahrscheinlich an Tag(en) ${rainy.map((r) => r.day).join(", ")} — die Schnellaktion „Regentauglich“ tauscht Outdoor-Stopps dieses Tages.`,
        })
      );
    }
  } else {
    lines.push(
      PL(lang, {
        sl: `Vreme, zadeto v načrt (ocena ob generiranju — NI živa napoved):`,
        en: `Weather baked into the plan (estimate at generation time — NOT a live forecast):`,
        it: `Meteo incorporato nel piano (stima alla generazione — NON una previsione live):`,
        de: `Wetter im Plan (Schätzung bei der Erstellung — KEINE Live-Vorhersage):`,
      })
    );
    for (const d of facts.perDay.slice(0, 5)) {
      if (d.weather) {
        lines.push(
          `• ${PL(lang, { sl: `Dan ${d.day}`, en: `Day ${d.day}`, it: `Giorno ${d.day}`, de: `Tag ${d.day}` })}: ${d.weather}, ${d.temp} °C`
        );
      }
    }
    if (facts.tripStartDate) {
      lines.push(
        PL(lang, {
          sl: `Žive napovedi za tvoj odhod trenutno ni na voljo (ali je čez horizont ~16 dni).`,
          en: `A live forecast for your departure date isn't available right now (or it's beyond the ~16-day horizon).`,
          it: `Al momento non è disponibile una previsione live per la tua partenza (o è oltre l'orizzonte di ~16 giorni).`,
          de: `Eine Live-Vorhersage für dein Abreisedatum ist gerade nicht verfügbar (oder sie liegt jenseits des ~16-Tage-Horizonts).`,
        })
      );
    }
  }
  return lines.join(" ");
}

function answerDayPlan(facts: PlanFacts, lang: PlanLang, day: number): string {
  const d = facts.perDay.find((p) => p.day === day);
  if (!d) return buildUnknownAnswer(lang);
  const dateStr = d.date ? ` (${d.date})` : "";
  const stops =
    d.names.length > 0
      ? d.names.map((n, i) => `${i + 1}. ${n}`).join("; ")
      : PL(lang, { sl: "brez postankov", en: "no stops", it: "nessuna tappa", de: "keine Stopps" });
  const warnings =
    d.warnings > 0
      ? PL(lang, {
          sl: ` ${d.warnings} opozoril o izvedljivosti.`,
          en: ` ${d.warnings} feasibility warning(s).`,
          it: ` ${d.warnings} avvisi di fattibilità.`,
          de: ` ${d.warnings} Machbarkeitswarnungen.`,
        })
      : "";
  return PL(lang, {
    sl: `Dan ${d.day}${dateStr}: ${d.stops} ${stopsWord(d.stops, "sl")} — ${stops}. ~${d.km} km, ${drivingLabel(d.drivingMinutes, "sl")} vožnje, ${d.activityMinutes} min aktivnosti, ${eur(d.cost)}. Vreme (ocena): ${d.weather || "—"} ${d.temp} °C.${warnings}`,
    en: `Day ${d.day}${dateStr}: ${d.stops} ${stopsWord(d.stops, "en")} — ${stops}. ~${d.km} km, ${drivingLabel(d.drivingMinutes, "en")} driving, ${d.activityMinutes} min of activities, ${eur(d.cost)}. Weather estimate: ${d.weather || "—"} ${d.temp} °C.${warnings}`,
    it: `Giorno ${d.day}${dateStr}: ${d.stops} ${stopsWord(d.stops, "it")} — ${stops}. ~${d.km} km, ${drivingLabel(d.drivingMinutes, "it")} di guida, ${d.activityMinutes} min di attività, ${eur(d.cost)}. Meteo (stima): ${d.weather || "—"} ${d.temp} °C.${warnings}`,
    de: `Tag ${d.day}${dateStr}: ${d.stops} ${stopsWord(d.stops, "de")} — ${stops}. ~${d.km} km, ${drivingLabel(d.drivingMinutes, "de")} Fahrt, ${d.activityMinutes} Min Aktivitäten, ${eur(d.cost)}. Wetter (Schätzung): ${d.weather || "—"} ${d.temp} °C.${warnings}`,
  });
}

function answerPacking(
  input: PlanQaInput,
  lang: PlanLang
): string {
  const list = buildSmartPackingList({
    itinerary: input.itinerary,
    input: input.input ?? null,
    lang,
  });
  if (!list) {
    return PL(lang, {
      sl: "Pametnega pakirnega seznama ni bilo mogoče izračunati za ta načrt.",
      en: "The smart packing list couldn't be computed for this plan.",
      it: "Non è stato possibile calcolare la lista intelligente del bagaglio per questo piano.",
      de: "Die intelligente Packliste ließ sich für diesen Plan nicht berechnen.",
    });
  }
  const items = list.items.slice(0, 5);
  const detail = items
    .map(
      (i) =>
        `• ${i.label}${i.reason ? ` — ${i.reason}` : ""}`
    )
    .join("\n");
  const method =
    list.method === "forecast"
      ? PL(lang, {
          sl: "iz dnevne napovedi (če je odhod znotraj ~16 dni)",
          en: "from the daily forecast (if departure is within ~16 days)",
          it: "dalla previsione giornaliera (se la partenza è entro ~16 giorni)",
          de: "aus der Tagesvorhersage (wenn der Abflug innerhalb von ~16 Tagen liegt)",
        })
      : PL(lang, {
          sl: "sezonska (za te datume ni žive napovedi)",
          en: "seasonal (no live forecast for these dates)",
          it: "stagionale (nessuna previsione live per queste date)",
          de: "saisonal (keine Live-Vorhersage für diese Termine)",
        });
  return PL(lang, {
    sl: `Pametni pakirni seznam (isti, kot se izriše pod načrtom) priporoča ${list.items.length} predmetov. Vrh z razlogi:\n${detail}\nMetoda: ${method} — razkrito, ne ugibano.`,
    en: `The smart packing list (same one rendered below the plan) recommends ${list.items.length} items. Top picks with reasons:\n${detail}\nMethod: ${method} — disclosed, not guessed.`,
    it: `La lista intelligente del bagaglio (la stessa mostrata sotto il piano) consiglia ${list.items.length} articoli. I migliori con le ragioni:\n${detail}\nMetodo: ${method} — dichiarato, non tirato a indovinare.`,
    de: `Die intelligente Packliste (dieselbe, die unter dem Plan erscheint) empfiehlt ${list.items.length} Gegenstände. Top-Auswahl mit Begründung:\n${detail}\nMethode: ${method} — offengelegt, nicht geraten.`,
  });
}

function answerWarnings(facts: PlanFacts, lang: PlanLang): string {
  if (facts.warnings === 0 && facts.closedNotices.length === 0) {
    return PL(lang, {
      sl: `Plošča izvedljivosti za ta načrt ne poroča opozoril — vsak dan gre skozi geo-validacijska pravila (km na dan, število postankov, vrzeli v urniku).`,
      en: `The feasibility panel reports no warnings for this plan — every day passes the geo-validation rules (km per day, stop count, schedule gaps).`,
      it: `Il pannello di fattibilità non segnala avvisi per questo piano — ogni giorno supera le regole di geo-validazione (km al giorno, numero di tappe, gap di orario).`,
      de: `Das Machbarkeitspanel meldet für diesen Plan keine Warnungen — jeder Tag besteht die Geo-Validierungsregeln (km pro Tag, Stopp-Anzahl, Lücken im Zeitplan).`,
    });
  }
  const lines: string[] = [];
  if (facts.warnings > 0) {
    lines.push(
      PL(lang, {
        sl: `${facts.warnings} opozoril, od tega ${facts.errors} ravni ERROR:`,
        en: `${facts.warnings} warning(s), ${facts.errors} of them error-level:`,
        it: `${facts.warnings} avvisi, di cui ${facts.errors} di livello ERROR:`,
        de: `${facts.warnings} Warnungen, davon ${facts.errors} auf ERROR-Niveau:`,
      })
    );
  }
  for (const c of facts.closedNotices.slice(0, 3)) {
    lines.push(`• ${c.message}`);
  }
  if (facts.closedNotices.length > 3) {
    lines.push(
      PL(lang, {
        sl: `…in še ${facts.closedNotices.length - 3} — poglej ploščo izvedljivosti.`,
        en: `…and ${facts.closedNotices.length - 3} more — see the feasibility panel.`,
        it: `…e altre ${facts.closedNotices.length - 3} — vedi il pannello di fattibilità.`,
        de: `…und ${facts.closedNotices.length - 3} weitere — siehe Machbarkeitspanel.`,
      })
    );
  }
  lines.push(
    PL(lang, {
      sl: `Vir: ista geo-validacijska plast, ki se izriše pod načrtom.`,
      en: `Source: the same geo-validation layer that renders below the plan.`,
      it: `Fonte: lo stesso strato di geo-validazione che appare sotto il piano.`,
      de: `Quelle: dieselbe Geo-Validierungsschicht, die unter dem Plan erscheint.`,
    })
  );
  return lines.join("\n");
}

function answerStopsTotal(facts: PlanFacts, lang: PlanLang, day?: number): string {
  if (day !== undefined) {
    const d = facts.perDay.find((p) => p.day === day);
    if (!d) return buildUnknownAnswer(lang);
    return PL(lang, {
      sl: `Dan ${d.day} ima ${d.stops} ${stopsWord(d.stops, "sl")}: ${d.names.join(", ")}.`,
      en: `Day ${d.day} has ${d.stops} ${stopsWord(d.stops, "en")}: ${d.names.join(", ")}.`,
      it: `Il giorno ${d.day} ha ${d.stops} ${stopsWord(d.stops, "it")}: ${d.names.join(", ")}.`,
      de: `Tag ${d.day} hat ${d.stops} ${stopsWord(d.stops, "de")}: ${d.names.join(", ")}.`,
    });
  }
  const avg = facts.days > 0 ? (facts.totalStops / facts.days).toFixed(1) : "0";
  const most = facts.perDay.reduce<(PlanFacts["perDay"][number] | null)>(
    (a, b) => (b.stops > (a?.stops ?? -1) ? b : a),
    null
  );
  const mostLine = most
    ? PL(lang, {
        sl: ` Največ postankov: dan ${most.day} (${most.stops}).`,
        en: ` Most stops: day ${most.day} (${most.stops}).`,
        it: ` Più tappe: giorno ${most.day} (${most.stops}).`,
        de: ` Meiste Stopps: Tag ${most.day} (${most.stops}).`,
      })
    : "";
  return PL(lang, {
    sl: `${facts.totalStops} ${stopsWord(facts.totalStops, "sl")} na ${facts.days} ${daysWord(facts.days, "sl")} — povprečno ${avg} na dan.${mostLine}`,
    en: `${facts.totalStops} ${stopsWord(facts.totalStops, "en")} across ${facts.days} ${daysWord(facts.days, "en")} — on average ${avg} per day.${mostLine}`,
    it: `${facts.totalStops} ${stopsWord(facts.totalStops, "it")} in ${facts.days} ${daysWord(facts.days, "it")} — in media ${avg} al giorno.${mostLine}`,
    de: `${facts.totalStops} ${stopsWord(facts.totalStops, "de")} über ${facts.days} ${daysWord(facts.days, "de")} — im Schnitt ${avg} pro Tag.${mostLine}`,
  });
}

function answerFamily(
  input: PlanQaInput,
  lang: PlanLang
): string {
  const days = Array.isArray(input.itinerary?.days) ? input.itinerary.days : [];
  const familyStops: string[] = [];
  const otherStops: string[] = [];
  for (const d of days) {
    for (const loc of d?.locations ?? []) {
      const dest = DESTINATIONS.find((x) => x.id === loc?.destination_id);
      if (dest?.bestFor?.some((b) => b.toLowerCase().includes("družina") || b.toLowerCase().includes("family"))) {
        familyStops.push(loc.destination_name);
      } else {
        otherStops.push(loc.destination_name);
      }
    }
  }
  if (familyStops.length === 0 && otherStops.length === 0) {
    return buildUnknownAnswer(lang);
  }
  const lines: string[] = [];
  if (familyStops.length > 0) {
    lines.push(
      PL(lang, {
        sl: `Postanki z oznako „družina“ v našem nizu: ${familyStops.join(", ")}.`,
        en: `Stops tagged family-friendly in our dataset: ${familyStops.join(", ")}.`,
        it: `Tappe contrassegnate adatte alle famiglie nel nostro dataset: ${familyStops.join(", ")}.`,
        de: `Stopps mit Familien-Label in unserem Datensatz: ${familyStops.join(", ")}.`,
      })
    );
  }
  if (otherStops.length > 0) {
    lines.push(
      PL(lang, {
        sl: `Brez oznake „družina“: ${otherStops.join(", ")} — primernost preveri pri razlagi vsakega postanka.`,
        en: `Without the family tag: ${otherStops.join(", ")} — check each stop's “why” note for suitability.`,
        it: `Senza l'etichetta famiglia: ${otherStops.join(", ")} — verifica l'idoneità nella nota „perché“ di ogni tappa.`,
        de: `Ohne Familien-Label: ${otherStops.join(", ")} — Eignung in der „Warum“-Notiz jedes Stopps prüfen.`,
      })
    );
  }
  lines.push(
    PL(lang, {
      sl: `Za družinski ritem (krajše vožnje) uporabi hitro akcijo „Za družino“.`,
      en: `For a family rhythm (shorter drives), use the quick action “Family friendly”.`,
      it: `Per un ritmo familiare (guida più breve) usa l'azione rapida „Adatto alle famiglie“.`,
      de: `Für einen Familienrhythmus (kürzere Fahrten) nutze die Schnellaktion „Familienfreundlich“.`,
    })
  );
  return lines.join(" ");
}

// ---------------------------------------------------------------------------
// Glavna funkcija: deterministični poskus odgovora
// ---------------------------------------------------------------------------

/** Veljaven jezik pogona (4-jezično, W1-2b-2); neznano → SL. */
function planLangOf(raw: unknown): PlanLang {
  if (raw === "en" || raw === "it" || raw === "de") return raw;
  return "sl";
}

/**
 * Poskusi odgovoriti DETERMINISTIČNO (brez AI).
 * Vrne null, če namen ni prepoznan (klicalec naj poskusi AI pot).
 */
export function answerPlanQuestion(input: PlanQaInput): PlanQaAnswer | null {
  const lang = planLangOf(input.lang);
  const days = Array.isArray(input.itinerary?.days) ? input.itinerary.days : [];
  if (days.length === 0) return null;

  const q = stripDiacritics(
    typeof input.question === "string" ? input.question : ""
  ).replace(/\s+/g, " ");

  if (q.trim().length < 3) return null;

  const facts = buildPlanFacts(input.itinerary, input.input ?? null, lang);
  const { day, outOfRange } = extractDayRef(q, facts.days);

  // Dan izven obsega — iskreno popravi uporabnika PREJ kot kateri koli namen
  // („kaj je na dan 7" nima smisla, če ima načrt 2 dni — ne izmišljujmo dneva)
  if (day === undefined && outOfRange !== undefined) {
    return {
      intent: "out_of_range",
      text: PL(lang, {
        sl: `Načrt ima samo ${facts.days} ${daysWord(facts.days, "sl")} — dneva ${outOfRange} ni.`,
        en: `The plan only has ${facts.days} ${daysWord(facts.days, "en")} — there is no day ${outOfRange}.`,
        it: `Il piano ha solo ${facts.days} ${daysWord(facts.days, "it")} — il giorno ${outOfRange} non esiste.`,
        de: `Der Plan hat nur ${facts.days} ${daysWord(facts.days, "de")} — Tag ${outOfRange} gibt es nicht.`,
      }),
    };
  }

  // Namensko ujemanje — prvi zadetek v vrstnem redu specifičnosti
  let matched: IntentPattern | undefined;
  for (const p of PATTERNS) {
    if (p.re.test(q)) {
      if (p.needsDay && day === undefined) continue;
      matched = p;
      break;
    }
  }

  if (!matched) return null;

  switch (matched.intent) {
    case "help":
      return { intent: "help", text: answerHelp(lang) };
    case "packing":
      return { intent: "packing", text: answerPacking(input, lang) };
    case "weather":
      return {
        intent: "weather",
        text: answerWeather(facts, lang, input.forecast ?? null),
      };
    case "busiest":
      return { intent: "busiest", text: answerBusiest(facts, lang) };
    case "warnings":
      return { intent: "warnings", text: answerWarnings(facts, lang) };
    case "family":
      return { intent: "family", text: answerFamily(input, lang) };
    case "stops_total":
      return { intent: "stops_total", text: answerStopsTotal(facts, lang, day) };
    case "drive_day":
      return { intent: "drive_day", text: answerDrive(facts, lang, day) };
    case "drive_total":
      return { intent: "drive_total", text: answerDrive(facts, lang, undefined) };
    case "cost_day":
      return { intent: "cost_day", text: answerCost(facts, lang, day) };
    case "cost_total":
      return { intent: "cost_total", text: answerCost(facts, lang, undefined) };
    case "day_plan":
      return { intent: "day_plan", text: answerDayPlan(facts, lang, day!) };
    default:
      return null;
  }
}

/** Re-export za route (AI kontekst iz istega vira). */
export { buildPlanFacts, renderFactsSheet };
export type { PlanFacts, PlanLang };
