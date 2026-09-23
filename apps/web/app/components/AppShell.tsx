"use client";

import { MobileNav, Sidebar } from "@/app/components/Sidebar";
import { useCallback, useState } from "react";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  return (
    <div className="flex min-h-dvh w-full bg-background">
      <Sidebar className="hidden md:flex" />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <div className="md:hidden">
          <MobileNav
            open={mobileNavOpen}
            onOpen={openMobileNav}
            onClose={closeMobileNav}
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
