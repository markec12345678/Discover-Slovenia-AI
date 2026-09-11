import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import {
  AFFILIATE_PROVIDERS,
  type AffiliateProvider,
  affiliateStatus,
  buildPartnerUrl,
  canonicalDest,
  isKnownDest,
} from "@/lib/affiliate";

// GET /go/[provider]?dest=<destinacija>&days=<1-30>
//
// CENTRALNI AFFILIATE REDIRECT (FAZA 4, affiliate hardening 2026-09):
//
//   GET /go/cars?dest=Ljubljana
//        |
//        v
//   validacija providerja (allowlist) + dest (whitelist → kanonična /
//   fallback "Slovenija" — NIKOLI raw vnos v partner URL)
//        |
//        v
//   resolve partnerja (env konfiguracija, fail-closed — brez fake ID-jev)
//        |
//        v
//   zapis outbound klika (affiliate_click; monetized: true/false)
//        |
//        v
//   302 redirect na partnerjev HTTPS URL iz dovoljenega hosta
//
// VARNOST:
// - Partner URL se IZKLJUČNO sestavlja strežniško (buildPartnerUrl) —
//   vhodni parametri nikoli ne morejo vpeljati svojega hosta/poti
//   (open redirect, SSRF, path traversal, header injection onemogočeni
//   po konstrukciji; dest gre skozi canonicalDest whitelist).
// - Ni parametra, ki bi preglasil partnerja ali podal poljuben URL.
//
// TRACKING (FAZA 6) — zapis NE blokira redirecta (try/catch):
// - AnalyticsEvent "affiliate_click" z metapodatki: provider, dest (kanonična),
//   monetized (ali je partner dejansko konfiguriran), days, referer POT
//   (brez query niza) — BREZ osebnih podatkov (brez IP, email, UA).
// - PageView (funnelStep "affiliate_click") — enak vzorec kot prej.
//
// FAZA 7 (sub-ID): partnerji, ki podpirajo dodatne tracking parametre
// (npr. Skyscanner utm_term), jih prejmemo iz env konfiguracije partnerja —
// v povezave NE vlagamo nič PII (le neosebne vrednosti "discoverslovenia").

const PROVIDERS = AFFILIATE_PROVIDERS;
type Provider = AffiliateProvider;

// Providerji, ki potrebujejo destinacijo za smiseln partner URL
const DEST_REQUIRED: readonly Provider[] = ["hotels", "cars", "activities", "flights"];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;

  // Neveljaven provider → 404 (allowlist — povezave se generirajo interno)
  if (!PROVIDERS.includes(provider as Provider)) {
    return NextResponse.json(
      { error: `Neznan ponudnik: ${provider}` },
      { status: 404 },
    );
  }

  const { searchParams } = new URL(request.url);
  const rawDest = searchParams.get("dest") || "";

  // dest: 1–100 znakov po trimu; obvezen za hotels/cars/activities/flights
  if (DEST_REQUIRED.includes(provider as Provider)) {
    if (!rawDest.trim()) {
      return NextResponse.json({ error: "Manjka parameter 'dest'" }, { status: 400 });
    }
  }
  if (rawDest.length > 100) {
    return NextResponse.json({ error: "Parameter 'dest' je predolg (max 100)" }, { status: 400 });
  }

  // FAZA 5: whitelist — neznan dest → kanonski fallback "Slovenija",
  // NIKOLI raw vnos v partnerjev URL (src/lib/affiliate.ts canonicalDest).
  const dest = canonicalDest(rawDest);
  const knownDest = isKnownDest(rawDest);

  // days: 1–30, default 7 — samo za insurance (kompatibilnost; CJ URL
  // World Nomads povezave days ne potrebuje več)
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

  // === Tracking (NE blokira redirecta; brez PII) ===
  // Rate limit varuje samo DB zapis — preusmeritev vedno poteče.
  const limited = rateLimit(request, { limit: 60, windowMs: 60000, key: "go-track" });
  if (!limited) {
    try {
      // Referer → samo POT (brez query niza, brez morebitnih žetonov v URL)
      let refPath: string | null = null;
      const referer = request.headers.get("referer");
      if (referer) {
        try {
          refPath = new URL(referer).pathname.slice(0, 200);
        } catch {
          refPath = null;
        }
      }
      await db.analyticsEvent.create({
        data: {
          type: "affiliate_click",
          metadata: JSON.stringify({
            provider,
            dest: dest || null,
            knownDest,
            monetized: affiliateStatus()[provider as Provider].configured,
            days: provider === "insurance" ? days : null,
            refPath,
          }),
        },
      });
      // Funnel zapis — ENAK vzorec kot /api/track-funnel (PageView s
      // funnelStep), da funnel statistika šteje VSE affiliate klike.
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

  // === Redirect na partnerja (fail-closed, allowlist hostov po partnerju) ===
  const { url, monetized } = buildPartnerUrl(
    provider as Provider,
    dest,
    provider === "insurance" ? days : undefined,
  );

  // Zadnja varovalka: izhod mora biti https in dovoljen partnerjev host —
  // sicer ne preusmerimo (notranja napaka konfiguracije, ne odjemalčeva).
  let out: URL;
  try {
    out = new URL(url);
  } catch {
    return NextResponse.json(
      { error: "Napaka konfiguracije affiliate povezave" },
      { status: 500 },
    );
  }
  const ALLOWED_HOSTS: Record<Provider, string[]> = {
    hotels: ["www.booking.com", "booking.com"],
    cars: ["www.discovercars.com", "discovercars.com"],
    activities: ["www.getyourguide.com", "getyourguide.com"],
    flights: ["www.skyscanner.net", "skyscanner.net"],
    // World Nomads program teče na CJ — dovolimo njihove redirect domene
    insurance: [
      "www.worldnomads.com",
      "worldnomads.com",
      "www.dpbolvw.net",
      "dpbolvw.net",
      "www.anrdoezrs.net",
      "anrdoezrs.net",
      "www.jdoqocy.com",
      "jdoqocy.com",
      "www.tkqlhce.com",
      "tkqlhce.com",
      "www.kqzyfj.com",
      "kqzyfj.com",
    ],
  };
  if (out.protocol !== "https:" || !ALLOWED_HOSTS[provider as Provider].includes(out.hostname)) {
    return NextResponse.json(
      { error: "Napaka konfiguracije affiliate povezave" },
      { status: 500 },
    );
  }

  const res = NextResponse.redirect(out.toString(), 302);
  // monetized v glavi NI (ne razkrivamo poslovne konfiguracije javno);
  // vidna je samo v interni analitiki.
  return res;
}
