import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendPush, isPushConfigured } from "@/lib/push";
import { verifyCronAuth } from "@/lib/security";
import {
  EVENTS,
  SLOVENIAN_MONTHS_FULL,
  type EventItem,
} from "@/lib/events-data";

// ============================================================================
// GET /api/cron/daily-trip-push — dnevni opomnik za shranjena potovanja
// ============================================================================
//
// RETENCIJSKI MOTOR (Faza 3b): uporabniki, ki so na /pot/{shareId} vklopili
// dnevne opomnike (kind="trip"), vsak dan prejmejo ENO push obvestilo z
// najbližjim dogodkom na svoji destinaciji ali predlogom izkušnje za
// rezervacijo. Klik odpre njihov načrt (/pot/{shareId}?src=push) — kjer
// čakajo rezervacijski CTA-ji → zapiranje zanke retention → monetizacija.
//
// Pogoj za pošiljanje (na naročnino):
//   - kind="trip", unsubscribedAt=null (aktivna)
//   - tripEnd >= sedaj (potovanje še traja)
//   - lastPushAt < sedaj-23h (dnevni limit, ~1 push/dan)
//
// Vsebina (deterministična, iz REALNIH podatkov — brez AI halucinacij):
//   1. Najbližji prihodnji dogodek iz EVENTS (destinationId ujemanje)
//   2. Sicer: top izkušnja iz DB (rezervacijski CTA)
//   3. Sicer: splošen „poglej svoj načrt" namig
//
// Parametri:
//   ?dry=1 — NE pošilja: prikaže pripravljeno vsebino (testiranje/monitoring)
//
// Auth: CRON_SECRET (Bearer) ali ADMIN_PASSWORD (enako kot weekly-alerts).
// Vsak uspešno dostavljen push se zabeleži kot funnel korak trip_push_sent
// (PageView — isti vzorec kot /go/[provider]).
// ============================================================================

/** 23h namesto 24h — tolerantno na urne zamike cron klica. */
const PUSH_COOLDOWN_MS = 23 * 60 * 60 * 1000;
/** Zgornja meja naročnin na zagon (varnost pred eksplozijo stroškov). */
const MAX_SUBSCRIPTIONS_PER_RUN = 200;

/** Pripravljen push (dry-run podrobnost / pošiljanje). */
interface PlannedPush {
  subscriptionId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  shareId: string;
  payload: {
    title: string;
    body: string;
    url: string;
    tag: string;
  };
}

/** Rozbij JSON array destination_id-jev iz naročnine (robustno). */
function parseDestinationIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "")
      : [];
  } catch {
    return [];
  }
}

/** ISO datum → slovenski berljiv zapis („15. avgusta"). */
function formatSlDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return iso;
  const day = Number(m[3]);
  const monthIdx = Number(m[2]) - 1;
  const month =
    SLOVENIAN_MONTHS_FULL[monthIdx]?.toLowerCase() ?? `${m[2]}. mesec`;
  return `${day}. ${month}`;
}

/**
 * Najbližji PRIHODNJI dogodek, ki se ujema z destinacijami potovanja.
 * (EVENTS vsebujejo realne letne prireditve z datumi 2026/2027 — vzamemo
 * prvega po datumu, ki še ni mimo.)
 */
function findNextEvent(destIds: string[], now: Date): EventItem | null {
  if (destIds.length === 0) return null;
  const destSet = new Set(destIds);
  const todayStr = now.toISOString().slice(0, 10);

  const candidates = EVENTS.filter(
    (e) => e.destinationId && destSet.has(e.destinationId) && e.date >= todayStr
  ).sort((a, b) => a.date.localeCompare(b.date));

  return candidates[0] ?? null;
}

/** Glavna destinacija potovanja (prva v seznamu — za naslov). */
function primaryDestinationName(destIds: string[]): string | null {
  return destIds[0] ?? null;
}

export async function GET(request: Request) {
  // Auth (CRON_SECRET Bearer ali ADMIN_PASSWORD — timing-safe)
  const unauthorized = verifyCronAuth(request);
  if (unauthorized) return unauthorized;

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const now = new Date();

  try {
    // 1. Vse aktivne trip naročnine z zapadlim dnevnim limitom.
    const subs = await db.pushSubscription.findMany({
      where: {
        kind: "trip",
        unsubscribedAt: null,
        tripEnd: { gte: now },
        OR: [
          { lastPushAt: null },
          { lastPushAt: { lt: new Date(now.getTime() - PUSH_COOLDOWN_MS) } },
        ],
      },
      take: MAX_SUBSCRIPTIONS_PER_RUN,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        endpoint: true,
        p256dh: true,
        auth: true,
        shareId: true,
        destinationIds: true,
      },
    });

    // 2. Pred-fetch izkušenj za VSE unikatne destinacije (brez N+1).
    const allDestIds = [
      ...new Set(subs.flatMap((s) => parseDestinationIds(s.destinationIds))),
    ];
    const experienceByDest = new Map<string, { name: string; price: number }>();

    if (allDestIds.length > 0) {
      const experiences = await db.experience.findMany({
        where: { destinationId: { in: allDestIds } },
        select: { destinationId: true, name: true, pricePerPerson: true },
        orderBy: [{ featured: "desc" }, { rating: "desc" }],
        take: 60,
      });
      for (const e of experiences) {
        if (e.destinationId && !experienceByDest.has(e.destinationId)) {
          experienceByDest.set(e.destinationId, {
            name: e.name,
            price: e.pricePerPerson,
          });
        }
      }
    }

    // 3. Pripravi vsebino za vsako naročnino.
    const planned: PlannedPush[] = [];
    for (const sub of subs) {
      const destIds = parseDestinationIds(sub.destinationIds);
      const shareId = sub.shareId ?? "";
      const destName = primaryDestinationName(destIds);

      // Brez shareId naročnina nima kam klikniti — ne pošiljamo.
      if (!shareId) continue;

      const nextEvent = findNextEvent(destIds, now);
      const experience = destIds
        .map((d) => experienceByDest.get(d))
        .find((x) => x != null);

      let title: string;
      let body: string;

      if (nextEvent) {
        title = `Dogodek na tvojem potovanju${destName ? ` (${destName})` : ""}`;
        body = `${nextEvent.name} — ${formatSlDate(nextEvent.date)} v ${
          nextEvent.location.split(",").pop()?.trim() ?? nextEvent.location
        }. Odpri načrt in načrtuj dan okoli njega.`;
      } else if (experience) {
        title = `Predlog za tvoje potovanje${destName ? ` (${destName})` : ""}`;
        body = `${experience.name} — od ${experience.price} € na osebo. Rezerviraj termin, preden se napolni.`;
      } else {
        title = "Tvoj AI načrt potovanja te čaka";
        body =
          "Odpri svoj načrt — preveri, kaj se dogaja na tvoji poti, in rezerviraj izkušnje.";
      }

      planned.push({
        subscriptionId: sub.id,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        shareId,
        payload: {
          title,
          body,
          url: `/pot/${shareId}?src=push`,
          tag: `trip-${shareId}`, // dnevni push zamenja prejšnjega istega trip-a
        },
      });
    }

    // 4. Dry-run — vrni pripravljeno vsebino brez pošiljanja.
    if (dry) {
      return NextResponse.json({
        success: true,
        dry: true,
        eligible: subs.length,
        planned: planned.length,
        content: planned.map((p) => ({
          shareId: p.shareId,
          title: p.payload.title,
          body: p.payload.body,
          url: p.payload.url,
        })),
        pushConfigured: isPushConfigured(),
      });
    }

    // 5. Pošiljanje.
    if (!isPushConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: "Push ni konfiguriran (manjkajo VAPID ključi)",
          planned: planned.length,
        },
        { status: 503 }
      );
    }

    let sent = 0;
    let failed = 0;
    let gone = 0;
    const errors: string[] = [];

    for (const p of planned) {
      const result = await sendPush(
        { endpoint: p.endpoint, p256dh: p.p256dh, auth: p.auth },
        p.payload
      );

      if (result.gone) {
        // Push service je naročnino uničil (404/410) — soft-delete.
        await db.pushSubscription
          .update({
            where: { id: p.subscriptionId },
            data: { unsubscribedAt: new Date() },
          })
          .catch(() => undefined);
        gone++;
        continue;
      }

      if (!result.ok) {
        // Prehodna napaka (network/5xx) — naročnina ostane, poskusimo jutri.
        failed++;
        if (errors.length < 10 && result.error) errors.push(result.error);
        continue;
      }

      // Uspešno dostavljeno: dnevni limit + funnel korak.
      sent++;
      await db.pushSubscription
        .update({
          where: { id: p.subscriptionId },
          data: { lastPushAt: new Date() },
        })
        .catch(() => undefined);

      try {
        // Funnel zapis — isti vzorec kot /go/[provider] (PageView s
        // funnelStep), da GET funnel statistika šteje dostavljene pushe.
        await db.pageView.create({
          data: {
            path: `/push/trip/${p.shareId}`,
            funnelStep: "trip_push_sent",
          },
        });
      } catch (e) {
        console.error("[daily-trip-push] funnel zapis napaka:", e);
      }
    }

    return NextResponse.json({
      success: true,
      dry: false,
      eligible: subs.length,
      planned: planned.length,
      sent,
      failed,
      gone,
      ...(errors.length > 0 ? { errors } : {}),
    });
  } catch (error) {
    console.error("[daily-trip-push] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri dnevni pošiljki opomnikov" },
      { status: 500 }
    );
  }
}
