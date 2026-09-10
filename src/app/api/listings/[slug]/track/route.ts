import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// POST /api/listings/[slug]/track — track impression/click/ai_recommendation/lead
//
// P3c-7: dvojni varovalki pred napihnjenimi števci (B2B analitika):
//   1. Rate limit — 30 klicev/minuto na IP (skupen bucket "listing-track"
//      za VSE lokale; enak vzorec kot ostale javne rute).
//   2. Dedup — enak (IP, listing, type) dogodek se prišteje SAMO enkrat
//      v 5-minutnem oknu; ponovitve vrnejo 200 { deduplicated: true }
//      BREZ inkrementa in BREZ ListingEvent zapisa.
//
// POZNANA OMEJITEV (iskreno): dedup Map je IN-MEMORY in PER-INSTANCA —
// na Vercelu (multi-instance serverless) je efektivna meja višja
// (vsaka instanca ima svoj Map). Enaka omejitev velja že za rate-limit.ts.
// Za rigorozno deduplikacijo bi potrebovali deljeni store (npr. Upstash).

/** Okno deduplikacije — isti (IP, listing, type) se prišteje 1× na 5 min. */
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

/** Mehki cap na velikost Map-a — ob prekoračitvi počistimo potekle vnose. */
const DEDUP_MAX_ENTRIES = 1000;

/** Zadnji viden timestamp po ključu `${ip}:${listingId}:${type}`. */
const dedupSeen = new Map<string, number>();

/**
 * Ali je ta (ip, listingId, type) kombinacija bila ravno že zapriseta?
 * Ob vsakem klicu tudi periodično počisti potekle vnose (ko Map preseže
 * cap), da spomin ne raste neomejeno dolgo časa.
 */
function isDuplicateEvent(key: string): boolean {
  const now = Date.now();
  if (dedupSeen.size > DEDUP_MAX_ENTRIES) {
    for (const [k, ts] of dedupSeen) {
      if (now - ts >= DEDUP_WINDOW_MS) dedupSeen.delete(k);
    }
  }
  const last = dedupSeen.get(key);
  if (last !== undefined && now - last < DEDUP_WINDOW_MS) {
    return true;
  }
  dedupSeen.set(key, now);
  return false;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    // 1) Rate limit (30/min na IP) — pred vsem ostalim
    const limited = rateLimit(request, {
      limit: 30,
      windowMs: 60_000,
      key: "listing-track",
    });
    if (limited) return limited;

    const { slug } = await params;
    const body = await request.json();
    const { type, source } = body; // type: impression | click | ai_recommendation | lead

    if (!type || !["impression", "click", "ai_recommendation", "lead"].includes(type)) {
      return NextResponse.json({ error: "Neveljaven tip eventa" }, { status: 400 });
    }

    const listing = await db.listing.findUnique({ where: { slug }, select: { id: true } });
    if (!listing) {
      return NextResponse.json({ error: "Lokal ni najden" }, { status: 404 });
    }

    // 2) Dedup — 5-minutno okno na (IP, listing, type); ponovitev NE
    //    piše ničesar v DB (ne ListingEvent, ne števca) in vljudno odgovori 200.
    const dedupKey = `${getClientIp(request)}:${listing.id}:${type}`;
    if (isDuplicateEvent(dedupKey)) {
      return NextResponse.json({ success: true, deduplicated: true });
    }

    // Ustvari event
    await db.listingEvent.create({
      data: {
        listingId: listing.id,
        type,
        source: source || null,
      },
    });

    // Posodobi števce na listing-u (za hitre poizvedbe)
    if (type === "impression") {
      await db.listing.update({ where: { id: listing.id }, data: { viewCount: { increment: 1 } } });
    } else if (type === "click") {
      await db.listing.update({ where: { id: listing.id }, data: { clickCount: { increment: 1 } } });
    } else if (type === "ai_recommendation") {
      await db.listing.update({ where: { id: listing.id }, data: { aiRecommendations: { increment: 1 } } });
    } else if (type === "lead") {
      await db.listing.update({ where: { id: listing.id }, data: { leadCount: { increment: 1 } } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[track] napaka:", error);
    return NextResponse.json({ error: "Napaka pri tracking" }, { status: 500 });
  }
}
