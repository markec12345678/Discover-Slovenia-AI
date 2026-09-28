# trip-presence (mini-service)

**Issue #13 / P2-2 · UX-BENCHMARK 2026 §4 G2** — vzorec Wanderlog
„uredi v živo": prisotnostni indikator na strani deljene poti (`/pot/[shareId]`).
**W2 (Issue #15, 1.131.0)** — razširitev za skupinski klepet z @AI: signal
`chat:signal` → broadcast `chat:new` (pospešitev pollinga, brez vsebine).

## Kaj je to

Socket.io servis na **prtuu 3003** (konstanta). Soba = `trip:{shareId}`.
Klienti dobivajo agregat `presence:state {viewers, editors:[{name}]}` —
**brez socket ID-jev in brez e-poštnih naslovov** (samo prijavno ime,
sanitizirano na 40 znakov).

### Dogodki

| Smer | Dogodek | Tovor | Pomen |
|---|---|---|---|
| ← klient | `presence:join` | `{shareId, name\|null}` | vstop v sobo |
| ← klient | `presence:editing` | `{shareId}` | heartbeat „jaz urejam" (TTL 6 s) |
| ← klient | `chat:signal` | `{shareId, commentId?}` | W2: objavljena nova vrstica klepeta (DB je resnica — vsebina NE potuje sem) |
| → soba | `presence:state` | `{viewers, editors:[{name}]}` | agregat (vsakih 2 s / ob spremembi) |
| → soba | `chat:new` | `{commentId?, at}` | W2: takojšen dotik `?since=` pollinga prisotnih |

## Varovalo (najpomembneje)

> Prisotnost (in `chat:new`) sta **ČISTO KOZMETIČNI PLASTI**. CAS na
> `contentVersion` (TASK 28 live-sync) in vrstice `TripComment` (DB) ostajata
> edini resnici. Ugasnjen/mrtv service → `/pot` deluje nespremenjeno
> (klepet osvežuje polling na 6 s; klient ima omejene reconnect poskuse
> in nato tiho odneha — ni spinnerjev, ni napak, ni prikaza).

## Zagon

```bash
cd mini-services/trip-presence
bun install
bun run dev        # bun --hot — avto-restart ob spremembi
```

Sandbox razvoj: klient se povezuje **relativno** prek Caddy gatewaya:
`io("/?XTransformPort=3003")` (path ostane `/socket.io`, gateway
razloži po query parametru).

## Produkcija

Ta service teče **izven Vercela** (Vercel ne hosta dolgoživih socket
procesov). Lastnik ga lahko zgane na katerem koli strežniku (npr. isti
host kot Render dislokacija) in izpostavi za `wss://` — dokler ne teče,
frontend iskreno ne prikazuje ničesar (ista vzdrževalna resnica kot
G3 email-forward: kanal, ki ne obstaja, se NE lažna).

## Testi

`presence-core.ts` je zero-dep (BREZ socket.io) — glavni CI ga testira
prek `presence-core.test.ts` (bun test najde datoteko iz roota).
