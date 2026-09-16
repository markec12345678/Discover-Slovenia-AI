/**
 * Varni EXTERNI href za lastniške kontaktne URL-je (revizija 1.33.0,
 * auditorska ugotovitev 16-b P2).
 *
 * Problem: `website`/`providerWebsite`/`sellerWebsite` so lastniški vnosi,
 * shranjeni v DB in izrisani kot `<a href={...}>` v javnih modalih/booking
 * panelu. rel="noopener noreferrer" NE nevtralizira `javascript:` href-a —
 * shranjen "javascript:..." bi bil klik-XSS za obiskovalce (moderacija je
 * blažilec, ne meja).
 *
 * Dve meji (oba sta zdaj dejavni):
 *   1. WRITE (zod refine na owner rutah): zavrne ne-http(s) vrednosti ob
 *      vnosu — glej safeWebsiteSchema spodaj.
 *   2. READ (render): safeExternalHref vrne "#" za vse, kar ni http(s) —
 *      pokrije ZGODOVINSKE vrstice, shranjene pred write-mejo.
 *
 * Namerno OBA meji: write-meja ščiti prihodnost, read-meja preteklost.
 *
 * Revizija #9 (trditev 8): regex /^https?:\/\// je bil prešibko merilo —
 * preverjal je samo predpono, ne pa SEMANTIKE URL-ja (hostname, userinfo,
 * port, kontrolni znaki po normalizaciji). Zdaj oba meji uporabljata
 * isSafeHttpUrl(): pravi new URL() parse + eksplicitne zahteve spodaj.
 */

/** Zod refine shema za lastniške spletne strani (write meja). */
import { z } from "zod";

/**
 * Semantična preverba http(s) URL-ja (skupna write + read meja):
 *
 *   1. predpona http(s) (hitri izhod pred parsiranjem — doslednost s prej)
 *   2. new URL() uspešno parsira (zavrne malformed vnose, ki bi jih regex
 *      predstave kot URL: "https://", "https:///", "https://???" ...)
 *   3. protokol je http: ali https: (parser bi sicer sprejel tudi
 *      "https:x" oblike po normalizaciji — eksplicitno);
 *      http ostaja dovoljen zaradi obstoječih DB vrstic (ni varnostna
 *      lastnost ciljnega spletišča, ne naša vrzel)
 *   4. hostname obstaja in ni prazen
 *   5. BREZ userinfo (username:password@ — phishing indikator
 *      "https://zaupanja-vreden-izgled.com@evil.com")
 *   6. brez presledkov, kotir, kotir-znakov in kontrolnih znakov
 *      (tudi po normalizaciji parserja — preverimo surovi vnos)
 */
export function isSafeHttpUrl(u: string): boolean {
  if (!/^https?:\/\//.test(u)) return false;
  // Hitra zavrnitev očitno sovražnih znakov PRED parsiranjem (parser bi
  // nekatere preslikal v %XX — mi zavrnemo vnos, ne pa saniramo izpisa).
  if (/[\s<>"'`]/.test(u) || /[\u0000-\u001f\u007f]/.test(u)) return false;
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  return (
    (parsed.protocol === "https:" || parsed.protocol === "http:") &&
    parsed.hostname.length > 0 &&
    parsed.username === "" &&
    parsed.password === ""
  );
}

export const safeWebsiteSchema = z
  .string()
  .trim()
  .max(2048, "URL je predolg")
  .refine((u) => u.length === 0 || isSafeHttpUrl(u), {
    message: "URL se mora začeti s http:// ali https:// in biti veljaven naslov",
  })
  .nullable()
  .optional()
  .transform((u) => (u === "" ? null : u));

/** Render helper: http(s) URL ali "#" (nikoli javascript:/data:/…). */
export function safeExternalHref(url: string | null | undefined): string {
  if (!url) return "#";
  const trimmed = url.trim();
  return isSafeHttpUrl(trimmed) ? trimmed : "#";
}
