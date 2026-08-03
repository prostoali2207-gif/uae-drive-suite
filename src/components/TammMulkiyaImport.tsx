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

type ScanVehicle = {
  id: string;
  plate: string;
  status: string;
};

type ScanResult = {
  loggedIn: boolean;
  totalFleetVehicles: number;
  found: ScanVehicle[];
  missing: ScanVehicle[];
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
  const [scanning, setScanning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

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
      toast.success("TAMM opened. Complete UAE Pass login, then return here.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open TAMM");
    } finally {
      setStarting(false);
    }
  };

  const scan = async () => {
    if (!sessionId) return;
    setScanning(true);
    try {
      const response = (await callTammAgent({ action: "scan", sessionId })) as unknown as ScanResult;
      setResult(response);
      if (!response.loggedIn) {
        toast.error("UAE Pass login is not complete yet");
      } else {
        toast.success(`Found ${response.found.length} of ${response.totalFleetVehicles} active FleetDesk vehicles`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not scan TAMM vehicles");
    } finally {
      setScanning(false);
    }
  };

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
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Import Mulkiya from TAMM</DialogTitle>
          <DialogDescription>
            Opens a secure browser session. Sold vehicles are excluded. Existing documents are not changed during this scan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!sessionId ? (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              First open TAMM and approve the UAE Pass login. Then return to this window and run the scan.
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
                <Button size="sm" onClick={scan} disabled={scanning}>
                  {scanning && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  I completed UAE Pass — Scan vehicles
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The scan only compares TAMM vehicle plates with active FleetDesk vehicles.
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-md border p-2">
                  <div className="font-semibold">{result.totalFleetVehicles}</div>
                  <div className="text-xs text-muted-foreground">FleetDesk</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="font-semibold">{result.found.length}</div>
                  <div className="text-xs text-muted-foreground">Found</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="font-semibold">{result.missing.length}</div>
                  <div className="text-xs text-muted-foreground">Missing</div>
                </div>
              </div>

              {result.missing.length > 0 && (
                <div className="rounded-lg border border-border p-3">
                  <div className="mb-2 text-sm font-medium">Not found in TAMM</div>
                  <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                    {result.missing.map((vehicle) => (
                      <span key={vehicle.id} className="rounded-md bg-muted px-2 py-1 text-xs">
                        {vehicle.plate}
                      </span>
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
            <Button variant="outline" onClick={start} disabled={starting || scanning}>
              Start a new session
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
