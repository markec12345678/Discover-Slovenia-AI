"use client";

import React from "react";
import { Loader2, MousePointerClick, CircleDollarSign, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Affiliate monetizacijski panel (FAZA 15) — v admin Statistika zavihu.
//
// KAŽE SAMO DOKAZLJIVO:
// - število outbound klikov (affiliate_click, strežniško štetje iz /go/)
// - konfiguriranost partnerja (fail-closed env status)
// - ločitev monetized klikov (dejansko sledeni) od vseh klikov
// Rezervacije/provizije partnerjev NE Obstajajo v našem sistemu →
// izrecno "UNKNOWN" (partner poročila še niso priključena).

interface AffiliatePartnerRow {
  provider: string;
  configured: boolean;
  envVar: string;
  clicks30d: number;
  monetizedClicks30d: number;
  bookings: string;
  commissions: string;
}

interface AffiliateStats {
  window: string;
  totals: { clicks: number };
  partners: AffiliatePartnerRow[];
  topDestinations: Record<string, number>;
}

const PROVIDER_LABELS_SI: Record<string, string> = {
  hotels: "Booking.com (hoteli)",
  cars: "DiscoverCars (najem)",
  activities: "GetYourGuide (izkušnje)",
  flights: "Skyscanner (leti)",
  insurance: "World Nomads / SafetyWing (zavarovanje)",
  esim: "Airalo (eSIM)",
  transfers: "Kiwitaxi (transferji)",
  transport: "Omio (vlaki/avtobusi)",
  tickets: "Tiqets (vstopnice)",
  viator: "Viator (vodeni izleti)",
};

export function AffiliateStatsPanel({ adminPassword }: { adminPassword: string }) {
  const [stats, setStats] = React.useState<AffiliateStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/affiliate-stats", {
          headers: { "x-admin-password": adminPassword },
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as AffiliateStats;
        if (!cancelled) setStats(data);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminPassword]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Nalaganje affiliate statistike...
        </CardContent>
      </Card>
    );
  }

  if (error || !stats) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-muted-foreground">
          <ShieldAlert className="size-4" />
          Affiliate statistika trenutno ni dosegljiva.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CircleDollarSign className="size-4" />
          Affiliate monetizacija
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Outbound kliki ({stats.window}) po partnerjih. Rezervacije in provizije
          se odkljukajo v partnerjevih poročilih (affiliate panel / Impact / CJ) —
          dokler niso priključena, so nepoznane (UNKNOWN).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <MousePointerClick className="size-4 text-primary" />
          <span className="text-2xl font-bold tabular-nums">
            {stats.totals.clicks}
          </span>
          <span className="text-sm text-muted-foreground">
            klikov na partnerje ({stats.window})
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-2 font-medium">Partner</th>
                <th className="py-2 pr-2 font-medium">Status</th>
                <th className="py-2 pr-2 text-right font-medium">Kliki {stats.window}</th>
                <th className="py-2 text-right font-medium">Od tega sledeni</th>
              </tr>
            </thead>
            <tbody>
              {stats.partners.map((p) => (
                <tr key={p.provider} className="border-b last:border-0">
                  <td className="py-2 pr-2">
                    {PROVIDER_LABELS_SI[p.provider] ?? p.provider}
                  </td>
                  <td className="py-2 pr-2">
                    {p.configured ? (
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                        konfiguriran
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="gap-1 border-amber-300 text-amber-700"
                        title={`Nastavite ${p.envVar} v produkcijskem okolju`}
                      >
                        ni konfiguriran
                      </Badge>
                    )}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {p.clicks30d}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {p.monetizedClicks30d}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {Object.keys(stats.topDestinations).length > 0 && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Najpogostejše destinacije:</span>{" "}
            {Object.entries(stats.topDestinations)
              .slice(0, 5)
              .map(([d, n]) => `${d} (${n})`)
              .join(", ")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
