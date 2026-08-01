import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Download, FilePlus2, FileText, Loader2, Pencil, RefreshCw, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { createSharjahBlackPointsPdf } from "@/lib/sharjahBlackPointsPdf";

const BUCKET = "external-form-templates";
const BUNDLED_PREFIX = "bundled:";

const categories = {
  fines: "Fines",
  impound: "Impound",
  police: "Police",
  other: "Other",
} as const;

type Category = keyof typeof categories;

type FineOption = {
  id: string;
  fine_number: string | null;
  fine_date: string;
  black_points: number | null;
  source: string;
  contract_id: string | null;
  clients: { full_name: string; phone: string; license_number: string | null; nationality: string | null } | null;
  cars: { plate: string; make: string; model: string } | null;
  contracts: { id: string; start_date: string; start_time: string | null; end_date: string; end_time: string | null } | null;
};

type ExternalFormTemplate = {
  id: string;
  owner_id: string;
  name: string;
  category: Category;
  emirate: string | null;
  authority: string | null;
  description: string | null;
  recipient_email: string | null;
  storage_path: string;
  original_file_name: string;
  created_at: string;
  updated_at: string;
};

type ExternalFormsDatabase = {
  public: {
    Tables: {
      external_form_templates: {
        Row: ExternalFormTemplate;
        Insert: Omit<ExternalFormTemplate, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<ExternalFormTemplate, "id" | "owner_id" | "created_at">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const formsClient = supabase as unknown as SupabaseClient<ExternalFormsDatabase>;

const initialForm = {
  name: "Sharjah — Black Points Transfer",
  category: "fines" as Category,
  emirate: "Sharjah",
  authority: "Sharjah Police",
  recipientEmail: "",
};

const ExternalForms = () => {
  const [templates, setTemplates] = useState<ExternalFormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | Category>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ExternalFormTemplate | null>(null);
  const [editForm, setEditForm] = useState(initialForm);
  const [fillTemplate, setFillTemplate] = useState<ExternalFormTemplate | null>(null);
  const [fineOptions, setFineOptions] = useState<FineOption[]>([]);
  const [selectedFineId, setSelectedFineId] = useState("");
  const [loadingFines, setLoadingFines] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await formsClient
      .from("external_form_templates")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      setLoadError(error.message);
      setTemplates([]);
    } else {
      setTemplates(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const filteredTemplates = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return templates.filter((template) => {
      const matchesCategory = category === "all" || template.category === category;
      const searchable = [template.name, template.emirate, template.authority, template.recipient_email]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return matchesCategory && (!term || searchable.includes(term));
    });
  }, [category, search, templates]);

  const resetDialog = () => {
    setForm(initialForm);
    setFile(null);
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      toast.error("Choose a PDF template");
      return;
    }
    if (file.type !== "application/pdf" || file.size > 10 * 1024 * 1024) {
      toast.error("Use a PDF file up to 10 MB");
      return;
    }

    setSaving(true);
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      toast.error("Your session expired. Sign in again.");
      setSaving(false);
      return;
    }

    const storagePath = `${user.id}/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadError) {
      toast.error(`Upload failed: ${uploadError.message}`);
      setSaving(false);
      return;
    }

    const { error: insertError } = await formsClient.from("external_form_templates").insert({
      owner_id: user.id,
      name: form.name.trim(),
      category: form.category,
      emirate: form.emirate.trim() || null,
      authority: form.authority.trim() || null,
      description: null,
      recipient_email: form.recipientEmail.trim() || null,
      storage_path: storagePath,
      original_file_name: file.name,
    });

    if (insertError) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      toast.error(`Could not save template: ${insertError.message}`);
      setSaving(false);
      return;
    }

    toast.success("Template added");
    setSaving(false);
    setDialogOpen(false);
    resetDialog();
    await loadTemplates();
  };

  const handleDownload = async (template: ExternalFormTemplate) => {
    setBusyId(template.id);
    if (template.storage_path.startsWith(BUNDLED_PREFIX)) {
      const anchor = document.createElement("a");
      anchor.href = template.storage_path.slice(BUNDLED_PREFIX.length);
      anchor.download = template.original_file_name;
      anchor.rel = "noopener";
      anchor.click();
      setBusyId(null);
      return;
    }
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(template.storage_path, 60);
    if (error || !data?.signedUrl) {
      toast.error(`Could not open PDF: ${error?.message ?? "Unknown error"}`);
    } else {
      const anchor = document.createElement("a");
      anchor.href = data.signedUrl;
      anchor.download = template.original_file_name;
      anchor.rel = "noopener";
      anchor.click();
    }
    setBusyId(null);
  };

  const handleReplace = async (template: ExternalFormTemplate, event: ChangeEvent<HTMLInputElement>) => {
    const replacement = event.target.files?.[0];
    event.target.value = "";
    if (!replacement) return;
    if (replacement.type !== "application/pdf" || replacement.size > 10 * 1024 * 1024) {
      toast.error("Use a PDF file up to 10 MB");
      return;
    }

    setBusyId(template.id);
    let replacementPath = template.storage_path;
    const isBundled = template.storage_path.startsWith(BUNDLED_PREFIX);
    if (isBundled) {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        toast.error("Your session expired. Sign in again.");
        setBusyId(null);
        return;
      }
      replacementPath = `${authData.user.id}/${crypto.randomUUID()}.pdf`;
    }
    const storageOperation = isBundled
      ? supabase.storage.from(BUCKET).upload(replacementPath, replacement, { contentType: "application/pdf", upsert: false })
      : supabase.storage.from(BUCKET).update(replacementPath, replacement, { contentType: "application/pdf", upsert: true });
    const { error: uploadError } = await storageOperation;
    if (uploadError) {
      toast.error(`Replacement failed: ${uploadError.message}`);
      setBusyId(null);
      return;
    }

    const { error: updateError } = await formsClient
      .from("external_form_templates")
      .update({ storage_path: replacementPath, original_file_name: replacement.name, updated_at: new Date().toISOString() })
      .eq("id", template.id);
    if (updateError) {
      toast.error(`PDF replaced, but filename was not updated: ${updateError.message}`);
    } else {
      toast.success("Template replaced");
      await loadTemplates();
    }
    setBusyId(null);
  };

  const openEditDialog = (template: ExternalFormTemplate) => {
    setEditForm({
      name: template.name,
      category: template.category,
      emirate: template.emirate ?? "",
      authority: template.authority ?? "",
      recipientEmail: template.recipient_email ?? "",
    });
    setEditingTemplate(template);
  };

  const handleEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingTemplate) return;

    setSaving(true);
    const { error } = await formsClient
      .from("external_form_templates")
      .update({
        name: editForm.name.trim(),
        category: editForm.category,
        emirate: editForm.emirate.trim() || null,
        authority: editForm.authority.trim() || null,
        recipient_email: editForm.recipientEmail.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editingTemplate.id);

    if (error) {
      toast.error(`Could not update template: ${error.message}`);
      setSaving(false);
      return;
    }

    toast.success("Template details updated");
    setSaving(false);
    setEditingTemplate(null);
    await loadTemplates();
  };

  const openFillDialog = async (template: ExternalFormTemplate) => {
    setFillTemplate(template);
    setSelectedFineId("");
    setLoadingFines(true);
    const { data, error } = await supabase
      .from("fines")
      .select("id, fine_number, fine_date, black_points, source, contract_id, clients(full_name, phone, license_number, nationality), cars(plate, make, model), contracts(id, start_date, start_time, end_date, end_time)")
      .gt("black_points", 0)
      .order("fine_date", { ascending: false })
      .limit(200);
    if (error) {
      toast.error(`Could not load fines: ${error.message}`);
      setFineOptions([]);
    } else {
      setFineOptions((data ?? []) as unknown as FineOption[]);
    }
    setLoadingFines(false);
  };

  const selectedFine = fineOptions.find((fine) => fine.id === selectedFineId) ?? null;
  const missingFillData = selectedFine ? [
    !selectedFine.contract_id || !selectedFine.contracts ? "linked contract" : null,
    !selectedFine.clients ? "client" : null,
    !selectedFine.clients?.license_number ? "driving licence number" : null,
    !selectedFine.cars?.plate ? "vehicle plate" : null,
    !selectedFine.fine_number ? "fine number" : null,
  ].filter(Boolean) as string[] : [];

  const handleFill = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedFine || !selectedFine.contracts || !selectedFine.clients || !selectedFine.cars || missingFillData.length > 0) {
      toast.error("Complete all required information first");
      return;
    }
    setSaving(true);
    try {
      const contract = selectedFine.contracts;
      const start = `${contract.start_date}T${contract.start_time ?? "00:00"}:00+04:00`;
      const end = `${contract.end_date}T${contract.end_time ?? "23:59"}:00+04:00`;
      const blob = await createSharjahBlackPointsPdf({
        contractNumber: `CTR-${contract.id.slice(0, 8).toUpperCase()}`,
        clientName: selectedFine.clients.full_name,
        licenseNumber: selectedFine.clients.license_number ?? "",
        licenseSource: "",
        trafficFileNumber: "",
        unifiedNumber: "",
        plateNumber: selectedFine.cars.plate,
        plateCode: "",
        plateSource: "",
        vehicleType: `${selectedFine.cars.make} ${selectedFine.cars.model}`.trim(),
        fineNumber: selectedFine.fine_number ?? "",
        fineDate: new Date(selectedFine.fine_date).toLocaleDateString("en-GB", { timeZone: "Asia/Dubai" }),
        rentalStart: start,
        rentalEnd: end,
        phone: selectedFine.clients.phone,
        requestDate: new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Dubai" }),
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `Black_Points_Form_${selectedFine.fine_number}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Filled form downloaded");
      setFillTemplate(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create filled form");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title="External Forms" subtitle="Reusable forms from police and other authorities">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Forms library</h2>
            <p className="mt-1 text-sm text-muted-foreground">Keep the latest blank PDF once and reuse it when needed.</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open && !saving) resetDialog(); }}>
            <DialogTrigger asChild>
              <Button className="min-h-10 shrink-0 gap-2"><FilePlus2 className="h-4 w-4" />Add template</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add external form</DialogTitle>
                <DialogDescription>Upload a blank PDF and label it so managers can find it later.</DialogDescription>
              </DialogHeader>
              <form className="grid gap-4" onSubmit={handleCreate}>
                <div className="grid gap-1.5">
                  <Label htmlFor="form-name">Form name</Label>
                  <Input id="form-name" required maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={(value: Category) => setForm({ ...form, category: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(categories).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="emirate">Emirate</Label>
                    <Input id="emirate" value={form.emirate} onChange={(event) => setForm({ ...form, emirate: event.target.value })} />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="authority">Authority</Label>
                  <Input id="authority" value={form.authority} onChange={(event) => setForm({ ...form, authority: event.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="recipient-email">Recipient email <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id="recipient-email" type="email" value={form.recipientEmail} onChange={(event) => setForm({ ...form, recipientEmail: event.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="template-file">Blank PDF</Label>
                  <Input id="template-file" type="file" accept="application/pdf,.pdf" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                  <p className="text-xs text-muted-foreground">PDF only, up to 10 MB.</p>
                </div>
                <Button type="submit" disabled={saving} className="min-h-10 gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {saving ? "Uploading..." : "Add template"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search forms, emirate or authority" className="min-h-10 pl-9" aria-label="Search forms" />
          </div>
          <Select value={category} onValueChange={(value: "all" | Category) => setCategory(value)}>
            <SelectTrigger className="min-h-10 w-full sm:w-44" aria-label="Filter by category"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {Object.entries(categories).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Dialog open={editingTemplate !== null} onOpenChange={(open) => { if (!open && !saving) setEditingTemplate(null); }}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit form details</DialogTitle>
              <DialogDescription>Update how this form is identified and where the completed PDF should be sent.</DialogDescription>
            </DialogHeader>
            <form className="grid gap-4" onSubmit={handleEdit}>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-form-name">Form name</Label>
                <Input id="edit-form-name" required maxLength={160} value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Category</Label>
                  <Select value={editForm.category} onValueChange={(value: Category) => setEditForm({ ...editForm, category: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(categories).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-emirate">Emirate</Label>
                  <Input id="edit-emirate" value={editForm.emirate} onChange={(event) => setEditForm({ ...editForm, emirate: event.target.value })} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-authority">Authority</Label>
                <Input id="edit-authority" value={editForm.authority} onChange={(event) => setEditForm({ ...editForm, authority: event.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-recipient-email">Recipient email <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="edit-recipient-email" type="email" dir="ltr" value={editForm.recipientEmail} onChange={(event) => setEditForm({ ...editForm, recipientEmail: event.target.value })} />
              </div>
              <Button type="submit" disabled={saving} className="min-h-10 gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={fillTemplate !== null} onOpenChange={(open) => { if (!open && !saving) setFillTemplate(null); }}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Fill black points form</DialogTitle>
              <DialogDescription>Select the fine. FleetDesk will use its linked client, vehicle and contract.</DialogDescription>
            </DialogHeader>
            <form className="grid gap-4" onSubmit={handleFill}>
              <div className="grid gap-1.5">
                <Label>Fine</Label>
                <Select value={selectedFineId} onValueChange={setSelectedFineId} disabled={loadingFines}>
                  <SelectTrigger className="min-h-10"><SelectValue placeholder={loadingFines ? "Loading fines..." : "Select a fine with black points"} /></SelectTrigger>
                  <SelectContent>
                    {fineOptions.map((fine) => <SelectItem key={fine.id} value={fine.id}>{fine.fine_number || "No number"} · {fine.cars?.plate || "No car"} · {fine.black_points || 0} BP</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {selectedFine && (
                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                  <p className="font-medium">{selectedFine.clients?.full_name || "Client missing"}</p>
                  <p className="mt-1 text-muted-foreground">{selectedFine.cars?.plate || "Vehicle missing"} · {selectedFine.contract_id ? `CTR-${selectedFine.contract_id.slice(0, 8).toUpperCase()}` : "Contract missing"}</p>
                </div>
              )}
              {selectedFine && missingFillData.length > 0 && <p className="text-sm text-destructive">Missing: {missingFillData.join(", ")}.</p>}
              <Button type="submit" disabled={saving || !selectedFine || missingFillData.length > 0} className="min-h-10 gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Creating PDF..." : "Create filled PDF"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {loading ? (
          <div className="grid gap-3">{[0, 1].map((item) => <Skeleton key={item} className="h-36 w-full" />)}</div>
        ) : loadError ? (
          <Card><CardContent className="flex flex-col items-start gap-3 py-6"><p className="text-sm text-destructive">Could not load forms: {loadError}</p><Button variant="outline" onClick={() => void loadTemplates()} className="gap-2"><RefreshCw className="h-4 w-4" />Retry</Button></CardContent></Card>
        ) : filteredTemplates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <div><p className="font-medium text-foreground">{templates.length === 0 ? "No external forms yet" : "No matching forms"}</p><p className="mt-1 text-sm text-muted-foreground">{templates.length === 0 ? "Add the first blank PDF to this library." : "Try another search or category."}</p></div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filteredTemplates.map((template) => (
              <Card key={template.id}>
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted"><FileText className="h-5 w-5 text-muted-foreground" /></div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium text-foreground" dir="auto">{template.name}</h3><Badge variant="secondary">{categories[template.category]}</Badge></div>
                      <p className="mt-1 text-sm text-muted-foreground" dir="auto">{[template.emirate, template.authority].filter(Boolean).join(" · ") || "No authority details"}</p>
                      {template.recipient_email && <p className="mt-1 truncate text-xs text-muted-foreground" dir="ltr">{template.recipient_email}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:shrink-0">
                    <Button variant="outline" size="sm" disabled={busyId === template.id} onClick={() => void handleDownload(template)} className="min-h-10 gap-1.5"><Download className="h-4 w-4" />Download</Button>
                    <Button variant="outline" size="sm" disabled={busyId === template.id} onClick={() => openEditDialog(template)} className="min-h-10 gap-1.5"><Pencil className="h-4 w-4" />Edit details</Button>
                    <Button asChild variant="outline" size="sm" disabled={busyId === template.id} className="min-h-10 gap-1.5">
                      <label><RefreshCw className="h-4 w-4" />Replace<input className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(event) => void handleReplace(template, event)} /></label>
                    </Button>
                    <Button size="sm" disabled={busyId === template.id} onClick={() => void openFillDialog(template)} className="min-h-10">Fill</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ExternalForms;
