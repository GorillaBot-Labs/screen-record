import { NextResponse } from "next/server";
import { GALLERY_AUTH_COOKIE } from "@/lib/gallery-auth-token";

export async function POST() {
  const isProd = process.env.NODE_ENV === "production";
  const res = NextResponse.json({ ok: true });
  res.cookies.set(GALLERY_AUTH_COOKIE, "", {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
