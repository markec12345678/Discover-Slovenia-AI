import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// POST /api/analytics/event — dogodki pilotne analitike načrtovalca (Faza 4).
//
// Sprejme { name, props?, path?, sid?, eid? } in zapiše vrstico v AnalyticsEvent
// (type = "planner_<name>", sessionId = anonimni UUID iz klienta, metadata =
// JSON { props, path, eid }). Whitelist imen je STREŽNIŠKA — klient ne more
// zapisati poljubnega tipa dogodka (isti vzorec varnosti kot track-funnel).
//
// P1-2 (recenzija): eid (clientEventId) — deduplikacija. Isti eid + isti tip
// dogodka se NE zapiše dvakrat (retry ob počasnem omrežju, keepalive dvojni
// pošilji). Brez spremembe sheme: eid živi znotraj metadata JSON.
//
// Brez PII: sessionId je naključni UUID, props so izključno številke/nizi
// iz produktnega konteksta (dni, km, vir, provider ...). Docs: docs/ANALYTICS-EVENTS.md.

const VALID_EVENTS = new Set([
  // Uspešna pot
  "planner_started",
  "planner_submitted",
  "planner_result_rendered",
  "planner_refined",
  "day_adjusted",
  "stop_replaced",
  "stop_removed",
  "itinerary_saved",
  "map_opened",
  "provider_detail_opened",
  "affiliate_clicked",
  "weather_alternative_used",
  // F5.4 "Začni s povezavo" ( url ingest)
  "ingest_url_attempted",
  "ingest_url_success",
  // F8 "Začni s sliko" ( image ingest — VLM branje + deterministično ujemanje)
  "ingest_image_attempted",
  "ingest_image_success",
  // F5.2: izvoz načrta v koledar (.ics)
  "ics_download",
  // F5.7 (PWA): namestitev aplikacije (gumb v navigaciji)
  "pwa_install_prompted",
  "pwa_install_accepted",
  // F6.1: odkljuk predmeta na pametnem pakirnem seznamu
  "packing_item_checked",
  // F6.2: nastavitev osebnega proračunskega cilja
  "budget_goal_set",
  // F7: shranjen/urejen skupnostni vodnik na deljeni poti
  "guide_saved",
  // Neuspehi
  "planner_error",
  "empty_result",
  "invalid_location",
  "unrealistic_day",
  "save_failed",
  "refine_failed",
  // P1-3 (recenzija): preimenovano iz user_abandoned_after_result — proxy
  // signal "rezultat prikazan, sledeni dogodek ni bil zaznan v merjenem oknu"
  "result_session_ended_without_action",
]);

/** Omejitev velikosti props (proti zlorabi analitičnega endpointa). */
const MAX_PROPS_KEYS = 12;
const MAX_PROP_VALUE_LEN = 120;

/** Veljaven eid: [A-Za-z0-9-]{8,64} (UUID iz klienta; neveljaven → brez dedupa). */
const EID_RE = /^[A-Za-z0-9-]{8,64}$/;

export async function POST(request: Request) {
  // Rate limit analitike (spam zaščita) — enak vzorec kot track-funnel
  const limited = rateLimit(request, {
    limit: 60,
    windowMs: 60000,
    key: "analytics-event",
  });
  if (limited) return limited;

  try {
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      props?: unknown;
      path?: unknown;
      sid?: unknown;
      eid?: unknown;
    } | null;

    const name = typeof body?.name === "string" ? body.name : "";
    if (!name || !VALID_EVENTS.has(name)) {
      return NextResponse.json({ error: "Neveljaven dogodek" }, { status: 400 });
    }

    // Sanitizacija props — samo primitivi, omejeno število in dolžina
    const props: Record<string, string | number | boolean> = {};
    if (body?.props && typeof body.props === "object" && !Array.isArray(body.props)) {
      const entries = Object.entries(body.props as Record<string, unknown>);
      for (const [key, value] of entries.slice(0, MAX_PROPS_KEYS)) {
        if (typeof value === "number" || typeof value === "boolean") {
          props[key] = value;
        } else if (typeof value === "string") {
          props[key] = value.slice(0, MAX_PROP_VALUE_LEN);
        }
        // null/undefined/objekti se tiho izpustijo
      }
    }

    const path = typeof body?.path === "string" ? body.path.slice(0, 200) : undefined;
    const sid = typeof body?.sid === "string" ? body.sid.slice(0, 64) : undefined;
    const eid =
      typeof body?.eid === "string" && EID_RE.test(body.eid) ? body.eid : undefined;

    // P1-2: deduplikacija po eid — počasna omrežja/keepalive retry lahko istega
    // dogodka pošljejo dvakrat; drugi poskus vrne uspeh BREZ nove vrstice.
    const eventType = `planner_${name}`;
    if (eid) {
      const duplicate = await db.analyticsEvent.findFirst({
        where: {
          type: eventType,
          metadata: { contains: `"eid":"${eid}"` },
        },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json({ success: true, deduped: true });
      }
    }

    await db.analyticsEvent.create({
      data: {
        type: eventType,
        sessionId: sid,
        metadata: JSON.stringify({ props, path, eid }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[analytics/event] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
