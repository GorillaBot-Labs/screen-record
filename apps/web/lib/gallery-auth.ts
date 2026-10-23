import {
  clearedGallerySessionCookie,
  GALLERY_SESSION_COOKIE,
  GALLERY_UNAUTHORIZED,
  gallerySessionCookie,
  verifyGallerySession,
} from "@/lib/gallery-session";
import { cookies } from "next/headers";

export async function isGallerySignedIn(): Promise<boolean> {
  const jar = await cookies();
  return verifyGallerySession(jar.get(GALLERY_SESSION_COOKIE)?.value);
}

export async function denyUnlessGalleryOperator<T>(
  run: () => Promise<T>,
): Promise<T | typeof GALLERY_UNAUTHORIZED> {
  if (!(await isGallerySignedIn())) return GALLERY_UNAUTHORIZED;
  return run();
}

export async function writeGallerySession(token: string) {
  const cookie = gallerySessionCookie(token);
  const jar = await cookies();
  jar.set(cookie.name, cookie.value, cookie.options);
}

export async function clearGallerySession() {
  const cookie = clearedGallerySessionCookie();
  const jar = await cookies();
  jar.set(cookie.name, cookie.value, cookie.options);
}
