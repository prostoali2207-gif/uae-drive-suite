import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Plus, Search, ChevronLeft, ChevronRight, IdCard, FileText, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { NationalityCombobox } from "@/components/NationalityCombobox";
import { ClientType } from "@/components/ClientTypeFields";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ClientRecord {
  id: string;
  full_name: string;
  phone: string;
  client_type: string;
  emirates_id: string;
  emirates_id_expiry: string | null;
  passport_number: string | null;
  passport_expiry: string | null;
  nationality: string;
  email: string | null;
  license_number: string;
  license_expiry: string | null;
  date_of_birth: string | null;
  passport_photo_url: string | null;
  eid_front_url: string | null;
  eid_back_url: string | null;
  license_front_url: string | null;
  license_back_url: string | null;
  created_at: string;
  is_new?: boolean | null;
}

interface ContractRow {
  id: string;
  client_id: string;
  total_amount: number;
  payment_status: string;
  status: string;
}

function toSupabaseMessage(error: { code?: string; message?: string } | null): string {
  if (error?.code === "PGRST205") {
    return "Supabase tables are missing in this project. Run migrations, then retry.";
  }
  return error?.message || "unknown error";
}

const emptyForm = {
  full_name: "",
  phone: "",
  client_type: "Resident" as ClientType,
  date_of_birth: "",
  emirates_id: "",
  emirates_id_expiry: "",
  passport_number: "",
  passport_expiry: "",
  nationality: "",
  email: "",
  license_number: "",
  license_expiry: "",
  passport_photo_url: "",
  eid_front_url: "",
  eid_back_url: "",
  license_front_url: "",
  license_back_url: "",
};

const Clients = () => {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [docFilter, setDocFilter] = useState<"All" | "Emirates ID" | "Passport">("All");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [phoneError, setPhoneError] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [dupError, setDupError] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteTargetName, setDeleteTargetName] = useState("");

  const fetchData = async () => {
    const [clientsRes, contractsRes] = await Promise.all([
      supabase.from("clients").select("*").order("created_at", { ascending: false }),
      supabase.from("contracts").select("id, client_id, total_amount, payment_status, status"),
    ]);
    if (clientsRes.error) toast.error(`Failed to load clients: ${toSupabaseMessage(clientsRes.error)}`);
    else setClients((clientsRes.data as any) || []);
    if (!contractsRes.error) setContracts(contractsRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const enriched = useMemo(() => {
    return clients.map((c) => {
      const cs = contracts.filter((k) => k.client_id === c.id);
      const outstanding = cs.reduce((sum, k) => {
        if (k.payment_status === "Paid") return sum;
        return sum + Number(k.total_amount);
      }, 0);
      const hasActive = cs.some((k) => k.status === "Active" || k.status === "Expiring Soon");
      return { ...c, totalContracts: cs.length, hasActive, outstanding };
    });
  }, [clients, contracts]);

  const filtered = useMemo(() => {
    let result = enriched;
    
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          (c.emirates_id && c.emirates_id.toLowerCase().includes(q)) ||
          (c.passport_number && c.passport_number.toLowerCase().includes(q)),
      );
    }

    if (docFilter === "Emirates ID") {
      result = result.filter((c) => c.client_type === "Resident");
    } else if (docFilter === "Passport") {
      result = result.filter((c) => c.client_type === "Tourist");
    }

    return result;
  }, [enriched, query, docFilter]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setPhoneError("");
    setDupError("");
    setStep(1);
    setOpen(true);
  };

  const openEdit = (c: ClientRecord) => {
    setEditingId(c.id);
    setForm({
      full_name: c.full_name,
      phone: c.phone,
      client_type: (c.client_type as ClientType) || "Resident",
      emirates_id: c.emirates_id ?? "",
      emirates_id_expiry: c.emirates_id_expiry ?? "",
      passport_number: c.passport_number ?? "",
      passport_expiry: c.passport_expiry ?? "",
      nationality: c.nationality ?? "",
      email: c.email ?? "",
      license_number: c.license_number ?? "",
      license_expiry: c.license_expiry ?? "",
      date_of_birth: c.date_of_birth ?? "",
      passport_photo_url: c.passport_photo_url ?? "",
      eid_front_url: c.eid_front_url ?? "",
      eid_back_url: c.eid_back_url ?? "",
      license_front_url: c.license_front_url ?? "",
      license_back_url: c.license_back_url ?? "",
    });
    setPhoneError("");
    setDupError("");
    setStep(1);
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submitting client form...", { form, editingId });

    if (!form.full_name.trim()) {
      toast.error("Please enter the client's full name");
      return;
    }

    setPhoneError("");
    setDupError("");

    if (!editingId) {
      const phoneToCheck = form.phone.trim();
      const emailToCheck = form.email.trim();
      const orParts: string[] = [];
      if (phoneToCheck) orParts.push(`phone.eq.${phoneToCheck}`);
      if (emailToCheck) orParts.push(`email.eq.${emailToCheck}`);
      if (orParts.length > 0) {
        const { data: existing, error: dupErr } = await supabase
          .from("clients")
          .select("id, full_name")
          .or(orParts.join(","))
          .limit(1);
        if (dupErr) {
          toast.error("Could not validate phone/email");
          return;
        }
        if (existing && existing.length > 0) {
          setDupError(`A client with this phone or email already exists: ${(existing[0] as any).full_name}`);
          return;
        }
      }
    }

    setSaving(true);
    const payload: any = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      client_type: form.client_type,
      emirates_id: form.client_type === "Resident" ? form.emirates_id.trim() : "",
      emirates_id_expiry: form.client_type === "Resident" ? (form.emirates_id_expiry || null) : null,
      passport_number: form.client_type === "Tourist" ? form.passport_number.trim() : "",
      passport_expiry: form.client_type === "Tourist" ? (form.passport_expiry || null) : null,
      nationality: form.nationality.trim(),
      email: form.email.trim() || null,
      license_number: form.license_number.trim(),
      license_expiry: form.license_expiry || null,
      date_of_birth: form.date_of_birth || null,
      passport_photo_url: form.passport_photo_url || null,
      eid_front_url: form.eid_front_url || null,
      eid_back_url: form.eid_back_url || null,
      license_front_url: form.license_front_url || null,
      license_back_url: form.license_back_url || null,
    };

    try {
      const { error } = editingId
        ? await supabase.from("clients").update(payload).eq("id", editingId)
        : await supabase.from("clients").insert(payload);

      setSaving(false);
      if (error) {
        toast.error(`Failed to ${editingId ? "update" : "add"} client: ${toSupabaseMessage(error)}`);
        console.error("Client submission error:", error);
      } else {
        toast.success(editingId ? "Client updated" : "Client added");
        setForm(emptyForm);
        setEditingId(null);
        setOpen(false);
        fetchData();
      }
    } catch (err) {
      setSaving(false);
      toast.error("An unexpected error occurred while saving client");
      console.error(err);
    }
  };

  const handleDeleteClient = async () => {
    const targetId = deleteTargetId || editingId;
    if (!targetId) return;
    setDeleting(true);
    const { count, error: activeErr } = await supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("client_id", targetId)
      .in("status", ["Active", "Expiring Soon"]);
    if (activeErr) {
      setDeleting(false);
      toast.error("Failed to verify active contracts");
      return;
    }
    if ((count ?? 0) > 0) {
      setDeleting(false);
      setConfirmDeleteOpen(false);
      toast.error("Cannot delete — client has active contracts.");
      return;
    }

    const { error: deleteErr } = await supabase.from("clients").delete().eq("id", targetId);
    setDeleting(false);
    setConfirmDeleteOpen(false);
    if (deleteErr) {
      toast.error(`Failed to delete client: ${deleteErr.message}`);
      return;
    }

    toast.success("Client deleted");
    setDeleteTargetId(null);
    setDeleteTargetName("");
    if (editingId) {
      setOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    }
    fetchData();
  };

  return (
    <DashboardLayout title="Clients" subtitle="Manage your renters">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or Emirates ID"
              className="h-9 pl-9 text-sm"
            />
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-border p-1 bg-muted/30">
            {(["All", "Emirates ID", "Passport"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setDocFilter(opt)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-all",
                  docFilter === opt
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt}
              </button>
            ))}
          </div>

          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setPhoneError(""); setDupError(""); setStep(1); } }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 bg-fd-accent text-white hover:bg-fd-accent/90" onClick={openAdd}>
                <Plus className="h-4 w-4" />
                Add Client
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px] text-foreground font-dm-sans">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-foreground">{editingId ? "Edit client" : "Add new client"}</DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                      {editingId ? "Update the client's details below." : "Enter the client's details below."}
                    </DialogDescription>
                  </div>
                  <div className="bg-muted px-3 py-1 rounded-full text-xs font-medium text-muted-foreground">
                    Step {step} of 2
                  </div>
                </div>
              </DialogHeader>
              
              <form onSubmit={handleSubmit} className="grid gap-4 py-2">
                {dupError && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                    {dupError}
                  </div>
                )}
                {step === 1 ? (
                  <div className="grid gap-4">
                    <div className="grid gap-1.5">
                      <Label htmlFor="name" className="text-foreground">Full Name <span className="text-red-500">*</span></Label>
                      <Input 
                        id="name" 
                        required 
                        value={form.full_name} 
                        onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                        className="bg-input border-border text-foreground focus-visible:ring-ring"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="phone" className="text-foreground">Phone <span className="text-red-500">*</span></Label>
                        <Input
                        id="phone"
                        required
                        value={form.phone}
                        onChange={(e) => {
                          setForm({ ...form, phone: e.target.value });
                          setPhoneError("");
                          setDupError("");
                        }}
                        className="bg-input border-border text-foreground focus-visible:ring-ring"
                      />
                      {phoneError && <p className="text-xs text-red-400">{phoneError}</p>}
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="dob" className="text-foreground">Date of Birth <span className="text-red-500">*</span></Label>
                      <Input 
                        id="dob" 
                        type="date" 
                        required
                        value={form.date_of_birth || ""} 
                        onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                        className="bg-input border-border text-foreground [color-scheme:dark]"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    <div className="grid gap-1.5">
                      <Label className="text-foreground">Client Type</Label>
                      <Tabs 
                        value={form.client_type} 
                        onValueChange={(v) => setForm({ ...form, client_type: v as ClientType })}
                        className="w-full"
                      >
                        <TabsList className="grid w-full grid-cols-2 bg-muted">
                          <TabsTrigger value="Resident" className="data-[state=active]:bg-background data-[state=active]:text-foreground">Resident</TabsTrigger>
                          <TabsTrigger value="Tourist" className="data-[state=active]:bg-background data-[state=active]:text-foreground">Tourist</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {form.client_type === "Resident" ? (
                        <>
                          <div className="grid gap-1.5">
                            <Label htmlFor="eid" className="text-foreground">Emirates ID <span className="text-red-500">*</span></Label>
                            <Input
                              id="eid"
                              required
                              value={form.emirates_id}
                              onChange={(e) => setForm({ ...form, emirates_id: e.target.value })}
                              className="bg-input border-border text-foreground focus-visible:ring-ring"
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="eidexp" className="text-foreground">Expiry Date <span className="text-red-500">*</span></Label>
                            <Input
                              id="eidexp"
                              type="date"
                              required
                              value={form.emirates_id_expiry}
                              onChange={(e) => setForm({ ...form, emirates_id_expiry: e.target.value })}
                              className="bg-input border-border text-foreground [color-scheme:dark]"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid gap-1.5">
                            <Label htmlFor="pass" className="text-foreground">Passport Number <span className="text-red-500">*</span></Label>
                            <Input
                              id="pass"
                              required
                              value={form.passport_number}
                              onChange={(e) => setForm({ ...form, passport_number: e.target.value })}
                              className="bg-input border-border text-foreground focus-visible:ring-ring"
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="passexp" className="text-foreground">Expiry Date <span className="text-red-500">*</span></Label>
                            <Input
                              id="passexp"
                              type="date"
                              required
                              value={form.passport_expiry}
                              onChange={(e) => setForm({ ...form, passport_expiry: e.target.value })}
                              className="bg-input border-border text-foreground [color-scheme:dark]"
                            />
                          </div>
                        </>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor="nat" className="text-foreground">Nationality <span className="text-red-500">*</span></Label>
                        <NationalityCombobox
                          id="nat"
                          value={form.nationality}
                          onChange={(v) => setForm({ ...form, nationality: v })}
                          // Note: NationalityCombobox might need internal styling for dark mode, 
                          // but I am restricted from editing it if it's a separate file.
                          // Assuming it handles its own styling or works with parent classes.
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="lic" className="text-foreground">License Number <span className="text-red-500">*</span></Label>
                        <Input 
                          id="lic" 
                          required 
                          value={form.license_number} 
                          onChange={(e) => setForm({ ...form, license_number: e.target.value })}
                          className="bg-input border-border text-foreground focus-visible:ring-ring"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor="licexp" className="text-foreground">License Expiry <span className="text-red-500">*</span></Label>
                        <Input 
                          id="licexp" 
                          type="date" 
                          required
                          value={form.license_expiry || ""} 
                          onChange={(e) => setForm({ ...form, license_expiry: e.target.value })}
                          className="bg-input border-border text-foreground [color-scheme:dark]"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="email" className="text-foreground">Email (optional)</Label>
                        <Input 
                          id="email" 
                          type="email" 
                          value={form.email || ""} 
                          onChange={(e) => { setForm({ ...form, email: e.target.value }); setDupError(""); }}
                          className="bg-input border-border text-foreground focus-visible:ring-ring"
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 pt-2 border-t border-border mt-2">
                      <Label className="text-sm font-semibold text-foreground">Documents</Label>
                      
                      <div className="grid grid-cols-2 gap-3">
                        {form.client_type === "Tourist" && (
                          <label className="bg-muted border border-dashed border-border rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:border-foreground/30 transition-colors">
                            <div className="bg-background rounded p-2">
                              <IdCard className="h-4 w-4 text-foreground" />
                            </div>
                            <div className="flex flex-col text-left">
                              <span className="text-foreground text-sm font-medium">Passport Photo</span>
                              <span className="text-muted-foreground text-xs">Tap to upload</span>
                            </div>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const path = `client-documents/${Date.now()}_${file.name}`;
                                  const { data: uploadData, error: uploadError } = await supabase.storage
                                    .from("client-documents")
                                    .upload(path, file, { upsert: true });
                                  
                                  if (!uploadError) {
                                    const { data: { publicUrl } } = supabase.storage.from("client-documents").getPublicUrl(path);
                                    setForm(prev => ({ ...prev, passport_photo_url: publicUrl }));
                                  }
                                }
                              }}
                              className="hidden"
                            />
                          </label>
                        )}
                        
                        {form.client_type === "Resident" && (
                          <>
                            <label className="bg-muted border border-dashed border-border rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:border-foreground/30 transition-colors">
                              <div className="bg-background rounded p-2">
                                <IdCard className="h-4 w-4 text-foreground" />
                              </div>
                              <div className="flex flex-col text-left">
                                <span className="text-foreground text-sm font-medium">Emirates ID Front</span>
                                <span className="text-muted-foreground text-xs">Tap to upload</span>
                              </div>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const path = `client-documents/${Date.now()}_${file.name}`;
                                    const { data: uploadData, error: uploadError } = await supabase.storage
                                      .from("client-documents")
                                      .upload(path, file, { upsert: true });
                                    
                                    if (!uploadError) {
                                      const { data: { publicUrl } } = supabase.storage.from("client-documents").getPublicUrl(path);
                                      setForm(prev => ({ ...prev, eid_front_url: publicUrl }));
                                    }
                                  }
                                }}
                                className="hidden"
                              />
                            </label>
                            <label className="bg-muted border border-dashed border-border rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:border-foreground/30 transition-colors">
                              <div className="bg-background rounded p-2">
                                <IdCard className="h-4 w-4 text-foreground" />
                              </div>
                              <div className="flex flex-col text-left">
                                <span className="text-foreground text-sm font-medium">Emirates ID Back</span>
                                <span className="text-muted-foreground text-xs">Tap to upload</span>
                              </div>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const path = `client-documents/${Date.now()}_${file.name}`;
                                    const { data: uploadData, error: uploadError } = await supabase.storage
                                      .from("client-documents")
                                      .upload(path, file, { upsert: true });
                                    
                                    if (!uploadError) {
                                      const { data: { publicUrl } } = supabase.storage.from("client-documents").getPublicUrl(path);
                                      setForm(prev => ({ ...prev, eid_back_url: publicUrl }));
                                    }
                                  }
                                }}
                                className="hidden"
                              />
                            </label>
                          </>
                        )}

                        <label className="bg-muted border border-dashed border-border rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:border-foreground/30 transition-colors">
                          <div className="bg-background rounded p-2">
                            <FileText className="h-4 w-4 text-foreground" />
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="text-foreground text-sm font-medium">License Front</span>
                            <span className="text-muted-foreground text-xs">Tap to upload</span>
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const path = `client-documents/${Date.now()}_${file.name}`;
                                const { data: uploadData, error: uploadError } = await supabase.storage
                                  .from("client-documents")
                                  .upload(path, file, { upsert: true });
                                  
                                if (!uploadError) {
                                  const { data: { publicUrl } } = supabase.storage.from("client-documents").getPublicUrl(path);
                                  setForm(prev => ({ ...prev, license_front_url: publicUrl }));
                                }
                              }
                            }}
                            className="hidden"
                          />
                        </label>

                        <label className="bg-muted border border-dashed border-border rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:border-foreground/30 transition-colors">
                          <div className="bg-background rounded p-2">
                            <FileText className="h-4 w-4 text-foreground" />
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="text-foreground text-sm font-medium">License Back</span>
                            <span className="text-muted-foreground text-xs">Tap to upload</span>
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const path = `client-documents/${Date.now()}_${file.name}`;
                                const { data: uploadData, error: uploadError } = await supabase.storage
                                  .from("client-documents")
                                  .upload(path, file, { upsert: true });
                                  
                                if (!uploadError) {
                                  const { data: { publicUrl } } = supabase.storage.from("client-documents").getPublicUrl(path);
                                  setForm(prev => ({ ...prev, license_back_url: publicUrl }));
                                }
                              }
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                <DialogFooter className="gap-2 sm:gap-0 mt-4">
                  {step === 1 ? (
                    <div className="flex w-full justify-between gap-3">
                      <Button type="button" variant="outline" onClick={() => setOpen(false)} className="bg-transparent border-border text-muted-foreground hover:bg-muted hover:text-foreground">
                        Cancel
                      </Button>
                      <Button 
                        type="button" 
                        onClick={() => {
                          if (!form.full_name.trim() || !form.phone.trim() || !form.date_of_birth) {
                            toast.error("Please fill in all required fields");
                            return;
                          }
                          setStep(2);
                        }}
                        className="bg-fd-accent text-white hover:bg-fd-accent/90"
                      >
                        Next <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex w-full justify-between gap-3">
                      <Button type="button" variant="outline" onClick={() => setStep(1)} className="bg-transparent border-border text-muted-foreground hover:bg-muted hover:text-foreground">
                        <ChevronLeft className="mr-1 h-4 w-4" /> Back
                      </Button>
                      <div className="flex gap-3">
                        <Button type="submit" disabled={saving} className="bg-fd-accent text-white hover:bg-fd-accent/90">
                          {saving ? "Saving..." : editingId ? "Save Changes" : "Save Client"}
                        </Button>
                      </div>
                    </div>
                  )}
                </DialogFooter>
                {editingId && step === 2 && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setConfirmDeleteOpen(true)}
                    disabled={deleting}
                    className="mt-2"
                  >
                    Delete Client
                  </Button>
                )}
              </form>
            </DialogContent>
          </Dialog>
          <AlertDialog open={confirmDeleteOpen} onOpenChange={(v) => { setConfirmDeleteOpen(v); if (!v) { setDeleteTargetId(null); setDeleteTargetName(""); } }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {deleteTargetName || form.full_name || "client"}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This cannot be undone. Only clients without active contracts can be deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteClient}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Delete Client"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-5 text-xs">Client Name</TableHead>
                <TableHead className="text-xs">Phone</TableHead>
                <TableHead className="text-xs">Document</TableHead>
                <TableHead className="text-xs">Nationality</TableHead>
                <TableHead className="text-xs">Total Contracts</TableHead>
                <TableHead className="text-xs">Active</TableHead>
                <TableHead className="text-xs">Outstanding</TableHead>
                <TableHead className="px-5 text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                    Loading clients...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                    No clients found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="px-5 font-medium text-foreground">
                      <Link to={`/clients/${c.id}`} className="hover:underline">
                        {c.full_name}
                      </Link>
                      {c.is_new === true && (
                        <span className="ml-2 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full px-2 py-0.5">New</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.phone}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {c.client_type === "Resident" ? (
                        <span><span className="text-[10px] font-sans text-muted-foreground/60 mr-1">EID:</span>{c.emirates_id}</span>
                      ) : (
                        <span><span className="text-[10px] font-sans text-muted-foreground/60 mr-1">PAS:</span>{c.passport_number}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.nationality}</TableCell>
                    <TableCell className="text-sm text-foreground">{c.totalContracts}</TableCell>
                    <TableCell>
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        c.hasActive
                          ? "bg-tint-green text-tint-green-foreground"
                          : "bg-muted text-muted-foreground",
                      )}>
                        {c.hasActive ? "Yes" : "No"}
                      </span>
                    </TableCell>
                    <TableCell className={cn(
                      "text-sm font-medium",
                      c.outstanding > 0 ? "text-tint-rose-foreground" : "text-foreground",
                    )}>
                      AED {c.outstanding.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 text-xs"
                          onClick={() => openEdit(c)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTargetId(c.id);
                            setDeleteTargetName(c.full_name);
                            setConfirmDeleteOpen(true);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
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

export default Clients;
