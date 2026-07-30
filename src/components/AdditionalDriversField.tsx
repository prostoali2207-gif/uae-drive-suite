import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface AdditionalDriverOption {
  id: string;
  full_name: string;
  license_number: string;
  license_expiry: string | null;
}

interface AdditionalDriversFieldProps {
  clients: AdditionalDriverOption[];
  primaryClientId: string;
  value: string[];
  onChange: (clientIds: string[]) => void;
}

function formatExpiry(value: string | null): string {
  if (!value) return "No expiry date";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isExpired(value: string | null): boolean {
  if (!value) return false;
  const expiry = new Date(`${value}T23:59:59`);
  return expiry.getTime() < Date.now();
}

export function AdditionalDriversField({
  clients,
  primaryClientId,
  value,
  onChange,
}: AdditionalDriversFieldProps) {
  const selected = value
    .map((id) => clients.find((client) => client.id === id))
    .filter((client): client is AdditionalDriverOption => Boolean(client));

  const available = clients.filter(
    (client) => client.id !== primaryClientId && !value.includes(client.id),
  );

  const addDriver = (client: AdditionalDriverOption) => {
    if (!client.license_number.trim() || isExpired(client.license_expiry)) return;
    onChange([...value, client.id]);
  };

  const removeDriver = (clientId: string) => {
    onChange(value.filter((id) => id !== clientId));
  };

  return (
    <div className="grid gap-2 rounded-lg border border-slate-300 bg-white p-3 text-slate-950">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label className="text-slate-900">Additional drivers</Label>
          <p className="mt-0.5 text-xs text-slate-500">
            Existing clients only. They do not become responsible for payment or deposit.
          </p>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="gap-1.5 !border-cyan-500 !bg-white !text-slate-900">
              <Plus className="h-3.5 w-3.5" />
              Add driver
              <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="z-[110] w-[min(340px,calc(100vw-1.5rem))] !border-cyan-500 !bg-white p-0 !text-slate-950 shadow-xl" align="end" sideOffset={6} collisionPadding={12}>
            <Command className="!bg-white !text-slate-950">
              <CommandInput placeholder="Search existing client..." />
              <CommandList className="max-h-64 !bg-white">
                <CommandEmpty>No eligible clients found.</CommandEmpty>
                <CommandGroup>
                  {available.map((client) => {
                    const missingLicense = !client.license_number.trim();
                    const expired = isExpired(client.license_expiry);
                    const disabled = missingLicense || expired;
                    return (
                      <CommandItem
                        key={client.id}
                        value={`${client.full_name} ${client.license_number}`}
                        disabled={disabled}
                        onSelect={() => addDriver(client)}
                        className="items-start gap-2 !text-slate-950 data-[selected=true]:!bg-cyan-50"
                      >
                        <Check className={cn("mt-0.5 h-4 w-4", value.includes(client.id) ? "opacity-100" : "opacity-0")} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{client.full_name}</div>
                          <div className={cn("text-xs", disabled ? "text-red-600" : "text-slate-500")}>
                            {missingLicense
                              ? "Driver license is missing"
                              : expired
                                ? `License expired ${formatExpiry(client.license_expiry)}`
                                : `${client.license_number} · expires ${formatExpiry(client.license_expiry)}`}
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {selected.length === 0 ? (
        <div className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-500">
          No additional drivers
        </div>
      ) : (
        <div className="grid gap-2">
          {selected.map((driver, index) => (
            <div key={driver.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {index + 1}. {driver.full_name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {driver.license_number} · expires {formatExpiry(driver.license_expiry)}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label={`Remove ${driver.full_name}`}
                onClick={() => removeDriver(driver.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
