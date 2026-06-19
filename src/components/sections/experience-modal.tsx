"use client";

import { useRef, useState } from "react";
import {
  Star,
  MapPin,
  Clock,
  Users,
  Phone,
  Mail,
  Globe,
  ExternalLink,
  CheckCircle2,
  Eye,
  Calendar,
  Baby,
  Accessibility,
  Sparkles,
  Compass,
  Languages,
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
import {
  EXPERIENCE_CATEGORY_LABELS,
  EXPERIENCE_CATEGORY_ICONS,
  LANGUAGE_LABELS,
  formatPrice,
  formatDuration,
  type Experience,
} from "@/lib/marketplace-types";

interface ExperienceModalProps {
  experience: Experience | null;
  onClose: () => void;
  onBook?: (experience: Experience) => void;
}

/**
 * ExperienceModal — podrobnosti izkušnje iz tržnice.
 * Prikazuje sliko, opis, trajanje, skupino, jezike, kontakt ponudnika in CTA.
 * "Rezerviraj" gumb odpre BookingModal (delegirano na starša prek onBook).
 */
export function ExperienceModal({
  experience,
  onClose,
  onBook,
}: ExperienceModalProps) {
  const [activeImage, setActiveImage] = useState(0);

  // Reset aktivne slike ko se spremeni izkušnja (render-phase check, brez effect-a)
  const prevExpId = useRef<string | undefined>(undefined);
  if (prevExpId.current !== experience?.id) {
    prevExpId.current = experience?.id;
    if (activeImage !== 0) {
      setActiveImage(0);
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  if (!experience) {
    return (
      <Dialog open={false} onOpenChange={handleOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  const image =
    experience.images[activeImage] ?? experience.images[0];

  // Pretvori jezikovne kode v slovenska imena
  const languagesDisplay = experience.languages
    .map((l) => LANGUAGE_LABELS[l] ?? l.toUpperCase())
    .join(", ");

  return (
    <Dialog open={experience !== null} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton
        className="max-h-[90vh] max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl"
        aria-describedby="experience-modal-desc"
      >
        <DialogTitle className="sr-only">{experience.name}</DialogTitle>
        <DialogDescription id="experience-modal-desc" className="sr-only">
          Podrobnosti izkušnje {experience.name}: opis, cena, trajanje, skupina,
          kontakt ponudnika in možnost rezervacije.
        </DialogDescription>

        <div className="scroll-area-custom max-h-[88vh] overflow-y-auto">
          {/* Velika slika */}
          <div className="relative aspect-video w-full overflow-hidden bg-muted">
            {image ? (
              <img
                src={image}
                alt={`${experience.name} — slika ${activeImage + 1}`}
                className="size-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-5xl">
                <span aria-hidden="true">
                  {EXPERIENCE_CATEGORY_ICONS[experience.category]}
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

            {/* Badge kategorije */}
            <Badge className="absolute left-4 top-4 bg-primary text-primary-foreground shadow-sm">
              <span aria-hidden="true">
                {EXPERIENCE_CATEGORY_ICONS[experience.category]}
              </span>
              {EXPERIENCE_CATEGORY_LABELS[experience.category]}
            </Badge>

            {/* Featured badge */}
            {experience.featured ? (
              <Badge className="absolute right-4 top-4 bg-amber-400 text-amber-950 shadow-sm">
                <Sparkles className="size-3" aria-hidden="true" />
                Izpostavljeno
              </Badge>
            ) : null}

            {/* Trajanje badge */}
            <Badge className="absolute bottom-4 right-4 bg-background/90 text-foreground backdrop-blur-sm">
              <Clock className="size-3" aria-hidden="true" />
              {formatDuration(experience.durationHours)}
            </Badge>

            {/* Ime + lokacija */}
            <div className="absolute bottom-0 left-0 p-5 text-white">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold sm:text-3xl">
                  {experience.name}
                </h2>
                {experience.verified ? (
                  <CheckCircle2
                    className="size-5 text-primary"
                    aria-label="Overjena izkušnja"
                  />
                ) : null}
              </div>
              {experience.destinationName ? (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-white/90">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {experience.destinationName}
                </p>
              ) : null}
            </div>
          </div>

          {/* Thumbnail strip (če več slik) */}
          {experience.images.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto border-b border-border/60 bg-muted/30 p-3">
              {experience.images.map((img, idx) => (
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
            {/* Rating + cena */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <Star
                  className="size-4 fill-amber-400 text-amber-400"
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold tabular-nums">
                  {experience.rating.toFixed(1)}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({experience.reviewCount} mnenj)
                </span>
              </div>

              <div className="text-right">
                <div className="text-xs text-muted-foreground">od</div>
                <div className="text-2xl font-bold text-foreground">
                  {formatPrice(
                    experience.pricePerPerson,
                    experience.currency
                  )}
                </div>
                <div className="text-xs text-muted-foreground">/ osebo</div>
              </div>
            </div>

            {/* Kratek opis */}
            <p className="text-sm leading-relaxed text-foreground/90">
              {experience.description}
            </p>

            {/* Long description */}
            {experience.longDescription ? (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                <p className="text-sm leading-relaxed text-foreground/80">
                  {experience.longDescription}
                </p>
              </div>
            ) : null}

            {/* Grid 2x2 info */}
            <div className="grid grid-cols-2 gap-3">
              <InfoItem
                icon={Clock}
                label="Trajanje"
                value={formatDuration(experience.durationHours)}
              />
              <InfoItem
                icon={Users}
                label="Skupina"
                value={`${experience.minGroupSize}–${experience.maxGroupSize} oseb`}
              />
              <InfoItem
                icon={Languages}
                label="Jeziki"
                value={languagesDisplay || "—"}
              />
              <InfoItem
                icon={MapPin}
                label="Lokacija"
                value={experience.destinationName ?? "—"}
              />
            </div>

            {/* Meeting point */}
            {experience.meetingPoint ? (
              <section>
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Compass className="size-4 text-primary" aria-hidden="true" />
                  Točka srečanja
                </h3>
                <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-4">
                  <p className="flex items-start gap-2 text-sm text-foreground/80">
                    <MapPin
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span>{experience.meetingPoint}</span>
                  </p>
                  {experience.address ? (
                    <p className="mt-2 pl-6 text-xs text-muted-foreground">
                      {experience.address}
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}

            {/* Atributi */}
            <section>
              <h3 className="text-sm font-semibold">Atributi</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {experience.familyFriendly ? (
                  <Badge className="bg-primary text-primary-foreground">
                    <Baby className="size-3" aria-hidden="true" />
                    Družinsko prijazno
                  </Badge>
                ) : null}
                {experience.accessibility ? (
                  <Badge variant="secondary">
                    <Accessibility
                      className="size-3"
                      aria-hidden="true"
                    />
                    Dostopno za invalide
                  </Badge>
                ) : null}
                {experience.featured ? (
                  <Badge className="bg-amber-400 text-amber-950">
                    <Sparkles className="size-3" aria-hidden="true" />
                    Izpostavljeno
                  </Badge>
                ) : null}
              </div>
            </section>

            {/* Kontakt ponudnika */}
            <section>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Users className="size-4 text-primary" aria-hidden="true" />
                Ponudnik
              </h3>
              <div className="mt-3 space-y-2">
                <p className="text-sm font-medium">{experience.providerName}</p>
                <div className="flex flex-wrap gap-2">
                  {experience.providerPhone ? (
                    <a
                      href={`tel:${experience.providerPhone.replace(/\s/g, "")}`}
                      className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Phone className="size-4 text-primary" aria-hidden="true" />
                      {experience.providerPhone}
                    </a>
                  ) : null}
                  {experience.providerEmail ? (
                    <a
                      href={`mailto:${experience.providerEmail}`}
                      className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Mail className="size-4 text-primary" aria-hidden="true" />
                      {experience.providerEmail}
                    </a>
                  ) : null}
                  {experience.providerWebsite ? (
                    <a
                      href={experience.providerWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Globe className="size-4 text-primary" aria-hidden="true" />
                      Spletna stran
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </div>
            </section>

            {/* Statistika */}
            <section className="grid grid-cols-2 gap-3">
              <StatCard
                icon={Eye}
                label="Ogledov"
                value={experience.viewCount.toLocaleString("sl-SI")}
              />
              <StatCard
                icon={Calendar}
                label="Rezervacij"
                value={experience.bookingCount.toLocaleString("sl-SI")}
              />
            </section>

            {/* CTA */}
            <div className="space-y-2">
              <Button
                type="button"
                size="lg"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => onBook?.(experience)}
              >
                <Calendar className="size-4" aria-hidden="true" />
                Rezerviraj
              </Button>
              {experience.providerWebsite ? (
                <Button
                  type="button"
                  asChild
                  variant="outline"
                  size="lg"
                  className="w-full"
                >
                  <a
                    href={experience.providerWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Globe className="size-4" aria-hidden="true" />
                    Spletna stran
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </a>
                </Button>
              ) : null}
            </div>

            {/* Source note */}
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Compass className="size-3" aria-hidden="true" />
              Vir: Lokalni ponudnik
            </p>
          </div>
        </div>
      </DialogContent>
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

export default ExperienceModal;
