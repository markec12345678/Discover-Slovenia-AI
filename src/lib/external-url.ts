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
 */

/** Zod refine shema za lastniške spletne strani (write meja). */
import { z } from "zod";

export const safeWebsiteSchema = z
  .string()
  .trim()
  .max(2048, "URL je predolg")
  .refine(
    (u) =>
      u.length === 0 ||
      (/^https?:\/\//.test(u) &&
        // Osnovna sanacija hosta: brez presledkov/kontrolnih znakov
        !/[\s<>"']/.test(u)),
    "URL se mora začeti s http:// ali https://"
  )
  .nullable()
  .optional()
  .transform((u) => (u === "" ? null : u));

/** Render helper: http(s) URL ali "#" (nikoli javascript:/data:/…). */
export function safeExternalHref(url: string | null | undefined): string {
  if (!url) return "#";
  const trimmed = url.trim();
  if (/^https?:\/\//.test(trimmed) && !/[\s<>"']/.test(trimmed)) {
    return trimmed;
  }
  return "#";
}
