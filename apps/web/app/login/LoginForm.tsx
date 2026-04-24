"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      const form = e.currentTarget;
      const password = new FormData(form).get("password");
      if (typeof password !== "string") {
        setError("Enter the gallery password.");
        return;
      }
      setPending(true);
      try {
        const res = await fetch("/api/gallery-auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const data: unknown = await res.json().catch(() => null);
        const ok =
          typeof data === "object" &&
          data !== null &&
          "ok" in data &&
          (data as { ok: unknown }).ok === true;
        if (!res.ok || !ok) {
          const msg =
            typeof data === "object" &&
            data !== null &&
            "error" in data &&
            typeof (data as { error: unknown }).error === "string"
              ? (data as { error: string }).error
              : "Sign-in failed";
          setError(msg);
          return;
        }
        const from = searchParams.get("from");
        const dest = from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
        router.replace(dest);
        router.refresh();
      } catch {
        setError("Network error. Try again.");
      } finally {
        setPending(false);
      }
    },
    [router, searchParams],
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-zinc-300">
          Gallery password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-400/30 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-500 dark:focus:ring-zinc-500/30"
          disabled={pending}
        />
      </div>
      {error ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
