// Gostiteljsko-zavedna baza URL-jev (MONET-10).
//
// ZAKAJ: platforma je dejansko dosegljiva na VEČ gostiteljih
//   (i-feel-slovenia.onrender.com, i-feel-slovenia.vercel.app, lokalno,
//    prihodnja domena discoverslovenia.ai), metadataBase pa je statičen.
// Posledica prej: sitemap.xml je z onrender.com strenil URL-je
// discoverslovenia.ai → Google/Bing ZAVRNEJO cross-host sitemap v celoti,
// canonicali in OG slike pa kažejo na domeno, ki ne streže ničesar.
//
// REŠITEV: robots.txt / sitemap.xml / llms.txt / rss.xml se generirajo
// PER GOSTITELJ (iz zahteve), z STROGO allowlisto — preprečuje
// host-header injection (naprimer Host: evil.com ne sme izsiliti
// sitemap-a z evil.com URL-ji).

export const DEFAULT_BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
  "https://discoverslovenia.ai";

// Končnice dovoljenih platform (Render/Vercel preview+produkcija).
const ALLOWED_HOST_SUFFIXES = [".onrender.com", ".vercel.app"] as const;

// Eksplicitni gostitelji (primarna domena + lokalni razvoj).
const ALLOWED_EXACT_HOSTS = new Set([
  "discoverslovenia.ai",
  "www.discoverslovenia.ai",
  "localhost",
  "127.0.0.1",
]);

/** Normalizira Host glavo: odstrani port, presledke, male črke. */
function normalizeHostname(raw: string | null): string {
  if (!raw) return "";
  return raw.trim().toLowerCase().split(",")[0].split(":")[0].trim();
}

/**
 * Ali je gostitelj dovoljen za generiranje URL-jev?
 * Pika pred končnico je OBVEZNA (evil-onrender.com NE ujame .onrender.com).
 */
export function isAllowedHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (!h || h.includes("/") || h.includes("\\") || h.includes(" ")) {
    return false;
  }
  if (h.split(":")[0] !== h) return false; // port že odstranjen ali nedovoljen
  if (ALLOWED_EXACT_HOSTS.has(h)) return true;
  return ALLOWED_HOST_SUFFIXES.some(
    (sfx) => h.endsWith(sfx) && h.length > sfx.length,
  );
}

/**
 * Izpelje bazo URL-jev iz glav zahteve (x-forwarded-host > host),
 * omejeno na allowlisto. Nedovoljen/nepoznan gostitelj → privzeta domena.
 *
 * Uporaba v strežniških route handlerjih (robots/sitemap/llms/rss) in v
 * root generateMetadata (host-zavedni metadataBase za OG/canonical).
 */
export function resolveBaseUrlFromHeaders(h: Headers): string {
  const fwd = h.get("x-forwarded-host");
  const rawHost = fwd ? fwd.split(",")[0] : h.get("host");
  const hostname = normalizeHostname(rawHost);

  if (!isAllowedHost(hostname)) {
    return DEFAULT_BASE_URL;
  }

  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  // Port ohranimo samo lokalno (http://localhost:3000); produkcijski
  // gostitelji tečejo na :443 za TLS terminacijo platforme.
  const port = rawHost && !isLocal ? "" : extractPort(rawHost);
  const proto = isLocal ? "http" : "https";

  return `${proto}://${hostname}${port}`;
}

/** Obljuba za route handlerje (Request ima .headers). */
export function resolveBaseUrl(req: Request): string {
  return resolveBaseUrlFromHeaders(req.headers);
}

function extractPort(rawHost: string | null): string {
  if (!rawHost) return "";
  const m = rawHost.match(/:(\d{1,5})$/);
  return m && Number(m[1]) > 0 && Number(m[1]) < 65536 ? `:${m[1]}` : "";
}
