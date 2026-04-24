"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

export function GallerySignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const signOut = useCallback(async () => {
    setPending(true);
    try {
      await fetch("/api/gallery-auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  }, [router]);

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={pending}
      className="text-sm font-medium text-stone-600 underline-offset-2 hover:text-stone-900 hover:underline disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
