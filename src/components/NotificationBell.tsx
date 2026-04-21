import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";

type Alert = {
  id: string;
  kind: "contract" | "fine";
  title: string;
  subtitle: string;
  href: string;
};

export function NotificationBell() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const stored = localStorage.getItem(`alerts:dismissed:${user.id}`);
    if (stored) setDismissed(new Set(JSON.parse(stored)));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      const in7 = new Date();
      in7.setDate(in7.getDate() + 7);
      const today = new Date().toISOString().slice(0, 10);
      const horizon = in7.toISOString().slice(0, 10);

      const [contractsRes, finesRes] = await Promise.all([
        supabase
          .from("contracts")
          .select("id, end_date, status, clients(full_name)")
          .lte("end_date", horizon)
          .gte("end_date", today)
          .neq("status", "Cancelled")
          .neq("status", "Completed"),
        supabase
          .from("fines")
          .select("id, amount, fine_date, fine_type, clients(full_name)")
          .eq("status", "Unpaid"),
      ]);

      if (cancelled) return;

      const next: Alert[] = [];
      contractsRes.data?.forEach((c: any) => {
        next.push({
          id: `contract:${c.id}`,
          kind: "contract",
          title: `Contract expiring ${c.end_date}`,
          subtitle: c.clients?.full_name ?? "Client",
          href: "/contracts",
        });
      });
      finesRes.data?.forEach((f: any) => {
        next.push({
          id: `fine:${f.id}`,
          kind: "fine",
          title: `Unpaid fine — AED ${Number(f.amount).toFixed(0)}`,
          subtitle: `${f.fine_type} · ${f.clients?.full_name ?? "Unassigned"}`,
          href: "/fines",
        });
      });
      setAlerts(next);
    };

    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [user]);

  const visible = alerts.filter((a) => !dismissed.has(a.id));
  const unread = visible.length;

  const markAllRead = () => {
    if (!user) return;
    const all = new Set([...dismissed, ...alerts.map((a) => a.id)]);
    setDismissed(all);
    localStorage.setItem(`alerts:dismissed:${user.id}`, JSON.stringify([...all]));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-auto">
          {visible.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              You're all caught up
            </p>
          ) : (
            visible.map((a) => (
              <Link
                key={a.id}
                to={a.href}
                className="flex items-start gap-3 border-b border-border px-3 py-2.5 last:border-0 hover:bg-accent"
              >
                <Badge
                  variant={a.kind === "fine" ? "destructive" : "secondary"}
                  className="mt-0.5 text-[10px]"
                >
                  {a.kind === "fine" ? "Fine" : "Contract"}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{a.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{a.subtitle}</p>
                </div>
              </Link>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
