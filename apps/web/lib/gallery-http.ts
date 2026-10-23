import { GALLERY_UNAUTHORIZED } from "@/lib/gallery-session";
import { NextResponse } from "next/server";

export function galleryUnauthorizedResponse(extra?: Record<string, unknown>) {
  return NextResponse.json(
    extra ? { ...GALLERY_UNAUTHORIZED, ...extra } : GALLERY_UNAUTHORIZED,
    { status: 401 },
  );
}
