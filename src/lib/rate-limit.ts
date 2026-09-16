import { NextResponse } from "next/server";
import { headers } from "next/headers";

/**
 * Rate limiting — preprost in-memory sliding window (per IP + endpoint).
 *
 * Namen: zaščita javnih (zlasti AI) endpointov pred zlorabo/brute-force.
 * Omejitve: na serverless (Vercel) deluje per-instanca — za robustno
 * produkcijo priporočam Upstash Redis (glej docs/SECURITY-REVIEW.md §1.7
 * »Pot do centralizacije« za točen načrt in zavrnjene alternative).
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

/**
 * IP naslov klienta — ZAUPAN izvor samo.
 *
 * Revizija #8 (P2 — rate-limit bypass): prej smo vzeli PRVI (levi) vnos
 * x-forwarded-for — ta je CLIENT-CONTROLLABLE (odjemalec ga lahko pošlje
 * sam) → z vrtenjem lažnih XFF vrednosti (1.1.1.1, 2.2.2.2, …) je vsak
 * klic padel v svoje vedro in limit bil izigran. Zdaj:
 *   1. x-real-ip — nastavi platforma/proxy (Vercel), ne odjemalec;
 *   2. ZADNJI (desni) vnos x-forwarded-for — overjen proxy DODA pravi IP
 *      odjemalca na konec verige (client spoof ostane levo);
 *   3. "unknown" — brez obeh: vsi nezadolženi klienti delijo skupno vedro
 *      (fail-closed smer — raje preveč omejeno kot izigrano).
 * Opomba: če je pred aplikacijo več proxyjev (npr. CDN), je desni vnos
 * IP najbližjega proxyja — vrtenje IP-jev s strani klienta v tem primeru
 * NE more več ustvarjati novih vedr.
 */
export function getClientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1]; // desni = zaupan proxy dodan
  }

  return "unknown";
}

/**
 * IP klienta prek next/headers() — za kontekste BREZ Request objekta
 * (npr. NextAuth authorize() callback, ki ne prejme Requesta).
 *
 * ASYNC: v Next.js 16 headers() vrne Promise (uradna API sprememba).
 * Vrne `null`, če glave niso dostopne (klic izven request scope-a) —
 * klicalec MORA imeti fallback (glej buildLoginRateKey). Model zaupanja
 * je IDENTIČEN getClientIp() zgoraj (revizija #8: x-real-ip → desni XFF
 * → null; Levi/client-vpisani XFF se ne upošteva več).
 */
export async function getClientIpFromHeaders(): Promise<string | null> {
  try {
    const h = await headers();
    const realIp = h.get("x-real-ip");
    if (realIp) return realIp.trim();

    const fwd = h.get("x-forwarded-for");
    if (fwd) {
      const hops = fwd
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      if (hops.length > 0) return hops[hops.length - 1];
    }

    return null;
  } catch {
    // headers() izven request scope-a (npr. teoretični klic ob zagonu) —
    // pošteno vrnemo null, klicalec pade na email-only ključ.
    return null;
  }
}

/**
 * KLJUČ login rate limita — HIBRID ip+email (1.28.0, uporabnikova revizija #7).
 *
 * Prej `login:<email>`: napadalec je z 10 poskusi (iz KATEREGA KOLI IP)
 * blokiral prijavo žrtvi — trivialen DoS. Zdaj `login:<ip>:<email>`:
 *   - ugibanje gesla iz enega IP na en račun je še vedno omejeno (10/15 min),
 *   - žrtvina prijava iz drugega IP ni prizadeta (ločeno vedro),
 *   - DoS vektor »blokiraj žrtvi login« je odstranjen.
 * Fallback brez IP (headers() nedosegljiv): star vedenje `login:<email>`.
 */
export function buildLoginRateKey(email: string, ip: string | null): string {
  const e = email.toLowerCase().trim();
  return ip ? `login:${ip}:${e}` : `login:${e}`;
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
