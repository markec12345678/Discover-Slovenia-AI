"use client";

import { useEffect, useState } from "react";

// ============================================================================
// PRINT QR — QR koda deljive povezave, vidna SAMO ob tiskanju (/pot/[shareId])
// ============================================================================
// Popotniki načrt tiskajo ali shranjujejo kot PDF (gumb „Natisni“); QR na
// papirju vodi nazaj na ŽIVO stran z zemljevidom, glasovanjem skupine in
// komentarji. UI za deljenje ima razred print-hide (ne natisne se), zato je
// ta blok edini nosilec QR-ja v PDF izhodu.
//
// Invarianti:
//  - generacija je CLIENT-SIDE (useEffect + dinamičen import `qrcode`) —
//    prvi render je na strežniku in klientu identičen (brez slike) → ni
//    hydration mismatch;
//  - QR kodira IZVORNO (window.location.origin) povezavo te strani — vedno
//    vodi nazaj na točno to stran, ne na domeno iz konstante (iskrenost:
//    potnik skenira natanko to, kar vidi naslovljeno);
//  - ob napaki generacije blok ostane skrit (eno console.warn) — tiskanje
//    in deljenje nikoli nista ogrožena;
//  - element je aria-hidden: na zaslonu ni viden, v PDF pa je čisto
//    navodilo „skeniraj“, ne bralnik-relevantna vsebina.
// ============================================================================

/** Barva QR modulov — Triglav zelena (primarna barva; dovolj temna za scan). */
const QR_DARK = "#2d6a3e";

interface PrintQrProps {
  shareId: string;
}

interface GeneratedQr {
  /** Kodirani URL (za izpis pod QR-jem — enak tistemu, ki ga koda nosi). */
  url: string;
  /** PNG data URL (220 px — v tisku prikazan ~1,15 in / ~2,9 cm). */
  png: string;
}

export function PrintQr({ shareId }: PrintQrProps) {
  const [qr, setQr] = useState<GeneratedQr | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = `${window.location.origin}/pot/${shareId}`;
        // Dinamičen import: qrcode pride v bundle šele na strani /pot/*
        const QRCode = await import("qrcode");
        const png = await QRCode.toDataURL(url, {
          margin: 1,
          width: 220,
          color: { dark: QR_DARK, light: "#ffffff" },
        });
        if (!cancelled) setQr({ url, png });
      } catch (err) {
        console.warn("[pot] QR generacija ni uspela:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  if (!qr) return null;

  return (
    <div
      className="mt-6 hidden items-center justify-center gap-4 border-t border-border pt-3 print:flex"
      aria-hidden="true"
    >
      {/* Namensko brez alt besedila: dekorativna koda ob tiskanju;
          besedilo zraven nosi pomen za vse (tudi bralnike na zaslonu). */}
      <img
        src={qr.png}
        alt=""
        width={110}
        height={110}
        className="rounded-md border border-border bg-white"
      />
      <div className="text-left">
        <p className="text-xs font-semibold">Skeniraj za odpiranje na telefonu</p>
        <p className="text-[11px] text-muted-foreground">{qr.url}</p>
      </div>
    </div>
  );
}
