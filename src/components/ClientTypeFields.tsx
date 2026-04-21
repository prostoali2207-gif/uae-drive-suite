import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type ClientType = "Resident" | "Tourist";

export interface ClientTypeFieldsValue {
  client_type: ClientType;
  emirates_id: string;
  emirates_id_expiry: string;
  passport_number: string;
  passport_expiry: string;
}

interface Props {
  value: ClientTypeFieldsValue;
  onChange: (next: ClientTypeFieldsValue) => void;
  idPrefix?: string;
  compact?: boolean;
}

export const ClientTypeFields = ({ value, onChange, idPrefix = "ct", compact = false }: Props) => {
  const set = (patch: Partial<ClientTypeFieldsValue>) => onChange({ ...value, ...patch });

  return (
    <div className={cn("col-span-2 grid gap-3", compact && "gap-2")}>
      <div className="grid gap-1.5">
        <Label className={cn(compact && "text-xs")}>Client Type</Label>
        <div className="inline-flex w-full rounded-lg border border-border bg-card p-1">
          {(["Resident", "Tourist"] as ClientType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set({ client_type: t })}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                value.client_type === t
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {value.client_type === "Resident" ? (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor={`${idPrefix}-eid`} className={cn(compact && "text-xs")}>Emirates ID</Label>
              <Input
                id={`${idPrefix}-eid`}
                required
                value={value.emirates_id}
                onChange={(e) => set({ emirates_id: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${idPrefix}-eidexp`} className={cn(compact && "text-xs")}>Emirates ID Expiry</Label>
              <Input
                id={`${idPrefix}-eidexp`}
                type="date"
                required
                value={value.emirates_id_expiry}
                onChange={(e) => set({ emirates_id_expiry: e.target.value })}
              />
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor={`${idPrefix}-pass`} className={cn(compact && "text-xs")}>Passport Number</Label>
              <Input
                id={`${idPrefix}-pass`}
                required
                value={value.passport_number}
                onChange={(e) => set({ passport_number: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${idPrefix}-passexp`} className={cn(compact && "text-xs")}>Passport Expiry</Label>
              <Input
                id={`${idPrefix}-passexp`}
                type="date"
                required
                value={value.passport_expiry}
                onChange={(e) => set({ passport_expiry: e.target.value })}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
