import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "I Feel Slovenia — AI načrtovalec potovanj",
  description:
    "Odkrijte Slovenijo z AI-poganjanim načrtovalcem potovanj. 12 najlepših destinacij od Bleda do Pirana, z interaktivnim zemljevidom, vremenom in direktnimi rezervacijami.",
  keywords: [
    "Slovenija",
    "Bled",
    "Piran",
    "Ljubljana",
    "Triglav",
    "potovanje",
    "itinerer",
    "načrtovanje potovanj",
  ],
  authors: [{ name: "I Feel Slovenia" }],
  openGraph: {
    title: "I Feel Slovenia — AI načrtovalec potovanj",
    description:
      "Odkrijte Slovenijo z AI-poganjanim načrtovalcem potovanj. 12 najlepših destinacij.",
    type: "website",
    locale: "sl_SI",
  },
  twitter: {
    card: "summary_large_image",
    title: "I Feel Slovenia",
    description: "AI načrtovalec potovanj za Slovenijo",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sl" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} font-sans antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
