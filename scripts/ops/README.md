# scripts/ops/ — DevOps avtomatizacijska suite (1.14.0)

Enoten nabor skript za namestitev, preverbo in vzdrževanje AI providerjev
(OpenRouter → Gemini → Puter → z-ai) prek lokalnega stroja, GitHuba,
Vercela in Renderja. **Vse, kar se da skriptati, JE skriptano** — kar ne
gre, ima pripravljeno skripto z jasnimi navodili (žetoni, ki jih mora
pridobiti uporabnik, skripta ne more namesto tebe prijaviti v tvoj račun).

## Kaj poženem kdaj

| Skripta | Namen | Kdaj pognati | Zahteve |
|---|---|---|---|
| `doctor.sh` | Konfiguracijska revizija vseh plasti (.env, gitignore, GitHub secreti, geo-blok, dev, DB) | vedno najprej; po vsaki spremembi | curl, jq |
| `openrouter-verify.sh` | Živi test OPENROUTER_API_KEY (key info + primarni model + fallback + JSON mode) | po nastavitvi ključa; pred deployom | ključ v `.env` |
| `gemini-verify.sh` | Živi test GEMINI_API_KEY s POŠTENO interpretacijo geo-bloka | po nastavitvi ključa | ključ v `.env` |
| `github-secret-set.sh` | Nastavi Actions secret (libsodium sealed box, PyNaCl) | nov/obnovljen ključ | git remote z žetonom ali `GITHUB_TOKEN`, `pynacl` |
| `github-secret-verify.sh` | Seznam secretov + preverba prisotnosti | po set; v CI | git remote z žetonom |
| `github-workflow-run.sh` | Sproži `ai-smoke.yml` in POČAKAJ rezultat (živi dokaz obeh ključev iz podprte regije) | pred deployom; po menjavi ključev | secret-i nastavljeni |
| `vercel-env-set.sh` | Nastavi env spremenljivko na Vercel (production+preview+development, idempotentno) | po deploy-setupu | `VERCEL_TOKEN`, project id |
| `render-env-set.sh` | Nastavi env na Render Z MERGE ZAŠČITO (ne zbriše ostalih!); `--sync` sproži nov deploy (1.36.2: novi `/v1` API + POST /deploys) | po deploy-setupu | `RENDER_API_KEY`, service id |
| `dev-health.sh` | Zdravje lokalnega strežnika + razlaga AI verige | med razvojem | tečeč `bun run dev` |
| `deploy-check.sh` | Produkcijski smoke test (rute + AI health) | po vsakem deployu | URL produkcije |
| `migrate-baseline.sh` | Enkratna uvedba migration baseline-a na Neon (1.27.1; danes samodejno prek startup koraka `migrate:baseline`) | samo za pred-1.30 baze / audite | Neon URL iz dashboarda |
| `migrate-deploy.sh` | Varni `prisma migrate deploy` na Neon IZ KLONA Z LOKALNO SQLITE SHEMEMO (1.36.1: validacija URL → status → flip na committed postgres → deploy → status → povrnitev; `--status` = read-only) | po vsaki shemski spremembi pred prometom | Neon URL iz dashboarda |
| `setup-all.sh` | Orkester: vse zgoraj + navodila za ročna koraka | nov stroj / nov ključ | — |

## Hitri začetek

```bash
cd scripts/ops
./setup-all.sh                          # vse avtomatizabilno + navodila
./github-workflow-run.sh                # živi CI dokaz ključev (US runner)
./dev-health.sh                         # lokalna veriga
```

## Pridobitev žetonov (samo to je ročno)

- **Vercel token**: <https://vercel.com/account/tokens> → Create Token.
  Project ID: Project → Settings → General → *Project ID* (`prj_…`).
- **Render API key**: <https://dashboard.render.com/u/settings#api-keys>.
  Service ID: Service → Settings → *Service ID* (`srv-…`).
- **GitHub žeton**: skripte ga vzamejo samodejno iz `git remote origin`
  (`x-access-token:…@github.com/…`) ali iz env `GITHUB_TOKEN`.
- **OpenRouter ključ**: <https://openrouter.ai/settings/keys> (free tier).
- **Gemini ključ**: <https://aistudio.google.com/apikey> (free tier).

```bash
# Zgled: nastavitev OBEH AI ključev na Vercel + Render
VERCEL_TOKEN=xxx VERCEL_PROJECT_ID=prj_xxx \
  ./vercel-env-set.sh OPENROUTER_API_KEY GEMINI_API_KEY
RENDER_API_KEY=rnd_xxx RENDER_SERVICE_ID=srv-xxx \
  ./render-env-set.sh OPENROUTER_API_KEY GEMINI_API_KEY
```

## Geo-blok ( zakaj Gemini lokalno morda ne deluje )

Google AI Studio geo-blokira nekatere regije (razvojni sandbox = Hong
Kong egress → HTTP 400 `User location is not supported`). **Ključ je
veljaven** — dokaz:

1. OpenRouter (primarni) deluje povsod,
2. `github-workflow-run.sh` poganja iste teste z GitHub runnerja (US) —
   tam Gemini odgovori 200.

Zato `gemini-verify.sh` 400 + "not supported" obravnava kot
»KLJUČ VELJAVEN, regija blokirana« (izhod 0 z opozorilom).

## Varnost

- Vsi ključi so **strežniški** env (`OPENROUTER_API_KEY`, `GEMINI_API_KEY`)
  — nikoli `NEXT_PUBLIC_`/`VITE_`.
- `.env` je gitignored; vrednosti se v izpisih **maskirajo** (prvi 4 + zadnji
  4 znaki).
- GitHub secret potuje šifriran (sealed box) — vrednost nikoli ni v repu,
  GitHub jo v logih samodejno maskira.
- Render `PUT /env-vars` **nadomesti celotno zbirko** — `render-env-set.sh`
  zato najprej prebere obstoječe in pošlje spojeno celoto (ostale
  spremenljivke ostanejo nedotaknjene).

## Kaj skripta NE more (iskrena meja)

- Prijaviti se v tvoj Vercel/Render/GitHub račun in *izdati* žeton —
  žetoni nastanejo ročno v UI platforme (zgornje povezave).
- Prebrati vrednosti GitHub secret-a nazaj (API jih ne vrača — varnostna
  lastnost GitHuba).
- Spremeniti vrstni red verige (`src/lib/ai-client.ts`) — to je koda, ne
  konfiguracija.
