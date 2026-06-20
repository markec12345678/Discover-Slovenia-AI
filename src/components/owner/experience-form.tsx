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
  EXPERIENCE_CATEGORY_LABELS,
  LANGUAGE_LABELS,
  type Experience,
  type ExperienceCategory,
} from "@/lib/marketplace-types";

export interface ExperienceFormData {
  name: string;
  category: ExperienceCategory;
  destinationId: string;
  description: string;
  longDescription: string;
  pricePerPerson: string;
  durationHours: string;
  minGroupSize: string;
  maxGroupSize: string;
  languages: string;
  meetingPoint: string;
  address: string;
  images: string;
  familyFriendly: boolean;
  accessibility: boolean;
  providerName: string;
  providerEmail: string;
  providerPhone: string;
  providerWebsite: string;
}

interface ExperienceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  experience: Experience | null; // null = nova izkušnja
  onSaved: () => void;
}

const EMPTY_FORM: ExperienceFormData = {
  name: "",
  category: "tour",
  destinationId: "",
  description: "",
  longDescription: "",
  pricePerPerson: "",
  durationHours: "2",
  minGroupSize: "1",
  maxGroupSize: "10",
  languages: "sl, en",
  meetingPoint: "",
  address: "",
  images: "",
  familyFriendly: false,
  accessibility: false,
  providerName: "",
  providerEmail: "",
  providerPhone: "",
  providerWebsite: "",
};

// Razčleni tekst jezikov ("sl, en, de") v array ["sl","en","de"]
function parseLanguages(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

// Razčleni tekst slik (en URL na vrstico ali ločen z vejico) v array
function parseImages(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * ExperienceFormDialog — forma za ustvarjanje/urejanje lastnikove izkušnje.
 * Lastnik NE more nastaviti: plan (deduce iz owner.plan), featured, verified.
 */
export function ExperienceFormDialog({
  open,
  onOpenChange,
  experience,
  onSaved,
}: ExperienceFormDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<ExperienceFormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isEdit = experience !== null;

  // Nastavi formo ko se odpre ali ko se experience spremeni
  useEffect(() => {
    if (open) {
      if (experience) {
        setForm({
          name: experience.name,
          category: experience.category,
          destinationId: experience.destinationId ?? "",
          description: experience.description,
          longDescription: experience.longDescription ?? "",
          pricePerPerson: String(experience.pricePerPerson ?? ""),
          durationHours: String(experience.durationHours ?? "2"),
          minGroupSize: String(experience.minGroupSize ?? 1),
          maxGroupSize: String(experience.maxGroupSize ?? 10),
          languages: (experience.languages ?? ["sl"]).join(", "),
          meetingPoint: experience.meetingPoint ?? "",
          address: experience.address,
          images: (experience.images ?? []).join("\n"),
          familyFriendly: experience.familyFriendly,
          accessibility: experience.accessibility,
          providerName: experience.providerName,
          providerEmail: experience.providerEmail ?? "",
          providerPhone: experience.providerPhone ?? "",
          providerWebsite: experience.providerWebsite ?? "",
        });
      } else {
        setForm(EMPTY_FORM);
      }
      setErrorMsg(null);
    }
  }, [open, experience]);

  const update = <K extends keyof ExperienceFormData>(
    key: K,
    value: ExperienceFormData[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);

    // Validacija
    if (form.name.trim().length < 2) {
      setErrorMsg("Ime izkušnje je obvezno (vsaj 2 znaka).");
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
    if (!form.address.trim()) {
      setErrorMsg("Naslov je obvezen.");
      return;
    }
    if (!form.providerName.trim()) {
      setErrorMsg("Ime ponudnika je obvezno.");
      return;
    }
    const priceNum = parseFloat(form.pricePerPerson);
    if (isNaN(priceNum) || priceNum < 0) {
      setErrorMsg("Cena na osebo mora biti veljavno pozitivno število.");
      return;
    }
    const durationNum = parseFloat(form.durationHours);
    if (isNaN(durationNum) || durationNum < 0.5) {
      setErrorMsg("Trajanje mora biti vsaj 0.5 ure.");
      return;
    }
    const minNum = parseInt(form.minGroupSize, 10);
    const maxNum = parseInt(form.maxGroupSize, 10);
    if (isNaN(minNum) || minNum < 1) {
      setErrorMsg("Minimalna skupina mora biti vsaj 1.");
      return;
    }
    if (isNaN(maxNum) || maxNum < minNum) {
      setErrorMsg("Maksimalna skupina ne sme biti manjša od minimalne.");
      return;
    }

    setLoading(true);
    try {
      const images = parseImages(form.images);
      const languages = parseLanguages(form.languages);
      if (languages.length === 0) {
        setErrorMsg("Določite vsaj en jezik (npr. sl, en).");
        setLoading(false);
        return;
      }
      const payload = {
        name: form.name.trim(),
        category: form.category,
        destinationId: form.destinationId || null,
        description: form.description.trim(),
        longDescription: form.longDescription.trim() || null,
        pricePerPerson: priceNum,
        durationHours: durationNum,
        minGroupSize: minNum,
        maxGroupSize: maxNum,
        languages,
        meetingPoint: form.meetingPoint.trim() || null,
        address: form.address.trim(),
        images,
        familyFriendly: form.familyFriendly,
        accessibility: form.accessibility,
        providerName: form.providerName.trim(),
        providerEmail: form.providerEmail.trim() || null,
        providerPhone: form.providerPhone.trim() || null,
        providerWebsite: form.providerWebsite.trim() || null,
      };

      const url = isEdit
        ? `/api/owner/experiences/${experience!.id}`
        : "/api/owner/experiences";
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
        title: isEdit ? "Izkušnja posodobljena!" : "Izkušnja ustvarjena!",
        description: isEdit
          ? "Spremembe so shranjene."
          : "Vaša nova izkušnja je dodana v tržnico.",
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
            {isEdit ? "Uredi izkušnjo" : "Dodaj novo izkušnjo"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Posodobite podatke svoje izkušnje."
              : "Izpolnite podatke o svoji izkušnji. Paket (free/premium/enterprise) se določi samodejno glede na vašo naročnino."}
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
              <Label htmlFor="ef-name">
                Ime izkušnje <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ef-name"
                placeholder="npr. Voden ogled Blejskega otoka s pletno"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ef-category">
                Kategorija <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  update("category", v as ExperienceCategory)
                }
                disabled={loading}
              >
                <SelectTrigger id="ef-category" className="w-full">
                  <SelectValue placeholder="Izberite kategorijo" />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(
                      EXPERIENCE_CATEGORY_LABELS
                    ) as ExperienceCategory[]
                  ).map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {EXPERIENCE_CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Destinacija */}
          <div className="space-y-2">
            <Label htmlFor="ef-destination">Destinacija</Label>
            <Select
              value={form.destinationId || "none"}
              onValueChange={(v) =>
                update("destinationId", v === "none" ? "" : v)
              }
              disabled={loading}
            >
              <SelectTrigger id="ef-destination" className="w-full">
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
            <Label htmlFor="ef-description">
              Kratki opis <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ef-description"
              placeholder="En stavek, ki opisuje vašo izkušnjo..."
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
            <Label htmlFor="ef-longDescription">Dolgi opis</Label>
            <Textarea
              id="ef-longDescription"
              rows={4}
              placeholder="Podroben opis — kaj boste počeli, kaj boste videli..."
              value={form.longDescription}
              onChange={(e) => update("longDescription", e.target.value)}
              disabled={loading}
              className="resize-y"
            />
          </div>

          {/* Cena + trajanje */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ef-price">
                Cena na osebo (EUR) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ef-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="35.00"
                value={form.pricePerPerson}
                onChange={(e) => update("pricePerPerson", e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ef-duration">
                Trajanje (ure) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ef-duration"
                type="number"
                step="0.5"
                min="0.5"
                placeholder="2.5"
                value={form.durationHours}
                onChange={(e) => update("durationHours", e.target.value)}
                disabled={loading}
                required
              />
              <p className="text-xs text-muted-foreground">
                Npr. 1.5 za 90 minut, 2 za 2 uri, 24 za en dan.
              </p>
            </div>
          </div>

          {/* Skupina */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ef-minGroup">Min. skupina</Label>
              <Input
                id="ef-minGroup"
                type="number"
                step="1"
                min="1"
                placeholder="1"
                value={form.minGroupSize}
                onChange={(e) => update("minGroupSize", e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ef-maxGroup">Max. skupina</Label>
              <Input
                id="ef-maxGroup"
                type="number"
                step="1"
                min="1"
                placeholder="10"
                value={form.maxGroupSize}
                onChange={(e) => update("maxGroupSize", e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Jeziki */}
          <div className="space-y-2">
            <Label htmlFor="ef-languages">
              Jeziki <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="ef-languages"
              rows={2}
              placeholder="sl, en, de, it"
              value={form.languages}
              onChange={(e) => update("languages", e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Kode jezikov ločene z vejico. Podprte:{" "}
              {Object.entries(LANGUAGE_LABELS)
                .map(([code, name]) => `${code} (${name})`)
                .join(", ")}
              .
            </p>
          </div>

          {/* Meeting point + naslov */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ef-meetingPoint">Meeting point</Label>
              <Input
                id="ef-meetingPoint"
                placeholder="npr. Pred vhodom v blejski grad"
                value={form.meetingPoint}
                onChange={(e) => update("meetingPoint", e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ef-address">
                Naslov <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ef-address"
                placeholder="Cesta Svobode 18, 4260 Bled"
                value={form.address}
                onChange={(e) => update("address", e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          {/* Slike */}
          <div className="space-y-2">
            <Label htmlFor="ef-images">Slike (URL-ji)</Label>
            <Textarea
              id="ef-images"
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

          {/* Atributi */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Atributi izkušnje</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <SwitchRow
                id="ef-family"
                label="Družinsko prijazno"
                description="Primerno za otroke in družine."
                checked={form.familyFriendly}
                onCheckedChange={(v) => update("familyFriendly", v)}
                disabled={loading}
              />
              <SwitchRow
                id="ef-accessibility"
                label="Dostopno za invalide"
                description="Prilagojeno za osebe z oviranostjo."
                checked={form.accessibility}
                onCheckedChange={(v) => update("accessibility", v)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Ponudnik */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">
              Podatki o ponudniku
            </Label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="ef-providerName">
                  Ime ponudnika <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="ef-providerName"
                  placeholder="Bled Tours d.o.o."
                  value={form.providerName}
                  onChange={(e) => update("providerName", e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ef-providerEmail">E-pošta</Label>
                <Input
                  id="ef-providerEmail"
                  type="email"
                  placeholder="info@bled-tours.si"
                  value={form.providerEmail}
                  onChange={(e) => update("providerEmail", e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ef-providerPhone">Telefon</Label>
                <Input
                  id="ef-providerPhone"
                  type="tel"
                  placeholder="+386 41 234 567"
                  value={form.providerPhone}
                  onChange={(e) => update("providerPhone", e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="ef-providerWebsite">Spletna stran</Label>
                <Input
                  id="ef-providerWebsite"
                  type="url"
                  placeholder="https://www.bled-tours.si"
                  value={form.providerWebsite}
                  onChange={(e) => update("providerWebsite", e.target.value)}
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
                  {isEdit ? "Shrani spremembe" : "Ustvari izkušnjo"}
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
