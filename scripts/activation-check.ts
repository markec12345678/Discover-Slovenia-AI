// ============================================================================
// ISSUE #20 §11 — PRODUCTION ACTIVATION CHECK (CLI ovoj, 1.157.0)
// ============================================================================
// Tanek ovoj nad src/lib/supply/activation-check.ts (ena resnica — vsa
// logika je v knjižnici in testno varovana; skripta SAMO formatira).
//
// Uporaba:
//   bun run activation:check           # tabela (človeško berljiva)
//   bun run activation:check -- --json # strojno berljiv JSON
//
// Izpis VSEBUJE izključno: stanje (ACTIVE/CONFIGURED/NOT CONFIGURED/
// BLOCKED), stopnjo, Boolean prisotnost env spremenljivk, klasifikacijo
// dostopa/CTA/cen/razpoložljivosti in iskrene opombe matrike. NOBENA
// vrednost env spremenljivke NI nikoli izpisana (test kanarček).
// ============================================================================

import {
  buildActivationReport,
  formatActivationTable,
  formatActivationJson,
} from "../src/lib/supply/activation-check";

const args = process.argv.slice(2);
const report = buildActivationReport();

if (args.includes("--json")) {
  console.log(formatActivationJson(report));
} else {
  console.log(formatActivationTable(report));
}
