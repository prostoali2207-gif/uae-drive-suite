import {
  LayoutDashboard,
  Car,
  FileText,
  Users,
  AlertTriangle,
  CreditCard,
  BarChart3,
  LogOut,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Fleet", url: "/fleet", icon: Car },
  { title: "Contracts", url: "/contracts", icon: FileText },
  { title: "Clients", url: "/clients", icon: Users },
  { title: "Fines & Salik", url: "/fines", icon: AlertTriangle },
  { title: "Payments", url: "/payments", icon: CreditCard },
  { title: "Reports", url: "/reports", icon: BarChart3 },
];

export function AppSidebar() {
  const { user, signOut } = useAuth();
  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="bg-sidebar">
        <div className="flex items-center gap-2 px-4 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Car className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold text-sidebar-primary">FleetDesk</span>
            <span className="text-[11px] text-sidebar-foreground/60">UAE Rentals</span>
          </div>
        </div>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      end
                      className={({ isActive }) =>
                        [
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                        ].join(" ")
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="bg-sidebar border-t border-sidebar-border">
        <div className="flex flex-col gap-1 p-2">
          {user?.email && (
            <div className="px-2.5 py-1 text-[11px] text-sidebar-foreground/60 truncate group-data-[collapsible=icon]:hidden">
              {user.email}
            </div>
          )}
          <SidebarMenuButton onClick={signOut} tooltip="Sign out" className="text-sidebar-foreground hover:bg-sidebar-accent/60">
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
          </SidebarMenuButton>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
