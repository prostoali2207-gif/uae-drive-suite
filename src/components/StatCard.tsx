import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tint = "blue" | "green" | "amber" | "rose" | "violet";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tint?: Tint;
  highlight?: Tint;
}

const tintClasses: Record<Tint, string> = {
  blue: "bg-tint-blue text-tint-blue-foreground",
  green: "bg-tint-green text-tint-green-foreground",
  amber: "bg-tint-amber text-tint-amber-foreground",
  rose: "bg-tint-rose text-tint-rose-foreground",
  violet: "bg-tint-violet text-tint-violet-foreground",
};

export function StatCard({ label, value, icon: Icon, tint = "blue" }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/15">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            tintClasses[tint]
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </div>
    </div>
  );
}
