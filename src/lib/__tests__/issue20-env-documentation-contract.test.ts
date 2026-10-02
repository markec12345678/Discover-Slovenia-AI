/**
 * ISSUE #20 §5/§6/§11/§12 — POGODBENSKI TEST ENV DOKUMENTACIJE (1.163.4)
 *
 * NAMEN: pripravljenost na vstavitev zunanjih ključev (Stripe račun,
 * Viator/affiliate/SendGrid žetoni …). Vsako produkcijsko env ime, ki ga
 * koda bere (src brez testov, scripts, next.config.ts), MORA biti
 * dokumentirano v .env.example (aktivno ali komentirano `#IME=`) — sicer
 * uporabnik ne ve, katero ime naj nastavi v Render/Vercel nadzorni plošči,
 * in ključ »ne deluje« čez noč.
 *
 * Obratna smer: dokumentirano ime, ki ga koda ne bere (in ni izrecna
 * izjema), je MRTVA dokumentacija → odstrani (primer: APP_URL, odstranjen
 * 1.163.4). Preprečuje »nastavi ključ, ki ne stori nič«.
 *
 * Omejitve (izrecno): regex lovi SAMO statični dostop `process.env.IME`;
 * dinamični dostop (process.env[spremenljivka]) ni zajet. Platforma
 * (Vercel/Node) sama postavi VERCEL_URL ipd. — ne uporabnik. Bash skripte
 * (scripts/ops/*.sh) berejo VERCEL_* — izrecna izjema spodaj. STRIPE_
 * PUBLISHABLE_KEY je izrecno označen NEBRAAN (čisti strežniški redirect
 * tok od 1.158.0) — varuje ga poseben test.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

/** Vse .ts/.tsx datoteke v mapi (glob), izključno __tests__ in node_modules. */
function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(rel, acc);
    } else if (/\.(ts|tsx)$/.test(name)) {
      acc.push(rel);
    }
  }
  return acc;
}

/** process.env.IME → datoteke, kjer se bere (produkcijska koda, brez testov). */
function productionEnvReads(): Map<string, string[]> {
  const files = [...walk("src"), ...walk("scripts"), "next.config.ts"];
  const reads = new Map<string, string[]>();
  for (const rel of files) {
    const content = readFileSync(join(ROOT, rel), "utf8");
    for (const m of content.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      const list = reads.get(m[1]) ?? [];
      if (!list.includes(rel)) list.push(rel);
      reads.set(m[1], list);
    }
  }
  return reads;
}

/** Imena iz .env.example — aktivna IN komentirana (`#IME=`) oblika. */
function documentedEnvNames(): Set<string> {
  const names = new Set<string>();
  for (const line of readFileSync(join(ROOT, ".env.example"), "utf8").split("\n")) {
    const m = line.match(/^#?\s*([A-Z0-9_]+)=/);
    if (m) names.add(m[1]);
  }
  return names;
}

/** Env, ki ga postavi PLATFORMA (Vercel/Node) — ne uporabnik. */
const PLATFORM_ENV = new Set([
  "NODE_ENV",
  "NEXT_RUNTIME",
  "TZ",
  "VERCEL",
  "VERCEL_URL",
  "VERCEL_REGION",
]);

/** Dokumentirano, a brano IZVEN .ts (bash skripte) ali izrecno NEBRAAN. */
const DOCUMENTED_EXCEPTIONS = new Set([
  "VERCEL_TOKEN", // scripts/ops/vercel-env-set.sh + deploy-check.sh (deploy orodja)
  "VERCEL_PROJECT_ID",
  "VERCEL_PROJECT_NAME",
  "STRIPE_PUBLISHABLE_KEY", // čisti strežniški redirect tok — pošteno označen NEBRAAN
]);

describe("ISSUE #20 — pogodba env dokumentacije (pripravljenost ključev, 1.163.4)", () => {
  test("vsako produkcijsko process.env.IME je dokumentirano v .env.example (ali platformsko)", () => {
    const reads = productionEnvReads();
    const doc = documentedEnvNames();
    const missing = [...reads.entries()]
      .filter(([name]) => !doc.has(name) && !PLATFORM_ENV.has(name))
      .map(([name, files]) => `${name} (brano v: ${files.join(", ")})`);
    expect(
      missing,
      `Manjkajoča env imena v .env.example (uporabnik ne ve, kaj naj nastavi):\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  test("JOURNEY_PROVIDER_TOKEN: dokumentiran + bran v PATCH kanalu (fail-closed 503, timing-safe)", () => {
    expect(documentedEnvNames().has("JOURNEY_PROVIDER_TOKEN")).toBe(true);
    const route = readFileSync(
      join(ROOT, "src/app/api/journey/bookings/route.ts"),
      "utf8",
    );
    expect(route).toContain("process.env.JOURNEY_PROVIDER_TOKEN");
    expect(route).toContain("Kanal provider prehodov ni konfiguriran");
    expect(route).toContain("timingSafeEqual");
  });

  test("STRIPE_PUBLISHABLE_KEY: pošteno označen NEBRAAN in res ni bran (redirect tok)", () => {
    const example = readFileSync(join(ROOT, ".env.example"), "utf8");
    expect(example).toContain("STRIPE_PUBLISHABLE_KEY NI POTREBEN");
    expect(example).not.toMatch(/^STRIPE_PUBLISHABLE_KEY=/m); // nikoli aktivna vrstica
    expect(productionEnvReads().has("STRIPE_PUBLISHABLE_KEY")).toBe(false);
  });

  test("APP_URL: mrtva dokumentacija ODSTRANJENA (ime nikjer več brano)", () => {
    const example = readFileSync(join(ROOT, ".env.example"), "utf8");
    expect(example).not.toMatch(/^#?\s*APP_URL=/m);
    expect(productionEnvReads().has("APP_URL")).toBe(false);
  });

  test(".env.example brez mrtvih vnosov: dokumentirano ⇒ brano ali izrecna izjema", () => {
    const reads = productionEnvReads();
    const dead = [...documentedEnvNames()].filter(
      (name) => !reads.has(name) && !PLATFORM_ENV.has(name) && !DOCUMENTED_EXCEPTIONS.has(name),
    );
    expect(
      dead,
      `Mrtvi env vnosi v .env.example (nikjer brani — nastavitev ne stori nič): ${dead.join(", ")}`,
    ).toEqual([]);
  });
});
