import { NavLink, useLocation } from "react-router-dom";
import { BarChart3, Car, CreditCard, FileText, Files, LayoutDashboard, MoreHorizontal, Settings, TriangleAlert, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const primaryNav = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Contracts", url: "/contracts", icon: FileText },
  { title: "Fleet", url: "/fleet", icon: Car },
  { title: "Clients", url: "/clients", icon: Users },
];

const moreNav = [
  { title: "Payments", url: "/payments", icon: CreditCard },
  { title: "Fines & Salik", url: "/fines", icon: TriangleAlert },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "External Forms", url: "/external-forms", icon: Files },
  { title: "Settings", url: "/settings", icon: Settings },
];

const isActivePath = (pathname: string, url: string) => {
  if (url === "/") return pathname === "/";
  if (url === "/contracts") return pathname === "/contracts" || (pathname.startsWith("/contracts/") && pathname !== "/contracts/new");
  return pathname === url || pathname.startsWith(`${url}/`);
};

export function BottomNav() {
  const location = useLocation();
  const isMoreActive = moreNav.some((item) => isActivePath(location.pathname, item.url));

  if (location.pathname === "/contracts/new") return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 w-full max-w-[100vw] border-t border-border bg-background px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-lg md:hidden">
      <div className="grid min-w-0 grid-cols-5 items-center gap-1">
        {primaryNav.map((item) => {
          const active = isActivePath(location.pathname, item.url);

          return (
            <NavLink
              key={item.title}
              to={item.url}
              end={item.url === "/"}
              className={cn(
                "flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[11px] font-medium text-muted-foreground",
                active && "bg-muted text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              <span className="max-w-full truncate">{item.title}</span>
            </NavLink>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                "flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[11px] font-medium text-muted-foreground",
                isMoreActive && "bg-muted text-foreground",
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="max-w-full truncate">More</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="mb-2 w-48">
            {moreNav.map((item) => (
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
  );
}
