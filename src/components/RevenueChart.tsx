import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const data = [
  { month: "Nov", revenue: 182000 },
  { month: "Dec", revenue: 215000 },
  { month: "Jan", revenue: 198000 },
  { month: "Feb", revenue: 234000 },
  { month: "Mar", revenue: 261000 },
  { month: "Apr", revenue: 248000 },
];

const config = {
  revenue: { label: "Revenue (AED)", color: "hsl(var(--foreground))" },
} satisfies ChartConfig;

export function RevenueChart() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Revenue</h3>
          <p className="text-xs text-muted-foreground">Last 6 months · AED</p>
        </div>
        <span className="text-xs text-muted-foreground">Total: AED 1,338,000</span>
      </div>
      <ChartContainer config={config} className="h-[220px] w-full">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            className="text-xs"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            className="text-xs"
          />
          <ChartTooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            content={<ChartTooltipContent hideLabel={false} />}
          />
          <Bar dataKey="revenue" fill="hsl(var(--foreground))" radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
