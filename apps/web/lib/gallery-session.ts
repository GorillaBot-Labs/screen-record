export const GALLERY_SESSION_COOKIE = "gallery_session";
export const GALLERY_PATH_HEADER = "x-gallery-pathname";
export const GALLERY_SEARCH_HEADER = "x-gallery-search";

export const GALLERY_UNAUTHORIZED = { ok: false as const, error: "Unauthorized" as const };

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SIGN_IN_NOT_CONFIGURED =
  "Sign-in is not set up yet. Add the gallery email, password, and session secret.";
const SIGN_IN_REJECTED = "Email or password is incorrect.";

type GalleryCredentials = {
  email: string;
  password: string;
  secret: string;
};

type SessionCookie = {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    sameSite: "lax";
    secure: boolean;
    path: "/";
    maxAge: number;
  };
};

function galleryCredentials(): GalleryCredentials | null {
  const email = process.env.GALLERY_EMAIL?.trim().toLowerCase() ?? "";
  const password = process.env.GALLERY_PASSWORD ?? "";
  const secret = process.env.GALLERY_SESSION_SECRET?.trim() ?? "";
  if (!email || !password || !secret) return null;
  return { email, password, secret };
}

export function galleryOperatorEmail(): string | null {
  return galleryCredentials()?.email ?? null;
}

function sessionCookieOptions(maxAge: number): SessionCookie["options"] {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function gallerySessionCookie(token: string): SessionCookie {
  return {
    name: GALLERY_SESSION_COOKIE,
    value: token,
    options: sessionCookieOptions(SESSION_MAX_AGE_SECONDS),
  };
}

export function clearedGallerySessionCookie(): SessionCookie {
  return {
    name: GALLERY_SESSION_COOKIE,
    value: "",
    options: sessionCookieOptions(0),
  };
}

export function safeNextPath(value: string | null | undefined): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value.includes("://") || /[\r\n]/.test(value)) return "/";
  if (value === "/login" || value.startsWith("/login?")) return "/";
  return value;
}

function requestNeedsGallerySession(pathname: string, method: string): boolean {
  if (pathname === "/" || pathname === "/recordings" || pathname.startsWith("/recordings/")) {
    return method === "GET" || method === "HEAD" || method === "POST";
  }

  if (pathname === "/api/recordings/bulk-delete") return method === "POST";

  const match = pathname.match(/^\/api\/recordings\/([^/]+)$/);
  if (!match) return false;
  const id = match[1];
  if (id === "ingest" || id === "bulk-delete") return false;
  return method === "DELETE";
}

export type UnsignedVisitorOutcome = "allow" | "unauthorized" | { login: string };

export function unsignedVisitorOutcome(input: {
  pathname: string;
  method: string;
  search?: string;
}): UnsignedVisitorOutcome {
  if (!requestNeedsGallerySession(input.pathname, input.method)) return "allow";
  if (input.pathname.startsWith("/api/")) return "unauthorized";
  const next = safeNextPath(`${input.pathname}${input.search ?? ""}`);
  return { login: `/login?next=${encodeURIComponent(next)}` };
}

export function signOutDestination(referer: string | null): string {
  if (!referer) return "/login";
  try {
    const url = new URL(referer);
    const outcome = unsignedVisitorOutcome({
      pathname: url.pathname,
      method: "GET",
      search: url.search,
    });
    if (outcome === "allow") return safeNextPath(`${url.pathname}${url.search}`);
    return "/login";
  } catch {
    return "/login";
  }
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + pad);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmac(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return new Uint8Array(signature);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function macEqual(left: string, right: string, secret: string): Promise<boolean> {
  const [leftMac, rightMac] = await Promise.all([hmac(left, secret), hmac(right, secret)]);
  return timingSafeEqual(leftMac, rightMac);
}

async function credentialsMatch(email: string, password: string): Promise<boolean> {
  const configured = galleryCredentials();
  if (!configured) return false;
  const [emailOk, passwordOk] = await Promise.all([
    macEqual(email.trim().toLowerCase(), configured.email, configured.secret),
    macEqual(password, configured.password, configured.secret),
  ]);
  return emailOk && passwordOk;
}

export async function attemptGallerySignIn(
  email: string,
  password: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (!galleryCredentials()) return { ok: false, error: SIGN_IN_NOT_CONFIGURED };
  if (!(await credentialsMatch(email, password))) return { ok: false, error: SIGN_IN_REJECTED };
  const token = await createGallerySessionToken();
  if (!token) return { ok: false, error: SIGN_IN_NOT_CONFIGURED };
  return { ok: true, token };
}

export async function createGallerySessionToken(now = Date.now()): Promise<string | null> {
  const configured = galleryCredentials();
  if (!configured) return null;
  const payload = encodeBase64Url(
    JSON.stringify({ exp: Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS }),
  );
  const signature = bytesToBase64Url(await hmac(payload, configured.secret));
  return `${payload}.${signature}`;
}

export async function verifyGallerySession(
  token: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  const configured = galleryCredentials();
  if (!configured || !token) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return false;

  const expected = bytesToBase64Url(await hmac(payload, configured.secret));
  const actualBytes = new TextEncoder().encode(signature);
  const expectedBytes = new TextEncoder().encode(expected);
  if (!timingSafeEqual(actualBytes, expectedBytes)) return false;

  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as { exp?: unknown };
    return typeof parsed.exp === "number" && parsed.exp > now / 1000;
  } catch {
    return false;
  }
}
