"use server";

import { signIn } from "../../../auth";

/**
 * Top-level Server Action for the GitHub sign-in form. Takes FormData rather
 * than a bound callbackUrl argument — the .bind() form was the previous
 * attempt and didn't help. Reading callbackUrl from the form payload avoids
 * any closure serialization concerns Next might have at the page-render path.
 */
export async function signInWithGitHubAction(formData: FormData): Promise<void> {
  const callbackUrl = String(formData.get("callbackUrl") ?? "/");
  await signIn("github", { redirectTo: callbackUrl });
}
