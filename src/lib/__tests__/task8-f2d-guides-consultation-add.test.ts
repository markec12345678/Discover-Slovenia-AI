// TASK 8 / F2-D — SOURCE-CONTRACT testi: kanonski AddToTripButton na
// vodičih (detail /vodici/[slug] + seznam /vodici) in konzultaciji
// (/konzultacija/[token]) — Issue #8 Faza 2, postavka „blog/konzultacijski
// dodaj" iz regresijske matrike (docs/audit/task8-feature-regression-matrix.md).
//
// Vzorec: readFileSync dejanskih datotek (isto kot task8-d-add-to-trip-surfaces
// .test.ts) — varovalke pred (a) nehote odstranjenim kanonskim dodajanjem,
// (b) izgubo obstoječih akcij (ZERO FEATURE LOSS), (c) razkritjem zasebne
// vsebine konzultacije vnanjemu svetu (žeton/odgovor NE sme priti do
// client ovojnika ali katerekoli omrežne zahteve).
//
// Stran /vodici/[slug] ostaja SSG (generateStaticParams) in konzultacija
// ostaja strežniška RSC (force-dynamic) — dodajanje gre čez client ovojnik
// po vzorcu destination-add-to-trip.tsx (D8-D).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

// ─────────────────────────────────────────────────────────────────────────
// 1. CLIENT OVOJNIKA — primitiva, kind, source, href (vzorec D8-D wrapper)
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 8 / F2-D: guide-add-to-trip client ovojnik", () => {
  const src = source("src/components/guide-add-to-trip.tsx");

  test('je "use client" (server SSG strani ostanejo strežniške)', () => {
    expect(src).toContain('"use client"');
  });

  test("izrisuje KANONSKI AddToTripButton (uvoz + posredovanje variante)", () => {
    expect(src).toContain('from "@/components/add-to-trip-button"');
    expect(src).toContain("<AddToTripButton variant={variant}");
  });

  test("predmet zbirke: kind guide + identiteta slug + privzeti source/href", () => {
    expect(src).toContain('kind: "guide"');
    expect(src).toContain("refId: slug");
    expect(src).toContain('source ?? "vodici"');
    expect(src).toContain("href ?? `/vodici/${encodeURIComponent(slug)}`");
    // privzeta varianta je full (detail stran); seznam jo prepiše na compact
    expect(src).toContain('variant = "full"');
  });

  test("sprejema SAMO PODATKE — brez lastnih UI besedil (primitiva ima SL/EN)", () => {
    // ovojnik ne sme vsebovati lastnih vidnih nizov — besedila nosi
    // AddToTripButton (useLocale vzorec, D8-B §3.2)
    expect(src).not.toContain("Dodaj v mojo pot");
    expect(src).not.toContain("Add to my trip");
  });
});

describe("TASK 8 / F2-D: consultation-destination-add client ovojnik", () => {
  const src = source("src/components/consultation-destination-add.tsx");

  test('je "use client" (stran konzultacije ostaja strežniška RSC)', () => {
    expect(src).toContain('"use client"');
  });

  test("izrisuje KANONSKI AddToTripButton (uvoz + posredovanje variante)", () => {
    expect(src).toContain('from "@/components/add-to-trip-button"');
    expect(src).toContain("<AddToTripButton variant={variant}");
  });

  test("predmet zbirke: kind destination + privzeti source/href", () => {
    expect(src).toContain('kind: "destination"');
    expect(src).toContain("refId: slug");
    expect(src).toContain('source ?? "konzultacija"');
    expect(src).toContain("href ?? `/destinacija/${encodeURIComponent(slug)}`");
    // kartica CTA je prostorsko okrnjena — privzeta varianta je compact
    expect(src).toContain('variant = "compact"');
  });

  test("ZASEBNOST: čisto client-side — brez db/fetch/žetona (localStorage samo)", () => {
    expect(src).not.toContain('from "@/lib/db"');
    expect(src).not.toContain("fetch(");
    // noben žeton NE sme priti do ovojnika (ne v props, ne v logiko)
    expect(src).not.toContain("token=");
    expect(src).not.toContain("accessToken");
    expect(src).toContain("localStorage");
  });

  test("sprejema SAMO PODATKE — brez lastnih UI besedil", () => {
    expect(src).not.toContain("Dodaj v mojo pot");
    expect(src).not.toContain("Add to my trip");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. VODIČ DETAIL /vodici/[slug] — priklop + ZERO LOSS
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 8 / F2-D: vodici/[slug] detail — priklop ovojnika", () => {
  const src = source("src/app/vodici/[slug]/page.tsx");

  test("uvozi + izrisuje GuideAddToTrip z pravimi podatki vodiča", () => {
    expect(src).toContain('import { GuideAddToTrip } from "@/components/guide-add-to-trip"');
    expect(src).toContain("<GuideAddToTrip");
    expect(src).toContain("slug={guide.slug}");
    expect(src).toContain("title={guide.title}");
    expect(src).toContain("image={guide.heroImage || undefined}");
  });

  test("podnaslov = obstoječa meta vrstica (dnevi · km · bralni čas iz t())", () => {
    expect(src).toContain("subtitle={`${guide.days} ${daysLabel(guide.days, locale)}");
    expect(src).toContain('km · ${guide.readTime} ${t("hero.readTime")}`}');
  });

  test("postavitev centered pod hero/breadcrumbs (vzorec hub destinacije)", () => {
    expect(src).toContain('mb-10 flex justify-center');
  });

  test("stran ostaja SSG (generateStaticParams nedotaknjen)", () => {
    expect(src).toContain("generateStaticParams");
    expect(src).toContain("ADRIA_GUIDES.map((g) => ({ slug: g.slug }))");
  });
});

describe("TASK 8 / F2-D: vodici/[slug] detail — ZERO LOSS varovalke", () => {
  const src = source("src/app/vodici/[slug]/page.tsx");

  test("CTA 'Načrtuj potovanje' (AI načrtovalec → /nacrtuj) ostaja NEPOŠKODOVAN", () => {
    expect(src).toContain('href="/nacrtuj"');
    expect(src).toContain("<Button asChild size=\"lg\">");
    expect(src).toContain("{isLoop ? t(\"aiCtaLoop.button\") : t(\"aiCta.button\")}");
  });

  test("sorodni vodniki: povezave na /vodici/[slug] ostajajo", () => {
    expect(src).toContain("href={`/vodici/${r.slug}`}");
    expect(src).toContain("{rShown.metaTitle}");
  });

  test("slovenske destinacije: gumbi na things-to-do ostajajo", () => {
    expect(src).toContain("href={`/destinacija/${d.slug}/things-to-do`}");
  });

  test("affiliate CTA + breadcrumbs + JSON-LD + lupina ostajajo", () => {
    expect(src).toContain("<AffiliateCtaBlock destination={topStop.name} variant=\"full\" />");
    expect(src).toContain('href="/vodici"');
    expect(src).toContain("articleJsonLd");
    expect(src).toContain("faqJsonLd");
    expect(src).toContain("breadcrumbJsonLd");
    expect(src).toContain("<Navigation solid />");
    expect(src).toContain("<Footer />");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. VODIČI SEZNAM /vodici — kompaktstni dodaj na karticah + ZERO LOSS
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 8 / F2-D: vodici seznam — kompaktstni dodaj na karticah", () => {
  const src = source("src/app/vodici/page.tsx");

  test("uvozi + izrisuje GuideAddToTrip (compact) na kartici GuideCard", () => {
    expect(src).toContain('import { GuideAddToTrip } from "@/components/guide-add-to-trip"');
    expect(src).toContain("<GuideAddToTrip");
    expect(src).toContain('variant="compact"');
    expect(src).toContain('source="vodici-seznam"');
    expect(src).toContain("slug={g.slug}");
    expect(src).toContain("title={g.metaTitle}");
    expect(src).toContain("image={g.heroImage || undefined}");
  });

  test("identiteta kind:refId ENAKA detail strani (isti slug, isti kind)", () => {
    // detail: slug={guide.slug} + kind "guide" (wrapper) — seznam uporablja
    // ISTI ovojnik → dedup v zbirki deluje čez površini
    const wrapper = source("src/components/guide-add-to-trip.tsx");
    expect(wrapper).toContain('kind: "guide"');
    expect(src).toContain("slug={g.slug}");
  });

  test("gumb NI znotraj <a> — overlay povezava (veljaven HTML, SmartSearch vzorec)", () => {
    // celotna kartica klikljiva prek absolute inset-0 povezave, vsebina nad njo
    expect(src).toContain('className="absolute inset-0 rounded-xl focus-visible:outline-none');
    expect(src).toContain('className="group relative flex h-full flex-col rounded-xl border bg-background p-5 transition-colors hover:border-primary/40 hover:shadow-sm"');
    expect(src).toContain('className="sr-only">{g.metaTitle}');
    // gumb je nad overlayjem (relative z-10) — klikljiv
    expect(src).toContain('className="relative z-10 mt-3 w-full justify-center"');
  });

  test("postavitev kartice nespremenjena: meta vrstica (dnevi/km/preberi) ostaja", () => {
    expect(src).toContain("{g.days} {daysWord}");
    expect(src).toContain("{fmtKm(g.km, locale)} km");
    expect(src).toContain("{readMore}");
    expect(src).toContain("group-hover:opacity-100");
    expect(src).toContain("line-clamp-3");
  });

  test("ZERO LOSS: BlogSection brezpogojno + AskLocal SL-only + trije seznami", () => {
    expect(src).toContain("<BlogSection />");
    expect(src).toContain('locale !== "en" &&');
    expect(src).toContain("{winters.map((g) => (");
    expect(src).toContain("{loops.map((g) => (");
    expect(src).toContain("{guides.map((g) => (");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. KONZULTACIJA /konzultacija/[token] — priklop + ZERO LOSS + zasebnost
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 8 / F2-D: konzultacija — priklop ovojnika priporočene destinacije", () => {
  const src = source("src/app/konzultacija/[token]/page.tsx");

  test("uvozi + izrisuje ConsultationDestinationAdd za priporočeno destinacijo", () => {
    expect(src).toContain(
      'import { ConsultationDestinationAdd } from "@/components/consultation-destination-add"'
    );
    expect(src).toContain("<ConsultationDestinationAdd");
    expect(src).toContain("slug={destSlug}");
    expect(src).toContain("name={c.destinationName ?? destSlug}");
    expect(src).toContain("subtitle={destRegionLabel ?? undefined}");
    expect(src).toContain("image={dest?.image}");
  });

  test("podnaslov = regija priporočene destinacije (javni podatek iz REGIONS)", () => {
    expect(src).toContain("REGIONS.find((r) => r.value === dest.region)?.label");
  });

  test("obstoječi CTA na things-to-do ostaja (overlay povezava, veljaven HTML)", () => {
    expect(src).toContain("href={`/destinacija/${destSlug}/things-to-do`}");
    expect(src).toContain("Raziskuj {c.destinationName}");
    expect(src).toContain('className="absolute inset-0 rounded-xl focus-visible:outline-none');
    expect(src).toContain('className="relative z-10 mt-3 w-full justify-center"');
  });

  test("stran ostaja strežniška (force-dynamic RSC — ni 'use client' na strani)", () => {
    expect(src).toContain('export const dynamic = "force-dynamic"');
    expect(src).not.toContain('"use client"');
  });
});

describe("TASK 8 / F2-D: konzultacija — ZERO LOSS varovalke", () => {
  const src = source("src/app/konzultacija/[token]/page.tsx");

  test("nazaj na vprašanje + zasebna povezava (D8-E pogodba) ostajata", () => {
    expect(src).toContain('href="/#vprasi-lokalca"');
    expect(src).toContain("Zasebna povezava");
  });

  test("fallback veja (brez ujemajoče destinacije) + 'Še eno vprašanje?' ostajata", () => {
    expect(src).toContain('href="/"');
    expect(src).toContain("Še eno vprašanje?");
    expect(src).toContain("Destinacije po Sloveniji");
  });

  test("partner kartice + atribucija seje + noindex ostajajo", () => {
    expect(src).toContain("<ConsultationPartnerCards partners={partners} />");
    expect(src).toContain("<ConsultationRefSetter />");
    expect(src).toContain("robots: { index: false, follow: false }");
  });

  test("ZASEBNOST: ovojniku se NE podajo žeton/vprašanje/odgovor", () => {
    // ovojnik sprejme SAMO javne podatke destinacije — noben del zasebne
    // vsebine konzultacije ne more priti do klienta prek props
    expect(src).not.toContain("token={");
    expect(src).not.toContain("question={");
    expect(src).not.toContain("answer={");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. DOMENA — kind "guide" je prvi razred v zbirki (sidro v main datotekah)
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 8 / F2-D: domena zbirke podpira vodiče (read-only sidro)", () => {
  test('my-trip.ts MyTripKind vključuje "guide" (KINDS seznam)', () => {
    const domain = source("src/lib/my-trip.ts");
    expect(domain).toContain('| "guide"');
    expect(domain).toContain('"guide",');
  });

  test("my-trip-view skupina Vodiči/Guides + ikona obstajata (izris v Moja pot)", () => {
    const view = source("src/components/my-trip-view.tsx");
    expect(view).toContain("guide: \"Vodiči\"");
    expect(view).toContain("guide: \"Guides\"");
    expect(view).toContain("guide: BookOpen");
  });
});
