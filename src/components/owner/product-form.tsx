"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Loader2, AlertCircle, Save, Info } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
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
  PRODUCT_CATEGORY_LABELS,
  type Product,
  type ProductCategory,
} from "@/lib/marketplace-types";

export interface ProductFormData {
  name: string;
  category: ProductCategory;
  destinationId: string;
  description: string;
  longDescription: string;
  price: string;
  compareAtPrice: string;
  stock: string;
  weight: string;
  images: string;
  organic: boolean;
  handmade: boolean;
  local: boolean;
  vegan: boolean;
  shippingFree: boolean;
  shipsEurope: boolean;
  shipsWorldwide: boolean;
  sellerName: string;
  sellerEmail: string;
  sellerPhone: string;
  sellerWebsite: string;
}

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null; // null = nov izdelek
  onSaved: () => void;
}

const EMPTY_FORM: ProductFormData = {
  name: "",
  category: "food",
  destinationId: "",
  description: "",
  longDescription: "",
  price: "",
  compareAtPrice: "",
  stock: "0",
  weight: "",
  images: "",
  organic: false,
  handmade: false,
  local: true,
  vegan: false,
  shippingFree: false,
  shipsEurope: true,
  shipsWorldwide: false,
  sellerName: "",
  sellerEmail: "",
  sellerPhone: "",
  sellerWebsite: "",
};

// Razčleni tekst slik (en URL na vrstico ali ločen z vejico) v array
function parseImages(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * ProductFormDialog — forma za ustvarjanje/urejanje lastnikovega izdelka.
 * Lastnik NE more nastaviti: plan (deduce iz owner.plan), featured, verified.
 */
export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  onSaved,
}: ProductFormDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<ProductFormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isEdit = product !== null;

  // Nastavi formo ko se odpre ali ko se product spremeni
  useEffect(() => {
    if (open) {
      if (product) {
        setForm({
          name: product.name,
          category: product.category,
          destinationId: product.destinationId ?? "",
          description: product.description,
          longDescription: product.longDescription ?? "",
          price: String(product.price ?? ""),
          compareAtPrice: product.compareAtPrice
            ? String(product.compareAtPrice)
            : "",
          stock: String(product.stock ?? 0),
          weight: product.weight ? String(product.weight) : "",
          images: (product.images ?? []).join("\n"),
          organic: product.organic,
          handmade: product.handmade,
          local: product.local,
          vegan: product.vegan,
          shippingFree: product.shippingFree,
          shipsEurope: product.shipsEurope,
          shipsWorldwide: product.shipsWorldwide,
          sellerName: product.sellerName,
          sellerEmail: product.sellerEmail ?? "",
          sellerPhone: product.sellerPhone ?? "",
          sellerWebsite: product.sellerWebsite ?? "",
        });
      } else {
        setForm(EMPTY_FORM);
      }
      setErrorMsg(null);
    }
  }, [open, product]);

  const update = <K extends keyof ProductFormData>(
    key: K,
    value: ProductFormData[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);

    // Validacija
    if (form.name.trim().length < 2) {
      setErrorMsg("Ime izdelka je obvezno (vsaj 2 znaka).");
      return;
    }
    if (form.description.trim().length < 10) {
      setErrorMsg("Kratki opis mora imeti vsaj 10 znakov.");
      return;
    }
    if (form.description.trim().length > 120) {
      setErrorMsg("Kratki opis je omejen na 120 znakov.");
      return;
    }
    if (!form.sellerName.trim()) {
      setErrorMsg("Ime prodajalca je obvezno.");
      return;
    }
    const priceNum = parseFloat(form.price);
    if (isNaN(priceNum) || priceNum < 0) {
      setErrorMsg("Cena mora biti veljavno pozitivno število.");
      return;
    }

    setLoading(true);
    try {
      const images = parseImages(form.images);
      const payload = {
        name: form.name.trim(),
        category: form.category,
        destinationId: form.destinationId || null,
        description: form.description.trim(),
        longDescription: form.longDescription.trim() || null,
        price: priceNum,
        compareAtPrice: form.compareAtPrice
          ? parseFloat(form.compareAtPrice)
          : null,
        stock: parseInt(form.stock, 10) || 0,
        weight: form.weight ? parseFloat(form.weight) : null,
        images,
        organic: form.organic,
        handmade: form.handmade,
        local: form.local,
        vegan: form.vegan,
        shippingFree: form.shippingFree,
        shipsEurope: form.shipsEurope,
        shipsWorldwide: form.shipsWorldwide,
        sellerName: form.sellerName.trim(),
        sellerEmail: form.sellerEmail.trim() || null,
        sellerPhone: form.sellerPhone.trim() || null,
        sellerWebsite: form.sellerWebsite.trim() || null,
      };

      const url = isEdit
        ? `/api/owner/products/${product!.id}`
        : "/api/owner/products";
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
        title: isEdit ? "Izdelek posodobljen!" : "Izdelek ustvarjen!",
        description: isEdit
          ? "Spremembe so shranjene."
          : "Vaš novi izdelek je dodan v tržnico.",
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
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Uredi izdelek" : "Dodaj nov izdelek"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Posodobite podatke svojega izdelka."
              : "Izpolnite podatke o svojem izdelku. Paket (free/premium/enterprise) se določi samodejno glede na vašo naročnino."}
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
          <Info
            className="size-4 mt-0.5 text-primary shrink-0"
            aria-hidden="true"
          />
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
              <Label htmlFor="pf-name">
                Ime izdelka <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pf-name"
                placeholder="npr. Bohinjski sir iz kobile"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pf-category">
                Kategorija <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  update("category", v as ProductCategory)
                }
                disabled={loading}
              >
                <SelectTrigger id="pf-category" className="w-full">
                  <SelectValue placeholder="Izberite kategorijo" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRODUCT_CATEGORY_LABELS) as ProductCategory[]).map(
                    (cat) => (
                      <SelectItem key={cat} value={cat}>
                        {PRODUCT_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Destinacija */}
          <div className="space-y-2">
            <Label htmlFor="pf-destination">Destinacija</Label>
            <Select
              value={form.destinationId || "none"}
              onValueChange={(v) =>
                update("destinationId", v === "none" ? "" : v)
              }
              disabled={loading}
            >
              <SelectTrigger id="pf-destination" className="w-full">
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

          {/* Kratek opis */}
          <div className="space-y-2">
            <Label htmlFor="pf-description">
              Kratki opis <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pf-description"
              placeholder="En stavek, ki opisuje vaš izdelek..."
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              disabled={loading}
              required
              minLength={10}
              maxLength={120}
            />
            <p className="text-xs text-muted-foreground">
              {form.description.length} / 120 znakov
            </p>
          </div>

          {/* Dolgi opis */}
          <div className="space-y-2">
            <Label htmlFor="pf-longDescription">Dolgi opis</Label>
            <Textarea
              id="pf-longDescription"
              rows={4}
              placeholder="Podroben opis — kaj je, kako je narejen, od kod prihaja..."
              value={form.longDescription}
              onChange={(e) => update("longDescription", e.target.value)}
              disabled={loading}
              className="resize-y"
            />
          </div>

          {/* Cena + primerjalna + zaloga + teža */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pf-price">
                Cena (EUR) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pf-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="12.90"
                value={form.price}
                onChange={(e) => update("price", e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pf-compareAtPrice">
                Primerjalna cena (EUR)
              </Label>
              <Input
                id="pf-compareAtPrice"
                type="number"
                step="0.01"
                min="0"
                placeholder="15.90"
                value={form.compareAtPrice}
                onChange={(e) => update("compareAtPrice", e.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Višja originalna cena za prikaz popusta.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pf-stock">Zaloga</Label>
              <Input
                id="pf-stock"
                type="number"
                step="1"
                min="0"
                placeholder="0"
                value={form.stock}
                onChange={(e) => update("stock", e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pf-weight">Teža (g)</Label>
              <Input
                id="pf-weight"
                type="number"
                step="1"
                min="0"
                placeholder="500"
                value={form.weight}
                onChange={(e) => update("weight", e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Slike */}
          <div className="space-y-2">
            <Label htmlFor="pf-images">Slike (URL-ji)</Label>
            <Textarea
              id="pf-images"
              rows={3}
              placeholder={"https://example.com/slika1.jpg\nhttps://example.com/slika2.jpg"}
              value={form.images}
              onChange={(e) => update("images", e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              En URL na vrstico ali ločeno z vejico.
            </p>
          </div>

          {/* Atributi (Switch) */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Atributi izdelka</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <SwitchRow
                id="pf-organic"
                label="Ekološko (Organic)"
                description="Certificiran ekološki izdelek."
                checked={form.organic}
                onCheckedChange={(v) => update("organic", v)}
                disabled={loading}
              />
              <SwitchRow
                id="pf-handmade"
                label="Ročno delo (Handmade)"
                description="Izdelek je izdelan ročno."
                checked={form.handmade}
                onCheckedChange={(v) => update("handmade", v)}
                disabled={loading}
              />
              <SwitchRow
                id="pf-local"
                label="Lokalno (Local)"
                description="Lokalno pridelan izdelek."
                checked={form.local}
                onCheckedChange={(v) => update("local", v)}
                disabled={loading}
              />
              <SwitchRow
                id="pf-vegan"
                label="Vegansko (Vegan)"
                description="Brez živalskih sestavin."
                checked={form.vegan}
                onCheckedChange={(v) => update("vegan", v)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Dostava */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Možnosti dostave</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <SwitchRow
                id="pf-shippingFree"
                label="Brezplačna dostava"
                checked={form.shippingFree}
                onCheckedChange={(v) => update("shippingFree", v)}
                disabled={loading}
              />
              <SwitchRow
                id="pf-shipsEurope"
                label="Dostava EU"
                checked={form.shipsEurope}
                onCheckedChange={(v) => update("shipsEurope", v)}
                disabled={loading}
              />
              <SwitchRow
                id="pf-shipsWorldwide"
                label="Dostava svet"
                checked={form.shipsWorldwide}
                onCheckedChange={(v) => update("shipsWorldwide", v)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Prodajalec */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">
              Podatki o prodajalcu
            </Label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pf-sellerName">
                  Ime prodajalca <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="pf-sellerName"
                  placeholder="Kmetija Pri Petru"
                  value={form.sellerName}
                  onChange={(e) => update("sellerName", e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-sellerEmail">E-pošta</Label>
                <Input
                  id="pf-sellerEmail"
                  type="email"
                  placeholder="info@kmetija.si"
                  value={form.sellerEmail}
                  onChange={(e) => update("sellerEmail", e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-sellerPhone">Telefon</Label>
                <Input
                  id="pf-sellerPhone"
                  type="tel"
                  placeholder="+386 41 234 567"
                  value={form.sellerPhone}
                  onChange={(e) => update("sellerPhone", e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pf-sellerWebsite">Spletna stran</Label>
                <Input
                  id="pf-sellerWebsite"
                  type="url"
                  placeholder="https://www.kmetija.si"
                  value={form.sellerWebsite}
                  onChange={(e) => update("sellerWebsite", e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
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
                  {isEdit ? "Shrani spremembe" : "Ustvari izdelek"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* Pomožna komponenta za vrstico s Switchom */
function SwitchRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer text-sm">
          {label}
        </Label>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}
