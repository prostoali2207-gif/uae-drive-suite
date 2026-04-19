import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search } from "lucide-react";
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
import {
  initialClients,
  initialClientContracts,
  type ClientRecord,
} from "@/data/clients";

const Clients = () => {
  const [clients, setClients] = useState<ClientRecord[]>(initialClients);
  const [contracts] = useState(initialClientContracts);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState<Omit<ClientRecord, "id">>({
    name: "",
    phone: "",
    emiratesId: "",
    nationality: "",
    email: "",
    licenseNumber: "",
    licenseExpiry: "",
    passportNumber: "",
  });

  const enriched = useMemo(() => {
    return clients.map((c) => {
      const cs = contracts.filter((k) => k.clientId === c.id);
      const outstanding = cs.reduce((sum, k) => sum + Math.max(0, k.totalAmount - k.paidAmount), 0);
      const hasActive = cs.some((k) => k.status === "Active" || k.status === "Expiring Soon");
      return { ...c, totalContracts: cs.length, hasActive, outstanding };
    });
  }, [clients, contracts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return enriched;
    return enriched.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.emiratesId.toLowerCase().includes(q),
    );
  }, [enriched, query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setClients((prev) => [
      ...prev,
      { ...form, id: crypto.randomUUID(), email: form.email?.trim() || undefined },
    ]);
    setForm({
      name: "",
      phone: "",
      emiratesId: "",
      nationality: "",
      email: "",
      licenseNumber: "",
      licenseExpiry: "",
      passportNumber: "",
    });
    setOpen(false);
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

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add Client
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
              <DialogHeader>
                <DialogTitle>Add new client</DialogTitle>
                <DialogDescription>Enter the client's details below.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="grid gap-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="eid">Emirates ID</Label>
                    <Input id="eid" required value={form.emiratesId} onChange={(e) => setForm({ ...form, emiratesId: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="nat">Nationality</Label>
                    <Input id="nat" required value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
                  </div>
                  <div className="col-span-2 grid gap-1.5">
                    <Label htmlFor="email">Email <span className="text-muted-foreground">(optional)</span></Label>
                    <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="lic">License Number</Label>
                    <Input id="lic" required value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="licexp">License Expiry</Label>
                    <Input id="licexp" type="date" required value={form.licenseExpiry} onChange={(e) => setForm({ ...form, licenseExpiry: e.target.value })} />
                  </div>
                  <div className="col-span-2 grid gap-1.5">
                    <Label htmlFor="pass">Passport Number</Label>
                    <Input id="pass" required value={form.passportNumber} onChange={(e) => setForm({ ...form, passportNumber: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit">Save Client</Button>
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
                <TableHead className="px-5 text-xs">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                    No clients found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer">
                    <TableCell className="px-5 font-medium text-foreground">
                      <Link to={`/clients/${c.id}`} className="hover:underline">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.phone}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{c.emiratesId}</TableCell>
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
                      "px-5 text-sm font-medium",
                      c.outstanding > 0 ? "text-tint-rose-foreground" : "text-foreground",
                    )}>
                      AED {c.outstanding.toLocaleString()}
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
