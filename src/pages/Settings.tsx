import { useEffect, useRef, useState } from "react";
import { Upload, Building2 } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { logImageCompressionUpload, prepareImageForStorageUpload } from "@/lib/imageCompression";
import { toast } from "sonner";

interface Profile {
  id: string;
  email: string;
  company_name: string;
  logo_url: string | null;
  phone_number?: string | null;
  terms_en?: string | null;
  terms_ar?: string | null;
}

const Settings = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [termsEn, setTermsEn] = useState("");
  const [termsAr, setTermsAr] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoSignedUrl, setLogoSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadLogoPreview = async (path: string | null) => {
    if (!path) {
      setLogoSignedUrl(null);
      return;
    }
    const { data } = await supabase.storage
      .from("company-logos")
      .createSignedUrl(path, 60 * 60);
    setLogoSignedUrl(data?.signedUrl ?? null);
  };

  const fetchProfile = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      toast.error("Failed to load profile");
    } else if (data) {
      const p = data as Profile;
      setProfile(p);
      setCompanyName(p.company_name || "");
      setPhoneNumber(p.phone_number || "");
      setTermsEn(p.terms_en || "");
      setTermsAr(p.terms_ar || "");
      setLogoUrl(p.logo_url);
      loadLogoPreview(p.logo_url);
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
      phone_number: phoneNumber.trim() || null,
      terms_en: termsEn.trim() || null,
      terms_ar: termsAr.trim() || null,
    };
    console.log("Saving profile:", JSON.stringify(profileData));
    const { data, error } = await supabase
      .from("profiles")
      .upsert(profileData)
      .select();
    console.log("Supabase update result:", data, error);
    setSaving(false);
    if (error) toast.error("Failed to save: " + error.message);
    else toast.success("Company settings saved");
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const uploadFile = await prepareImageForStorageUpload(file);
    const ext = uploadFile.name.split(".").pop() || "jpg";
    const path = `${user.id}/logo-${Date.now()}.${ext}`;
    logImageCompressionUpload("Settings", file, uploadFile, path);
    const { error: upErr } = await supabase.storage
      .from("company-logos")
      .upload(path, uploadFile, { upsert: true, contentType: uploadFile.type });
    if (upErr) {
      setUploading(false);
      toast.error("Upload failed: " + upErr.message);
      return;
    }
    const { error: dbErr } = await supabase
      .from("profiles")
      .update({ logo_url: path })
      .eq("id", user.id);
    setUploading(false);
    if (dbErr) {
      toast.error("Saved file but failed to update profile");
      return;
    }
    setLogoUrl(path);
    loadLogoPreview(path);
    toast.success("Logo updated");
  };

  return (
    <DashboardLayout title="Settings" subtitle="Manage your company profile">
      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Company
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
                    {logoSignedUrl ? (
                      <img src={logoSignedUrl} alt="Company logo" className="h-full w-full object-cover" />
                    ) : (
                      <Building2 className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleUpload}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInput.current?.click()}
                      disabled={uploading}
                      className="gap-1.5"
                    >
                      <Upload className="h-4 w-4" />
                      {uploading ? "Uploading..." : logoUrl ? "Replace logo" : "Upload logo"}
                    </Button>
                    <p className="text-xs text-muted-foreground">PNG, JPG or SVG. Max 2MB recommended.</p>
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="company">Company Name</Label>
                  <Input
                    id="company"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="My Rental Co."
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label>Email</Label>
                  <Input value={profile?.email ?? user?.email ?? ""} disabled />
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
                  <Label htmlFor="terms-en">Terms &amp; Conditions (English)</Label>
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
                  <Label htmlFor="terms-ar">Terms &amp; Conditions (Arabic)</Label>
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

                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
