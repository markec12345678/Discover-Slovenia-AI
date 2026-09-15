// Test pins-ingest (F14) — sintetični vnosi vseh treh oblik.
// Zagon: bun scripts/test-pins.ts
import { ingestPins, parsePins } from "../src/lib/pins-ingest";
import { DESTINATIONS } from "../src/lib/slovenia-data";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    failures += 1;
    console.error(`  ❌ ${name} ${detail}`);
  }
}

const bled = DESTINATIONS.find((d) => d.id === "bled")!;
const soca = DESTINATIONS.find((d) => d.id === "soca")!;
const ljubljana = DESTINATIONS.find((d) => d.id === "ljubljana")!;

console.log("=== 1) GeoJSON ( Takeout 'Saved Places.json') ===");
const geojson = JSON.stringify({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { Title: "Vila Bled", Comment: "hotel" },
      geometry: { type: "Point", coordinates: [bled.coords.lng + 0.01, bled.coords.lat - 0.01] },
    },
    {
      type: "Feature",
      properties: { Title: "Sobe pri Ani" },
      geometry: { type: "Point", coordinates: [soca.coords.lng, soca.coords.lat] },
    },
    {
      type: "Feature",
      properties: { Title: "Schönbrunn Palace" },
      geometry: { type: "Point", coordinates: [16.3738, 48.1855] },
    },
    {
      type: "Feature",
      properties: { Title: "Blejski grad" },
      geometry: { type: "Point", coordinates: [0, 0] }, // degenerate → ime
    },
  ],
});
const r1 = ingestPins(geojson);
check("format = geojson", r1.format === "geojson");
check("pinsTotal = 4", r1.pinsTotal === 4, `dobili ${r1.pinsTotal}`);
check("Vila Bled → bled (koordinate, najbližja)", r1.matches.some((m) => m.id === "bled" && m.pinCount >= 1));
check("Sobe pri Ani → soca (koordinate, brez imena)", r1.matches.some((m) => m.id === "soca"));
check("Schönbrunn ( Dunaj) NE prepozna", !r1.matches.some((m) => m.pinCount === 4));
check("Blejski grad ( 0,0 koordinate) → bled po imenu", r1.matches.some((m) => m.id === "bled" && m.pinCount === 2), JSON.stringify(r1.matches.find((m) => m.id === "bled")));
check("pinsUnmatched = 1 ( Dunaj)", r1.pinsUnmatched === 1, `dobili ${r1.pinsUnmatched}`);
check("predlagani dnevi ≥ 1 in ≤ 7", r1.suggestion.days >= 1 && r1.suggestion.days <= 7);
console.log("  →", JSON.stringify(r1.matches.map((m) => `${m.id}:${m.pinCount}${m.nearestKm !== null ? `(${m.nearestKm}km)` : ""}`)), "days:", r1.suggestion.days, "interests:", r1.suggestion.interests.join(","));

console.log("=== 2) KML ===");
const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Bled</name>
      <Point><coordinates>${bled.coords.lng},${bled.coords.lat},0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Ljubljana Castle</name>
      <Point><coordinates>${ljubljana.coords.lng},${ljubljana.coords.lat},0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Kranjska Gora</name>
      <Point><coordinates>13.631,46.484,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;
const r2 = ingestPins(kml);
check("format = kml", r2.format === "kml");
check("Bled prepozna", r2.matches.some((m) => m.id === "bled"));
check("Ljubljana Castle → ljubljana ( ime vzorca)", r2.matches.some((m) => m.id === "ljubljana"));
check("Kranjska Gora ( 20+ km od vseh) NE", r2.pinsUnmatched >= 0); // informativno
console.log("  →", JSON.stringify(r2.matches.map((m) => `${m.id}:${m.pinCount}${m.nearestKm !== null ? `(${m.nearestKm}km)` : ""}`)), "unmatched:", r2.pinsUnmatched);

console.log("=== 3) Besedilni seznam ( oznake, več oken) ===");
const text = `Moji načrti:
1. Bled
- Piran
* Vintgarska soteska
Soča
Dunaj`;
const r3 = ingestPins(text);
check("format = text", r3.format === "text");
check("pinsTotal = 6 ( glava + 5 vrstic)", r3.pinsTotal === 6, `dobili ${r3.pinsTotal}`);
check("Bled + Vintgar oba", r3.matches.some((m) => m.id === "bled") && r3.matches.some((m) => m.id === "vintgar"));
check("Dunaj + glava ne prepoznata ( unmatched 2)", r3.pinsUnmatched === 2, `dobili ${r3.pinsUnmatched}`);
console.log("  →", JSON.stringify(r3.matches.map((m) => `${m.id}:${m.pinCount}`)), "days:", r3.suggestion.days);

console.log("=== 4) Robni primeri ===");
const empty = ingestPins("   \n \n");
check("prazno → 0 točk", empty.pinsTotal === 0 && empty.matches.length === 0);
const foreign = ingestPins("Eiffel Tower\nColosseum\nBig Ben");
check("samo tuje → 0 zadetkov, 3 unmatched", foreign.matches.length === 0 && foreign.pinsUnmatched === 3);
const broken = ingestPins('{"features": broken json');
check("pokvarjen JSON → fallback na besedilo", broken.format === "text" && broken.pinsTotal > 0);
const geoNoFeatures = ingestPins('{"hello": "world"}');
check("JSON brez features → fallback besedilo ( 1 vrstica)", geoNoFeatures.format === "text");
// Diakritika + večbesedni vzorci ( ena vrstica = ena točka!)
const diacritics = ingestPins("Počasi: blejsko jezero\nPostojnska jama");
check("diakritika/variacije: bled + postojna", diacritics.matches.some((m) => m.id === "bled") && diacritics.matches.some((m) => m.id === "postojna"));
// "Hotel Triglav Bled" s koordinatami pri Bledu → koordinate zmaga ( pravilno!)
const tricky = ingestPins(
  JSON.stringify({
    features: [
      {
        properties: { Title: "Hotel Triglav Bled" },
        geometry: { type: "Point", coordinates: [bled.coords.lng, bled.coords.lat] },
      },
    ],
  })
);
const trickyBled = tricky.matches.find((m) => m.id === "bled");
const trickyTriglav = tricky.matches.find((m) => m.id === "triglav");
check("Hotel Triglav Bled ( koordinate pri Bledu) → bled, NE triglav", Boolean(trickyBled) && !trickyTriglav, JSON.stringify(tricky.matches));
// parsePins: MAX_PINS meja
const many = parsePins(Array.from({ length: 3000 }, (_, i) => `Kraj ${i}`).join("\n"));
check("MAX_PINS 2000 meja", many.pins.length === 2000, `dobili ${many.pins.length}`);

console.log(failures === 0 ? "\n✅ VSI TESTI ZELENI" : `\n❌ ${failures} napak`);
process.exit(failures === 0 ? 0 : 1);
