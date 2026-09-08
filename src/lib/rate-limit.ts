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

  const bucket = buckets.get(id);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(id, { count: 1, resetAt: now + windowMs });
    return null;
  }

  bucket.count++;
  if (bucket.count > limit) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
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
