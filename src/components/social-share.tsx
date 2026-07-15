"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Share2,
  MessageCircle,
  Instagram,
  Facebook,
  Link2,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ============================================================================
// SOCIAL SHARING — deli AI plan na socialnih omrežjih
// ============================================================================
//
// Po AI planu:
// "Moj AI dan v Sloveniji 🇸🇮"
// 📍 Bela krajina · 🍷 hrana · 🌿 narava · ⭐ lokalni partnerji
//
// Share: WhatsApp · Instagram · Facebook · Copy link
// ============================================================================

interface SocialShareProps {
  title?: string;
  description?: string;
  destinations?: string[];
  className?: string;
  variant?: "button" | "inline";
}

const DEFAULT_TITLE = "Moj AI dan v Sloveniji 🇸🇮";

export function SocialShare({
  title = DEFAULT_TITLE,
  description,
  destinations = [],
  className,
  variant = "button",
}: SocialShareProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "https://discoverslovenia.ai";

  const shareText = useMemo(() => {
    const destText = destinations.length > 0
      ? destinations.map((d) => `📍 ${d}`).join(" · ")
      : "";
    return `${title}${destText ? `\n${destText}` : ""}${description ? `\n${description}` : ""}\n\nDiscover Slovenia AI — https://discoverslovenia.ai`;
  }, [title, description, destinations]);

  const shareToWhatsApp = useCallback(() => {
    const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank");
    setOpen(false);
  }, [shareText]);

  const shareToFacebook = useCallback(() => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "width=600,height=400");
    setOpen(false);
  }, [shareUrl, shareText]);

  const shareToInstagram = useCallback(() => {
    // Instagram ne podpira direct share URL — kopiraj besedilo
    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => {
      window.open("https://www.instagram.com", "_blank");
      setOpen(false);
      setCopied(false);
    }, 1000);
  }, [shareText]);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  // Native share API (mobile)
  const nativeShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: shareText,
          url: shareUrl,
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }, [title, shareText, shareUrl]);

  const handleShare = useCallback(async () => {
    const shared = await nativeShare();
    if (!shared) {
      setOpen(true);
    }
  }, [nativeShare]);

  if (variant === "inline") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="text-xs font-medium text-muted-foreground">Deli svoj plan:</span>
        <button
          type="button"
          onClick={shareToWhatsApp}
          className="flex size-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
          aria-label="Deli na WhatsApp"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={shareToFacebook}
          className="flex size-8 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors"
          aria-label="Deli na Facebook"
        >
          <Facebook className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={shareToInstagram}
          className="flex size-8 items-center justify-center rounded-full bg-pink-500/10 text-pink-600 hover:bg-pink-500/20 transition-colors"
          aria-label="Deli na Instagram"
        >
          <Instagram className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          aria-label="Kopiraj povezavo"
        >
          {copied ? <Check className="size-4 text-emerald-600" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}
        </button>
      </div>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn("gap-1.5", className)}
        onClick={handleShare}
      >
        <Share2 className="size-3.5" aria-hidden="true" />
        Deli
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="sr-only">Deli svoj AI plan</DialogTitle>
          <DialogDescription className="sr-only">
            Deli svoj AI načrt potovanja po Sloveniji na socialnih omrežjih
          </DialogDescription>

          <div className="p-2">
            {/* Preview */}
            <div className="mb-4 rounded-xl bg-gradient-to-br from-primary/5 to-transparent border border-primary/20 p-4">
              <p className="text-sm font-bold">{title}</p>
              {destinations.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {destinations.map((d) => `📍 ${d}`).join(" · ")}
                </p>
              )}
              {description && (
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{description}</p>
              )}
              <p className="mt-2 text-[10px] text-primary font-medium">
                Discover Slovenia AI 🇸🇮
              </p>
            </div>

            {/* Share options */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={shareToWhatsApp}
                className="flex items-center gap-2 rounded-xl border border-border/60 p-3 transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
              >
                <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500/10">
                  <MessageCircle className="size-5 text-emerald-600" aria-hidden="true" />
                </div>
                <span className="text-sm font-medium">WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={shareToFacebook}
                className="flex items-center gap-2 rounded-xl border border-border/60 p-3 transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/20"
              >
                <div className="flex size-10 items-center justify-center rounded-full bg-blue-500/10">
                  <Facebook className="size-5 text-blue-600" aria-hidden="true" />
                </div>
                <span className="text-sm font-medium">Facebook</span>
              </button>

              <button
                type="button"
                onClick={shareToInstagram}
                className="flex items-center gap-2 rounded-xl border border-border/60 p-3 transition-colors hover:bg-pink-50 dark:hover:bg-pink-950/20"
              >
                <div className="flex size-10 items-center justify-center rounded-full bg-pink-500/10">
                  <Instagram className="size-5 text-pink-600" aria-hidden="true" />
                </div>
                <span className="text-sm font-medium">Instagram</span>
              </button>

              <button
                type="button"
                onClick={copyLink}
                className="flex items-center gap-2 rounded-xl border border-border/60 p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                  {copied ? (
                    <Check className="size-5 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Link2 className="size-5 text-muted-foreground" aria-hidden="true" />
                  )}
                </div>
                <span className="text-sm font-medium">
                  {copied ? "Kopirano!" : "Kopiraj link"}
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Zapri
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
