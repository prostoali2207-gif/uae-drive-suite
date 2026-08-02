import { useEffect, useMemo, useRef, useState } from "react";
import { BriefcaseBusiness, Check, Loader2, Pencil, PenLine, Plus, Search, Trash2, Undo2, UserRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SmoothSignatureCanvas, type SmoothSignatureCanvasRef } from "@/components/SmoothSignatureCanvas";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type StaffRole = "manager" | "driver" | "accountant" | "cleaner" | "other";
type StaffStatus = "active" | "inactive";

interface StaffMember {
  id: string;
  owner_id: string;
  full_name: string;
  role: StaffRole;
  phone: string | null;
  email: string | null;
  emirates_id: string | null;
  passport_number: string | null;
  license_number: string | null;
  license_expiry: string | null;
  signature: string | null;
  notes: string | null;
  status: StaffStatus;
  created_at: string;
  updated_at: string;
}

interface StaffForm {
  full_name: string;
  role: StaffRole;
  phone: string;
  email: string;
  emirates_id: string;
  passport_number: string;
  license_number: string;
  license_expiry: string;
  signature: string;
  notes: string;
  status: StaffStatus;
}

const emptyForm: StaffForm = {
  full_name: "",
  role: "manager",
  phone: "",
  email: "",
  emirates_id: "",
  passport_number: "",
  license_number: "",
  license_expiry: "",
  signature: "",
  notes: "",
  status: "active",
};

const roleLabels: Record<StaffRole, string> = {
  manager: "Manager",
  driver: "Driver",
  accountant: "Accountant",
  cleaner: "Cleaner",
  other: "Other",
};

function asForm(member: StaffMember): StaffForm {
  return {
    full_name: member.full_name,
    role: member.role,
    phone: member.phone ?? "",
    email: member.email ?? "",
    emirates_id: member.emirates_id ?? "",
    passport_number: member.passport_number ?? "",
    license_number: member.license_number ?? "",
    license_expiry: member.license_expiry ?? "",
    signature: member.signature ?? "",
    notes: member.notes ?? "",
    status: member.status,
  };
}

function nullable(value: string) {
  return value.trim() || null;
}

function formatEmiratesId(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 15);
  return [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7, 14), digits.slice(14, 15)]
    .filter(Boolean)
    .join("-");
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidEmiratesId(value: string) {
  return /^784-\d{4}-\d{7}-\d$/.test(value);
}

export function StaffSettings() {
  const { user } = useAuth();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signatureHasInk, setSignatureHasInk] = useState(false);
  const signatureRef = useRef<SmoothSignatureCanvasRef>(null);
  const initialFormRef = useRef<StaffForm>(emptyForm);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialFormRef.current);

  const requestDialogChange = (open: boolean) => {
    if (!open && !saving && isDirty && !window.confirm("Discard the changes you entered?")) return;
    if (!saving) setDialogOpen(open);
  };

  const loadMembers = async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase
      .from("staff" as never)
      .select("*")
      .eq("owner_id", user.id)
      .order("status", { ascending: true })
      .order("full_name", { ascending: true });

    if (loadError) {
      setError(loadError.message);
      setMembers([]);
    } else {
      setMembers((data ?? []) as unknown as StaffMember[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return members;
    return members.filter((member) =>
      [member.full_name, roleLabels[member.role], member.phone, member.email]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(query)),
    );
  }, [members, search]);

  const openCreate = () => {
    setEditing(null);
    const nextForm = { ...emptyForm };
    setForm(nextForm);
    initialFormRef.current = nextForm;
    setDialogOpen(true);
  };

  const openSignature = () => {
    setSignatureHasInk(false);
    setSignatureOpen(true);
  };

  const saveSignature = () => {
    const signature = signatureRef.current?.getDataUrl() ?? "";
    if (!signature) return;
    setForm((current) => ({ ...current, signature }));
    setSignatureOpen(false);
  };

  const openEdit = (member: StaffMember) => {
    setEditing(member);
    const nextForm = asForm(member);
    setForm(nextForm);
    initialFormRef.current = nextForm;
    setDialogOpen(true);
  };

  const save = async () => {
    if (!user || saving) return;
    if (!form.full_name.trim()) {
      toast.error("Employee name is required");
      return;
    }
    if (form.email.trim() && !isValidEmail(form.email.trim())) {
      toast.error("Enter a valid email address");
      return;
    }
    if (form.emirates_id.trim() && !isValidEmiratesId(form.emirates_id.trim())) {
      toast.error("Emirates ID must contain 15 digits");
      return;
    }

    setSaving(true);
    const payload = {
      owner_id: user.id,
      full_name: form.full_name.trim(),
      role: form.role,
      phone: nullable(form.phone),
      email: nullable(form.email),
      emirates_id: nullable(form.emirates_id),
      passport_number: nullable(form.passport_number),
      license_number: form.role === "driver" ? nullable(form.license_number) : null,
      license_expiry: form.role === "driver" ? nullable(form.license_expiry) : null,
      signature: nullable(form.signature),
      notes: nullable(form.notes),
      status: editing ? form.status : "active",
    };

    const result = editing
      ? await supabase.from("staff" as never).update(payload as never).eq("id", editing.id).eq("owner_id", user.id)
      : await supabase.from("staff" as never).insert(payload as never);
    setSaving(false);

    if (result.error) {
      toast.error("Could not save employee: " + result.error.message);
      return;
    }

    toast.success(editing ? "Employee updated" : "Employee added");
    setDialogOpen(false);
    await loadMembers();
  };

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <BriefcaseBusiness className="h-4 w-4" />
            Employees
          </CardTitle>
          <CardDescription className="mt-1">People who work for the company. System access is managed separately.</CardDescription>
        </div>
        <Button type="button" className="w-full gap-1.5 sm:w-auto" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add employee
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, role or phone"
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading employees...
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="text-destructive">Employees could not be loaded.</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void loadMembers()}>
              Try again
            </Button>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
            <UserRound className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">{members.length ? "No employees match your search" : "No employees yet"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {members.length ? "Try another name, role or phone." : "Add the first employee to keep their details and signature."}
            </p>
          </div>
        ) : (
          <div className="divide-y rounded-lg border">
            {filteredMembers.map((member) => (
              <div key={member.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{member.full_name}</p>
                    <Badge variant={member.status === "active" ? "default" : "secondary"}>
                      {member.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {roleLabels[member.role]}
                    {member.phone ? ` · ${member.phone}` : ""}
                  </p>
                  {member.signature ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Check className="h-3.5 w-3.5 text-emerald-600" /> Signature saved
                    </p>
                  ) : null}
                </div>
                <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 sm:w-auto" onClick={() => openEdit(member)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={requestDialogChange}>
        <DialogContent className="flex max-h-[92dvh] max-w-2xl flex-col overflow-hidden p-0">
          <div className="min-h-0 overflow-y-auto px-4 pb-2 pt-6 sm:px-6">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit employee" : "Add employee"}</DialogTitle>
            <DialogDescription>Only the name and role are required.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-2">
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="staff-name">Full name *</Label>
                <Input id="staff-name" autoFocus value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Role *</Label>
                <Select value={form.role} onValueChange={(role: StaffRole) => setForm({ ...form, role })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(roleLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {editing ? (
                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(status: StaffStatus) => setForm({ ...form, status })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="grid gap-1.5">
                <Label htmlFor="staff-phone">Phone</Label>
                <Input id="staff-phone" inputMode="tel" dir="ltr" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+971 50 000 0000" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="staff-email">Email</Label>
                <Input id="staff-email" type="email" dir="ltr" aria-invalid={Boolean(form.email.trim()) && !isValidEmail(form.email.trim())} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
                {form.email.trim() && !isValidEmail(form.email.trim()) ? <p className="text-xs text-destructive">Enter a valid email address</p> : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="staff-eid">Emirates ID</Label>
                <Input id="staff-eid" dir="ltr" inputMode="numeric" aria-invalid={Boolean(form.emirates_id) && !isValidEmiratesId(form.emirates_id)} value={form.emirates_id} onChange={(event) => setForm({ ...form, emirates_id: formatEmiratesId(event.target.value) })} placeholder="784-0000-0000000-0" />
                {form.emirates_id && !isValidEmiratesId(form.emirates_id) ? <p className="text-xs text-destructive">Enter all 15 digits</p> : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="staff-passport">Passport number</Label>
                <Input id="staff-passport" dir="ltr" value={form.passport_number} onChange={(event) => setForm({ ...form, passport_number: event.target.value })} />
              </div>
            </section>

            {form.role === "driver" ? (
              <section className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <p className="text-sm font-medium">Driver licence</p>
                  <p className="text-xs text-muted-foreground">Optional details used to check whether the licence is still valid.</p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="staff-license">Licence number</Label>
                  <Input id="staff-license" dir="ltr" value={form.license_number} onChange={(event) => setForm({ ...form, license_number: event.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="staff-license-expiry">Expiry date</Label>
                  <Input id="staff-license-expiry" type="date" dir="ltr" value={form.license_expiry} onChange={(event) => setForm({ ...form, license_expiry: event.target.value })} />
                </div>
              </section>
            ) : null}

            <section className="grid gap-2">
              <div>
                <Label className="flex items-center gap-1.5"><PenLine className="h-4 w-4" /> Employee signature</Label>
                <p className="mt-1 text-xs text-muted-foreground">Optional. Used on company documents.</p>
              </div>
              {form.signature ? (
                <div className="rounded-lg border bg-white p-3">
                  <img src={form.signature} alt="Employee signature" className="mx-auto h-20 max-w-full object-contain" />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button type="button" variant="outline" onClick={openSignature}><PenLine className="mr-2 h-4 w-4" /> Replace</Button>
                    <Button type="button" variant="outline" onClick={() => setForm((current) => ({ ...current, signature: "" }))}><Trash2 className="mr-2 h-4 w-4" /> Remove</Button>
                  </div>
                </div>
              ) : (
                <Button type="button" variant="outline" className="h-12 w-full border-dashed" onClick={openSignature}>
                  <PenLine className="mr-2 h-5 w-5" /> Add signature
                </Button>
              )}
            </section>

            <div className="grid gap-1.5">
              <Label htmlFor="staff-notes">Notes</Label>
              <Textarea id="staff-notes" rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Optional internal note" />
            </div>
          </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t bg-background px-4 py-3 sm:gap-2 sm:px-6">
            <Button type="button" variant="outline" disabled={saving} onClick={() => requestDialogChange(false)}>Cancel</Button>
            <Button type="button" disabled={saving || !form.full_name.trim() || (Boolean(form.email.trim()) && !isValidEmail(form.email.trim())) || (Boolean(form.emirates_id) && !isValidEmiratesId(form.emirates_id))} onClick={() => void save()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {saving ? "Saving..." : editing ? "Save employee" : "Add employee"}
            </Button>
          </DialogFooter>

          {signatureOpen ? (
            <div className="fixed inset-0 z-[70] flex h-[100dvh] flex-col overflow-hidden bg-[#191b20] p-3 text-white sm:p-5">
              <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
                <button type="button" aria-label="Close signature without saving" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10" onClick={() => setSignatureOpen(false)}>
                  <X className="h-8 w-8" />
                </button>
                <div className="min-w-0 flex-1 text-center">
                  <p className="text-xs font-semibold text-slate-400">Employee signature</p>
                  <p className="truncate font-bold">{form.full_name.trim() || "New employee"}</p>
                </div>
                <button type="button" className="h-11 shrink-0 rounded-full bg-white px-5 font-bold text-slate-950 disabled:opacity-40" disabled={!signatureHasInk} onClick={saveSignature}>Done</button>
              </div>
              <div className="mx-auto mt-3 flex min-h-0 w-full max-w-5xl flex-1 flex-col">
                <SmoothSignatureCanvas ref={signatureRef} className="min-h-0 flex-1" onStroke={() => setSignatureHasInk(true)} onClear={() => setSignatureHasInk(false)} />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" className="flex h-12 items-center justify-center rounded-xl bg-[#222631] font-semibold disabled:opacity-40" disabled={!signatureHasInk} onClick={() => signatureRef.current?.undo()}><Undo2 className="mr-2 h-4 w-4" />Back</button>
                  <button type="button" className="flex h-12 items-center justify-center rounded-xl bg-[#222631] font-semibold disabled:opacity-40" disabled={!signatureHasInk} onClick={() => signatureRef.current?.clear()}><Trash2 className="mr-2 h-4 w-4" />Clear</button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
