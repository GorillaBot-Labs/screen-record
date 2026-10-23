import { signOut } from "@/app/actions/gallery-session";
import { LogoMark } from "@/app/components/LogoMark";
import Link from "next/link";

const textButtonClass =
  "inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface";

export function PublicWatchBar({
  signedIn,
  recordingId,
  accountEmail,
}: {
  signedIn: boolean;
  recordingId: string;
  accountEmail?: string | null;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <LogoMark className="h-8 w-8 shrink-0 rounded-lg shadow-sm shadow-accent/25" size={32} />
        <span className="truncate text-sm font-semibold tracking-tight text-foreground">
          Recordings
        </span>
      </div>

      {signedIn ? (
        <div className="flex shrink-0 items-center gap-1">
          {accountEmail ? (
            <span className="mr-1 hidden max-w-40 truncate text-sm text-muted sm:inline">
              {accountEmail}
            </span>
          ) : null}
          <Link href="/" className={textButtonClass}>
            Library
          </Link>
          <Link href={`/recordings/${recordingId}`} className={textButtonClass}>
            Manage
          </Link>
          <form action={signOut}>
            <button type="submit" className={textButtonClass}>
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <Link
          href={`/login?next=${encodeURIComponent(`/r/${recordingId}`)}`}
          className="inline-flex shrink-0 items-center rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Sign in
        </Link>
      )}
    </header>
  );
}
