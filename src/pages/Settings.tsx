import { useEffect, useRef, useState } from "react";
import { Building2, ExternalLink, FileBadge, FileText, Landmark, Stamp, Upload } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  company_license_url?: string | null;
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
  vat_enabled?: boolean | null;
  vat_rate?: number | null;
  deposit_return_days?: number | null;
  fine_fee_type?: ServiceFeeType | null;
  fine_fee_value?: number | null;
  salik_fee_type?: ServiceFeeType | null;
  salik_fee_value?: number | null;
  terms_en?: string | null;
  terms_ar?: string | null;
}

type ServiceFeeType = "fixed" | "percentage";
type ProfileStoragePathUpdate = Pick<Profile, "logo_url" | "stamp_url" | "company_license_url">;
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
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState(5);
  const [depositReturnDays, setDepositReturnDays] = useState(15);
  const [fineFeeType, setFineFeeType] = useState<ServiceFeeType>("fixed");
  const [fineFeeValue, setFineFeeValue] = useState(20);
  const [salikFeeType, setSalikFeeType] = useState<ServiceFeeType>("fixed");
  const [salikFeeValue, setSalikFeeValue] = useState(1);
  const [termsEn, setTermsEn] = useState("");
  const [termsAr, setTermsAr] = useState("");
  const [termsKeyPoints, setTermsKeyPoints] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoSignedUrl, setLogoSignedUrl] = useState<string | null>(null);
  const [stampUrl, setStampUrl] = useState<string | null>(null);
  const [stampSignedUrl, setStampSignedUrl] = useState<string | null>(null);
  const [companyLicenseUrl, setCompanyLicenseUrl] = useState<string | null>(null);
  const [companyLicenseSignedUrl, setCompanyLicenseSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingStamp, setUploadingStamp] = useState(false);
  const [uploadingCompanyLicense, setUploadingCompanyLicense] = useState(false);
  const logoFileInput = useRef<HTMLInputElement>(null);
  const stampFileInput = useRef<HTMLInputElement>(null);
  const companyLicenseFileInput = useRef<HTMLInputElement>(null);

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
      setVatEnabled(Boolean(p.vat_enabled));
      setVatRate(p.vat_rate ?? 5);
      setDepositReturnDays(p.deposit_return_days ?? 15);
      setFineFeeType(p.fine_fee_type || "fixed");
      setFineFeeValue(p.fine_fee_value ?? 20);
      setSalikFeeType(p.salik_fee_type || "fixed");
      setSalikFeeValue(p.salik_fee_value ?? 1);
      setTermsEn(p.terms_en || "");
      setTermsAr(p.terms_ar || "");
      setTermsKeyPoints((p as any).terms_key_points || "");
      setLogoUrl(p.logo_url);
      setStampUrl(p.stamp_url || null);
      setCompanyLicenseUrl(p.company_license_url || null);
      loadStoragePreview(p.logo_url, setLogoSignedUrl);
      loadStoragePreview(p.stamp_url || null, setStampSignedUrl);
      loadStoragePreview(p.company_license_url || null, setCompanyLicenseSignedUrl);
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
      vat_enabled: vatEnabled,
      vat_rate: Math.min(100, Math.max(0, Number(vatRate) || 0)),
      deposit_return_days: depositReturnDays,
      fine_fee_type: fineFeeType,
      fine_fee_value: fineFeeValue,
      salik_fee_type: salikFeeType,
      salik_fee_value: salikFeeValue,
      terms_en: termsEn.trim() || null,
      terms_ar: termsAr.trim() || null,
      terms_key_points: termsKeyPoints.trim() || null,
    } as any;

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

  const handleCompanyLicenseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please select a PDF file");
      e.target.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("PDF must be 10 MB or smaller");
      e.target.value = "";
      return;
    }

    setUploadingCompanyLicense(true);
    try {
      const path = `${user.id}/company-license.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("company-logos")
        .upload(path, file, { upsert: true, contentType: "application/pdf" });

      if (uploadError) {
        toast.error("Upload failed: " + uploadError.message);
        return;
      }

      const { error: profileError } = await updateProfileStoragePath({ company_license_url: path });
      if (profileError) {
        toast.error("Saved file but failed to update profile: " + profileError.message);
        return;
      }

      setCompanyLicenseUrl(path);
      await loadStoragePreview(path, setCompanyLicenseSignedUrl);
      toast.success("Company license uploaded");
    } finally {
      setUploadingCompanyLicense(false);
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
            <Tabs defaultValue="company" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="company">Company</TabsTrigger>
                <TabsTrigger value="finance">Finance</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
              </TabsList>

              <TabsContent value="company" className="mt-6">
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
                        <FileText className="h-4 w-4" />
                        Company License
                      </CardTitle>
                      <CardDescription>Upload the current company license in PDF format.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
                            <FileText className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {companyLicenseUrl ? "Company license.pdf" : "No license uploaded"}
                            </p>
                            <p className="text-xs text-muted-foreground">PDF only, maximum 10 MB.</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {companyLicenseSignedUrl && (
                            <Button type="button" variant="outline" size="sm" asChild>
                              <a href={companyLicenseSignedUrl} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4" />
                                Open PDF
                              </a>
                            </Button>
                          )}
                          <input
                            ref={companyLicenseFileInput}
                            type="file"
                            accept="application/pdf,.pdf"
                            className="hidden"
                            onChange={handleCompanyLicenseUpload}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => companyLicenseFileInput.current?.click()}
                            disabled={uploadingCompanyLicense}
                            className="gap-1.5"
                          >
                            <Upload className="h-4 w-4" />
                            {uploadingCompanyLicense
                              ? "Uploading..."
                              : companyLicenseUrl
                                ? "Replace PDF"
                                : "Upload PDF"}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="finance" className="mt-6">
                <div className="flex flex-col gap-6">
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

                <div className="grid gap-1.5">
                  <Label htmlFor="deposit-return-days">Deposit Return Window</Label>
                  <Input
                    id="deposit-return-days"
                    type="number"
                    min={0}
                    max={90}
                    value={depositReturnDays}
                    onChange={(e) => setDepositReturnDays(Number(e.target.value))}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Days after contract closure before deposit is returned
                  </p>
                </div>
              </CardContent>
                  </Card>

                  <Card>
              <CardHeader>
                <CardTitle className="text-base">VAT Settings</CardTitle>
                <CardDescription>Controls whether generated invoices are VAT tax invoices.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="flex min-h-10 items-center justify-between gap-4 rounded-md border border-border px-3 py-2 md:col-span-2">
                  <div className="grid gap-0.5">
                    <Label htmlFor="vat-enabled">Enable VAT Invoice</Label>
                    <p className="text-xs text-muted-foreground">
                      When enabled, invoices show TAX INVOICE and calculate VAT.
                    </p>
                  </div>
                  <Switch id="vat-enabled" checked={vatEnabled} onCheckedChange={setVatEnabled} />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="vat-rate">VAT Rate (%)</Label>
                  <Input
                    id="vat-rate"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={vatRate}
                    onChange={(e) => setVatRate(Number(e.target.value))}
                    className="font-mono"
                  />
                </div>

                <p className="self-end text-xs text-muted-foreground md:pb-2">
                  When disabled, invoices show INVOICE and hide VAT/tax rows.
                </p>
              </CardContent>
                  </Card>

                  <Card>
              <CardHeader>
                <CardTitle className="text-base">Import Service Fees</CardTitle>
                <CardDescription>Default service fees applied when importing fines and Salik charges.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="grid gap-3">
                  <Label>Fine Service Fee</Label>
                  <RadioGroup
                    value={fineFeeType}
                    onValueChange={(value) => setFineFeeType(value as ServiceFeeType)}
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    <Label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-normal">
                      <RadioGroupItem value="fixed" />
                      Fixed (AED)
                    </Label>
                    <Label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-normal">
                      <RadioGroupItem value="percentage" />
                      Percentage (%)
                    </Label>
                  </RadioGroup>
                  <div className="grid gap-1.5">
                    <Label htmlFor="fine-fee-value">Value</Label>
                    <Input
                      id="fine-fee-value"
                      type="number"
                      min={0}
                      step="0.01"
                      value={fineFeeValue}
                      onChange={(e) => setFineFeeValue(Number(e.target.value))}
                      className="font-mono"
                    />
                  </div>
                </div>

                <div className="grid gap-3">
                  <Label>Salik Service Fee</Label>
                  <RadioGroup
                    value={salikFeeType}
                    onValueChange={(value) => setSalikFeeType(value as ServiceFeeType)}
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    <Label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-normal">
                      <RadioGroupItem value="fixed" />
                      Fixed (AED)
                    </Label>
                    <Label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-normal">
                      <RadioGroupItem value="percentage" />
                      Percentage (%)
                    </Label>
                  </RadioGroup>
                  <div className="grid gap-1.5">
                    <Label htmlFor="salik-fee-value">Value</Label>
                    <Input
                      id="salik-fee-value"
                      type="number"
                      min={0}
                      step="0.01"
                      value={salikFeeValue}
                      onChange={(e) => setSalikFeeValue(Number(e.target.value))}
                      className="font-mono"
                    />
                  </div>
                </div>
              </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="documents" className="mt-6">
                <div className="flex flex-col gap-6">
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
                  <Label htmlFor="terms-key-points">Key Terms (shown to customer before signing)</Label>
                  <Textarea
                    id="terms-key-points"
                    value={termsKeyPoints}
                    onChange={(e) => setTermsKeyPoints(e.target.value)}
                    placeholder={"One short point per line, e.g.:\nDeposit AED 2,000 held 15 days\nMileage limit 250 km/day, excess AED 1/km\nFines +AED 20 service fee each"}
                    rows={5}
                    className="resize-y"
                  />
                  <CardDescription className="text-xs">
                    Each line becomes one bullet shown to the customer in a quick summary before they sign — keep each line short. This is separate from the full legal terms below.
                  </CardDescription>
                </div>

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
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end pb-2">
              <Button
                onClick={handleSave}
                disabled={saving || uploadingLogo || uploadingStamp || uploadingCompanyLicense}
              >
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
