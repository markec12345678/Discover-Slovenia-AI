import Link from "next/link";
import { Mountain, Facebook, Instagram, Twitter, Heart } from "lucide-react";

/**
 * Footer — server component.
 * 4-kolončni layout (1/2/4 responsive), levo brand + social, nato destinacije,
 * podpora in pravno. Spodaj copyright + affiliate disclaimer.
 */
export function Footer() {
  return (
    <footer
      className="mt-auto w-full border-t border-border bg-muted/30"
      aria-label="Noga strani"
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
        {/* 4 kolone */}
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* 1. Brand */}
          <div className="flex flex-col gap-4">
            <Link
              href="#vrh"
              className="flex items-center gap-2 text-foreground transition-colors hover:text-primary"
              aria-label="I Feel Slovenia — domov"
            >
              <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
                <Mountain className="size-5" aria-hidden="true" />
              </span>
              <span className="text-base font-bold tracking-tight">
                I Feel Slovenia
              </span>
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              AI-poganjan načrtovalec potovanj za Slovenijo. Odkrijte 12
              najlepših destinacij — od Blejskega jezera do jadranske obale.
            </p>
            <div className="flex items-center gap-2" aria-label="Družbena omrežja">
              <SocialLink
                href="#"
                label="Facebook"
                icon={<Facebook className="size-4" aria-hidden="true" />}
              />
              <SocialLink
                href="#"
                label="Instagram"
                icon={<Instagram className="size-4" aria-hidden="true" />}
              />
              <SocialLink
                href="#"
                label="Twitter"
                icon={<Twitter className="size-4" aria-hidden="true" />}
              />
            </div>
          </div>

          {/* 2. Destinacije */}
          <FooterColumn
            title="Destinacije"
            links={[
              { href: "#destinacije", label: "Vse destinacije" },
              { href: "#destinacije-bled", label: "Bled" },
              { href: "#destinacije-ljubljana", label: "Ljubljana" },
              { href: "#destinacije-piran", label: "Piran" },
              { href: "#destinacije-triglav", label: "Triglav" },
            ]}
          />

          {/* 3. Podpora */}
          <FooterColumn
            title="Podpora"
            links={[
              { href: "#načrtuj", label: "AI načrtovalec" },
              { href: "#vreme", label: "Vreme" },
              { href: "#rezerviraj", label: "Rezervacije" },
              { href: "#faq", label: "Pogosta vprašanja" },
            ]}
          />

          {/* 4. Pravno */}
          <FooterColumn
            title="Pravno"
            links={[
              { href: "#piskotki", label: "Piškotki" },
              { href: "#pogoji", label: "Pogoji uporabe" },
              { href: "#kontakt", label: "Kontakt" },
              { href: "#zasebnost", label: "Zasebnost" },
            ]}
          />
        </div>

        {/* Spodnja vrstica: copyright + disclaimer */}
        <div className="mt-10 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span>© 2025 I Feel Slovenia. Narejeno z</span>
            <Heart
              className="size-3.5 fill-accent-foreground/70 text-accent-foreground/70"
              aria-hidden="true"
            />
            <span>v Sloveniji.</span>
          </p>
          <p className="max-w-md text-xs text-muted-foreground/80 sm:text-right">
            Affiliate povezave — zaslužimo provizijo pri rezervacijah, za vas
            brez dodatnih stroškov.
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
      <h3 className="text-sm font-semibold tracking-wide text-foreground">
        {title}
      </h3>
      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.href}>
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

/**
 * Ikona družbenega omrežja — okrogel gumb.
 */
function SocialLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary"
    >
      {icon}
    </Link>
  );
}

export default Footer;
