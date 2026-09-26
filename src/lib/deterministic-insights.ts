// ============================================================================
// DETERMINISTIČNI MOTOR VPOGLEDOV (Issue #9 §15 — ZERO-AI)
// ============================================================================
//
// Poslovni vpogledi za admin/owner dashboard so IZRAČUNANI iz statistike
// baze (stopnje, pragovi, trendi) — 0 AI, 0 omrežja, enak izračun za
// enako statistiko. Izvoženo iz rute v lib (ena resnica, Issue #9 §25/§27;
// route handlerji v Next.js smejo izvažati SAMO HTTP metode).
//
// Admin: churn > 5 % → anomalija; freeOwners > 70 % → priložnost;
//        totalListings < 30 → priporočilo; MRR trend; top kategorija;
//        CTR (ogledi → kliki) stavek.
// Owner: free paket → upsell priporočilo; CTR < 5 % @ ogledi > 100 →
//        anomalija; trend lokalov/ogledov/klikov; top kategorija.
// ============================================================================

export interface Insight {
  type: "trend" | "recommendation" | "anomaly" | "opportunity";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

export interface InsightsResponse {
  insights: Insight[];
  summary: string;
  source: "deterministic";
}

export interface StatsData {
  totalListings: number;
  totalOwners: number;
  premiumOwners: number;
  enterpriseOwners: number;
  freeOwners: number;
  mrr: number;
  churnRate: number;
  totalViews: number;
  totalClicks: number;
  totalAiRecs: number;
  leads7d: number;
  leads30d: number;
  topCategories: Array<{ category: string; count: number }>;
  topRegions: Array<{ region: string; count: number }>;
  type: "admin" | "owner";
  // Owner-specific
  ownerListings?: number;
  ownerViews?: number;
  ownerClicks?: number;
  ownerAiRecs?: number;
  ownerPlan?: string;
}


//
// Admin: churn > 5 % → anomalija; freeOwners > 70 % → priložnost;
//        totalListings < 30 → priporočilo; MRR trend; top kategorija;
//        CTR (ogledi → kliki) stavek.
// Owner: free paket → upsell priporočilo; CTR < 5 % @ ogledi > 100 →
//        anomalija; trend lokalov/ogledov/klikov; top kategorija.
// ============================================================================

function ctrSentence(views: number, clicks: number): string | null {
  if (views <= 0) return null;
  const ctr = Math.round((clicks / views) * 1000) / 10;
  return `CTR ${ctr} % (${clicks} klikov na ${views} ogledov).`;
}

export function generateDeterministicInsights(
  stats: StatsData,
  type: "admin" | "owner"
): InsightsResponse {
  const insights: Insight[] = [];

  if (type === "admin") {
    if (stats.churnRate > 5) {
      insights.push({
        type: "anomaly",
        title: "Visok churn rate",
        description: `Churn ${stats.churnRate} % je nad pragom 5 %. Predlagan pregled premium paketov.`,
        priority: "high",
      });
    }
    if (
      stats.totalOwners > 0 &&
      stats.freeOwners > stats.totalOwners * 0.7
    ) {
      insights.push({
        type: "opportunity",
        title: "Nizka konverzija v premium",
        description: `${Math.round((stats.freeOwners / stats.totalOwners) * 100)} % lastnikov je na free paketu. Ciljajte z upgrade kampanjo.`,
        priority: "medium",
      });
    }
    if (stats.totalListings < 30) {
      insights.push({
        type: "recommendation",
        title: "Rast baze lokalov",
        description: `${stats.totalListings} lokalov — dodajte še ${30 - stats.totalListings} do monetizacije.`,
        priority: "medium",
      });
    }

    // MRR trend (vedno — izračun iz realnih paketov) + izračunan CTR
    const ctr = ctrSentence(stats.totalViews, stats.totalClicks);
    insights.push({
      type: "trend",
      title: `MRR: €${stats.mrr}/mesec`,
      description: `Skupno ${stats.totalOwners} lastnikov (${stats.premiumOwners} premium, ${stats.enterpriseOwners} enterprise) generira €${stats.mrr} mesečnega prihodka.${ctr ? ` ${ctr}` : ""}`,
      priority: "low",
    });

    // Top kategorija — izračun iz agregatov baze
    const topCat = stats.topCategories[0];
    if (topCat && topCat.count > 0) {
      insights.push({
        type: "trend",
        title: `Top kategorija: ${topCat.category}`,
        description: `${topCat.category} ima ${topCat.count} lokalov — najmočnejša ponudba platforme.`,
        priority: "low",
      });
    }
  } else {
    // === Owner vpogledi ===
    if (stats.ownerPlan === "free") {
      insights.push({
        type: "recommendation",
        title: "Nadgradite na Premium",
        description: "Premium paket vključuje priporočila uporabnikom in 3× večjo vidljivost.",
        priority: "medium",
      });
    }
    if (
      (stats.ownerViews ?? 0) > 100 &&
      (stats.ownerClicks ?? 0) < (stats.ownerViews ?? 0) * 0.05
    ) {
      insights.push({
        type: "anomaly",
        title: "Nizka CTR konverzija",
        description: `${stats.ownerClicks} klikov iz ${stats.ownerViews} ogledov (CTR pod 5 %). Izboljšajte opis in slike.`,
        priority: "high",
      });
    }

    // Trend: lokal/ogledi/kliki + izračunan CTR
    const ctr = ctrSentence(stats.ownerViews ?? 0, stats.ownerClicks ?? 0);
    insights.push({
      type: "trend",
      title: `${stats.ownerListings ?? 0} lokalov aktivnih`,
      description: `Skupno ${stats.ownerViews ?? 0} ogledov in ${stats.ownerClicks ?? 0} klikov.${ctr ? ` ${ctr}` : ""}`,
      priority: "low",
    });

    // Top kategorija lastnika — izračun iz njegovih lokalov
    const topCat = stats.topCategories[0];
    if (topCat && topCat.count > 0) {
      insights.push({
        type: "trend",
        title: `Vaša najmočnejša kategorija: ${topCat.category}`,
        description: `${topCat.count} od ${stats.ownerListings ?? 0} lokalov je v kategoriji ${topCat.category}.`,
        priority: "low",
      });
    }
  }

  return {
    insights: insights.slice(0, 5),
    summary: `Vpogledi so izračunani iz statistike platforme (${insights.length} pravil).`,
    source: "deterministic",
  };
}
