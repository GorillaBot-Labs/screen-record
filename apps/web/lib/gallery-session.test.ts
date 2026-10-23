import { afterEach, describe, expect, it } from "vitest";
import {
  attemptGallerySignIn,
  createGallerySessionToken,
  safeNextPath,
  signOutDestination,
  unsignedVisitorOutcome,
  verifyGallerySession,
} from "@/lib/gallery-session";

const ORIGINAL_ENV = {
  email: process.env.GALLERY_EMAIL,
  password: process.env.GALLERY_PASSWORD,
  secret: process.env.GALLERY_SESSION_SECRET,
};

function setCredentials() {
  process.env.GALLERY_EMAIL = "owner@example.com";
  process.env.GALLERY_PASSWORD = "correct-horse";
  process.env.GALLERY_SESSION_SECRET = "test-session-secret";
}

function restoreEnv(
  name: "GALLERY_EMAIL" | "GALLERY_PASSWORD" | "GALLERY_SESSION_SECRET",
  value: string | undefined,
) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restoreEnv("GALLERY_EMAIL", ORIGINAL_ENV.email);
  restoreEnv("GALLERY_PASSWORD", ORIGINAL_ENV.password);
  restoreEnv("GALLERY_SESSION_SECRET", ORIGINAL_ENV.secret);
});

describe("attemptGallerySignIn", () => {
  it("accepts the configured email and password", async () => {
    setCredentials();
    const result = await attemptGallerySignIn(" Owner@Example.com ", "correct-horse");
    expect(result.ok).toBe(true);
  });

  it("rejects a wrong password", async () => {
    setCredentials();
    expect(await attemptGallerySignIn("owner@example.com", "nope")).toEqual({
      ok: false,
      error: "Email or password is incorrect.",
    });
  });

  it("rejects sign-in when credentials are missing", async () => {
    delete process.env.GALLERY_EMAIL;
    delete process.env.GALLERY_PASSWORD;
    delete process.env.GALLERY_SESSION_SECRET;
    expect(await attemptGallerySignIn("owner@example.com", "correct-horse")).toEqual({
      ok: false,
      error: "Sign-in is not set up yet. Add the gallery email, password, and session secret.",
    });
    expect(await createGallerySessionToken()).toBeNull();
  });

  it("round-trips a signed session and rejects tampering", async () => {
    setCredentials();
    const token = await createGallerySessionToken(1_700_000_000_000);
    expect(token).toBeTruthy();
    expect(await verifyGallerySession(token!, 1_700_000_000_000)).toBe(true);
    expect(await verifyGallerySession(`${token}x`, 1_700_000_000_000)).toBe(false);
    expect(await verifyGallerySession(token!, 1_900_000_000_000)).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps same-site paths and drops external targets", () => {
    expect(safeNextPath("/r/abc?t=12")).toBe("/r/abc?t=12");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/login?next=/")).toBe("/");
  });
});

describe("unsignedVisitorOutcome", () => {
  it("sends library visitors to login and leaves the watch page open", () => {
    expect(unsignedVisitorOutcome({ pathname: "/", method: "GET" })).toEqual({
      login: "/login?next=%2F",
    });
    expect(unsignedVisitorOutcome({ pathname: "/recordings/abc", method: "GET", search: "?t=1" })).toEqual({
      login: `/login?next=${encodeURIComponent("/recordings/abc?t=1")}`,
    });
    expect(unsignedVisitorOutcome({ pathname: "/r/abc", method: "GET" })).toBe("allow");
    expect(unsignedVisitorOutcome({ pathname: "/login", method: "GET" })).toBe("allow");
    expect(unsignedVisitorOutcome({ pathname: "/api/recordings/abc", method: "DELETE" })).toBe(
      "unauthorized",
    );
    expect(unsignedVisitorOutcome({ pathname: "/api/recordings/bulk-delete", method: "POST" })).toBe(
      "unauthorized",
    );
    expect(unsignedVisitorOutcome({ pathname: "/api/recordings/ingest", method: "POST" })).toBe("allow");
    expect(unsignedVisitorOutcome({ pathname: "/api/recordings/abc/comments", method: "POST" })).toBe(
      "allow",
    );
    expect(unsignedVisitorOutcome({ pathname: "/api/recordings/abc/view", method: "POST" })).toBe("allow");
    expect(unsignedVisitorOutcome({ pathname: "/api/recordings/abc/download", method: "GET" })).toBe(
      "allow",
    );
  });
});

describe("signOutDestination", () => {
  it("stays on a share page and leaves the library for login", () => {
    expect(signOutDestination("http://localhost:3001/r/abc?t=12")).toBe("/r/abc?t=12");
    expect(signOutDestination("http://localhost:3001/")).toBe("/login");
    expect(signOutDestination("not a url")).toBe("/login");
    expect(signOutDestination(null)).toBe("/login");
  });
});
