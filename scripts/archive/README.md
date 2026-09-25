# scripts/archive/ — Zgodovinski enkratni skripti (arhiv M9)

Arhiv **enkratnih, dokončanih zgodovinskih skript** iz Issue #5 (T5-D / M9):
kampanje popravljania slik (VLM presoje, image-search, regeneracije), enkratni
DB popravci/backfilli ter E2E semeni/čiščenja. Skripte so se obnesle svojemu
namenu in **niso del živih operacij** — živi inventar je v `scripts/ops/`
(glej `scripts/ops/README.md`), `scripts/verify/`, `scripts/seed-demo.ts`,
`scripts/ingest-*.ts` in `scripts/cron-runner.ts`.

Arhivirano: **2026-09-25** (Issue #5, T5-D valu popravkov 2, točka M9).

## Status: še vedno se prevedejo, niso pa več „na voljo“

- `tsconfig.json` vključuje `**/*.ts`, zato arhivirane skripte **še vedno
  tipizira** `bunx tsc --noEmit` — uvozi so prek `@/` aliasov, ki se razrešijo
  iz katerekoli lokacije. Ob arhiviranju so bili relativni uvozi
  (`../src/lib/…`) v `audit-content-images.ts` in
  `run-trip-collaborator-migration.ts` prestavljeni na `@/lib/…`.
- **NE poganjaj jih iz razumevanja „pa probajmo“**: mnoge odvisnosti več ne
  obstajajo (batch datoteke v `/tmp/*`, stara pot projekta
  `/home/z/Discover-Slovenia-AI` v dokumentacijskih komentarjih glav,
  VLM/image-search ključi z-ai-web-dev-sdk). So **zgodovinski dokaz**, ne orodje.
- Omembe teh skript v zgodovinskih dokumentih (npr.
  `docs/audit/t5-a3-capabilities-…md`, `CHANGELOG.md`) in v komentarjih kode
  (`src/lib/commissions.ts`, `src/lib/marketplace-image-migration.ts`) so
  **puščene stale** — opisujejo čas nastanka, ne trenutno stanje.

## Tier 1 — kampanje popravljania slik / VLM (enkratne)

| Skripta | Izvorna pot | Prvotni namen (iz glave datoteke) |
|---|---|---|
| `audit-content-images.ts` | `scripts/` | VLM presoja VSEH vsebinskih slik (destinacije + dogodki + blog + hero); izhod `image-audit-report.json` |
| `fetch-all-images.ts` | `scripts/` | image-search pridobivanje kandidatov za problematične lokalce → `/tmp/image-candidates.json` |
| `find-duplicate-images.ts` | `scripts/` | iskanje duplikatov slik lokalcev v DB (isti URL na več entitetah) |
| `fix-listing-images.ts` | `scripts/` | poprava slik lokalcev: image-search kandidat → VLM preverba → posodobitev DB (do 3 kandidatov) |
| `fix-problematic-images.ts` | `scripts/` | ciljana popravka slik za lokalce z očitno napačnimi slikami (iz VLM preverbe) |
| `regen-marketplace-images.ts` | `scripts/` | regeneracija 31 tržnih slik (listings/experiences/products) — AI prompti iz opisov entitet → `public/content/marketplace/` |
| `regen-mismatched-images.ts` | `scripts/` | regeneracija 11 neujemajočih slik — natančni prompti iz besedila → `public/content/<id>.jpg` |
| `replace-listing-images.ts` | `scripts/` | hitra nadomestitev slik lokalcev z image-search (brez VLM preverbe) |
| `update-experience-images.ts` | `scripts/` | posodobitev slik izkušenj v DB iz `/tmp/exp-batch{1,2,3}.json` |
| `update-listing-images.ts` | `scripts/` | posodobitev slik v DB iz `/tmp/all-image-candidates.json` (prvi kandidat po lokal) |
| `update-product-images.ts` | `scripts/` | posodobitev slik izdelkov v DB iz `/tmp/products-batch{1,2,3}.json` |
| `verify-listing-images.ts` | `scripts/` | VLM verifikacija: ali slika lokalca prikazuje pravi objekt; neustrezne označi za popravilo |
| `verify-marketplace-images.ts` | `scripts/` | VLM verifikacija 31 tržnih slik (base64 lokalne datoteke, resume) → `marketplace-verify-report.json` |
| `verify-new-images.ts` | `scripts/` | VLM verifikacija novih/regeneriranih slik → `image-verify-report.json` |
| `migrate-cdn-images.ts` | `scripts/` | migracija CDN slik (`sfile.chatglm.cn`) na lokalno gostovanje: prenos + sharp optimizacija + zamenjava URL-jev v izvornih datotekah |
| `image-fix-data/` | `scripts/image-fix-data/` | podatki kampanje: `queries.json` (image-search poizvedbe po slug-ih), `results.json` (pridobljeni URL-ji), `run-search.py` (resumable zaganjalnik z 3 s pavzo) |

## Tier 2 — enkratni DB popravci / semeni / čiščenja

| Skripta | Izvorna pot | Prvotni namen (iz glave datoteke) |
|---|---|---|
| `e2e-4a-seed.ts` | `scripts/` | Faza 4a E2E seed provizijskega modela: testni owner + 2 atribuirani rezervaciji (prejšnji/tekoči mesec) |
| `e2e-4a-cleanup.ts` | `scripts/` | Faza 4a E2E cleanup — vrstni red pomemben (SetNull relacije: Booking → Experience → … → Owner) |
| `cleanup-test.ts` | `scripts/` | brisanje testnih sponsorship vrstic + reset `sponsored` statusov lokalcev |
| `migrate-partner-status.ts` | `scripts/` | migracija `featured`/`verified`/`plan` → novi `partnerStatus` + `partnerSince = createdAt` |
| `verify-migration.ts` | `scripts/` | kontrola po migraciji: izpis vzorca listings/owners (status, partnerStatus, plan) |
| `fix-listings-data.ts` | `scripts/` | poprava napačnih telefonov/naslovov/opisov lokalcev po slug-ih + izbris testnega „Owner2 Hotel“ |
| `check-db.ts` | `scripts/` | kontrola stanja listinga „Hotel Grad Otočec“ (partnerStatus/partnerSince/premiumUntil) |
| `get-ids.ts` | `scripts/` | izpis ID-jev listinga/ownerjev za ročno DB delo |
| `gen-icons.ts` | `scripts/` | enkratni generator PWA ikon (`icon-192/512.png`) s sharp — glava sama pravi: „po uspešnem zagonu lahko skripto pobrišemo“ |
| `fix-wave1-backfill.ts` | `scripts/db/` | FW1 backfill (audit R3): demo atribuirane rezervacije → `paymentStatus "paid"` + normalizacija `Experience.providerEmail` na `owner.email` |
| `fw1-test-setup.ts` | `scripts/db/` | FW1 adversarial test SETUP na produkcijski DB (konzultacija, test izdelek, owner, 2 rezervaciji — FW1TEST markerji) |
| `fw1-test-cleanup.ts` | `scripts/db/` | FW1 adversarial test CLEANUP — idempotenten |
| `p8-cleanup.ts` | `scripts/db/` | P8 E2E cleanup: izbris testnih rezervacij (p8-e2e-race) + povratek `bookingCount` |
| `restore-demo-ratings.ts` | `scripts/db/` | P4-9 (ZAČASNO): povrnitev demo rating/reviewCount, dokler ni bil deployan pogojni prikaz ocen |
| `zero-demo-ratings.ts` | `scripts/db/` | P4-9: ničenje izmišljenih demo ocen („4.9★ (847)“) — pogoj: deployan commit 718e88f+ |
| `retire-demo-accounts.ts` | `scripts/db/` | P7-A: izbris admin demo računa + rotacija gesel demo lastnikov (znana gesla v produkciji, tokenVersion++) |
| `run-trip-collaborator-migration.ts` | `scripts/db/` | enkratni zagon additivne migracije Issue #4 §13 — isto logiko danes ob vsakem zagonu izvede `src/instrumentation.ts` (fail-open) |

## Kaj NI v arhivu (preverjene žive reference)

- **`scripts/db/p9-smoke-cleanup.ts`** — ostal na mestu: živi
  `scripts/verify/production-smoke.sh` (README.md, korak „Po deployu“) ga v
  načinih `SMOKE_BOOKING=1` / `SMOKE_NEWSLETTER=1` izpiše kot uradno cleanup
  komando.
- **`scripts/client-test.d.ts`** — ostal na mestu: ambientna deklaracija
  modula `*.prisma/client-test`, ki jo še potrebujejo žive skripte
  `scripts/test-marketplace-migration.ts` in `scripts/test-listing-practical.ts`
  (brez nje `next build` pade s TS2307).

## Kako obnoviti skripto

Zgodovina je ohranjena (premik je bil narejen z `git mv`). Obnovitev v živi
inventar je en ukaz:

```bash
git mv scripts/archive/<skripta>.ts scripts/<skripta>.ts          # iz root ravni
# ali za nekdanje db/ skripte:
git mv scripts/archive/fix-wave1-backfill.ts scripts/db/fix-wave1-backfill.ts
git mv scripts/archive/image-fix-data scripts/image-fix-data      # celotna mapa
```

Uvozi prek `@/` aliasov delujejo iz obeh lokacij — po obnovitvi ni treba nič
prilagajati (edina izjema: `gen-icons.ts` računa `public/` iz `__dirname`,
zato po obnovitvi preveri pot, če jo boš poganjal).
