import { useEffect, useState } from "react";
import { FileText, IdCard, Loader2, Search } from "lucide-react";
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
  unified_number: client.unified_number ?? "",
  gender: client.gender ?? "",
  emirates_id: client.emirates_id ?? "",
  emirates_id_expiry: client.emirates_id_expiry ?? "",
  passport_number: client.passport_number ?? "",
  passport_expiry: client.passport_expiry ?? "",
  nationality: client.nationality ?? "",
  email: client.email ?? "",
  license_number: client.license_number ?? "",
  license_expiry: client.license_expiry ?? "",
  license_type: client.license_type ?? "",
  license_issuing_country: client.license_issuing_country ?? "",
  traffic_file_number: client.traffic_file_number ?? "",
  passport_photo_url: client.passport_photo_url ?? "",
  eid_front_url: client.eid_front_url ?? "",
  eid_back_url: client.eid_back_url ?? "",
  license_front_url: client.license_front_url ?? "",
  license_back_url: client.license_back_url ?? "",
});

export function ClientEditDialog({ client, open, onOpenChange, onSaved }: ClientEditDialogProps) {
  const [form, setForm] = useState(() => getForm(client));
  const [saving, setSaving] = useState(false);
  const [findingUid, setFindingUid] = useState(false);
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
    const passportNumber = form.passport_number.trim();
    const nationality = form.nationality.trim();

    if (!passportNumber || !nationality || !form.date_of_birth || !form.gender) {
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
        dateOfBirth: form.date_of_birth,
        gender: form.gender,
      });

      if (!result.uid) throw new Error("GDRFA did not return a UID");

      setForm((current) => ({ ...current, unified_number: result.uid ?? "" }));
      toast.success(`UID found: ${result.uid}`);
      liveWindow?.close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "UID lookup failed");
    } finally {
      setFindingUid(false);
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
      unified_number: form.unified_number.trim() || null,
      gender: form.gender || null,
      emirates_id: form.client_type === "Resident" ? form.emirates_id.trim() : "",
      emirates_id_expiry: form.client_type === "Resident" ? form.emirates_id_expiry || null : null,
      passport_number: form.client_type === "Tourist" ? form.passport_number.trim() : "",
      passport_expiry: form.client_type === "Tourist" ? form.passport_expiry || null : null,
      nationality: form.nationality.trim(),
      email: form.email.trim() || null,
      license_number: form.license_number.trim(),
      license_expiry: form.license_expiry || null,
      license_type: form.license_type || null,
      license_issuing_country: form.license_type === "uae" ? null : form.license_issuing_country.trim() || null,
      traffic_file_number: form.traffic_file_number.trim() || null,
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
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain text-foreground font-dm-sans sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
          <DialogDescription>Update the client's details below.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="detail-client-name">Full Name</Label>
            <Input id="detail-client-name" required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="detail-client-phone">Phone</Label>
              <Input id="detail-client-phone" required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="detail-client-dob">Date of Birth</Label>
              <Input id="detail-client-dob" type="date" value={form.date_of_birth} onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Gender</Label>
            <Tabs value={form.gender} onValueChange={(gender) => setForm({ ...form, gender: gender as typeof form.gender })}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="male">Male</TabsTrigger>
                <TabsTrigger value="female">Female</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="grid gap-1.5">
            <Label>Driving Licence Type</Label>
            <Tabs value={form.license_type} onValueChange={(license_type) => setForm({ ...form, license_type: license_type as typeof form.license_type })}>
              <TabsList className="grid h-auto w-full grid-cols-1 gap-1 sm:grid-cols-3">
                <TabsTrigger value="uae" className="min-h-10">UAE Licence</TabsTrigger>
                <TabsTrigger value="foreign" className="min-h-10">Foreign Licence</TabsTrigger>
                <TabsTrigger value="international" className="min-h-10">International Permit</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="detail-traffic-file">Traffic File Number</Label>
            <Input id="detail-traffic-file" dir="ltr" inputMode="numeric" value={form.traffic_file_number} onChange={(event) => setForm({ ...form, traffic_file_number: event.target.value.replace(/\D/g, "") })} />
          </div>

          {(form.license_type === "foreign" || form.license_type === "international") && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="detail-license-country">Issuing Country</Label>
                <Input id="detail-license-country" value={form.license_issuing_country} onChange={(event) => setForm({ ...form, license_issuing_country: event.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="detail-client-uid">Unified Number (UID)</Label>
                <div className="grid gap-2">
                  <Input id="detail-client-uid" dir="ltr" inputMode="numeric" placeholder="UAE unified number" value={form.unified_number} onChange={(event) => setForm({ ...form, unified_number: event.target.value.replace(/\D/g, "") })} />
                  <Button type="button" variant="outline" className="w-full justify-center gap-2" onClick={handleFindUid} disabled={findingUid}>
                    {findingUid ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    {findingUid ? "Searching GDRFA..." : "Find UID automatically"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>Client Type</Label>
            <Tabs value={form.client_type} onValueChange={(client_type) => setForm({ ...form, client_type })}>
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
                  <Input id="detail-client-eid" required value={form.emirates_id} onChange={(event) => setForm({ ...form, emirates_id: event.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="detail-client-eid-expiry">Emirates ID Expiry</Label>
                  <Input id="detail-client-eid-expiry" type="date" required value={form.emirates_id_expiry} onChange={(event) => setForm({ ...form, emirates_id_expiry: event.target.value })} />
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="detail-client-passport">Passport Number</Label>
                  <Input id="detail-client-passport" required value={form.passport_number} onChange={(event) => setForm({ ...form, passport_number: event.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="detail-client-passport-expiry">Passport Expiry</Label>
                  <Input id="detail-client-passport-expiry" type="date" required value={form.passport_expiry} onChange={(event) => setForm({ ...form, passport_expiry: event.target.value })} />
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="detail-client-nationality">Nationality</Label>
              <NationalityCombobox id="detail-client-nationality" value={form.nationality} onChange={(nationality) => setForm({ ...form, nationality })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="detail-client-email">Email</Label>
              <Input id="detail-client-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="detail-client-license">License Number</Label>
              <Input id="detail-client-license" required value={form.license_number} onChange={(event) => setForm({ ...form, license_number: event.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="detail-client-license-expiry">License Expiry</Label>
              <Input id="detail-client-license-expiry" type="date" required value={form.license_expiry} onChange={(event) => setForm({ ...form, license_expiry: event.target.value })} />
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || findingUid || uploadingField !== null}>{saving ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
