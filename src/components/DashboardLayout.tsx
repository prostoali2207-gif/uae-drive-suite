import { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { BarChart3, Car, CreditCard, FileText, LayoutDashboard, MoreHorizontal, Settings, TriangleAlert, Users } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { NotificationBell } from "./NotificationBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  mobileContractsNav?: boolean;
}

const mobilePrimaryNav = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Contracts", url: "/contracts", icon: FileText },
  { title: "Clients", url: "/clients", icon: Users },
  { title: "Fleet", url: "/fleet", icon: Car },
];

const mobileMoreNav = [
  { title: "Payments", url: "/payments", icon: CreditCard },
  { title: "Fines & Salik", url: "/fines", icon: TriangleAlert },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function DashboardLayout({ title, subtitle, children, mobileContractsNav = false }: DashboardLayoutProps) {
  const location = useLocation();
  const isMoreActive = mobileMoreNav.some((item) => location.pathname === item.url);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="flex h-14 items-center gap-3 border-b border-border bg-background px-4 md:px-6">
            <SidebarTrigger className={cn("text-muted-foreground hover:text-foreground", mobileContractsNav && "hidden md:inline-flex")} />
            <div className="flex flex-col">
              <h1 className="text-sm font-semibold text-foreground">{title}</h1>
              {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            </div>
            <div className="ml-auto">
              <NotificationBell />
            </div>
          </header>
          <main className={cn("flex-1 px-4 py-6 md:px-8 md:py-8", mobileContractsNav && "pb-24 md:pb-8")}>{children}</main>
          {mobileContractsNav && (
            <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-lg backdrop-blur md:hidden">
              <div className="grid grid-cols-5 items-center gap-1">
                {mobilePrimaryNav.map((item) => (
                  <NavLink
                    key={item.title}
                    to={item.url}
                    end
                    className={({ isActive }) =>
                      cn(
                        "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[11px] font-medium text-muted-foreground",
                        isActive && "bg-muted text-foreground",
                      )
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </NavLink>
                ))}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      className={cn(
                        "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[11px] font-medium text-muted-foreground",
                        isMoreActive && "bg-muted text-foreground",
                      )}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                      <span>More</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="top" className="mb-2 w-48">
                    {mobileMoreNav.map((item) => (
                      <DropdownMenuItem key={item.title} asChild>
                        <NavLink to={item.url} className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" />
                          {item.title}
                        </NavLink>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </nav>
          )}
        </div>
      </div>
    </SidebarProvider>
  );
}
