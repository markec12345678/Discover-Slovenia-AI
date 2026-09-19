// ============================================================================
// TRAVEL SUPPLY MAP — TIQETS: API KLIENT (Task 53)
// ============================================================================
// Tenek HTTP klient nad TIQETS DISTRIBUTOR API v2. KAJ JE ŽIVO PREVERJENO
// (curl, Task 53-1) in kaj je DOCUMENTED-ASSUMPTION:
//
// ŽIVO PREVERJENO:
//  - Host: https://api.tiqets.com (FIKSIRAN — brez base preklopa; sandbox
//    vir javno ni dokumentiran).
//  - GET /v2/products?city=amsterdam brez ključa → HTTP 401 + JSON napakovna
//    ovojnica {"success": false, "api_version": {major:2, minor:7},
//    "error": "unauthorized", "message": "The key is incorrect or the user
//    is not authorized to access this resource."} ⇒ vrata so ŽIVA, API je
//    v2, uspešna ovojnica pa po konvenciji {"success": true, "data": […]}.
//
// DOCUMENTED-ASSUMPTION (potrdi ob aktivaciji):
//  - IME GLAVE: "Api-Key". Celotna API referenca je ZA partner portalom
//    portals.tiqets.com (zahteva prijavo) — točno ime glave ključa ni
//    javno. Videne javne Tiqets integracije uporabljajo Api-Key; če bo
//    ob aktivaciji drugače, je to ENA vrstica spodaj (this.headers()).
//    ⇒ PREVERI IME GLAVE OB AKTIVACIJI (portal: portals.tiqets.com).
//  - Parametra valuta/jezik na /v2/products nista javno dokumentirana →
//    NE jih pošiljamo (NE ugibamo); posledica: cene preslikamo SAMO ob
//    izrecni valuti EUR v odgovoru (glej mapper.ts — iskrena odločitev).
//
// OSTALO (isti vzorec kot Viator/GYG klient):
//  - timeout (privzeto 8 s) + posredovanje AbortSignal (preklic odjemalca
//    se širi do vira);
//  - klasifikacija napak (unauthorized / rate-limited / forbidden /
//    bad-request / server / network / timeout / aborted / invalid-response)
//    — adapter po njej gradi negativni predpomnilnik (60 s, vzorec Task
//    44-b: okvara ključa se zapomni, vir NE dobija zaporednih klicev);
//  - 429: preberemo Retry-After kadar je podan in ga izpostavimo;
//    Tiqets NE dokumentira trajanja blokade (portal-gated) → adapter ne
//    ugiba, uporabi enotnih 60 s negativnega predpomnilnika;
//  - brez internega retry: ponovitev je nadzorovana (drsenje viewporta,
//    negativni predpomnilnik); izogibamo se "stormed retry" vzorcem.
//
// Konfiguracija (strežniški env, NIKOLI NEXT_PUBLIC_):
//   TIQETS_API_KEY — Distributor API ključ (izda Tiqets po odobritvi
//                     affiliate prijave na portalu). BREZ ključa je plast
//                     iskreno izklopljena (adapter: "not-configured").
//   (NI base preklopa — host je fiksen in živo preverjen.)
//
// Testi vbrizgajo lasten fetch (DI) — produkcijska pot nespremenjena.
// ============================================================================

export const TIQETS_DEFAULT_BASE = "https://api.tiqets.com";

/** Klassifikacija odpovedi vira (odločitve adapterja po njej). */
export type TiqetsErrorKind =
  | "unauthorized" // 401 — napačen/manjka ključ (ŽIVO preverjeno: vrata odgovorijo 401)
  | "forbidden" // 403 — račun nima dostopa do endpointa
  | "rate-limited" // 429 (+ Retry-After kadar je podan)
  | "bad-request" // 400 — naša zahteva je napačna (programska napaka)
  | "server" // 5xx — začasna odpoved vira
  | "network" // fetch vržen (DNS/TLS/ponastavitev)
  | "timeout" // naša časovna dira
  | "aborted" // preklic odjemalca (NI napaka vira)
  | "invalid-response"; // ne-JSON / ne-napovedana oblika ovojnice

export class TiqetsApiError extends Error {
  readonly kind: TiqetsErrorKind;
  readonly status?: number;
  /** Sekunde iz Retry-After (samo pri rate-limited, kadar jih vir poda). */
  readonly retryAfterSec?: number;

  constructor(
    kind: TiqetsErrorKind,
    message: string,
    opts: { status?: number; retryAfterSec?: number } = {}
  ) {
    super(message);
    this.name = "TiqetsApiError";
    this.kind = kind;
    this.status = opts.status;
    this.retryAfterSec = opts.retryAfterSec;
  }
}

export interface TiqetsClientConfig {
  apiKey: string;
  /** DI (testi); privzeto globalni fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Privzeti časovni proračun enega klica (krajše od runnerjeve dirе). */
const DEFAULT_TIMEOUT_MS = 8_000;

/** User-Agent z kontaktom (bonton do komercialnega vira z rate limiti). */
const USER_AGENT =
  "Mozilla/5.0 (compatible; DiscoverSlovenia/1.0; +https://discoverslovenia.si)";

/** Parametri iskanja produktov (živo preverjena oblika: city parameter). */
export interface TiqetsProductsSearchParams {
  /**
   * Ime mesta (ŽIVO opažena oblika: city=amsterdam — male črke).
   * DOCUMENTED-ASSUMPTION: semantika ujemanja (id vs ime, case) je
   * portal-gated — pošiljamo ime kanonske destinacije v malih črkah.
   */
  city: string;
}

export class TiqetsClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(cfg: TiqetsClientConfig) {
    const key = cfg.apiKey.trim();
    if (!key) throw new TiqetsApiError("unauthorized", "empty-api-key");
    this.apiKey = key;
    // Host je FIKSEN (živo preverjen) — bazni preklop ni podprt in ga
    // namerno NE omogočamo (brez javno dokumentiranega sandboxa).
    this.baseUrl = TIQETS_DEFAULT_BASE;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(1, cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  /**
   * Skupne glave. IME GLAVE "Api-Key" je DOCUMENTED-ASSUMPTION (celotna
   * referenca je za partner portalom portals.tiqets.com) — PREVERI IME
   * GLAVE OB AKTIVACIJI. Vrednost ključa zapušča proces SAMO v tej glavi
   * (nikoli v URL/query — logi ostanejo čisti).
   */
  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      "Api-Key": this.apiKey,
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      ...extra,
    };
  }

  /** En GET klic z dirо + klasifikacijo napak. */
  private async get(
    path: string,
    params: URLSearchParams,
    signal?: AbortSignal
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}?${params.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    // Zunanji preklic (odjemalčev signal) prekine tudi ta klic.
    const onOuterAbort = () => controller.abort();
    signal?.addEventListener("abort", onOuterAbort, { once: true });

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "GET",
        headers: this.headers(),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (e) {
      // Ločimo: preklic (naš timer ALI odjemalčev signal) omrežje.
      const aborted = controller.signal.aborted || signal?.aborted;
      const name = e instanceof Error ? e.name : "";
      if (aborted || name === "AbortError") {
        throw new TiqetsApiError(signal?.aborted ? "aborted" : "timeout", "aborted");
      }
      throw new TiqetsApiError("network", "fetch-failed");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onOuterAbort);
    }

    if (res.status === 429) {
      const ra = Number(res.headers.get("retry-after"));
      throw new TiqetsApiError("rate-limited", "HTTP 429", {
        status: 429,
        retryAfterSec: Number.isFinite(ra) && ra > 0 ? ra : undefined,
      });
    }
    if (res.status === 401) {
      throw new TiqetsApiError("unauthorized", "HTTP 401", { status: 401 });
    }
    if (res.status === 403) {
      throw new TiqetsApiError("forbidden", "HTTP 403", { status: 403 });
    }
    if (res.status === 400) {
      throw new TiqetsApiError("bad-request", "HTTP 400", { status: 400 });
    }
    if (res.status >= 500) {
      throw new TiqetsApiError("server", `HTTP ${res.status}`, {
        status: res.status,
      });
    }
    if (!res.ok) {
      throw new TiqetsApiError("server", `HTTP ${res.status}`, {
        status: res.status,
      });
    }

    try {
      return await res.json();
    } catch {
      throw new TiqetsApiError("invalid-response", "invalid-json");
    }
  }

  /**
   * GET /v2/products — produkti (vstopnice) po mestu. Živo preverjena
   * oblika parametra: city (mallе črke, sonda city=amsterdam).
   * Ostali parametri (paginacija, valuta, jezik) so portal-gated → NE
   * pošiljamo jih (ne ugibamo); adapter živi s kapom 48 produktov.
   *
   * Ovojnica: success === true + data tabela (konvencija iz živo
   * preverjene napakovne ovojnice). Vse ostalo → invalid-response
   * (fail-closed: NE delimo napakove ovojnice kot produktov).
   */
  async searchProducts(
    p: TiqetsProductsSearchParams,
    opts: { signal?: AbortSignal } = {}
  ): Promise<unknown[]> {
    const params = new URLSearchParams();
    params.set("city", p.city);
    const raw = await this.get("/v2/products", params, opts.signal);
    const body = raw as { success?: unknown; data?: unknown };
    if (
      !body ||
      typeof body !== "object" ||
      body.success !== true ||
      !Array.isArray(body.data)
    ) {
      // 200 s success:false ali brez data = napakovna/ne-napovedana
      // ovojnica — iskren invalid-response (adapter: negativni cache).
      throw new TiqetsApiError("invalid-response", "products-shape");
    }
    return body.data;
  }
}

// ---------------------------------------------------------------------------
// KONFIGURACIJA IZ ENV (strežniško; klient-varno — samo boolean/dejanski
// klient ostaja v route handlerjih)
// ---------------------------------------------------------------------------

/** Dejanski ključ (strežniško) ali null, če NI konfiguriran. */
export function tiqetsApiKeyFromEnv(): string | null {
  const key = process.env.TIQETS_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}
