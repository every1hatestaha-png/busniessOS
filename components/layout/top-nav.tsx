"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import type { Role } from "@prisma/client";
import { Menu, Search, ShoppingCart, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "@/components/layout/sidebar";
import { GlobalSearch } from "@/components/search/global-search";
import { DesktopClerkAccountMenu } from "@/components/layout/desktop-clerk-account-menu";
import { WebAccountMenu } from "@/components/layout/web-account-menu";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { getWorkspaceBranding } from "@/lib/workspace-branding";
import type { WorkspaceVertical } from "@/lib/verticals/registry";

export function TopNav({
  workspaceName,
  workspaceId,
  workspaces,
  role,
  enabledModules,
  vertical,
}: {
  workspaceName: string;
  workspaceId: string;
  workspaces: Array<{ workspaceId: string; workspace: { name: string } }>;
  role: Role;
  enabledModules: string[];
  vertical: WorkspaceVertical;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const branding = getWorkspaceBranding(workspaceName);
  const restaurantMode = vertical === "RESTAURANT";
  const isDesktop = useSyncExternalStore(
    () => () => {},
    () => Boolean(window.businessOSDesktop?.signOut && window.businessOSDesktop.switchAccount),
    () => false,
  );

  return (
    <header className="sticky top-0 z-40 flex min-h-16 flex-wrap items-center border-b bg-white/95 px-4 backdrop-blur print:hidden sm:px-6">
      <div className="flex w-full min-w-0 items-center gap-3">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation menu" />}>
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent
            side="left"
            className={restaurantMode ? "w-[248px] max-w-full gap-0 p-0" : "w-[260px] max-w-full gap-0 p-0"}
            showCloseButton={false}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) setMobileMenuOpen(false);
            }}
          >
            <SheetTitle className="sr-only">Navigation menu</SheetTitle>
            <Sidebar workspaceName={workspaceName} role={role} enabledModules={enabledModules} vertical={vertical} />
          </SheetContent>
        </Sheet>

        {branding && (
          <Image
            src={branding.markPath}
            alt={branding.logoAlt}
            width={36}
            height={36}
            unoptimized
            className="size-9 rounded-md object-contain lg:hidden"
          />
        )}
        <span className="max-w-40 truncate text-base font-bold tracking-tight lg:hidden" title={workspaceName}>{workspaceName}</span>

        {restaurantMode ? (
          <div className="hidden min-w-0 flex-1 lg:block">
            <p className="truncate text-sm font-semibold text-slate-900">{workspaceName}</p>
            <p className="text-[11px] text-slate-500">Restaurant workspace</p>
          </div>
        ) : (
          <GlobalSearch key={`desktop-${workspaceId}`} className="hidden min-w-0 max-w-[520px] flex-1 lg:block" />
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {restaurantMode ? (
            <Button
              className="hidden bg-emerald-600 hover:bg-emerald-500 sm:inline-flex"
              nativeButton={false}
              render={<Link href="/restaurant/pos" />}
            >
              <ShoppingCart className="size-4" />
              Open POS
            </Button>
          ) : null}
          <WorkspaceSwitcher activeId={workspaceId} workspaces={workspaces} />
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileSearchOpen((open) => !open)}
            aria-label={mobileSearchOpen ? "Close search" : "Open search"}
          >
            {mobileSearchOpen ? <X /> : <Search />}
          </Button>
          {isDesktop ? <DesktopClerkAccountMenu /> : <WebAccountMenu />}
        </div>
      </div>

      {mobileSearchOpen && !restaurantMode ? (
        <GlobalSearch key={`mobile-${workspaceId}`} autoFocus onNavigate={() => setMobileSearchOpen(false)} className="mt-3 w-full lg:hidden" />
      ) : null}
    </header>
  );
}
