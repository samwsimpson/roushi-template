// Edge-runtime-safe Auth.js config — no DB adapter, no node-only deps.
// Imported by `src/proxy.ts` (which runs on Edge by default in Next 16).
//
// The full Auth.js setup with DrizzleAdapter lives in `src/auth.ts` and is
// only used in Node-runtime contexts (Server Components, route handlers,
// Server Actions). Both share the same JWT secret + provider config via
// the `authConfig` object below, so a session signed by one verifies in
// the other.
//
// Pattern documented at https://authjs.dev/getting-started/installation#edge-compatibility.

import GitHub from "next-auth/providers/github";
import type { NextAuthConfig } from "next-auth";

const githubId = process.env.AUTH_GITHUB_ID;
const githubSecret = process.env.AUTH_GITHUB_SECRET;
export const authEnabled = Boolean(githubId && githubSecret);

export const authConfig: NextAuthConfig = {
  providers: authEnabled
    ? [
        GitHub({
          clientId: githubId,
          clientSecret: githubSecret,
        }),
      ]
    : [],
  session: { strategy: "jwt" },
  pages: { signIn: "/auth/signin" },
  trustHost: true,
  callbacks: {
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};
