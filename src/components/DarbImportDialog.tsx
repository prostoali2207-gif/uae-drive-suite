import { useMemo, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DARB_HEADERS, commitDarb, parseDarbFile, parseDarbText, previewDarb, type DarbPreviewRow, type DarbImportResult } from "@/lib/darbImport";

interface DarbImportDialogProps {
  onImported: () => void;
}

export function DarbImportDialog({ onImported }: DarbImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<DarbPreviewRow[] | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<DarbImportResult | null>(null);

  const counts = useMemo(() => {
    const all = rows ?? [];
    return {
      total: all.length,
      ready: all.filter((r) => r.status === "ready").length,
      unlinked: all.filter((r) => r.status === "unlinked").length,
      duplicate: all.filter((r) => r.status === "duplicate").length,
      invalid: all.filter((r) => r.status === "invalid").length,
      amount: all.filter((r) => r.status === "ready" || r.status === "unlinked")
        .reduce((sum, r) => sum + r.amount, 0),
    };
  }, [rows]);

  const reset = () => {
    setFile(null);
    setText("");
    setRows(null);
    setError("");
    setResult(null);
    setWorking(false);
  };

  const downloadTemplate = () => {
    const blob = new Blob([DARB_HEADERS + "\r\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "darb-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePreview = async () => {
    if (!file && !text.trim()) {
      setError("Select a CSV/Excel file or paste CSV rows.");
      return;
    }
    setWorking(true);
    setError("");
    setRows(null);
    setResult(null);
    try {
      const parsed = file ? await parseDarbFile(file) : parseDarbText(text);
      if (!parsed.length) throw new Error("No Darb transactions found.");
      if (parsed.length > 5000) throw new Error("Import at most 5,000 transactions per batch.");
      setRows(await previewDarb(parsed));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to preview this file.");
    } finally {
      setWorking(false);
    }
  };

  const handleImport = async () => {
    if (!rows || working || counts.ready + counts.unlinked === 0) return;
    setWorking(true);
    setError("");
    try {
      const response = await commitDarb(rows);
      setResult(response);
      if (response.inserted > 0) onImported();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Darb import failed.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!working) { setOpen(next); if (!next) reset(); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full gap-1.5 md:w-auto">
          <Upload className="h-4 w-4" />
          Import Darb
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Darb toll crossings</DialogTitle>
          <DialogDescription>
            One fixed format. Preview every charge before saving. Matching uses the exact UAE crossing time and vehicle history.
          </DialogDescription>
        </DialogHeader>

        {!rows && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">Darb CSV / Excel</span>
              <Button type="button" size="sm" variant="ghost" onClick={downloadTemplate} className="gap-1.5">
                <Download className="h-4 w-4" /> CSV template
              </Button>
            </div>
            <Input
              aria-label="Darb CSV or Excel file"
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(""); }}
            />
            <div className="text-center text-xs text-muted-foreground">or paste CSV with the same headers</div>
            <Textarea
              aria-label="Paste Darb CSV"
              rows={5}
              placeholder={DARB_HEADERS}
              value={text}
              onChange={(e) => { setText(e.target.value); setError(""); }}
            />
            <div className="text-xs text-muted-foreground">
              Required: Plate, Date (YYYY-MM-DD), Time (HH:mm), Gate, Amount (AED). Transaction ID is optional. One crossing per row.
              Service fee: AED 0 (only the original Darb amount is recorded).
            </div>
          </div>
        )}

        {rows && !result && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">Ready</div><div className="text-lg font-semibold">{counts.ready}</div></div>
              <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">Unlinked</div><div className="text-lg font-semibold">{counts.unlinked}</div></div>
              <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">Duplicates</div><div className="text-lg font-semibold">{counts.duplicate}</div></div>
              <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">Invalid</div><div className="text-lg font-semibold">{counts.invalid}</div></div>
            </div>
            <div className="text-sm text-foreground">
              {counts.total} rows checked · <strong>AED {counts.amount.toFixed(2)}</strong> to import
            </div>
            <div className="max-h-60 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted text-muted-foreground">
                  <tr><th className="p-2">Row</th><th className="p-2">Plate · date / time</th><th className="p-2">AED</th><th className="p-2">Result</th></tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((row) => (
                    <tr key={row.line} className="border-t border-border">
                      <td className="p-2 font-mono">{row.line}</td>
                      <td className="p-2"><span className="font-mono">{row.plate}</span><div className="text-muted-foreground">{row.date} · {row.time}</div></td>
                      <td className="p-2 font-mono tabular-nums">{row.amount.toFixed(2)}</td>
                      <td className="p-2"><div className="font-medium">{row.status}</div><div className="text-muted-foreground">{row.contractLabel || row.message}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 100 && <div className="border-t border-border p-2 text-xs text-muted-foreground">Showing first 100 of {counts.total}; all rows were checked.</div>}
            </div>
            {counts.unlinked > 0 && (
              <div className="text-xs text-tint-amber-foreground">
                {counts.unlinked} transactions have no matching rental. They will remain unpaid and unlinked for manual review, not assigned to a customer.
              </div>
            )}
            {counts.invalid > 0 && (
              <div className="text-xs text-tint-rose-foreground">
                Invalid rows are excluded from import. Correct the source file and preview again.
              </div>
            )}
            <Button type="button" size="sm" variant="outline" onClick={() => setRows(null)} disabled={working}>Change file</Button>
          </div>
        )}

        {result && (
          <div className="space-y-2 text-sm">
            <div className="font-medium">Darb import finished</div>
            <div>Imported: {result.inserted} · Duplicates skipped: {result.duplicate} · Failed: {result.failed}</div>
            {counts.invalid > 0 && <div>Invalid rows excluded: {counts.invalid}</div>}
            {result.errors.map((message, index) => <div key={index} className="text-tint-rose-foreground">{message}</div>)}
          </div>
        )}
        {error && <div role="alert" className="text-sm text-tint-rose-foreground">{error}</div>}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => { setOpen(false); reset(); }} disabled={working}>{result ? "Close" : "Cancel"}</Button>
          {!result && <Button type="button" onClick={rows ? handleImport : handlePreview} disabled={working || (!!rows && counts.ready + counts.unlinked === 0)}>
            {working ? "Working..." : rows ? `Import ${counts.ready + counts.unlinked} charges` : "Preview charges"}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
