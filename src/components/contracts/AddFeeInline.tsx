import { Check, X } from "lucide-react";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const FEE_CATEGORIES = ["Delivery", "Pickup", "Fuel", "Extra Mileage", "Damage", "Detailing", "Other"] as const;

type FeeCategory = (typeof FEE_CATEGORIES)[number];

export type AddFeeInlineFee = {
  category: FeeCategory;
  label: string;
  amount: number;
  note: string;
};

type AddFeeInlineProps = {
  onSave: (fee: AddFeeInlineFee) => void;
  onCancel: () => void;
  className?: string;
};

export function AddFeeInline({ onSave, onCancel, className }: AddFeeInlineProps) {
  const [category, setCategory] = useState<FeeCategory>("Delivery");
  const [customLabel, setCustomLabel] = useState("Other");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const label = category === "Other" ? customLabel.trim() : category;
  const parsedAmount = Number(amount);
  const canSave = label.length > 0 && Number.isFinite(parsedAmount) && parsedAmount > 0;

  const handleCategoryChange = (nextCategory: FeeCategory) => {
    setCategory(nextCategory);
    if (nextCategory === "Other" && customLabel.trim().length === 0) {
      setCustomLabel("Other");
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSave) {
      return;
    }

    onSave({
      category,
      label,
      amount: parsedAmount,
      note: note.trim(),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "mx-auto flex w-full max-w-screen-sm flex-col rounded-xl border border-border bg-background p-4 shadow-lg",
        "md:mx-0 md:max-w-none md:flex-row md:items-end md:gap-3 md:rounded-lg md:p-3 md:shadow-sm",
        className,
      )}
    >
      <div className="min-w-0 md:w-44 md:shrink-0">
        <Select value={category} onValueChange={(value) => handleCategoryChange(value as FeeCategory)}>
          <SelectTrigger className="h-11 md:h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FEE_CATEGORIES.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {category === "Other" && (
        <Input
          value={customLabel}
          onChange={(event) => setCustomLabel(event.target.value)}
          placeholder="Fee label"
          className="mt-3 h-11 md:mt-0 md:h-10 md:w-40 md:shrink-0"
        />
      )}

      <div className="relative mt-3 md:mt-0 md:w-36 md:shrink-0">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm font-medium text-muted-foreground">
          AED
        </span>
        <Input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          className="h-11 pl-12 text-right font-mono tabular-nums md:h-10"
        />
      </div>

      <Input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note (optional)"
        className="mt-3 h-11 md:mt-0 md:h-10 md:min-w-40 md:flex-1"
      />

      <div className="mt-4 grid shrink-0 grid-cols-2 gap-2 md:mt-0 md:flex md:shrink-0">
        <Button type="button" variant="outline" onClick={onCancel} className="h-11 md:h-10">
          <X className="h-4 w-4" />
          Cancel
        </Button>
        <Button type="submit" disabled={!canSave} className="h-11 md:h-10">
          <Check className="h-4 w-4" />
          Save
        </Button>
      </div>
    </form>
  );
}

export default AddFeeInline;
