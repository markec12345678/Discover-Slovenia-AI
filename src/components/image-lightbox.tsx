"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * ImageLightbox — celozaslonska galerija (FW2-B).
 *
 * Skupna komponenta za experience-modal in product-modal: klik na glavno
 * sliko odpre fullscreen pogled s puščicami, tipkovnico (←/→/Esc), števcem
 * "3 / 8" in trakom thumbnailov na dnu.
 *
 * Indeksi: `images` je SUROVA tabela (lahko vsebuje prazne vnose — placeholder
 * slike se preskočijo), `activeIndex`/`onActiveIndexChange` pa se nanašata
 * NA SUROVO tabelo, da modal in lightbox ostaneja sinhronizirana (po zaprtju
 * lightboxa modal pokaže zadnjo gledano sliko).
 */
export interface ImageLightboxProps {
  /** Surovi seznam URL-jev (prazni/null vnosi se preskočijo). */
  images: string[];
  /** Trenutni indeks v surovi tabeli (-1 oz. neveljaven → prva veljavna). */
  activeIndex: number;
  /** Sinhronizacija izbire nazaj v modal (surovi indeks). */
  onActiveIndexChange: (index: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Predpona za alt nize, npr. ime izkušnje. */
  altPrefix: string;
}

interface ValidImage {
  src: string;
  rawIndex: number;
}

export function ImageLightbox({
  images,
  activeIndex,
  onActiveIndexChange,
  open,
  onOpenChange,
  altPrefix,
}: ImageLightboxProps) {
  // Veljavne slike + njihovi surovi indeksi (preskoči placeholder vnose)
  const valid: ValidImage[] = useMemo(
    () =>
      images
        .map((src, rawIndex) => ({ src, rawIndex }))
        .filter((v) => typeof v.src === "string" && v.src.trim().length > 0),
    [images]
  );

  // Položaj znotraj veljavnih slik (wrap-around pri puščicah)
  const pos = useMemo(() => {
    const found = valid.findIndex((v) => v.rawIndex === activeIndex);
    return found >= 0 ? found : 0;
  }, [valid, activeIndex]);

  const current = valid[pos];

  const go = useCallback(
    (delta: number) => {
      if (valid.length === 0) return;
      const next = (pos + delta + valid.length) % valid.length;
      onActiveIndexChange(valid[next].rawIndex);
    },
    [valid, pos, onActiveIndexChange]
  );

  // Tipkovnica: ←/→ listanje (Esc obravnava Radix Dialog sam)
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, go]);

  // Stanje nalaganja IZPELJANO iz src: onLoad/onError zabeležita, katera slika je
  // naložena. Predpomnjene slike prav tako sprožijo onload (React priklopi
  // handler v istem commitu kot src). Menjava slike → loaded false do dogodka.
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const loaded = loadedSrc === current.src;

  // Brez veljavnih slik lightbox nima kaj pokazati — ne montažiraj ga.
  if (valid.length === 0 || !current) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent
        showCloseButton
        // Fullscreen: prepiši centriran/omejen default DialogContenta
        // (left/top/translate/max-w prireže twMerge v cn()).
        className="left-0 top-0 h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-none bg-black/95 p-0 sm:max-w-none"
        aria-describedby="image-lightbox-desc"
      >
        <DialogTitle className="sr-only">
          {altPrefix} — galerija ({valid.length}{" "}
          {valid.length === 1 ? "slika" : valid.length < 5 ? "slike" : "slik"})
        </DialogTitle>
        <DialogDescription id="image-lightbox-desc" className="sr-only">
          Celozaslonski ogled slik. Navigacija s puščicami ali tipkami levo in
          desno, zapiranje z tipko Esc.
        </DialogDescription>

        <div className="flex h-full w-full flex-col">
          {/* Glavna slika */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center p-4 pb-2 sm:p-6">
            {/* Puščici (≥44px dotik) — vidni le, ko je več kot ena slika */}
            {valid.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Prejšnja slika"
                  className="absolute left-2 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none sm:left-4"
                >
                  <ChevronLeft className="size-6" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Naslednja slika"
                  className="absolute right-2 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none sm:right-4"
                >
                  <ChevronRight className="size-6" aria-hidden="true" />
                </button>
              </>
            ) : null}

            {/*
              key po src prisili remount ob menjavi slike → pravilen reset
              nalagalnega stanja. Alt ohranja dostopnost iz modalov.
            */}
            <img
              key={current.src}
              src={current.src}
              alt={`${altPrefix} — slika ${pos + 1} od ${valid.length}`}
              onLoad={() => setLoadedSrc(current.src)}
              onError={() => setLoadedSrc(current.src)}
              draggable={false}
              className={cn(
                "max-h-full max-w-full select-none object-contain transition-opacity duration-300",
                loaded ? "opacity-100" : "opacity-0"
              )}
            />
          </div>

          {/* Števec + thumbnail trak */}
          <div className="shrink-0 px-4 pb-4 sm:px-6 sm:pb-5">
            {valid.length > 1 ? (
              <p
                className="mb-2 text-center text-xs font-medium tabular-nums text-white/70"
                aria-live="polite"
              >
                {pos + 1} / {valid.length}
              </p>
            ) : null}
            <div
              className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
              role="group"
              aria-label="Sličice galerije"
            >
              {valid.map((v, i) => (
                <button
                  key={v.rawIndex}
                  type="button"
                  onClick={() => onActiveIndexChange(v.rawIndex)}
                  aria-label={`Prikaži sliko ${i + 1}`}
                  aria-pressed={i === pos}
                  className={cn(
                    "relative size-16 shrink-0 overflow-hidden rounded-md border-2 transition-all",
                    i === pos
                      ? "border-primary ring-2 ring-primary/40"
                      : "border-transparent opacity-60 hover:opacity-100"
                  )}
                >
                  {/* Alt prazen — gumb ima svoj aria-label */}
                  <img
                    src={v.src}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
