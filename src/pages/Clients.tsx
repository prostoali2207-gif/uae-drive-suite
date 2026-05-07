import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Plus, Search } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { NationalityCombobox } from "@/components/NationalityCombobox";
import { ClientTypeFields, ClientType } from "@/components/ClientTypeFields";
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
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [phoneError, setPhoneError] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

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

    if (!editingId) {
      const phoneToCheck = form.phone.trim();
      if (phoneToCheck) {
        const { data: existing, error: dupErr } = await supabase
          .from("clients")
          .select("id")
          .eq("phone", phoneToCheck)
          .limit(1);
        if (dupErr) {
          toast.error("Could not validate phone number");
          return;
        }
        if (existing && existing.length > 0) {
          setPhoneError("This phone number is already registered");
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
    if (!editingId) return;
    setDeleting(true);
    const { count, error: activeErr } = await supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("client_id", editingId)
      .in("status", ["Active", "Expiring Soon"]);
    if (activeErr) {
      setDeleting(false);
      toast.error("Failed to verify active contracts");
      return;
    }
    if ((count ?? 0) > 0) {
      setDeleting(false);
      setConfirmDeleteOpen(false);
      toast.error("Cannot delete client with active contracts");
      return;
    }

    const { error: deleteErr } = await supabase.from("clients").delete().eq("id", editingId);
    setDeleting(false);
    setConfirmDeleteOpen(false);
    if (deleteErr) {
      toast.error(`Failed to delete client: ${deleteErr.message}`);
      return;
    }

    toast.success("Client deleted");
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
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

          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setPhoneError(""); } }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5" onClick={openAdd}>
                <Plus className="h-4 w-4" />
                Add Client
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit client" : "Add new client"}</DialogTitle>
                <DialogDescription>
                  {editingId ? "Update the client's details below." : "Enter the client's details below."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="grid gap-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      required
                      value={form.phone}
                      onChange={(e) => {
                        setForm({ ...form, phone: e.target.value });
                        setPhoneError("");
                      }}
                    />
                    {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="dob">Date of Birth</Label>
                    <Input id="dob" type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
                  </div>
                  <ClientTypeFields
                    idPrefix={editingId ? "edit" : "add"}
                    value={{
                      client_type: form.client_type,
                      emirates_id: form.emirates_id,
                      emirates_id_expiry: form.emirates_id_expiry,
                      passport_number: form.passport_number,
                      passport_expiry: form.passport_expiry,
                    }}
                    onChange={(v) => setForm({ ...form, ...v })}
                  />
                  <div className="grid gap-1.5">
                    <Label htmlFor="nat">Nationality</Label>
                    <NationalityCombobox
                      id="nat"
                      value={form.nationality}
                      onChange={(v) => setForm({ ...form, nationality: v })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="lic">License Number</Label>
                    <Input id="lic" required value={form.license_number} onChange={(e) => setForm({ ...form, license_number: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="licexp">License Expiry</Label>
                    <Input id="licexp" type="date" value={form.license_expiry} onChange={(e) => setForm({ ...form, license_expiry: e.target.value })} />
                  </div>
                  <div className="col-span-2 grid gap-1.5">
                    <Label htmlFor="email">Email <span className="text-muted-foreground">(optional)</span></Label>
                    <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>

                  <div className="col-span-2 grid gap-3 pt-2 border-t border-border mt-2">
                    <Label className="text-sm font-semibold">Documents</Label>
                    
                    <div className="grid grid-cols-2 gap-3">
                      {form.client_type === "Tourist" && (
                        <div className="grid gap-1.5">
                          <Label>Passport Photo</Label>
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const path = `client-documents/${Date.now()}_${file.name}`;
                                const { data: uploadData, error: uploadError } = await supabase.storage
                                  .from("client-documents")
                                  .upload(path, file, { upsert: true });
                                
                                console.log('Upload error:', JSON.stringify(uploadError));
                                console.log('Upload data:', JSON.stringify(uploadData));

                                if (!uploadError) {
                                  const { data: { publicUrl } } = supabase.storage.from("client-documents").getPublicUrl(path);
                                  setForm(prev => ({ ...prev, passport_photo_url: publicUrl }));
                                }
                              }
                            }}
                          />
                        </div>
                      )}
                      
                      {form.client_type === "Resident" && (
                        <>
                          <div className="grid gap-1.5">
                            <Label>Emirates ID Front</Label>
                            <Input
                              type="file"
                              accept="image/*"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const path = `client-documents/${Date.now()}_${file.name}`;
                                  const { data: uploadData, error: uploadError } = await supabase.storage
                                    .from("client-documents")
                                    .upload(path, file, { upsert: true });
                                  
                                  console.log('Upload error:', JSON.stringify(uploadError));
                                  console.log('Upload data:', JSON.stringify(uploadData));

                                  if (!uploadError) {
                                    const { data: { publicUrl } } = supabase.storage.from("client-documents").getPublicUrl(path);
                                    setForm(prev => ({ ...prev, eid_front_url: publicUrl }));
                                  }
                                }
                              }}
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label>Emirates ID Back</Label>
                            <Input
                              type="file"
                              accept="image/*"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const path = `client-documents/${Date.now()}_${file.name}`;
                                  const { data: uploadData, error: uploadError } = await supabase.storage
                                    .from("client-documents")
                                    .upload(path, file, { upsert: true });
                                  
                                  console.log("Upload error:", JSON.stringify(uploadError));
                                  console.log("Upload data:", JSON.stringify(uploadData));
                                  if (!uploadError) {
                                    const { data: { publicUrl } } = supabase.storage.from("client-documents").getPublicUrl(path);
                                    setForm(prev => ({ ...prev, eid_back_url: publicUrl }));
                                  }
                                }
                              }}
                            />
                          </div>
                        </>
                      )}

                      <div className="grid gap-1.5">
                        <Label>License Front</Label>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const path = `client-documents/${Date.now()}_${file.name}`;
                              const { data: uploadData, error: uploadError } = await supabase.storage
                                .from("client-documents")
                                .upload(path, file, { upsert: true });
                                
                              console.log('Upload error:', JSON.stringify(uploadError));
                              console.log('Upload data:', JSON.stringify(uploadData));

                              if (!uploadError) {
                                const { data: { publicUrl } } = supabase.storage.from("client-documents").getPublicUrl(path);
                                setForm(prev => ({ ...prev, license_front_url: publicUrl }));
                              }
                            }
                          }}
                        />
                      </div>

                      <div className="grid gap-1.5">
                        <Label>License Back</Label>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const path = `client-documents/${Date.now()}_${file.name}`;
                              const { data: uploadData, error: uploadError } = await supabase.storage
                                .from("client-documents")
                                .upload(path, file, { upsert: true });
                                
                              console.log('Upload error:', JSON.stringify(uploadError));
                              console.log('Upload data:', JSON.stringify(uploadData));

                              if (!uploadError) {
                                const { data: { publicUrl } } = supabase.storage.from("client-documents").getPublicUrl(path);
                                setForm(prev => ({ ...prev, license_back_url: publicUrl }));
                              }
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving..." : editingId ? "Save Changes" : "Save Client"}
                  </Button>
                </DialogFooter>
                {editingId && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setConfirmDeleteOpen(true)}
                    disabled={deleting}
                  >
                    Delete Client
                  </Button>
                )}
              </form>
            </DialogContent>
          </Dialog>
          <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete client?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. The client can be deleted only if there are no active contracts.
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
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-xs"
                        onClick={() => openEdit(c)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
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
