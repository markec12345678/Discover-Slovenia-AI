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
  // OPCIJA-3 (transakcijska globina): klik rezervacijskega CTA (status_strip /
  // day_header / stop_card) — meri, kdaj v poti uporabniki želijo dejanje
  "booking_cta_clicked",
  // GEO-ODGOVORI (Task 29): AI klepet je izrisal kraje na zemljevidu
  // (props: osm_count, t1_count, t2_count [1.44 — citani uradni viri STO],
  // cat_counts [1.46 — "food:5,drinks:2,destination:1,source:2"])
  // — doseg "generative spatial" odgovorov
  "chat_geo_answered",
  // 1.46 (kategorija čipi): preklop kategorije v filtru geo odgovora
  // (props: category, enabled 0|1, surface chat|overlay)
  "chat_geo_filtered",
  // 1.47 (zemljevid čipi): preklop kategorije POI filtra na /zemljevid
  // (props: category, enabled 0|1, surface "map") — komplement
  // chat_geo_filtered za brskalni zemljevid
  "map_poi_filtered",
  // F1 (Supply Map, 1.49.0): viewport poizvedba supply sloja (props:
  // zoom, cats, products, degraded, ms — strežniški dvojnik je supply_query)
  "supply_map_query",
  // F1: odprt modal produkta s zemljevida ponudbe (props: provider, type,
  // has_price, has_geo)
  "supply_product_viewed",
  // F1: "Dodaj v moj načrt" iz supply modal/kartice (props: provider, type,
  // has_geo, has_price, stashed 0|1)
  "supply_add_to_plan",
  // 1.42 (GEO → NAČRT): kraj iz AI klepeta dodan v načrt potovanja
  // (props: provenance t1|osm, category, day, stashed?)
  "chat_place_added",
  // 1.43: postanek, dodan iz klepeta, odstranjen z enim klikom s kartice
  // postanka (props: provenance t1|osm, day, locale?)
  "chat_place_removed",
  "weather_alternative_used",
  // F5.4 "Začni s povezavo" ( url ingest)
  "ingest_url_attempted",
  "ingest_url_success",
  // F8 "Začni s sliko" ( image ingest — VLM branje + deterministično ujemanje)
  "ingest_image_attempted",
  "ingest_image_success",
  // F14 "Uvozi shranjene točke" ( pins ingest — Mindtrip "Google Pins";
  // deterministično ujemanje po imenu/koordinatah, 0 AI žetonov)
  "ingest_pins_attempted",
  "ingest_pins_success",
  // D3 "Začni s PDF-jem" ( pdf ingest — unpdf izlušči besedilo, ISTO
  // deterministično ujemanje kot povezava/slika)
  "ingest_pdf_attempted",
  "ingest_pdf_success",
  // D2 "Poslušaj svoj načrt" ( audio TTS — zahteva/priprava/napaka)
  "itinerary_audio_requested",
  "itinerary_audio_ready",
  "itinerary_audio_failed",
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
  // F9 "Pogovor z načrtu": zastavljeno vprašanje o načrtu
  "plan_qa_asked",
  // F13 "Preveri svoj načrt": oddano besedilo tujega načrta v validator
  // ( worst = najhujša raven poročila; brez AI žetonov)
  "plan_check_submitted",
  "plan_check_completed",
  // F16 "Optimalno zaporedje dneva": preureditev postankov dneva z
  // 2-opt/izčrpnim optimizatorjem (deterministično, 0 AI; saved_km = ocena)
  "day_optimized",
  // Backlog #5 "Postanki na poti": razširitev predlogov + dodan postanek
  // (detour km iz OSRM plasti)
  "leg_suggestions_expanded",
  "leg_suggestion_added",
  // Backlog #6 "Kosilo na dolgi etapi": svetovalni predlog kosila (kind =
  // arrive | depart | enroute | honest) in zavrnitev
  "meal_suggestion_shown",
  "meal_suggestion_dismissed",
  // Neuspehi
  "planner_error",
  // TASK 82: oddaja zavrnjena zaradi validacije (props: field =
  // days|budget|groupSize|interests|startDate) — meri trenje obrazca
  "planner_validation_failed",
  "empty_result",
  "invalid_location",
  "unrealistic_day",
  "save_failed",
  "refine_failed",
  // TASK 77: uporabnikov preklic generiranja (namerna izbira, ne napaka)
  "planner_cancelled",
  // P1-3 (recenzija): preimenovano iz user_abandoned_after_result — proxy
  // signal "rezultat prikazan, sledeni dogodek ni bil zaznan v merjenem oknu"
  "result_session_ended_without_action",
]);

/** Omejitve velikosti props (proti zlorabi analitičnega endpointa).
 *
 * Revizija #9 (trditev 5): prej sta bili omejeni samo ŠTEVILKO ključev in
 * dolžina VREDNOSTI — ne pa dolžina ključa samega in velikost celotnega
 * bodyja. Napadalec je lahko 60×/min/IP pošiljal { name: "planner_started",
 * props: { "<MB-dolg ključ>": 1, ... } } → request.json() je parsal celoten
 * payload (CPU/ram) NEODVISNO od kasnejših omejitev, ogromni ključi pa so
 * se nespremenjeni zapisali v metadata JSON (bloat DB).
 *
 * MAX_BODY_BYTES (8 KB) je radodaren strop za legitimne dogodke: 12 ključev
 * × (64 znakov ključ + 120 znakov vrednosti) + path 200 + sid 64 + eid 64
 * ≈ ~3 KB. Vse nad tem je zloraba, ne produktni promet.
 */
const MAX_PROPS_KEYS = 12;
const MAX_PROP_KEY_LEN = 64;
const MAX_PROP_VALUE_LEN = 120;
const MAX_BODY_BYTES = 8 * 1024;

/** Veljaven eid: [A-Za-z0-9-]{8,64} (UUID iz klienta; neveljaven → brez dedupa). */
const EID_RE = /^[A-Za-z0-9-]{8,64}$/;

/** Oblika klientnega payload-a (vrednosti se validirajo po vrsti spodaj). */
interface AnalyticsEventBody {
  name?: unknown;
  props?: unknown;
  path?: unknown;
  sid?: unknown;
  eid?: unknown;
}

export async function POST(request: Request) {
  // Rate limit analitike (spam zaščita) — enak vzorec kot track-funnel
  const limited = rateLimit(request, {
    limit: 60,
    windowMs: 60000,
    key: "analytics-event",
  });
  if (limited) return limited;

  try {
    // Revizija #9 (trditev 5): MEJA VELIKOSTI BODYJA PRED parsiranjem.
    // Dvojna preverba: content-length glava (zavrne pred branjem toka) in
    // dejanska dolžina prebranega besedila (pokrije chunked pošiljke brez
    // glave). Brez tega je request.json() parsal poljubno velik payload.
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Telo zahteve je preveliko" }, { status: 413 });
    }
    const raw = await request.text().catch(() => "");
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Telo zahteve je preveliko" }, { status: 413 });
    }
    let body: AnalyticsEventBody | null = null;
    try {
      body = raw ? (JSON.parse(raw) as AnalyticsEventBody) : null;
    } catch {
      body = null; // neveljaven JSON → enaka pot kot prej (400 spodaj)
    }

    const name = typeof body?.name === "string" ? body.name : "";
    if (!name || !VALID_EVENTS.has(name)) {
      return NextResponse.json({ error: "Neveljaven dogodek" }, { status: 400 });
    }

    // Sanitizacija props — samo primitivi, omejeno število in dolžina
    const props: Record<string, string | number | boolean> = {};
    if (body?.props && typeof body.props === "object" && !Array.isArray(body.props)) {
      const entries = Object.entries(body.props as Record<string, unknown>);
      for (const [key, value] of entries.slice(0, MAX_PROPS_KEYS)) {
        // Revizija #9 (trditev 5): tudi DOLŽINA KLJUČA je omejena — prej se je
        // ključ poljubne dolžine nespremenjen zapisal v metadata JSON.
        // Predolg ključ se tiho izpusti (enak vzorec kot null/objekti).
        if (key.length > MAX_PROP_KEY_LEN) continue;
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
