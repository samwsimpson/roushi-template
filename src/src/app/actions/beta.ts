"use server";

import { Resend } from "resend";
import { z } from "zod";

const BetaRequestSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  name: z.string().min(1, "Tell me your name.").max(120),
  message: z.string().max(2000).optional(),
});

export interface BetaRequestState {
  ok: boolean;
  message: string;
}

export async function requestBetaAccessAction(
  _prev: BetaRequestState,
  formData: FormData,
): Promise<BetaRequestState> {
  const parsed = BetaRequestSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    message: String(formData.get("message") ?? "").trim() || undefined,
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, message: first?.message ?? "Invalid input." };
  }

  const { name, email, message } = parsed.data;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM_EMAIL ?? "Roushi <noreply@roushi.ai>";

  const { error } = await resend.emails.send({
    from,
    to: "kitt@kumokodo.ai",
    replyTo: email,
    subject: `[Roushi beta] ${name}`,
    text: [
      `Name: ${name}`,
      `Email: ${email}`,
      "",
      message ? `Message:\n${message}` : "(No message provided)",
    ].join("\n"),
  });

  if (error) {
    console.error("[beta-request] resend error:", error);
    return { ok: false, message: "Something went wrong. Try again in a moment." };
  }

  return {
    ok: true,
    message: "Got it. We'll reply within a few days — usually faster.",
  };
}
