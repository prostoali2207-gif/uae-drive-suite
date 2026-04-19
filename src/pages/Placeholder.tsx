import { DashboardLayout } from "@/components/DashboardLayout";

interface PlaceholderProps {
  title: string;
}

const Placeholder = ({ title }: PlaceholderProps) => {
  return (
    <DashboardLayout title={title} subtitle="Coming soon">
      <div className="flex h-[60vh] items-center justify-center rounded-xl border border-dashed border-border bg-card">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This section is ready to be built out.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Placeholder;
