"use client";

import { useState } from "react";
import {
  Star,
  MapPin,
  Clock,
  Phone,
  Mail,
  Globe,
  ExternalLink,
  CheckCircle2,
  Eye,
  MousePointerClick,
  Building2,
  Tag,
  Compass,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PartnerBadge, type PartnerStatus } from "@/components/partner-badge";
import {
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  PLAN_LABELS,
  type Listing,
} from "@/lib/listings-types";

interface ListingModalProps {
  listing: Listing | null;
  onClose: () => void;
}

/**
 * ListingModal — podrobnosti lokala (B2B listing).
 * Prikazuje galerijo slik, opis, kontakt, statistiko in CTA.
 * Povezava z destinacijo (link #destinacije) zapre modal in scrolla na sekcijo.
 */
export function ListingModal({ listing, onClose }: ListingModalProps) {
  const [activeImage, setActiveImage] = useState(0);

  // Reset aktivne slike ko se odpre nov listing
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
      setActiveImage(0);
    }
  };

  return (
    <Dialog open={listing !== null} onOpenChange={handleOpenChange}>
      {listing ? (
        <DialogContent
          showCloseButton
          className="max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl"
          aria-describedby="listing-modal-desc"
        >
          <DialogTitle className="sr-only">{listing.name}</DialogTitle>
          <DialogDescription id="listing-modal-desc" className="sr-only">
            Podrobnosti lokala {listing.name}: opis, kontakt, odpiralni čas,
            ocene in povezava do spletne strani.
          </DialogDescription>

          <div className="scroll-area-custom max-h-[80vh] overflow-y-auto">
            {/* Galerija slik */}
            <div className="relative aspect-video w-full overflow-hidden bg-muted">
              {listing.images.length > 0 ? (
                <img
                  src={listing.images[activeImage]}
                  alt={`${listing.name} — slika ${activeImage + 1}`}
                  className="size-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-4xl">
                  <span aria-hidden="true">
                    {CATEGORY_ICONS[listing.category]}
                  </span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

              {/* Badge kategorije (top-left) */}
              <Badge className="absolute left-4 top-4 bg-primary text-primary-foreground shadow-sm">
                <span aria-hidden="true">{CATEGORY_ICONS[listing.category]}</span>
                {CATEGORY_LABELS[listing.category]}
              </Badge>

              {/* Partner badge (top-right) — samo ena glavna oznaka */}
              {listing.partnerStatus && listing.partnerStatus !== "standard" && (
                <div className="absolute right-4 top-4 z-10">
                  <PartnerBadge
                    status={listing.partnerStatus as PartnerStatus}
                    size="md"
                  />
                </div>
              )}

              {/* Ime (bottom) */}
              <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold sm:text-3xl">
                    {listing.name}
                  </h2>
                </div>
                {listing.destinationName ? (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-white/90">
                    <MapPin className="size-3.5" aria-hidden="true" />
                    {listing.destinationName}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Thumbnail strip (če več slik) */}
            {listing.images.length > 1 ? (
              <div className="flex gap-2 overflow-x-auto border-b border-border/60 bg-muted/30 p-3">
                {listing.images.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImage(idx)}
                    aria-label={`Prikaži sliko ${idx + 1}`}
                    aria-pressed={idx === activeImage}
                    className={`relative size-16 shrink-0 overflow-hidden rounded-md border-2 transition-all ${
                      idx === activeImage
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={img}
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            ) : null}

            {/* Vsebina */}
            <div className="space-y-6 p-5 sm:p-6">
              {/* Rating + priceRange */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Star
                    className="size-4 fill-amber-400 text-amber-400"
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold tabular-nums">
                    {listing.rating.toFixed(1)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({listing.reviewCount} mnenj)
                  </span>
                </div>
                {listing.priceRange ? (
                  <Badge variant="secondary" className="font-medium">
                    {listing.priceRange}
                  </Badge>
                ) : null}
              </div>

              {/* Kratek opis */}
              <p className="text-sm leading-relaxed text-foreground/90">
                {listing.description}
              </p>

              {/* Long description */}
              {listing.longDescription ? (
                <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                  <p className="text-sm leading-relaxed text-foreground/80">
                    {listing.longDescription}
                  </p>
                </div>
              ) : null}

              {/* Grid 2x2 info */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                <InfoItem
                  icon={Building2}
                  label="Kategorija"
                  value={CATEGORY_LABELS[listing.category]}
                />
                <InfoItem
                  icon={MapPin}
                  label="Lokacija"
                  value={listing.destinationName ?? "—"}
                />
                <InfoItem
                  icon={Compass}
                  label="Naslov"
                  value={listing.address}
                />
                <InfoItem
                  icon={Clock}
                  label="Odpiralni čas"
                  value={listing.openingHours ?? "—"}
                />
              </div>

              {/* Specialties */}
              {listing.specialties.length > 0 ? (
                <section>
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Tag className="size-4 text-primary" aria-hidden="true" />
                    Specialnosti
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {listing.specialties.map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* Kontakt */}
              {(listing.phone || listing.email || listing.website) && (
                <section>
                  <h3 className="text-sm font-semibold">Kontakt</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {listing.phone ? (
                      <a
                        href={`tel:${listing.phone.replace(/\s/g, "")}`}
                        className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <Phone className="size-4 text-primary" aria-hidden="true" />
                        {listing.phone}
                      </a>
                    ) : null}
                    {listing.email ? (
                      <a
                        href={`mailto:${listing.email}`}
                        className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <Mail className="size-4 text-primary" aria-hidden="true" />
                        {listing.email}
                      </a>
                    ) : null}
                    {listing.website ? (
                      <a
                        href={listing.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        <Globe
                          className="size-4 text-primary"
                          aria-hidden="true"
                        />
                        Spletna stran
                      </a>
                    ) : null}
                  </div>
                </section>
              )}

              {/* Statistika */}
              <section className="grid grid-cols-2 gap-3">
                <StatCard
                  icon={Eye}
                  label="Ogledov"
                  value={listing.viewCount.toLocaleString("sl-SI")}
                />
                <StatCard
                  icon={MousePointerClick}
                  label="Klikov"
                  value={listing.clickCount.toLocaleString("sl-SI")}
                />
              </section>

              {/* CTA: spletna stran (glavni) */}
              {listing.website ? (
                <Button
                  type="button"
                  asChild
                  size="lg"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <a
                    href={listing.website}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Globe className="size-4" aria-hidden="true" />
                    Obišči spletno stran
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </a>
                </Button>
              ) : null}

              {/* Povezana destinacija */}
              {listing.destinationId ? (
                <a
                  href="#destinacije"
                  onClick={() => onClose()}
                  className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  <MapPin className="size-3.5" aria-hidden="true" />
                  Poglej destinacijo {listing.destinationName ?? ""}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/* Pomožne komponente */

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <Card className="gap-0 py-3">
      <CardContent className="px-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-3.5" aria-hidden="true" />
          <span className="text-[11px] uppercase tracking-wide">{label}</span>
        </div>
        <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-sm font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

export default ListingModal;
