import { useState } from "react";
import { Copy, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function ContractSigningLinkButton({ contractId, disabled = false }: { contractId: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Signing link copied");
    } catch {
      toast.info("Link created. Select and copy the link below.");
    }
  };

  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc(
        "create_contract_signing_link" as never,
        { p_contract_id: contractId, p_valid_days: 7 } as never,
      );
      if (error) throw error;
      if (typeof data !== "string" || !data) throw new Error("Signing token missing");
      const url = `${window.location.origin}/sign/${encodeURIComponent(data)}`;
      setLink(url);
      await copy(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create signing link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled={disabled || busy} onClick={() => link ? void copy(link) : void create()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : link ? <Copy className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
        {busy ? "Creating…" : link ? "Copy signing link" : "Signing link"}
      </Button>
      {link && (
        <div className="flex min-w-0 items-center gap-2">
          <input aria-label="Client signing link" readOnly value={link} onFocus={(event) => event.currentTarget.select()} className="w-36 min-w-0 rounded border border-input bg-background px-2 py-1 text-xs sm:w-64" />
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => { setLink(""); }}>New link</button>
        </div>
      )}
    </div>
  );
}
