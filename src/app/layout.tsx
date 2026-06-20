import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { SessionProviderWrapper } from "@/components/session-provider";
import { ServiceWorkerRegister } from "@/components/sw-register";
import {
  WebSiteJsonLd,
  OrganizationJsonLd,
} from "@/components/structured-data";
import { siteMetadata } from "@/lib/seo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

// Glavni metadata (metadataBase, OG, Twitter, manifest, ikone, robots).
export const metadata: Metadata = siteMetadata;

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

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* PWA manifest + Apple touch icon (eksplicitno, da pokrijemo Safari) */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="icon" type="image/svg+xml" href="/logo.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="I Feel Slovenia" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
        {/* Strukturirani podatki za SEO (WebSite + Organization) */}
        <WebSiteJsonLd />
        <OrganizationJsonLd />
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
