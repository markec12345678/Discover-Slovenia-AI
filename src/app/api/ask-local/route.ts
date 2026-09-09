import { NextResponse } from "next/server";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { EVENTS } from "@/lib/events-data";
import { db } from "@/lib/db";
import { generateCompletion } from "@/lib/ai-client";
import { rateLimit } from "@/lib/rate-limit";

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
// GET ?destination=Bled → zadnjih 8 javnih odgovorjenih vprašanj.

// === MEJE (zrcalijo client validacijo v ask-local.tsx) ===
const QUESTION_MIN = 10;
const QUESTION_MAX = 500;
const AUTHOR_MIN = 2;
const AUTHOR_MAX = 40;

/** Koliko zadnjih javnih vprašanj vrne GET. */
const RECENT_TAKE = 8;

interface AskLocalRequest {
  question?: string;
  destinationName?: string;
  authorName?: string;
}

/** Kontekstni element — izluščen iz baze (oz. statičnih podatkov za dogodke). */
interface ContextItem {
  name: string;
  kind: "lokal" | "izkušnja" | "izdelek" | "dogodek";
  category: string | null;
  destinationName: string | null;
  description: string;
  /** Cena v človeku berljivi obliki (npr. "€45/osebo" ali "Cenovni razred €€"). */
  price: string | null;
  rating: number | null;
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
      },
    });

    return NextResponse.json(
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
        },
      },
      { status: 201 }
    );
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
// ne sme izčrpavati kvote za spraševanje!).
export async function GET(request: Request) {
  const limited = rateLimit(request, {
    limit: 240,
    windowMs: 3600000,
    key: "ask-local:get",
  });
  if (limited) return limited;

  try {
    const { searchParams } = new URL(request.url);
    const destination = (searchParams.get("destination") ?? "").trim();

    if (destination && !DESTINATION_BY_NAME.has(destination)) {
      return NextResponse.json({ error: "Neznana destinacija" }, { status: 400 });
    }

    const questions = await db.localQuestion.findMany({
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
      },
    });

    return NextResponse.json({ questions });
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

  const [listings, experiences, products] = await Promise.all([
    db.listing
      .findMany({
        where: baseWhere,
        take,
        select: {
          name: true, category: true, destinationName: true,
          description: true, rating: true, priceRange: true,
        },
        orderBy: { rating: "desc" },
      })
      .catch(() => []),
    db.experience
      .findMany({
        where: baseWhere,
        take,
        select: {
          name: true, category: true, destinationName: true,
          description: true, pricePerPerson: true, rating: true,
        },
        orderBy: { rating: "desc" },
      })
      .catch(() => []),
    db.product
      .findMany({
        where: baseWhere,
        take,
        select: {
          name: true, category: true, destinationName: true,
          description: true, price: true, rating: true,
        },
        orderBy: { rating: "desc" },
      })
      .catch(() => []),
  ]);

  const items: ContextItem[] = [
    ...listings.map((l): ContextItem => ({
      name: l.name,
      kind: "lokal",
      category: l.category,
      destinationName: l.destinationName,
      description: l.description,
      price: l.priceRange ? `Cenovni razred ${l.priceRange}` : null,
      rating: l.rating,
    })),
    ...experiences.map((e): ContextItem => ({
      name: e.name,
      kind: "izkušnja",
      category: e.category,
      destinationName: e.destinationName,
      description: e.description,
      price: e.pricePerPerson != null ? `€${e.pricePerPerson}/osebo` : null,
      rating: e.rating,
    })),
    ...products.map((p): ContextItem => ({
      name: p.name,
      kind: "izdelek",
      category: p.category,
      destinationName: p.destinationName,
      description: p.description,
      price: p.price != null ? `€${p.price}` : null,
      rating: p.rating,
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
  const itemsContext = context.items
    .map((i) => {
      const parts = [
        `- ${i.name} [${KIND_LABEL[i.kind]}${i.category ? `, ${i.category}` : ""}]`,
        i.destinationName ? `v ${i.destinationName}` : "",
        `: ${i.description.substring(0, 90)}`,
        i.price ? `. ${i.price}.` : "",
        i.rating != null ? `. Ocena: ${i.rating}/5.` : "",
      ];
      return parts.filter(Boolean).join(" ");
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
7. Piši čisto besedilo brez markdown oblik (brez krepilnih zvezdic, naslovnih lojter ipd.) — prikazan je kot navadno besedilo.`;
}

// ============================================================================
// FALLBACK — programski odgovor iz istega konteksta (brez AI)
// ============================================================================

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
