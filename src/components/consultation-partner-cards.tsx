import Link from "next/link";
import {
  CalendarCheck,
  CalendarDays,
  Clock,
  MapPin,
  ShoppingBag,
  Star,
  Store,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { EVENTS, EVENT_CATEGORY_LABELS } from "@/lib/events-data";
import { CATEGORY_LABELS } from "@/lib/listings-types";
import {
  EXPERIENCE_CATEGORY_LABELS,
  PRODUCT_CATEGORY_LABELS,
} from "@/lib/marketplace-types";
import type { ConsultRecommendedPartner } from "@/lib/consultation-engine";

// ============================================================================
// PLACE CARDS KONZULTACIJE — vizualne kartice priporočenih partnerjev
// ============================================================================
// Mindtrip-style nadgradnja /konzultacija/[token]: AI odgovor je partnerje
// prej našteval kot besedilne čipe; zdaj vsak priporočen partner dobi
// KARTICO s fotografijo, destinacijo, oceno, ceno in rezervacijskim CTA.
//
// Strategija obogatitve (server-side, RSC):
//  - ConsultRecommendedPartner ne nosi ID-jev (zavesten format zapisa —
//    enak kot LocalQuestion), zato partnerje UJEMAMO PO IMENU against
//    Listing/Experience/Product (status: "published") + statični EVENTS.
//  - Imena v zapisu nastanejo iz teh istih tabel (extractConsultPartners
//    kopira imena 1:1 iz konteksta), torej je ujemanje po imenu zanesljivo;
//    primerjava je case-insensitive (JS stran), ker SQLite `in` ni in
//    `mode: "insensitive"` na SQLite ni podprt.
//  - Vsem trem tabelam pošljemo celoten seznam imen (ne filtriramo po
//    vrsti) — isti strošek (3 poizvedbe), pokrijemo pa morebitno
//    anomalijo vrste v shranjenem zapisu.
//  - Vsi DB klici so v .catch(() => []) — obogatitev je POGOJNA: nikoli
//    ne sesuje strani; partner brez ujemanja dobi preprosto besedilno
//    kartico (ime + vrsta + CTA), odgovor ostane viden (honest fallback).
//  - Rezervacijski CTA ponovno uporablja obstoječi mehanizem strani
//    (partnerUrl → /destinacija/[slug]/things-to-do, kjer se odpre
//    rezervacijski modal) — brez novih rut.
// ============================================================================

const KIND_LABEL: Record<string, string> = {
  lokal: "Lokal",
  izkušnja: "Izkušnja",
  izdelek: "Izdelek",
  dogodek: "Dogodek",
};

/** Fallback ikona kartice, kadar partner nima fotografije (vzorec seo-conversion). */
const KIND_FALLBACK_ICON = {
  lokal: Store,
  izkušnja: CalendarCheck,
  izdelek: ShoppingBag,
  dogodek: CalendarDays,
} as const;

/** Isti URL mehanizem kot prejšnji čipi na strani konzultacije. */
function partnerUrl(partner: ConsultRecommendedPartner): string {
  if (partner.destinationName) {
    const dest = DESTINATIONS.find((d) => d.name === partner.destinationName);
    if (dest) return `/destinacija/${dest.slug}/things-to-do`;
  }
  return "/";
}

/** Varno izlušči prvo veljavno sliko iz JSON array string-a (nikoli ne vrže). */
function firstImage(imagesJson: string | null | undefined): string | null {
  if (!imagesJson) return null;
  try {
    const parsed: unknown = JSON.parse(imagesJson);
    if (Array.isArray(parsed)) {
      const first = parsed.find(
        (x): x is string => typeof x === "string" && x.trim().length > 0
      );
      return first ?? null;
    }
  } catch {
    // pokvarjen JSON slik — kartica izriše ikono-namestek
  }
  return null;
}

/** Slovenski prikaz datuma dogodka (npr. „12. julij“). */
function formatEventDate(iso: string): string | null {
  try {
    return new Intl.DateTimeFormat("sl-SI", {
      day: "numeric",
      month: "long",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

// === Obogatene kartice — podatkovni model ===

interface PartnerCardData {
  /** Podatki iz shranjenega zapisa konzultacije (vedno na voljo). */
  partner: ConsultRecommendedPartner;
  /** Live fotografija iz baze / statičnega dogodka (null → besedilna kartica). */
  image: string | null;
  rating: number | null;
  reviewCount: number | null;
  /** Človeku berljiva cena („od €45 na osebo“, „€12“, „Cenovni razred €€“). */
  priceLabel: string | null;
  /** Trajanje izkušnje v urah (samo izkušnje). */
  durationHours: number | null;
  /** Datum dogodka (samo statični dogodki). */
  eventDateLabel: string | null;
  /** Live paket partnerja (veljavnejši od shranjenega posnetka). */
  livePlan: string | null;
  /** Ali je lokal TRENUTNO aktivno sponzoriran (transparentnost EU). */
  sponsoredActive: boolean;
}

interface ListingRow {
  name: string;
  category: string;
  destinationName: string | null;
  images: string;
  rating: number;
  reviewCount: number;
  priceRange: string;
  plan: string;
  sponsored: boolean;
  sponsoredUntil: Date | null;
}

interface ExperienceRow {
  name: string;
  category: string;
  destinationName: string | null;
  images: string;
  rating: number;
  reviewCount: number;
  pricePerPerson: number;
  durationHours: number;
  plan: string;
}

interface ProductRow {
  name: string;
  category: string;
  destinationName: string | null;
  images: string;
  rating: number;
  reviewCount: number;
  price: number;
  plan: string;
}

/**
 * Obogati priporočene partnerje z live podatki iz baze (vzorec iz
 * buildConsultationContext: vsak klic falla v prazen seznam, nikoli ne vrže).
 */
async function enrichPartners(
  partners: ConsultRecommendedPartner[]
): Promise<PartnerCardData[]> {
  const names = partners.map((p) => p.name);
  const now = new Date();

  const [listings, experiences, products] = await Promise.all([
    db.listing
      .findMany({
        where: { status: "published", name: { in: names } },
        select: {
          name: true, category: true, destinationName: true, images: true,
          rating: true, reviewCount: true, priceRange: true, plan: true,
          sponsored: true, sponsoredUntil: true,
        },
      })
      .catch(() => [] as ListingRow[]),
    db.experience
      .findMany({
        where: { status: "published", name: { in: names } },
        select: {
          name: true, category: true, destinationName: true, images: true,
          rating: true, reviewCount: true, pricePerPerson: true,
          durationHours: true, plan: true,
        },
      })
      .catch(() => [] as ExperienceRow[]),
    db.product
      .findMany({
        where: { status: "published", name: { in: names } },
        select: {
          name: true, category: true, destinationName: true, images: true,
          rating: true, reviewCount: true, price: true, plan: true,
        },
      })
      .catch(() => [] as ProductRow[]),
  ]);

  // LUT po lowercase imenu; konflikt istega imena razreši višja ocena
  // (deterministični vrstni red — RSC izpis mora biti stabilen)
  const byLower = <T extends { name: string; rating: number }>(
    rows: T[]
  ): Map<string, T> => {
    const map = new Map<string, T>();
    for (const row of [...rows].sort((a, b) => b.rating - a.rating)) {
      const key = row.name.toLowerCase();
      if (!map.has(key)) map.set(key, row);
    }
    return map;
  };

  const listingByName = byLower(listings);
  const experienceByName = byLower(experiences);
  const productByName = byLower(products);

  return partners.map((partner) => {
    const key = partner.name.toLowerCase();

    const listing = listingByName.get(key);
    const experience = experienceByName.get(key);
    const product = productByName.get(key);
    // Dogodki so statični (events-data) — niso v DB
    const event =
      partner.kind === "dogodek"
        ? EVENTS.find((e) => e.name.toLowerCase() === key)
        : undefined;

    if (listing) {
      return {
        partner,
        image: firstImage(listing.images),
        rating: listing.rating > 0 ? listing.rating : null,
        reviewCount: listing.reviewCount > 0 ? listing.reviewCount : null,
        priceLabel: listing.priceRange
          ? `Cenovni razred ${listing.priceRange}`
          : null,
        durationHours: null,
        eventDateLabel: null,
        livePlan: listing.plan,
        sponsoredActive:
          listing.sponsored &&
          listing.sponsoredUntil != null &&
          listing.sponsoredUntil > now,
      };
    }
    if (experience) {
      return {
        partner,
        image: firstImage(experience.images),
        rating: experience.rating > 0 ? experience.rating : null,
        reviewCount: experience.reviewCount > 0 ? experience.reviewCount : null,
        priceLabel:
          experience.pricePerPerson != null
            ? `od €${experience.pricePerPerson} na osebo`
            : null,
        durationHours:
          experience.durationHours > 0 ? experience.durationHours : null,
        eventDateLabel: null,
        livePlan: experience.plan,
        sponsoredActive: false,
      };
    }
    if (product) {
      return {
        partner,
        image: firstImage(product.images),
        rating: product.rating > 0 ? product.rating : null,
        reviewCount: product.reviewCount > 0 ? product.reviewCount : null,
        priceLabel: product.price != null ? `€${product.price}` : null,
        durationHours: null,
        eventDateLabel: null,
        livePlan: product.plan,
        sponsoredActive: false,
      };
    }
    if (event) {
      return {
        partner,
        image: event.image || null,
        rating: null,
        reviewCount: null,
        priceLabel:
          event.priceRange === "brezplačno"
            ? "Brezplačno"
            : `Cenovni razred ${event.priceRange}`,
        durationHours: null,
        eventDateLabel: formatEventDate(event.date),
        livePlan: null,
        sponsoredActive: false,
      };
    }

    // Brez ujemanja v bazi — preprosta besedilna kartica (odgovora nikoli ne skrijemo)
    return {
      partner,
      image: null,
      rating: null,
      reviewCount: null,
      priceLabel: null,
      durationHours: null,
      eventDateLabel: null,
      livePlan: null,
      sponsoredActive: false,
    };
  });
}

/** Kategorija partnerja v slovenščini (zbiralnik oznak obstoječih modulov). */
function categoryBadgeLabel(card: PartnerCardData): string | null {
  const category = card.partner.category;
  if (!category) return null;
  switch (card.partner.kind) {
    case "lokal":
      return CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category;
    case "izkušnja":
      return (
        EXPERIENCE_CATEGORY_LABELS[
          category as keyof typeof EXPERIENCE_CATEGORY_LABELS
        ] ?? category
      );
    case "izdelek":
      return (
        PRODUCT_CATEGORY_LABELS[
          category as keyof typeof PRODUCT_CATEGORY_LABELS
        ] ?? category
      );
    case "dogodek":
      return (
        EVENT_CATEGORY_LABELS[category as keyof typeof EVENT_CATEGORY_LABELS] ??
        category
      );
    default:
      return category;
  }
}

interface ConsultationPartnerCardsProps {
  partners: ConsultRecommendedPartner[];
}

/**
 * Vizualne kartice priporočenih partnerjev (server komponenta — bere DB).
 * Mreža 1/2/3 stolpcev; enaka oblika kot SeoExperienceCard (rounded kartica,
 * aspect-video slika, fallback ikona), Triglav zelena primarna barva.
 */
export async function ConsultationPartnerCards({
  partners,
}: ConsultationPartnerCardsProps) {
  const cards = await enrichPartners(partners);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Priporočeni partnerji
      </p>

      <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const kindLabel = KIND_LABEL[card.partner.kind] ?? card.partner.kind;
          const categoryLabel = categoryBadgeLabel(card);
          // Premium ★: live paket, če je zapis obogaten, sicer shranjeni posnetek
          const plan = card.livePlan ?? card.partner.plan;
          const premium = plan === "premium" || plan === "enterprise";
          const href = partnerUrl(card.partner);
          const isExperience = card.partner.kind === "izkušnja";
          const FallbackIcon =
            KIND_FALLBACK_ICON[
              card.partner.kind as keyof typeof KIND_FALLBACK_ICON
            ] ?? MapPin;
          // Ujemanje v bazi dokazuje KATERIKOLI live podatek; brez njega
          // izrišemo samo besedilno kartico (brez praznega sivo plošča)
          const matched =
            card.image !== null ||
            card.rating !== null ||
            card.priceLabel !== null ||
            card.eventDateLabel !== null ||
            card.livePlan !== null;

          return (
            <Card
              key={`card-${card.partner.name}`}
              className="group h-full gap-0 overflow-hidden py-0 transition-all hover:border-primary/40 hover:shadow-md"
            >
              {matched ? (
                <Link
                  href={href}
                  className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  aria-label={`${card.partner.name} — ${kindLabel}${premium ? " (premium partner)" : ""}`}
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-muted">
                    {card.image ? (
                      // zunanje URL-je iz baze strežemo prek <img> (vzorec ostalih kartic)
                      <img
                        src={card.image}
                        alt={card.partner.name}
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <FallbackIcon
                          className="size-8 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </div>
                    )}
                    {premium ? (
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/95 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 shadow-sm dark:text-emerald-300">
                        <Star
                          className="size-3 fill-emerald-500 text-emerald-500"
                          aria-hidden="true"
                        />
                        Premium
                      </span>
                    ) : null}
                    {card.sponsoredActive ? (
                      <span className="absolute right-2 top-2 rounded-full bg-background/95 px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">
                        Sponzorirano
                      </span>
                    ) : null}
                  </div>
                </Link>
              ) : null}

              <CardContent className="flex h-full flex-col gap-1.5 p-3.5">
                <Badge variant="secondary" className="w-fit text-[11px]">
                  {kindLabel}
                  {categoryLabel ? ` · ${categoryLabel}` : ""}
                </Badge>
                <h3 className="line-clamp-2 text-sm font-semibold leading-snug">
                  {card.partner.name}
                </h3>
                {card.partner.destinationName ? (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3 shrink-0" aria-hidden="true" />
                    {card.partner.destinationName}
                  </p>
                ) : null}

                {card.eventDateLabel ? (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays
                      className="size-3 shrink-0"
                      aria-hidden="true"
                    />
                    {card.eventDateLabel}
                  </p>
                ) : null}

                {card.rating != null || card.durationHours != null ? (
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {card.rating != null ? (
                      <span className="flex items-center gap-1 font-medium">
                        <Star
                          className="size-3 fill-amber-400 text-amber-400"
                          aria-hidden="true"
                        />
                        {card.rating.toFixed(1)}
                        {card.reviewCount != null ? (
                          <span className="font-normal">
                            ({card.reviewCount}{" "}
                            {card.reviewCount === 1 ? "mnenje" : "mnenj"})
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    {card.durationHours != null ? (
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" aria-hidden="true" />
                        {card.durationHours} h
                      </span>
                    ) : null}
                  </p>
                ) : null}

                <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
                  {card.priceLabel ? (
                    <span className="text-sm font-bold text-primary">
                      {card.priceLabel}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground" />
                  )}
                  <Button
                    asChild
                    size="sm"
                    variant={isExperience ? "default" : "outline"}
                    className="h-8 shrink-0 gap-1 px-3 text-xs"
                  >
                    <Link href={href}>
                      {isExperience ? "Rezerviraj" : "Poglej"}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Oznaka ★ označuje premium partnerje — med enakovrednimi možnostmi
        imajo rahlo prednost; sponzorirani so jasno označeni. Vsa
        priporočila so realni, ocenjeni lokali in izkušnje iz naše baze.
      </p>
    </div>
  );
}
