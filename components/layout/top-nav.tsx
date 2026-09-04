"use client";

import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import type { Role } from "@prisma/client";
import { Bell, Menu, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "@/components/layout/sidebar";
import { GlobalSearch } from "@/components/search/global-search";
import type { SearchResult } from "@/lib/search";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";

export function TopNav({ workspaceName, workspaceId, workspaces, searchResults, role }: { workspaceName: string; workspaceId: string; workspaces: Array<{ workspaceId: string; workspace: { name: string } }>; searchResults: SearchResult[]; role: Role }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  return (
    <header className="relative z-40 flex min-h-16 flex-wrap items-center border-b bg-white px-4 print:hidden sm:px-6">
      <div className="flex w-full items-center gap-3">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation menu" />}>
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-[236px] gap-0 p-0" showCloseButton={false} onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setMobileMenuOpen(false);
          }}>
            <SheetTitle className="sr-only">Navigation menu</SheetTitle>
            <Sidebar workspaceName={workspaceName} role={role} />
          </SheetContent>
        </Sheet>

        <span className="max-w-40 truncate text-base font-bold tracking-tight lg:hidden" title={workspaceName}>{workspaceName}</span>
        <GlobalSearch results={searchResults} className="hidden max-w-[520px] lg:block" />

        <div className="ml-auto flex items-center gap-1.5">
          <WorkspaceSwitcher activeId={workspaceId} workspaces={workspaces} />
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileSearchOpen((open) => !open)} aria-label={mobileSearchOpen ? "Close search" : "Open search"}>
            {mobileSearchOpen ? <X /> : <Search />}
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="Notifications">
            <Bell className="size-4" />
          </Button>
          <div className="ml-1 flex items-center border-l pl-3"><UserButton /></div>
        </div>
      </div>
      {mobileSearchOpen && <GlobalSearch results={searchResults} autoFocus onNavigate={() => setMobileSearchOpen(false)} className="mt-3 lg:hidden" />}
    </header>
  );
}
