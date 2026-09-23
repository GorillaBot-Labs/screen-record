"use client";

import { MobileNav, Sidebar } from "@/app/components/Sidebar";
import type { ProjectTree } from "@/lib/projects";
import { useCallback, useState } from "react";

type AppShellProps = {
  children: React.ReactNode;
  projectTree: ProjectTree[];
};

export function AppShell({ children, projectTree }: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  return (
    <div className="flex min-h-dvh w-full bg-background">
      <Sidebar projectTree={projectTree} className="hidden md:flex" />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <div className="md:hidden">
          <MobileNav
            projectTree={projectTree}
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
