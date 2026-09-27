/**
 * E2E pomočnik za G2 (Issue #13 / P2-2): LAHKOTNI drugi klient prisotnosti
 * (bun + socket.io-client iz glavnih node_modules) — namenoma NE chromium,
 * da ne sežemo sandbox pomnilnika (OOM lekcija: 2 chromiuma + next-server
 * compile = kill).
 *
 * Uporaba: bun scripts/e2e-presence-peer.ts <shareId> [sekunde]
 * Izpis (JSON): dogodki presence:state, dokler ne poteče čas.
 */
import { io } from "socket.io-client";

const shareId = process.argv[2] ?? "e2eg3test1";
const seconds = Number(process.argv[3] ?? 12);

const sock = io("http://localhost:81", {
  // isti kanon kot frontend: gateway (:81) + path "/" + XTransformPort
  // query → caddy posreduje na mini-service port 3003 (RELATIVNO v
  // brskalniku; tu eksplicitno, ker je CLI klient brez stranega origina).
  path: "/",
  query: { XTransformPort: "3003" },
  reconnectionAttempts: 2,
  timeout: 4_000,
});

const events: unknown[] = [];

sock.on("connect", () => {
  sock.emit("presence:join", { shareId, name: "E2E-Peer" });
  // po 2 s simuliraj urejanje (typing signal)
  setTimeout(() => {
    sock.emit("presence:editing", { shareId });
    sock.emit("presence:editing", { shareId });
  }, 2_000);
});

sock.on("presence:state", (state) => {
  events.push(state);
  process.stdout.write(`STATE ${JSON.stringify(state)}\n`);
});

sock.on("connect_error", (e) => {
  process.stdout.write(`CONNECT_ERROR ${e.message}\n`);
});

setTimeout(() => {
  sock.close();
  process.stdout.write(
    `DONE ${JSON.stringify({ events: events.length, connected: sock.connected })}\n`
  );
  process.exit(0);
}, seconds * 1_000);
