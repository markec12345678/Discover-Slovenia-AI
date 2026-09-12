import Link from "next/link";
import { Mountain } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * Footer — server component.
 * 4-kolončni layout (1/2/4 responsive), levo brand + social, nato destinacije,
 * podpora in pravno. Spodaj copyright + affiliate disclaimer.
 *
 * Tagline in affiliate disclaimer sta lokalizirana preko next-intl
 * `getTranslations("footer")`. Ostali teksti ostajajo v slovenščini
 * (bodo postopoma prevedeni).
 */
export async function Footer() {
  const t = await getTranslations("footer");

  return (
    <footer
      className="mt-auto w-full border-t border-border bg-muted/30"
      aria-label="Noga strani"
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
              aria-label="Discover Slovenia AI — domov"
            >
              <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
                <Mountain className="size-5" aria-hidden="true" />
              </span>
              <span className="text-base font-bold tracking-tight">
                Discover Slovenia AI
              </span>
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              AI-poganjan načrtovalec potovanj za Slovenijo. Odkrijte 22
              najlepših destinacij — od Blejskega jezera do jadranske obale.
            </p>
          </div>

          {/* 2. Razišči (FW3: prave strani namesto hash anchorjev) */}
          <FooterColumn
            title="Razišči"
            links={[
              { href: "/destinacije", label: "Vse destinacije" },
              { href: "/dozivetja", label: "Doživetja" },
              { href: "/zemljevid", label: "Zemljevid" },
              { href: "/dogodki", label: "Dogodki" },
              { href: "/lokali", label: "Lokalni ponudniki" },
              { href: "/trznica", label: "Tržnica" },
              { href: "/vodici", label: "Vodiči" },
              { href: "/slovenia-pass", label: "Slovenia Pass" },
            ]}
          />

          {/* 3. Načrtuj + račun */}
          <FooterColumn
            title="Načrtuj"
            links={[
              { href: "/nacrtuj", label: "AI načrtovalec" },
              { href: "/nacrtuj#kviz", label: "Kviz za popotnike" },
              { href: "/#rezerviraj", label: "Rezervacije" },
              // P1-2b: B2C računi popotnikov
              { href: "/moja-potovanja", label: "Moja potovanja" },
              { href: "/prijava", label: "Prijava" },
            ]}
          />

          {/* 4. Za ponudnike (P4-5: javni lijak — prej orphan stran) */}
          <FooterColumn
            title="Za ponudnike"
            links={[
              { href: "/za-ponudnike", label: "Postanite partner" },
              { href: "/owner/prijava", label: "Prijava za partnerje" },
              { href: "/za-ponudnike#pridruzi-se", label: "Paketi in cene" },
              { href: "/za-ponudnike#pridruzi-se", label: "Prijavnica" },
            ]}
          />

          {/* 4. Pravno */}
          <FooterColumn
            title="Pravno"
            links={[
              { href: "/zaupanje-in-varnost", label: "Zaupanje in varnost" },
              { href: "/politika-zasebnosti", label: "Politika zasebnosti" },
              { href: "/pogoji-uporabe", label: "Pogoji uporabe" },
              { href: "/kontakt", label: "Kontakt" },
            ]}
          />
        </div>

        {/* Spodnja vrstica: gradient ločnik + copyright + disclaimer */}
        <div className="gradient-hairline mt-10" aria-hidden="true" />
        <div className="mt-6 flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>© 2026 Discover Slovenia AI. {t("tagline")}</span>
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
 */
function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <nav className="flex flex-col gap-3" aria-label={title}>
      {/* VLM revizija: naslovi kolon morajo biti ločeni od linkov (hierarhija) */}
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/70">
        {title}
      </h3>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:flex sm:flex-col sm:gap-2">
        {links.map((link) => (
          // key vključuje label: dve povezavi se lahko nanašata na isti
          // href (npr. "Paketi in cene" in "Prijavnica" obe → #pridruzi-se)
          <li key={`${link.href}-${link.label}`}>
            <Link
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default Footer;
