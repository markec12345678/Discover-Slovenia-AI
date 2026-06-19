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
    CredentialsProvider({
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
          // custom field — passing through via jwt callback
          businessName: owner.businessName,
          plan: owner.plan,
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
      }
      // Osveži plan iz baze (v primeru nadgradnje)
      if (token.email && !token.planSynced) {
        const owner = await db.owner.findUnique({
          where: { email: token.email },
          select: { plan: true, subscriptionStatus: true },
        });
        if (owner) {
          token.plan = owner.plan;
          token.subscriptionStatus = owner.subscriptionStatus;
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
        (session.user as any).subscriptionStatus = token.subscriptionStatus;
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
      subscriptionStatus?: string;
    };
  }
}
