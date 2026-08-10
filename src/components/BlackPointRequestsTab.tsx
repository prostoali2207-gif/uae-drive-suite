import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Download, FileCheck2, Loader2, Mail, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { buildBlackPointSubmissionPackage } from "@/lib/blackPointSubmissionPackage";
import { createClientDocumentSignedUrl } from "@/lib/clientDocuments";
import { generateContractPdf } from "@/lib/contractPdf";
import { createSharjahBlackPointsPdf } from "@/lib/sharjahBlackPointsPdf";

const SUBMISSIONS_BUCKET = "external-form-submissions";
const COMPANY_BUCKET = "company-logos";
const VEHICLE_DOCUMENTS_BUCKET = "vehicle-documents";

type ClientSummary = {
  id: string;
  full_name: string;
  phone: string;
  client_type: string;
  emirates_id: string | null;
  passport_number: string | null;
  nationality: string;
  license_number: string | null;
  license_type: "uae" | "foreign" | "international" | null;
  license_issuing_country: string | null;
  unified_number: string | null;
  traffic_file_number: string | null;
  passport_photo_url: string | null;
  license_front_url: string | null;
  license_back_url: string | null;
};

type CarSummary = {
  id: string;
  plate: string;
  plate_emirate: string | null;
  make: string;
  model: string;
  year: number;
  color: string | null;
  mulkiya_pdf_path: string | null;
};

type ContractSummary = {
  id: string;
  start_date: string;
  start_time: string | null;
  end_date: string;
  end_time: string | null;
  rate_type: string;
  rate_amount: number;
  total_amount: number;
  deposit_amount: number;
  initial_mileage: number;
  fuel_level: string;
  status: string;
  payment_status: string;
  client_signature: string | null;
  manager_signature: string | null;
};

type FineRow = {
  id: string;
  client_id: string | null;
  car_id: string | null;
  contract_id: string | null;
  fine_number: string | null;
  fine_date: string;
  black_points: number | null;
  source: string;
  clients: ClientSummary | null;
  cars: CarSummary | null;
  contracts: ContractSummary | null;
};

type SubmissionStatus = "ready" | "sending" | "sent" | "failed";

type SubmissionRow = {
  id: string;
  owner_id: string;
  template_id: string;
  fine_id: string;
  contract_id: string | null;
  client_id: string | null;
  recipient_email: string;
  email_subject: string;
  status: SubmissionStatus;
  package_storage_path: string;
  package_file_name: string;
  sent_at: string | null;
  provider_message_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type SubmissionDatabase = {
  public: {
    Tables: {
      external_form_submissions: {
        Row: SubmissionRow;
        Insert: Omit<SubmissionRow, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<SubmissionRow, "id" | "owner_id" | "created_at">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const submissionsClient = supabase as unknown as SupabaseClient<SubmissionDatabase>;

const splitPlate = (plate: string) => {
  const match = plate.trim().match(/^([A-Za-z]+)\s*[- ]?\s*(\d+)$/);
  return match ? { code: match[1].toUpperCase(), number: match[2] } : { code: "", number: plate };
};

const toDubaiDateTime = (date: string, time: string | null, fallback: string) => {
  const normalizedTime = (time || fallback).slice(0, 5);
  return `${date}T${normalizedTime}:00+04:00`;
};

const fetchBlob = async (url: string, label: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label} could not be loaded`);
  return response.blob();
};

const imageUrlToPng = async (url: string): Promise<Uint8Array> => {
  const blob = await fetchBlob(url, "Company stamp");
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Company stamp could not be prepared");
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Company stamp could not be prepared")), "image/png");
  });
  return new Uint8Array(await png.arrayBuffer());
};

const statusLabel: Record<SubmissionStatus, string> = {
  ready: "Ready",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
};

const BlackPointRequestsTab = () => {
  const [fines, setFines] = useState<FineRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [prepareFine, setPrepareFine] = useState<FineRow | null>(null);
  const [fineScreenshot, setFineScreenshot] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [reviewSubmission, setReviewSubmission] = useState<SubmissionRow | null>(null);
  const [openingGmailId, setOpeningGmailId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const [finesResult, submissionsResult] = await Promise.all([
      supabase
        .from("fines")
        .select("id, client_id, car_id, contract_id, fine_number, fine_date, black_points, source, clients(id, full_name, phone, client_type, emirates_id, passport_number, nationality, license_number, license_type, license_issuing_country, unified_number, traffic_file_number, passport_photo_url, license_front_url, license_back_url), cars(id, plate, plate_emirate, make, model, year, color, mulkiya_pdf_path)")
        .gt("black_points", 0)
        .order("fine_date", { ascending: false })
        .limit(300),
      submissionsClient
        .from("external_form_submissions")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    if (finesResult.error || submissionsResult.error) {
      setLoadError(finesResult.error?.message ?? submissionsResult.error?.message ?? "Unknown error");
      setFines([]);
      setSubmissions([]);
      setLoading(false);
      return;
    }

    const contractIds = [...new Set((finesResult.data ?? []).map((fine) => fine.contract_id).filter((id): id is string => Boolean(id)))];
    const contractsResult = contractIds.length
      ? await supabase
        .from("contracts")
        .select("id, start_date, start_time, end_date, end_time, rate_type, rate_amount, total_amount, deposit_amount, initial_mileage, fuel_level, status, payment_status, client_signature, manager_signature")
        .in("id", contractIds)
      : { data: [], error: null };

    if (contractsResult.error) {
      setLoadError(contractsResult.error.message);
      setFines([]);
      setSubmissions([]);
      setLoading(false);
      return;
    }

    const contractsById = new Map((contractsResult.data ?? []).map((contract) => [contract.id, contract]));
    setFines((finesResult.data ?? []).map((fine) => ({
      ...fine,
      contracts: fine.contract_id ? contractsById.get(fine.contract_id) ?? null : null,
    })) as unknown as FineRow[]);
    setSubmissions((submissionsResult.data ?? []) as SubmissionRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const submissionByFine = useMemo(
    () => new Map(submissions.map((submission) => [submission.fine_id, submission])),
    [submissions],
  );

  const filteredFines = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return fines;
    return fines.filter((fine) => [fine.fine_number, fine.clients?.full_name, fine.cars?.plate]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(term));
  }, [fines, search]);

  const missingForPrepare = (fine: FineRow) => [
    !fine.contract_id || !fine.contracts ? "linked contract" : null,
    !fine.client_id || !fine.clients ? "client" : null,
    !fine.cars?.plate ? "vehicle" : null,
    !fine.fine_number ? "fine number" : null,
    !fine.clients?.license_number ? "driving licence number" : null,
    !fine.clients?.license_type ? "driving licence type" : null,
    fine.clients?.license_type === "uae" && !fine.clients.traffic_file_number ? "Traffic File Number" : null,
    (fine.clients?.license_type === "foreign" || fine.clients?.license_type === "international") && !fine.clients.unified_number ? "Unified Number (UID)" : null,
    !fine.clients?.passport_photo_url ? "passport image" : null,
    !fine.clients?.license_front_url ? "licence image" : null,
    !fine.cars?.mulkiya_pdf_path ? "Mulkiya" : null,
  ].filter(Boolean) as string[];

  const openPrepare = (fine: FineRow) => {
    const missing = missingForPrepare(fine);
    if (missing.length) {
      toast.error(`Missing: ${missing.join(", ")}`);
      return;
    }
    setFineScreenshot(null);
    setPrepareFine(fine);
  };

  const preparePackage = async () => {
    if (!prepareFine || !fineScreenshot) return;
    if (!fineScreenshot.type.startsWith("image/") && fineScreenshot.type !== "application/pdf") {
      toast.error("Fine screenshot must be an image or PDF");
      return;
    }
    if (fineScreenshot.size > 10 * 1024 * 1024) {
      toast.error("Fine screenshot must be 10 MB or smaller");
      return;
    }

    const fine = prepareFine;
    const client = fine.clients;
    const car = fine.cars;
    const contract = fine.contracts;
    if (!client || !car || !contract || !fine.contract_id || !fine.fine_number || !car.mulkiya_pdf_path) return;

    setPreparing(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) throw new Error("Your session expired. Sign in again.");

      const [{ data: profile, error: profileError }, { data: templates, error: templateError }] = await Promise.all([
        supabase.from("profiles").select("stamp_url, phone_number, company_license_url").eq("id", user.id).maybeSingle(),
        supabase.from("external_form_templates").select("id, name, category, emirate, authority, recipient_email").eq("category", "fines"),
      ]);
      if (profileError) throw new Error(profileError.message);
      if (templateError) throw new Error(templateError.message);

      const template = (templates ?? []).find((item) =>
        item.emirate?.toLocaleLowerCase() === "sharjah" && item.authority?.toLocaleLowerCase().includes("sharjah"),
      ) ?? (templates ?? []).find((item) => item.name.toLocaleLowerCase().includes("black point"));
      if (!template) throw new Error("Sharjah Black Points template is missing in External Forms");
      if (!template.recipient_email) throw new Error("Recipient email is missing in the Sharjah Black Points template");
      if (!profile?.company_license_url) throw new Error("Company Trade License is missing in Settings");
      if (!profile.stamp_url) throw new Error("Company stamp is missing in Settings");

      const [stampSigned, companyLicenseSigned, mulkiyaSigned] = await Promise.all([
        supabase.storage.from(COMPANY_BUCKET).createSignedUrl(profile.stamp_url, 120),
        supabase.storage.from(COMPANY_BUCKET).createSignedUrl(profile.company_license_url, 120),
        supabase.storage.from(VEHICLE_DOCUMENTS_BUCKET).createSignedUrl(car.mulkiya_pdf_path, 120),
      ]);
      if (stampSigned.error || !stampSigned.data?.signedUrl) throw new Error("Company stamp could not be loaded");
      if (companyLicenseSigned.error || !companyLicenseSigned.data?.signedUrl) throw new Error("Company Trade License could not be loaded");
      if (mulkiyaSigned.error || !mulkiyaSigned.data?.signedUrl) throw new Error("Mulkiya could not be loaded");

      const stampPng = await imageUrlToPng(stampSigned.data.signedUrl);
      const [passportUrl, licenceFrontUrl, licenceBackUrl] = await Promise.all([
        createClientDocumentSignedUrl(client.passport_photo_url),
        createClientDocumentSignedUrl(client.license_front_url),
        client.license_back_url ? createClientDocumentSignedUrl(client.license_back_url) : Promise.resolve(null),
      ]);

      const [passportBlob, licenceFrontBlob, licenceBackBlob, mulkiyaBlob, companyLicenseBlob] = await Promise.all([
        fetchBlob(passportUrl, "Passport"),
        fetchBlob(licenceFrontUrl, "Driving licence"),
        licenceBackUrl ? fetchBlob(licenceBackUrl, "Driving licence back") : Promise.resolve(null),
        fetchBlob(mulkiyaSigned.data.signedUrl, "Mulkiya"),
        fetchBlob(companyLicenseSigned.data.signedUrl, "Company Trade License"),
      ]);

      const plate = splitPlate(car.plate);
      const formPdf = await createSharjahBlackPointsPdf({
        contractNumber: `CTR-${contract.id.slice(0, 8).toUpperCase()}`,
        clientName: client.full_name,
        licenseNumber: client.license_number ?? "",
        licenseSource: client.license_type === "uae" ? "UAE" : client.license_issuing_country ?? "",
        trafficFileNumber: client.license_type === "uae" ? client.traffic_file_number ?? "" : "",
        unifiedNumber: client.license_type === "uae" ? "" : client.unified_number ?? "",
        plateNumber: plate.number,
        plateCode: plate.code,
        plateSource: car.plate_emirate ?? "",
        vehicleType: `${car.make} ${car.model}`.trim(),
        fineNumber: fine.fine_number,
        fineDate: new Date(fine.fine_date).toLocaleDateString("en-GB", { timeZone: "Asia/Dubai" }),
        rentalStart: toDubaiDateTime(contract.start_date, contract.start_time, "00:00"),
        rentalEnd: toDubaiDateTime(contract.end_date, contract.end_time, "23:59"),
        phone: profile.phone_number?.trim() ?? "",
        requestDate: new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Dubai" }),
      }, stampPng);

      const contractPdfResult = await generateContractPdf({
        ...contract,
        clients: {
          full_name: client.full_name,
          phone: client.phone,
          nationality: client.nationality,
          client_type: client.client_type,
          emirates_id: client.emirates_id,
          passport_number: client.passport_number,
          license_number: client.license_number,
        },
        cars: car,
      }, { returnBlob: true });
      if (!(contractPdfResult instanceof Blob)) throw new Error("Contract PDF could not be created");

      const packageBlob = await buildBlackPointSubmissionPackage({
        formPdf,
        contractPdf: contractPdfResult,
        passport: passportBlob,
        licenseFront: licenceFrontBlob,
        licenseBack: licenceBackBlob,
        mulkiya: mulkiyaBlob,
        fineScreenshot,
        companyLicense: companyLicenseBlob,
        stampPng,
      });
      if (packageBlob.size > 18 * 1024 * 1024) {
        throw new Error("Prepared package is too large for email. Keep it under 18 MB.");
      }

      const fileName = `Black_Points_${fine.fine_number}_${car.plate.replace(/\s+/g, "-")}.pdf`;
      const storagePath = `${user.id}/${fine.id}/black-points-package.pdf`;
      const { error: uploadError } = await supabase.storage.from(SUBMISSIONS_BUCKET).upload(storagePath, packageBlob, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (uploadError) throw new Error(`Package upload failed: ${uploadError.message}`);

      const { data: saved, error: saveError } = await submissionsClient
        .from("external_form_submissions")
        .upsert({
          owner_id: user.id,
          template_id: template.id,
          fine_id: fine.id,
          contract_id: fine.contract_id,
          client_id: fine.client_id,
          recipient_email: template.recipient_email,
          email_subject: "Transfer Blackpoints",
          status: "ready",
          package_storage_path: storagePath,
          package_file_name: fileName,
          sent_at: null,
          provider_message_id: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        } as SubmissionRow, { onConflict: "owner_id,template_id,fine_id" })
        .select("*")
        .single();
      if (saveError || !saved) throw new Error(`Package could not be saved: ${saveError?.message ?? "Unknown error"}`);

      setReviewSubmission(saved);
      setPrepareFine(null);
      setFineScreenshot(null);
      await loadData();
      toast.success("Black Point package is ready");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare Black Point package");
    } finally {
      setPreparing(false);
    }
  };

  const openPackage = async (submission: SubmissionRow) => {
    const { data, error } = await supabase.storage.from(SUBMISSIONS_BUCKET).createSignedUrl(submission.package_storage_path, 120);
    if (error || !data?.signedUrl) {
      toast.error("Package could not be opened");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const downloadPackage = async (submission: SubmissionRow) => {
    const { data, error } = await supabase.storage.from(SUBMISSIONS_BUCKET).download(submission.package_storage_path);
    if (error || !data) {
      toast.error("Package could not be downloaded");
      return false;
    }
    const url = URL.createObjectURL(data);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = submission.package_file_name;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  };

  const openInGmail = async (submission: SubmissionRow) => {
    setOpeningGmailId(submission.id);
    try {
      const downloaded = await downloadPackage(submission);
      if (!downloaded) return;

      const subject = "Transfer Blackpoints";
      const body = "Please find attached documents for transfer blackpoints.";
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(submission.recipient_email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(gmailUrl, "_blank", "noopener,noreferrer");
      toast.success("PDF downloaded. Gmail opened — attach the downloaded PDF and send.");
      setReviewSubmission(null);
    } finally {
      setOpeningGmailId(null);
    }
  };

  const onScreenshotChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFineScreenshot(event.target.files?.[0] ?? null);
  };

  return (
    <div className="grid gap-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search fine, client or plate"
          className="min-h-10 pl-9"
        />
      </div>

      {loading ? (
        <div className="grid gap-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-28 w-full" />)}</div>
      ) : loadError ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-6">
            <p className="text-sm text-destructive">Could not load Black Point requests: {loadError}</p>
            <Button variant="outline" onClick={() => void loadData()} className="gap-2">
              <RefreshCw className="h-4 w-4" />Retry
            </Button>
          </CardContent>
        </Card>
      ) : filteredFines.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <FileCheck2 className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium">No Black Point fines found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredFines.map((fine) => {
            const submission = submissionByFine.get(fine.id);
            const missing = missingForPrepare(fine);
            return (
              <Card key={fine.id}>
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">Fine {fine.fine_number || "—"}</p>
                      <Badge variant={submission?.status === "failed" ? "destructive" : "secondary"}>
                        {submission ? statusLabel[submission.status] : missing.length ? "Missing data" : "Not prepared"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {fine.clients?.full_name || "Client missing"} · {fine.cars?.plate || "Vehicle missing"} · {fine.black_points || 0} BP
                    </p>
                    {submission?.sent_at && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sent {new Date(submission.sent_at).toLocaleString("en-GB", { timeZone: "Asia/Dubai" })}
                      </p>
                    )}
                    {submission?.last_error && <p className="mt-1 text-xs text-destructive">{submission.last_error}</p>}
                    {!submission && missing.length > 0 && <p className="mt-1 text-xs text-destructive">Missing: {missing.join(", ")}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2 sm:shrink-0">
                    {submission && (
                      <Button variant="outline" size="sm" className="min-h-10 gap-1.5" onClick={() => void downloadPackage(submission)}>
                        <Download className="h-4 w-4" />PDF
                      </Button>
                    )}
                    {submission && (
                      <Button variant="outline" size="sm" className="min-h-10" onClick={() => setReviewSubmission(submission)}>
                        Review
                      </Button>
                    )}
                    {!submission && (
                      <Button size="sm" className="min-h-10" disabled={missing.length > 0} onClick={() => openPrepare(fine)}>
                        Prepare
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={prepareFine !== null} onOpenChange={(open) => { if (!open && !preparing) setPrepareFine(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Prepare Black Point package</DialogTitle>
            <DialogDescription>
              FleetDesk will add the filled form, contract, passport, driving licence, Mulkiya and company Trade License automatically. Add only the fine screenshot.
            </DialogDescription>
          </DialogHeader>
          {prepareFine && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">{prepareFine.clients?.full_name}</p>
              <p className="mt-1 text-muted-foreground">Fine {prepareFine.fine_number} · {prepareFine.cars?.plate} · {prepareFine.black_points || 0} BP</p>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="fine-screenshot">Fine screenshot</Label>
            <Input
              id="fine-screenshot"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
              onChange={onScreenshotChange}
              disabled={preparing}
            />
            <p className="text-xs text-muted-foreground">Image or PDF, up to 10 MB.</p>
          </div>
          <Button className="min-h-10 gap-2" disabled={!fineScreenshot || preparing} onClick={() => void preparePackage()}>
            {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
            {preparing ? "Preparing package..." : "Prepare package"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewSubmission !== null} onOpenChange={(open) => { if (!open && !openingGmailId) setReviewSubmission(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Open in Gmail</DialogTitle>
            <DialogDescription>FleetDesk will download the prepared PDF and open a Gmail message with the recipient and text already filled.</DialogDescription>
          </DialogHeader>
          {reviewSubmission && (
            <div className="grid gap-3">
              <div className="rounded-md border p-3 text-sm">
                <div className="flex items-start gap-2">
                  <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">To</p>
                    <p className="break-all font-medium" dir="ltr">{reviewSubmission.recipient_email}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Subject</p>
                <p className="font-medium">Transfer Blackpoints</p>
                <p className="mt-3 text-xs text-muted-foreground">Attachment</p>
                <p className="font-medium">{reviewSubmission.package_file_name}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" className="min-h-10 flex-1" onClick={() => void openPackage(reviewSubmission)}>
                  Preview PDF
                </Button>
                <Button
                  className="min-h-10 flex-1 gap-2"
                  disabled={openingGmailId === reviewSubmission.id}
                  onClick={() => void openInGmail(reviewSubmission)}
                >
                  {openingGmailId === reviewSubmission.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  {openingGmailId === reviewSubmission.id ? "Opening Gmail..." : "Open in Gmail"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Gmail cannot receive a local attachment from a normal web link. The PDF is downloaded automatically; attach that one file in Gmail and send.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BlackPointRequestsTab;
