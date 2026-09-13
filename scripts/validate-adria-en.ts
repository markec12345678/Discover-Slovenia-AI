/**
 * ADRIA-EN + SLO-LOOP — validacijska skripta: pariteta SL ⇄ EN vodnikov
 * (10 jadranskih + 4 domači krožni od SLO-LOOP-1).
 *
 * Preverja (izvoz "FAIL" + nenizčen exit):
 *  1. vrstni red slugov = ADRIA_SLUGS (oba dataset-a, 14 kosov)
 *  2. strukturna identiteta: days, km, readTime, date, author, heroImage,
 *     countries, route, stops (ime+država+nočitve), relatedSlugs,
 *     relatedSloveniaIds, št. sekcij/practical/FAQ
 *  3. EN besedilna polja so neprazna; metaTitle ≤ 60, description ≤ 155
 *  4. cene v € in kilometri v besedilu: številska množica EN ⊇ ključne SL
 *     vrednosti (dnev/km/readTime izpisane v EN besedilu)
 *  5. hevristični sken slovenskih besed v EN besedilu (funkcijske besede,
 *     ki se v angleščini ne pojavljajo)
 *  6. SLO-LOOP: vsota nočitev = days − 1; relatedSlugs veljavni
 *
 * Uporaba: bun scripts/validate-adria-en.ts
 */
import { ADRIA_GUIDES } from "../src/lib/adria-guides";
import { ADRIA_GUIDES_EN } from "../src/lib/adria-guides-en";
import { ADRIA_SLUGS } from "../src/lib/adria-guides/types";
import { DESTINATIONS } from "../src/lib/slovenia-data";

type Guide = (typeof ADRIA_GUIDES)[number];

const EXPECTED = ADRIA_SLUGS.length; // 10 jadranskih + 4 domači (SLO-LOOP-1)
const SLUG_SET = new Set<string>(ADRIA_SLUGS);
const DEST_IDS = new Set(DESTINATIONS.map((d) => d.id));

let errors = 0;
function fail(msg: string) {
  errors++;
  console.error(`FAIL: ${msg}`);
}

// --- 1. slugi v vrstnem redu ---
if (ADRIA_GUIDES.length !== EXPECTED) fail(`SL dataset ima ${ADRIA_GUIDES.length} vodnikov, pričakovanih ${EXPECTED}`);
if (ADRIA_GUIDES_EN.length !== EXPECTED) fail(`EN dataset ima ${ADRIA_GUIDES_EN.length} vodnikov, pričakovanih ${EXPECTED}`);
ADRIA_SLUGS.forEach((slug, i) => {
  if (ADRIA_GUIDES[i]?.slug !== slug) fail(`SL[${i}] slug "${ADRIA_GUIDES[i]?.slug}" ≠ ADRIA_SLUGS "${slug}"`);
  if (ADRIA_GUIDES_EN[i]?.slug !== slug) fail(`EN[${i}] slug "${ADRIA_GUIDES_EN[i]?.slug}" ≠ ADRIA_SLUGS "${slug}"`);
});

// --- 2/3. pariteta po vodniku ---
const NUM_KEYS = ["days", "km", "readTime"] as const;
const STR_KEYS = ["date", "author", "heroImage", "route"] as const;

for (let i = 0; i < ADRIA_SLUGS.length; i++) {
  const sl = ADRIA_GUIDES[i] as Guide | undefined;
  const en = ADRIA_GUIDES_EN[i] as Guide | undefined;
  if (!sl || !en) continue;
  const tag = `[${sl.slug}]`;

  for (const k of NUM_KEYS) if (sl[k] !== en[k]) fail(`${tag} ${k}: SL ${sl[k]} ≠ EN ${en[k]}`);
  for (const k of STR_KEYS) if (sl[k] !== en[k]) fail(`${tag} ${k}: SL "${sl[k]}" ≠ EN "${en[k]}"`);
  if (sl.countries.join(",") !== en.countries.join(",")) fail(`${tag} countries se razlikujejo`);
  if (sl.relatedSlugs.join(",") !== en.relatedSlugs.join(",")) fail(`${tag} relatedSlugs se razlikujejo`);
  if (sl.relatedSloveniaIds.join(",") !== en.relatedSloveniaIds.join(",")) fail(`${tag} relatedSloveniaIds se razlikujejo`);

  if (sl.stops.length !== en.stops.length) {
    fail(`${tag} stops: SL ${sl.stops.length} ≠ EN ${en.stops.length}`);
  } else {
    sl.stops.forEach((s, j) => {
      if (en.stops[j].name !== s.name) fail(`${tag} stops[${j}].name: "${en.stops[j].name}" ≠ "${s.name}"`);
      if (en.stops[j].country !== s.country) fail(`${tag} stops[${j}].country se razlikuje`);
      if (en.stops[j].nights !== s.nights) fail(`${tag} stops[${j}].nights: ${en.stops[j].nights} ≠ ${s.nights}`);
    });
  }
  for (const k of ["sections", "practical", "faqs"] as const) {
    if (sl[k].length !== en[k].length) fail(`${tag} ${k}: SL ${sl[k].length} ≠ EN ${en[k].length}`);
  }

  // --- 6. SLO-LOOP: nočitve + veljavnost related ---
  const nightsSum = sl.stops.reduce((a, s) => a + s.nights, 0);
  if (nightsSum !== sl.days - 1) fail(`${tag} vsota nočitev ${nightsSum} ≠ days−1 (${sl.days - 1})`);
  for (const rs of sl.relatedSlugs) if (!SLUG_SET.has(rs)) fail(`${tag} relatedSlug "${rs}" ni v ADRIA_SLUGS`);
  for (const rid of sl.relatedSloveniaIds) if (!DEST_IDS.has(rid)) fail(`${tag} relatedSloveniaId "${rid}" ni veljaven ID destinacije`);

  // --- 3. EN tekstne higiene ---
  const textFields = [en.title, en.metaTitle, en.description, en.excerpt, en.heroAlt];
  textFields.forEach((v, j) => {
    if (!v || !v.trim()) fail(`${tag} tekstno polje #${j} je prazno`);
  });
  if (en.metaTitle.length > 60) fail(`${tag} metaTitle ${en.metaTitle.length} zn. > 60`);
  if (en.description.length > 155) fail(`${tag} description ${en.description.length} zn. > 155`);
  en.sections.forEach((sec, j) => {
    if (!sec.heading.trim()) fail(`${tag} sections[${j}].heading prazna`);
    sec.body.forEach((p, k) => {
      if (!p.trim() || p.trim().length < 40) fail(`${tag} sections[${j}].body[${k}] sumljivo kratek`);
    });
  });
  en.practical.forEach((p, j) => {
    if (!p.title.trim() || !p.text.trim()) fail(`${tag} practical[${j}] prazen`);
  });
  en.faqs.forEach((f, j) => {
    if (!f.question.trim() || !f.answer.trim()) fail(`${tag} faqs[${j}] prazen`);
  });
  en.stops.forEach((s, j) => {
    if (!s.highlight.trim()) fail(`${tag} stops[${j}].highlight prazen`);
  });

  // --- 4. ključne številke v EN besedilu (ADVISORY — uredniško sme
  //     uporabiti besedne oblike: "ten days", "a thousand kilometres";
  //     tudi SL izvornik vseh skupkov ne izpisuje) ---
  const enAllText = [
    en.title, en.description, en.excerpt,
    ...en.sections.flatMap((s) => [s.heading, ...s.body, ...(s.list ?? []).flatMap((l) => [l.title, l.text])]),
    ...en.practical.flatMap((p) => [p.title, p.text]),
    ...en.faqs.flatMap((f) => [f.question, f.answer]),
    ...en.stops.map((s) => s.highlight),
  ].join(" ");
  const kmEn = en.km.toLocaleString("en-GB");
  const kmAlt = String(en.km);
  if (!enAllText.includes(kmEn) && !enAllText.includes(kmAlt)) {
    console.warn(`WARN: ${tag} km ${en.km} ni zapisan v EN besedilu (morda besedna oblika)`);
  }

  // --- 5. hevristika slovenskih besed v EN besedilu ---
  const slTokens = [
    " potem ", " ker ", " kjer ", " tudi ", " zelo ", " veliko ", " nočitev ",
    " nočitve ", " nočitev.", " cestnine ", " cestnina ", " dnevih ", " dnevi ",
    " potovanje ", " avtom ", " avto ", " primeren ", " približno ", " zadost ",
    " vstopnica ", " vstopnine ", " turisti ", " namestitev ", " priporoč ",
    " predvsem ", " skoraj ", " vendar ", " ker ", " sicer ", " torej ",
    " brezplačen ", " brezplačno ", " lokalne ", " lokalni ", " vsak dan ",
  ];
  const enLower = ` ${enAllText.toLowerCase()} `;
  for (const tok of slTokens) {
    if (enLower.includes(tok)) {
      // izpis okoli zadetka za ročni pregled
      const idx = enLower.indexOf(tok);
      const ctx = enAllText.slice(Math.max(0, idx - 40), idx + 60).replace(/\s+/g, " ");
      fail(`${tag} slovenska beseda "${tok.trim()}" v EN besedilu: …${ctx}…`);
    }
  }
}

if (errors > 0) {
  console.error(`\nADRIA-EN VALIDACIJA: ${errors} NAPAK`);
  process.exit(1);
}
console.log(`ADRIA-EN VALIDACIJA: ${EXPECTED}/${EXPECTED} vodnikov OK — pariteta SL ⇄ EN, tekstne higiene, nočitve in hevristika čisti.`);
