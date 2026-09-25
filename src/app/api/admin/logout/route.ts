import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { ADMIN_SESSION_COOKIE } from "@/lib/security";

// ============================================================================
// POST /api/admin/logout — ISSUE #4 §24 (VAL 8): počisti admin sejo
// ============================================================================
// httpOnly piškotka klient NE more izbrisati sam (JS ga ne vidi) — odjava
// gre skozi ta endpoint: Max-Age=0. Idempotenten in neškodljiv (ni
// avtentikacijske zahteve — brisanje že izgubljenega piškota ni občutljivo).
// ============================================================================

export async function POST(request: Request) {
  const limited = rateLimit(request, {
    limit: 30,
    windowMs: 60_000,
    key: "admin-logout",
  });
  if (limited) return limited;

  const res = NextResponse.json({ success: true });
  res.headers.set(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
  return res;
}
