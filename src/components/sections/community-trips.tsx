import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Eye,
  Footprints,
  MapPin,
  Route,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { db } from "@/lib/db";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { DayPlan } from "@/lib/types";

// ============================================================================
// COMMUNITY TRIPS — javna galerija skupnostnih potovanj (homepage)
// ============================================================================
//
// Viralni loop: obiskovalci si z AI načrtovalnikom izdelajo itinerer,
// ga shranijo prek "Shrani in deli" (shareId) → javni načrti se pojavijo
// tu → nov promet prek deljenih povezav /pot/{shareId} konvertira prek
// monetizacijskih poti (tržnica/košarica, rezervacije izkušenj).
//
// SERVER komponenta (async) — bere SavedItinerary direktno iz baze
// (isti vzorec kot /pot/[shareId]/page.tsx), brez client fetchanja.
// Prazna galerija (0 javnih poti) → rendera null (sekcija se skrije).
// ============================================================================

/** Koliko javnih potovanj prikažemo v galeriji */
const TAKE = 8;

/** Fallback ime, kadar shranjen itinerer nima imena */
const FALLBACK_NAME = "Po Sloveniji z AI";

/** Max destinacijskih badge-ov na kartici */
const MAX_DESTINATION_BADGES = 3;

// Preslikava destination_id → ime (slovenia-data je source of truth)
const DESTINATION_NAME_BY_ID = new Map<string, string>(
  DESTINATIONS.map((d) => [d.id, d.name])
);
// Preslikava destination_id → URL naslovne slike (prva destinacija = cover)
const DESTINATION_IMAGE_BY_ID = new Map<string, string>(
  DESTINATIONS.map((d) => [d.id, d.image])
);

interface CommunityTrip {
  shareId: string;
  name: string;
  dayCount: number;
  /** Imena destinacij (unikatna, po vrsti pojavljanja) */
  destinationNames: string[];
  /** Skupno število aktivnosti/lokacij skozi vse dneve */
  activityCount: number;
  views: number;
  createdAt: Date;
  /** URL slike prve destinacije (cover kartice), če obstaja */
  coverImage: string | null;
}

/**
 * Relativni čas v slovenščini ("pred 3 dnevi", "pred 2 mesecema").
 * Intl.RelativeTimeFormat("sl") z numeric: "auto" da pravilne
 * slovenske dvojine/množine (včeraj/danes ipd.).
 */
function relativniCas(date: Date): string {
  const rtf = new Intl.RelativeTimeFormat("sl", { numeric: "auto" });
  const sekunde = (date.getTime() - Date.now()) / 1000; // negativno = preteklost
  const abs = Math.abs(sekunde);

  if (abs < 60) return rtf.format(Math.round(sekunde), "second");
  if (abs < 3_600) return rtf.format(Math.round(sekunde / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(sekunde / 3_600), "hour");
  if (abs < 86_400 * 30) return rtf.format(Math.round(sekunde / 86_400), "day");
  if (abs < 86_400 * 365)
    return rtf.format(Math.round(sekunde / (86_400 * 30)), "month");
  return rtf.format(Math.round(sekunde / (86_400 * 365)), "year");
}

/** Slovenščina za števnike dni ("1 dan" / "2 dneva" / "5 dni") */
function formatDni(count: number): string {
  if (count === 1) return "1 dan";
  if (count === 2) return "2 dneva";
  if (count === 3) return "3 dni";
  if (count === 4) return "4 dni";
  return `${count} dni`;
}

/** Slovenščina za števnike ogledov ("1 ogled" / "2 ogleda" / "5 ogledov") */
function formatOgledi(count: number): string {
  if (count === 1) return "1 ogled";
  if (count === 2) return "2 ogleda";
  if (count === 3) return "3 ogledi";
  if (count === 4) return "4 ogledi";
  return `${count} ogledov`;
}

/** Slovenščina za števnike aktivnosti ("1 aktivnost" / "4 aktivnosti") */
function formatAktivnosti(count: number): string {
  if (count === 1) return "1 aktivnost";
  if (count >= 2 && count <= 4) return `${count} aktivnosti`;
  return `${count} aktivnosti`;
}

/**
 * Izlušči podatke za kartico iz shranjenega JSON itinererja.
 * Vrne null, če je JSON pokvarjen ali brez veljavnih dni (vrstico preskočimo).
 */
function parseTrip(row: {
  shareId: string;
  name: string | null;
  views: number;
  createdAt: Date;
  itinerary: string;
}): CommunityTrip | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.itinerary);
  } catch {
    console.error(
      "[community-trips] pokvarjen JSON itinererja — preskakujem:",
      row.shareId
    );
    return null;
  }

  const days = (parsed as { days?: unknown })?.days;
  if (!Array.isArray(days) || days.length === 0) return null;

  // Samo dnevi z veljavnim seznamom lokacij (isti hardening kot /pot stran)
  const validDays = days.filter(
    (d): d is DayPlan =>
      typeof d === "object" &&
      d !== null &&
      Array.isArray((d as DayPlan).locations)
  );
  if (validDays.length === 0) return null;

  // Destinacije: unikatni destination_id po vrsti pojavljanja;
  // ime najprej iz slovenia-data (source of truth), fallback destination_name
  const destinationIds: string[] = [];
  const destinationNames: string[] = [];
  let activityCount = 0;

  for (const day of validDays) {
    for (const loc of day.locations ?? []) {
      activityCount += 1;
      const id = typeof loc?.destination_id === "string" ? loc.destination_id : null;
      const fallbackName =
        typeof loc?.destination_name === "string" ? loc.destination_name : null;
      if (!id || destinationIds.includes(id)) continue;
      destinationIds.push(id);
      destinationNames.push(
        DESTINATION_NAME_BY_ID.get(id) ?? fallbackName ?? id
      );
    }
  }

  return {
    shareId: row.shareId,
    name: row.name?.trim() || FALLBACK_NAME,
    dayCount: validDays.length,
    destinationNames,
    activityCount,
    views: row.views,
    createdAt: row.createdAt,
    coverImage:
      DESTINATION_IMAGE_BY_ID.get(destinationIds[0] ?? "") ?? null,
  };
}

export async function CommunityTrips() {
  // Javni itinerarji: shareId je vselej generiran ob "Shrani in deli",
  // vendar branju dodamo varnostni filter (neprazno shareId)
  let rows: {
    shareId: string;
    name: string | null;
    views: number;
    createdAt: Date;
    itinerary: string;
  }[] = [];

  try {
    rows = await db.savedItinerary.findMany({
      where: { shareId: { not: "" } },
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: {
        shareId: true,
        name: true,
        views: true,
        createdAt: true,
        itinerary: true,
      },
    });
  } catch (e) {
    // Galerija ni kritična za homepage — ob napaki se skrijemo
    console.error("[community-trips] branje SavedItinerary napaka:", e);
    return null;
  }

  const trips = rows
    .map(parseTrip)
    .filter((t): t is CommunityTrip => t !== null);

  // Prazna galerija → sekcija se ne rendera (legitimno stanje)
  if (trips.length === 0) return null;

  return (
    <section
      id="skupnost"
      className="scroll-mt-20 py-16 sm:py-20"
      aria-labelledby="skupnost-title"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Glava sekcije */}
        <div className="mx-auto max-w-2xl text-center">
          <Badge
            variant="outline"
            className="mb-3 border-primary/30 text-primary"
          >
            <Sparkles className="size-3" aria-hidden="true" />
            Skupnost
          </Badge>
          <h2
            id="skupnost-title"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Skupnost načrtuje
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Javni itinerarji, ki so jih ustvarili obiskovalci — poglej,
            glasuj, kopiraj idejo.
          </p>
        </div>

        {/* Galerija javnih potovanj */}
        <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {trips.map((trip) => (
            <li key={trip.shareId} className="h-full">
              <CommunityTripCard trip={trip} />
            </li>
          ))}
        </ul>

        {/* CTA — viralni loop nazaj v načrtovalnik */}
        <div className="mt-10 flex justify-center">
          <Button asChild size="lg">
            <Link href="/nacrtuj">
              Ustvari svoj načrt
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function CommunityTripCard({ trip }: { trip: CommunityTrip }) {
  const visibleDestinations = trip.destinationNames.slice(
    0,
    MAX_DESTINATION_BADGES
  );
  const hiddenDestinations =
    trip.destinationNames.length - visibleDestinations.length;
  const href = `/pot/${trip.shareId}`;
  const ariaLabel = `Odpri načrt: ${trip.name} (${formatDni(trip.dayCount)})`;

  return (
    <Card className="group h-full gap-0 overflow-hidden py-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      {/* Cover — slika prve destinacije (fallback: ikona poti) */}
      {trip.coverImage ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
          <img
            src={trip.coverImage}
            alt={`Potovanje ${trip.name} — ${trip.destinationNames[0] ?? "Slovenija"}`}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      ) : (
        <div
          className="flex aspect-[16/9] w-full items-center justify-center bg-muted"
          aria-hidden="true"
        >
          <Route className="size-10 text-muted-foreground/60" />
        </div>
      )}

      <CardContent className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        {/* Meta vrstica: dnevi + ogledi */}
        <div className="flex items-center justify-between gap-2 text-sm">
          <span
            className="inline-flex items-center gap-1.5 font-medium text-foreground/80"
            title="Trajanje potovanja"
          >
            <Calendar className="size-4 text-primary" aria-hidden="true" />
            {formatDni(trip.dayCount)}
          </span>
          <span
            className="inline-flex items-center gap-1.5 text-muted-foreground"
            title="Število ogledov deljene strani"
          >
            <Eye className="size-4 text-primary" aria-hidden="true" />
            {formatOgledi(trip.views)}
          </span>
        </div>

        {/* Ime poti */}
        <h3 className="text-lg font-semibold leading-tight line-clamp-1">
          {trip.name}
        </h3>

        {/* Destinacije */}
        {visibleDestinations.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {visibleDestinations.map((name) => (
              <Badge
                key={name}
                variant="secondary"
                className="font-medium"
              >
                <MapPin className="size-3" aria-hidden="true" />
                {name}
              </Badge>
            ))}
            {hiddenDestinations > 0 ? (
              <Badge variant="outline" className="text-muted-foreground">
                +{hiddenDestinations}
              </Badge>
            ) : null}
          </div>
        ) : null}

        {/* Aktivnosti + relativni čas nastanka */}
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span
            className="inline-flex items-center gap-1.5"
            title="Skupno število aktivnosti"
          >
            <Footprints className="size-4 text-primary" aria-hidden="true" />
            {formatAktivnosti(trip.activityCount)}
          </span>
          <span title="Kdaj je bil načrt ustvarjen">
            Nastal {relativniCas(trip.createdAt)}
          </span>
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 sm:p-5 sm:pt-0">
        <Button asChild variant="outline" className="w-full">
          <Link href={href} aria-label={ariaLabel}>
            Odpri načrt
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

export default CommunityTrips;
