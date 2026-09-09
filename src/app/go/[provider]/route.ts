import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { DESTINATIONS } from "@/lib/slovenia-data";
import {
  getBookingUrl,
  getDiscoverCarsUrl,
  getGetYourGuideUrl,
  getSkyscannerUrl,
  getWorldNomadsUrl,
} from "@/lib/affiliate";

// GET /go/[provider]?dest=<destinacija>&days=<1-30>
//
// ZAKAJ /go/ (centralni affiliate redirect):
// 1. MERJENJE — vsak klik na partnerja (Booking, DiscoverCars, GetYourGuide,
//    Skyscanner, World Nomads) se strežniško zapiše v AnalyticsEvent
//    (type "affiliate_click") in PageView (funnelStep "affiliate_click"),
//    torej šteje v funnel statistiko — brez client-side JS in brez adblockerjev.
// 2. CENTRALNA ZAMENJAVA ID-jev — affiliate partner ID-ji živijo v env
//    spremenljivkah (affiliate.ts); zamenjava partnerja/dogovora zahteva
//    spremembo na ENEM mestu, ne na 322 SEO straneh.
// 3. ČISTI SEO — vsebina strani vsebuje interni /go/ href; partner URL
//    (parameter "aid" idr.) se generira ob redirectu.
//
// Tracking NIKOLI ne blokira redirecta (try/catch) — obiskovalca vedno
// pošljemo naprej k partnerju, tudi če zapis v DB pade.

const PROVIDERS = ["hotels", "cars", "activities", "flights", "insurance"] as const;
type Provider = (typeof PROVIDERS)[number];

// Providerji, ki potrebujejo destinacijo za smiseln partner URL
const DEST_REQUIRED: readonly Provider[] = ["hotels", "cars", "activities", "flights"];

/** Normalizacija dest: ujemanje po slugu ALI imenu (case-insensitive) → kanonično ime iz slovenia-data (lepši URL-ji pri Booking/GetYourGuide), sicer raw trim. */
function normalizeDest(raw: string): string {
  const trimmed = raw.trim();
  const needle = trimmed.toLowerCase();
  const match = DESTINATIONS.find(
    (d) => d.slug.toLowerCase() === needle || d.name.toLowerCase() === needle,
  );
  return match ? match.name : trimmed;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;

  // Neveljaven provider → 404 (povezave se generirajo interno, torej je to napaka na naši strani)
  if (!PROVIDERS.includes(provider as Provider)) {
    return NextResponse.json(
      { error: `Neznan ponudnik: ${provider}` },
      { status: 404 },
    );
  }

  const { searchParams } = new URL(request.url);
  const rawDest = searchParams.get("dest") || "";

  // dest: 1–100 znakov po trimu; obvezen za hotels/cars/activities/flights
  // (interni linki vedno vsebujejo dest — 400 je pošten odgovor za hrošče v generatorju)
  if (DEST_REQUIRED.includes(provider as Provider)) {
    if (!rawDest.trim()) {
      return NextResponse.json({ error: "Manjka parameter 'dest'" }, { status: 400 });
    }
  }
  if (rawDest.length > 100) {
    return NextResponse.json({ error: "Parameter 'dest' je predolg (max 100)" }, { status: 400 });
  }
  const dest = normalizeDest(rawDest);

  // days: 1–30, default 7 — samo za insurance (World Nomads)
  let days = 7;
  if (provider === "insurance") {
    const rawDays = searchParams.get("days");
    if (rawDays !== null) {
      const parsed = Number.parseInt(rawDays, 10);
      if (Number.isNaN(parsed) || parsed < 1 || parsed > 30) {
        return NextResponse.json({ error: "Parameter 'days' mora biti 1–30" }, { status: 400 });
      }
      days = parsed;
    }
  }

  // === Tracking (NE blokira redirecta) ===
  // Rate limit varuje samo DB zapis — preusmeritev vedno poteče.
  const limited = rateLimit(request, { limit: 60, windowMs: 60000, key: "go-track" });
  if (!limited) {
    try {
      await db.analyticsEvent.create({
        data: {
          type: "affiliate_click",
          metadata: JSON.stringify({
            provider,
            dest: dest || null,
            days: provider === "insurance" ? days : null,
            path: request.headers.get("referer") || null,
            ua: (request.headers.get("user-agent") || "").slice(0, 200) || null,
          }),
        },
      });
      // Funnel zapis — ENAK vzorec kot /api/track-funnel (PageView s funnelStep),
      // da GET funnel statistika šteje VSE affiliate klike strežniško.
      await db.pageView.create({
        data: {
          path: `/go/${provider}`,
          funnelStep: "affiliate_click",
        },
      });
    } catch (error) {
      console.error("[go] tracking napaka (redirect se nadaljuje):", error);
    }
  }

  // === Redirect na partnerja ===
  let url: string;
  switch (provider as Provider) {
    case "hotels":
      url = getBookingUrl(dest);
      break;
    case "cars":
      url = getDiscoverCarsUrl(dest);
      break;
    case "activities":
      url = getGetYourGuideUrl(dest);
      break;
    case "flights":
      url = getSkyscannerUrl(dest);
      break;
    case "insurance":
      url = getWorldNomadsUrl(days);
      break;
  }

  return NextResponse.redirect(url, 302);
}
