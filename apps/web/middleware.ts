import { NextResponse, type NextRequest } from "next/server";
import {
  deriveGallerySessionToken,
  GALLERY_AUTH_COOKIE,
  timingSafeEqualString,
} from "@/lib/gallery-auth-token";

function gallerySecret(): string | undefined {
  const s = process.env.INTERNAL_GALLERY_SECRET?.trim();
  return s || undefined;
}

export async function middleware(request: NextRequest) {
  const isProd = process.env.NODE_ENV === "production";
  const secret = gallerySecret();

  if (isProd && !secret) {
    return new NextResponse(
      "INTERNAL_GALLERY_SECRET is not set. Add it in Vercel (or your host) so the gallery is not public.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  if (!secret) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(GALLERY_AUTH_COOKIE)?.value;
  const expected = await deriveGallerySessionToken(secret);
  if (cookie && timingSafeEqualString(cookie, expected)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Exclude all `/_next/*` (static, image, webpack-hmr, etc.) so dev and assets are not gated.
    "/((?!_next/|favicon.ico|login|api/gallery-auth/login).*)",
  ],
};
