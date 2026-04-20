import { useEffect, useRef, useState } from "react";
import { Upload, Building2 } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Profile {
  id: string;
  email: string;
  company_name: string;
  logo_url: string | null;
}

const Settings = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [companyName, setCompanyName] = useState("");
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
    const { error } = await supabase
      .from("profiles")
      .update({ company_name: companyName.trim() })
      .eq("id", user.id);
    setSaving(false);
    if (error) toast.error("Failed to save: " + error.message);
    else toast.success("Company settings saved");
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("company-logos")
      .upload(path, file, { upsert: true, contentType: file.type });
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
