import { LoginForm } from "@/app/login/LoginForm";
import { LogoMark } from "@/app/components/LogoMark";
import { isGallerySignedIn } from "@/lib/gallery-auth";
import { safeNextPath } from "@/lib/gallery-session";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = safeNextPath(next);
  if (await isGallerySignedIn()) redirect(destination);

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-8 w-8 shrink-0 rounded-lg shadow-sm shadow-accent/25" size={32} />
          <span className="text-sm font-semibold tracking-tight text-foreground">Recordings</span>
        </div>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-foreground">Sign in</h1>
        <p className="mt-1.5 text-sm text-muted">
          The library is for the operator. Shared videos stay watchable without an account.
        </p>
        <LoginForm nextPath={destination} />
      </div>
    </main>
  );
}
