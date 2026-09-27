"use client";

// ============================================================================
// CHAT BOOKING BRIDGE — "Most klepet→rezervacija" (Issue #13 / G6, 1.123.0)
// ============================================================================
// Kontekstualni pregled ponudb destinacije, omenjene v AI odgovoru klepeta.
// Benchmark UX 2026 (docs/UX-BENCHMARK-2026-09-27.md, P1-3):
//  - Mindtrip/Layla vzorec: priporočilo → takojšnja transakcijska globina;
//  - naša izvedba: gumb "Rezerviraj" poleg "+" v vrstici kraja odpre TA
//    dialog — ISTA pot kot čip "Vstopnice" na kartici postanka (lokalni
//    ponudniki iz /api/itinerary/bookings + affiliate /go povezave);
//  - NIKOLI klepet-checkout (zavrnjen Layla vzorec plačila v klepetu,
//    §5/§7 benchmarka): dialog je SAMO pregled + povezave — rezervacija
//    poteče pri ponudniku ali prek kontaktne povezave lokalnega ponudnika,
//    uporabnik VEDNO vidi pogoje pred dejanjem.
//
// Kartice so IZVOŽENE iz booking-panel.tsx (ExperienceCard/ListingCard/
// ProductCard/AffiliateCard/EmptyState) — ena vizualna pot z načrtovalcem,
// ni podvojene logike. Lazy-loaded iz chatbot.tsx (teža se naloži šele ob
// prvem kliku "Rezerviraj").
// ============================================================================

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Ticket, Hotel, BedDouble, ShoppingBasket } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  AffiliateCard,
  ListingCard,
  ExperienceCard,
  ProductCard,
  EmptyState,
  goHref,
  type BookingData,
} from "@/components/sections/booking-panel";
import type { ChatPlace } from "@/lib/geo-intent";
import { trackFunnel } from "@/lib/funnel";

/**
 * destinationId iz ChatPlace.id — geo-intent kanon: T1 destinacije nosijo
 * id "t1-{destId}" (glej destinationToPlace v lib/geo-intent.ts). Kraji,
 * ki niso T1, do tukaj sploh ne pridejo (gumb se ne izriše).
 */
function destinationIdOf(place: ChatPlace): string {
  return place.id.startsWith("t1-") ? place.id.slice(3) : place.id;
}

export function BookingBridgeDialog({
  place,
  onClose,
}: {
  /** Ciljna destinacija (null = zaprto). */
  place: ChatPlace | null;
  onClose: () => void;
}) {
  const t = useTranslations("chatbot");
  const tb = useTranslations("planner.booking");
  // G7 vzorec (kanon start-date-weather-strip): stanje je KLJUČENO z
  // identiteto zahteve — render IZPELJE loading/ error/ data iz ujemanja
  // ključa (brez setState v telesu efekta — react-hooks/set-state-in-effect
  // čist; setState SAMO v async .then/.catch).
  const [result, setResult] = useState<{
    key: string;
    data: BookingData;
  } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  // Retry števec — ponovni poskus iste destinacije brez zapiranja dialoga
  // (spremeni ključ → izpeljani loading se takoj prikaže).
  const [retryNonce, setRetryNonce] = useState(0);

  const requestKey = place
    ? `${destinationIdOf(place)}#${retryNonce}`
    : null;

  // Fetch ob odprtju / ponovnem poskusu — ISTA API pot kot planner
  // (POST /api/itinerary/bookings { destinationIds }). Odpoved je iskrena
  // (error + gumb Poskusi znova), nikoli prazen uspeh.
  useEffect(() => {
    if (!place) return;
    const destId = destinationIdOf(place);
    const key = `${destId}#${retryNonce}`;
    let cancelled = false;
    fetch("/api/itinerary/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinationIds: [destId] }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Napaka pri pridobivanju booking opcij");
        return r.json() as Promise<BookingData>;
      })
      .then((d) => {
        if (!cancelled) setResult({ key, data: d });
      })
      .catch(() => {
        if (!cancelled) setFailedKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [place, retryNonce]);

  if (!place) return null;

  // Izpeljana stanja (key-matching — odpoved prejšnje zahteve ne bleed-a
  // v naslednjo destinacijo).
  const destName = place.name;
  const destId = destinationIdOf(place);
  const data =
    result && result.key === requestKey ? result.data : null;
  const error = failedKey === requestKey && requestKey !== null;
  const loading = requestKey !== null && data === null && !error;
  const opts = data?.[destId];
  const experiences = opts?.experiences ?? [];
  const listings = opts?.listings ?? [];
  const products = opts?.products ?? [];
  const hasLocal =
    experiences.length + listings.length + products.length > 0;

  return (
    <Dialog
      open={place !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        showCloseButton
        className="max-h-[85vh] gap-0 overflow-y-auto p-0 sm:max-w-lg"
      >
        <div className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-1.5 text-base">
            <Ticket className="size-4 shrink-0 text-primary" aria-hidden />
            {t("bookDialogTitle", { name: destName })}
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs leading-relaxed">
            {t("bookDialogIntro")}
          </DialogDescription>
        </div>

        <div className="space-y-4 p-4">
          {/* Lokalni ponudniki — isto skladišče kot booking plošča dneva */}
          {loading ? (
            <div className="space-y-2" aria-live="polite">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                {t("bookDialogLoading")}
              </p>
              <div className="h-16 animate-pulse rounded-lg bg-muted" />
              <div className="h-16 animate-pulse rounded-lg bg-muted" />
            </div>
          ) : error ? (
            <div className="space-y-2">
              <EmptyState
                icon={<Ticket className="size-5" aria-hidden />}
                text={t("bookDialogError")}
              />
              <div className="flex justify-center">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setRetryNonce((n) => n + 1)}
                >
                  {t("bookDialogRetry")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Izkušnje (aktivnosti) — isti ExperienceCard kot planner */}
              {experiences.length > 0 && (
                <section className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Ticket className="size-3.5" aria-hidden />
                    {tb("tabActivities")}
                    <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                      {experiences.length}
                    </span>
                  </h3>
                  {experiences.map((e) => (
                    <ExperienceCard key={e.id} exp={e} />
                  ))}
                </section>
              )}

              {/* Nastanitev (lokalni lokali) — isti ListingCard kot planner */}
              {listings.length > 0 && (
                <section className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <BedDouble className="size-3.5" aria-hidden />
                    {tb("tabAccommodation")}
                    <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                      {listings.length}
                    </span>
                  </h3>
                  {listings.map((l) => (
                    <ListingCard key={l.id} listing={l} />
                  ))}
                </section>
              )}

              {/* Lokalni izdelki — isti ProductCard kot planner */}
              {products.length > 0 && (
                <section className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <ShoppingBasket className="size-3.5" aria-hidden />
                    {tb("localProducts")}
                    <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                      {products.length}
                    </span>
                  </h3>
                  {products.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </section>
              )}

              {/* Iskreno prazno stanje — brez lokalnih ponudnikov za dest. */}
              {!hasLocal && (
                <EmptyState
                  icon={<Ticket className="size-5" aria-hidden />}
                  text={t("bookDialogEmpty", { name: destName })}
                />
              )}
            </>
          )}

          {/* Affiliate povezave — ISTA vrstica kot modal destinacije
              (Booking.com / GetYourGuide / Tiqets prek /go redirecta).
              Vidne NEODVISNO od lokalnega skladišča (dostopne tudi ob
              napaki nalaganja). Destinacijsko ciljene (dest param). */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Hotel className="size-3.5" aria-hidden />
              {t("bookDialogPartners")}
            </h3>
            <AffiliateCard
              href={goHref("hotels", destName)}
              icon={<Hotel className="size-5" aria-hidden />}
              partnerName="Booking.com"
              cta={tb("ctaSearch")}
              description={tb("hotelsDesc", { dest: destName })}
              onTrack={() => trackFunnel("listing_click", goHref("hotels", destName))}
            />
            <AffiliateCard
              href={goHref("activities", destName)}
              icon={<Ticket className="size-5" aria-hidden />}
              partnerName="GetYourGuide"
              cta={tb("ctaSearch")}
              description={tb("activitiesDesc", { dest: destName })}
              onTrack={() =>
                trackFunnel("listing_click", goHref("activities", destName))
              }
            />
            <AffiliateCard
              href={goHref("tickets", destName)}
              icon={<Ticket className="size-5" aria-hidden />}
              partnerName="Tiqets"
              cta={tb("ctaTickets")}
              description={tb("ticketsDesc")}
              onTrack={() =>
                trackFunnel("listing_click", goHref("tickets", destName))
              }
            />
          </section>

          <Separator />

          {/* Poštena zaščitna nota — iskrenost nad pretirano samozavestjo */}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t("bookDialogNote")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
