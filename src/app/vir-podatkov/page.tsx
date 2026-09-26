import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { localePrefix } from "@/i18n/routing";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";
// TASK 8 / D8-E (P-NAV-1): enotna lupina — Navigation solid (Footer je že
// obstajal); LanguageToggle odstranjen (/vir-podatkov je na EN whitelisti —
// LanguageSwitcher v Navigation pokriva isto SL⇄EN dejanje).
import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { PROVIDER_REGISTRY } from "@/lib/supply/registry";
import {
  productionStatuses,
  type ProviderProductionStatus,
  type UserFacingStatus,
} from "@/lib/supply/production-status";
import {
  bookingCapabilityMatrix,
  CAPABILITY_CELL_LABELS,
  CAPABILITY_COLUMN_LABELS,
  type CapabilityCell,
} from "@/lib/supply/capability-matrix";
// ISSUE #4 §17+§19 (VAL 5 sklop A): enoten koncept svežine (FRESH/STALE/
// UNKNOWN/LIVE) + §19 vrsta vira (LIVE/STATIC/USER/PROVIDER/GENERATED) —
// ČISTI listni modul, vrstice spodaj so IZPELJANE iz njega (nikoli ročno
// barvane besede: barva/oznaka sledita dejanski klasifikaciji).
import {
  FSQ_SNAPSHOT_DATE,
  classifyFreshness,
  formatDataAge,
  freshnessLabel,
  sourceTypeForSourceClass,
  type DataFreshness,
  type SourceType,
} from "@/lib/data-freshness";
// §17: as-of datum dataseta destinacij — en vir resnice (stop-insights.ts).
import { DESTINATIONS_DATA_AS_OF } from "@/lib/stop-insights";
// ISSUE #4 §18 (VAL 7): provenance destinacijske vsebine — registr uradnih
// virov + povzetek (števci/jezik) IZPELJANI iz modula, nikoli ročno.
import {
  officialSourceRows,
  provenanceSummary,
} from "@/lib/destination-provenance";
import { DESTINATIONS } from "@/lib/slovenia-data";

/**
 * /vir-podatkov — seznam virov podatkov (E-E-A-T).
 *
 * FW4.3-2 (dvojezičnost, vzorec /o-strani):
 * - Server komponenta; vsa besedila prek `getTranslations("dataSources")`.
 * - Imena virov in URL-ji so locale-invariantni (znamke) → ostajajo v
 *   `SOURCES` tabeli; opisi (`desc`) in vrste (`type`) se prevajajo.
 * - Zunanje povezave ostajajo navadni `<a target="_blank">`.
 * - generateMetadata je locale-zaveden (canonical/hreflang/og:locale).
 * - Sporočila živijo v src/i18n/fragments/dataSources.{sl,en}.json.
 *
 * F1 (Supply Map, 1.49.0): NOVA sekcija "Ponudniki potovanj" se izpelje
 * IZ PROVIDER_REGISTRY (src/lib/supply/registry.ts) — en vir resnice.
 * Popravek audita 40: stara ročna lista je bila ZASTARELA (5/10 affiliate
 * virov, manjkali Airalo/Kiwitaxi/Omio/Tiqets/Viator). Register je
 * client-varen (samo imena env spremenljivk, nikoli vrednosti).
 */

const PATH = "/vir-podatkov";

/** Neponudniški viri podatkov platforme — affiliate ponudniki so zdaj
 *  izključno v registrom gnani sekciji spodaj (nikoli več ročno vzdržani). */
const SOURCES = [
  { id: "osm", name: "OpenStreetMap", url: "https://www.openstreetmap.org" },
  { id: "sloveniaInfo", name: "I feel Slovenia (STO) — slovenia.info", url: "https://www.slovenia.info" },
  { id: "wikipedia", name: "Wikipedia / Wikidata", url: "https://www.wikimedia.org" },
  { id: "openMeteo", name: "Open-Meteo", url: "https://open-meteo.com" },
  { id: "zai", name: "z-ai-web-dev-sdk (vizija — opcijsko)", url: "https://z.ai" },
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dataSources");
  const locale = await getLocale();
  const base = await currentBaseUrl();
  const prefixed = `${localePrefix(locale)}${PATH}`;

  return {
    title: t("meta.title"),
    description: t("meta.description"),
    alternates: {
      canonical: `${base}${prefixed}`,
      languages: hreflangForPath(PATH, base),
    },
    openGraph: {
      title: `${t("meta.title")} — Discover Slovenia AI`,
      description: t("meta.description"),
      url: `${base}${prefixed}`,
      type: "website",
      locale: locale === "en" ? "en_US" : "sl_SI",
    },
  };
}

/** Statusna značka (barva IZPELJANA iz stanja, ne iz želja — iskrenost).
 * TASK 52 §32: glavni badge je PRODUKCIJSKI status (LIVE / CONFIGURED /
 * NOT CONFIGURED / PARTNER ACCESS REQUIRED / AFFILIATE ONLY) — izpeljan
 * strežniško iz production-matrix + env prisotnosti (SAMO Boolean).
 * NIKOLI „LIVE“, če poverilnica manjka. */
const PROD_STATUS_BADGE_CLASS: Record<UserFacingStatus, string> = {
  LIVE: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  CONFIGURED:
    "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  NOT_CONFIGURED:
    "bg-muted text-muted-foreground",
  PARTNER_ACCESS_REQUIRED:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  AFFILIATE_ONLY:
    "bg-muted/60 text-muted-foreground/80 border border-border",
};

/** Skupine registra (lokalni odprti viri / lastna tržnica / partnerji). */
const REGISTRY_GROUPS = ["local", "own", "commercial"] as const;

/** Barvne oznake celic §5 matrike (iskrenost: barva IZPELJANA iz statusa). */
const CAPABILITY_CELL_CLASS: Record<CapabilityCell, string> = {
  LIVE: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  CODE_READY:
    "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  ARCHITECTURE:
    "bg-muted text-muted-foreground",
  USER_ATTESTED:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  NOT_SUPPORTED: "bg-muted/60 text-muted-foreground/80",
  NOT_APPLICABLE: "text-muted-foreground/50",
  NOT_RUN: "bg-muted/40 text-muted-foreground/70",
};

/** Vrstni red stolpcev §5 matrike (po naročniku). */
const CAPABILITY_COLUMNS = [
  "discovery",
  "affiliate",
  "apiSearch",
  "quote",
  "booking",
  "cancellation",
  "webhook",
  "refund",
  "credentials",
  "e2e",
] as const;

/** Barvne oznake svežine (§17) — barva IZPELJANA iz stanja (vzorec
 *  PROD_STATUS_BADGE_CLASS / CAPABILITY_CELL_CLASS — iskrenost: nikoli
 *  „sveže" v zeleni, če klasifikacija pravi drugače). */
const FRESHNESS_BADGE_CLASS: Record<DataFreshness, string> = {
  live: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  fresh: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  stale: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  unknown: "bg-muted/60 text-muted-foreground/80",
};

/** Vrstica tabele svežine (§17+§19) — vse IZPELJANO iz data-freshness.ts. */
interface FreshnessRow {
  key: string;
  /** Ime sloja: znamka (locale-invariantna, vzorec SOURCES) ali i18n ključ. */
  name: string | null;
  nameKey: string | null;
  sourceType: SourceType;
  freshness: DataFreshness;
  /** §19 data age (relativna starost ali datum; null kadar ni znan). */
  age: string | null;
  detailKey: string;
  detailParams?: Record<string, string>;
}

export default async function DataSourcePage() {
  const t = await getTranslations("dataSources");
  const locale = await getLocale();
  const lang = locale === "en" ? "en" : "sl";

  // TASK 52 §32: strežniška produkcijska stanja (env SAMO Boolean —
  // vrednosti nikoli ne zapustijo strežnika). Server komponenta = varno.
  const statusBySlug = new Map<string, ProviderProductionStatus>(
    productionStatuses().map((s) => [s.slug, s])
  );

  // ISSUE #4 §17+§19 (VAL 5 sklop A): vrstice svežine glavnih slojev.
  // Ura je STREŽNIŠKI čas izrisa (RSC — request-scoped, hidracije ni);
  // klasifikacije/starosti so IZPELJANE iz modula (en vir resnice).
  //   - OSM: žive Overpass poizvedbe ob vsakem iskanju → LIVE/živo;
  //   - FSQ: statični posnetek 2025-02-06 → STATIC + ZASTARELO (posnetek,
  //     ne živo stanje — jedro zahteve §17 o „125.446 krajev“);
  //   - Open-Meteo: živi API s pomnilniškim predpomnilnikom → LIVE/živo;
  //   - destinacije: as-of datum uredniškega vodnika → klasificirano;
  //   - prevozi: „od“-cene iz statičnega inventarja, brez živega citata
  //     → NEZNANO (dokler ni API); affiliate: samo povezava → NEZNANO.
  const freshnessNow = Date.now();
  const freshnessRows: FreshnessRow[] = [
    {
      key: "osm",
      name: "OpenStreetMap",
      nameKey: null,
      sourceType: sourceTypeForSourceClass("poi", { liveChecked: true }),
      freshness: classifyFreshness("poi", { liveChecked: true }),
      age: null,
      detailKey: "freshness.osmDetail",
    },
    {
      key: "fsq",
      name: "Foursquare Open Places",
      nameKey: null,
      sourceType: sourceTypeForSourceClass("poi"),
      freshness: classifyFreshness("poi", {
        timestamp: FSQ_SNAPSHOT_DATE,
        now: freshnessNow,
      }),
      age: formatDataAge(FSQ_SNAPSHOT_DATE, freshnessNow, lang),
      detailKey: "freshness.fsqDetail",
    },
    {
      key: "openMeteo",
      name: "Open-Meteo",
      nameKey: null,
      sourceType: sourceTypeForSourceClass("weather", { liveChecked: true }),
      freshness: classifyFreshness("weather", { liveChecked: true }),
      age: null,
      detailKey: "freshness.openMeteoDetail",
    },
    {
      key: "destinations",
      name: null,
      nameKey: "freshness.rows.destinations",
      sourceType: sourceTypeForSourceClass("destinationContent"),
      freshness: classifyFreshness("destinationContent", {
        timestamp: DESTINATIONS_DATA_AS_OF,
        now: freshnessNow,
      }),
      age: formatDataAge(DESTINATIONS_DATA_AS_OF, freshnessNow, lang),
      detailKey: "freshness.destinationsDetail",
      detailParams: { date: DESTINATIONS_DATA_AS_OF },
    },
    {
      key: "transfers",
      name: null,
      nameKey: "freshness.rows.transfers",
      sourceType: sourceTypeForSourceClass("transferPrices"),
      // Od-cene iz statičnega inventarja — živega citata NI → iskreno
      // neznano (dokler ni API), ne izmišljenega „sveže“.
      freshness: classifyFreshness("transferPrices", { timestamp: null }),
      age: null,
      detailKey: "freshness.transfersDetail",
    },
    {
      key: "affiliate",
      name: null,
      nameKey: "freshness.rows.affiliate",
      sourceType: sourceTypeForSourceClass("affiliateOffers"),
      freshness: classifyFreshness("affiliateOffers", {}),
      age: null,
      detailKey: "freshness.affiliateDetail",
    },
  ];

  // ISSUE #4 §18 (VAL 7): povzetek provenance + vrstice uradnih virov —
  // IZPELJANI iz lib/destination-provenance.ts (en vir resnice; tabela
  // na strani nikoli ročno urejena).
  const destinationProvenance = provenanceSummary(DESTINATIONS);
  const nameById = new Map(DESTINATIONS.map((d) => [d.id, d.name] as const));
  const officialDestinations = officialSourceRows().map((row) => ({
    ...row,
    name: nameById.get(row.id) ?? row.id,
  }));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* TASK 8 / D8-E (P-NAV-1): enotna lupina (Navigation + Footer). */}
      <Navigation solid />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-6">{t("title")}</h1>
        <p className="text-muted-foreground mb-8">{t("intro")}</p>

        <div className="space-y-4">
          {SOURCES.map((s) => (
            <div key={s.name} className="rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{s.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t(`sources.${s.id}.desc`)}
                  </p>
                </div>
                <span className="text-xs bg-muted px-2 py-1 rounded shrink-0">
                  {t(`sources.${s.id}.type`)}
                </span>
              </div>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline mt-2 inline-block">
                {s.url} →
              </a>
            </div>
          ))}
        </div>

        {/* ISSUE #4 §17+§19 (VAL 5 sklop A): SVEŽINA PODATKOV — enoten
            koncept FRESH/STALE/UNKNOWN/LIVE po slojih + §19 vrsta vira.
            Ključna iskrenost (§17): število krajev IZ POSNETKA ni enako
            število ŽIVIH krajev — stran to pove eksplicitno; FSQ posnetek
            se klasificira kot ZASTARELO (posnetek, ne živo stanje). */}
        <section aria-labelledby="data-freshness" className="mt-12">
          <h2 id="data-freshness" className="text-2xl font-bold mb-3">
            {t("freshness.title")}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {t("freshness.intro")}
          </p>

          <div className="mb-6 rounded-lg border border-amber-300/70 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              {t("freshness.disclaimer", { date: FSQ_SNAPSHOT_DATE })}
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs border-collapse min-w-[720px]">
              <thead>
                <tr className="bg-muted/50">
                  <th scope="col" className="text-left font-semibold p-2 border-b border-border whitespace-nowrap">
                    {t("freshness.colDataset")}
                  </th>
                  <th scope="col" className="text-left font-semibold p-2 border-b border-border whitespace-nowrap">
                    {t("freshness.colType")}
                  </th>
                  <th scope="col" className="text-left font-semibold p-2 border-b border-border whitespace-nowrap">
                    {t("freshness.colFreshness")}
                  </th>
                  <th scope="col" className="text-left font-semibold p-2 border-b border-border">
                    {t("freshness.colDetail")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {freshnessRows.map((row) => (
                  <tr key={row.key} className="align-top">
                    <th scope="row" className="text-left font-medium p-2 border-b border-border/60 whitespace-nowrap">
                      {row.name ?? t(row.nameKey as string)}
                    </th>
                    {/* §19 kanonski termini (LIVE/STATIC/USER/PROVIDER/
                        GENERATED) so namerno v izvirniku — pogodbeni pojmi. */}
                    <td className="p-2 border-b border-border/60 whitespace-nowrap">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {row.sourceType}
                      </span>
                    </td>
                    <td className="p-2 border-b border-border/60 whitespace-nowrap">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded font-medium ${FRESHNESS_BADGE_CLASS[row.freshness]}`}
                      >
                        {freshnessLabel(row.freshness, lang)}
                      </span>
                      {row.age && (
                        <span className="block mt-0.5 text-[10px] text-muted-foreground/80">
                          {row.age}
                        </span>
                      )}
                    </td>
                    <td className="p-2 border-b border-border/60">
                      {t(row.detailKey, row.detailParams)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* === ISSUE #4 §18 (VAL 7): PROVENANCE DESTINACIJSKE VSEBINE === */}
        {/* Zahteva: 38 kuriranih destinacij s source/datumom/jezikom/last
            update; NiST NE kopiramo — strukturirani javni podatki kot source
            layer s provenance. Vsi števci/URL-ji/datumi so IZPELJANI iz
            lib/destination-provenance.ts (en vir resnice); NiST raziskava je
            iskren zapis o odločitvi (ne lažna integracija). */}
        <section aria-labelledby="destination-content-provenance" className="mt-12">
          <h2 id="destination-content-provenance" className="text-2xl font-bold mb-3">
            {t("destinationContent.title")}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {t("destinationContent.intro")}
          </p>

          <p className="mb-6 inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-medium">
            <span className="inline-block size-2 rounded-full bg-primary" aria-hidden="true" />
            {t("destinationContent.statsLine", {
              total: destinationProvenance.total,
              official: destinationProvenance.official,
              internal: destinationProvenance.internal,
              asOf: destinationProvenance.asOf,
            })}
          </p>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs border-collapse min-w-[560px]">
              <thead>
                <tr className="bg-muted/50">
                  <th scope="col" className="text-left font-semibold p-2 border-b border-border whitespace-nowrap">
                    {t("destinationContent.colDestination")}
                  </th>
                  <th scope="col" className="text-left font-semibold p-2 border-b border-border">
                    {t("destinationContent.colSource")}
                  </th>
                  <th scope="col" className="text-left font-semibold p-2 border-b border-border whitespace-nowrap">
                    {t("destinationContent.colVerified")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {officialDestinations.map((row) => (
                  <tr key={row.id} className="align-top">
                    <th scope="row" className="text-left font-medium p-2 border-b border-border/60 whitespace-nowrap">
                      {row.name}
                    </th>
                    <td className="p-2 border-b border-border/60">
                      <a
                        href={row.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2"
                      >
                        {row.source} →
                      </a>
                    </td>
                    <td className="p-2 border-b border-border/60 whitespace-nowrap">
                      <time dateTime={row.verifiedAt}>
                        {row.verifiedAt.replaceAll("-", ". ")}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
              <h3 className="text-sm font-semibold mb-1">
                {t("destinationContent.internalTitle")}
              </h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("destinationContent.internalNote", {
                  internal: destinationProvenance.internal,
                  asOf: destinationProvenance.asOf,
                })}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
              <h3 className="text-sm font-semibold mb-1">
                {t("destinationContent.langTitle")}
              </h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("destinationContent.langNote")}
              </p>
            </div>
            <div className="rounded-lg border border-amber-300/70 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
              <h3 className="text-sm font-semibold mb-1 text-amber-900 dark:text-amber-200">
                {t("destinationContent.nistTitle")}
              </h3>
              <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
                {t("destinationContent.nistNote")}
              </p>
            </div>
          </div>
        </section>

        {/* F1 (Supply Map): registrom gnana sekcija — en vir resnice.
            Ko se v prihodnji fazi priključi adapter (npr. KiwiTaxi v F2),
            se ta seznam samodejno posodobi — nikoli več zastarel. */}
        <section aria-labelledby="supply-registry" className="mt-12">
          <h2 id="supply-registry" className="text-2xl font-bold mb-3">
            {t("supplyTitle")}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">{t("supplyIntro")}</p>

          <div className="space-y-8">
            {REGISTRY_GROUPS.map((group) => {
              const entries = PROVIDER_REGISTRY.filter((p) => p.group === group);
              if (entries.length === 0) return null;
              return (
                <div key={group}>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                    {t(`supplyGroup.${group}`)}
                  </h3>
                  <div className="space-y-3">
                    {entries.map((p) => {
                      const prod = statusBySlug.get(p.slug);
                      return (
                        <div key={p.slug} className="rounded-lg border border-border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h4 className="font-semibold">{p.labels[lang]}</h4>
                              {/* Stopnja življenjskega cikla (§0) — tehnični
                                  label za administracijo (matrika §2). */}
                              {prod && (
                                <p className="text-[10px] font-mono text-muted-foreground/70 mt-0.5">
                                  {t("prodStageLabel")}: {prod.stage}
                                </p>
                              )}
                            </div>
                            {prod && (
                              <span
                                className={`text-xs px-2 py-1 rounded shrink-0 font-medium ${PROD_STATUS_BADGE_CLASS[prod.status]}`}
                              >
                                {t(`prodStatus.${prod.status}`)}
                              </span>
                            )}
                          </div>
                          {p.accessNote && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {p.accessNote[lang]}
                            </p>
                          )}
                          {prod && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted/70 text-muted-foreground">
                                {t("prodPriceLabel")}: {t(`prodPrice.${prod.price}`)}
                              </span>
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted/70 text-muted-foreground">
                                {t("prodAvailabilityLabel")}: {t(`prodAvailability.${prod.availability}`)}
                              </span>
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted/70 text-muted-foreground">
                                {t("prodMonetizationLabel")}: {t(`prodMonetization.${prod.monetization}`)}
                              </span>
                            </div>
                          )}
                          {p.docsUrl && (
                            <a
                              href={p.docsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary underline mt-2 inline-block"
                            >
                              {t("supplyDocs")} →
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* TASK 52 §32: legenda statusov — pomen vsakega badge-a v eninem
              stavku (iskrenost: povezava NI zaloga). */}
          <div className="mt-6 rounded-lg border border-border bg-muted/30 p-4">
            <h3 className="text-sm font-semibold mb-1">
              {t("prodLegendTitle")}
            </h3>
            <p className="text-xs text-muted-foreground">{t("prodLegend")}</p>
          </div>
        </section>

        {/* ISSUE #4 §5 (1.96.0): ZMOŽNOSTNA MATRIKA REZERVACIJSKE PLASTI —
            formalizacija README razlikovanj (CODE READY adapterji,
            affiliate /go, neaktivne API integracije, booking lifecycle) v
            naročnikovo matriko 11 stolpcev. Izpeljana IZ REGISTRA/matrike
            (en vir resnice) — nikoli „živo“ brez dejanskega živega odgovora
            providerja (testovno varovana invarianta). */}
        <section aria-labelledby="capability-matrix" className="mt-12">
          <h2 id="capability-matrix" className="text-2xl font-bold mb-3">
            {t("capabilityTitle")}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {t("capabilityIntro")}
          </p>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-muted/50">
                  <th scope="col" className="text-left font-semibold p-2 border-b border-border sticky left-0 bg-muted/50">
                    {CAPABILITY_COLUMN_LABELS.provider[lang]}
                  </th>
                  {CAPABILITY_COLUMNS.map((col) => (
                    <th
                      key={col}
                      scope="col"
                      className="text-left font-semibold p-2 border-b border-border whitespace-nowrap"
                    >
                      {CAPABILITY_COLUMN_LABELS[col][lang]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bookingCapabilityMatrix().map((row) => {
                  const label =
                    row.slug === "manual"
                      ? t("capabilityManual")
                      : PROVIDER_REGISTRY.find((p) => p.slug === row.slug)
                          ?.labels[lang] ?? row.slug;
                  return (
                    <tr key={row.slug} className="align-top">
                      <th
                        scope="row"
                        className="text-left font-medium p-2 border-b border-border/60 whitespace-nowrap"
                      >
                        {label}
                      </th>
                      {CAPABILITY_COLUMNS.map((col) => {
                        if (col === "credentials") {
                          const creds = row.credentials;
                          const text =
                            creds.missingEnvVars.length === 0
                              ? creds.productionConfigured
                                ? t("capabilityCredsPresent")
                                : t("capabilityCredsNone")
                              : t("capabilityCredsMissing", {
                                  vars: creds.missingEnvVars.join(", "),
                                });
                          return (
                            <td
                              key={col}
                              className="p-2 border-b border-border/60 whitespace-nowrap"
                            >
                              <span
                                className={
                                  creds.missingEnvVars.length === 0 &&
                                  creds.productionConfigured
                                    ? "text-green-700 dark:text-green-400"
                                    : "text-muted-foreground"
                                }
                              >
                                {text}
                              </span>
                            </td>
                          );
                        }
                        const cell = row[col] as CapabilityCell;
                        return (
                          <td
                            key={col}
                            className="p-2 border-b border-border/60 whitespace-nowrap"
                            title={row.note}
                          >
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded font-medium ${CAPABILITY_CELL_CLASS[cell]}`}
                            >
                              {CAPABILITY_CELL_LABELS[cell][lang]}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">
              {t("capabilityLegend")}
            </p>
          </div>
        </section>

        <div className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-6">
          <h2 className="font-bold mb-2">{t("providersTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("providersText")}</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
