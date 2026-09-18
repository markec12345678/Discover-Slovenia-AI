import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

// GET /api/pois/[id]?osmId=123&type=node
// Vrne podrobnosti POI-ja + Wikipedia opis (če je na voljo)
//
// AUDIT 42 (42-e F2): javna ruta z 1–2 NIAZPREDBEŽNIMA klicema na
// Wikidata/Wikipedia na vsak klic, brez omejitve — kladivo bi spravilo naš
// IP na Wikimedia throttle (ista vrzel kot /api/pois v 1.33). Zdaj:
// 30/min/IP (ključ poi-detail).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: 60_000,
    key: "poi-detail",
  });
  if (limited) return limited;

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const osmId = searchParams.get("osmId");
    const osmType = searchParams.get("type") || "node";
    const wikidata = searchParams.get("wikidata");
    const wikipedia = searchParams.get("wikipedia");

    let wikiExtract: string | null = null;
    let wikiImage: string | null = null;
    let wikiUrl: string | null = null;

    // Helper: pridobi Wikipedia extract + thumbnail
    // SSRF-FIX (revizija 1.33.0, auditorska ugotovitev 16-b P1): `lang` pride
    // iz javnega query parametra `wikipedia=<lang>:<Title>` — prej je bil
    // nevrednoten in interpoliran naravnost v URL (možen `evil.com/Bled.`
    // aliasing / `[::ffff:127.0.0.1]` loopback). Zdaj: 2-3 črke + naslov
    // encodan po komponenti (brez `../`, `?`, `#` prelomov poti).
    async function fetchWiki(lang: string, title: string) {
      if (!/^[a-z]{2,3}$/.test(lang)) return;
      const titleForApi = encodeURIComponent(title.replace(/ /g, "_"));
      wikiUrl = `https://${lang}.wikipedia.org/wiki/${titleForApi}`;
      try {
        const extractRes = await fetch(
          `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${titleForApi}`,
          {
            cache: "no-store",
            headers: {
              "User-Agent": "Discover-Slovenia-AI/1.0 (https://discoverslovenia.example; contact@example.com)",
              "Accept": "application/json",
            },
          }
        );
        if (extractRes.ok) {
          const extractData = await extractRes.json();
          wikiExtract = extractData.extract || null;
          wikiImage =
            extractData.thumbnail?.source ||
            extractData.originalimage?.source ||
            extractData.originalimage ||
            null;
        }
      } catch (e) {
        console.error("[poi/wikipedia] fetch napaka:", e);
      }
    }

    // Pridobi Wikipedia opis preko Wikidata
    if (wikidata) {
      try {
        // SSRF-FIX (1.33.0): wikidata ID je javni query param — dovolimo samo
        // kanonično obliko Q<števke> (prej je lahko vseboval poti/poizvedbe).
        const wdId = wikidata.trim();
        if (!/^Q\d{1,12}$/.test(wdId)) throw new Error("neveljaven wikidata ID");
        const wdRes = await fetch(
          `https://www.wikidata.org/wiki/Special:EntityData/${wdId}.json`,
          {
            cache: "no-store",
            headers: {
              "User-Agent": "Discover-Slovenia-AI/1.0 (https://discoverslovenia.example; contact@example.com)",
              "Accept": "application/json",
            },
          }
        );
        if (wdRes.ok) {
          const wdData = await wdRes.json();
          const entity = wdData.entities[wdId];
          const sitelinks = entity.sitelinks || {};
          const wikiSl = sitelinks.slwiki;
          const wikiEn = sitelinks.enwiki;

          if (wikiSl) {
            await fetchWiki("sl", wikiSl.title);
          } else if (wikiEn) {
            await fetchWiki("en", wikiEn.title);
          }
        }
      } catch (e) {
        console.error("[poi/wikidata] napaka:", e);
      }
    }

    // Fallback: če imamo wikipedia tag direktno (URL-decode!)
    if (!wikiExtract && wikipedia) {
      try {
        // searchParams.get() že URL-decode-a, ampak če prihaja iz queryja...
        const decoded = decodeURIComponent(wikipedia);
        const [lang, title] = decoded.split(":", 2);
        if (lang && title) {
          await fetchWiki(lang, title);
        }
      } catch (e) {
        console.error("[poi/wikipedia] fallback napaka:", e);
      }
    }

    return NextResponse.json({
      id,
      osmId,
      osmType,
      wikidata,
      wikipedia: {
        extract: wikiExtract,
        image: wikiImage,
        url: wikiUrl,
      },
      source: "OpenStreetMap + Wikipedia",
    });
  } catch (error) {
    console.error("[poi/detail] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri pridobivanju podrobnosti POI-ja" },
      { status: 500 }
    );
  }
}
