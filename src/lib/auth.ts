import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";

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

        const owner = await db.owner.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
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

        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });

        if (!user) return null;

        const valid = await compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name || user.email.split("@")[0],
          accountType: "user",
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
