import type { AffiliateLinks } from "./types";

// Affiliate konfiguracija - v production pride iz env spremenljivk
const AFFILIATE_IDS = {
  booking: process.env.NEXT_PUBLIC_BOOKING_AID || "1234567",
  discoverCars: process.env.NEXT_PUBLIC_DC_AFFILIATE || "slovenia-demo",
  viator: process.env.NEXT_PUBLIC_VIATOR_PID || "slovenia-demo",
  getYourGuide: process.env.NEXT_PUBLIC_GYG_PID || "slovenia-demo",
  skyscanner: process.env.NEXT_PUBLIC_SKYSCANNER_AID || "slovenia-demo",
  worldNomads: process.env.NEXT_PUBLIC_WN_AID || "slovenia-demo",
};

// Privzeti datumi (14 dni naprej)
function defaultDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
}

// === HOTELI - Booking.com (5% provizija) ===
export function getBookingUrl(destination: string): string {
  const params = new URLSearchParams({
    ss: destination,
    aid: AFFILIATE_IDS.booking,
    lang: "sl",
    checkin: defaultDate(14),
    checkout: defaultDate(16),
    group_adults: "2",
    no_rooms: "1",
    src: "index",
  });
  return `https://www.booking.com/searchresults.html?${params.toString()}`;
}

// === NAJEM AVTA - DiscoverCars (70% provizija - najvišja!) ===
export function getDiscoverCarsUrl(pickupLocation: string): string {
  const params = new URLSearchParams({
    affiliate: AFFILIATE_IDS.discoverCars,
    pickuplocation: pickupLocation,
    pickupdate: defaultDate(14),
    returndate: defaultDate(21),
    driverage: "25",
    language: "en",
    currency: "EUR",
    utm_source: "ifeelslovenia",
    utm_medium: "affiliate",
  });
  return `https://www.discovercars.com/?${params.toString()}`;
}

// === AKTIVNOSTI - Viator (8% provizija) ===
export function getViatorUrl(destination: string): string {
  const params = new URLSearchParams({
    q: `${destination} tours`,
    pid: AFFILIATE_IDS.viator,
  });
  return `https://www.viator.com/search?${params.toString()}`;
}

// === AKTIVNOSTI - GetYourGuide (8% provizija) ===
export function getGetYourGuideUrl(destination: string): string {
  const params = new URLSearchParams({
    partner_id: AFFILIATE_IDS.getYourGuide,
    utm_source: "ifeelslovenia",
  });
  return `https://www.getyourguide.com/s/${encodeURIComponent(destination)}?${params.toString()}`;
}

// === LETI - Skyscanner (40% provizija) ===
export function getSkyscannerUrl(destination: string): string {
  const params = new URLSearchParams({
    adults: "1",
    utm_source: "ifeelslovenia",
  });
  return `https://www.skyscanner.net/transport/flights-to/${encodeURIComponent(destination.toLowerCase())}/?${params.toString()}`;
}

// === ZAVAROVANJE - World Nomads ===
export function getWorldNomadsUrl(tripDays = 7): string {
  const params = new URLSearchParams({
    affiliate: AFFILIATE_IDS.worldNomads,
    trip_days: tripDays.toString(),
    utm_source: "ifeelslovenia",
  });
  return `https://www.worldnomads.com/travel-insurance?${params.toString()}`;
}

// Vse povezave za destinacijo na enem mestu
export function getAffiliateLinks(destinationName: string): AffiliateLinks {
  return {
    hotels: getBookingUrl(destinationName),
    cars: getDiscoverCarsUrl(destinationName),
    activities: getViatorUrl(destinationName),
    flights: getSkyscannerUrl(destinationName),
    insurance: getWorldNomadsUrl(),
  };
}

// Provizijske informacije za prikaz
export const COMMISSION_INFO = {
  cars: { rate: "70%", note: "do 210 € na rezervacijo" },
  hotels: { rate: "5%", note: "Booking.com" },
  activities: { rate: "8%", note: "Viator / GetYourGuide" },
  flights: { rate: "40%", note: "Skyscanner" },
  insurance: { rate: "PPQ", note: "World Nomads" },
} as const;
