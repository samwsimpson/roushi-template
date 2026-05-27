"use server";

import { revalidatePath } from "next/cache";
import { createGoal, updateGoalStatus, type GoalStatus } from "../../lib/goals";

export interface CreateGoalFormState {
  ok: boolean;
  message: string;
}

export async function createGoalAction(
  _prev: CreateGoalFormState,
  formData: FormData,
): Promise<CreateGoalFormState> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, message: "Title is required." };

  const targetRaw = String(formData.get("targetDate") ?? "").trim();
  let targetDate: Date | undefined;
  if (targetRaw) {
    const d = new Date(targetRaw);
    if (Number.isNaN(d.getTime())) return { ok: false, message: "Target date is invalid." };
    targetDate = d;
  }

  const description = String(formData.get("description") ?? "").trim() || undefined;
  const linkRaw = String(formData.get("relatedSlugs") ?? "").trim();
  const relatedEntitySlugs = linkRaw
    ? linkRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  try {
    const row = await createGoal({ title, description, targetDate, relatedEntitySlugs });
    revalidatePath("/goals");
    revalidatePath("/");
    return { ok: true, message: `Created goal "${row.title}".` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateGoalStatusAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() as GoalStatus;
  if (!id || !status) return;
  await updateGoalStatus(id, status);
  revalidatePath("/goals");
  revalidatePath("/");
}
