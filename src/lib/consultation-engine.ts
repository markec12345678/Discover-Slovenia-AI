import { DESTINATIONS } from "@/lib/slovenia-data";
import { EVENTS } from "@/lib/events-data";
import { db } from "@/lib/db";
import { generateCompletion } from "@/lib/ai-client";

// ============================================================================
// KONZULTACIJSKI MOTOR — strežniška logika za globoko osebno konzultacijo
// (Faza 3b-2: plačljiva različica „Vprašaj lokalca")
// ============================================================================
// Isti arhitekturni principi kot /api/ask-local (B2B flywheel, zero
// hallucination, iskren fallback), a POGLOBITEV:
//  - večji kontekst (izkušnje s cenami, dogodki, destinacije),
//  - personalizacija (datumi, druščina, proračun, interesi),
//  - strukturiran osebni načrt (povzetek → priporočila → praktični nasveti).
//
// Ta modul je SERVER-ONLY (importa db + ai-client) — client komponente
// smejo importati IZKLJUČNO src/lib/consultations.ts (čiste konstante).
// ============================================================================

/** Kontekstni element — izluščen iz baze (oz. statičnih podatkov za dogodke). */
export interface ConsultContextItem {
  /** ID zapisa v DB (listing/experience/product) — za tracking števcev; statični dogodki imajo null. */
  id: string | null;
  name: string;
  kind: "lokal" | "izkušnja" | "izdelek" | "dogodek";
  category: string | null;
  destinationName: string | null;
  description: string;
  /** Cena v človeku berljivi obliki. */
  price: string | null;
  rating: number | null;
  /** Paket partnerja: "free" | "premium" | "enterprise" | null. */
  plan: string | null;
  /** Ali je lokal TRENUTNO aktivno sponzoriran. */
  sponsoredActive: boolean;
}

/** Priporočeni partner za shranjevanje (JSON — isti format kot LocalQuestion). */
export interface ConsultRecommendedPartner {
  name: string;
  kind: "lokal" | "izkušnja" | "izdelek" | "dogodek";
  category: string | null;
  destinationName: string | null;
  plan: string | null;
}

/** Vhod konzultacije (validiran s strani APIja). */
export interface ConsultationInput {
  question: string;
  destinationName: string | null;
  travelDates: string | null;
  partyDescription: string | null;
  budget: string | null;
  interests: string[];
}

const KIND_LABEL: Record<ConsultContextItem["kind"], string> = {
  lokal: "Lokal",
  izkušnja: "Izkušnja",
  izdelek: "Izdelek",
  dogodek: "Dogodek",
};

const DESTINATION_ID_BY_NAME = new Map<string, string>(
  DESTINATIONS.map((d) => [d.name, d.id])
);
const DESTINATION_BY_NAME = new Map(DESTINATIONS.map((d) => [d.name, d]));

// === PREMIUM-AWARE RAZVRŠČANJE (identičen princip kot ask-local) ===

function partnerWeight(plan: string | null, sponsoredActive: boolean): number {
  const planWeight = plan === "enterprise" ? 2 : plan === "premium" ? 1 : 0;
  return planWeight + (sponsoredActive ? 1 : 0);
}

function isPremiumPartner(item: ConsultContextItem): boolean {
  return (
    item.plan === "premium" ||
    item.plan === "enterprise" ||
    item.sponsoredActive
  );
}

// ============================================================================
// KONTEKST — bogatejši kot ask-local (namenoma: konzultacija je globlja)
// ============================================================================

/**
 * Zgradi kontekst za konzultacijo. Za izbrano destinacijo VSE relevantne
 * vrste (lokal, izkušnja, izdelek, dogodek) z žepom za proračun; brez
 * destinacije top vsebine po vsej Sloveniji.
 */
export async function buildConsultationContext(
  destinationName: string | null
): Promise<{ destinationSummary: string; items: ConsultContextItem[] }> {
  const baseWhere = destinationName
    ? { status: "published", destinationName }
    : { status: "published", featured: true };
  // Večji žep kot ask-local (12 → 16): konzultacija je plačljiv, globji
  // produkt — AI potrebuje širšo izbiro za personaliziran izbor.
  const take = destinationName ? 16 : 10;
  const fetchTake = take * 2;

  const [listings, experiences, products] = await Promise.all([
    db.listing
      .findMany({
        where: baseWhere,
        take: fetchTake,
        select: {
          id: true, name: true, category: true, destinationName: true,
          description: true, rating: true, priceRange: true, featured: true,
          plan: true, sponsored: true, sponsoredUntil: true,
        },
        orderBy: { rating: "desc" },
      })
      .catch(() => []),
    db.experience
      .findMany({
        where: baseWhere,
        take: fetchTake,
        select: {
          id: true, name: true, category: true, destinationName: true,
          description: true, pricePerPerson: true, durationHours: true,
          rating: true, featured: true, plan: true,
        },
        orderBy: { rating: "desc" },
      })
      .catch(() => []),
    db.product
      .findMany({
        where: baseWhere,
        take: fetchTake,
        select: {
          id: true, name: true, category: true, destinationName: true,
          description: true, price: true, rating: true, featured: true,
          plan: true,
        },
        orderBy: { rating: "desc" },
      })
      .catch(() => []),
  ]);

  const now = new Date();
  const rank = <T extends { plan: string; rating: number | null; featured: boolean }>(
    rows: T[],
    sponsoredActive: (row: T) => boolean
  ): T[] =>
    [...rows]
      .sort((a, b) => {
        const wDiff =
          partnerWeight(b.plan, sponsoredActive(b)) -
          partnerWeight(a.plan, sponsoredActive(a));
        if (wDiff !== 0) return wDiff;
        const rDiff = (b.rating ?? 0) - (a.rating ?? 0);
        if (rDiff !== 0) return rDiff;
        return Number(b.featured) - Number(a.featured);
      })
      .slice(0, take);

  const rankedListings = rank(
    listings,
    (l) => l.sponsored && l.sponsoredUntil != null && l.sponsoredUntil > now
  );
  const rankedExperiences = rank(experiences, () => false);
  const rankedProducts = rank(products, () => false);

  const items: ConsultContextItem[] = [
    ...rankedListings.map((l): ConsultContextItem => ({
      id: l.id,
      name: l.name,
      kind: "lokal",
      category: l.category,
      destinationName: l.destinationName,
      description: l.description,
      price: l.priceRange ? `Cenovni razred ${l.priceRange}` : null,
      rating: l.rating,
      plan: l.plan,
      sponsoredActive: l.sponsored && l.sponsoredUntil != null && l.sponsoredUntil > now,
    })),
    ...rankedExperiences.map((e): ConsultContextItem => ({
      id: e.id,
      name: e.name,
      kind: "izkušnja",
      category: e.category,
      destinationName: e.destinationName,
      description: e.description,
      price:
        e.pricePerPerson != null
          ? `€${e.pricePerPerson}/osebo${e.durationHours != null ? `, ~${e.durationHours} h` : ""}`
          : null,
      rating: e.rating,
      plan: e.plan,
      sponsoredActive: false,
    })),
    ...rankedProducts.map((p): ConsultContextItem => ({
      id: p.id,
      name: p.name,
      kind: "izdelek",
      category: p.category,
      destinationName: p.destinationName,
      description: p.description,
      price: p.price != null ? `€${p.price}` : null,
      rating: p.rating,
      plan: p.plan,
      sponsoredActive: false,
    })),
  ];

  // Dogodki (statični events-data) — konzultacija s datumi mora videti
  // kaj se dogaja v obdobju
  const destId = destinationName
    ? DESTINATION_ID_BY_NAME.get(destinationName)
    : null;
  const matchedEvents = destId
    ? EVENTS.filter((e) => e.destinationId === destId).slice(0, 8)
    : EVENTS.filter((e) => e.featured).slice(0, 8);
  for (const ev of matchedEvents) {
    items.push({
      id: null,
      name: ev.name,
      kind: "dogodek",
      category: ev.category,
      destinationName: destinationName ?? null,
      description: ev.description,
      price:
        ev.priceRange === "brezplačno"
          ? "Brezplačno"
          : `Cenovni razred ${ev.priceRange}`,
      rating: null,
      plan: null,
      sponsoredActive: false,
    });
  }

  const dest = destinationName ? DESTINATION_BY_NAME.get(destinationName) : null;
  const destinationSummary = dest
    ? `${dest.name} — ${dest.tagline}. Znamenitosti: ${dest.highlights.slice(0, 5).join(", ")}. Aktivnosti: ${dest.activities.slice(0, 5).join(", ")}.`
    : DESTINATIONS.map((d) => `- ${d.name} (${d.tagline})`).join("\n");

  return { destinationSummary, items };
}

// ============================================================================
// PROMPT — strukturiran osebni načrt (razlika nasproti ask-local)
// ============================================================================

export function buildConsultationSystemPrompt(
  input: ConsultationInput,
  context: { destinationSummary: string; items: ConsultContextItem[] }
): string {
  const itemsContext = context.items
    .map((i) => {
      const parts = [
        `- ${i.name} [${KIND_LABEL[i.kind]}${i.category ? `, ${i.category}` : ""}]`,
        i.destinationName ? `v ${i.destinationName}` : "",
        `: ${i.description.substring(0, 110)}`,
        i.price ? `. ${i.price}.` : "",
        i.rating != null ? `. Ocena: ${i.rating}/5.` : "",
        isPremiumPartner(i) ? " [premium partner]" : "",
      ];
      return parts.filter(Boolean).join(" ");
    })
    .join("\n");

  const persona: string[] = [];
  if (input.travelDates) persona.push(`Datumi potovanja: ${input.travelDates}`);
  if (input.partyDescription) persona.push(`Druščina: ${input.partyDescription}`);
  if (input.budget) persona.push(`Proračun (skupaj): ${input.budget}`);
  if (input.interests.length > 0)
    persona.push(`Zanimanja: ${input.interests.join(", ")}`);

  return `Si "Lokalec" — izkušen domačin, ki pripravlja PLAČLJO osebno konzultacijo za obiskovalca Slovenije. To je globja različica hitrega nasveta: obiskovalec je za ta odgovor plačal, zato pričakuje strnjen, oseben in uporaben načrt.

${input.destinationName ? `KONTEKST DESTINACIJE: ${context.destinationSummary}` : `RASPOLOŽLJIVE DESTINACIJE:\n${context.destinationSummary}`}

OSEBNI PODATKI POTNIKA:
${persona.join("\n") || "(dodatnih podatkov ni — odgovori splošno, a konkretno)"}

PODATKI PLATFORME (lokalci, izkušnje, izdelki, dogodki):
${itemsContext || "(ni dodatnih podatkov)"}

PRAVILA ODGOVORA:
1. Odgovori v slovenščini, ton toplega, izkušenega lokalca — konkretno, brez patosa in uvodnih fraz.
2. STRUKTURA odgovora (skoraj dobesedno z oznakami):
   Povzetek — 2–3 stavki: kaj priporočaš in zakaj, glede na druščino/datume/proračun.
   Osebni načrt — 4–6 točk „• …", vsaka z IMENOM iz podatkov + zakaj paše + cena/ocena, če je na voljo; pri datumih upoštevaj dogodke iz podatkov.
   Praktični nasveti — 3 točke (timing, prevoz/parkiranje, kaj vzeti s seboj ipd.), brez izmišljenih podrobnosti.
   Rezervacija — 1 stavek: katere točke iz načrta je pametno rezervirati vnaprej (naštej IMENA iz podatkov).
3. SAMO priporočila, ki obstajajo v zgornjih podatkih. Nikoli ne izmišljuj imen, cen, časov ali naslovov. Imena citiraj točno.
4. Prilagodi proračun: pri nizkem proračunu izpostavi cenejše/brezplačne možnosti; pri visokem ne potratno razmetavaj, a lahko vključiš vrhunske izkušnje.
5. Prilagodi druščino: otroci → družinske možnosti; starejši → zmerni tempi ipd. — iz podatkov, ki to omogočajo.
6. Med kvalitativno enakovrednimi možnostmi raje izberi tisto z oznako [premium partner] — nikoli pa ne priporči slabše opcije le zaradi oznake.
7. Dolžina: 2000–3500 znakov. Čisto besedilo brez markdown krepilnih zvezdic/naslovnih lojter (točke „•" in oznake odsekov dobesedno kot zapisane zgoraj).`;
}

// ============================================================================
// FALLBACK — programsko sestavljen načrt iz istega konteksta (brez AI)
// ============================================================================

export function buildFallbackConsultation(
  input: ConsultationInput,
  context: { destinationSummary: string; items: ConsultContextItem[] }
): string {
  const dest = input.destinationName
    ? DESTINATION_BY_NAME.get(input.destinationName)
    : null;

  // Uteženo izbira: ujemanje interesov/vprašanja + ocena (isti princip
  // kot ask-local fallback, z dodano preferenco izkušenj — rezervabilne)
  const words = input.question
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 12);
  const interestsLower = input.interests.map((i) => i.toLowerCase());

  const scored = context.items
    .map((item) => {
      const hay = `${item.name} ${item.description} ${item.category ?? ""}`.toLowerCase();
      const wordHits = words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
      const interestHits = interestsLower.reduce(
        (n, i) => n + (hay.includes(i.split(" ")[0]) ? 1 : 0),
        0
      );
      const planable = item.kind === "izkušnja" ? 0.5 : 0;
      return {
        item,
        score: wordHits * 0.4 + interestHits * 0.6 + (item.rating ?? 0) / 10 + planable,
      };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored.slice(0, 6).map((s) => s.item);
  const relevant = top.length > 0 ? top : context.items.slice(0, 6);

  if (relevant.length === 0) {
    return `Povzetek — AI trenutno ni dosegljiv, zato sestavljam načrt izključno iz baze platforme. ${
      dest
        ? `Za ${dest.name}: ${dest.tagline}. Najbolj znano za ${dest.highlights.slice(0, 3).join(", ")}.`
        : `Pokrivamo ${DESTINATIONS.length} destinacij po Sloveniji — od Bleda do Pirana.`
    }\n\nOsebni načrt — trenutno ni zapisov, ki bi ustrezali tvojim željam; piši nam na podporo in poskušamo nasvet najti ročno.\n\nPraktični nasveti — najlepše je zgodaj zjutraj, ko je manj ljudi; glavno sezono (julij–avgust) preveri cene vnaprej.\n\nRezervacija — brez konkretnih točk trenutno ni kaj rezervirati.`;
  }

  const personaBits = [
    input.travelDates,
    input.partyDescription,
    input.budget ? `proračun ${input.budget}` : null,
  ].filter(Boolean);

  const planLines = relevant
    .map(
      (i) =>
        `• ${i.name}${i.destinationName ? ` (${i.destinationName})` : ""}${i.price ? ` — ${i.price}` : ""}${i.rating != null ? `, ocena ${i.rating}/5` : ""}: ${i.description.substring(0, 130)}`
    )
    .join("\n");

  const tips = [
    `Najlepše je zgodaj zjutraj, ko je manj ljudi${dest ? ` — za ${dest.name} še posebej` : ""}.`,
    "Za poletne obiske preveri delovne čase in cene vnaprej (sezonsko se spreminjajo).",
    input.partyDescription?.toLowerCase().includes("otrok")
      ? "Z otroki načrtuj manj km na dan — rajši ena dobrа izkušnja kot tri hladne."
      : "Pusti si prost dan brez načrta — najboljši lokalni trenutki so nenapovedani.",
  ].join("\n");

  const bookable = relevant.filter((i) => i.kind === "izkušnja").slice(0, 2);
  const bookLine =
    bookable.length > 0
      ? `Vnaprej rezerviraj: ${bookable.map((b) => b.name).join(" in ")} — kapacitete so omejene.`
      : "Izbrane točke so večinoma brez rezervacije — pridej dovolj zgodaj.";

  return `Povzetek — sestavljen izključno iz baze platforme (AI trenutno ni dosegljiv; vsi podatki so realni). ${
    personaBits.length > 0 ? `Priporočila so prilagojena na: ${personaBits.join(", ")}.` : ""
  }

Osebni načrt —
${planLines}

Praktični nasveti —
${tips}

Rezervacija — ${bookLine}`;
}

// ============================================================================
// AI GENERACIJA + EKSTRAKCIJA PARTNERJEV
// ============================================================================

/**
 * Generira globok odgovor: AI (grounded) ali programski fallback —
 * VEDNO označen z virom (iskrenost).
 */
export async function generateConsultationAnswer(
  input: ConsultationInput,
  context: { destinationSummary: string; items: ConsultContextItem[] }
): Promise<{ answer: string; answerSource: "ai" | "fallback" }> {
  const aiResult = await generateCompletion(
    [
      {
        role: "system",
        content: buildConsultationSystemPrompt(input, context),
      },
      { role: "user", content: input.question },
    ],
    { temperature: 0.65 }
  );

  if (aiResult?.content) {
    return { answer: aiResult.content.trim(), answerSource: "ai" };
  }
  return {
    answer: buildFallbackConsultation(input, context),
    answerSource: "fallback",
  };
}

/**
 * Ujemanje imen SAMO iz konteksta (identičen princip kot ask-local):
 * partner dobi priporočilo le, če je bil AI-ju dejansko izpostavljen.
 */
export function extractConsultPartners(
  answer: string,
  items: ConsultContextItem[]
): ConsultRecommendedPartner[] {
  const answerLower = answer.toLowerCase();
  const caught = items.filter(
    (i) => i.name.length >= 4 && answerLower.includes(i.name.toLowerCase())
  );
  return caught.map((i) => ({
    name: i.name,
    kind: i.kind,
    category: i.category,
    destinationName: i.destinationName,
    plan: i.plan,
  }));
}

/**
 * B2B tracking: za vsak UJETI lokal poveča Listing.aiRecommendations +
 * zapiše ListingEvent (identično ask-local / listings/[slug]/track).
 * Stranski učinek v try/catch — nikoli ne sesuje konzultacije.
 */
export async function trackConsultationPartnerExposure(
  items: ConsultContextItem[]
): Promise<void> {
  try {
    const caughtListings = items.filter(
      (i) => i.kind === "lokal" && i.id !== null
    );
    for (const item of caughtListings) {
      await db.listing.update({
        where: { id: item.id as string },
        data: { aiRecommendations: { increment: 1 } },
      });
      await db.listingEvent.create({
        data: {
          listingId: item.id as string,
          type: "ai_recommendation",
          source: "consultation",
        },
      });
    }
  } catch (trackError) {
    console.error(
      "[consultation] tracking napaka (odgovor ni ogrožen):",
      trackError
    );
  }
}

/**
 * Varno parsaj recommendedPartners JSON string (isti vzorec kot ask-local).
 */
export function safeParseConsultPartners(
  raw: string | null
): ConsultRecommendedPartner[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const valid = parsed.filter(
        (p): p is ConsultRecommendedPartner =>
          typeof p === "object" &&
          p !== null &&
          typeof (p as ConsultRecommendedPartner).name === "string" &&
          typeof (p as ConsultRecommendedPartner).kind === "string"
      );
      return valid.length > 0 ? valid : [];
    }
    return null;
  } catch {
    return null;
  }
}
