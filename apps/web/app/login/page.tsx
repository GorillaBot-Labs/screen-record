import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Sign in · Recordings",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-full flex-col bg-stone-50 text-stone-900 dark:bg-zinc-950 dark:text-zinc-50">
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80">
          <h1 className="text-xl font-semibold tracking-tight">Recordings</h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-zinc-400">Internal gallery — enter the shared password.</p>
          <div className="mt-8">
            <Suspense fallback={<p className="text-sm text-stone-500 dark:text-zinc-500">Loading…</p>}>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}
