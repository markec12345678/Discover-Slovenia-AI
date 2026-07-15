"use client";

import { useState } from "react";
import { QrCode, Download, Copy, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

// ============================================================================
// QR PARTNER CARD — generira QR kodo za lokal
// ============================================================================
//
// Partner dobi QR kodo ki jo postavi na:
// - mize v restavraciji
// - recepcijo hotela
// - sobe
// - degustacijske prostore
//
// Scan → odpri lokal na platformi → meni, rezervacija, zgodbe, izdelki
// ============================================================================

interface QRPartnerCardProps {
  listingId: string;
  listingName: string;
  listingSlug: string;
}

export function QRPartnerCard({ listingId, listingName, listingSlug }: QRPartnerCardProps) {
  const [copied, setCopied] = useState(false);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://discoverslovenia.ai";
  const listingUrl = `${baseUrl}/lokal/${listingSlug}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(listingUrl)}&color=2d6a3e&bgcolor=ffffff&margin=10`;

  const handleCopy = () => {
    navigator.clipboard.writeText(listingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    // Odpre QR v novem tabu za prenos
    window.open(qrUrl, "_blank");
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <QrCode className="size-4 text-primary" aria-hidden="true" />
          QR Partner Card
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* QR koda */}
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-xl border-2 border-primary/20 p-3 bg-white">
            <img
              src={qrUrl}
              alt={`QR koda za ${listingName}`}
              width={200}
              height={200}
              className="rounded-lg"
            />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">{listingName}</p>
            <p className="text-xs text-muted-foreground">Scan za AI vodič</p>
          </div>
        </div>

        {/* URL */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Povezava do profila:</label>
          <div className="flex gap-2">
            <Input
              value={listingUrl}
              readOnly
              className="text-xs"
              aria-label="URL profila"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopy}
              aria-label="Kopiraj URL"
            >
              {copied ? (
                <Check className="size-4 text-emerald-600" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>

        {/* Download */}
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={handleDownload}
        >
          <Download className="size-4" aria-hidden="true" />
          Prenesi QR kodo
        </Button>

        {/* Usage ideas */}
        <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Kje postaviti:</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>🍽️ Na mize v restavraciji</li>
            <li>🏨 Na recepciji hotela</li>
            <li>🛏️ V sobah za goste</li>
            <li>🍷 Ob degustacijah</li>
            <li>📍 Na vhodu lokalov</li>
          </ul>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 p-2.5">
          <Badge variant="secondary" className="text-[10px] gap-0.5">
            <QrCode className="size-2.5" aria-hidden="true" />
            Brezplačno
          </Badge>
          <p className="text-xs text-muted-foreground">
            Gost scan-a QR → vidi meni, rezervira, odkrije zgodbe
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
