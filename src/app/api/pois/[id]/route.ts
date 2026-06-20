import { NextResponse } from "next/server";

// GET /api/pois/[id]?osmId=123&type=node
// Vrne podrobnosti POI-ja + Wikipedia opis (če je na voljo)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    async function fetchWiki(lang: string, title: string) {
      const titleForApi = title.replace(/ /g, "_");
      wikiUrl = `https://${lang}.wikipedia.org/wiki/${titleForApi}`;
      try {
        const extractRes = await fetch(
          `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${titleForApi}`,
          {
            cache: "no-store",
            headers: {
              "User-Agent": "I-Feel-Slovenia/1.0 (https://ifeelslovenia.example; contact@example.com)",
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
        const wdRes = await fetch(
          `https://www.wikidata.org/wiki/Special:EntityData/${wikidata}.json`,
          {
            cache: "no-store",
            headers: {
              "User-Agent": "I-Feel-Slovenia/1.0 (https://ifeelslovenia.example; contact@example.com)",
              "Accept": "application/json",
            },
          }
        );
        if (wdRes.ok) {
          const wdData = await wdRes.json();
          const entity = wdData.entities[wikidata];
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
