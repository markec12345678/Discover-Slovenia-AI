// ============================================================================
// GEO-CORRIDOR — skupna čista geometrija za "koridor okrog odseka" (backlog #5
// in #6). Izluščeno iz src/app/api/itinerary/stops-along-way/route.ts (1.24.0),
// da jo lahko uporabi tudi odjemalec (meal-stops.ts) — identične formule,
// nobenih odvisnosti, hidracijsko varno.
// ============================================================================

/** Haversine razdalja v km (ista formula kot čiste plasti). */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Razdalja točke P od ODSEKA A→B v km (lokalna ploskev — za razdalje znotraj
 * Slovenije dovolj natančno za koridor predfilter). Projekcija izven odseka
 * → razdalja do najbližjega krajišča (klasična point-to-segment).
 */
export function pointToSegmentKm(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  // lokalne enote: ~111 km na stopinjo (lat), lng prilagojen s cos(lat)
  const kx = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180)) * 111;
  const ky = 111;
  const ax = a.lng * kx;
  const ay = a.lat * ky;
  const bx = b.lng * kx;
  const by = b.lat * ky;
  const px = p.lng * kx;
  const py = p.lat * ky;

  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return haversineKm(p.lat, p.lng, a.lat, a.lng);

  // projekcijski parameter, prišit na [0, 1]
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}
