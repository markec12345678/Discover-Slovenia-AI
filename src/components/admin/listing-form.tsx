"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, X, AlertCircle, CalendarDays, CloudSun, Car } from "lucide-react";
import { DESTINATIONS } from "@/lib/slovenia-data";
import {
  SEASON_KEYS,
  SEASON_LABELS,
  WEATHER_SUITABILITY_KEYS,
  WEATHER_SUITABILITY_LABELS,
  PARKING_KEYS,
  PARKING_LABELS,
  type SeasonKey,
  type WeatherSuitability,
  type ParkingOption,
} from "@/lib/listing-practical";
import type { ListingCategory, ListingPlan } from "@/lib/listings-types";

// Admin Listing — razširjen tip z vsemi polji iz baze
export interface AdminListing {
  id: string;
  name: string;
  slug: string;
  description: string;
  longDescription?: string | null;
  category: ListingCategory;
  destinationId?: string | null;
  destinationName?: string | null;
  address: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  images: string[];
  plan: ListingPlan;
  featured: boolean;
  verified: boolean;
  rating: number;
  reviewCount: number;
  priceRange: string;
  openingHours?: string | null;
  specialties: string[];
  // === PRAKTIČNI PODATKI (t12 faza 1) — vsa tri neobvezna ===
  seasons?: SeasonKey[] | null;
  weatherSuitability?: WeatherSuitability | null;
  parking?: ParkingOption | null;
  ownerEmail?: string | null;
  viewCount: number;
  clickCount: number;
  createdAt?: string;
  updatedAt?: string;
}

interface ListingFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing?: AdminListing | null;
  adminPassword: string;
  onSaved?: (listing: AdminListing) => void;
}

const CATEGORIES: { value: ListingCategory; label: string }[] = [
  { value: "hotel", label: "Hotel" },
  { value: "restaurant", label: "Restavracija" },
  { value: "bar", label: "Bar" },
  { value: "activity", label: "Aktivnost" },
  { value: "shop", label: "Trgovina" },
  { value: "transport", label: "Transport" },
  { value: "other", label: "Drugo" },
];

const PLANS: { value: ListingPlan; label: string }[] = [
  { value: "free", label: "Osnovni (free)" },
  { value: "premium", label: "Premium" },
  { value: "enterprise", label: "Enterprise" },
];

const PRICE_RANGES = ["€", "€€", "€€€"];

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function ListingForm({
  open,
  onOpenChange,
  listing,
  adminPassword,
  onSaved,
}: ListingFormProps) {
  const isEdit = !!listing;

  // Form state
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugEdited, setSlugEdited] = React.useState(false);
  const [category, setCategory] = React.useState<ListingCategory>("other");
  const [destinationId, setDestinationId] = React.useState<string>("");
  const [description, setDescription] = React.useState("");
  const [longDescription, setLongDescription] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [imagesText, setImagesText] = React.useState("");
  const [plan, setPlan] = React.useState<ListingPlan>("free");
  const [featured, setFeatured] = React.useState(false);
  const [verified, setVerified] = React.useState(false);
  const [priceRange, setPriceRange] = React.useState("€");
  const [openingHours, setOpeningHours] = React.useState("");
  const [specialtiesText, setSpecialtiesText] = React.useState("");
  const [rating, setRating] = React.useState("0");
  const [reviewCount, setReviewCount] = React.useState("0");
  // Praktični podatki (t12 faza 1)
  const [seasons, setSeasons] = React.useState<SeasonKey[]>([]);
  const [weatherSuitability, setWeatherSuitability] =
    React.useState<WeatherSuitability | null>(null);
  const [parking, setParking] = React.useState<ParkingOption | null>(null);

  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Reset polja ko se odpre dialog (z novim/edit listingom)
  React.useEffect(() => {
    if (!open) return;
    if (listing) {
      setName(listing.name);
      setSlug(listing.slug);
      setSlugEdited(true);
      setCategory(listing.category);
      setDestinationId(listing.destinationId ?? "");
      setDescription(listing.description);
      setLongDescription(listing.longDescription ?? "");
      setAddress(listing.address);
      setPhone(listing.phone ?? "");
      setEmail(listing.email ?? "");
      setWebsite(listing.website ?? "");
      setImagesText((listing.images ?? []).join("\n"));
      setPlan(listing.plan);
      setFeatured(listing.featured);
      setVerified(listing.verified);
      setPriceRange(listing.priceRange || "€");
      setOpeningHours(listing.openingHours ?? "");
      setSpecialtiesText((listing.specialties ?? []).join(", "));
      setRating(String(listing.rating ?? 0));
      setReviewCount(String(listing.reviewCount ?? 0));
      setSeasons(listing.seasons ?? []);
      setWeatherSuitability(listing.weatherSuitability ?? null);
      setParking(listing.parking ?? null);
    } else {
      setName("");
      setSlug("");
      setSlugEdited(false);
      setCategory("other");
      setDestinationId("");
      setDescription("");
      setLongDescription("");
      setAddress("");
      setPhone("");
      setEmail("");
      setWebsite("");
      setImagesText("");
      setPlan("free");
      setFeatured(false);
      setVerified(false);
      setPriceRange("€");
      setOpeningHours("");
      setSpecialtiesText("");
      setRating("0");
      setReviewCount("0");
      setSeasons([]);
      setWeatherSuitability(null);
      setParking(null);
    }
    setErrorMsg(null);
    setLoading(false);
  }, [open, listing]);

  // Auto-generiraj slug ko se ime spremeni (če slug ni ročno urejen)
  React.useEffect(() => {
    if (!slugEdited && name) {
      setSlug(slugify(name));
    }
  }, [name, slugEdited]);

  const handleNameChange = (val: string) => {
    setName(val);
  };

  const handleSlugChange = (val: string) => {
    setSlugEdited(true);
    setSlug(slugify(val));
  };

  // t12 faza 1: sezonski čipi
  const toggleSeason = (key: SeasonKey) => {
    setSeasons((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
  };

  const toggleAllYear = () => {
    setSeasons((prev) =>
      prev.length === SEASON_KEYS.length ? [] : [...SEASON_KEYS]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg("Ime je obvezno");
      return;
    }
    if (!description.trim()) {
      setErrorMsg("Kratek opis je obvezen");
      return;
    }
    if (!address.trim()) {
      setErrorMsg("Naslov je obvezen");
      return;
    }

    const dest = DESTINATIONS.find((d) => d.id === destinationId);

    const payload = {
      name: name.trim(),
      slug: slug.trim() || slugify(name),
      description: description.trim(),
      longDescription: longDescription.trim(),
      category,
      destinationId: destinationId || null,
      destinationName: dest?.name ?? null,
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
      website: website.trim(),
      images: imagesText,
      plan,
      featured,
      verified,
      priceRange,
      openingHours: openingHours.trim(),
      specialties: specialtiesText,
      seasons,
      weatherSuitability,
      parking,
      rating: parseFloat(rating) || 0,
      reviewCount: parseInt(reviewCount, 10) || 0,
      ownerEmail: listing?.ownerEmail ?? null,
    };

    setLoading(true);
    try {
      const url = isEdit
        ? `/api/admin/listings/${listing!.id}`
        : "/api/admin/listings";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify(payload),
      });

      const data: unknown = await res.json();
      if (!res.ok) {
        const errMsg =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as Record<string, unknown>).error === "string"
            ? (data as Record<string, string>).error
            : "Napaka pri shranjevanju";
        setErrorMsg(errMsg);
        setLoading(false);
        return;
      }

      const savedListing = (
        data as Record<string, unknown>
      ).listing as AdminListing | undefined;

      if (onSaved && savedListing) {
        onSaved(savedListing);
      }
      onOpenChange(false);
    } catch (err) {
      console.error("[listing-form] napaka:", err);
      setErrorMsg("Napaka pri povezavi s strežnikom");
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto scroll-area-custom">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Uredi lokal" : "Nov lokal"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Posodobite podatke lokala. Spremembe so vidne takoj."
              : "Izpolnite podatke za nov lokal. Polja označena z * so obvezna."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Osnovni podatki */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="lf-name">
                Ime <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lf-name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="npr. Hotel Vila Bled"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-slug">Slug (URL)</Label>
              <Input
                id="lf-slug"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="auto-generirano-iz-imena"
              />
              <p className="text-xs text-muted-foreground">
                Pusti prazno za samodejno generiranje iz imena.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="lf-category">Kategorija</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as ListingCategory)}
              >
                <SelectTrigger id="lf-category" className="w-full">
                  <SelectValue placeholder="Izberi kategorijo" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-destination">Destinacija</Label>
              <Select
                value={destinationId || "none"}
                onValueChange={(v) => setDestinationId(v === "none" ? "" : v)}
              >
                <SelectTrigger id="lf-destination" className="w-full">
                  <SelectValue placeholder="Brez destinacije" />
                </SelectTrigger>
                <SelectContent>
                  {/* POZOR: Radix SelectItem NE sme imeti praznega value
                      ("A <Select.Item /> must have a value prop that is not
                      an empty string") — nadomeščeni "none" sentinel, ki ga
                      onValueChange preslika nazaj v "" (kot null v payloadu). */}
                  <SelectItem value="none">— Brez —</SelectItem>
                  {DESTINATIONS.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Opisi */}
          <div className="space-y-1.5">
            <Label htmlFor="lf-description">
              Kratek opis <span className="text-destructive">*</span>
            </Label>
            <Input
              id="lf-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kratek opis za kartico (1 stavek)"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lf-long-desc">Dolgi opis</Label>
            <Textarea
              id="lf-long-desc"
              value={longDescription}
              onChange={(e) => setLongDescription(e.target.value)}
              placeholder="Podroben opis lokala, zgodovina, ponudba..."
              rows={4}
            />
          </div>

          {/* Kontakt */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="lf-address">
                Naslov <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lf-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Cesta Svobode 18, 4260 Bled"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-phone">Telefon</Label>
              <Input
                id="lf-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+386 4 579 1500"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-email">E-pošta</Label>
              <Input
                id="lf-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="info@lokal.si"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-website">Spletna stran</Label>
              <Input
                id="lf-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://www.lokal.si"
              />
            </div>
          </div>

          {/* Slike in spec */}
          <div className="space-y-1.5">
            <Label htmlFor="lf-images">Slike (URL)</Label>
            <Textarea
              id="lf-images"
              value={imagesText}
              onChange={(e) => setImagesText(e.target.value)}
              placeholder={"https://...slika1.jpg\nhttps://...slika2.jpg"}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              En URL na vrstico ali ločeno z vejico.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lf-specialties">Specialitete / značilnosti</Label>
            <Input
              id="lf-specialties"
              value={specialtiesText}
              onChange={(e) => setSpecialtiesText(e.target.value)}
              placeholder="Jezerski pogled, Wellness, Fine dining"
            />
            <p className="text-xs text-muted-foreground">
              Ločeno z vejico.
            </p>
          </div>

          {/* Paket in status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="lf-plan">Paket</Label>
              <Select
                value={plan}
                onValueChange={(v) => setPlan(v as ListingPlan)}
              >
                <SelectTrigger id="lf-plan" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-price">Cena</Label>
              <Select
                value={priceRange}
                onValueChange={(v) => setPriceRange(v)}
              >
                <SelectTrigger id="lf-price" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRICE_RANGES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-hours">Odpiralni čas</Label>
              <Input
                id="lf-hours"
                value={openingHours}
                onChange={(e) => setOpeningHours(e.target.value)}
                placeholder="pon–pet 9–22"
              />
            </div>
          </div>

          {/* Praktični podatki (t12 faza 1) */}
          <div className="space-y-4 rounded-md border p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="size-4" aria-hidden="true" />
              Praktični podatki za popotnike
              <span className="font-normal text-muted-foreground">
                (neobvezno)
              </span>
            </div>
            <div className="space-y-1.5">
              <Label>Sezona obratovanja</Label>
              <div className="flex flex-wrap gap-2" role="group">
                <button
                  type="button"
                  onClick={toggleAllYear}
                  aria-pressed={seasons.length === SEASON_KEYS.length}
                  className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                    seasons.length === SEASON_KEYS.length
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-accent"
                  }`}
                >
                  Celo leto
                </button>
                {SEASON_KEYS.map((key) => {
                  const active = seasons.includes(key);
                  const label =
                    SEASON_LABELS[key].sl.charAt(0).toUpperCase() +
                    SEASON_LABELS[key].sl.slice(1);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleSeason(key)}
                      aria-pressed={active}
                      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-accent"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <CloudSun className="size-3.5" aria-hidden="true" />
                  Ustreznost vremenu
                </Label>
                <Select
                  value={weatherSuitability ?? "unset"}
                  onValueChange={(v) =>
                    setWeatherSuitability(
                      v === "unset" ? null : (v as WeatherSuitability)
                    )
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Ni podatka" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Ni podatka</SelectItem>
                    {WEATHER_SUITABILITY_KEYS.map((key) => (
                      <SelectItem key={key} value={key}>
                        {WEATHER_SUITABILITY_LABELS[key].formSl}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Car className="size-3.5" aria-hidden="true" />
                  Parkirišče
                </Label>
                <Select
                  value={parking ?? "unset"}
                  onValueChange={(v) =>
                    setParking(v === "unset" ? null : (v as ParkingOption))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Ni podatka" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Ni podatka</SelectItem>
                    {PARKING_KEYS.map((key) => (
                      <SelectItem key={key} value={key}>
                        {PARKING_LABELS[key].formSl}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Switches */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="lf-featured" className="cursor-pointer">
                  Izpostavljeno (featured)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Prikazano prednostno v seznamu.
                </p>
              </div>
              <Switch
                id="lf-featured"
                checked={featured}
                onCheckedChange={setFeatured}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="lf-verified" className="cursor-pointer">
                  Overjeno (verified)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Prikazan znak za overjene lokale.
                </p>
              </div>
              <Switch
                id="lf-verified"
                checked={verified}
                onCheckedChange={setVerified}
              />
            </div>
          </div>

          {/* Rating in review */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="lf-rating">Ocena (0–5)</Label>
              <Input
                id="lf-rating"
                type="number"
                min={0}
                max={5}
                step={0.1}
                value={rating}
                onChange={(e) => setRating(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-reviews">Število mnenj</Label>
              <Input
                id="lf-reviews"
                type="number"
                min={0}
                step={1}
                value={reviewCount}
                onChange={(e) => setReviewCount(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              <X className="size-4" />
              Prekliči
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Shranjevanje...
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  Shrani
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
