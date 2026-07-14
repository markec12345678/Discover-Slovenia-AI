import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAllSitemapUrls, normalizePath } from "@/lib/sitemap-urls";

// GET /api/admin/indexing — SEO indeksacijsko poročilo
// Header: x-admin-password
// Vrne:
//  - vseh 317 URL-jev iz sitemap (parse skupne logike)
//  - za vsak URL: view count iz PageView tabele
//  - top 20 strani po ogledih
//  - število strani z >0 ogledi (proxy za "Google je našel")
//  - število strani z 0 ogledi (nepoiskane)
//  - PageView tracking iz ListingEvent kjer type="impression" in source vsebuje URL path
export async function GET(request: Request) {
  try {
    const adminPassword = request.headers.get("x-admin-password");
    if (adminPassword !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Neavtorizirano" }, { status: 401 });
    }

    // 1. Pridobi vse URL-je iz sitemap helperja
    const allUrls = getAllSitemapUrls();

    // 2. Pridobi PageView števce po path (vsa pot normalizirana)
    const pageViewGroups = await db.pageView.groupBy({
      by: ["path"],
      _count: { _all: true },
    });

    // Map normalized path -> view count
    const viewCountByPath = new Map<string, number>();
    for (const g of pageViewGroups) {
      viewCountByPath.set(normalizePath(g.path), g._count._all);
    }

    // 3. ListingEvent impressions, kjer source vsebuje URL path
    const listingImpressionGroups = await db.listingEvent.groupBy({
      by: ["source"],
      _count: { _all: true },
      where: {
        type: "impression",
        source: { startsWith: "/" },
      },
    });
    const listingImpressionsByPath = new Map<string, number>();
    for (const g of listingImpressionGroups) {
      if (!g.source) continue;
      listingImpressionsByPath.set(normalizePath(g.source), g._count._all);
    }

    // 4. Združi po URL-jih
    const pages = allUrls.map((u) => {
      const normalizedPath = normalizePath(u.path);
      const views = viewCountByPath.get(normalizedPath) ?? 0;
      const listingImpressions =
        listingImpressionsByPath.get(normalizedPath) ?? 0;
      return {
        path: u.path,
        url: u.url,
        category: u.category,
        priority: u.priority,
        views,
        listingImpressions,
        // Skupni "ogledi" = PageView + ListingEvent impressions, ki se sklicujejo na ta path
        totalViews: views + listingImpressions,
        indexed: views > 0 || listingImpressions > 0,
      };
    });

    // 5. KPI-ji
    const totalUrls = pages.length;
    const indexedCount = pages.filter((p) => p.indexed).length;
    const notIndexedCount = totalUrls - indexedCount;
    const totalPageViews = pages.reduce((s, p) => s + p.totalViews, 0);

    // 6. Top 20 strani po ogledih
    const top20 = [...pages]
      .sort((a, b) => b.totalViews - a.totalViews)
      .slice(0, 20)
      .map((p) => ({
        path: p.path,
        url: p.url,
        category: p.category,
        views: p.totalViews,
        pageViews: p.views,
        listingImpressions: p.listingImpressions,
        percentage:
          totalPageViews > 0
            ? Math.round((p.totalViews / totalPageViews) * 1000) / 10
            : 0,
      }));

    // 7. Nepoiskane strani (0 ogledov) — za collapsible list
    const notIndexed = pages
      .filter((p) => !p.indexed)
      .sort((a, b) => b.priority - a.priority)
      .map((p) => ({
        path: p.path,
        url: p.url,
        category: p.category,
        priority: p.priority,
      }));

    // 8. Top stran (1.)
    const topPage = top20[0] ?? null;

    // 9. Kategorije — število po kategoriji in delež indeksiranih
    const categoryMap = new Map<
      string,
      { total: number; indexed: number; views: number }
    >();
    for (const p of pages) {
      const c = categoryMap.get(p.category) ?? {
        total: 0,
        indexed: 0,
        views: 0,
      };
      c.total += 1;
      if (p.indexed) c.indexed += 1;
      c.views += p.totalViews;
      categoryMap.set(p.category, c);
    }
    const byCategory = Array.from(categoryMap.entries())
      .map(([category, v]) => ({
        category,
        total: v.total,
        indexed: v.indexed,
        notIndexed: v.total - v.indexed,
        views: v.views,
        coverage: v.total > 0 ? Math.round((v.indexed / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.views - a.views);

    // 10. Skupno število PageView zapisov vseh (tudi izven sitemap)
    const totalPageViewRecords = await db.pageView.count();

    // 11. Zadnji 7 dni — trend PageView za graf
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentPageViews = await db.pageView.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { path: true, createdAt: true },
    });

    const dayMap = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toLocaleDateString("sl-SI", {
        day: "2-digit",
        month: "2-digit",
      });
      dayMap.set(key, 0);
    }
    for (const pv of recentPageViews) {
      const key = pv.createdAt.toLocaleDateString("sl-SI", {
        day: "2-digit",
        month: "2-digit",
      });
      if (dayMap.has(key)) {
        dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
      }
    }
    const trend7d = Array.from(dayMap.entries()).map(([day, count]) => ({
      day,
      count,
    }));

    return NextResponse.json({
      // KPI-ji
      totalUrls,
      indexedCount,
      notIndexedCount,
      coveragePercent:
        totalUrls > 0 ? Math.round((indexedCount / totalUrls) * 100) : 0,
      totalPageViews,
      totalPageViewRecords,
      topPage,
      // Podrobni seznami
      pages: pages.map((p) => ({
        path: p.path,
        url: p.url,
        category: p.category,
        views: p.totalViews,
        indexed: p.indexed,
      })),
      top20,
      notIndexed,
      byCategory,
      trend7d,
      // Povezave za Google
      links: {
        searchConsole: "https://search.google.com/search-console",
        sitemapSubmission:
          "https://search.google.com/ping/submit?url=https://discoverslovenia.ai/sitemap.xml",
        sitemapUrl: "https://discoverslovenia.ai/sitemap.xml",
      },
    });
  } catch (error) {
    console.error("[admin/indexing] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju indeksacijskih podatkov" },
      { status: 500 },
    );
  }
}
