import { galleryUnauthorizedResponse } from "@/lib/gallery-http";
import {
  GALLERY_PATH_HEADER,
  GALLERY_SEARCH_HEADER,
  GALLERY_SESSION_COOKIE,
  unsignedVisitorOutcome,
  verifyGallerySession,
} from "@/lib/gallery-session";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function continueRequest(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(GALLERY_PATH_HEADER, request.nextUrl.pathname);
  headers.set(GALLERY_SEARCH_HEADER, request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const outcome = unsignedVisitorOutcome({ pathname, method: request.method, search });
  if (outcome === "allow") return continueRequest(request);

  const token = request.cookies.get(GALLERY_SESSION_COOKIE)?.value;
  if (await verifyGallerySession(token)) return continueRequest(request);

  if (outcome === "unauthorized") return galleryUnauthorizedResponse();

  return NextResponse.redirect(new URL(outcome.login, request.url));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
