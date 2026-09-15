// Test route-order (F16) — optimalno zaporedje dneva.
// Zagon: bun scripts/test-day-order.ts
import { optimizeDayOrder, bestOrder, pathKm } from "../src/lib/route-order";
import { DESTINATIONS } from "../src/lib/slovenia-data";
import type { LocationVisit } from "../src/lib/types";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    failures += 1;
    console.error(`  ❌ ${name} ${detail}`);
  }
}

const byId = (id: string) => DESTINATIONS.find((d) => d.id === id)!;

function mkLoc(id: string, start: string, dur: number): LocationVisit {
  const d = byId(id);
  const [h] = start.split(":").map(Number);
  const endH = Math.min(h + dur, 23);
  return {
    destination_id: id,
    destination_name: d.name,
    time_slot: `${start}-${String(endH).padStart(2, "0")}:00`,
    duration: dur,
    estimated_cost: 10,
    notes: "",
  };
}

console.log("=== 1) bestOrder/pathKm osnove (generic, en vir s plan-check) ===");
{
  const dist = (a: number, b: number) => Math.abs(a - b);
  const km = pathKm([0, 5, 2], dist);
  check("pathKm odprta pot 0→5→2 = 8", km === 8, `dobili ${km}`);
  const { order, km: best } = bestOrder([0, 5, 2], dist);
  check("bestOrder [0,5,2] → [0,2,5], km=5", best === 5 && order.join(",") === "0,2,5", `dobili ${order} km=${best}`);
  // 2-opt veja: 8 točk (gornej od 7)
  const ids = [0, 9, 1, 8, 2, 7, 3, 6];
  const r2 = bestOrder(ids, dist);
  check("2-opt (8 točk) najde krajšo ali enako pot", r2.km <= pathKm(ids, dist), `pred=${pathKm(ids, dist)} po=${r2.km}`);
}

console.log("=== 2) Cik-cak dan: Bled → Piran → Vintgar → Ljubljana ===");
{
  // Zemljevidno: Bled≈Vintgar (blizu), Piran≈Ljubljana sta daleč narazen;
  // zaporedje Bled→Piran→Vintgar→Ljubljana je klasikna cik-cak.
  const locs = [
    mkLoc("bled", "08:00", 4),
    mkLoc("piran", "12:30", 3),
    mkLoc("vintgar", "16:00", 2),
    mkLoc("ljubljana", "18:30", 3),
  ];
  const res = optimizeDayOrder(locs);
  check("vrne rezultat", res !== null);
  if (res) {
    const names = res.locations.map((l) => l.destination_id);
    console.log(`     novo zaporedje: ${names.join(" → ")} (pred ${res.beforeKm} km, po ${res.afterKm} km)`);
    check("prihranek > 0", res.savedKm > 0, `saved=${res.savedKm}`);
    check("vintgar takoj za bledom (soseda)", names.indexOf("vintgar") === names.indexOf("bled") + 1, names.join(","));
    check("km so zaokroženi na 5", res.beforeKm % 5 === 0 && res.afterKm % 5 === 0 && res.savedKm % 5 === 0);
    // Termini: PERMUTACIJA izvirnih nizov — isti multi-set, urejeni začetki,
    // BREZ prekrivanj, ki jih prej ni bilo (nauk testa: izračun iz trajanj
    // je delal prekrivanja — bled 16:00-20:00 + vintgar 18:30-20:30)
    const slots = res.locations.map((l) => l.time_slot);
    console.log(`     novi termini: ${slots.join(" | ")}`);
    check("multiset terminov ohranjen", slots.slice().sort().join("|") === ["08:00-12:00", "12:30-15:00", "16:00-18:00", "18:30-21:00"].sort().join("|"), slots.join("|"));
    const starts = slots.map((s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)));
    check("začetki urejeni naraščajoče", starts.every((v, i) => i === 0 || v >= starts[i - 1]), starts.join(","));
    const noOverlap = slots.every((s, i) => {
      if (i === 0) return true;
      const prevEnd = Number(slots[i - 1].slice(6, 8)) * 60 + Number(slots[i - 1].slice(9, 11));
      return starts[i] >= prevEnd;
    });
    check("brez novih prekrivanj", noOverlap, slots.join(" | "));
    check("isti postanki (multiset id-jev)", names.slice().sort().join(",") === ["bled", "ljubljana", "piran", "vintgar"].join(","));
    check("cena ostane na postanku", res.locations.every((l) => l.estimated_cost === 10));
  }
}

console.log("=== 3) Že optimalen dan (Ljubljana → Bled → Vintgar — geografska linija) ===");
{
  const locs = [
    mkLoc("ljubljana", "08:00", 3),
    mkLoc("bled", "11:30", 2),
    mkLoc("vintgar", "14:00", 4),
  ];
  const res = optimizeDayOrder(locs);
  check("vrne rezultat", res !== null);
  if (res) {
    console.log(`     saved=${res.savedKm} km`);
    check("prihranek ~0 (saved < 5)", res.savedKm < 5, `saved=${res.savedKm}`);
    check("zaporedje nespremenjeno (izenačene permutacije ne premaknejo)", res.locations.map((l) => l.destination_id).join(",") === "ljubljana,bled,vintgar");
  }
}

console.log("=== 4) Robni primeri ===");
{
  check("2 postanka → null", optimizeDayOrder([mkLoc("bled", "08:00", 4), mkLoc("ljubljana", "13:00", 4)]) === null);
  check("1 postanek → null", optimizeDayOrder([mkLoc("bled", "08:00", 4)]) === null);
  check("prazen → null", optimizeDayOrder([]) === null);
  const tuj = { ...mkLoc("bled", "08:00", 4), destination_id: "dunaj" };
  check("neznan ID (brez koordinat) → null", optimizeDayOrder([tuj, mkLoc("piran", "12:00", 3), mkLoc("ljubljana", "16:00", 3)]) === null);
  // Nerazpoznaven termin: vsak postanek obdrži svojega (niz "jutri" ni termin)
  const weird = { ...mkLoc("bled", "08:00", 4), time_slot: "jutri" };
  const res = optimizeDayOrder([weird, mkLoc("piran", "12:00", 3), mkLoc("ljubljana", "16:00", 3)]);
  check("nerazpoznaven termin → rezultat vseeno (cik-cak)", res !== null);
  if (res) {
    const bled = res.locations.find((l) => l.destination_id === "bled");
    check("nerazpoznaven termin ostane svoj", bled?.time_slot === "jutri", bled?.time_slot);
  }
  // Duration 0: termin je veljaven niz → permutacija terminov deluje,
  // trajanje postanka se ne meša z novim terminom
  const noDur = { ...mkLoc("vintgar", "09:00", 0) };
  const res2 = optimizeDayOrder([noDur, mkLoc("bled", "08:00", 4), mkLoc("bohinj", "14:00", 4)]);
  check("duration 0 → rezultat obstaja", res2 !== null);
  if (res2) {
    const vg = res2.locations.find((l) => l.destination_id === "vintgar");
    check("vintgar dobi enega izmed izvirnih terminov", ["09:00-09:00", "08:00-12:00", "14:00-18:00"].includes(vg?.time_slot ?? ""), vg?.time_slot);
  }
}

console.log("=== 5) Determinizem ===");
{
  const locs = [
    mkLoc("bled", "08:00", 4),
    mkLoc("piran", "12:30", 3),
    mkLoc("vintgar", "16:00", 2),
    mkLoc("ljubljana", "18:30", 3),
  ];
  const a = optimizeDayOrder(locs);
  const b = optimizeDayOrder(locs);
  check("isti vhod → identičen izhod (JSON)", JSON.stringify(a) === JSON.stringify(b));
}

console.log("");
if (failures === 0) {
  console.log("VSE PREVERJENE 🎉 (route-order)");
} else {
  console.error(`${failures} napak ❌`);
  process.exit(1);
}
