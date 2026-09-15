import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { EVENTS } from "@/lib/events-data";
import { db } from "@/lib/db";
import { generateCompletion } from "@/lib/ai-client";
import { rateLimit } from "@/lib/rate-limit";
import { wrapProviderData, SYSTEM_DATA_GUARD } from "@/lib/ai-context";

// POST /api/ask-local — "Vprašaj lokalca": grounded AI Q&A na podlagi baze
//
// Diferenciacijska funkcija platforme: obiskovalec zastavi vprašanje
// (npr. "Kam z otroki v deževni dan na Bledu?"), AI pa odgovori GROUNDED —
// samo na podlagi realnih podatkov platforme (destinacije, lokali,
// izkušnje, izdelki, dogodki). Če AI ni dosegljiv, se sestavi programski
// fallback odgovor IZ ISTEGA KONTEKSTA (transparentno označen).
//
// Vprašanja + odgovori se shranjujejo javno (isPublic) = social proof
// + vsebinski SEO material za homepage.
//
// B2B FLYWHEEL (monetizacijsko vozlišče): kontekst, podan AI, je
// PREMIUM-AWARE — partnerji na premium/enterprise paketu (ali z aktivnim
// sponzorstvom) dobijo pri enakovredni kakovosti rahlo prednost (isti
// princip kot ranking-engine.ts calculatePremiumBoost). Vsak lokal, ki ga
// AI dejansko citira v odgovoru, se zabeleži: Listing.aiRecommendations +
// ListingEvent { type: "ai_recommendation", source: "ask-local" } —
// KONSISTENTNO s /api/listings/[slug]/track. Ujeta imena se shranijo kot
// LocalQuestion.recommendedPartners (JSON) → klikabilni čipi na frontendu.
// Zakonitost/transparentnost: premium utež nikoli ne izrine kakovosti
// (razvršča se NAJPREJ po uteži partnerja, ocena šele nato kot kakovostni
// rezervoar) in obiskovalcu je pod čipi razloženo, kaj ★ pomeni (EU princip
// odkrite označitve sponsorskih vsebin).
//
// GET ?destination=Bled → zadnjih 8 javnih odgovorjenih vprašanj.

// === MEJE (zrcalijo client validacijo v ask-local.tsx) ===
const QUESTION_MIN = 10;
const QUESTION_MAX = 500;
const AUTHOR_MIN = 2;
const AUTHOR_MAX = 40;

/** Koliko zadnjih javnih vprašanj vrne GET. */
const RECENT_TAKE = 8;

// === DNEVNA BREZPLAČNA MEJA (Faza 3b-2) ===
// 1 brezplačno vprašanje na obiskovalca na dan → po izčrpanju ponudimo
// plačljivo globoko konzultacijo (freemium produkt). Meja je vezana na
// anonimni piškotek ask_visitor (LocalQuestion.visitorId) — izbrisan
// piškotek resetira dnevni števec (priznana meja anonimnega tierja),
// IP rate limit (10/h) pa ostaja kot zloraba-varovalka.

/** Število brezplačnih vprašanj na dan na obiskovalca. */
const DAILY_FREE_QUESTIONS = 1;

/** Ime piškotka anonimnega obiskovalca. */
const VISITOR_COOKIE = "ask_visitor";

/** Veljavnost piškotka (180 dni). */
const VISITOR_COOKIE_MAX_AGE = 180 * 24 * 60 * 60;

/** Prebere (oz. ustvari nov) ID obiskovalca iz piškotka. */
async function getOrCreateVisitorId(): Promise<{
  visitorId: string;
  isNew: boolean;
}> {
  const store = await cookies();
  const existing = store.get(VISITOR_COOKIE)?.value;
  if (existing && /^[a-z0-9-]{8,64}$/i.test(existing)) {
    return { visitorId: existing, isNew: false };
  }
  return { visitorId: randomUUID(), isNew: true };
}

/** Nastavi piškotek na odgovor (httpOnly — klient ga ne bere, samo strežnik). */
function setVisitorCookie(res: NextResponse, visitorId: string): void {
  res.cookies.set({
    name: VISITOR_COOKIE,
    value: visitorId,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: VISITOR_COOKIE_MAX_AGE,
  });
}

/**
 * UTC trenutek polnoči v Ljubljani (DST-varen): oblikujemo trenutni
 * ljubljanski »wal-clock« prek Intl, odštejemo sekunde od polnoči →
 * dobljena številka je natanko tista UTC sekunda, ko je v Ljubljani
* začel tekoči dan.
 */
function startOfTodayLjubljana(): Date {
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Ljubljana",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day)
  );
  const secondsSinceMidnight =
    Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  return new Date(asUTC - secondsSinceMidnight * 1000);
}

interface AskLocalRequest {
  question?: string;
  destinationName?: string;
  authorName?: string;
}

/** Oblika enega priporočenega partnerja (LocalQuestion.recommendedPartners JSON). */
interface RecommendedPartner {
  name: string;
  kind: "lokal" | "izkušnja" | "izdelek" | "dogodek";
  category: string | null;
  destinationName: string | null;
  plan: string | null;
}

/** Kontekstni element — izluščen iz baze (oz. statičnih podatkov za dogodke). */
interface ContextItem {
  /** ID zapisa v DB (listing/experience/product) — za tracking števcev; statični dogodki imajo null. */
  id: string | null;
  name: string;
  kind: "lokal" | "izkušnja" | "izdelek" | "dogodek";
  category: string | null;
  destinationName: string | null;
  description: string;
  /** Cena v človeku berljivi obliki (npr. "€45/osebo" ali "Cenovni razred €€"). */
  price: string | null;
  rating: number | null;
  /** Paket partnerja: "free" | "premium" | "enterprise" | null (statični dogodki). */
  plan: string | null;
  /** Ali je lokal TRENUTNO aktivno sponzoriran (sponsored && sponsoredUntil > now). */
  sponsoredActive: boolean;
}

const KIND_LABEL: Record<ContextItem["kind"], string> = {
  lokal: "Lokal",
  izkušnja: "Izkušnja",
  izdelek: "Izdelek",
  dogodek: "Dogodek",
};

// Preslikava ime → id (za ujemanje statičnih EVENTS prek destinationId)
const DESTINATION_ID_BY_NAME = new Map<string, string>(
  DESTINATIONS.map((d) => [d.name, d.id])
);
const DESTINATION_BY_NAME = new Map(DESTINATIONS.map((d) => [d.name, d]));

// === PREMIUM-AWARE RAZVRŠČANJE (enak princip kot ranking-engine.ts) ===

/**
 * Utež partnerja: enterprise = 2, premium = 1, sicer 0;
 * AKTIVNO sponzorstvo (sponsored && sponsoredUntil > now) doda +1.
 * Primarno razvrščanje po tej uteži, šele nato po oceni — premium partner
 * dobi prednost pri ENAKOVREDNI kakovosti, nikoli pa nad njo.
 */
function partnerWeight(plan: string | null, sponsoredActive: boolean): number {
  const planWeight = plan === "enterprise" ? 2 : plan === "premium" ? 1 : 0;
  return planWeight + (sponsoredActive ? 1 : 0);
}

/** Ali je element premium partner (oznaka [premium partner] v kontekstu AI). */
function isPremiumPartner(item: ContextItem): boolean {
  return item.plan === "premium" || item.plan === "enterprise" || item.sponsoredActive;
}

export async function POST(request: Request) {
  // Rate limit — AI klic je drag; 10 vprašanj na uro na IP
  const limited = rateLimit(request, {
    limit: 10,
    windowMs: 3600000,
    key: "ask-local",
  });
  if (limited) return limited;

  let body: AskLocalRequest;
  try {
    body = (await request.json()) as AskLocalRequest;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  // === DNEVNA BREZPLAČNA MEJA (Faza 3b-2) ===
  // 1 vprašanje/dan na obiskovalca (piškotek) — po izčrpanju klient ponudi
  // plačljivo globoko konzultacijo. Z oznako code, da lahko UI loči
  // dnevno mejo od ostalih 429 (IP prekoračitev).
  const { visitorId, isNew } = await getOrCreateVisitorId();
  const usedToday = await db.localQuestion.count({
    where: { visitorId, createdAt: { gte: startOfTodayLjubljana() } },
  });
  if (usedToday >= DAILY_FREE_QUESTIONS) {
    const res = NextResponse.json(
      {
        error:
          "Za danes si že izkoristil brezplačno vprašanje — naslednje je spet jutri. Za globji, oseben načrt pa je tu osebna konzultacija.",
        code: "daily_free_limit",
        freeRemaining: 0,
      },
      { status: 429 }
    );
    if (isNew) setVisitorCookie(res, visitorId);
    return res;
  }

  // === VALIDACIJA (ista sporočila kot client) ===
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < QUESTION_MIN || question.length > QUESTION_MAX) {
    return NextResponse.json(
      { error: `Vprašanje mora imeti ${QUESTION_MIN}–${QUESTION_MAX} znakov` },
      { status: 400 }
    );
  }

  const destinationName =
    typeof body.destinationName === "string" ? body.destinationName.trim() : "";
  if (destinationName && !DESTINATION_BY_NAME.has(destinationName)) {
    return NextResponse.json(
      { error: "Neznana destinacija — izberite eno izmed ponujenih" },
      { status: 400 }
    );
  }

  const authorName =
    typeof body.authorName === "string" ? body.authorName.trim() : "";
  if (authorName && (authorName.length < AUTHOR_MIN || authorName.length > AUTHOR_MAX)) {
    return NextResponse.json(
      { error: `Ime mora imeti ${AUTHOR_MIN}–${AUTHOR_MAX} znakov` },
      { status: 400 }
    );
  }

  try {
    // === GRADI KONTEKST IZ BAZE ===
    // Fokusiran: če je destinacija podana, vzami VSE zanjo; sicer splošni top.
    const context = await buildContext(destinationName || null);

    // === AI ODGOVOR (grounded) ===
    let answer: string;
    let answerSource: "ai" | "fallback";

    const aiResult = await generateCompletion(
      [
        { role: "system", content: buildSystemPrompt(destinationName || null, context) },
        { role: "user", content: question },
      ],
      { temperature: 0.6 }
    );

    if (aiResult?.content) {
      answer = aiResult.content.trim();
      answerSource = "ai";
      console.log(
        `[ask-local] AI odgovor (source: ${aiResult.source}) — vprašanje: "${question.substring(0, 60)}"`
      );
    } else {
      // Fallback — programsko sestavljen IZ ISTEGA KONTEKSTA (iskrenost:
      // odgovor je označen answerSource="fallback", brez pretvarjanja da je AI)
      answer = buildFallbackAnswer(destinationName || null, context, question);
      answerSource = "fallback";
      console.log(
        `[ask-local] fallback odgovor (izključno iz baze) — vprašanje: "${question.substring(0, 60)}"`
      );
    }

    // === EKSTRAKCIJA PRIPOROČENIH PARTNERJEV IZ ODGOVORA ===
    // Ujemanje imen SAMO iz konteksta, ki je bil podan AI (prepreči lažna
    // ujemanja z imeni, ki jih odgovor slučajno vsebuje, a niso v kontekstu).
    // Izpostavljenost je izpostavljenost — šteje TUDI fallback odgovor
    // (obiskovalec je videl ime, partner je bil izpostavljen).
    const recommended = extractRecommendedPartners(answer, context.items);
    const partners: RecommendedPartner[] = recommended.map((i) => ({
      name: i.name,
      kind: i.kind,
      category: i.category,
      destinationName: i.destinationName,
      plan: i.plan,
    }));

    // === SHRANI (javno = social proof) ===
    const saved = await db.localQuestion.create({
      data: {
        question,
        answer,
        answerSource,
        destinationName: destinationName || null,
        authorName: authorName || null,
        isPublic: true,
        answeredAt: new Date(),
        // JSON array ujetih partnerjev → klikabilni čipi na frontendu
        recommendedPartners: JSON.stringify(partners),
        // Dnevna meja: vprašanje se pripiše obiskovalcu (1/dan)
        visitorId,
      },
    });

    // === B2B TRACKING — konsistentno s /api/listings/[slug]/track ===
    // Za vsak UJETI lokal (kind "lokal" + id iz konteksta) povečamo
    // Listing.aiRecommendations in zapišemo ListingEvent
    // { type: "ai_recommendation", source: "ask-local" } — identično
    // obnašanje kot funnel obstoječe tracking arhitekture.
    //
    // Izkušnje/izdelki se PRESKOČIJO: Experience in Product modela nimata
    // polja aiRecommendations (števec obstaja samo na Listing) in
    // ListingEvent je tuje-ključ vezan na listingId — sintetični dogodki ne
    // bi imeli kam. Njihova vrednost za partnerja je že zajeta v
    // recommendedPartners (vidnost čipov + kliki prek PartnerChip).
    //
    // Tracking je stranski učinek: EN try/catch blok, ki NIKOLI ne sesuje
    // glavne poti — obiskovalčev odgovor ima vedno prednost pred števcem.
    try {
      const caughtListings = recommended.filter(
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
            source: "ask-local",
          },
        });
      }
    } catch (trackError) {
      console.error("[ask-local] tracking napaka (odgovor ni ogrožen):", trackError);
    }

    const res = NextResponse.json(
      {
        success: true,
        question: {
          id: saved.id,
          question: saved.question,
          answer: saved.answer,
          answerSource: saved.answerSource,
          destinationName: saved.destinationName,
          authorName: saved.authorName,
          answeredAt: saved.answeredAt,
          // Ujeti partnerji kot POLJE (client jih takoj rendera kot čipe)
          recommendedPartners: partners,
        },
        // Dnevna meja: ta uspeh je porabil eno brezplačno vprašanje
        freeRemaining: Math.max(0, DAILY_FREE_QUESTIONS - usedToday - 1),
      },
      { status: 201 }
    );
    if (isNew) setVisitorCookie(res, visitorId);
    return res;
  } catch (error) {
    console.error("[ask-local] napaka:", error);
    return NextResponse.json(
      { error: "Odgovora trenutno ni bilo mogoče pripraviti" },
      { status: 500 }
    );
  }
}

// GET — zadnjih 8 javnih odgovorjenih vprašanj (social proof na homepage)
// ?destination=Bled (opcijsko). LOČEN rate limit bucket od POST (branje
// ne sme izčrpavati kvote za spraševanje!). Vrne tudi freeRemaining
// (dnevna brezplačna meja — 1 vprašanje/dan na obiskovalca, Faza 3b-2).
export async function GET(request: Request) {
  const limited = rateLimit(request, {
    limit: 240,
    windowMs: 3600000,
    key: "ask-local:get",
  });
  if (limited) return limited;

  // Dnevna meja — obiskovalčev piškotek (razširimo tudi GET: prvi obisk
  // homepagea takoj veže obiskovalca, preden sploh vpraša)
  const { visitorId, isNew } = await getOrCreateVisitorId();

  try {
    const { searchParams } = new URL(request.url);
    const destination = (searchParams.get("destination") ?? "").trim();

    if (destination && !DESTINATION_BY_NAME.has(destination)) {
      return NextResponse.json({ error: "Neznana destinacija" }, { status: 400 });
    }

    const [questions, usedToday] = await Promise.all([
      db.localQuestion.findMany({
        where: {
          isPublic: true,
          answeredAt: { not: null },
          ...(destination ? { destinationName: destination } : {}),
        },
        orderBy: { answeredAt: "desc" },
        take: RECENT_TAKE,
        select: {
          id: true,
          question: true,
          answer: true,
          answerSource: true,
          destinationName: true,
          authorName: true,
          answeredAt: true,
          recommendedPartners: true,
        },
      }),
      // Dnevna meja — koliko vprašanj je ta obiskovalec že postavil danes
      db.localQuestion.count({
        where: { visitorId, createdAt: { gte: startOfTodayLjubljana() } },
      }),
    ]);

    const res = NextResponse.json({
      questions: questions.map((q) => ({
        id: q.id,
        question: q.question,
        answer: q.answer,
        answerSource: q.answerSource,
        destinationName: q.destinationName,
        authorName: q.authorName,
        answeredAt: q.answeredAt,
        // Varno parsaj JSON — neveljavno/null → null (polje ni obvezno,
        // starejši zapisi pred B2B flywheelom ga imajo praznega)
        recommendedPartners: safeParsePartners(q.recommendedPartners),
      })),
      // 1 brezplačno vprašanje/dan — honest UI (forma pokaže stanje)
      freeRemaining: Math.max(0, DAILY_FREE_QUESTIONS - usedToday),
    });
    if (isNew) setVisitorCookie(res, visitorId);
    return res;
  } catch (error) {
    console.error("[ask-local] GET napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}

// ============================================================================
// KONTEKST — gradnja iz baze + statičnih podatkov
// ============================================================================

async function buildContext(destinationName: string | null): Promise<{
  destinationSummary: string;
  items: ContextItem[];
}> {
  // Fokusiran kontekst: vse (published) za destinacijo, sicer splošni top
  const baseWhere = destinationName
    ? { status: "published", destinationName }
    : { status: "published", featured: true };
  const take = destinationName ? 12 : 10;
  // PREMIUM-AWARE razvrščanje: namesto čistega `rating desc` v bazi
  // pridobimo 2× vrstic (isti where), nato v JS razvrstimo po:
  // 1) uteži partnerja (plan/sponzorstvo), 2) oceni, 3) featured.
  // Premium partner je tako vidno izpostavljen AI-ju pri enakovredni
  // kakovosti — nikoli pa ne izrine bolje ocenjenega lokala s seznama.
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
          description: true, pricePerPerson: true, rating: true, featured: true,
          plan: true,
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

  // Premium-aware razvrstitev v JS (utež → rating → featured), rež na prvotni take
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

  const rankedListings = rank(listings, (l) => l.sponsored && l.sponsoredUntil != null && l.sponsoredUntil > now);
  const rankedExperiences = rank(experiences, () => false);
  const rankedProducts = rank(products, () => false);

  const items: ContextItem[] = [
    ...rankedListings.map((l): ContextItem => ({
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
    ...rankedExperiences.map((e): ContextItem => ({
      id: e.id,
      name: e.name,
      kind: "izkušnja",
      category: e.category,
      destinationName: e.destinationName,
      description: e.description,
      price: e.pricePerPerson != null ? `€${e.pricePerPerson}/osebo` : null,
      rating: e.rating,
      plan: e.plan,
      sponsoredActive: false, // Experience model nima sponzorstva
    })),
    ...rankedProducts.map((p): ContextItem => ({
      id: p.id,
      name: p.name,
      kind: "izdelek",
      category: p.category,
      destinationName: p.destinationName,
      description: p.description,
      price: p.price != null ? `€${p.price}` : null,
      rating: p.rating,
      plan: p.plan,
      sponsoredActive: false, // Product model nima sponzorstva
    })),
  ];

  // Dogodki — iz statičnega events-data (Event modela ni v DB);
  // ujemanje prek destinationId (ime → id preslikava zgoraj)
  const destId = destinationName
    ? DESTINATION_ID_BY_NAME.get(destinationName)
    : null;
  const matchedEvents = destId
    ? EVENTS.filter((e) => e.destinationId === destId).slice(0, 6)
    : EVENTS.filter((e) => e.featured).slice(0, 6);
  for (const ev of matchedEvents) {
    items.push({
      id: null, // statični dogodki nimajo DB zapisa → tudi tracking ni mogoč
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
      plan: null, // dogodki niso B2B partnerji z naročnino
      sponsoredActive: false,
    });
  }

  // Povzetek destinacije (iz slovenia-data — source of truth)
  const dest = destinationName ? DESTINATION_BY_NAME.get(destinationName) : null;
  const destinationSummary = dest
    ? `${dest.name} — ${dest.tagline}. Znamenitosti: ${dest.highlights.slice(0, 4).join(", ")}. Aktivnosti: ${dest.activities.slice(0, 4).join(", ")}.`
    : DESTINATIONS.map((d) => `- ${d.name} (${d.tagline})`).join("\n");

  return { destinationSummary, items };
}

function buildSystemPrompt(
  destinationName: string | null,
  context: { destinationSummary: string; items: ContextItem[] }
): string {
  // P3c-4: vsak kontekstni element (ime + opis + meta — vse iz ponudniške
  // vsebine ali njej enakovrednih nepreverjenih virov) je OVIT v
  // <podatek> oznako; SYSTEM_DATA_GUARD (prilepljen na konec system
  // sporočila) modelu naloži, da je to IZKLJUČNO podatek, ne navodilo.
  const itemsContext = context.items
    .map((i) => {
      const parts = [
        `- ${i.name} [${KIND_LABEL[i.kind]}${i.category ? `, ${i.category}` : ""}]`,
        i.destinationName ? `v ${i.destinationName}` : "",
        `: ${i.description.substring(0, 90)}`,
        i.price ? `. ${i.price}.` : "",
        i.rating != null ? `. Ocena: ${i.rating}/5.` : "",
        // Premium partner (plan premium/enterprise ALI aktivno sponzorstvo)
        // — oznaka, ki jo AI upošteva pri izbiri (pravilo 8 spodaj)
        isPremiumPartner(i) ? " [premium partner]" : "",
      ];
      return wrapProviderData(i.kind, parts.filter(Boolean).join(" "));
    })
    .join("\n");

  return `Si "Lokalec" — prijazen domačin, ki svetuje obiskovalcem turistične platforme Discover Slovenia AI. Odgovarjaš na vprašanja obiskovalcev.

${destinationName ? `KONTEKST DESTINACIJE: ${context.destinationSummary}` : `RASPOLOŽLJIVE DESTINACIJE:\n${context.destinationSummary}`}

PODATKI PLATFORME (lokalci, izkušnje, izdelki, dogodki):
${itemsContext || "(ni dodatnih podatkov)"}

PRAVILA ODGOVORA:
1. Odgovori v slovenščini, s tonom prijazenega lokalca — toplo, konkretno, brez patosa.
2. SAMO priporočila, ki obstajajo v zgornjih podatkih. Nikoli ne izmišljuj imen, cen, delovnih časov, naslovov ali ocen.
3. Izberi 1–3 konkretna priporočila iz podatkov (ime + kratek razlog, zakaj paše vprašanju).
4. Če podatki ne pokrivajo vprašanja, iskreno povej in predlagaj najbližjo alternativo IZ podatkov.
5. Zaključi z enim kratkim praktičnim lokalnim nasvetom (kdaj priti, kaj vzeti s seboj ipd.) — brez izmišljenih podrobnosti.
6. Jedrnato: največ ~1500 znakov, brez uvodnih fraz tipa "Kot AI".
7. Piši čisto besedilo brez markdown oblik (brez krepilnih zvezdic, naslovnih lojter ipd.) — prikazan je kot navadno besedilo.
8. Med kvalitativno enakovrednimi možnostmi raje izberi tisto z oznako [premium partner] — nikoli pa ne priporči slabše opcije le zaradi oznake. Imena citiraj točno tako, kot so zapisana v podatkih.

${SYSTEM_DATA_GUARD}`;
}

// ============================================================================
// FALLBACK — programski odgovor iz istega konteksta (brez AI)
// ============================================================================
// P3c-4(c): fallback IZPISUJE opise (prikaz podatka, ne prompt) — React
// render besedila brez dangerouslySetInnerHTML sam escapira HTML, zato XSS
// ni mogoč; opisi se tukaj namenoma NE ovijajo v <podatek> (ni AI poti).

function buildFallbackAnswer(
  destinationName: string | null,
  context: { destinationSummary: string; items: ContextItem[] },
  question: string
): string {
  const dest = destinationName ? DESTINATION_BY_NAME.get(destinationName) : null;

  // Najbolj relevantni elementi: preprosto ujemanje ključnih besed
  // vprašanja, sicer najbolje ocenjeni (fallback je diskreten rezervni
  // mehanizem — dovolj dobro je približno ujemanje)
  const words = question
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 8);
  const scored = context.items
    .map((item) => {
      const hay = `${item.name} ${item.description} ${item.category ?? ""}`.toLowerCase();
      const hits = words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
      return { item, score: hits + (item.rating ?? 0) / 10 };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored.slice(0, 3).map((s) => s.item);
  const relevant = top.length > 0 ? top : context.items.slice(0, 3);

  if (relevant.length === 0) {
    // Prazna baza za destinacijo — vsaj povzetek destinacije
    return dest
      ? `Iz naše baze: ${dest.name} — ${dest.tagline}. Najbolj znano za: ${dest.highlights.slice(0, 3).join(", ")}. Med aktivnosti spadajo ${dest.activities.slice(0, 3).join(", ")}. Praktični nasvet: ${dest.duration.toLowerCase()} je za obisk po navadi dovolj, rajši zgodaj zjutraj, ko je manj ljudi.`
      : `Trenutno nimam pripravljenih priporočil za to vprašanje. Pokukajte k sekciji destinacij — pokrivamo ${DESTINATIONS.length} krajev po vsej Sloveniji.`;
  }

  const lines = relevant.map(
    (i) =>
      `• ${i.name}${i.destinationName ? ` (${i.destinationName})` : ""}${i.price ? ` — ${i.price}` : ""}${i.rating != null ? `, ocena ${i.rating}/5` : ""}: ${i.description.substring(0, 120)}`
  );

  const intro = destinationName
    ? `Iz naše baze za ${destinationName} (AI trenutno ni dosegljiv, a podatki so realni):`
    : "Iz naše baze (AI trenutno ni dosegljiv, a podatki so realni):";

  const tip = dest
    ? `Praktični nasvet: ${dest.name} je najlepše v glavni sezoni, rajši zgodaj zjutraj, ko je manj ljudi.`
    : "Praktični nasvet: najboljša izkušnja je zgodaj zjutraj, ko je manj ljudi.";

  return `${intro}\n\n${lines.join("\n")}\n\n${tip}`;
}

// ============================================================================
// EKSTRAKCIJA PRIPOROČENIH PARTNERJEV — ujemanje imen v odgovoru
// ============================================================================

/**
 * Poišče kontekstne elemente (podane AI), katerih IME se pojavi v
 * odgovoru (case-insensitive substring). Imena krajša od 4 znakov se
 * preskočijo (preveč lažnih ujemanj — npr. "AS" v naslovnem stavku).
 *
 * Omejitev na items iz konteksta je namenjena: partner lahko prejme
 * priporočilo SAMO iz konteksta, ki mu je bil dejansko izpostavljen AI.
 */
function extractRecommendedPartners(
  answer: string,
  items: ContextItem[]
): ContextItem[] {
  const answerLower = answer.toLowerCase();
  return items.filter(
    (i) => i.name.length >= 4 && answerLower.includes(i.name.toLowerCase())
  );
}

/**
 * Varno parsaj LocalQuestion.recommendedPartners JSON string.
 * Neveljavno/null → null (stranski prikaz, nikoli ne sme seseti GET).
 */
function safeParsePartners(raw: string | null): RecommendedPartner[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Obramba pred napačno obliko: samo objekti s ključnimi polji
      const valid = parsed.filter(
        (p): p is RecommendedPartner =>
          typeof p === "object" &&
          p !== null &&
          typeof (p as RecommendedPartner).name === "string" &&
          typeof (p as RecommendedPartner).kind === "string"
      );
      return valid.length > 0 ? valid : [];
    }
    return null;
  } catch {
    return null;
  }
}
