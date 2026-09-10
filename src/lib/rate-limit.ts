import { NextResponse } from "next/server";

/**
 * Rate limiting — preprost in-memory sliding window (per IP + endpoint).
 *
 * Namen: zaščita javnih (zlasti AI) endpointov pred zlorabo/brute-force.
 * Omejitve: na serverless (Vercel) deluje per-instanca — za robustno
 * produkcijo priporočam Upstash Redis (glej docs/SECURITY-REVIEW.md §1.7).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodično čiščenje poteklih bucketov (vsakih 5 minut)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** IP naslov klienta (za Vercel/proxy: x-forwarded-for). */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export interface RateLimitOptions {
  /** Max število zahtev v oknu. */
  limit: number;
  /** Dolžina okna v milisekundah. */
  windowMs: number;
  /** Dodatni ključ (npr. email) — privzeto pathname requesta. */
  key?: string;
}

/**
 * Preveri rate limit.
 * Vrne `null`, če je zahteva dovoljena; sicer NextResponse 429 (takoj vrnemo klientu).
 *
 * Uporaba:
 *   const limited = rateLimit(request, { limit: 10, windowMs: 10 * 60_000 });
 *   if (limited) return limited;
 */
export function rateLimit(
  request: Request,
  { limit, windowMs, key }: RateLimitOptions
): NextResponse | null {
  const now = Date.now();
  cleanup(now);

  const ip = getClientIp(request);
  let pathname = "";
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    pathname = "unknown";
  }
  const id = `${ip}:${key ?? pathname}`;

  if (hitLimit(id, limit, windowMs)) {
    const bucket = buckets.get(id);
    const retryAfterSec = Math.max(
      1,
      Math.ceil(((bucket?.resetAt ?? now + windowMs) - now) / 1000)
    );
    return NextResponse.json(
      {
        error: "Preveč zahtev. Prosimo, poskusite znova kasneje.",
        retryAfter: retryAfterSec,
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) },
      }
    );
  }

  return null;
}

/**
 * P3a-3: ključna (BREZ Request/IP) varianta sliding-window limiterja.
 *
 * Za mesta, ki nimajo dostopa do Request objekta (npr. NextAuth authorize
 * callback) — ključ je poljuben niz (npr. `login:${email}`). Vene `true`,
 * če je ključ presegel limit v oknu (zahtevo zavrnemo), sicer `false`
 * (zahteva dovoljena in šteje v okno).
 *
 * Enaka logika/buckets kot rateLimit — namenoma skupna mapa, da periodično
 * čiščenje pokriva tudi te ključe.
 */
export function hitLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  cleanup(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count++;
  return bucket.count > limit;
}
