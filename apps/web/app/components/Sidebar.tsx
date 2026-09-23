"use client";

import { Clapperboard, LayoutGrid, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef } from "react";

type SidebarContentProps = {
  onNavigate?: () => void;
  showClose?: boolean;
  onClose?: () => void;
};

function NavLink({
  href,
  active,
  icon,
  label,
  onNavigate,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-accent-soft text-accent"
          : "text-zinc-600 hover:bg-surface hover:text-foreground"
      }`}
    >
      <span className={active ? "text-accent" : "text-zinc-400"} aria-hidden>
        {icon}
      </span>
      {label}
    </Link>
  );
}

export function SidebarContent({
  onNavigate,
  showClose = false,
  onClose,
}: SidebarContentProps) {
  const pathname = usePathname();
  const onGalleryHome = pathname === "/";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex min-w-0 flex-1 items-center gap-2.5"
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-sm shadow-accent/25"
            aria-hidden
          >
            <Clapperboard className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <span className="truncate text-sm font-semibold tracking-tight text-foreground">
            Recordings
          </span>
        </Link>
        {showClose ? (
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-surface hover:text-foreground"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        ) : null}
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Main">
        <NavLink
          href="/"
          active={onGalleryHome}
          icon={<LayoutGrid className="h-[18px] w-[18px]" strokeWidth={2} />}
          label="Library"
          onNavigate={onNavigate}
        />
      </nav>
    </div>
  );
}

type SidebarProps = {
  className?: string;
};

export function Sidebar({ className = "" }: SidebarProps) {
  return (
    <aside
      className={`sticky top-0 flex h-dvh min-h-dvh w-60 shrink-0 flex-col border-r border-border bg-sidebar ${className}`}
    >
      <SidebarContent />
    </aside>
  );
}

type MobileNavProps = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
};

export function MobileNav({ open, onOpen, onClose }: MobileNavProps) {
  const drawerId = useId();

  const handleNavigate = useCallback(() => {
    onClose();
  }, [onClose]);

  const pathname = usePathname();
  const prevPath = useRef(pathname);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      onClose();
    }
  }, [pathname, onClose]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-sm supports-backdrop-filter:bg-background/80 md:hidden">
        <button
          type="button"
          onClick={onOpen}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-surface hover:text-foreground"
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls={drawerId}
        >
          <LayoutGrid className="h-5 w-5" aria-hidden />
        </button>
        <Link href="/" className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white"
            aria-hidden
          >
            <Clapperboard className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <span className="truncate text-sm font-semibold">Recordings</span>
        </Link>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/40 transition-opacity"
            aria-label="Close menu"
            onClick={onClose}
          />
          <aside
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex h-dvh min-h-dvh w-[min(280px,88vw)] flex-col bg-sidebar shadow-2xl shadow-zinc-950/15 motion-safe:animate-[slide-in_200ms_ease-out]"
          >
            <SidebarContent
              onNavigate={handleNavigate}
              showClose
              onClose={onClose}
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}
