/**
 * presence-core — ČISTA prisotnostna logika za trip-presence mini-service
 * (Issue #13 / P2-2 · UX-BENCHMARK 2026 §4 G2).
 *
 * ZERO odvisnosti (brez socket.io) → bun-testabilna v glavnem CI-ju
 * (vzorec: source-contract testi tega repa + unit nad čisto funkcijo).
 * index.ts te funkcije OBLAČI v socket.io dogodke.
 *
 * Model (dokumentiran v docs/UX-BENCHMARK-2026-09-27.md §4 P2-2):
 * - soba = en deljen itinerer (trip:{shareId})
 * - prisotnost = seznam socketov v sobi; vsak nosi {name|null, isAuthed}
 * - "ureja" signal = eksplicitni client dogodek (tipkanje), velja
 *   EDIT_TTL_MS po zadnjem signalu (isločena resnica — NE ugibamo iz
 *   povezave)
 * - varovalo: CAS ostaja edina resnica o konfliktih; prisotnost je ČISTO
 *   kozmetična plast (izklopljen service = vse deluje naprej)
 */

/** Koliko časa po zadnjem editing-signalu socket še šteje za "ureja". */
export const EDIT_TTL_MS = 6_000;

/** Interval oddajanja stanja sobe (heartbeat). */
export const BROADCAST_INTERVAL_MS = 2_000;

/** Prikazna identiteta enega prisotnega socketa. */
export interface PresencePeer {
  /** Socket ID — INTERNO (odjemalcem pošljemo SAMO agregat, ne ID-jev). */
  socketId: string;
  /** Prijavno ime (session.user.name) ali NULL za anonimnega obiskovalca. */
  name: string | null;
  /** Timestamp zadnjega editing signala (0 = nikoli). */
  editingAt: number;
}

/** Kar klient prejme (agregat sobe — BREZ socket ID-jev). */
export interface PresenceState {
  /** Skupno število prisotnih (vključno z opazovalcem samim). */
  viewers: number;
  /** Urejevalci, ki so poslali editing signal v zadnjih EDIT_TTL_MS. */
  editors: Array<{ name: string | null }>;
}

/** Sanitizacija imena: trim, max 40 znakov, prepoved kontrolnih znakov,
 *  prazno → null (anonimen obiskovalec). Iskrenost: NE izmišljamo imen. */
export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    // kontrolni znaki ven (vključno z newline/tab)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 40);
  return cleaned.length > 0 ? cleaned : null;
}

/** Validacija shareId sobe: hex/alnum 1–32 (isti RE kanon kot /pot stran). */
export function isValidShareId(raw: unknown): raw is string {
  return typeof raw === "string" && /^[a-z0-9]{1,32}$/.test(raw);
}

/** Zgradi agregirano stanje sobe iz seznama vrstnikov.
 *  Čas `now` se poda od zunaj (testabilnost; v runtime Date.now()). */
export function buildState(peers: PresencePeer[], now: number): PresenceState {
  const editors = peers
    .filter((p) => now - p.editingAt < EDIT_TTL_MS && p.editingAt > 0)
    .map((p) => ({ name: p.name }));
  return { viewers: peers.length, editors };
}

/** Ali naj socket velja še za urejevalca? (izpostavljeno za test). */
export function isEditing(peer: PresencePeer, now: number): boolean {
  return peer.editingAt > 0 && now - peer.editingAt < EDIT_TTL_MS;
}
