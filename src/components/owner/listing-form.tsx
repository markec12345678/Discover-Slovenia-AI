"use client";

import { useState, useEffect, type FormEvent } from "react";
import {
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  Tag,
  Save,
  ImagePlus,
  Info,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { DESTINATIONS } from "@/lib/slovenia-data";
import {
  CATEGORY_LABELS,
  type Listing,
  type ListingCategory,
} from "@/lib/listings-types";

export interface ListingFormData {
  name: string;
  category: ListingCategory;
  destinationId: string;
  description: string;
  longDescription: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  images: string[];
  priceRange: "€" | "€€" | "€€€";
  openingHours: string;
  specialties: string[];
}

interface ListingFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: Listing | null; // null = nov lokal
  onSaved: () => void;
}

const EMPTY_FORM: ListingFormData = {
  name: "",
  category: "restaurant",
  destinationId: "",
  description: "",
  longDescription: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  images: [],
  priceRange: "€",
  openingHours: "",
  specialties: [],
};

/**
 * ListingFormDialog — forma za ustvarjanje/urejanje lastnikovega lokala.
 * Lastnik NE more nastaviti: plan (deduje iz owner.plan), featured, verified.
 */
export function ListingFormDialog({
  open,
  onOpenChange,
  listing,
  onSaved,
}: ListingFormDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<ListingFormData>(EMPTY_FORM);
  const [imageInput, setImageInput] = useState("");
  const [specialtyInput, setSpecialtyInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isEdit = listing !== null;

  // Nastavi formo ko se odpre ali ko se listing spremeni
  useEffect(() => {
    if (open) {
      if (listing) {
        setForm({
          name: listing.name,
          category: listing.category,
          destinationId: listing.destinationId ?? "",
          description: listing.description,
          longDescription: listing.longDescription ?? "",
          address: listing.address,
          phone: listing.phone ?? "",
          email: listing.email ?? "",
          website: listing.website ?? "",
          images: listing.images,
          priceRange: (listing.priceRange as "€" | "€€" | "€€€") || "€",
          openingHours: listing.openingHours ?? "",
          specialties: listing.specialties,
        });
      } else {
        setForm(EMPTY_FORM);
      }
      setImageInput("");
      setSpecialtyInput("");
      setErrorMsg(null);
    }
  }, [open, listing]);

  const update = <K extends keyof ListingFormData>(
    key: K,
    value: ListingFormData[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleAddImage = () => {
    const url = imageInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      setErrorMsg("Slika mora biti veljaven URL (začne se z http:// ali https://)");
      return;
    }
    if (form.images.includes(url)) {
      setErrorMsg("Ta slika je že dodana.");
      return;
    }
    update("images", [...form.images, url]);
    setImageInput("");
    setErrorMsg(null);
  };

  const handleRemoveImage = (url: string) => {
    update(
      "images",
      form.images.filter((i) => i !== url)
    );
  };

  const handleAddSpecialty = () => {
    const s = specialtyInput.trim();
    if (!s) return;
    if (form.specialties.includes(s)) {
      setErrorMsg("Ta specialnost je že dodana.");
      return;
    }
    update("specialties", [...form.specialties, s]);
    setSpecialtyInput("");
    setErrorMsg(null);
  };

  const handleRemoveSpecialty = (s: string) => {
    update(
      "specialties",
      form.specialties.filter((x) => x !== s)
    );
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);

    // Validacija
    if (form.name.trim().length < 2) {
      setErrorMsg("Ime lokala je obvezno.");
      return;
    }
    if (form.description.trim().length < 10) {
      setErrorMsg("Kratki opis mora imeti vsaj 10 znakov.");
      return;
    }
    if (form.address.trim().length < 3) {
      setErrorMsg("Naslov je obveznen.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        destinationId: form.destinationId || null,
        description: form.description.trim(),
        longDescription: form.longDescription.trim() || null,
        address: form.address.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        images: form.images,
        priceRange: form.priceRange,
        openingHours: form.openingHours.trim() || null,
        specialties: form.specialties,
      };

      const url = isEdit
        ? `/api/owner/listings/${listing!.id}`
        : "/api/owner/listings";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error ?? "Napaka pri shranjevanju.";
        setErrorMsg(msg);
        toast({
          variant: "destructive",
          title: "Napaka",
          description: msg,
        });
        return;
      }

      toast({
        title: isEdit ? "Lokal posodobljen!" : "Lokal ustvarjen!",
        description: isEdit
          ? "Spremembe so shranjene."
          : "Vaš novi lokal je dodan v portal.",
      });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Napaka pri shranjevanju.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Uredi lokal" : "Dodaj nov lokal"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Posodobite podatke svojega lokala."
              : "Izpolnite podatke o svojem lokalu. Paket (free/premium/enterprise) se določi samodejno glede na vašo naročnino."}
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}

        {/* Info opomba — owner ne more nastaviti plan/featured/verified */}
        <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-foreground/80">
          <Info className="size-4 mt-0.5 text-primary shrink-0" aria-hidden="true" />
          <p>
            Paket, izpostavljenost (featured) in overjenost (verified) nastavlja
            administracija. Za spremembo paketa nadgradite naročnino v zavihku
            &laquo;Naročnina&raquo;.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Ime + Kategorija */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lf-name">
                Ime lokala <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lf-name"
                placeholder="Restavracija Pri Makcu"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lf-category">
                Kategorija <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  update("category", v as ListingCategory)
                }
                disabled={loading}
              >
                <SelectTrigger id="lf-category" className="w-full">
                  <SelectValue placeholder="Izberite kategorijo" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as ListingCategory[]).map(
                    (cat) => (
                      <SelectItem key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Destinacija + Cena */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lf-destination">Destinacija</Label>
              <Select
                value={form.destinationId || "none"}
                onValueChange={(v) =>
                  update("destinationId", v === "none" ? "" : v)
                }
                disabled={loading}
              >
                <SelectTrigger id="lf-destination" className="w-full">
                  <SelectValue placeholder="Brez destinacije" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Brez destinacije</SelectItem>
                  {DESTINATIONS.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lf-priceRange">Cenovni razred</Label>
              <Select
                value={form.priceRange}
                onValueChange={(v) =>
                  update("priceRange", v as "€" | "€€" | "€€€")
                }
                disabled={loading}
              >
                <SelectTrigger id="lf-priceRange" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="€">€ — ugodno</SelectItem>
                  <SelectItem value="€€">€€ — srednje</SelectItem>
                  <SelectItem value="€€€">€€€ — višje</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Kratek opis */}
          <div className="space-y-2">
            <Label htmlFor="lf-description">
              Kratki opis <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="lf-description"
              rows={3}
              placeholder="En stavek, ki opisuje vaš lokal..."
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              disabled={loading}
              required
              minLength={10}
            />
            <p className="text-xs text-muted-foreground">
              {form.description.length} znakov (vsaj 10)
            </p>
          </div>

          {/* Dolgi opis */}
          <div className="space-y-2">
            <Label htmlFor="lf-longDescription">Dolgi opis</Label>
            <Textarea
              id="lf-longDescription"
              rows={5}
              placeholder="Podroben opis — kaj ponujate, zakaj vas obiskati..."
              value={form.longDescription}
              onChange={(e) => update("longDescription", e.target.value)}
              disabled={loading}
              className="resize-y"
            />
          </div>

          {/* Naslov */}
          <div className="space-y-2">
            <Label htmlFor="lf-address">
              Naslov <span className="text-destructive">*</span>
            </Label>
            <Input
              id="lf-address"
              placeholder="Cankarjeva cesta 5, 4260 Bled"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {/* Kontakt: Telefon + Email */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lf-phone">Telefon</Label>
              <Input
                id="lf-phone"
                type="tel"
                placeholder="+386 4 123 4567"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lf-email">E-pošta</Label>
              <Input
                id="lf-email"
                type="email"
                placeholder="info@lokal.si"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Website + Odpiralni čas */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lf-website">Spletna stran</Label>
              <Input
                id="lf-website"
                type="url"
                placeholder="https://www.lokal.si"
                value={form.website}
                onChange={(e) => update("website", e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lf-hours">Odpiralni čas</Label>
              <Input
                id="lf-hours"
                placeholder="Pon–Pet: 9–22, Sob: 10–23"
                value={form.openingHours}
                onChange={(e) => update("openingHours", e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Slike */}
          <div className="space-y-2">
            <Label>Slike (URL-ji)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="https://example.com/slika.jpg"
                value={imageInput}
                onChange={(e) => setImageInput(e.target.value)}
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddImage();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddImage}
                disabled={loading || !imageInput.trim()}
                className="shrink-0"
              >
                <ImagePlus className="size-4" aria-hidden="true" />
                <span className="sr-only">Dodaj sliko</span>
              </Button>
            </div>
            {form.images.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {form.images.map((url) => (
                  <div
                    key={url}
                    className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
                  >
                    <img
                      src={url}
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.opacity = "0.3";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(url)}
                      className="absolute right-1 top-1 size-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Odstrani sliko"
                      disabled={loading}
                    >
                      <Trash2 className="size-3" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Specialnosti */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Tag className="size-3.5" aria-hidden="true" />
              Specialnosti
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="npr. domača kulinartika, vegan meni..."
                value={specialtyInput}
                onChange={(e) => setSpecialtyInput(e.target.value)}
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddSpecialty();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddSpecialty}
                disabled={loading || !specialtyInput.trim()}
                className="shrink-0"
              >
                <Plus className="size-4" aria-hidden="true" />
                <span className="sr-only">Dodaj specialnost</span>
              </Button>
            </div>
            {form.specialties.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {form.specialties.map((s) => (
                  <Badge
                    key={s}
                    variant="secondary"
                    className="gap-1 pr-1.5"
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => handleRemoveSpecialty(s)}
                      className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5"
                      aria-label={`Odstrani ${s}`}
                      disabled={loading}
                    >
                      <Trash2 className="size-3" aria-hidden="true" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Prekliči
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
            >
              {loading ? (
                <>
                  <Loader2
                    className="size-4 mr-2 animate-spin"
                    aria-hidden="true"
                  />
                  Shranjujem...
                </>
              ) : (
                <>
                  <Save className="size-4 mr-2" aria-hidden="true" />
                  {isEdit ? "Shrani spremembe" : "Ustvari lokal"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
