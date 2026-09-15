import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin } from "@/lib/auth-guards";
import { rateLimit } from "@/lib/rate-limit";
import { affiliateStatus, AFFILIATE_PROVIDERS, type AffiliateProvider } from "@/lib/affiliate";

// GET /api/admin/affiliate-stats — monetizacijska nadzorna plošča (FAZA 15)
// Header: x-admin-password
//
// KAŽEMO SAMO DOKAZLJIVE METRIKE:
// - clicks (affiliate_click iz AnalyticsEvent — strežniško štetje iz /go/)
//   razbit po partnerju, destinaciji in dnevu (zadnjih 30 dni)
// - konfiguriranost partnerja (fail-closed status iz env)
//
// NAMERNO NE KAŽEMO:
// - "bookings" / "commission" / "revenue" — te vrednosti partnerji vračajo
//   SAMO prek svojih poročil (affiliate panel / Impact / CJ), ki jih nimamo
//   priključenih → v odgovoru so izrecno "UNKNOWN" in ne 0 (0 bi bila lažna
//   natančnost).
//
// PII: metapodatki klika vsebujejo le provider/dest/monetized/refPath —
// brez IP, email, UA (glej /go/[provider]/route.ts).

export async function GET(request: Request) {
  try {
    const limited = rateLimit(request, {
      limit: 30,
      windowMs: 10 * 60_000,
      key: "admin-affiliate-stats",
    });
    if (limited) return limited;

    if (!checkAdmin(request.headers.get("x-admin-password"))) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

    const status = affiliateStatus();

    // Vsi affiliate_kliki v zadnjih 30 dneh
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const events = await db.analyticsEvent.findMany({
      where: { type: "affiliate_click", createdAt: { gte: since } },
      select: { metadata: true, createdAt: true },
    });

    interface ClickMeta {
      provider?: string;
      dest?: string | null;
      monetized?: boolean;
    }

    // Združevanje po partnerju / dnevu / destinaciji
    const byPartner: Record<string, { clicks: number; monetizedClicks: number }> = {};
    const byDay: Record<string, number> = {};
    const byDest: Record<string, number> = {};

    for (const e of events) {
      let meta: ClickMeta = {};
      try {
        meta = JSON.parse(e.metadata) as ClickMeta;
      } catch {
        continue;
      }
      const provider = meta.provider ?? "unknown";
      byPartner[provider] ??= { clicks: 0, monetizedClicks: 0 };
      byPartner[provider].clicks += 1;
      if (meta.monetized) byPartner[provider].monetizedClicks += 1;

      const day = e.createdAt.toISOString().slice(0, 10);
      byDay[day] = (byDay[day] ?? 0) + 1;

      if (meta.dest) byDest[meta.dest] = (byDest[meta.dest] ?? 0) + 1;
    }

    const partners = AFFILIATE_PROVIDERS.map((p: AffiliateProvider) => ({
      provider: p,
      configured: status[p].configured,
      envVar: status[p].envVar,
      clicks30d: byPartner[p]?.clicks ?? 0,
      monetizedClicks30d: byPartner[p]?.monetizedClicks ?? 0,
      // Partner ne vrača podatkov prek našega sistema → izrecno UNKNOWN:
      bookings: "UNKNOWN",
      commissions: "UNKNOWN",
    }));

    return NextResponse.json({
      window: "30d",
      totals: {
        clicks: events.length,
        // ne prikazujemo skupnega "monetized rate" — odvisen od
        // konfiguriranosti, ki se spreminja z env
      },
      partners,
      byDay: Object.fromEntries(
        Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)),
      ),
      topDestinations: Object.fromEntries(
        Object.entries(byDest)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10),
      ),
    });
  } catch (error) {
    console.error("[admin/affiliate-stats] napaka:", error);
    return NextResponse.json(
      { error: "Notranja napaka strežnika" },
      { status: 500 },
    );
  }
}
