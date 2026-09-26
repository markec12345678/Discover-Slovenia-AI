// ============================================================================
// ISSUE #7 — reprodukcija dokazov G4 (deterministični rezervacijski parser
// čez 11 dokumentiranih formatov ponudnikov + iskrena zavrnitev smeti) in
// G9 (destinacijski register: 38 destinacij, države SI/HR/ME/AL, 0 duplikatov).
// Zagon: bun scripts/verify/issue7-golden-path-probes.ts  (0 omrežja, 0 AI)
// ============================================================================
// G4 evidence — deterministic reservation parser across documented provider formats
import { parseReservationText } from "../../src/lib/reservation-text-parse";
import { DESTINATIONS } from "../../src/lib/slovenia-data";

const samples: Array<[string, string]> = [
  ["Booking.com", "Booking.com — Potrditev rezervacije\n\nVaša številka rezervacije: 408.921.371.224\nPrihod: petek, 14. avgusta 2026 (od 14:00) do nedelje, 16. avgusta 2026 (do 10:00)\nHotel Slon — Slovenska cesta 1, 1000 Ljubljana\nSkupaj z DDV: EUR 58,00"],
  ["Airbnb", "Airbnb — Potrdilo o rezervaciji\nKoda rezervacije: HMABC4XY9R\nPrihod: 20. september 2026 · 15:00\nOdhod: 23. september 2026 · 10:00\nHiška ob Soči, Bovec\nSkupno: 342,00 EUR"],
  ["Agoda", "Agoda — Booking Confirmation\nBooking ID: 034891276\nCheck-in: September 3, 2026 2:00 PM\nCheck-out: September 5, 2026 12:00 PM\nHotel Park Ljubljana\nTotal: EUR 210.50"],
  ["Expedia", "Expedia — Confirmation\nItinerary Number: 7284910356732\nCheck-in: Mon, Sep 7, 2026 · 3:00 PM\nCheck-out: Wed, Sep 9, 2026 · 11:00 AM\nGrand Hotel Union, Ljubljana\nTotal price: EUR 396.00"],
  ["GetYourGuide", "GetYourGuide — Your booking confirmation\nBooking reference: GYG-5849217\nDate: August 30, 2026 at 10:30 AM\nLake Bled & Vintgar Gorge Day Trip\nTotal: EUR 89.00"],
  ["Viator", "Viator — Booking Confirmation\nConfirmation code: BR-9846312LV\nScheduled: 2026-08-30, 09:15\nPostojna Cave and Predjama Castle\nTotal: EUR 74.00"],
  ["Tripadvisor", "Tripadvisor — Booking confirmation\nBooking ID: 400281947\nTour date: September 2, 2026, 11:00 AM\nLjubljana Food Walking Tour\nTotal price: EUR 65.00"],
  ["KiwiTaxi", "KiwiTaxi — Transfer booking\nOrder number: KT-7291845\nPickup: 2026-09-10 08:30, Ljubljana Airport (LJU)\nDestination: Bled, Hotel Triglav\nPrice: EUR 55.00"],
  ["DiscoverCars", "DiscoverCars — Rental confirmation\nBooking number: DC-8841279364\nPick-up: 05/09/2026 10:00, Ljubljana Downtown\nDrop-off: 08/09/2026 10:00\nTotal: EUR 132.00"],
  ["Airline PNR", " boarding pass \nPNR: QK4X9T \nLet 1234 LJU-ZAG 12.09.2026 06:45\nPotnik: JANEZ NOVAK "],
  ["Slovenske železnice", "Slovenske železnice — Kartica\nŠt. karte: 00-9871-2345-6789\nVlak 510 Ljubljana–Maribor\nDatum: 15.9.2026, odhod 05:45\nCena: 15,90 EUR"],
  ["junk (expect empty)", "Fajn dan vsem! Lepo vreme je danes, kajne?"],
];

let parsed = 0, empty = 0;
for (const [label, text] of samples) {
  const r = parseReservationText(text);
  const f: any = (r as any).fields ?? r;
  const num = f?.reservationNumber ?? f?.reservationId ?? null;
  const prov = f?.providerName ?? f?.provider ?? null;
  const out = label === "junk (expect empty)"
    ? `${num === null && prov === null ? "OK — iskrene null vrednosti" : `NEPRIČAKOVANO: ${JSON.stringify(f)}`}`
    : `${num ? "#" + String(num).slice(0, 24) : "(brez št.)"} · ${prov ?? "(brez ponudnika)"}`;
  if (num || prov) parsed++; else empty++;
  console.log(`${label.padEnd(22)} → ${out}`);
}
console.log(`\nG4 SKUPAJ: ${parsed} prepoznanek formatov, ${empty === 1 ? "1" : empty} iskrenih praznih (junk)`);

// G9 evidence — destination registry
const total = DESTINATIONS.length;
const countries: Record<string, number> = {};
for (const d of DESTINATIONS as any[]) {
  const c = d.addressCountry ?? d.country ?? "?";
  countries[c] = (countries[c] ?? 0) + 1;
}
console.log(`\nG9 DESTINACIJSKI REGISTER: ${total} destinacij; države: ${JSON.stringify(countries)}`);
const ids = (DESTINATIONS as any[]).map((d) => d.slug ?? d.id ?? d.name);
const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
console.log(`G9 duplikatni ID/ključi: ${dupes.length === 0 ? "0 ✓" : JSON.stringify(dupes)}`);
