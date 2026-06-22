import { useEffect, useState } from "react";
import { FileText, IdCard } from "lucide-react";
import { toast } from "sonner";
import { NationalityCombobox } from "@/components/NationalityCombobox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase";
import { logImageCompressionUpload, prepareImageForStorageUpload } from "@/lib/imageCompression";

export interface EditableClient {
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
  passport_number: string | null;
  passport_expiry: string | null;
  date_of_birth: string | null;
  passport_photo_url: string | null;
  eid_front_url: string | null;
  eid_back_url: string | null;
  license_front_url: string | null;
  license_back_url: string | null;
}

type ClientDocumentField =
  | "passport_photo_url"
  | "eid_front_url"
  | "eid_back_url"
  | "license_front_url"
  | "license_back_url";

interface ClientEditDialogProps {
  client: EditableClient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const getForm = (client: EditableClient) => ({
  full_name: client.full_name,
  phone: client.phone,
  client_type: client.client_type === "Tourist" ? "Tourist" : "Resident",
  date_of_birth: client.date_of_birth ?? "",
  emirates_id: client.emirates_id ?? "",
  emirates_id_expiry: client.emirates_id_expiry ?? "",
  passport_number: client.passport_number ?? "",
  passport_expiry: client.passport_expiry ?? "",
  nationality: client.nationality ?? "",
  email: client.email ?? "",
  license_number: client.license_number ?? "",
  license_expiry: client.license_expiry ?? "",
  passport_photo_url: client.passport_photo_url ?? "",
  eid_front_url: client.eid_front_url ?? "",
  eid_back_url: client.eid_back_url ?? "",
  license_front_url: client.license_front_url ?? "",
  license_back_url: client.license_back_url ?? "",
});

export function ClientEditDialog({ client, open, onOpenChange, onSaved }: ClientEditDialogProps) {
  const [form, setForm] = useState(() => getForm(client));
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<ClientDocumentField | null>(null);

  useEffect(() => {
    if (open) setForm(getForm(client));
  }, [client, open]);

  const uploadDocument = async (file: File | undefined, field: ClientDocumentField) => {
    if (!file) return;
    setUploadingField(field);
    try {
      const uploadFile = await prepareImageForStorageUpload(file);
      const path = `client-documents/${Date.now()}_${uploadFile.name}`;
      logImageCompressionUpload("ClientDetail", file, uploadFile, path);
      const { error } = await supabase.storage
        .from("client-documents")
        .upload(path, uploadFile, { upsert: true });
      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from("client-documents").getPublicUrl(path);
      setForm((current) => ({ ...current, [field]: publicUrl }));
    } catch (error) {
      console.error("Client document upload failed:", error);
      toast.error("Failed to upload document");
    } finally {
      setUploadingField(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.full_name.trim() || !form.phone.trim()) {
      toast.error("Full name and phone are required");
      return;
    }

    setSaving(true);
    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      client_type: form.client_type,
      date_of_birth: form.date_of_birth || null,
      emirates_id: form.client_type === "Resident" ? form.emirates_id.trim() : "",
      emirates_id_expiry: form.client_type === "Resident" ? form.emirates_id_expiry || null : null,
      passport_number: form.client_type === "Tourist" ? form.passport_number.trim() : "",
      passport_expiry: form.client_type === "Tourist" ? form.passport_expiry || null : null,
      nationality: form.nationality.trim(),
      email: form.email.trim() || null,
      license_number: form.license_number.trim(),
      license_expiry: form.license_expiry || null,
      passport_photo_url: form.passport_photo_url || null,
      eid_front_url: form.eid_front_url || null,
      eid_back_url: form.eid_back_url || null,
      license_front_url: form.license_front_url || null,
      license_back_url: form.license_back_url || null,
    };

    const { error } = await supabase.from("clients").update(payload as never).eq("id", client.id);
    setSaving(false);
    if (error) {
      toast.error(`Failed to update client: ${error.message}`);
      return;
    }

    toast.success("Client updated");
    onOpenChange(false);
    onSaved();
  };

  const documentUpload = (
    field: ClientDocumentField,
    label: string,
    Icon: typeof IdCard,
  ) => (
    <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-muted p-3 hover:border-foreground/30">
      <div className="rounded bg-background p-2">
        <Icon className="h-4 w-4 text-foreground" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col text-left">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="truncate text-xs text-muted-foreground">
          {uploadingField === field ? "Uploading..." : form[field] ? "Uploaded — tap to replace" : "Tap to upload"}
        </span>
      </div>
      <input
        type="file"
        accept="image/*"
        disabled={uploadingField !== null}
        onChange={(event) => uploadDocument(event.target.files?.[0], field)}
        className="hidden"
      />
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto text-foreground font-dm-sans sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
          <DialogDescription>Update the client's details below.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="detail-client-name">Full Name</Label>
            <Input
              id="detail-client-name"
              required
              value={form.full_name}
              onChange={(event) => setForm({ ...form, full_name: event.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="detail-client-phone">Phone</Label>
              <Input
                id="detail-client-phone"
                required
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="detail-client-dob">Date of Birth</Label>
              <Input
                id="detail-client-dob"
                type="date"
                value={form.date_of_birth}
                onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Client Type</Label>
            <Tabs
              value={form.client_type}
              onValueChange={(client_type) => setForm({ ...form, client_type })}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="Resident">Resident</TabsTrigger>
                <TabsTrigger value="Tourist">Tourist</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {form.client_type === "Resident" ? (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="detail-client-eid">Emirates ID</Label>
                  <Input
                    id="detail-client-eid"
                    required
                    value={form.emirates_id}
                    onChange={(event) => setForm({ ...form, emirates_id: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="detail-client-eid-expiry">Emirates ID Expiry</Label>
                  <Input
                    id="detail-client-eid-expiry"
                    type="date"
                    required
                    value={form.emirates_id_expiry}
                    onChange={(event) => setForm({ ...form, emirates_id_expiry: event.target.value })}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="detail-client-passport">Passport Number</Label>
                  <Input
                    id="detail-client-passport"
                    required
                    value={form.passport_number}
                    onChange={(event) => setForm({ ...form, passport_number: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="detail-client-passport-expiry">Passport Expiry</Label>
                  <Input
                    id="detail-client-passport-expiry"
                    type="date"
                    required
                    value={form.passport_expiry}
                    onChange={(event) => setForm({ ...form, passport_expiry: event.target.value })}
                  />
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="detail-client-nationality">Nationality</Label>
              <NationalityCombobox
                id="detail-client-nationality"
                value={form.nationality}
                onChange={(nationality) => setForm({ ...form, nationality })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="detail-client-email">Email</Label>
              <Input
                id="detail-client-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="detail-client-license">License Number</Label>
              <Input
                id="detail-client-license"
                required
                value={form.license_number}
                onChange={(event) => setForm({ ...form, license_number: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="detail-client-license-expiry">License Expiry</Label>
              <Input
                id="detail-client-license-expiry"
                type="date"
                required
                value={form.license_expiry}
                onChange={(event) => setForm({ ...form, license_expiry: event.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-3 border-t border-border pt-4">
            <Label className="font-semibold">Documents</Label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {form.client_type === "Tourist"
                ? documentUpload("passport_photo_url", "Passport Photo", IdCard)
                : (
                  <>
                    {documentUpload("eid_front_url", "Emirates ID Front", IdCard)}
                    {documentUpload("eid_back_url", "Emirates ID Back", IdCard)}
                  </>
                )}
              {documentUpload("license_front_url", "License Front", FileText)}
              {documentUpload("license_back_url", "License Back", FileText)}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || uploadingField !== null}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
