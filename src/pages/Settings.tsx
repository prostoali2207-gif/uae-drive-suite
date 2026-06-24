import { useEffect, useRef, useState } from "react";
import { Building2, FileBadge, Landmark, Stamp, Upload } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { logImageCompressionUpload, prepareImageForStorageUpload } from "@/lib/imageCompression";
import { toast } from "sonner";

interface Profile {
  id: string;
  email: string;
  company_name: string;
  company_name_ar?: string | null;
  logo_url: string | null;
  stamp_url?: string | null;
  phone_number?: string | null;
  trn?: string | null;
  address?: string | null;
  bank_name?: string | null;
  beneficiary_name?: string | null;
  iban?: string | null;
  account_number?: string | null;
  swift_code?: string | null;
  invoice_prefix?: string | null;
  contract_prefix?: string | null;
  terms_en?: string | null;
  terms_ar?: string | null;
}

type ProfileStoragePathUpdate = Pick<Profile, "logo_url" | "stamp_url">;
type SupabaseErrorLike = { message: string };

const Settings = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [companyNameAr, setCompanyNameAr] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [trn, setTrn] = useState("");
  const [address, setAddress] = useState("");
  const [bankName, setBankName] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [iban, setIban] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [swiftCode, setSwiftCode] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("INV");
  const [contractPrefix, setContractPrefix] = useState("CTR");
  const [termsEn, setTermsEn] = useState("");
  const [termsAr, setTermsAr] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoSignedUrl, setLogoSignedUrl] = useState<string | null>(null);
  const [stampUrl, setStampUrl] = useState<string | null>(null);
  const [stampSignedUrl, setStampSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingStamp, setUploadingStamp] = useState(false);
  const logoFileInput = useRef<HTMLInputElement>(null);
  const stampFileInput = useRef<HTMLInputElement>(null);

  const loadStoragePreview = async (path: string | null, setSignedUrl: (url: string | null) => void) => {
    if (!path) {
      setSignedUrl(null);
      return true;
    }

    const { data, error } = await supabase.storage.from("company-logos").createSignedUrl(path, 60 * 60);
    if (error) {
      setSignedUrl(null);
      toast.error("Failed to load preview: " + error.message);
      return false;
    }

    setSignedUrl(data?.signedUrl ?? null);
    return true;
  };

  const updateProfileStoragePath = async (values: Partial<ProfileStoragePathUpdate>) => {
    if (!user) return { error: null as SupabaseErrorLike | null };

    const profiles = supabase.from("profiles") as unknown as {
      update: (payload: Partial<ProfileStoragePathUpdate>) => {
        eq: (column: "id", value: string) => Promise<{ error: SupabaseErrorLike | null }>;
      };
    };

    return profiles.update(values).eq("id", user.id);
  };

  const fetchProfile = async () => {
    if (!user) return;
    const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

    if (error) {
      toast.error("Failed to load profile");
    } else if (data) {
      const p = data as Profile;
      setProfile(p);
      setCompanyName(p.company_name || "");
      setCompanyNameAr(p.company_name_ar || "");
      setPhoneNumber(p.phone_number || "");
      setTrn(p.trn || "");
      setAddress(p.address || "");
      setBankName(p.bank_name || "");
      setBeneficiaryName(p.beneficiary_name || "");
      setIban(p.iban || "");
      setAccountNumber(p.account_number || "");
      setSwiftCode(p.swift_code || "");
      setInvoicePrefix(p.invoice_prefix || "INV");
      setContractPrefix(p.contract_prefix || "CTR");
      setTermsEn(p.terms_en || "");
      setTermsAr(p.terms_ar || "");
      setLogoUrl(p.logo_url);
      setStampUrl(p.stamp_url || null);
      loadStoragePreview(p.logo_url, setLogoSignedUrl);
      loadStoragePreview(p.stamp_url || null, setStampSignedUrl);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const profileData = {
      id: user.id,
      email: profile?.email ?? user.email ?? "",
      company_name: companyName.trim(),
      company_name_ar: companyNameAr.trim() || null,
      phone_number: phoneNumber.trim() || null,
      trn: trn.trim() || null,
      address: address.trim() || null,
      bank_name: bankName.trim() || null,
      beneficiary_name: beneficiaryName.trim() || null,
      iban: iban.trim() || null,
      account_number: accountNumber.trim() || null,
      swift_code: swiftCode.trim() || null,
      invoice_prefix: invoicePrefix.trim() || "INV",
      contract_prefix: contractPrefix.trim() || "CTR",
      terms_en: termsEn.trim() || null,
      terms_ar: termsAr.trim() || null,
    };

    const { data, error } = await supabase.from("profiles").upsert(profileData).select();
    setSaving(false);

    if (error) {
      toast.error("Failed to save: " + error.message);
      return;
    }

    const savedProfile = data?.[0] as Profile | undefined;
    if (savedProfile) setProfile(savedProfile);
    toast.success("Company settings saved");
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingLogo(true);
    try {
      const uploadFile = await prepareImageForStorageUpload(file);
      const ext = uploadFile.name.split(".").pop() || "jpg";
      const path = `${user.id}/logo-${Date.now()}.${ext}`;
      logImageCompressionUpload("Settings", file, uploadFile, path);
      const { error: upErr } = await supabase.storage
        .from("company-logos")
        .upload(path, uploadFile, { upsert: true, contentType: uploadFile.type });

      if (upErr) {
        toast.error("Upload failed: " + upErr.message);
        return;
      }

      const { error: dbErr } = await supabase.from("profiles").update({ logo_url: path }).eq("id", user.id);
      if (dbErr) {
        toast.error("Saved file but failed to update profile: " + dbErr.message);
        return;
      }

      setLogoUrl(path);
      await loadStoragePreview(path, setLogoSignedUrl);
      toast.success("Logo updated");
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  };

  const handleStampUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingStamp(true);
    try {
      const uploadFile = await prepareImageForStorageUpload(file);
      const ext = uploadFile.name.split(".").pop() || "jpg";
      const path = `${user.id}/stamp-${Date.now()}.${ext}`;
      logImageCompressionUpload("Settings stamp", file, uploadFile, path);
      const { error: upErr } = await supabase.storage
        .from("company-logos")
        .upload(path, uploadFile, { upsert: true, contentType: uploadFile.type });

      if (upErr) {
        toast.error("Upload failed: " + upErr.message);
        return;
      }

      const { error: dbErr } = await updateProfileStoragePath({ stamp_url: path });
      if (dbErr) {
        toast.error("Saved file but failed to update profile: " + dbErr.message);
        return;
      }

      setStampUrl(path);
      await loadStoragePreview(path, setStampSignedUrl);
      toast.success("Stamp uploaded");
    } finally {
      setUploadingStamp(false);
      e.target.value = "";
    }
  };

  return (
    <DashboardLayout title="Settings" subtitle="Manage your company profile">
      <div className="max-w-4xl">
        {loading ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">Loading...</CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4" />
                  Company details
                </CardTitle>
                <CardDescription>Company identity used across documents.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                    {logoSignedUrl ? (
                      <img src={logoSignedUrl} alt="Company logo" className="h-full w-full object-cover" />
                    ) : (
                      <Building2 className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      ref={logoFileInput}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => logoFileInput.current?.click()}
                      disabled={uploadingLogo}
                      className="w-fit gap-1.5"
                    >
                      <Upload className="h-4 w-4" />
                      {uploadingLogo ? "Uploading..." : logoUrl ? "Replace logo" : "Upload logo"}
                    </Button>
                    <p className="text-xs text-muted-foreground">PNG, JPG or SVG. Max 2MB recommended.</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="company">Company Name (English)</Label>
                    <Input
                      id="company"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="My Rental Co."
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="company-ar">Company Name (Arabic)</Label>
                    <Input
                      id="company-ar"
                      value={companyNameAr}
                      onChange={(e) => setCompanyNameAr(e.target.value)}
                      placeholder="اسم الشركة"
                      className="text-right"
                      dir="rtl"
                      style={{ unicodeBidi: "plaintext" }}
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" value={profile?.email ?? user?.email ?? ""} disabled />
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+971 50 000 0000"
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="trn">TRN</Label>
                    <Input
                      id="trn"
                      value={trn}
                      onChange={(e) => setTrn(e.target.value)}
                      placeholder="e.g. 100123456700003"
                      className="font-mono"
                    />
                  </div>

                  <div className="grid gap-1.5 md:col-span-2">
                    <Label htmlFor="address">Address / Location</Label>
                    <Textarea
                      id="address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Office address or location"
                      rows={3}
                      className="resize-y"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Landmark className="h-4 w-4" />
                  Invoice &amp; Bank Details
                </CardTitle>
                <CardDescription>Defaults for invoices and payment instructions.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="bank-name">Bank Name</Label>
                  <Input id="bank-name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="beneficiary-name">Beneficiary Name</Label>
                  <Input
                    id="beneficiary-name"
                    value={beneficiaryName}
                    onChange={(e) => setBeneficiaryName(e.target.value)}
                  />
                </div>

                <div className="grid gap-1.5 md:col-span-2">
                  <Label htmlFor="iban">IBAN</Label>
                  <Input
                    id="iban"
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                    placeholder="AE00 0000 0000 0000 0000 000"
                    className="font-mono"
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="account-number">Account Number</Label>
                  <Input
                    id="account-number"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="font-mono"
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="swift-code">SWIFT Code</Label>
                  <Input
                    id="swift-code"
                    value={swiftCode}
                    onChange={(e) => setSwiftCode(e.target.value)}
                    className="font-mono uppercase"
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="invoice-prefix">Invoice Prefix</Label>
                  <Input
                    id="invoice-prefix"
                    value={invoicePrefix}
                    onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
                    placeholder="INV"
                    className="font-mono uppercase"
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="contract-prefix">Contract Prefix</Label>
                  <Input
                    id="contract-prefix"
                    value={contractPrefix}
                    onChange={(e) => setContractPrefix(e.target.value.toUpperCase())}
                    placeholder="CTR"
                    className="font-mono uppercase"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Stamp className="h-4 w-4" />
                  Stamp &amp; Documents
                </CardTitle>
                <CardDescription>Company stamp for future document generation.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-28 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                    {stampSignedUrl ? (
                      <img src={stampSignedUrl} alt="Company stamp" className="h-full w-full object-contain" />
                    ) : (
                      <FileBadge className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      ref={stampFileInput}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleStampUpload}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => stampFileInput.current?.click()}
                      disabled={uploadingStamp}
                      className="w-fit gap-1.5"
                    >
                      <Upload className="h-4 w-4" />
                      {uploadingStamp ? "Uploading..." : stampUrl ? "Replace stamp" : "Upload stamp"}
                    </Button>
                    <p className="text-xs text-muted-foreground">PNG with transparent background is recommended.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Terms &amp; Conditions</CardTitle>
                <CardDescription>Rental terms shown on company documents.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="terms-en">English Terms</Label>
                  <Textarea
                    id="terms-en"
                    value={termsEn}
                    onChange={(e) => setTermsEn(e.target.value)}
                    placeholder="Enter your rental terms and conditions in English..."
                    rows={6}
                    className="resize-y"
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="terms-ar">Arabic Terms</Label>
                  <Textarea
                    id="terms-ar"
                    value={termsAr}
                    onChange={(e) => setTermsAr(e.target.value)}
                    placeholder="أدخل الشروط والأحكام بالعربية..."
                    rows={6}
                    className="resize-y text-right"
                    dir="rtl"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end pb-2">
              <Button onClick={handleSave} disabled={saving || uploadingLogo || uploadingStamp}>
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Settings;
