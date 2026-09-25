import crypto from "crypto";
import { NextResponse } from "next/server";

/**
 * Skupni varnostni helperji:
 * - escapeHtml: varno vstavljanje uporabniških vnosov v HTML (emaili)
 * - safeJsonLd: prepreči </script> XSS v JSON-LD blokih
 * - timingSafeEqual / verifySecret: constant-time primerjava skrivnosti
 * - verifyCronAuth: avtentikacija cron endpointov (CRON_SECRET ali admin geslo)
 * - ADMIN SESSION (ISSUE #4 §24, VAL 8): HMAC-podpisan httpOnly piškotek —
 *   skupno admin geslo NE živi več v localStorage brskalnika
 */

/** HTML escape uporabniških vrednosti (za email template in dinamičen HTML). */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Varen izpis JSON-LD.
 * JSON.stringify NE escapira `</script>` — owner-editable polja (opisi lokalov,
 * imena izdelkov ...) lahko tako izvedejo stored XSS. Escapiramo < > &.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/** Naključni base36 ID — za nerodljive številke naročil/rezervacij. */
export function randomId(length = 8): string {
  // 2 hex znaka na byte → dovolj entropije za neurogljive ID-je
  return crypto.randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length);
}

/** Constant-time primerjava dveh stringov (preprečuje timing napade). */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) {
    // Primerjaj z enkrito dolžino, da ne puščamo timing signala
    return crypto.timingSafeEqual(bufA, bufA) && false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Avtentikacija cron endpointov.
 *
 * Sprejme:
 *   - Authorization: Bearer <CRON_SECRET> (Vercel Cron to pošlje samodejno,
 *     ko je CRON_SECRET nastavljen v env)
 *   - x-admin-password: <ADMIN_PASSWORD> (ročni admin klic)
 *
 * Fail-closed: v produkciji brez CRON_SECRET zavrnemo vse klice.
 * V developmentu (brez secret-a) dovolimo (lokalni cron / ročni testi).
 *
 * Vrne `null` če je klic avtoriziran, sicer 401 NextResponse.
 */
export function verifyCronAuth(request: Request): NextResponse | null {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (cronSecret && authHeader && timingSafeEqual(authHeader, `Bearer ${cronSecret}`)) {
    return null;
  }

  const adminHeader = request.headers.get("x-admin-password");
  if (adminPassword && adminHeader && timingSafeEqual(adminHeader, adminPassword)) {
    return null;
  }

  // Brez CRON_SECRET: v produkciji fail-closed, v dev dovolimo
  if (!cronSecret && process.env.NODE_ENV !== "production") {
    return null;
  }

  return NextResponse.json(
    { error: "Neavtoriziran cron klic. Nastavi CRON_SECRET ali pošlji admin geslo." },
    { status: 401 }
  );
}

// ---------------------------------------------------------------------------
// ADMIN SESSION — ISSUE #4 §24 (VAL 8, P2): geslo IZVEN brskalnika
// ---------------------------------------------------------------------------
// Vrzela (auditska revizija VAL 8): /admin je shranil SKUPNO admin geslo v
// localStorage ("admin_token") in ga pošiljal v glavi x-admin-password —
// vsak XSS (CSP trenutno dopušča 'unsafe-inline') ali lokalni dostop je
// izdal geslo do VSEH admin endpointov.
//
// Rešitev (enak vzorec kot session JWT uporabnikov, le brez računov):
//   1. POST /api/admin/verify ob PRAVILNEM geslu izda HMAC-podpisan
//      session žeton v HTTPONLY piškotku `dsa_admin_session` (TTL 60 min);
//   2. vsi admin endpointi (checkAdmin/requireAdmin) sprejmejo piškotek
//      (preverjen PRVI) ALI klasično glavo x-admin-password (nazaj
//      kompatibilno za skripte/integracije/teste);
//   3. brskalnik gesla NE shranjuje več — odjava počisti piškotek.
//
// Ključ = HMAC-SHA256 iz ADMIN_PASSWORD (brez nove env spremenljivke):
// rotacija gesla samodejno razveljavi VSE izdane seje (želena lastnost).
// Fail-closed: brez ADMIN_PASSWORD ni izdaje ne verifikacije seje.
// ---------------------------------------------------------------------------

/** Ime admin session piškotka (httpOnly — klient ga NE more prebrati). */
export const ADMIN_SESSION_COOKIE = "dsa_admin_session";

/** Veljavnost admin seje — 60 minut (kratka življenjska doba je varnostna meja). */
export const ADMIN_SESSION_TTL_MS = 60 * 60_000;

/** Izpelji HMAC ključ admin sej iz ADMIN_PASSWORD (rotacija gesla = revok vseh). */
function adminSessionKey(): Buffer | null {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return null;
  return crypto
    .createHash("sha256")
    .update(`dsa-admin-session:${adminPassword}`)
    .digest();
}

/**
 * Izdaj session žeton ob uspešni prijavi: `<expHex>.<hmacHex>`.
 * Vrne null, če ADMIN_PASSWORD ni nastavljen (fail-closed — brez izdaje).
 */
export function issueAdminSessionToken(): string | null {
  const key = adminSessionKey();
  if (!key) return null;
  const expHex = Math.floor((Date.now() + ADMIN_SESSION_TTL_MS) / 1000).toString(16);
  const hmac = crypto.createHmac("sha256", key).update(expHex).digest("hex");
  return `${expHex}.${hmac}`;
}

/**
 * Preveri session žeton (podpis + potek). Constant-time na HMAC.
 * Ne razkriva RAZLOGA zavrnitve (potek vs. sipanje) — enak 401.
 */
export function verifyAdminSessionToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const m = /^([0-9a-f]{1,12})\.([0-9a-f]{64})$/.exec(token);
  if (!m) return false;
  const key = adminSessionKey();
  if (!key) return false;
  const expHex = m[1];
  const expected = crypto.createHmac("sha256", key).update(expHex).digest("hex");
  if (!timingSafeEqual(m[2], expected)) return false;
  // Podpis veljaven → preveri še potek (po podpisu, da napadeni potek ne
  // razkrije nič pred HMAC zavrnitvijo).
  const exp = Number.parseInt(expHex, 16);
  if (!Number.isFinite(exp)) return false;
  return exp * 1000 > Date.now();
}

/** Preberi admin session piškotek iz zahteve (ročno razčiščenje Cookie glave). */
function adminSessionCookieOf(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    if (part.slice(0, eq).trim() === ADMIN_SESSION_COOKIE) {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}

/** Ali zahteva nosi VELJAVNO admin sejo (httpOnly piškotek)? */
export function adminSessionFrom(request: Request): boolean {
  return verifyAdminSessionToken(adminSessionCookieOf(request));
}

/**
 * Set-Cookie niz za admin sejo. `secure` dodaj samo na https (Render/produkcija)
 * — na localhost (http) bi Secure piškotek brskalnik zavrnil.
 */
export function adminSessionSetCookie(
  token: string,
  opts: { secure: boolean; maxAgeSeconds?: number } = { secure: false }
): string {
  const maxAge = opts.maxAgeSeconds ?? Math.floor(ADMIN_SESSION_TTL_MS / 1000);
  const parts = [
    `${ADMIN_SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}
