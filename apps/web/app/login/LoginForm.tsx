"use client";

import { signIn, type SignInState } from "@/app/actions/gallery-session";
import { modalInputClass } from "@/app/components/Modal";
import { useActionState } from "react";

const initialState: SignInState = {};

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, action, pending] = useActionState(signIn, initialState);

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={nextPath} />
      <label className="block">
        <span className="text-sm font-medium text-foreground">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          className={`${modalInputClass} mt-1.5`}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-foreground">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={`${modalInputClass} mt-1.5`}
        />
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
