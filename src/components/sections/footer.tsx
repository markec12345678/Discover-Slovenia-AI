import Link from "next/link";
import { Mountain } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * Footer — server component.
 * 4-kolončni layout (1/2/4 responsive), levo brand + social, nato destinacije,
 * podpora in pravno. Spodaj copyright + affiliate disclaimer.
 *
 * FW4.3: vsi teksti (kolone, linki, brand, copyright) so v sporočilih
 * (`footer` namespace) — sl.json vsebuje izvirne slovenske vrednosti,
 * en.json angleške prevode. Povezave (href) ostajajo skupne.
 */
export async function Footer() {
  const t = await getTranslations("footer");

  return (
    <footer
      className="mt-auto w-full border-t border-border bg-muted/30"
      aria-label={t("ariaLabel")}
    >
      {/* pb-40 (mobilno): vsebina noge vidna nad sticky CTA (~65px + safe-area) IN nad dvignjenim chat FAB (~140px od dna); sm:pb-24: tudi na desktopu disclaimer počisti FAB (top ~80px od dna); lg:pt-12 ohrani zgornji odmik */}
      <div className="mx-auto w-full max-w-7xl px-4 pb-40 pt-10 sm:px-6 sm:pb-24 lg:px-8 lg:pt-12 lg:pb-24">
        {/* 5 kolon (brand + 4 navigacijske); mobilno: krajši odmiki + linki v 2 stolpcih (Airbnb vzorec — prepolovljena dolžina noge) */}
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-10 lg:grid-cols-5">
          {/* 1. Brand */}
          <div className="flex flex-col gap-4">
            <Link
              href="#vrh"
              className="flex items-center gap-2 text-foreground transition-colors hover:text-primary"
              aria-label={t("brandAriaLabel")}
            >
              <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
                <Mountain className="size-5" aria-hidden="true" />
              </span>
              <span className="text-base font-bold tracking-tight">
                {t("brandName")}
              </span>
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              {t("brandDescription")}
            </p>
          </div>

          {/* 2. Razišči (FW3: prave strani namesto hash anchorjev) */}
          <FooterColumn
            titleKey="exploreColumn"
            links={[
              { href: "/destinacije", key: "exploreAllDestinations" },
              { href: "/dozivetja", key: "exploreExperiences" },
              { href: "/zemljevid", key: "exploreMap" },
              { href: "/dogodki", key: "exploreEvents" },
              { href: "/lokali", key: "exploreLocal" },
              { href: "/trznica", key: "exploreMarket" },
              { href: "/vodici", key: "exploreGuides" },
              { href: "/slovenia-pass", key: "explorePass" },
            ]}
          />

          {/* 3. Načrtuj + račun */}
          <FooterColumn
            titleKey="planColumn"
            links={[
              { href: "/nacrtuj", key: "planPlanner" },
              { href: "/nacrtuj#kviz", key: "planQuiz" },
              { href: "/#rezerviraj", key: "planBookings" },
              // P1-2b: B2C računi popotnikov
              { href: "/moja-potovanja", key: "planMyTrips" },
              { href: "/prijava", key: "planLogin" },
            ]}
          />

          {/* 4. Za ponudnike (P4-5: javni lijak — prej orphan stran) */}
          <FooterColumn
            titleKey="providersColumn"
            links={[
              { href: "/za-ponudnike", key: "providersBecomePartner" },
              { href: "/owner/prijava", key: "providersLogin" },
              { href: "/za-ponudnike#pridruzi-se", key: "providersPricing" },
              { href: "/za-ponudnike#pridruzi-se", key: "providersSignup" },
            ]}
          />

          {/* 4. Pravno */}
          <FooterColumn
            titleKey="legalColumn"
            links={[
              { href: "/zaupanje-in-varnost", key: "legalTrust" },
              { href: "/politika-zasebnosti", key: "legalPrivacy" },
              { href: "/pogoji-uporabe", key: "legalTerms" },
              { href: "/kontakt", key: "legalContact" },
            ]}
          />
        </div>

        {/* Spodnja vrstica: gradient ločnik + copyright + disclaimer */}
        <div className="gradient-hairline mt-10" aria-hidden="true" />
        <div className="mt-6 flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>
                {t("copyright")} {t("tagline")}
              </span>
            </p>
          </div>
          <p className="max-w-md text-xs text-muted-foreground/80 sm:text-right">
            {t("affiliateDisclaimer")}
          </p>
        </div>
      </div>
    </footer>
  );
}

/**
 * Naslov + seznam povezav v eni koloni footera.
 * FW4.3: naslov in povezave se prevajata prek `footer` sporočil —
 * podamo TIPKE (titleKey / link.key), komponenta pa si prevode pridobi
 * sama (server component → getTranslations).
 */
async function FooterColumn({
  titleKey,
  links,
}: {
  titleKey: string;
  links: { href: string; key: string }[];
}) {
  const t = await getTranslations("footer");
  return (
    <nav className="flex flex-col gap-3" aria-label={t(titleKey)}>
      {/* VLM revizija: naslovi kolon morajo biti ločeni od linkov (hierarhija) */}
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/70">
        {t(titleKey)}
      </h3>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:flex sm:flex-col sm:gap-2">
        {links.map((link) => (
          // key vključuje href+key: dve povezavi se lahko nanašata na isti
          // href (npr. "Paketi in cene" in "Prijavnica" obe → #pridruzi-se)
          <li key={`${link.href}-${link.key}`}>
            <Link
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              {t(link.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default Footer;
