import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, FileText, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { NationalityCombobox } from "@/components/NationalityCombobox";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ClientType = "Resident" | "Tourist";

interface FormState {
  full_name: string;
  phone: string;
  date_of_birth: string;
  client_type: ClientType;
  emirates_id: string;
  emirates_id_expiry: string;
  passport_number: string;
  passport_expiry: string;
  nationality: string;
  license_number: string;
  license_expiry: string;
  email: string;
}

interface DocUrls {
  eid_front_url: string;
  eid_back_url: string;
  license_front_url: string;
  license_back_url: string;
  passport_photo_url: string;
}

const emptyForm: FormState = {
  full_name: "",
  phone: "",
  date_of_birth: "",
  client_type: "Resident",
  emirates_id: "",
  emirates_id_expiry: "",
  passport_number: "",
  passport_expiry: "",
  nationality: "",
  license_number: "",
  license_expiry: "",
  email: "",
};

// ── File upload field ─────────────────────────────────────────────────────────

interface FileFieldProps {
  label: string;
  fieldKey: keyof DocUrls;
  ownerId: string;
  value: string;
  onUploaded: (key: keyof DocUrls, url: string) => void;
}

function FileUploadField({ label, fieldKey, ownerId, value, onUploaded }: FileFieldProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${Date.now()}.${ext}`;
      const { data, error: uploadError } = await supabase.storage
        .from("client-documents")
        .upload(path, file, { upsert: false });
      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }
      const { data: urlData } = supabase.storage
        .from("client-documents")
        .getPublicUrl(path);
      onUploaded(fieldKey, urlData.publicUrl);
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="grid gap-1.5">
      <Label className="text-sm text-gray-600">{label}</Label>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border-2 border-dashed p-3 transition-colors",
          value
            ? "border-green-400 bg-green-50"
            : "border-gray-200 bg-gray-50 hover:border-gray-400",
        )}
      >
        {value ? (
          <div className="flex flex-1 items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="truncate text-xs">Uploaded</span>
          </div>
        ) : (
          <div className="flex flex-1 items-center gap-2 text-gray-400">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="text-xs">No file selected</span>
          </div>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 shrink-0 gap-1 text-xs"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {value ? "Replace" : "Upload"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={handleChange}
        />
      </div>
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
      {children}
    </h2>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClientRegister() {
  const [searchParams] = useSearchParams();
  const ownerId = searchParams.get("owner_id") ?? "";

  const [form, setFormState] = useState<FormState>(emptyForm);
  const [docs, setDocs] = useState<DocUrls>({
    eid_front_url: "",
    eid_back_url: "",
    license_front_url: "",
    license_back_url: "",
    passport_photo_url: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const set = (patch: Partial<FormState>) =>
    setFormState((prev) => ({ ...prev, ...patch }));

  const setDoc = (key: keyof DocUrls, url: string) =>
    setDocs((prev) => ({ ...prev, [key]: url }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    setSubmitting(true);
    try {
      const payload = {
        owner_id: ownerId,
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        date_of_birth: form.date_of_birth || null,
        client_type: form.client_type,
        emirates_id: form.client_type === "Resident" ? form.emirates_id.trim() : "",
        emirates_id_expiry:
          form.client_type === "Resident" ? form.emirates_id_expiry || null : null,
        passport_number:
          form.client_type === "Tourist" ? form.passport_number.trim() : "",
        passport_expiry:
          form.client_type === "Tourist" ? form.passport_expiry || null : null,
        nationality: form.nationality.trim(),
        license_number: form.license_number.trim(),
        license_expiry: form.license_expiry || null,
        email: form.email.trim() || null,
        eid_front_url: docs.eid_front_url || null,
        eid_back_url: docs.eid_back_url || null,
        license_front_url: docs.license_front_url || null,
        license_back_url: docs.license_back_url || null,
        passport_photo_url: docs.passport_photo_url || null,
      };
      const { error } = await supabase.from("clients").insert(payload as never);
      if (error) throw error;
      setSubmitted(true);
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : "An error occurred. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Invalid link ─────────────────────────────────────────────────────────

  if (!ownerId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <span className="text-xl font-bold text-red-600">!</span>
          </div>
          <p className="font-semibold text-gray-900">Invalid registration link.</p>
          <p className="mt-1 text-sm text-gray-500">
            Please use the link provided by your rental company.
          </p>
        </div>
      </div>
    );
  }

  // ── Success screen ────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-green-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Registration Submitted</h2>
          <p className="mt-2 text-sm text-gray-600">
            Your details have been submitted. We will contact you shortly.
          </p>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-xl">
        {/* Page header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Client Registration</h1>
          <p className="mt-1 text-sm text-gray-500">
            Please fill in your details to register as a rental client.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-gray-200 bg-white shadow-sm"
        >
          {/* ── Personal information ── */}
          <div className="border-b border-gray-100 px-6 py-6">
            <SectionHeading>Personal Information</SectionHeading>
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="full_name">
                  Full Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="full_name"
                  required
                  placeholder="As on official ID"
                  value={form.full_name}
                  onChange={(e) => set({ full_name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="phone">
                    Phone <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    required
                    placeholder="+971 50 000 0000"
                    value={form.phone}
                    onChange={(e) => set({ phone: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="dob">Date of Birth</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={form.date_of_birth}
                    onChange={(e) => set({ date_of_birth: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Optional"
                  value={form.email}
                  onChange={(e) => set({ email: e.target.value })}
                />
              </div>

              <div className="grid gap-1.5">
                <Label>
                  Nationality <span className="text-red-500">*</span>
                </Label>
                <NationalityCombobox
                  value={form.nationality}
                  onChange={(v) => set({ nationality: v })}
                />
              </div>
            </div>
          </div>

          {/* ── Identity ── */}
          <div className="border-b border-gray-100 px-6 py-6">
            <SectionHeading>Identity</SectionHeading>

            {/* Client type toggle */}
            <div className="mb-4 flex w-full rounded-xl border border-gray-200 bg-gray-50 p-1">
              {(["Resident", "Tourist"] as ClientType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set({ client_type: t })}
                  className={cn(
                    "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    form.client_type === t
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {form.client_type === "Resident" ? (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="eid">Emirates ID</Label>
                    <Input
                      id="eid"
                      placeholder="784-XXXX-XXXXXXX-X"
                      value={form.emirates_id}
                      onChange={(e) => set({ emirates_id: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="eid_exp">Emirates ID Expiry</Label>
                    <Input
                      id="eid_exp"
                      type="date"
                      value={form.emirates_id_expiry}
                      onChange={(e) => set({ emirates_id_expiry: e.target.value })}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="pass">Passport Number</Label>
                    <Input
                      id="pass"
                      value={form.passport_number}
                      onChange={(e) => set({ passport_number: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="pass_exp">Passport Expiry</Label>
                    <Input
                      id="pass_exp"
                      type="date"
                      value={form.passport_expiry}
                      onChange={(e) => set({ passport_expiry: e.target.value })}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Driving license ── */}
          <div className="border-b border-gray-100 px-6 py-6">
            <SectionHeading>Driving License</SectionHeading>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="lic">
                  License Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="lic"
                  required
                  value={form.license_number}
                  onChange={(e) => set({ license_number: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="lic_exp">License Expiry</Label>
                <Input
                  id="lic_exp"
                  type="date"
                  value={form.license_expiry}
                  onChange={(e) => set({ license_expiry: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* ── Document uploads ── */}
          <div className="px-6 py-6">
            <SectionHeading>Documents</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              {form.client_type === "Resident" ? (
                <>
                  <FileUploadField
                    label="Emirates ID Front"
                    fieldKey="eid_front_url"
                    ownerId={ownerId}
                    value={docs.eid_front_url}
                    onUploaded={setDoc}
                  />
                  <FileUploadField
                    label="Emirates ID Back"
                    fieldKey="eid_back_url"
                    ownerId={ownerId}
                    value={docs.eid_back_url}
                    onUploaded={setDoc}
                  />
                </>
              ) : (
                <div className="col-span-2 grid grid-cols-2 gap-3">
                  <FileUploadField
                    label="Passport Photo"
                    fieldKey="passport_photo_url"
                    ownerId={ownerId}
                    value={docs.passport_photo_url}
                    onUploaded={setDoc}
                  />
                </div>
              )}
              <FileUploadField
                label="License Front"
                fieldKey="license_front_url"
                ownerId={ownerId}
                value={docs.license_front_url}
                onUploaded={setDoc}
              />
              <FileUploadField
                label="License Back"
                fieldKey="license_back_url"
                ownerId={ownerId}
                value={docs.license_back_url}
                onUploaded={setDoc}
              />
            </div>
          </div>

          {/* ── Submit ── */}
          <div className="border-t border-gray-100 px-6 pb-6 pt-4">
            {submitError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {submitError}
              </div>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Registration"
              )}
            </Button>
          </div>
        </form>

        <p className="mt-4 text-center text-xs text-gray-400">
          Your data is stored securely and used only for rental purposes.
        </p>
      </div>
    </div>
  );
}
