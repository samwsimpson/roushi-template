"use server";

import { signOut } from "../auth";

/**
 * Top-level Server Action for the sign-out form in the header. Lives in its own
 * "use server" file rather than inline in layout.tsx for the same reason as
 * signInWithGitHubAction: inline Server Actions in Server Components can trip
 * Next 16 / Auth.js v5 serialization paths and 500 the whole layout.
 */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/auth/signin" });
}
