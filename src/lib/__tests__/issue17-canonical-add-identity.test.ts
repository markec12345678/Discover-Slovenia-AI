// ============================================================================
// ISSUE #17 (FINAL PRODUCT COMPLETION) §5 — KANONSKA IDENTITETA
// „DODAJ V MOJO POT" IZ KLEPETA · unit + source-contract
// ----------------------------------------------------------------------------
// Audit #17 §5 (22 Add-površin, vse kanonske addMyTripItem) je odkril 2
// IDENTITETNA razcepa klepeta proti kanonu vseh ostalih površin:
//   1) DESTINACIJA: klepet je pisal refId „t1-bled" (geo-intent interni id),
//      destination-modal/hub/konzultacija/smart-search pa „bled" (SLUG)
//      → isti Bled je zaradi dedup kind:refId obstal 2× v zbirki;
//   2) OSM LOKAL: klepet je pisal kind „poi" + refId „osm-node-123",
//      zemljevid (F3 supply write-through) pa kind „product" + refId
//      „osm:node-123" (osm-adapter id oblika) → isti lokal 2×.
//
// Popravek (1.153.0): ENA točka resnice chatPlaceTripItem(place) v
// src/lib/chat-add-place.ts — OBE klepetovi dodajalni površini (AddToTripButton
// kartice kraja + handleAddPlace) uporabljata isti preslikovalnik.
//
// Unit testi so čisti (0 DOM); source-contract readFileSync po kanonu
// Task 28/33/34 (brez uvozov @/app). Acceptance #17 §5: „Add iz katere koli
// površine → isti canonical MyTrip zapis."
// ============================================================================
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { chatPlaceTripItem } from "@/lib/chat-add-place";
import { supplyTripItem, supplyTripKind } from "@/lib/supply/my-trip-item";
import { myTripKey, type MyTripKind } from "@/lib/my-trip";
import { destinationToPlace, type ChatPlace } from "@/lib/geo-intent";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { ProductType } from "@/lib/supply/types";

const CHATBOT_SRC = readFileSync(
  new URL("../../components/chatbot.tsx", import.meta.url),
  "utf8",
);
const DEST_MODAL_SRC = readFileSync(
  new URL("../../components/sections/destination-modal.tsx", import.meta.url),
  "utf8",
);
const CHAT_ADD_PLACE_SRC = readFileSync(
  new URL("../chat-add-place.ts", import.meta.url),
  "utf8",
);

/** Prvi T1 kraj s slugom iz DEJANSKEGA dataseta (reprodukcija produkcijske
 *  preslikave destinationToPlace → chatPlaceTripItem, ne fiksturni ugib). */
const T1_PLACE = destinationToPlace(
  DESTINATIONS.find((d) => typeof d.slug === "string" && d.slug.length > 0)!
);

const OSM_PLACE: ChatPlace = {
  id: "osm-node-123",
  name: "Gostilna pri Lipi",
  lat: 46.051,
  lng: 14.505,
  category: "food",
  provenance: "osm",
  detail: "regional",
};

describe("ISSUE #17 §5: kanonska identiteta klepeta — unit (chatPlaceTripItem)", () => {
  test("T1 destinacija → kind „destination“ + refId = SLUG (kanon ostalih površin odkrivanja)", () => {
    const item = chatPlaceTripItem(T1_PLACE);
    expect(item.kind).toBe("destination");
    // NE „t1-<id>" — ravno ta prefix je delal razcep z destination-modalom
    expect(item.refId).toBe(T1_PLACE.slug as string);
    expect(item.refId).not.toContain("t1-");
    expect(item.href).toBe(`/destinacija/${T1_PLACE.slug}`);
    expect(item.source).toBe("klepet");
  });

  test("T1 identiteta se UJEMA s kanonom destination-modalja (refId: destination.slug)", () => {
    const chatItem = chatPlaceTripItem(T1_PLACE);
    const modalIdentity = myTripKey(
      "destination",
      T1_PLACE.slug as string
    );
    expect(myTripKey(chatItem.kind, chatItem.refId)).toBe(modalIdentity);
  });

  test("OSM lokal → kind „product“ + refId „osm:node-X“ (kanon supply write-throughja F3)", () => {
    const item = chatPlaceTripItem(OSM_PLACE);
    expect(item.kind).toBe("product");
    expect(item.refId).toBe("osm:node-123");
    // href ostaja geo glob-povezava (vzorec TASK 86)
    expect(item.href).toContain("/zemljevid?lat=");
    expect(item.href).toContain("label=");
  });

  test("OSM identiteta se UJEMA s supplyTripItem iz zemljevida/ProductModal/ProductCard (dedup čez površine)", () => {
    const chatItem = chatPlaceTripItem(OSM_PLACE);
    // isti objekt, kakor ga vidi supply plast (osm-adapter id oblika)
    const supplyProduct = {
      id: "osm:node-123",
      type: "restaurant" as ProductType,
      title: "Gostilna pri Lipi",
      lat: OSM_PLACE.lat,
      lng: OSM_PLACE.lng,
    };
    const supplyItem = supplyTripItem(supplyProduct, "sl", "zemljevid");
    expect(myTripKey(chatItem.kind, chatItem.refId)).toBe(
      myTripKey(supplyItem.kind, supplyItem.refId)
    );
  });

  test("VES spekter OSM tipov konvergira v „product“ (KIND_BY_TYPE pokrije attraction/museum/restaurant/natural …)", () => {
    const osmTypes: ProductType[] = [
      "attraction",
      "museum",
      "restaurant",
      "viewpoint",
      "natural",
      "accommodation",
      "poi",
    ];
    for (const type of osmTypes) {
      expect(supplyTripKind(type)).toBe("product");
    }
    // …zato klepetova fiksna vrsta „product" NI ugibanje, ampak dokazljivi kanon
    expect(chatPlaceTripItem(OSM_PLACE).kind).toBe("product");
  });

  test("obrambno: neznan vir brez sluga → vrsta „poi“ s surovim id (iskrena meja brez ugibanja)", () => {
    const weird: ChatPlace = {
      id: "future-source-9",
      name: "Kraj iz prihodnjega vira",
      lat: 1,
      lng: 2,
      category: "food",
      provenance: "osm", // ne-osm oblika id-ja — obrambna veja
    };
    const item = chatPlaceTripItem(weird);
    expect(item.kind).toBe("poi" as MyTripKind);
    expect(item.refId).toBe("future-source-9");
  });

  test("subtitle: kategorija + ocena (javni povzetek, brez PII)", () => {
    const withRating = chatPlaceTripItem(T1_PLACE);
    if (T1_PLACE.rating) {
      expect(withRating.subtitle).toContain(`★ ${T1_PLACE.rating}`);
    }
    const food = chatPlaceTripItem(OSM_PLACE);
    expect(food.subtitle).toContain("food");
    // OSM kraji brez ocene → samo kategorija (brez praznega zvezdice)
    expect(food.subtitle).not.toContain("★");
  });
});

describe("ISSUE #17 §5: source-contract — ENA točka resnice v obeh klepetovih površinah", () => {
  test("chatbot.tsx uporablja chatPlaceTripItem na OBEH dodajalnih mestih (gumb kartice + handleAddPlace)", () => {
    expect(CHATBOT_SRC).toContain("item={chatPlaceTripItem(place)}");
    expect(CHATBOT_SRC).toContain("addMyTripItem(chatPlaceTripItem(place))");
  });

  test("chatbot.tsx NE vsebuje več inline identitete refId: place.id (razcep odstranjen)", () => {
    expect(CHATBOT_SRC).not.toContain("refId: place.id");
    expect(CHATBOT_SRC).not.toContain('kind: place.slug ? "destination" : "poi"');
  });

  test("chat-add-place.ts izvaža preslikovalnik s kanonskima vejama (slug + osm:)", () => {
    expect(CHAT_ADD_PLACE_SRC).toContain("export function chatPlaceTripItem");
    expect(CHAT_ADD_PLACE_SRC).toMatch(/refId: place\.slug/);
    expect(CHAT_ADD_PLACE_SRC).toMatch(/refId: `osm:\$\{place\.id\.slice\(4\)\}`/);
  });

  test("destination-modal OSTAJA na slug kanonu (cross-površinska identiteta ostaja usklajena)", () => {
    expect(DEST_MODAL_SRC).toContain("refId: destination.slug");
  });
});
