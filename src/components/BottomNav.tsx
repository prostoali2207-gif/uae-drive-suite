import { NavLink, useLocation } from "react-router-dom";
import { BarChart3, Car, CreditCard, FileText, LayoutDashboard, MoreHorizontal, Settings, TriangleAlert, Users } from "lucide-react";
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
  { title: "Clients", url: "/clients", icon: Users },
  { title: "Fleet", url: "/fleet", icon: Car },
];

const moreNav = [
  { title: "Payments", url: "/payments", icon: CreditCard },
  { title: "Fines & Salik", url: "/fines", icon: TriangleAlert },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];

const isActivePath = (pathname: string, url: string) => {
  if (url === "/") return pathname === "/";
  return pathname === url || pathname.startsWith(`${url}/`);
};

export function BottomNav() {
  const location = useLocation();
  const isMoreActive = moreNav.some((item) => isActivePath(location.pathname, item.url));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-lg backdrop-blur md:hidden">
      <div className="grid grid-cols-5 items-center gap-1">
        {primaryNav.map((item) => {
          const active = isActivePath(location.pathname, item.url);

          return (
            <NavLink
              key={item.title}
              to={item.url}
              end={item.url === "/"}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[11px] font-medium text-muted-foreground",
                active && "bg-muted text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.title}</span>
            </NavLink>
          );
        })}
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
