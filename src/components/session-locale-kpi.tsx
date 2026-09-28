"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { trackSessionLocale } from "@/lib/planner-analytics";

/**
 * SESSION LOCALE KPI (W1, Issue #15 — benchmark §6, 1.139.0): jezikovni
 * dogodek seje.
 *
 * Benchmark §6 je za W1 (IT/DE jeziki) predvidel KPI "delež sej v it/de
 * locale — jezikovni event dodati". Vsi jeziki vsebinskih valov so bili
 * odprti 1.126–1.129, a je ta meritev ostala neizvedena: jezik je bil
 * merljiv ŠELE v planner_started{locale} — torej samo za seje, ki so že
 * začele načrtovati. Ta komponenta zapre vrzel iz ROOT LAYOUTA (vsaka
 * stran, pred katerokoli interakcijo).
 *
 * - Locale prihaja iz useLocale() (next-intl) — določa ga proxy.ts iz URL
 *   prefixa (/en, /it, /de; brez prefixa = sl) oz. persistenca piškotka.
 *   Klient NIKOLI ne ugiba jezika brskalnika (determinizem kanona).
 * - Enkrat na (seja, locale) par — varovala v trackSessionLocale
 *   (sessionStorage + v-spominu Set, isti vzorec kot dsa_planner_ingest_count).
 *   Preklop srednje-seje (sl → it) iskreno šteje v OBA jezika.
 * - BREZ UI — vrne null (nič ne izriše; 0 layoutnega premika, 0 CLS).
 * - Brez PII: locale je groba oznaka jezika, ni identifikator.
 * - Montiran v root layoutu ZNOTRAJ NextIntlClientProvider (mt-notice vzorec);
 *   proxy matcher izpušča admin/owner/API — tam se ne izstreli nič.
 */
export function SessionLocaleKpi() {
  const locale = useLocale() as string;

  useEffect(() => {
    trackSessionLocale(locale);
  }, [locale]);

  return null;
}
