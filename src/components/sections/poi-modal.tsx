"use client";

import { useEffect, useState } from "react";
import {
  MapPin,
  ExternalLink,
  Phone,
  Globe,
  Clock,
  Loader2,
  AlertCircle,
  Navigation,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// === Lokalni tip Poi (po API specifikaciji) ===
interface Poi {
  id: string;
  osmId: number;
  name: string;
  category: string;
  subcategory: string;
  lat: number;
  lng: number;
  description?: string;
  website?: string;
  phone?: string;
  openingHours?: string;
  cuisine?: string;
  wikidata?: string;
  wikipedia?: string;
  image?: string;
  address?: string;
}

// === Meta podatki o kategorijah (ikona, barva, slovenski naziv) ===
// Dovoljene izjeme od "NO indigo/blue" pravila — semantične barve kategorij.
export const CATEGORY_META: Record<
  string,
  { icon: string; color: string; label: string }
> = {
  attraction: { icon: "🎯", color: "#d97706", label: "Atrakcija" },
  museum: { icon: "🏛️", color: "#7c3aed", label: "Muzej" },
  restaurant: { icon: "🍽️", color: "#dc2626", label: "Restavracija" },
  hotel: { icon: "🏨", color: "#0891b2", label: "Nastanitev" },
  viewpoint: { icon: "👁️", color: "#059669", label: "Razgledišče" },
  natural: { icon: "🌿", color: "#16a34a", label: "Narava" },
  religious: { icon: "⛪", color: "#9333ea", label: "Religiozno" },
  shop: { icon: "🛍️", color: "#ea580c", label: "Trgovina" },
  other: { icon: "📍", color: "#6b7280", label: "Drugo" },
};

function getCategoryMeta(category: string) {
  return CATEGORY_META[category] ?? CATEGORY_META.other;
}

// === Odgovor /api/pois/[id] ===
interface PoiDetailResponse {
  wikipedia: {
    extract: string | null;
    image: string | null;
    url: string | null;
  };
  source: string;
}

interface PoiModalProps {
  poi: Poi | null;
  onClose: () => void;
}

/**
 * PoiModal — dialog s podrobnostmi POI-ja.
 * Pridobi Wikipedia opis preko /api/pois/[id].
 * Source: OpenStreetMap + Wikipedia.
 */
export function PoiModal({ poi, onClose }: PoiModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wikiExtract, setWikiExtract] = useState<string | null>(null);
  const [wikiImage, setWikiImage] = useState<string | null>(null);
  const [wikiUrl, setWikiUrl] = useState<string | null>(null);
  const [aiDescription, setAiDescription] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSource, setAiSource] = useState<"ai" | "fallback" | "cache">("ai");

  // Reset + fetch ko se poi spremeni
  useEffect(() => {
    if (!poi) {
      setWikiExtract(null);
      setWikiImage(null);
      setWikiUrl(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      setWikiExtract(null);
      setWikiImage(null);
      setWikiUrl(null);

      try {
        const params = new URLSearchParams({
          osmId: String(poi.osmId),
          type: "node",
        });
        if (poi.wikidata) params.set("wikidata", poi.wikidata);
        if (poi.wikipedia) params.set("wikipedia", poi.wikipedia);

        const res = await fetch(`/api/pois/${encodeURIComponent(poi.id)}?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data: PoiDetailResponse = await res.json();
        if (cancelled) return;
        setWikiExtract(data.wikipedia?.extract ?? null);
        setWikiImage(data.wikipedia?.image ?? null);
        setWikiUrl(data.wikipedia?.url ?? null);

        // Če Wikipedia nima opisa, pridobi AI opis (z cache-om)
        if (!data.wikipedia?.extract) {
          fetchAiDescription();
        } else {
          setAiDescription(null);
        }
      } catch (e) {
        if (cancelled) return;
        console.error("[poi-modal] napaka:", e);
        setError("Podatki trenutno niso na voljo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // Fetch AI description for POI (z enkratnim cache-iranjem)
    const fetchAiDescription = async () => {
      if (!poi) return;
      setAiLoading(true);
      try {
        const res = await fetch("/api/pois/describe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: poi.id,
            name: poi.name,
            category: poi.category,
            subcategory: poi.subcategory,
            lat: poi.lat,
            lng: poi.lng,
            address: poi.address,
          }),
        });
        if (!res.ok) throw new Error("Napaka");
        const data = await res.json();
        if (cancelled) return;
        setAiDescription(data.description);
        setAiSource(data.source);
      } catch {
        // Tiho ignoriraj — AI opis je "nice to have"
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    };

    void fetchDetail();
    return () => {
      cancelled = true;
    };
  }, [poi]);

  const meta = poi ? getCategoryMeta(poi.category) : null;
  // Slika: prioriteta poi.image, nato Wikipedia thumbnail
  const headerImage = poi?.image ?? wikiImage ?? null;
  // Wikipedia link: prioriteta URL iz API-ja, fallback direktno iz poi.wikipedia taga
  const wikiLink = wikiUrl ?? buildWikiLinkFromTag(poi?.wikipedia);

  return (
    <Dialog
      open={poi !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {poi && meta ? (
        <DialogContent
          showCloseButton
          className="max-w-2xl gap-0 overflow-hidden p-0 sm:max-w-2xl"
          aria-describedby="poi-modal-desc"
        >
          <DialogTitle className="sr-only">{poi.name}</DialogTitle>
          <DialogDescription id="poi-modal-desc" className="sr-only">
            Podrobnosti točke interesa {poi.name}: kategorija, opis iz Wikipedije,
            kontaktne informacije in koordinate. Vir podatkov: OpenStreetMap.
          </DialogDescription>

          {/* Scrollable container */}
          <div className="scroll-area-custom max-h-[80vh] overflow-y-auto">
            {/* Header slika ali placeholder z ikono */}
            <div className="relative aspect-video w-full overflow-hidden bg-muted">
              {headerImage ? (
                <img
                  src={headerImage}
                  alt={poi.name}
                  className="size-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    // Skrij pokvarjeno sliko → pokaži placeholder
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : null}
              {!headerImage ? (
                <div
                  className="flex size-full items-center justify-center text-6xl"
                  style={{ backgroundColor: `${meta.color}1a` }}
                  aria-hidden="true"
                >
                  <span>{meta.icon}</span>
                </div>
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                <Badge
                  className="mb-2 text-white"
                  style={{ backgroundColor: meta.color }}
                >
                  <span aria-hidden="true" className="mr-1">
                    {meta.icon}
                  </span>
                  {meta.label}
                </Badge>
                <h2 className="text-2xl font-bold sm:text-3xl">{poi.name}</h2>
                <p className="text-xs capitalize text-white/80">
                  {poi.subcategory.replace(/_/g, " ")}
                </p>
              </div>
            </div>

            {/* Vsebina */}
            <div className="space-y-5 p-5 sm:p-6">
              {/* Naslov */}
              {poi.address ? (
                <div className="flex items-start gap-2 text-sm text-foreground/90">
                  <MapPin
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span>{poi.address}</span>
                </div>
              ) : null}

              {/* Lastni opis iz OSM (če obstaja) */}
              {poi.description ? (
                <p className="text-sm leading-relaxed text-foreground/90">
                  {poi.description}
                </p>
              ) : null}

              {/* Wikipedia opis */}
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              ) : error ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              ) : wikiExtract ? (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    O objektu
                  </h3>
                  <p className="text-sm leading-relaxed text-foreground/90">
                    {wikiExtract}
                  </p>
                  {wikiLink ? (
                    <a
                      href={wikiLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80"
                    >
                      Preberi več na Wikipediji
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  ) : null}
                </section>
              ) : null}

              {/* AI opis (samo če Wikipedia nima opisa) */}
              {!loading && !wikiExtract && (aiLoading || aiDescription) && (
                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
                    AI opis
                    {aiSource === "ai" || aiSource === "cache" ? (
                      <Badge variant="secondary" className="gap-1 text-[9px]">
                        <Sparkles className="size-2.5" aria-hidden="true" />
                        AI
                      </Badge>
                    ) : null}
                  </h3>
                  {aiLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      AI generira opis...
                    </div>
                  ) : aiDescription ? (
                    <p className="text-sm leading-relaxed text-foreground/90">
                      {aiDescription}
                    </p>
                  ) : null}
                </section>
              )}

              {/* Kontakt info */}
              {(poi.phone || poi.website || poi.openingHours || poi.cuisine) && (
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">
                    Kontakt in informacije
                  </h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {poi.phone ? (
                      <ContactItem
                        icon={Phone}
                        label="Telefon"
                        value={poi.phone}
                        href={`tel:${poi.phone.replace(/\s+/g, "")}`}
                      />
                    ) : null}
                    {poi.website ? (
                      <ContactItem
                        icon={Globe}
                        label="Spletna stran"
                        value={prettyUrl(poi.website)}
                        href={poi.website}
                        external
                      />
                    ) : null}
                    {poi.openingHours ? (
                      <ContactItem
                        icon={Clock}
                        label="Odprtje"
                        value={poi.openingHours}
                      />
                    ) : null}
                    {poi.cuisine ? (
                      <ContactItem
                        icon={MapPin}
                        label="Kuhinja"
                        value={poi.cuisine}
                      />
                    ) : null}
                  </div>
                </section>
              )}

              {/* Koordinate */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Navigation className="size-3" aria-hidden="true" />
                <span className="tabular-nums">
                  {poi.lat.toFixed(5)}, {poi.lng.toFixed(5)}
                </span>
              </div>

              {/* Source attribution */}
              <div className="border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  Podatki:{" "}
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${poi.lat}&mlon=${poi.lng}#map=16/${poi.lat}/${poi.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary hover:text-primary/80"
                  >
                    OpenStreetMap
                  </a>
                  {wikiLink ? (
                    <>
                      {" "}
                      · opis:{" "}
                      <a
                        href={wikiLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary hover:text-primary/80"
                      >
                        Wikipedia
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/**
 * ContactItem — vrstica s kontaktno informacijo (ikona + labela + vrednost).
 * Lahko je povezava (tel:, https://).
 */
function ContactItem({
  icon: Icon,
  label,
  value,
  href,
  external,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  href?: string;
  external?: boolean;
}) {
  const content = (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-background p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 break-words text-sm font-medium text-foreground">
          {value}
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="block transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
      >
        {content}
      </a>
    );
  }
  return content;
}

/** Prettify URL: odstrani protocol in trailing slash za prikaz. */
function prettyUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** Pretvori OSM wikipedia tag ("sl:Naslov") v poln URL. */
function buildWikiLinkFromTag(tag?: string): string | null {
  if (!tag) return null;
  const [lang, title] = tag.split(":", 2);
  if (!lang || !title) return null;
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
}

export default PoiModal;
