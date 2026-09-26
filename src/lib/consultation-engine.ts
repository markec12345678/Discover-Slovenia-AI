import { DESTINATIONS } from "@/lib/slovenia-data";
import { EVENTS } from "@/lib/events-data";
import { db } from "@/lib/db";

// ============================================================================
// KONZULTACIJSKI MOTOR — strežniška logika za globoko osebno konzultacijo
// (Faza 3b-2: plačljiva različica „Vprašaj lokalca")
// ============================================================================
// Isti arhitekturni principi kot /api/ask-local (B2B flywheel, zero
// hallucination), a POGLOBITEV:
//  - večji kontekst (izkušnje s cenami, dogodki, destinacije),
//  - personalizacija (datumi, druščina, proračun, interesi),
//  - strukturiran osebni načrt (povzetek → priporočila → praktični nasveti).
//
// Issue #9 ZERO-AI: motor je POPOLNOMA DETERMINISTIČEN — ocenjena izbira
// (ujemanje besed/interesov + ocena) nad realnim kontekstom baze, 0 AI
// klicev, 0 omrežja. Odgovor je vedno pošteno označen z virom
// answerSource="deterministic" (nekdanje "ai"/"fallback" vrstice v bazi
// ostanejo kot ZGODOVINA — stran jih še zna izrisati pošteno).
//
// Ta modul je SERVER-ONLY (importa db) — client komponente smejo importati
// IZKLJUČNO src/lib/consultations.ts (čiste konstante).
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

const DESTINATION_ID_BY_NAME = new Map<string, string>(
  DESTINATIONS.map((d) => [d.name, d.id])
);
const DESTINATION_BY_NAME = new Map(DESTINATIONS.map((d) => [d.name, d]));

// === PREMIUM-AWARE RAZVRŠČANJE (identičen princip kot ask-local) ===

function partnerWeight(plan: string | null, sponsoredActive: boolean): number {
  const planWeight = plan === "enterprise" ? 2 : plan === "premium" ? 1 : 0;
  return planWeight + (sponsoredActive ? 1 : 0);
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
  // Večji žep kot ask-local (12 → 16): konzultacija je globji produkt —
  // deterministični motor ima širšo izbiro za personaliziran izbor.
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
// DETERMINISTIČNI MOTOR — programsko sestavljen osebni načrt iz realnega
// konteksta baze (Issue #9 ZERO-AI: to JE izdelek, ne rezerva)
// ============================================================================

export function buildDeterministicConsultation(
  input: ConsultationInput,
  context: { destinationSummary: string; items: ConsultContextItem[] }
): string {
  const dest = input.destinationName
    ? DESTINATION_BY_NAME.get(input.destinationName)
    : null;

  // Uteženo izbira: ujemanje interesov/vprašanja + ocena (isti princip
  // kot ask-local, z dodano preferenco izkušenj — rezervabilne)
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
    return `Povzetek — načrt sestavljam izključno iz baze platforme (vsi podatki so realni). ${
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
      ? "Z otroki načrtuj manj km na dan — rajši ena dobra izkušnja kot tri hladne."
      : "Pusti si prost dan brez načrta — najboljši lokalni trenutki so nenapovedani.",
  ].join("\n");

  const bookable = relevant.filter((i) => i.kind === "izkušnja").slice(0, 2);
  const bookLine =
    bookable.length > 0
      ? `Vnaprej rezerviraj: ${bookable.map((b) => b.name).join(" in ")} — kapacitete so omejene.`
      : "Izbrane točke so večinoma brez rezervacije — pridej dovolj zgodaj.";

  return `Povzetek — sestavljen izključno iz baze platforme (vsi podatki so realni). ${
    personaBits.length > 0 ? `Priporočila so prilagojena na: ${personaBits.join(", ")}.` : ""
  }

Osebni načrt —
${planLines}

Praktični nasveti —
${tips}

Rezervacija — ${bookLine}`;
}

// ============================================================================
// GENERACIJA ODGOVORA + EKSTRAKCIJA PARTNERJEV
// ============================================================================

/**
 * Generira globok osebni načrt — DETERMINISTIČNO (Issue #9: 0 AI klicev,
 * 0 omrežja). Async ostaja zaradi stabilnosti vmesnika (route await-a).
 * Odgovor je VEDNO pošteno označen: answerSource="deterministic".
 */
export async function generateConsultationAnswer(
  input: ConsultationInput,
  context: { destinationSummary: string; items: ConsultContextItem[] }
): Promise<{ answer: string; answerSource: "deterministic" }> {
  return {
    answer: buildDeterministicConsultation(input, context),
    answerSource: "deterministic",
  };
}

/**
 * Ujemanje imen SAMO iz konteksta (identičen princip kot ask-local):
 * partner dobi priporočilo le, če je bil motorju dejansko izpostavljen
 * (deterministični izbor poteka nad istim kontekstom).
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
