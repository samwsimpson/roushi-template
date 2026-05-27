// Full Auth.js v5 setup with DrizzleAdapter. Node-runtime only — do NOT
// import this from middleware (`proxy.ts`). For Edge-safe access, use
// `src/auth.config.ts` directly.
//
// The single-user allow-list (AUTH_ALLOWED_EMAILS) lives here in the signIn
// callback because that's where the GitHub user object first arrives.

import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import { db } from "./db/client";
import { accounts, sessions, users, verificationTokens } from "./db/schema";
import { authConfig } from "./auth.config";

export { authEnabled } from "./auth.config";

const allowedEmails = (process.env.AUTH_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      if (allowedEmails.length === 0) return true;
      const email = user.email?.toLowerCase();
      if (!email) return false;
      return allowedEmails.includes(email);
    },
  },
});
