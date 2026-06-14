import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { NotificationBell } from "./NotificationBell";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  mobileContractsNav?: boolean;
}

export function DashboardLayout({ title, subtitle, children, mobileContractsNav = false }: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full max-w-full min-w-0 bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 w-full max-w-full min-w-0 items-center gap-3 border-b border-border bg-background px-4 md:px-6">
            <SidebarTrigger className={cn("text-muted-foreground hover:text-foreground", mobileContractsNav && "hidden md:inline-flex")} />
            <div className="flex min-w-0 flex-col">
              <h1 className="truncate text-sm font-semibold text-foreground">{title}</h1>
              {subtitle && <p className={cn("text-xs text-muted-foreground", mobileContractsNav && "hidden md:block")}>{subtitle}</p>}
            </div>
            <div className="ml-auto shrink-0">
              <NotificationBell />
            </div>
          </header>
          <main className="w-full min-w-0 flex-1 px-4 py-6 pb-24 md:px-8 md:py-8">
            <div className="w-full max-w-full min-w-0">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
