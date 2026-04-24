"use client";

import { Toaster } from "sonner";
import "sonner/dist/styles.css";

export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "border-stone-200 bg-white text-stone-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50",
          description: "text-stone-600 dark:text-zinc-400",
          success: "border-emerald-200 dark:border-emerald-900",
          error: "border-red-200 dark:border-red-900",
        },
      }}
    />
  );
}
