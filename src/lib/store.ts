import { create } from "zustand";
import { DESTINATIONS } from "./slovenia-data";
import type { Itinerary } from "./types";

interface RouteCoord {
  lat: number;
  lng: number;
  name: string;
}

interface AppState {
  /** AI-generiran itinerer (deljen med ItineraryPlanner in MapSection) */
  itinerary: Itinerary | null;
  setItinerary: (it: Itinerary | null) => void;

  /** Izpeljane koordinate poti za zemljevid */
  routeCoords: RouteCoord[];
}

/**
 * Zustand store za deljenje AI itinererja med komponentami.
 * ItineraryPlanner nastavi itinerer, MapSection ga bere za prikaz poti.
 */
export const useAppStore = create<AppState>((set) => ({
  itinerary: null,
  routeCoords: [],
  setItinerary: (it) => {
    if (!it) {
      set({ itinerary: null, routeCoords: [] });
      return;
    }
    // Izpelji koordinate poti iz itinererja — združi vse lokacije iz vseh dni
    const coords: RouteCoord[] = [];
    const seen = new Set<string>();
    it.days.forEach((day) => {
      day.locations.forEach((loc) => {
        if (seen.has(loc.destination_id)) return;
        seen.add(loc.destination_id);
        const dest = DESTINATIONS.find((d) => d.id === loc.destination_id);
        if (dest) {
          coords.push({
            lat: dest.coords.lat,
            lng: dest.coords.lng,
            name: dest.name,
          });
        }
      });
    });
    set({ itinerary: it, routeCoords: coords });
  },
}));
