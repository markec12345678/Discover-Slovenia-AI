"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * LegacyHashRedirect — FW3 varnostna mreža za podedovane hash povezave.
 *
 * Pred FW3 je homepage vseboval vse sekcije (ena velika stran), interne
 * povezave, e-poštni predlogi, chat odgovori in sitemap pa so se sklicevali
 * na hash anchorje (/#načrtuj, /#destinacije, …). Te sekcije zdaj živijo na
 * lastnih straneh — ta komponenta ti obiskovalce nežno preusmeri.
 *
 * Ohranja query parametre (npr. ?q= iz SearchAction JSON-LD) in deluje
 * tako ob mountu kot ob kasnejših hash spremembah (npr. klik starega
 * bookmarka medtem, ko je uporabnik že na homepageu).
 */
const HASH_ROUTES: Record<string, string> = {
  "#načrtuj": "/nacrtuj",
  "#kviz": "/nacrtuj",
  "#destinacije": "/destinacije",
  "#zbirke": "/destinacije",
  "#zemljevid": "/zemljevid",
  "#lokali": "/lokali",
  "#dogodki": "/dogodki",
  "#trznica": "/trznica",
  "#blog": "/vodici",
  "#vprasi-lokalca": "/vodici",
  "#pridruzi-se": "/za-ponudnike",
};

export function LegacyHashRedirect() {
  const router = useRouter();

  useEffect(() => {
    const redirect = () => {
      const raw = window.location.hash;
      if (!raw) return;
      // Brskalniki vrnejo hash v percent-encoded obliki (npr.
      // "#na%C4%8Drtuj") — dekodiraj pred primerjavo z mapo.
      let hash: string;
      try {
        hash = decodeURIComponent(raw).toLowerCase();
      } catch {
        hash = raw.toLowerCase();
      }
      const target = HASH_ROUTES[hash];
      if (!target) return;
      // Ohrani query parametre (npr. ?q=), zavrzi stari hash.
      const search = window.location.search || "";
      router.replace(`${target}${search}`);
    };

    redirect();
    window.addEventListener("hashchange", redirect);
    return () => window.removeEventListener("hashchange", redirect);
  }, [router]);

  // Namerno brez vizualnega izhoda — čisti preusmerjevalnik.
  return null;
}

export default LegacyHashRedirect;
