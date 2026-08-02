import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COUNTRIES, PRIORITY_COUNTRIES } from "@/data/countries";

interface NationalityComboboxProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

export const NationalityCombobox = ({ value, onChange, id }: NationalityComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { common, others } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (c: string) => (q ? c.toLowerCase().includes(q) : true);
    return {
      common: PRIORITY_COUNTRIES.filter(match),
      others: COUNTRIES.filter((c) => !PRIORITY_COUNTRIES.includes(c) && match(c)),
    };
  }, [search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-10 w-full justify-between font-normal"
        >
          <span className={cn(!value && "text-muted-foreground")}>
            {value || "Select nationality"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] !border-slate-200 !bg-white p-0 !text-slate-950 shadow-xl"
        align="start"
      >
        <Command shouldFilter={false} className="!bg-white !text-slate-950">
          <CommandInput
            className="!text-slate-950 placeholder:!text-slate-500"
            placeholder="Search country..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="!bg-white">
            <CommandEmpty className="!text-slate-500">No country found.</CommandEmpty>
            {common.length > 0 && (
              <CommandGroup heading="Common">
                {common.map((c) => (
                  <CommandItem
                    key={c}
                    value={c}
                    className="!text-slate-950 data-[selected=true]:!bg-blue-50 data-[selected=true]:!text-slate-950"
                    onSelect={() => {
                      onChange(c);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === c ? "opacity-100" : "opacity-0")} />
                    {c}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {others.length > 0 && (
              <CommandGroup heading="All countries">
                {others.map((c) => (
                  <CommandItem
                    key={c}
                    value={c}
                    className="!text-slate-950 data-[selected=true]:!bg-blue-50 data-[selected=true]:!text-slate-950"
                    onSelect={() => {
                      onChange(c);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === c ? "opacity-100" : "opacity-0")} />
                    {c}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
