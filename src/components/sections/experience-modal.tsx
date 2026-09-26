"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useLocale, useTranslations } from "next-intl";
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
  Lightbulb,
  Loader2,
  AlertCircle,
  User,
  Send,
  RotateCcw,
  Info,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { safeExternalHref } from "@/lib/external-url";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { trackFunnel } from "@/lib/funnel";
import { hasConsultationRef, clearConsultationRef } from "@/lib/consultation-ref";
import { ReviewSection } from "@/components/review-section";
import { ImageLightbox } from "@/components/image-lightbox";
import { WishlistHeartButton } from "@/components/wishlist-sheet";
// TASK 8 / D8-D (§3.3): kanonski "Dodaj v mojo pot" v modalu doživetja (D8-A §9.8)
import { AddToTripButton } from "@/components/add-to-trip-button";
import { addBooking } from "@/lib/my-orders-storage";
import {
  EXPERIENCE_CATEGORY_LABELS,
  EXPERIENCE_CATEGORY_LABELS_EN,
  EXPERIENCE_CATEGORY_ICONS,
  LANGUAGE_LABELS,
  formatPrice,
  formatDuration,
  type Experience,
} from "@/lib/marketplace-types";

interface ExperienceModalProps {
  experience: Experience | null;
  onClose: () => void;
  /** Opcijsko: zamenja trenutno izkušnjo (uporablja "Morda vam je všeč"). */
  onSelect?: (experience: Experience) => void;
}

/**
 * §20 (1.97.0): priporočilo z razložljivo why vrstico — ne črn ranking.
 * `whySource: "deterministic"` pomeni, da vrstico je koda sestavila iz
 * podatkov izkušnje (UI pokaže "(iz podatkov)"). ISSUE #9 (ZERO-AI):
 * NOVE vrstice so VEDNO "deterministic" — "ai" ostaja samo za branje
 * legacy cache zapisov (TTL 24 h).
 */
interface RecommendedExperience extends Experience {
  why?: string;
  whySource?: "ai" | "deterministic";
}

interface RecommendationsResponse {
  experiences: RecommendedExperience[];
  total: number;
  source?: "deterministic" | "fallback" | "cache" | "ai";
}

// TASK 8 / F4-B (issue #8 Faza 4 — EN razširitev booking sklada): L-pattern
// slovar (SL+EN) za VES UI chrome modala + rezervacijski obrazec — toasti,
// oznake, spec nalepke, arija, validacije, statusi razpoložljivosti, CTA.
// RESNICA (§38, najvišja stava tukaj): "od" ↔ "from" od-cena, "zaseden" ↔
// "sold out" (kapaciteta dneva), statusi rezervacije ("Potrjena" ↔
// "Confirmed") — prevedeno z EXAKTNO ohranitvijo pomena. ZERO-LOSS: samo
// nizi, nobena logika/vedenje/API se ne spreminja.
const L = {
  a11y: {
    dialogDesc: {
      sl: (name: string) =>
        `Podrobnosti izkušnje ${name}: opis, cena, trajanje, skupina, kontakt ponudnika in možnost rezervacije.`,
      en: (name: string) =>
        `Experience details for ${name}: description, price, duration, group, provider contact and booking option.`,
    },
    verified: { sl: "Overjena izkušnja", en: "Verified experience" },
    openGallery: {
      sl: (n: number) => `Odpri galerijo slik (${n})`,
      en: (n: number) => `Open the image gallery (${n})`,
    },
    showImage: {
      sl: (n: number) => `Prikaži sliko ${n}`,
      en: (n: number) => `Show image ${n}`,
    },
    imageAlt: {
      sl: (name: string, n: number) => `${name} — slika ${n}`,
      en: (name: string, n: number) => `${name} — image ${n}`,
    },
    openExperience: {
      sl: (name: string) => `Odpri ${name}`,
      en: (name: string) => `Open ${name}`,
    },
    bookingSection: { sl: "Rezervacija izkušnje", en: "Book this experience" },
    bookingConfirmed: { sl: "Rezervacija potrjena", en: "Booking confirmed" },
    decreaseGroup: { sl: "Zmanjšaj število oseb", en: "Decrease group size" },
    increaseGroup: { sl: "Povečaj število oseb", en: "Increase group size" },
  },
  badge: {
    featured: { sl: "Izpostavljeno", en: "Featured" },
    familyFriendly: { sl: "Družinsko prijazno", en: "Family friendly" },
    accessible: { sl: "Dostopno za invalide", en: "Wheelchair accessible" },
  },
  reviews: { sl: "mnenj", en: "reviews" },
  price: {
    from: { sl: "od", en: "from" },
    perPerson: { sl: "/ osebo", en: "per person" },
  },
  info: {
    duration: { sl: "Trajanje", en: "Duration" },
    group: { sl: "Skupina", en: "Group" },
    groupValue: {
      sl: (min: number, max: number) => `${min}–${max} oseb`,
      en: (min: number, max: number) => `${min}–${max} people`,
    },
    languages: { sl: "Jeziki", en: "Languages" },
    location: { sl: "Lokacija", en: "Location" },
  },
  meeting: {
    heading: { sl: "Točka srečanja", en: "Meeting point" },
    showOnMap: { sl: "Prikaži na zemljevidu", en: "Show on map" },
  },
  attributes: { sl: "Atributi", en: "Attributes" },
  provider: {
    heading: { sl: "Ponudnik", en: "Provider" },
    website: { sl: "Spletna stran", en: "Website" },
    statsViews: { sl: "Ogledov", en: "Views" },
    statsBookings: { sl: "Rezervacij", en: "Bookings" },
  },
  source: { sl: "Vir: Lokalni ponudnik", en: "Source: Local provider" },
  booking: {
    bookCta: { sl: "Rezerviraj termin", en: "Book a date" },
    atProvider: { sl: "Pri ponudniku", en: "At the provider" },
    noWebsite: {
      sl: "Ponudnik nima spletne strani",
      en: "The provider has no website",
    },
    successTitle: { sl: "Rezervacija potrjena!", en: "Booking confirmed!" },
    successNote: {
      sl: "Številko rezervacije shranite — vam bo v pomoč pri komunikaciji s ponudnikom.",
      en: "Save your booking number — it helps when communicating with the provider.",
    },
    numberLabel: { sl: "Številka rezervacije", en: "Booking number" },
    totalLabel: { sl: "Skupaj", en: "Total" },
    dateLabel: { sl: "Datum", en: "Date" },
    meetingLabel: { sl: "Srečanje", en: "Meeting" },
    providerLabel: { sl: "Ponudnik", en: "Provider" },
    statusLabel: { sl: "Status", en: "Status" },
    statusConfirmed: { sl: "Potrjena", en: "Confirmed" },
    newBooking: { sl: "Nova rezervacija", en: "New booking" },
    formHeading: { sl: "Podatki za rezervacijo", en: "Booking details" },
    cancel: { sl: "Prekliči", en: "Cancel" },
    form: {
      date: { sl: "Datum", en: "Date" },
      groupSize: { sl: "Število oseb", en: "Group size" },
      name: { sl: "Ime in priimek", en: "Full name" },
      phone: { sl: "Telefon", en: "Phone" },
      email: { sl: "E-pošta", en: "Email" },
      notes: { sl: "Opombe (opcijsko)", en: "Notes (optional)" },
      phName: { sl: "Janez Novak", en: "John Smith" },
      phPhone: { sl: "+386 41 234 567", en: "+386 41 234 567" },
      phEmail: { sl: "ime@primer.si", en: "you@example.com" },
      phNotes: {
        sl: "Alergije, želje glede termina, jezik vodenja …",
        en: "Allergies, preferred time, tour language …",
      },
      groupHint: {
        sl: (min: number, max: number) => `${min}–${max} oseb`,
        en: (min: number, max: number) => `${min}–${max} people`,
      },
      sending: { sl: "Rezerviram…", en: "Booking…" },
      confirm: { sl: "Potrdi rezervacijo", en: "Confirm booking" },
      srSending: {
        sl: "Rezervacija se pošilja, prosimo počakajte.",
        en: "Sending your booking, please wait.",
      },
      demo: {
        sl: "Demo način: rezervacija se takoj potrdi, plačila se ne zaračuna. Ko dodamo prave Stripe ključe, se bo vklopilo spletno plačilo.",
        en: "Demo mode: the booking is confirmed instantly and no payment is charged. Once we add real Stripe keys, online payment will switch on.",
      },
      privacy: {
        sl: "Podatke uporabimo izključno za izvedbo rezervacije.",
        en: "Your details are used only to carry out this booking.",
      },
      people: {
        sl: (n: number) => `${n} ${n === 1 ? "oseba" : "oseb"}`,
        en: (n: number) => `${n} ${n === 1 ? "person" : "people"}`,
      },
    },
    errors: {
      dateRequired: {
        sl: "Izberite datum rezervacije.",
        en: "Choose a booking date.",
      },
      dateInvalid: {
        sl: "Neveljaven datum rezervacije.",
        en: "Invalid booking date.",
      },
      datePast: {
        sl: "Datum rezervacije mora biti danes ali pozneje.",
        en: "The booking date must be today or later.",
      },
      dateBlackout: {
        sl: "Ta datum je zaprt — ponudnik ne sprejema rezervacij.",
        en: "This date is closed — the provider is not taking bookings.",
      },
      dateOffSeason: {
        sl: "Ta datum je izven sezone ponudnika.",
        en: "This date is outside the provider's season.",
      },
      dateSoldOut: {
        sl: "Ta datum je zaseden — kapaciteta dneva je dosežena.",
        en: "This date is sold out — day capacity is reached.",
      },
      groupInvalid: {
        sl: "Vnesite veljavno število oseb.",
        en: "Enter a valid group size.",
      },
      groupRange: {
        sl: (min: number, max: number) => `Med ${min} in ${max} oseb.`,
        en: (min: number, max: number) => `Between ${min} and ${max} people.`,
      },
      groupRemaining: {
        sl: (n: number) => `Na ta datum je prostih le ${n} mest.`,
        en: (n: number) => `Only ${n} spots left on this date.`,
      },
      nameShort: {
        sl: "Vnesite ime in priimek (vsaj 2 znaka).",
        en: "Enter your full name (at least 2 characters).",
      },
      emailInvalid: {
        sl: "Vnesite veljaven e-poštni naslov.",
        en: "Enter a valid email address.",
      },
      phoneShort: {
        sl: "Vnesite telefonsko številko (vsaj 5 znakov).",
        en: "Enter a phone number (at least 5 characters).",
      },
      apiFailed: {
        sl: "Rezervacija ni uspela — poskusite znova.",
        en: "Booking failed — please try again.",
      },
    },
    avail: {
      blackout: {
        sl: "Zaprt dan (ponudnik ne sprejema rezervacij) — izberite drug datum.",
        en: "Closed day (the provider is not taking bookings) — pick another date.",
      },
      offSeason: {
        sl: "Izven sezone ponudnika — izberite datum znotraj sezone.",
        en: "Outside the provider's season — pick a date within the season.",
      },
      soldOut: {
        sl: "Zaseden dan — kapaciteta dneva je dosežena.",
        en: "Sold out — day capacity is reached.",
      },
      fewLeft: {
        sl: (n: number) => `Še ${n} prostih mest na ta dan.`,
        en: (n: number) => `Only ${n} spots left that day.`,
      },
      spotsLeft: {
        sl: (n: number) => `Prostih mest na ta dan: ${n}.`,
        en: (n: number) => `Spots left that day: ${n}.`,
      },
      timeNote: {
        sl: "Točen čas obiska dogovorite z izvajalcem po potrditvi.",
        en: "Arrange the exact visit time with the provider after confirmation.",
      },
      checking: {
        sl: "Preverjam razpoložljivost…",
        en: "Checking availability…",
      },
    },
  },
  recs: {
    title: { sl: "Morda vam je všeč", en: "You may also like" },
    similar: { sl: "Podobni", en: "Similar" },
    aiTitle: {
      sl: "AI (GLM) je izbral ta priporočila",
      en: "AI (GLM) picked these recommendations",
    },
    similarTitle: {
      sl: "Podobne izkušnje (fallback)",
      en: "Similar experiences (fallback)",
    },
  },
};

// F4-B: EN imena jezikov za prikaz v modalu — LANGUAGE_LABELS iz lib
// (marketplace-types) je SL-only skupna odvisnost, IZVEN lastništva te
// naloge (lib ostaja nedotaknjen); EN preslikava je lokalna ovijalka.
const LANGUAGE_LABELS_EN: Record<string, string> = {
  sl: "Slovenian",
  en: "English",
  de: "German",
  it: "Italian",
  hr: "Croatian",
  fr: "French",
  es: "Spanish",
  ru: "Russian",
  nl: "Dutch",
};

function languageLabel(code: string, lang: "sl" | "en"): string {
  if (lang === "en") return LANGUAGE_LABELS_EN[code] ?? code.toUpperCase();
  return LANGUAGE_LABELS[code] ?? code.toUpperCase();
}

// F4-B: formatDuration iz lib je SL-only ("dni"); min/h sta jezikovno
// nevtralna — EN obdelava lokalno (ista lib logika, ZERO-LOSS ovijalka).
function formatDurationL(hours: number, lang: "sl" | "en"): string {
  const s = formatDuration(hours);
  return lang === "en" ? s.replace(" dni", " days") : s;
}

/* =============================================================
 * Rezervacijski flow (POST /api/bookings)
 * ============================================================= */

type BookingPhase = "idle" | "form" | "sending" | "success";

interface BookingFormValues {
  date: string;
  groupSize: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
}

type BookingFieldErrors = Partial<
  Record<"date" | "groupSize" | "name" | "email" | "phone", string>
>;

interface BookingSuccessData {
  bookingNumber: string;
  total: number;
  currency: string;
  bookingDate: string;
  meetingPoint: string | null;
  providerName: string;
  providerEmail: string;
  status: string;
}

interface BookingResponse {
  success?: boolean;
  error?: string;
  bookingNumber?: string;
  total?: number;
  status?: string;
  bookingDate?: string;
  currency?: string;
  meetingPoint?: string | null;
  providerName?: string;
  providerEmail?: string;
}

/** TASK 33 (Tier 2 #1): dnevni pogled javnega koledarja razpoložljivosti
 *  (GET /api/experiences/[slug]/availability?month=). */
interface AvailDayView {
  date: string;
  past: boolean;
  available: boolean;
  reason: "blackout" | "out-of-season" | null;
  capacity: number | null;
  booked: number;
  remaining: number | null;
}

/** Lokalni datum kot "YYYY-MM-DD" (brez UTC zamika). */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" → lokalni Date ob polnoči (null, če neveljaven). */
function parseLocalDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO datum iz strežnika → dolgi zapis v jeziku uporabnika (brez UTC zamika dneva). */
function formatBookingDate(iso: string, lang: "sl" | "en"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "en" ? "en-GB" : "sl-SI", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * ExperienceModal — podrobnosti izkušnje iz tržnice.
 * Prikazuje sliko, opis, trajanje, skupino, jezike, kontakt ponudnika in CTA.
 * Primarni CTA "Rezerviraj termin" odpre rezervacijski obrazec, ki pošlje
 * PRAVO rezervacijo prek POST /api/bookings (demo mode → takoj potrjena).
 * "Pri ponudniku" je sekundarna povezava na ponudnikovo spletno stran.
 * Na dnu je "Morda vam je všeč" z 4 podobnimi izkušnjami.
 */
export function ExperienceModal({
  experience,
  onClose,
  onSelect,
}: ExperienceModalProps) {
  const [activeImage, setActiveImage] = useState(0);
  // FW2-B: celozaslonska galerija (lightbox) nad modalom
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Faza rezervacije (za skritje X gumba med pošiljanjem — kot checkout-modal)
  const [bookingPhase, setBookingPhase] = useState<BookingPhase>("idle");

  // Reset aktivne slike, lightboxa in rezervacije, ko se spremeni izkušnja
  // (render-phase check, brez effect-a)
  const prevExpId = useRef<string | undefined>(undefined);
  if (prevExpId.current !== experience?.id) {
    prevExpId.current = experience?.id;
    if (activeImage !== 0) {
      setActiveImage(0);
    }
    if (lightboxOpen) {
      setLightboxOpen(false);
    }
    if (bookingPhase !== "idle") {
      setBookingPhase("idle");
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  // Priporočila — pridobi ko se experience spremeni.
  // §20: pošljemo lang, da strežnik izbere jezikovno različico why
  // vrstice (cache hrani obe — prvi obiskovalec ne zaključi jezika).
  const locale = useLocale();
  // F4-B: jezik UI chroma (isti vir kot priporočila zgoraj).
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const [recommendations, setRecommendations] = useState<RecommendedExperience[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<boolean>(false);
  const [recSource, setRecSource] = useState<
    "deterministic" | "fallback" | "cache" | "ai"
  >("deterministic");

  const fetchRecommendations = useCallback(async (experienceId: string) => {
    setRecLoading(true);
    setRecError(false);
    try {
      const res = await fetch(
        `/api/recommendations/experiences?experienceId=${encodeURIComponent(
          experienceId
        )}&limit=4&lang=${locale === "en" ? "en" : "sl"}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Napaka pri priporočilih");
      const data: RecommendationsResponse = await res.json();
      setRecommendations(data.experiences ?? []);
      setRecSource(data.source ?? "deterministic");
    } catch {
      setRecError(true);
      setRecommendations([]);
    } finally {
      setRecLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    if (experience?.id) {
      fetchRecommendations(experience.id);
    } else {
      setRecommendations([]);
      setRecError(false);
    }
  }, [experience?.id, fetchRecommendations, experience]);

  if (!experience) {
    return (
      <Dialog open={false} onOpenChange={handleOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  const image =
    experience.images[activeImage] ?? experience.images[0];

  // Število veljavnih galerijskih slik (preskoči morebitne prazne vnose) —
  // ulovač klikov se izriše le, če lightbox dejansko ima kaj pokazati
  const galleryCount = experience.images.filter(
    (src) => src.trim().length > 0
  ).length;

  // Pretvori jezikovne kode v imena v jeziku uporabnika (SL iz lib, EN lokalno)
  const languagesDisplay = experience.languages
    .map((l) => languageLabel(l, lang))
    .join(", ");

  return (
    <Dialog open={experience !== null} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={bookingPhase !== "sending"}
        className="max-h-[90vh] max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl"
        aria-describedby="experience-modal-desc"
      >
        <DialogTitle className="sr-only">{experience.name}</DialogTitle>
        <DialogDescription id="experience-modal-desc" className="sr-only">
          {L.a11y.dialogDesc[lang](experience.name)}
        </DialogDescription>

        <div className="scroll-area-custom max-h-[88vh] overflow-y-auto">
          {/* Velika slika — klik odpre celozaslonsko galerijo (lightbox) */}
          <div className="relative aspect-video w-full overflow-hidden bg-muted">
            {image ? (
              <img
                src={image}
                alt={L.a11y.imageAlt[lang](experience.name, activeImage + 1)}
                className="size-full object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="flex size-full items-center justify-center text-5xl">
                <span aria-hidden="true">
                  {EXPERIENCE_CATEGORY_ICONS[experience.category]}
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

            {/* Badge kategorije + izpostavljeno (top-left) — top-right je rezerviran za srček (ob X gumbu) */}
            <div className="absolute left-4 top-4 flex flex-col items-start gap-2">
              <Badge className="bg-primary text-primary-foreground shadow-sm">
                <span aria-hidden="true">
                  {EXPERIENCE_CATEGORY_ICONS[experience.category]}
                </span>
                {lang === "en"
                  ? EXPERIENCE_CATEGORY_LABELS_EN[experience.category]
                  : EXPERIENCE_CATEGORY_LABELS[experience.category]}
              </Badge>
              {experience.featured ? (
                <Badge className="bg-amber-400 text-amber-950 shadow-sm">
                  <Sparkles className="size-3" aria-hidden="true" />
                  {L.badge.featured[lang]}
                </Badge>
              ) : null}
            </div>

            {/* Srček — shrani med priljubljene (ne odpre lightboxa) */}
            <WishlistHeartButton
              variant="modal"
              entry={{
                id: experience.id,
                type: "experience",
                name: experience.name,
                image: experience.images[0] ?? null,
                price: experience.pricePerPerson,
                destination: experience.destinationName ?? null,
                slug: experience.slug,
              }}
            />

            {/* Trajanje badge */}
            <Badge className="absolute bottom-4 right-4 bg-background/90 text-foreground backdrop-blur-sm">
              <Clock className="size-3" aria-hidden="true" />
              {formatDurationL(experience.durationHours, lang)}
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
                    aria-label={L.a11y.verified[lang]}
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

            {/*
              Prosojni ulovač klikov čez celo hero sliko (zadnji v drevesu,
              brez z-index): srček (z-[2]) leži nad njim, X gumb DialogContenta
              (kasnejši v drevesu, isti stacking level) pa ostane klikljiv.
            */}
            {galleryCount > 0 ? (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                aria-label={L.a11y.openGallery[lang](galleryCount)}
                className="absolute inset-0 cursor-zoom-in"
              />
            ) : null}
          </div>

          {/* Thumbnail strip (če več slik) */}
          {experience.images.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto border-b border-border/60 bg-muted/30 p-3">
              {experience.images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveImage(idx)}
                  aria-label={L.a11y.showImage[lang](idx + 1)}
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
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
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
                {experience.reviewCount > 0 && (
                  <>
                    <Star
                      className="size-4 fill-amber-400 text-amber-400"
                      aria-hidden="true"
                    />
                    <span className="text-sm font-semibold tabular-nums">
                      {experience.rating.toFixed(1)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({experience.reviewCount} {L.reviews[lang]})
                    </span>
                  </>
                )}
              </div>

              <div className="text-right">
                <div className="text-xs text-muted-foreground">{L.price.from[lang]}</div>
                <div className="text-2xl font-bold text-foreground">
                  {formatPrice(
                    experience.pricePerPerson,
                    experience.currency
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{L.price.perPerson[lang]}</div>
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
                label={L.info.duration[lang]}
                value={formatDurationL(experience.durationHours, lang)}
              />
              <InfoItem
                icon={Users}
                label={L.info.group[lang]}
                value={L.info.groupValue[lang](
                  experience.minGroupSize,
                  experience.maxGroupSize
                )}
              />
              <InfoItem
                icon={Languages}
                label={L.info.languages[lang]}
                value={languagesDisplay || "—"}
              />
              <InfoItem
                icon={MapPin}
                label={L.info.location[lang]}
                value={experience.destinationName ?? "—"}
              />
            </div>

            {/* Meeting point */}
            {experience.meetingPoint ? (
              <section>
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Compass className="size-4 text-primary" aria-hidden="true" />
                  {L.meeting.heading[lang]}
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
                  {/* TASK 87: geo povezava na zemljevid — samo kadar ima
                      izkušnja obe koordinati (vnos ponudnika). Zlati
                      poudarni marker na ciljni lokaciji + supply own pin. */}
                  {experience.lat != null && experience.lng != null ? (
                    <a
                      href={`/zemljevid?lat=${experience.lat}&lng=${experience.lng}&zoom=13&label=${encodeURIComponent(experience.name)}`}
                      className="mt-3 inline-flex w-fit items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <MapPin className="size-4 text-primary" aria-hidden="true" />
                      {L.meeting.showOnMap[lang]}
                    </a>
                  ) : null}
                </div>
              </section>
            ) : experience.lat != null && experience.lng != null ? (
              /* TASK 87: brez točke srečanja, a z geo — povezava sama */
              <section>
                <a
                  href={`/zemljevid?lat=${experience.lat}&lng=${experience.lng}&zoom=13&label=${encodeURIComponent(experience.name)}`}
                  className="inline-flex w-fit items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <MapPin className="size-4 text-primary" aria-hidden="true" />
                  {L.meeting.showOnMap[lang]}
                </a>
              </section>
            ) : null}

            {/* Atributi */}
            <section>
              <h3 className="text-sm font-semibold">{L.attributes[lang]}</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {experience.familyFriendly ? (
                  <Badge className="bg-primary text-primary-foreground">
                    <Baby className="size-3" aria-hidden="true" />
                    {L.badge.familyFriendly[lang]}
                  </Badge>
                ) : null}
                {experience.accessibility ? (
                  <Badge variant="secondary">
                    <Accessibility
                      className="size-3"
                      aria-hidden="true"
                    />
                    {L.badge.accessible[lang]}
                  </Badge>
                ) : null}
                {experience.featured ? (
                  <Badge className="bg-amber-400 text-amber-950">
                    <Sparkles className="size-3" aria-hidden="true" />
                    {L.badge.featured[lang]}
                  </Badge>
                ) : null}
              </div>
            </section>

            {/* Kontakt ponudnika */}
            <section>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Users className="size-4 text-primary" aria-hidden="true" />
                {L.provider.heading[lang]}
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
                      href={safeExternalHref(experience.providerWebsite)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Globe className="size-4 text-primary" aria-hidden="true" />
                      {L.provider.website[lang]}
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
                label={L.provider.statsViews[lang]}
                value={experience.viewCount.toLocaleString(
                  lang === "en" ? "en-US" : "sl-SI"
                )}
              />
              <StatCard
                icon={Calendar}
                label={L.provider.statsBookings[lang]}
                value={experience.bookingCount.toLocaleString(
                  lang === "en" ? "en-US" : "sl-SI"
                )}
              />
            </section>

            {/* TASK 8 / D8-D (§3.3): KANONSKI "Dodaj v mojo pot" nad
                rezervacijo — doživetje prej ni imel NOBENE akcije dodajanja v
                pot (samo srček/shrani + rezervacija). Zbirka referenc (ADD
                sloj); razporedjanje in rezervacija ostajata spodaj.
                ISKREN href = /dozivetja (globe povezave na modal ni — odpre
                se iz klientnega stanja tržnice). */}
            <AddToTripButton
              variant="full"
              className="w-full justify-center"
              item={{
                kind: "experience",
                refId: experience.id,
                title: experience.name,
                subtitle: [
                  experience.providerName,
                  experience.destinationName ?? undefined,
                  `${locale === "en" ? "from" : "od"} ${formatPrice(
                    experience.pricePerPerson,
                    experience.currency
                  )}`,
                ]
                  .filter(Boolean)
                  .join(" · "),
                href: "/dozivetja",
                image: experience.images[0],
                source: "dozivetja",
              }}
            />

            {/* Rezervacija — PRAVA rezervacija prek POST /api/bookings
                (demo mode ustvari potrjeno rezervacijo) + sekundarna
                povezava do ponudnikove spletne strani */}
            <BookingSection
              key={`booking-${experience.id}`}
              experience={experience}
              onPhaseChange={setBookingPhase}
            />

            {/* UGC mnenja obiskovalcev (ločeno od demo ratinga) */}
            <ReviewSection key={`reviews-${experience.id}`} experienceId={experience.id} />

            {/* Morda vam je všeč — deterministična priporočila (ISSUE #9: 0 AI) */}
            <RecommendationsSection
              loading={recLoading}
              error={recError}
              items={recommendations}
              currentId={experience.id}
              onSelect={onSelect}
              source={recSource}
            />

            {/* Source note */}
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Compass className="size-3" aria-hidden="true" />
              {L.source[lang]}
            </p>
          </div>
        </div>

        {/*
          FW2-B: celozaslonska galerija — Radix Dialog portala na body, zato
          njegova pozicija v drevesu ne vpliva na layout modalov. Indeksi so
          surovi (isti kot activeImage), da modal po zaprtju lightboxa pokaže
          zadnjo gledano sliko.
        */}
        <ImageLightbox
          images={experience.images}
          activeIndex={activeImage}
          onActiveIndexChange={setActiveImage}
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
          altPrefix={experience.name}
        />
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

/* =============================================================
 * BookingSection — rezervacijski flow znotraj modala
 * =============================================================
 *
 * idle:    primarni CTA "Rezerviraj termin" + sekundarni "Pri ponudniku"
 * form:    obrazec (datum, št. oseb, ime, e-pošta, telefon, opombe)
 * sending: obrazec zaklenjen, gumb kaže Loader2
 * success: potrjevalni pogled (številka, cena, datum, srečanje, ponudnik)
 *
 * Ceno in kontakt ponudnika določi strežnik iz baze — client poslani
 * `provider` podatki so le fallback. Client validacija zrcali strežnik.
 */
function BookingSection({
  experience,
  onPhaseChange,
}: {
  experience: Experience;
  onPhaseChange?: (phase: BookingPhase) => void;
}) {
  const idPrefix = useId();
  // F4-B: jezik UI chroma rezervacijskega toka (validacije, statusi,
  // oznake) — isti L-pattern slovar kot ostali modal.
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";

  // Mejne vrednosti skupine — spoštuj min/maxGroupSize izkušnje,
  // zamiljene smešne vrednosti (0, >100, min > max)
  const minGroup = Math.max(1, Math.min(experience.minGroupSize || 1, 100));
  const maxGroup = Math.max(
    minGroup,
    Math.min(experience.maxGroupSize || 100, 100)
  );
  const defaultGroupSize = Math.min(Math.max(2, minGroup), maxGroup);

  // Datum — input dovoljuje od jutri naprej, validacija >= danes
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = toLocalDateStr(tomorrow);

  const [phase, setPhaseState] = useState<BookingPhase>("idle");
  const [errors, setErrors] = useState<BookingFieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [success, setSuccess] = useState<BookingSuccessData | null>(null);
  const [form, setForm] = useState<BookingFormValues>({
    date: "",
    groupSize: String(defaultGroupSize),
    name: "",
    email: "",
    phone: "",
    notes: "",
  });

  // === TASK 33 (Tier 2 #1): koledar razpoložljivosti — mesečni pogled ob
  // izbiri datuma (iskren UX: zaprt/zaseden dan je viden ŽE pred submitom;
  // strežnik ostaja AVTORITETA — preverba teče v SERIALIZABLE transakciji
  // POST /api/bookings). Vzorec BREZ setState-v-efektu: nalaganje je
  // IZPELJANO stanje (manjkajoč mesec v predpomnilniku), vsi setState
  // klici živijo v async povratnih klicih obljube. Predpomnilnik po mesecih
  // ostane živ — preklop dneva znotraj meseca ne ponovno nalaga.
  const [availByMonth, setAvailByMonth] = useState<
    Record<string, Record<string, AvailDayView>>
  >({});
  const availInFlight = useRef<Set<string>>(new Set());

  const availMonth = form.date ? form.date.slice(0, 7) : null;
  const availDays = availMonth ? availByMonth[availMonth] : undefined;
  const availLoading = availMonth !== null && availDays === undefined;
  const selectedAvail =
    form.date && availDays ? availDays[form.date] : undefined;

  useEffect(() => {
    if (!form.date) return;
    const month = form.date.slice(0, 7);
    if (availInFlight.current.has(month) || availByMonth[month]) return;
    availInFlight.current.add(month);
    fetch(
      `/api/experiences/${experience.id}/availability?month=${month}`
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { days?: AvailDayView[] } | null) => {
        const map: Record<string, AvailDayView> = {};
        for (const day of body?.days ?? []) map[day.date] = day;
        setAvailByMonth((prev) => ({ ...prev, [month]: map }));
      })
      .catch(() => {
        // Iskrenost: napaka nalaganja NE blokira obrazca — strežnik
        // avtoritativno preverja ob submitu (prazna mapa ustavi spinner).
        setAvailByMonth((prev) => ({ ...prev, [month]: {} }));
      })
      .finally(() => {
        availInFlight.current.delete(month);
      });
  }, [form.date, experience.id, availByMonth]);

  const setPhase = (p: BookingPhase) => {
    setPhaseState(p);
    onPhaseChange?.(p);
  };

  // === Client validacija (zrcala strežniško) ===
  const validate = (): BookingFieldErrors => {
    const next: BookingFieldErrors = {};

    if (!form.date.trim()) {
      next.date = L.booking.errors.dateRequired[lang];
    } else {
      const parsed = parseLocalDate(form.date);
      if (!parsed) {
        next.date = L.booking.errors.dateInvalid[lang];
      } else if (parsed < today) {
        next.date = L.booking.errors.datePast[lang];
      } else if (
        // TASK 33: zaprt dan (blackout) ali izven sezone — koledar
        // ponudnika; strežnik isto preverja v transakciji (avtoriteta)
        selectedAvail &&
        !selectedAvail.past &&
        !selectedAvail.available
      ) {
        next.date =
          selectedAvail.reason === "blackout"
            ? L.booking.errors.dateBlackout[lang]
            : L.booking.errors.dateOffSeason[lang];
      } else if (
        selectedAvail &&
        !selectedAvail.past &&
        selectedAvail.remaining === 0
      ) {
        next.date = L.booking.errors.dateSoldOut[lang];
      }
    }

    const gs = Number(form.groupSize.trim());
    if (
      !form.groupSize.trim() ||
      !Number.isInteger(gs) ||
      gs < 1 ||
      gs > 100
    ) {
      next.groupSize = L.booking.errors.groupInvalid[lang];
    } else if (gs < minGroup || gs > maxGroup) {
      next.groupSize = L.booking.errors.groupRange[lang](minGroup, maxGroup);
    } else if (
      // TASK 33: skupina ne sme preseči prostih mest dneva
      selectedAvail &&
      !selectedAvail.past &&
      selectedAvail.remaining !== null &&
      gs > selectedAvail.remaining
    ) {
      next.groupSize = L.booking.errors.groupRemaining[lang](
        selectedAvail.remaining
      );
    }

    if (form.name.trim().length < 2) {
      next.name = L.booking.errors.nameShort[lang];
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = L.booking.errors.emailInvalid[lang];
    }

    if (form.phone.trim().length < 5) {
      next.phone = L.booking.errors.phoneShort[lang];
    }

    return next;
  };

  // === Submit → POST /api/bookings ===
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (phase === "sending") return;

    setApiError(null);
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setPhase("sending");
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienceId: experience.id,
          groupSize: Number(form.groupSize.trim()),
          bookingDate: form.date,
          // Atribucija (Booking-style): rezervacija v seji po AI konzultaciji
          // se zapiše z source "consultation" — ponudnik vidi izvor vrednosti.
          ...(hasConsultationRef() ? { source: "consultation" } : {}),
          guest: {
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            notes: form.notes.trim(),
          },
          // Fallback za strežnik — ceno/kontakt prebere iz baze
          provider: {
            name: experience.providerName,
            email: experience.providerEmail ?? undefined,
            meetingPoint: experience.meetingPoint ?? undefined,
          },
        }),
      });

      const data = (await res.json().catch(() => null)) as BookingResponse | null;
      if (!res.ok || !data?.success) {
        throw new Error(
          data?.error || L.booking.errors.apiFailed[lang]
        );
      }

      const gs = Number(form.groupSize.trim());
      setSuccess({
        bookingNumber: data.bookingNumber ?? "—",
        total:
          typeof data.total === "number"
            ? data.total
            : Math.round(experience.pricePerPerson * gs * 100) / 100,
        currency: data.currency ?? experience.currency,
        bookingDate: data.bookingDate ?? form.date,
        meetingPoint: data.meetingPoint ?? null,
        providerName: data.providerName ?? experience.providerName,
        providerEmail: data.providerEmail ?? experience.providerEmail ?? "",
        status: data.status ?? "confirmed",
      });
      setPhase("success");
      trackFunnel("experience_booked");
      // FW2-B: številko rezervacije shrani lokalno ("dai:my-bookings") —
      // dostopna tudi po zaprtju modala, brez računa.
      if (data.bookingNumber) {
        addBooking(data.bookingNumber);
      }
      // Atribucija velja za prvo rezervacijo po konzultaciji (pošteno okno
      // vpliva) — po njej oznako počistimo.
      clearConsultationRef();
    } catch (err) {
      setApiError(
        err instanceof Error
          ? err.message
          : L.booking.errors.apiFailed[lang]
      );
      setPhase("form");
    }
  };

  // === "Nova rezervacija" — reset obrazca ===
  const handleReset = () => {
    setForm({
      date: "",
      groupSize: String(defaultGroupSize),
      name: "",
      email: "",
      phone: "",
      notes: "",
    });
    setErrors({});
    setApiError(null);
    setSuccess(null);
    setPhase("form");
  };

  // === Stepper za število oseb ===
  const stepGroupSize = (delta: number) => {
    const current = Number.parseInt(form.groupSize, 10);
    const base = Number.isNaN(current) ? defaultGroupSize : current;
    const next = Math.min(maxGroup, Math.max(minGroup, base + delta));
    setForm((prev) => ({ ...prev, groupSize: String(next) }));
  };

  const currentGs = Number.parseInt(form.groupSize, 10);
  const canDecrease = !Number.isNaN(currentGs) && currentGs > minGroup;
  const canIncrease = !Number.isNaN(currentGs) && currentGs < maxGroup;

  // Živi prikaz skupne cene
  const totalPreview = Number.isNaN(currentGs)
    ? null
    : Math.round(experience.pricePerPerson * currentGs * 100) / 100;

  const update =
    (field: keyof BookingFormValues) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  /* --- IDLE: primarni CTA + sekundarna povezava --- */
  if (phase === "idle") {
    return (
      <section aria-label={L.a11y.bookingSection[lang]} className="space-y-2">
        <Button
          type="button"
          size="lg"
          className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => {
            setApiError(null);
            setPhase("form");
          }}
        >
          <Calendar className="size-4" aria-hidden="true" />
          {L.booking.bookCta[lang]}
        </Button>
        {experience.providerWebsite ? (
          <Button type="button" asChild size="lg" variant="outline" className="w-full gap-2">
            <a
              href={safeExternalHref(experience.providerWebsite)}
              target="_blank"
              rel="noopener noreferrer sponsored"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {L.booking.atProvider[lang]}
            </a>
          </Button>
        ) : (
          <Button type="button" size="lg" variant="outline" className="w-full gap-2" disabled>
            <Globe className="size-4" aria-hidden="true" />
            {L.booking.noWebsite[lang]}
          </Button>
        )}
      </section>
    );
  }

  /* --- SUCCESS: potrjevalni pogled (slog SuccessView iz checkout-modala) --- */
  if (phase === "success" && success) {
    return (
      <section
        aria-label={L.a11y.bookingConfirmed[lang]}
        role="status"
        className="flex flex-col items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5 text-center sm:p-6"
      >
        <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CheckCircle2 className="size-9" aria-hidden="true" />
        </span>

        <div>
          <h3 className="text-xl font-bold text-foreground">
            {L.booking.successTitle[lang]}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {L.booking.successNote[lang]}
          </p>
        </div>

        <div className="w-full rounded-lg border border-border/60 bg-background p-4 text-left">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{L.booking.numberLabel[lang]}</span>
            <span className="font-mono font-bold text-foreground">
              {success.bookingNumber}
            </span>
          </div>
          <Separator className="my-3" />
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{L.booking.totalLabel[lang]}</span>
            <span className="font-bold tabular-nums text-foreground">
              {formatPrice(success.total, success.currency)}
            </span>
          </div>
          <Separator className="my-3" />
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{L.booking.dateLabel[lang]}</span>
            <span className="font-medium text-foreground">
              {formatBookingDate(success.bookingDate, lang)}
            </span>
          </div>
          {success.meetingPoint ? (
            <>
              <Separator className="my-3" />
              <div className="flex items-start justify-between gap-3 text-sm">
                <span className="shrink-0 text-muted-foreground">{L.booking.meetingLabel[lang]}</span>
                <span className="text-right font-medium text-foreground">
                  {success.meetingPoint}
                </span>
              </div>
            </>
          ) : null}
          {success.providerName ? (
            <>
              <Separator className="my-3" />
              <div className="flex items-start justify-between gap-3 text-sm">
                <span className="shrink-0 text-muted-foreground">{L.booking.providerLabel[lang]}</span>
                <span className="min-w-0 text-right">
                  <span className="block font-medium text-foreground">
                    {success.providerName}
                  </span>
                  {success.providerEmail ? (
                    <a
                      href={`mailto:${success.providerEmail}`}
                      className="text-xs text-primary hover:underline"
                    >
                      {success.providerEmail}
                    </a>
                  ) : null}
                </span>
              </div>
            </>
          ) : null}
          <Separator className="my-3" />
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{L.booking.statusLabel[lang]}</span>
            <Badge className="bg-primary text-primary-foreground">
              {success.status === "confirmed"
                ? L.booking.statusConfirmed[lang]
                : success.status}
            </Badge>
          </div>
        </div>

        <Button
          type="button"
          size="lg"
          onClick={handleReset}
          className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          {L.booking.newBooking[lang]}
        </Button>
      </section>
    );
  }

  /* --- FORM / SENDING: obrazec (med pošiljanjem zaklenjen) --- */
  const sending = phase === "sending";

  return (
    <section
      aria-label={L.a11y.bookingSection[lang]}
      className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5"
    >
      {/* Vrh: izkušnja + preklic */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Calendar className="size-4 text-primary" aria-hidden="true" />
            {L.booking.formHeading[lang]}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {experience.name} ·{" "}
            {formatPrice(experience.pricePerPerson, experience.currency)}{" "}
            {L.price.perPerson[lang]}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPhase("idle")}
          disabled={sending}
          className="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          {L.booking.cancel[lang]}
        </button>
      </div>

      {/* Napaka iz API-ja — obrazec ostane izpolnjen */}
      {apiError ? (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{apiError}</span>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
        {/* Datum + število oseb */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label
              htmlFor={`${idPrefix}-date`}
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
            >
              <Calendar className="size-3.5 text-muted-foreground" aria-hidden="true" />
              {L.booking.form.date[lang]}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${idPrefix}-date`}
              type="date"
              value={form.date}
              min={tomorrowStr}
              disabled={sending}
              required
              aria-invalid={!!errors.date}
              aria-describedby={
                errors.date ? `${idPrefix}-date-error` : undefined
              }
              onChange={update("date")}
            />
            {errors.date ? (
              <p
                id={`${idPrefix}-date-error`}
                className="mt-1 text-xs text-destructive"
              >
                {errors.date}
              </p>
            ) : selectedAvail && !selectedAvail.past && !selectedAvail.available ? (
              // TASK 33: proaktivni status dneva (pred submitom)
              <p className="mt-1 text-xs text-destructive">
                {selectedAvail.reason === "blackout"
                  ? L.booking.avail.blackout[lang]
                  : L.booking.avail.offSeason[lang]}
              </p>
            ) : selectedAvail &&
              !selectedAvail.past &&
              selectedAvail.remaining === 0 ? (
              <p className="mt-1 text-xs text-destructive">
                {L.booking.avail.soldOut[lang]}
              </p>
            ) : selectedAvail &&
              !selectedAvail.past &&
              selectedAvail.remaining !== null ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedAvail.remaining <= 5
                  ? L.booking.avail.fewLeft[lang](selectedAvail.remaining)
                  : L.booking.avail.spotsLeft[lang](selectedAvail.remaining)}{" "}
                {L.booking.avail.timeNote[lang]}
              </p>
            ) : availLoading ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {L.booking.avail.checking[lang]}
              </p>
            ) : (
              // P4-9: iskrena mikrokopija — čas rezervacije se dogovori
              // neposredno z izvajalcem (obrazec zajema samo datum).
              <p className="mt-1 text-xs text-muted-foreground">
                {L.booking.avail.timeNote[lang]}
              </p>
            )}
          </div>

          <div>
            <Label
              htmlFor={`${idPrefix}-group`}
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
            >
              <Users className="size-3.5 text-muted-foreground" aria-hidden="true" />
              {L.booking.form.groupSize[lang]}
              <span className="text-destructive">*</span>
            </Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9 shrink-0"
                aria-label={L.a11y.decreaseGroup[lang]}
                disabled={sending || !canDecrease}
                onClick={() => stepGroupSize(-1)}
              >
                <span aria-hidden="true">−</span>
              </Button>
              <Input
                id={`${idPrefix}-group`}
                type="number"
                inputMode="numeric"
                className="w-20 text-center tabular-nums"
                min={minGroup}
                max={maxGroup}
                step={1}
                value={form.groupSize}
                disabled={sending}
                required
                aria-invalid={!!errors.groupSize}
                aria-describedby={
                  errors.groupSize
                    ? `${idPrefix}-group-error`
                    : `${idPrefix}-group-hint`
                }
                onChange={update("groupSize")}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9 shrink-0"
                aria-label={L.a11y.increaseGroup[lang]}
                disabled={sending || !canIncrease}
                onClick={() => stepGroupSize(1)}
              >
                <span aria-hidden="true">+</span>
              </Button>
              <span
                id={`${idPrefix}-group-hint`}
                className="text-xs text-muted-foreground"
              >
                {L.booking.form.groupHint[lang](minGroup, maxGroup)}
              </span>
            </div>
            {errors.groupSize ? (
              <p
                id={`${idPrefix}-group-error`}
                className="mt-1 text-xs text-destructive"
              >
                {errors.groupSize}
              </p>
            ) : null}
          </div>
        </div>

        {/* Ime + telefon */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label
              htmlFor={`${idPrefix}-name`}
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
            >
              <User className="size-3.5 text-muted-foreground" aria-hidden="true" />
              {L.booking.form.name[lang]}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${idPrefix}-name`}
              type="text"
              autoComplete="name"
              placeholder={L.booking.form.phName[lang]}
              value={form.name}
              disabled={sending}
              required
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? `${idPrefix}-name-error` : undefined}
              onChange={update("name")}
            />
            {errors.name ? (
              <p
                id={`${idPrefix}-name-error`}
                className="mt-1 text-xs text-destructive"
              >
                {errors.name}
              </p>
            ) : null}
          </div>

          <div>
            <Label
              htmlFor={`${idPrefix}-phone`}
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
            >
              <Phone className="size-3.5 text-muted-foreground" aria-hidden="true" />
              {L.booking.form.phone[lang]}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${idPrefix}-phone`}
              type="tel"
              autoComplete="tel"
              placeholder={L.booking.form.phPhone[lang]}
              value={form.phone}
              disabled={sending}
              required
              aria-invalid={!!errors.phone}
              aria-describedby={
                errors.phone ? `${idPrefix}-phone-error` : undefined
              }
              onChange={update("phone")}
            />
            {errors.phone ? (
              <p
                id={`${idPrefix}-phone-error`}
                className="mt-1 text-xs text-destructive"
              >
                {errors.phone}
              </p>
            ) : null}
          </div>
        </div>

        {/* E-pošta */}
        <div>
          <Label
            htmlFor={`${idPrefix}-email`}
            className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
          >
            <Mail className="size-3.5 text-muted-foreground" aria-hidden="true" />
            {L.booking.form.email[lang]}
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={L.booking.form.phEmail[lang]}
            value={form.email}
            disabled={sending}
            required
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? `${idPrefix}-email-error` : undefined}
            onChange={update("email")}
          />
          {errors.email ? (
            <p
              id={`${idPrefix}-email-error`}
              className="mt-1 text-xs text-destructive"
            >
              {errors.email}
            </p>
          ) : null}
        </div>

        {/* Opombe (opcijsko) */}
        <div>
          <Label
            htmlFor={`${idPrefix}-notes`}
            className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
          >
            {L.booking.form.notes[lang]}
          </Label>
          <Textarea
            id={`${idPrefix}-notes`}
            rows={3}
            placeholder={L.booking.form.phNotes[lang]}
            value={form.notes}
            disabled={sending}
            onChange={update("notes")}
          />
        </div>

        {/* Živi prikaz skupne cene */}
        {totalPreview !== null ? (
          <div
            className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2.5 text-sm"
            aria-live="polite"
          >
            <span className="text-muted-foreground">
              {L.booking.form.people[lang](currentGs)} ×{" "}
              {formatPrice(experience.pricePerPerson, experience.currency)}
            </span>
            <span className="font-bold tabular-nums text-foreground">
              {formatPrice(totalPreview, experience.currency)}
            </span>
          </div>
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={sending}
          className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {sending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {L.booking.form.sending[lang]}
            </>
          ) : (
            <>
              <Send className="size-4" aria-hidden="true" />
              {L.booking.form.confirm[lang]}
            </>
          )}
        </Button>

        {/* Screen-reader status med pošiljanjem */}
        <p className="sr-only" role="status" aria-live="polite">
          {sending ? L.booking.form.srSending[lang] : ""}
        </p>

        {/* Demo opomba (iskrena — kot v checkout modalu) + zasebnost */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-900 dark:border-amber-400/40 dark:bg-amber-950/30 dark:text-amber-100">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {L.booking.form.demo[lang]}
          </span>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          {L.booking.form.privacy[lang]}
        </p>
      </form>
    </section>
  );
}

/**
 * RecommendationsSection — "Morda vam je všeč".
 * Prikazuje do 4 AI-priporočene podobne izkušnje (GLM izbere iz 10 kandidatov).
 * Klik na kartico zamenja trenutno izkušnjo v modalu (preko onSelect).
 * `source` prikaže transparenten badge (AI / fallback / cache).
 * §20 (1.97.0): pod imenom vsake kartice je ENA iskrena vrstica
 * "Zakaj: {why}" (samo dejstva iz kandidata) + droben izvor
 * "(iz podatkov)", kadar vrstico ni curirala AI (whySource
 * "deterministic") — priporočilo ni črn AI ranking.
 */
function RecommendationsSection({
  loading,
  error,
  items,
  currentId,
  onSelect,
  source,
}: {
  loading: boolean;
  error: boolean;
  items: RecommendedExperience[];
  currentId: string;
  onSelect?: (experience: Experience) => void;
  source?: "deterministic" | "fallback" | "cache" | "ai";
}) {
  // §20: prevodi why vrstice — komponenta sicer nosi hardcoded SL besedila
  // (tržnica je slovenska površina), a why vrstica je NEW površina in
  // modali se izrisujejo TUDI na EN whitelisti (/destinacija/…/things-to-do
  // prek seo-conversion) → zato next-intl (namespace marketplace).
  const t = useTranslations("marketplace");
  // F4-B: L-pattern za chrome naslova/oddpisa priporočil (isti slovar L zgoraj)
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const visible = items.filter((e) => e.id !== currentId).slice(0, 4);
  // ISSUE #9: vir je "deterministic" (cache = deterministični izračun iz
  // predpomnilnika); "ai" ostaja samo za LEGACY cache zapise (TTL 24 h).
  const isLegacyAi = source === "ai";
  const sourceLabel = isLegacyAi ? "AI" : L.recs.similar[lang];

  if (loading) {
    return (
      <section aria-label={L.recs.title[lang]}>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Lightbulb className="size-4 text-primary" aria-hidden="true" />
          {L.recs.title[lang]}
          <Badge variant="secondary" className="ml-auto gap-1 text-[10px]">
            <Sparkles className="size-2.5" aria-hidden="true" />
            AI
          </Badge>
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-lg border border-border/60"
            >
              <Skeleton className="aspect-square w-full" />
              <div className="space-y-1.5 p-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error || visible.length === 0) return null;

  return (
    <section aria-label={L.recs.title[lang]}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Lightbulb className="size-4 text-primary" aria-hidden="true" />
        {L.recs.title[lang]}
        <Badge
          variant={isLegacyAi ? "default" : "secondary"}
          className="ml-auto gap-1 text-[10px]"
          title={
            isLegacyAi ? L.recs.aiTitle[lang] : L.recs.similarTitle[lang]
          }
        >
          {isLegacyAi ? <Sparkles className="size-2.5" aria-hidden="true" /> : null}
          {sourceLabel}
        </Badge>
      </h3>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {visible.map((e) => {
          const img = e.images[0];
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelect?.(e)}
              className="group flex flex-col overflow-hidden rounded-lg border border-border/60 bg-background text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              aria-label={L.a11y.openExperience[lang](e.name)}
            >
              <div className="relative aspect-square w-full overflow-hidden bg-muted">
                {img ? (
                  <img
                    src={img}
                    alt={e.name}
                    className="size-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-3xl">
                    <span aria-hidden="true">
                      {EXPERIENCE_CATEGORY_ICONS[e.category]}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-2">
                <h4 className="line-clamp-1 text-xs font-semibold">
                  {e.name}
                </h4>
                {/* §20: ena iskrena vrstica razloga (samo dejstva iz
                    kandidata) — stilsko enaka meta vrstici kartice */}
                {e.why ? (
                  <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                    {t("recsWhy", { why: e.why })}
                    {e.whySource === "deterministic" ? (
                      <span title={t("recsWhyFromDataTitle")}>
                        {` ${t("recsWhyFromData")}`}
                      </span>
                    ) : null}
                  </p>
                ) : null}
                <div className="mt-auto flex items-center justify-between gap-1">
                  <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                    <Star
                      className="size-3 fill-amber-400 text-amber-400"
                      aria-hidden="true"
                    />
                    <span className="tabular-nums">{e.rating.toFixed(1)}</span>
                  </span>
                  <span className="text-xs font-bold text-foreground">
                    {formatPrice(e.pricePerPerson, e.currency)}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default ExperienceModal;
