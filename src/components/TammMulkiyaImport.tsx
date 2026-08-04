import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";

type ImportItem = {
  id: string;
  plate: string;
  status: "imported" | "skipped" | "not_found" | "failed";
  message?: string;
};

type ImportResult = {
  totalFleetVehicles: number;
  imported: number;
  skipped: number;
  notFound: number;
  failed: number;
  results: ImportItem[];
};

async function callTammAgent(body: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You must be signed in");

  const response = await fetch("/api/tamm-mulkiya", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const result = (await response.json()) as { error?: string } & Record<string, unknown>;
  if (!response.ok) throw new Error(result.error || "TAMM agent failed");
  return result;
}

export function TammMulkiyaImport() {
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setSessionId(null);
    setLiveUrl(null);
    setResult(null);
  };

  const start = async () => {
    setStarting(true);
    setResult(null);
    try {
      const response = await callTammAgent({ action: "start" });
      const nextSessionId = String(response.sessionId || "");
      const nextLiveUrl = response.liveUrl ? String(response.liveUrl) : null;
      if (!nextSessionId) throw new Error("Browser session was not created");

      setSessionId(nextSessionId);
      setLiveUrl(nextLiveUrl);
      if (nextLiveUrl) window.open(nextLiveUrl, "_blank", "noopener,noreferrer");
      toast.success("TAMM opened. Sign in and select the company profile.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open TAMM");
    } finally {
      setStarting(false);
    }
  };

  const runImport = async () => {
    if (!sessionId) return;
    setImporting(true);
    setResult(null);
    try {
      const response = (await callTammAgent({ action: "import", sessionId })) as unknown as ImportResult;
      setResult(response);
      if (response.failed > 0) {
        toast.error(`Imported ${response.imported}. Failed ${response.failed}.`);
      } else {
        toast.success(`Imported ${response.imported} Mulkiya documents`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import Mulkiya documents");
    } finally {
      setImporting(false);
    }
  };

  const failedItems = result?.results.filter((item) => item.status === "failed") ?? [];
  const missingItems = result?.results.filter((item) => item.status === "not_found") ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 bg-transparent">
          Import Mulkiya from TAMM
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Import Mulkiya from TAMM</DialogTitle>
          <DialogDescription>
            Imports only active FleetDesk vehicles. Sold vehicles are excluded, and existing Mulkiya files are skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!sessionId ? (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Open TAMM, complete UAE Pass login, then select the Al Musafir Car Rental traffic profile.
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                {liveUrl && (
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <a href={liveUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Open TAMM session
                    </a>
                  </Button>
                )}
                <Button size="sm" onClick={runImport} disabled={importing}>
                  {importing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  I selected the company — Import Mulkiya
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Keep the TAMM session open until the import finishes. The agent searches only FleetDesk plate numbers.
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-5">
                <div className="rounded-md border p-2">
                  <div className="font-semibold">{result.totalFleetVehicles}</div>
                  <div className="text-xs text-muted-foreground">FleetDesk</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="font-semibold">{result.imported}</div>
                  <div className="text-xs text-muted-foreground">Imported</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="font-semibold">{result.skipped}</div>
                  <div className="text-xs text-muted-foreground">Already had</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="font-semibold">{result.notFound}</div>
                  <div className="text-xs text-muted-foreground">Not found</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="font-semibold">{result.failed}</div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
              </div>

              {missingItems.length > 0 && (
                <div className="rounded-lg border border-border p-3">
                  <div className="mb-2 text-sm font-medium">Not found in TAMM</div>
                  <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                    {missingItems.map((item) => (
                      <span key={item.id} className="rounded-md bg-muted px-2 py-1 text-xs">
                        {item.plate}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {failedItems.length > 0 && (
                <div className="rounded-lg border border-destructive/30 p-3">
                  <div className="mb-2 text-sm font-medium">Needs attention</div>
                  <div className="max-h-36 space-y-2 overflow-y-auto text-xs">
                    {failedItems.map((item) => (
                      <div key={item.id}>
                        <span className="font-medium">{item.plate}</span>
                        {item.message ? ` — ${item.message}` : ""}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!sessionId ? (
            <Button onClick={start} disabled={starting}>
              {starting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Open TAMM
            </Button>
          ) : (
            <Button variant="outline" onClick={start} disabled={starting || importing}>
              Start a new session
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
