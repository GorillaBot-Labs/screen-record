import { NextResponse } from "next/server";
import { deriveGallerySessionToken, GALLERY_AUTH_COOKIE } from "@/lib/gallery-auth-token";

function gallerySecret(): string | undefined {
  const s = process.env.INTERNAL_GALLERY_SECRET?.trim();
  return s || undefined;
}

export async function POST(request: Request) {
  const secret = gallerySecret();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Gallery auth is not configured (INTERNAL_GALLERY_SECRET)." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const password =
    typeof body === "object" && body !== null && "password" in body
      ? String((body as { password: unknown }).password ?? "")
      : "";

  if (password !== secret) {
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ ok: false, error: "Incorrect password" }, { status: 401 });
  }

  const token = await deriveGallerySessionToken(secret);
  const isProd = process.env.NODE_ENV === "production";
  const res = NextResponse.json({ ok: true });
  res.cookies.set(GALLERY_AUTH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
