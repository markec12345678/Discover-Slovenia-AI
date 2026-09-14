import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

// POST /api/analytics/event — dogodki pilotne analitike načrtovalca (Faza 4).
//
// Sprejme { name, props?, path?, sid? } in zapiše vrstico v AnalyticsEvent
// (type = "planner_<name>", sessionId = anonimni UUID iz klienta, metadata =
// JSON { props, path }). Whitelist imen je STREŽNIŠKA — klient ne more
// zapisati poljubnega tipa dogodka (isti vzorec varnosti kot track-funnel).
//
// Brez PII: sessionId je naključeni UUID, props so izključno številke/nizi
// iz produktnega konteksta (dni, km, vir, provider ...).

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
  // Neuspehi
  "planner_error",
  "empty_result",
  "invalid_location",
  "unrealistic_day",
  "save_failed",
  "refine_failed",
  "user_abandoned_after_result",
]);

/** Omejitev velikosti props (proti zlorabi analitičnega endpointa). */
const MAX_PROPS_KEYS = 12;
const MAX_PROP_VALUE_LEN = 120;

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

    await db.analyticsEvent.create({
      data: {
        type: `planner_${name}`,
        sessionId: sid,
        metadata: JSON.stringify({ props, path }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[analytics/event] napaka:", error);
    return NextResponse.json({ error: "Napaka" }, { status: 500 });
  }
}
