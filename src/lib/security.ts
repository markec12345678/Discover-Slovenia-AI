import crypto from "crypto";
import { NextResponse } from "next/server";

/**
 * Skupni varnostni helperji:
 * - escapeHtml: varno vstavljanje uporabniških vnosov v HTML (emaili)
 * - safeJsonLd: prepreči </script> XSS v JSON-LD blokih
 * - timingSafeEqual / verifySecret: constant-time primerjava skrivnosti
 * - verifyCronAuth: avtentikacija cron endpointov (CRON_SECRET ali admin geslo)
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
