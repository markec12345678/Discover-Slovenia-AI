import { create } from "zustand";
import { DESTINATIONS } from "./slovenia-data";
import type { Itinerary } from "./types";

interface RouteCoord {
  lat: number;
  lng: number;
  name: string;
  day?: number; // Dan v itinererju (za color-coded prikaz)
}

// Barve za dni (Wanderlog inspiracija)
const DAY_COLORS = [
  "#2d6a3e", // Dan 1 — zelena (primary)
  "#d97706", // Dan 2 — oranžna
  "#7c3aed", // Dan 3 — vijolična
  "#0891b2", // Dan 4 — cyan
  "#dc2626", // Dan 5 — rdeča
  "#ea580c", // Dan 6 — temno oranžna
  "#16a34a", // Dan 7 — svetlo zelena
  "#9333ea", // Dan 8 — temno vijolična
  "#0284c7", // Dan 9 — temno cyan
  "#c2410c", // Dan 10 — rjava
  "#15803d", // Dan 11
  "#be185d", // Dan 12
  "#1d4ed8", // Dan 13
  "#b45309", // Dan 14
];

interface AppState {
  /** AI-generiran itinerer (deljen med ItineraryPlanner in MapSection) */
  itinerary: Itinerary | null;
  setItinerary: (it: Itinerary | null) => void;

  /** Izpeljane koordinate poti za zemljevid */
  routeCoords: RouteCoord[];

  /** Koordinate grupirane po dnevih (za color-coded prikaz) */
  routeByDay: { day: number; color: string; coords: RouteCoord[] }[];
}

/**
 * Zustand store za deljenje AI itinererja med komponentami.
 * ItineraryPlanner nastavi itinerer, MapSection ga bere za prikaz poti.
 */
export const useAppStore = create<AppState>((set) => ({
  itinerary: null,
  routeCoords: [],
  routeByDay: [],
  setItinerary: (it) => {
    if (!it) {
      set({ itinerary: null, routeCoords: [], routeByDay: [] });
      return;
    }

    // Izpelji koordinate poti iz itinererja — grupirano po dnevih
    const allCoords: RouteCoord[] = [];
    const byDay: { day: number; color: string; coords: RouteCoord[] }[] = [];
    const seen = new Set<string>();

    it.days.forEach((dayPlan) => {
      const dayCoords: RouteCoord[] = [];
      dayPlan.locations.forEach((loc) => {
        const dest = DESTINATIONS.find((d) => d.id === loc.destination_id);
        if (dest) {
          const coord: RouteCoord = {
            lat: dest.coords.lat,
            lng: dest.coords.lng,
            name: dest.name,
            day: dayPlan.day,
          };
          allCoords.push(coord);
          dayCoords.push(coord);
          seen.add(loc.destination_id);
        }
      });

      if (dayCoords.length > 0) {
        byDay.push({
          day: dayPlan.day,
          color: DAY_COLORS[(dayPlan.day - 1) % DAY_COLORS.length],
          coords: dayCoords,
        });
      }
    });

    set({ itinerary: it, routeCoords: allCoords, routeByDay: byDay });
  },
}));

export { DAY_COLORS };
