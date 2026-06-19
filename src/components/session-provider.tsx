"use client";

import { SessionProvider } from "next-auth/react";

/**
 * SessionProviderWrapper — client-side wrapper za NextAuth SessionProvider.
 * Omogoča uporabo `useSession()` v client komponentah (npr. owner dashboard).
 */
export function SessionProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}
