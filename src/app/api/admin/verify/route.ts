import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/auth-guards";
import { rateLimit } from "@/lib/rate-limit";
import {
  issueAdminSessionToken,
  adminSessionSetCookie,
  adminSessionFrom,
  ADMIN_SESSION_TTL_MS,
} from "@/lib/security";

// ============================================================================
// ADMIN SESSION — ISSUE #4 §24 (VAL 8, P2): geslo NE živi v brskalniku
// ============================================================================
// POST /api/admin/verify — preveri admin geslo; ob uspehu izda HMAC-podpisan
//   session žeton v HTTPONLY piškotku `dsa_admin_session` (TTL 60 min).
//   Prej je klient shranil geslo samo v localStorage ("admin_token") in ga
//   pošiljal v glavi — XSS/lokalni dostop je izdal geslo do vseh admin API-jev.
//   Telo: { password: string } · Odgovor: { success, expiresInMs } | 401.
//
// GET /api/admin/verify — brez telesa: 200, če veljavna seja (piškotek) ALI
//   glava x-admin-password; sicer 401. Klient (/admin) s tem preveri stanje
//   seje ob mountu brez shranjevanja gesla.
// ============================================================================

function requestIsSecure(request: Request): boolean {
  // Render/produkcija teče na https (x-forwarded-proto); lokalni dev na http
  // — Secure piškotek na http localhost bi bil zavrnjen.
  try {
    if (new URL(request.url).protocol === "https:") return true;
  } catch {
    /* nadaljuj z glavo */
  }
  return request.headers.get("x-forwarded-proto") === "https";
}

export async function POST(request: Request) {
  // Rate limit admin gesla (brute-force zaščita)
  const limited = rateLimit(request, { limit: 10, windowMs: 600000, key: "admin-verify" });
  if (limited) return limited;

  try {
    const body: unknown = await request.json();
    const password =
      typeof body === "object" &&
      body !== null &&
      "password" in body &&
      typeof (body as Record<string, unknown>).password === "string"
        ? ((body as Record<string, unknown>).password as string)
        : null;

    if (checkAdmin(password)) {
      // VAL 8: izdaj sejo — httpOnly piškotek namesto shranjenega gesla.
      const token = issueAdminSessionToken();
      if (token) {
        const res = NextResponse.json({
          success: true,
          expiresInMs: ADMIN_SESSION_TTL_MS,
        });
        res.headers.set(
          "Set-Cookie",
          adminSessionSetCookie(token, { secure: requestIsSecure(request) })
        );
        return res;
      }
      // ADMIN_PASSWORD nenastavljen → checkAdmin bi vrnil false; sem ne pridemo.
      return NextResponse.json({ error: "Napačno geslo" }, { status: 401 });
    }
    return NextResponse.json({ error: "Napačno geslo" }, { status: 401 });
  } catch (error) {
    console.error("[admin/verify] napaka:", error);
    return NextResponse.json(
      { error: "Napaka pri preverjanju gesla" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  // Stanje seje za klient (/admin mount) — brez razkritja razloga (enak 401).
  if (checkAdmin(request)) {
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: "Ni veljavne admin seje" }, { status: 401 });
}
