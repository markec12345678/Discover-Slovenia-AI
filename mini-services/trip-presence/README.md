# trip-presence (mini-service)

**Issue #13 / P2-2 · UX-BENCHMARK 2026 §4 G2** — vzorec Wanderlog
„uredi v živo": prisotnostni indikator na strani deljene poti (`/pot/[shareId]`).

## Kaj je to

Socket.io servis na **prtuu 3003** (konstanta). Soba = `trip:{shareId}`.
Klienti dobivajo agregat `presence:state {viewers, editors:[{name}]}` —
**brez socket ID-jev in brez e-poštnih naslovov** (samo prijavno ime,
sanitizirano na 40 znakov).

## Varovalo (najpomembneje)

> Prisotnost je **ČISTO kozmetična plast**. CAS na `contentVersion`
> (TASK 28 live-sync) ostaja edina resnica o konfliktih pisanja.
> Ugasnjen/mrtv service → `/pot` deluje nespremenjeno (klient ima
> omejene reconnect poskuse in nato tiho odneha — ni spinnerjev, ni
> napak, ni prikaza).

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
