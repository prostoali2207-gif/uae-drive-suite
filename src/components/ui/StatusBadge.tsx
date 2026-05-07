import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: "active" | "completed" | "overdue";
}

export function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  const badgeClass = cn(
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
    status === "active" && "bg-tint-green text-tint-green-foreground border-tint-green-foreground/20",
    status === "completed" && "bg-muted text-muted-foreground border-border",
    status === "overdue" && "bg-tint-rose text-tint-rose-foreground border-tint-rose-foreground/20",
    className
  );

  return (
    <span className={badgeClass} {...props}>
      {status}
    </span>
  );
}
