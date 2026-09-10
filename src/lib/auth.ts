import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import { hitLimit } from "@/lib/rate-limit";

// ============================================================================
// P3a-1: RAZVELJAVLJANJE SEJ OB PONASTAVITVI GESLA (tokenVersion)
// ============================================================================
// Ob prijavi authorize() vrne trenutni tokenVersion iz DB → jwt callback ga
// zapeče v žeton. Ob vsakem nadaljnjem klicu (session refresh) jwt callback
// preveri aktualni tokenVersion iz DB S KRATKIM CACHINGOM (TTL 60 s):
// reset-password ga inkrementira → naslednji check po poteku cache-a se ne
// ujema → žetonu ODVZAMEMO identiteto (id/email/name/accountType/…) →
// session izpostavi prazno sejo → vsi guardi (session?.user?.id) vrnejo 401.
// Stara seja torej umre v ≤ ~60 s po ponastavitvi (fiksni TTL od zadnjega
// DB branja; cache ZADETEK ne podaljšuje življenjske dobe).
const TOKEN_VERSION_TTL_MS = 60_000;
const versionCache = new Map<string, { v: number; at: number }>();

async function getDbTokenVersion(
  accountType: string | undefined,
  id: string
): Promise<number | null> {
  const key = `${accountType}:${id}`;
  const now = Date.now();
  const cached = versionCache.get(key);
  if (cached && now - cached.at < TOKEN_VERSION_TTL_MS) {
    return cached.v;
  }

  // Potekel cache (ali prvi klic) — sveže branje iz DB.
  let v: number | null = null;
  if (accountType === "user") {
    const user = await db.user.findUnique({
      where: { id },
      select: { tokenVersion: true },
    });
    v = user?.tokenVersion ?? null;
  } else {
    const owner = await db.owner.findUnique({
      where: { id },
      select: { tokenVersion: true },
    });
    v = owner?.tokenVersion ?? null;
  }

  // Račun je bil izbrisan → verzija -1 (nikoli se ne ujema z žetonom).
  versionCache.set(key, { v: v ?? -1, at: now });
  return v ?? -1;
}

// Preprosto čiščenje cache-a (vsakih 5 min pobriši >10 min stare vnose) —
// mapa je sicer omejena na število aktivnih prijavljenih računov.
let lastVersionCacheCleanup = Date.now();
function cleanupVersionCache() {
  const now = Date.now();
  if (now - lastVersionCacheCleanup < 5 * 60_000) return;
  lastVersionCacheCleanup = now;
  for (const [key, entry] of versionCache) {
    if (now - entry.at > 10 * 60_000) versionCache.delete(key);
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/owner/prijava",
  },
  providers: [
    // === PONUDNIK (B2B) — privzeti provider "credentials" (obstoječa prijava) ===
    CredentialsProvider({
      id: "credentials",
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Geslo", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // P3a-3: rate limit prijave PO KLJUČU (authorize nima Request/IP) —
        // 10 poskusov na email v 15 min. Vrnjeni null da enoten NextAuth 401
        // (ne razkriva rate limita posebej); bcrypt primerjava se preskoči
        // (= CPU zaščita pred brute-force).
        const loginKey = `login:${credentials.email.toLowerCase().trim()}`;
        if (hitLimit(loginKey, 10, 15 * 60_000)) {
          console.log(`[auth] prijavni rate limit zadet (${loginKey}) — bcrypt preskočen`);
          return null;
        }

        const owner = await db.owner.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
          select: {
            id: true,
            email: true,
            name: true,
            businessName: true,
            plan: true,
            role: true,
            passwordHash: true,
            tokenVersion: true,
          },
        });

        if (!owner) return null;

        const valid = await compare(credentials.password, owner.passwordHash);
        if (!valid) return null;

        return {
          id: owner.id,
          email: owner.email,
          name: owner.name,
          // custom fields — passing through via jwt callback
          businessName: owner.businessName,
          plan: owner.plan,
          role: owner.role,
          accountType: "owner",
          // P3a-1: verzija žetona — jwt callback jo preverja ob vsakem klicu
          tokenVersion: owner.tokenVersion,
        } as any;
      },
    }),
    // === POPOTNIK (B2C) — provider "user" (P1: računi popotnikov) ===
    // Ločen provider id: prijava na /prijava kliče signIn("user", ...),
    // prijava na /owner/prijava pa signIn("credentials", ...). Žeton nosi
    // accountType — auth-guards zavrne B2C seje na ponudniških endpointih.
    CredentialsProvider({
      id: "user",
      name: "uporabnik",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Geslo", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // P3a-3: enak rate limit kot za providerja "credentials"
        const loginKey = `login:${credentials.email.toLowerCase().trim()}`;
        if (hitLimit(loginKey, 10, 15 * 60_000)) {
          console.log(`[auth] prijavni rate limit zadet (${loginKey}) — bcrypt preskočen`);
          return null;
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            tokenVersion: true,
          },
        });

        if (!user) return null;

        const valid = await compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name || user.email.split("@")[0],
          accountType: "user",
          // P3a-1: verzija žetona — jwt callback jo preverja ob vsakem klicu
          tokenVersion: user.tokenVersion,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.businessName = (user as any).businessName;
        token.plan = (user as any).plan;
        token.role = (user as any).role;
        // P1: vrsta računa — "owner" (B2B) | "user" (B2C). Starejši žetoni
        // (izdani pred P1) nimajo accountType → obravnavamo jih kot owner
        // (izdani so bili lahko samo prek providerja "credentials").
        token.accountType = (user as any).accountType ?? "owner";
        // P3a-1: verzija ob izdaji žetona (iz DB zapisa ob prijavi)
        token.tokenVersion = (user as any).tokenVersion ?? 0;
      } else if (token.id && token.accountType) {
        // Nadaljnji klici (žeton že obstaja) — P3a-1: preveri, da seja še
        // velja (geslo ni bilo ponastavljeno / račun ni bil izbrisan).
        // Kratki cache (60 s) ščiti DB pred hladnim branjem ob vsakem klicu.
        cleanupVersionCache();
        const current = await getDbTokenVersion(
          token.accountType as string,
          token.id as string
        );
        // Starejši žetoni (izdani pred P3a-1) nimajo tokenVersion → veljajo
        // kot 0 (DB privzeta vrednost) — brez enkratne masovne odjave ob
        // uvedbi; razveljavitev udari šele, ko reset inkrementira verzijo.
        const tokenVersion =
          typeof token.tokenVersion === "number" ? token.tokenVersion : 0;
        if (current === null || current !== tokenVersion) {
          // RAZVELJAVI sejo: vrni žeton BREZ identitete — session callback
          // potem izpostavi prazno sejo, vsi guardi (session?.user?.id)
          // vrnejo 401. NextAuth interne (jti/iat/exp) ostanejo nedotaknjene.
          console.log(
            `[auth] seja razveljavljena (${token.accountType}:${token.id}, ` +
              `različica žetona ${String(token.tokenVersion)} ≠ DB ${String(current)})`
          );
          token.id = undefined;
          token.email = undefined;
          token.name = undefined;
          token.sub = undefined;
          token.businessName = undefined;
          token.plan = undefined;
          token.role = undefined;
          token.subscriptionStatus = undefined;
          token.accountType = undefined;
          token.tokenVersion = undefined;
          token.planSynced = undefined;
          return token;
        }
      }
      // Osveži plan in role iz baze (v primeru nadgradnje) — SAMO za ownerje
      if (token.email && token.accountType !== "user" && !token.planSynced) {
        const owner = await db.owner.findUnique({
          where: { email: token.email },
          select: { plan: true, subscriptionStatus: true, role: true },
        });
        if (owner) {
          token.plan = owner.plan;
          token.subscriptionStatus = owner.subscriptionStatus;
          token.role = owner.role;
        }
        token.planSynced = true;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).businessName = token.businessName;
        (session.user as any).plan = token.plan;
        (session.user as any).role = token.role;
        (session.user as any).subscriptionStatus = token.subscriptionStatus;
        (session.user as any).accountType = token.accountType;
      }
      return session;
    },
  },
};

// Tipi za session
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      businessName?: string;
      plan?: string;
      role?: string;
      subscriptionStatus?: string;
      // P1: "owner" (B2B ponudnik) | "user" (B2C popotnik) | undefined (stari žetoni)
      accountType?: string;
    };
  }
}
