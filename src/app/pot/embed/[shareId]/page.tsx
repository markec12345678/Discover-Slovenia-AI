import type { Metadata } from "next";
import { getSharedItinerary } from "../../shared-trip-screen";
import { SharedTripScreen } from "../../shared-trip-screen";

// D7 (1.140.0, Issue #15 benchmark dodatek D/7): BLOG-EMBED DELJENE POTE —
// /pot/embed/[shareId] je pot, NAMENJENA vdelavi v iframe na tujih straneh
// (WordPress „Po meri HTML“ blok / vsak HTML vir; Roam Aroundov vzorec).
//
// Isto varnostno jedro kot polna stran (skupni SharedTripScreen: SHARE_ID_RE
// vrata, isPublic + resolveTripRole → 404 za zasebne pote) — razlika je
// SAMO v izrisu: brez lupine (Navigation/Footer), brez skupnostnih in
// pooblaščenih urejalnih ploskev (glej shared-trip-screen.tsx + komentar
// v next.config.ts za klikjacking analizo) + atribucijski pas na dnu.
//
// Glave: next.config.ts pravilo /pot/embed/:path* nadomesti CSP
// (frame-ancestors *) in XFO (ALLOWALL) — vdelava deluje SAMO na tej poti,
// vsa ostala površina ostaja XFO DENY + frame-ancestors 'none'.

export const dynamic = "force-dynamic";

interface EmbedPageProps {
  params: Promise<{ shareId: string }>;
}

export async function generateMetadata({
  params,
}: EmbedPageProps): Promise<Metadata> {
  const { shareId } = await params;
  const saved = await getSharedItinerary(shareId);

  if (!saved) {
    return {
      title: "Itinerer ne obstaja",
      robots: { index: false, follow: false },
    };
  }

  return {
    // Embed iframe nima vidnega naslova — metadata je le za deljilne kartice
    // ob neposrednem obisku (blogger debug); template v layoutu sam pripne
    // " | Discover Slovenia AI".
    title: saved.name || "AI načrt potovanja",
    robots: {
      // Embed pote NIKOLI ni samostojna indeksna enota: X-Robots-Tag
      // (pravilo /pot/:path* v next.config.ts) + meta robots + canonical
      // na polno stran — iskalniku vedno povemo, kje je pravi vir.
      index: false,
      follow: false,
    },
    alternates: {
      canonical: `/pot/${shareId}`,
    },
  };
}

export default async function EmbedTripPage({ params }: EmbedPageProps) {
  const { shareId } = await params;
  return <SharedTripScreen shareId={shareId} embed />;
}
