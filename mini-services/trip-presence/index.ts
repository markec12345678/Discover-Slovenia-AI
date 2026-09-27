/**
 * trip-presence — mini-service za PRISOTNOST ob deljeni poti (Issue #13 /
 * P2-2 · UX-BENCHMARK 2026 §4 G2 — vzorec Wanderlog „uredi v živo").
 *
 * Zunanji vstop: socket.io na portu 3003 (KONSTANTA po projektnem kanonu
 * mini-servisov — glej README). Klient se povezuje RELATIVNO:
 *   io("/?XTransformPort=3003")  → Caddy gateway posreduje sem.
 *
 * Dogodki (client → server):
 *   "presence:join"    {shareId, name|null}  — vstop v sobo trip:{shareId}
 *   "presence:editing" {shareId}             — heartbeat "jaz urejam"
 *   ob disconnect: samodejni izstop
 *
 * Dogodki (server → client, oddaja vso sobo):
 *   "presence:state" {viewers, editors:[{name}]} — agregat BREZ socket ID
 *
 * VAROVALO (načrt Issue #13): prisotnost je ČISTO kozmetična plast.
 * CAS (compare-and-swap na contentVersion) ostaja EDINA resnica o
 * konfliktih pisanja; izklopljen/mrtv service = /pot deluje nespremenjeno
 * (klient ima omejene reconnect poskuse in nato tiho odneha).
 *
 * Zagon: bun run dev  (bun --hot — avto-restart ob spremembi)
 * Testi: presence-core.ts je zero-dep; glavni CI ga pokrije prek
 * source-contract testa (mini-services/trip-presence/presence-core.test.ts).
 */
import { Server, type Socket } from "socket.io";
import {
  BROADCAST_INTERVAL_MS,
  buildState,
  isValidShareId,
  sanitizeName,
  type PresencePeer,
} from "./presence-core";

const PORT = 3003;

// soba → socketId → vrstnik (en socket je vedno v NATANČNO eni sobi)
const rooms = new Map<string, Map<string, PresencePeer>>();

const io = new Server(PORT, {
  // Kanon sandboxa: klient se povezuje io("/?XTransformPort=3003") —
  // path "/" (ne privzeti /socket.io), da gateway pravilo brez dvoma
  // zadene. Caddy posreduje celoten HTTP + WS upgrade.
  path: "/",
  cors: { origin: true, credentials: false },
});

function roomOf(socket: Socket): string | null {
  for (const [room, peers] of rooms) {
    if (peers.has(socket.id)) return room;
  }
  return null;
}

function emitRoom(shareId: string): void {
  const peers = rooms.get(shareId);
  if (!peers) return;
  const state = buildState([...peers.values()], Date.now());
  io.to(`trip:${shareId}`).emit("presence:state", state);
}

io.on("connection", (socket) => {
  console.log(`[trip-presence] connection sid=${socket.id.slice(0, 6)}`);
  socket.on("presence:join", (raw: unknown) => {
    console.log(
      `[trip-presence] join sid=${socket.id.slice(0, 6)} payload=${JSON.stringify(raw).slice(0, 80)}`
    );
    // Obrambno parsanje (nika ne zaupamo klientu):
    const payload = (raw ?? {}) as { shareId?: unknown; name?: unknown };
    if (!isValidShareId(payload.shareId)) {
      console.log(`[trip-presence] join ZAVRNJEN (neveljaven shareId)`);
      return; // tiho — neveljavna soba
    }
    const shareId = payload.shareId;
    const name = sanitizeName(payload.name);

    // En socket = ena soba (prejšnjo zapusti, če obstaja).
    const prev = roomOf(socket);
    if (prev && prev !== shareId) {
      rooms.get(prev)?.delete(socket.id);
      if (rooms.get(prev)?.size === 0) rooms.delete(prev);
      emitRoom(prev);
    }

    let peers = rooms.get(shareId);
    if (!peers) {
      peers = new Map();
      rooms.set(shareId, peers);
    }
    peers.set(socket.id, { socketId: socket.id, name, editingAt: 0 });
    socket.join(`trip:${shareId}`);
    emitRoom(shareId);
  });

  socket.on("presence:editing", (raw: unknown) => {
    const shareId = roomOf(socket);
    if (!shareId) return;
    const peers = rooms.get(shareId);
    const peer = peers?.get(socket.id);
    if (!peer) return;
    // shareId v payloadu ignoriramo — soba je resnica strežnika.
    void raw;
    peer.editingAt = Date.now();
  });

  socket.on("disconnect", () => {
    const shareId = roomOf(socket);
    if (!shareId) return;
    rooms.get(shareId)?.delete(socket.id);
    if (rooms.get(shareId)?.size === 0) rooms.delete(shareId);
    emitRoom(shareId);
  });
});

// Heartbeat: stanje vsake sobe na vsake 2 s (TTL urejanja 6 s → klient
// vidi "ureja" najkasneje 2 s po izteku, brez lastnega časovnika).
setInterval(() => {
  for (const shareId of rooms.keys()) emitRoom(shareId);
}, BROADCAST_INTERVAL_MS);

// (import.meta.main ne uporabimo — service vedno teče kot proces)
console.log(`[trip-presence] socket.io posluša na :${PORT}`);
