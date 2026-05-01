import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  created_at: string;
}

interface ContractRow {
  id: string;
  client_id: string;
  total_amount: number;
  payment_status: string;
  status: string;
}

const emptyForm = {
  full_name: "",
  phone: "",
  client_type: "Resident" as ClientType,
  emirates_id: "",
  emirates_id_expiry: "",
  passport_number: "",
  passport_expiry: "",
  nationality: "",
  email: "",
  license_number: "",
  license_expiry: "",
};

const Clients = () => {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<{ phone?: string }>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = async () => {
    const [clientsRes, contractsRes] = await Promise.all([
      supabase.from("clients").select("*").order("created_at", { ascending: false }),
      supabase.from("contracts").select("id, client_id, total_amount, payment_status, status"),
    ]);
    if (clientsRes.error) toast.error("Failed to load clients");
    else setClients(clientsRes.data || []);
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
    const q = query.trim().toLowerCase();
    if (!q) return enriched;
    return enriched.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        c.emirates_id.toLowerCase().includes(q),
    );
  }, [enriched, query]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
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
    });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) return;
    setSaving(true);
    const payload = {
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
    };
    const { error } = editingId
      ? await supabase.from("clients").update(payload).eq("id", editingId)
      : await supabase.from("clients").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(`Failed to ${editingId ? "update" : "add"} client: ${error.message}`);
    } else {
      toast.success(editingId ? "Client updated" : "Client added");
      setForm(emptyForm);
      setEditingId(null);
      setOpen(false);
      fetchData();
    }
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

          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditingId(null); }}>
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
                    <Input id="phone" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
                  <div className="col-span-2 grid gap-1.5">
                    <Label htmlFor="email">Email <span className="text-muted-foreground">(optional)</span></Label>
                    <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="licexp">License Expiry</Label>
                    <Input id="licexp" type="date" value={form.license_expiry} onChange={(e) => setForm({ ...form, license_expiry: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving..." : editingId ? "Save Changes" : "Save Client"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-5 text-xs">Client Name</TableHead>
                <TableHead className="text-xs">Phone</TableHead>
                <TableHead className="text-xs">Emirates ID</TableHead>
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
                    <TableCell className="font-mono text-xs text-muted-foreground">{c.emirates_id}</TableCell>
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
