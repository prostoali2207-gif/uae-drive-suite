import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Pencil, Search } from "lucide-react";
import { ClientEditDialog } from "@/components/ClientEditDialog";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { createClientDocumentSignedUrl } from "@/lib/clientDocuments";
import { toast } from "sonner";

interface ClientRecord {
  id: string;
  full_name: string;
  phone: string;
  client_type: string;
  emirates_id: string;
  emirates_id_expiry: string | null;
  nationality: string;
  email: string | null;
  license_number: string;
  license_expiry: string | null;
  license_type: "uae" | "foreign" | "international" | null;
  license_issuing_country: string | null;
  traffic_file_number: string | null;
  passport_number: string | null;
  passport_expiry: string | null;
  date_of_birth: string | null;
  unified_number: string | null;
  gender: "male" | "female" | null;
  passport_photo_url: string | null;
  eid_front_url: string | null;
  eid_back_url: string | null;
  license_front_url: string | null;
  license_back_url: string | null;
}

interface ContractRow {
  id: string;
  car_id: string;
  start_date: string;
  end_date: string;
  total_amount: number;
  payment_status: string;
  status: string;
  cars: { plate: string; make: string; model: string } | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const statusClasses: Record<string, string> = {
  Active: "bg-tint-blue text-tint-blue-foreground",
  "Expiring Soon": "bg-tint-amber text-tint-amber-foreground",
  Overdue: "bg-tint-rose text-tint-rose-foreground",
  Completed: "bg-muted text-muted-foreground",
};

const InfoRow = ({ label, value }: { label: string; value?: string | null }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground">{value || "—"}</span>
  </div>
);

type DocumentPreviewState = { status: "loading" | "ready" | "unavailable"; signedUrl?: string };

const DocumentPreview = ({
  label,
  storedUrl,
  preview,
  opening,
  onOpen,
  onImageError,
}: {
  label: string;
  storedUrl: string;
  preview: DocumentPreviewState;
  opening: boolean;
  onOpen: () => void;
  onImageError: () => void;
}) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    <button
      type="button"
      onClick={onOpen}
      disabled={preview.status !== "ready" || opening}
      className="flex h-24 w-32 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-center text-xs text-muted-foreground disabled:cursor-default"
      aria-label={`Open ${label}`}
    >
      {preview.status === "loading" && <span className="animate-pulse">Loading preview...</span>}
      {preview.status === "unavailable" && <span className="px-2">Document unavailable</span>}
      {preview.status === "ready" && preview.signedUrl && (
        <img
          src={preview.signedUrl}
          alt={label}
          onError={onImageError}
          className={cn("h-full w-full object-cover", opening && "opacity-60")}
        />
      )}
    </button>
  </div>
);

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [findingUid, setFindingUid] = useState(false);
  const [clientRefreshKey, setClientRefreshKey] = useState(0);
  const [documentPreviews, setDocumentPreviews] = useState<Record<string, DocumentPreviewState>>({});
  const [openingDocument, setOpeningDocument] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const [clientRes, contractsRes] = await Promise.all([
        supabase.from("clients").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("contracts")
          .select("id, car_id, start_date, end_date, total_amount, payment_status, status, cars(plate, make, model)")
          .eq("client_id", id)
          .order("created_at", { ascending: false }),
      ]);
      if (clientRes.error) toast.error("Failed to load client");
      else {
        setClient(clientRes.data as unknown as ClientRecord);
        supabase
          .from("clients")
          .update({ is_new: false } as never)
          .eq("id", id)
          .then(() => {});
      }
      if (!contractsRes.error) setContracts((contractsRes.data as ContractRow[]) || []);
      setLoading(false);
    };
    fetchData();
  }, [id, clientRefreshKey]);

  const clientDocuments = useMemo(() => {
    if (!client) return [];
    return [
      ...(client.client_type === "Resident"
        ? [
            { label: "EID Front", storedUrl: client.eid_front_url },
            { label: "EID Back", storedUrl: client.eid_back_url },
          ]
        : [{ label: "Passport", storedUrl: client.passport_photo_url }]),
      { label: "License Front", storedUrl: client.license_front_url },
      { label: "License Back", storedUrl: client.license_back_url },
    ].filter((document): document is { label: string; storedUrl: string } => Boolean(document.storedUrl));
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    const initial = Object.fromEntries(
      clientDocuments.map(({ storedUrl }) => [storedUrl, { status: "loading" as const }]),
    );
    setDocumentPreviews(initial);

    clientDocuments.forEach(async ({ storedUrl }) => {
      try {
        const signedUrl = await createClientDocumentSignedUrl(storedUrl);
        if (!cancelled) {
          setDocumentPreviews((current) => ({ ...current, [storedUrl]: { status: "ready", signedUrl } }));
        }
      } catch {
        if (!cancelled) {
          setDocumentPreviews((current) => ({ ...current, [storedUrl]: { status: "unavailable" } }));
        }
      }
    });

    return () => { cancelled = true; };
  }, [clientDocuments]);

  const handleOpenDocument = async (storedUrl: string) => {
    if (openingDocument) return;
    setOpeningDocument(storedUrl);
    try {
      const signedUrl = await createClientDocumentSignedUrl(storedUrl);
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not open this document. Please try again.");
    } finally {
      setOpeningDocument(null);
    }
  };

  const callUidApi = async (token: string, body: Record<string, unknown>) => {
    const response = await fetch("/api/gdrfa-uid", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as { uid?: string; sessionId?: string; liveUrl?: string | null; error?: string };
    if (!response.ok) throw new Error(data.error || "UID lookup failed");
    return data;
  };

  const handleFindUid = async () => {
    if (!client) return;
    const passportNumber = client.passport_number?.trim() ?? "";
    const nationality = client.nationality.trim();

    if (!passportNumber || !nationality || !client.date_of_birth || !client.gender) {
      toast.error("Passport number, nationality, date of birth and gender are required");
      return;
    }

    setFindingUid(true);
    let liveWindow: Window | null = null;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Please sign in again");

      liveWindow = window.open("about:blank", "fleetdesk-gdrfa-uid");
      const started = await callUidApi(token, { action: "start" });
      if (!started.sessionId) throw new Error("Browser session was not created");

      if (started.liveUrl && liveWindow) {
        liveWindow.location.href = started.liveUrl;
      } else if (liveWindow) {
        liveWindow.close();
        liveWindow = null;
      }

      toast.info("Searching GDRFA. If CAPTCHA needs you, use the opened browser window.");

      const result = await callUidApi(token, {
        action: "run",
        sessionId: started.sessionId,
        passportNumber,
        nationality,
        dateOfBirth: client.date_of_birth,
        gender: client.gender,
      });

      if (!result.uid) throw new Error("GDRFA did not return a UID");

      const { error } = await supabase
        .from("clients")
        .update({ unified_number: result.uid } as never)
        .eq("id", client.id);
      if (error) throw error;

      setClient((current) => current ? { ...current, unified_number: result.uid ?? null } : current);
      toast.success(`UID found: ${result.uid}`);
      liveWindow?.close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "UID lookup failed");
    } finally {
      setFindingUid(false);
    }
  };

  const totals = useMemo(() => {
    const totalBilled = contracts.reduce((s, c) => s + Number(c.total_amount), 0);
    const totalPaid = contracts
      .filter((c) => c.payment_status === "Paid")
      .reduce((s, c) => s + Number(c.total_amount), 0);
    const totalOutstanding = Math.max(0, totalBilled - totalPaid);
    return { totalBilled, totalPaid, totalOutstanding };
  }, [contracts]);

  if (loading) {
    return (
      <DashboardLayout title="Client">
        <div className="h-24 text-center text-sm text-muted-foreground pt-10">Loading...</div>
      </DashboardLayout>
    );
  }

  if (!client) {
    return (
      <DashboardLayout title="Client not found">
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">This client does not exist.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/clients">Back to clients</Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={client.full_name} subtitle="Client details">
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground">
            <Link to="/clients">
              <ArrowLeft className="h-4 w-4" />
              Back to clients
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 gap-2 px-4 py-2 md:hidden"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </div>
        <ClientEditDialog
          client={client}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={() => setClientRefreshKey((key) => key + 1)}
        />

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground">Client Information</h2>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <InfoRow label="Full Name" value={client.full_name} />
            <InfoRow label="Phone" value={client.phone} />
            <InfoRow label="Email" value={client.email} />
            <InfoRow label="Date of Birth" value={formatDate(client.date_of_birth)} />
            <InfoRow label="Nationality" value={client.nationality} />
            <InfoRow label="Emirates ID" value={client.emirates_id} />
            <InfoRow label="License Number" value={client.license_number} />
            <InfoRow label="Licence Type" value={client.license_type === "uae" ? "UAE Licence" : client.license_type === "foreign" ? "Foreign Licence" : client.license_type === "international" ? "International Permit" : null} />
            <InfoRow label="Traffic File Number" value={client.traffic_file_number} />
            {client.license_type !== "uae" && <InfoRow label="Issuing Country" value={client.license_issuing_country} />}
            <InfoRow label="License Expiry" value={formatDate(client.license_expiry)} />
            <InfoRow label="Passport Number" value={client.passport_number} />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Unified Number (UID)</span>
              <div className="flex items-center gap-2">
                <span className="min-w-0 text-sm font-medium text-foreground">{client.unified_number || "—"}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="hidden h-8 shrink-0 gap-1.5 px-2.5 md:inline-flex"
                  onClick={handleFindUid}
                  disabled={findingUid}
                >
                  {findingUid ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  {findingUid ? "Searching..." : "Find UID"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground">Documents</h2>
          <div className="mt-4 flex flex-wrap gap-4">
            {clientDocuments.map(({ label, storedUrl }) => (
              <DocumentPreview
                key={`${label}-${storedUrl}`}
                label={label}
                storedUrl={storedUrl}
                preview={documentPreviews[storedUrl] ?? { status: "loading" }}
                opening={openingDocument === storedUrl}
                onOpen={() => handleOpenDocument(storedUrl)}
                onImageError={() => setDocumentPreviews((current) => ({
                  ...current,
                  [storedUrl]: { status: "unavailable" },
                }))}
              />
            ))}
            {clientDocuments.length === 0 && (
              <span className="text-sm text-muted-foreground italic">No documents uploaded.</span>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="text-xs text-muted-foreground">Total Billed</div>
            <div className="mt-1 text-xl font-semibold text-foreground">AED {totals.totalBilled.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="text-xs text-muted-foreground">Total Paid</div>
            <div className="mt-1 text-xl font-semibold text-tint-green-foreground">AED {totals.totalPaid.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="text-xs text-muted-foreground">Total Outstanding</div>
            <div className={cn(
              "mt-1 text-xl font-semibold",
              totals.totalOutstanding > 0 ? "text-tint-rose-foreground" : "text-foreground",
            )}>
              AED {totals.totalOutstanding.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Contracts</h2>
            <span className="text-xs text-muted-foreground">{contracts.length} total</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-5 text-xs">Car</TableHead>
                <TableHead className="text-xs">Start</TableHead>
                <TableHead className="text-xs">End</TableHead>
                <TableHead className="text-xs">Total</TableHead>
                <TableHead className="text-xs">Payment</TableHead>
                <TableHead className="px-5 text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                    No contracts yet.
                  </TableCell>
                </TableRow>
              ) : (
                contracts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="px-5">
                      <div className="font-mono text-xs text-foreground">{c.cars?.plate ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{c.cars ? `${c.cars.make} ${c.cars.model}` : ""}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(c.start_date)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(c.end_date)}</TableCell>
                    <TableCell className="text-sm font-medium text-foreground">AED {Number(c.total_amount).toLocaleString()}</TableCell>
                    <TableCell>
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        c.payment_status === "Paid"
                          ? "bg-tint-green text-tint-green-foreground"
                          : c.payment_status === "Partial"
                          ? "bg-tint-amber text-tint-amber-foreground"
                          : "bg-tint-rose text-tint-rose-foreground",
                      )}>
                        {c.payment_status}
                      </span>
                    </TableCell>
                    <TableCell className="px-5">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        statusClasses[c.status] ?? "bg-muted text-muted-foreground",
                      )}>
                        {c.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ClientDetail;