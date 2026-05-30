import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tint = "blue" | "green" | "amber" | "rose" | "violet";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tint?: Tint;
  highlight?: Tint;
  containerClassName?: string;
  valueClassName?: string;
  labelClassName?: string;
}

const tintClasses: Record<Tint, string> = {
  blue: "bg-tint-blue text-tint-blue-foreground",
  green: "bg-tint-green text-tint-green-foreground",
  amber: "bg-tint-amber text-tint-amber-foreground",
  rose: "bg-tint-rose text-tint-rose-foreground",
  violet: "bg-tint-violet text-tint-violet-foreground",
};

const highlightClasses: Record<Tint, string> = {
  blue: "border-tint-blue-foreground/30 bg-tint-blue/40",
  green: "border-tint-green-foreground/30 bg-tint-green/40",
  amber: "border-tint-amber-foreground/30 bg-tint-amber/40",
  rose: "border-tint-rose-foreground/30 bg-background-surface",
  violet: "border-tint-violet-foreground/30 bg-tint-violet/40",
};

export function StatCard({ label, value, icon: Icon, tint = "blue", highlight, containerClassName, valueClassName, labelClassName }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/15",
        highlight && highlightClasses[highlight],
        containerClassName,
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-medium text-muted-foreground", labelClassName)}>{label}</span>
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            tintClasses[tint]
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className={cn("mt-4 text-2xl font-semibold tracking-tight text-foreground", valueClassName)}>
        {value}
      </div>
    </div>
  );
}
