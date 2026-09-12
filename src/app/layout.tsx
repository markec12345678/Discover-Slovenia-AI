import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { SessionProviderWrapper } from "@/components/session-provider";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { CartDrawer } from "@/components/cart-drawer";
import {
  WebSiteJsonLd,
  OrganizationJsonLd,
} from "@/components/structured-data";
import { buildSiteMetadata } from "@/lib/seo";
import { resolveBaseUrlFromHeaders } from "@/lib/host";
import { headers } from "next/headers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

// Glavni metadata (metadataBase, OG, Twitter, manifest, ikone, robots) —
// MONET-10: GOSTITELJU-PRILAGOJEN prek headers() (celoten site je že
// dinamičen — no-store — zato nič dodatnega stroška). og:image/canonical/
// JSON-LD tako kažejo na DEJANSKEGA gostitelja (Render/Vercel/lastna domena)
// namesto na statično (mrtvo) discoverslovenia.ai.
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  return buildSiteMetadata(resolveBaseUrlFromHeaders(h));
}

// Viewport — theme-color in obnašanje v mobilnem brskalniku.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1f1a" },
    { color: "#2d6a3e" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "light dark",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Locale iz middleware-a (header `x-next-intl-locale`) — uporablja se za
  // `<html lang>` atribut in za `NextIntlClientProvider`.
  const locale = await getLocale();
  const messages = await getMessages();
  // Baza za host-zavedne JSON-LD komponente (ista logika kot generateMetadata).
  const siteBase = resolveBaseUrlFromHeaders(await headers());

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* PWA manifest + Apple touch icon (eksplicitno, da pokrijemo Safari) */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="icon" type="image/svg+xml" href="/logo.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Discover Slovenia AI" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
        {/* RSS — svežinski signal za iskalnike + odkrivanje vsebin (MONET-10) */}
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Discover Slovenia AI — vodniki po Sloveniji"
          href="/rss.xml"
        />
        {/* Strukturirani podatki za SEO (WebSite + Organization) — host-zavedni */}
        <WebSiteJsonLd baseUrl={siteBase} />
        <OrganizationJsonLd baseUrl={siteBase} />
      </head>
      <body
        className={`${geistSans.variable} font-sans antialiased bg-background text-foreground`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          >
            <SessionProviderWrapper>
              {children}
              {/* Košarica tržnice — globalno montirana (odpre se iz navigacije ali ob dodajanju) */}
              <CartDrawer />
              <Toaster />
            </SessionProviderWrapper>
          </ThemeProvider>
        </NextIntlClientProvider>
        {/* Service worker — samodejno se izpusti v developmentu */}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
