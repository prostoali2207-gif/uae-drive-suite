import { useEffect, useState } from "react";
import { CheckCircle2, Download, Loader2 } from "lucide-react";
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

type ProgressSummary = {
  imported: number;
  skipped: number;
  notFound: number;
  failed: number;
  items: Array<{ plate: string; status: string; message?: string }>;
};

type HelperProgress = {
  state: "running" | "done" | "error";
  total?: number;
  current?: number;
  message?: string;
  summary?: ProgressSummary;
};

export function TammMulkiyaImport() {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [helperReady, setHelperReady] = useState(false);
  const [progress, setProgress] = useState<HelperProgress | null>(null);

  const checkHelper = () => {
    setChecking(true);
    setHelperReady(false);
    window.postMessage({ type: "FLEETDESK_TAMM_PING" }, "*");
    window.postMessage({ type: "FLEETDESK_TAMM_GET_PROGRESS" }, "*");
    window.setTimeout(() => setChecking(false), 1200);
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || !event.data) return;
      if (event.data.type === "FLEETDESK_TAMM_PONG" && event.data.response?.ok) {
        setHelperReady(true);
        setChecking(false);
      }
      if (event.data.type === "FLEETDESK_TAMM_CONFIGURED") {
        setStarting(false);
        if (event.data.response?.ok) {
          toast.success("TAMM opened in your normal Chrome");
        } else {
          toast.error(event.data.response?.error || "Chrome helper could not start");
        }
      }
      if (event.data.type === "FLEETDESK_TAMM_PROGRESS" && event.data.payload) {
        setProgress(event.data.payload as HelperProgress);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (open) checkHelper();
  }, [open]);

  const start = async () => {
    setStarting(true);
    setProgress(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setStarting(false);
      toast.error("You must be signed in");
      return;
    }

    window.postMessage({
      type: "FLEETDESK_TAMM_CONFIGURE",
      token,
      apiBase: window.location.origin,
    }, "*");

    window.setTimeout(() => {
      setStarting((current) => {
        if (current) toast.error("Chrome helper did not respond");
        return false;
      });
    }, 4000);
  };

  const summary = progress?.summary;
  const failedItems = summary?.items.filter((item) => item.status === "failed") ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 bg-transparent">
          Import Mulkiya from TAMM
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Import Mulkiya from TAMM</DialogTitle>
          <DialogDescription>
            Uses your normal Chrome login. Only active FleetDesk vehicles are processed. Sold vehicles and existing Mulkiya files are skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!helperReady ? (
            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
              <div className="text-sm font-medium">One-time setup</div>
              <ol className="space-y-1 text-sm text-muted-foreground">
                <li>1. Download and unzip the Chrome Helper.</li>
                <li>2. Open <span className="font-medium text-foreground">chrome://extensions</span>.</li>
                <li>3. Enable Developer mode, choose Load unpacked, and select the unzipped folder.</li>
              </ol>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" className="gap-1.5">
                  <a href="/api/tamm-helper-download">
                    <Download className="h-4 w-4" />
                    Download Chrome Helper
                  </a>
                </Button>
                <Button size="sm" variant="outline" onClick={checkHelper} disabled={checking}>
                  {checking && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Check installation
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4" />
                Chrome Helper connected
              </div>
              <p className="text-sm text-muted-foreground">
                Start the process, sign in to TAMM normally, select Al Musafir Car Rental, then press Start import in the small FleetDesk panel inside TAMM.
              </p>
              <Button onClick={start} disabled={starting}>
                {starting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Open TAMM in Chrome
              </Button>
            </div>
          )}

          {progress && (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">
                  {progress.state === "running" ? "Import in progress" : progress.state === "done" ? "Import finished" : "Import stopped"}
                </span>
                {typeof progress.current === "number" && typeof progress.total === "number" && (
                  <span className="text-muted-foreground">{progress.current}/{progress.total}</span>
                )}
              </div>

              {progress.message && <p className="text-sm text-destructive">{progress.message}</p>}

              {summary && (
                <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
                  <div className="rounded-md border p-2"><div className="font-semibold">{summary.imported}</div><div className="text-xs text-muted-foreground">Imported</div></div>
                  <div className="rounded-md border p-2"><div className="font-semibold">{summary.skipped}</div><div className="text-xs text-muted-foreground">Skipped</div></div>
                  <div className="rounded-md border p-2"><div className="font-semibold">{summary.notFound}</div><div className="text-xs text-muted-foreground">Not found</div></div>
                  <div className="rounded-md border p-2"><div className="font-semibold">{summary.failed}</div><div className="text-xs text-muted-foreground">Failed</div></div>
                </div>
              )}

              {failedItems.length > 0 && (
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-destructive/30 p-3 text-xs">
                  {failedItems.map((item) => (
                    <div key={`${item.plate}-${item.message}`}><span className="font-medium">{item.plate}</span>{item.message ? ` — ${item.message}` : ""}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
