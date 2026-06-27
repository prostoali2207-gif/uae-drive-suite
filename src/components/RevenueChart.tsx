import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { supabase } from "@/integrations/supabase/client";

interface MonthBucket {
  month: string;
  revenue: number;
}

const config = {
  revenue: { label: "Revenue (AED)", color: "#5B6EF5" },
} satisfies ChartConfig;

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildLast6Months(): MonthBucket[] {
  const now = new Date();
  const buckets: MonthBucket[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ month: MONTH_LABELS[d.getMonth()], revenue: 0 });
  }
  return buckets;
}

export function RevenueChart() {
  const [data, setData] = useState<MonthBucket[]>(buildLast6Months());
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const load = async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const startStr = start.toISOString().slice(0, 10);

      const { data: payments, error } = await supabase
        .from("payments")
        .select("amount, payment_date, status")
        .eq("status", "Paid")
        .gte("payment_date", startStr);

      if (error || !payments) return;

      const buckets = buildLast6Months();
      const indexByKey = new Map<string, number>();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        indexByKey.set(`${d.getFullYear()}-${d.getMonth()}`, 5 - i);
      }

      let sum = 0;
      for (const p of payments) {
        const d = new Date(p.payment_date);
        const idx = indexByKey.get(`${d.getFullYear()}-${d.getMonth()}`);
        if (idx !== undefined) {
          buckets[idx].revenue += Number(p.amount);
          sum += Number(p.amount);
        }
      }
      setData(buckets);
      setTotal(sum);
    };
    load();
  }, []);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Revenue</h3>
          <p className="text-xs text-muted-foreground">Last 6 months · AED</p>
        </div>
        <span className="text-xs text-muted-foreground">
          Total: AED {total.toLocaleString("en-AE")}
        </span>
      </div>
      <ChartContainer config={config} className="h-[120px] w-full">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} className="text-xs" />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            className="text-xs"
          />
          <ChartTooltip cursor={{ fill: "hsl(var(--muted))" }} content={<ChartTooltipContent hideLabel={false} />} />
          <Bar dataKey="revenue" fill="#5B6EF5" radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
