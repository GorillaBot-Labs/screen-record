"use server";

import { clearGallerySession, writeGallerySession } from "@/lib/gallery-auth";
import { attemptGallerySignIn, safeNextPath, signOutDestination } from "@/lib/gallery-session";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type SignInState = { error?: string };

export async function signIn(_state: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const result = await attemptGallerySignIn(email, password);
  if (!result.ok) return { error: result.error };

  await writeGallerySession(result.token);
  redirect(safeNextPath(String(formData.get("next") ?? "")));
}

export async function signOut() {
  await clearGallerySession();
  redirect(signOutDestination((await headers()).get("referer")));
}
