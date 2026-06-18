import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Eye, Inbox, Pencil, Plus, Search, ChevronLeft, ChevronRight, ChevronDown, IdCard, FileText, Trash2, Upload, XCircle, MoreVertical, CalendarDays } from "lucide-react";
import { format, parseISO } from "date-fns";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { NationalityCombobox } from "@/components/NationalityCombobox";
import { ClientType } from "@/components/ClientTypeFields";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { previewLegacyClientImport, type LegacyClientImportPreview } from "@/lib/clientImport";
import { logImageCompressionUpload, prepareImageForStorageUpload } from "@/lib/imageCompression";
import { ListPagination, getPaginatedRows } from "@/components/ListPagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ClientRecord {
  id: string;
  full_name: string;
  phone: string;
  client_type: string;
  emirates_id: string;
  emirates_id_expiry: string | null;
  passport_number: string | null;
  passport_expiry: string | null;
  nationality: string;
  email: string | null;
  license_number: string;
  license_expiry: string | null;
  date_of_birth: string | null;
  passport_photo_url: string | null;
  eid_front_url: string | null;
  eid_back_url: string | null;
  license_front_url: string | null;
  license_back_url: string | null;
  created_at: string;
  is_new?: boolean | null;
}

interface ContractRow {
  id: string;
  client_id: string;
  total_amount: number;
  payment_status: string;
  status: string;
}

interface ClientRegistrationRequest {
  id: string;
  owner_id: string;
  status: "pending" | "accepted" | "rejected";
  full_name: string;
  phone: string;
  email: string | null;
  nationality: string;
  date_of_birth: string | null;
  client_type: string;
  emirates_id: string | null;
  emirates_id_expiry: string | null;
  passport_number: string | null;
  passport_expiry: string | null;
  license_number: string;
  license_expiry: string | null;
  passport_photo_url: string | null;
  eid_front_url: string | null;
  eid_back_url: string | null;
  license_front_url: string | null;
  license_back_url: string | null;
  rejection_reason: string | null;
  created_client_id: string | null;
  created_at: string;
}

type ClientFilter = "All" | "Emirates ID" | "Passport" | "Active" | "Outstanding";

type ClientDocumentUrlField =
  | "passport_photo_url"
  | "eid_front_url"
  | "eid_back_url"
  | "license_front_url"
  | "license_back_url";

function toSupabaseMessage(error: { code?: string; message?: string } | null): string {
  if (error?.code === "PGRST205") {
    return "Supabase tables are missing in this project. Run migrations, then retry.";
  }
  return error?.message || "unknown error";
}

function isClientIncomplete(client: ClientRecord): boolean {
  const missingBase = !client.phone?.trim() || !client.nationality?.trim() || !client.license_number?.trim() || !client.license_expiry;
  if (missingBase) return true;
  if (client.client_type === "Resident") return !client.emirates_id?.trim() || !client.emirates_id_expiry;
  return !client.passport_number?.trim() || !client.passport_expiry;
}

const emptyForm = {
  full_name: "",
  phone: "",
  client_type: "Resident" as ClientType,
  date_of_birth: "",
  emirates_id: "",
  emirates_id_expiry: "",
  passport_number: "",
  passport_expiry: "",
  nationality: "",
  email: "",
  license_number: "",
  license_expiry: "",
  passport_photo_url: "",
  eid_front_url: "",
  eid_back_url: "",
  license_front_url: "",
  license_back_url: "",
};

const PHONE_COUNTRIES = [
  { name: "United Arab Emirates", iso: "ae", dial: "971" },
  { name: "Saudi Arabia", iso: "sa", dial: "966" },
  { name: "Kuwait", iso: "kw", dial: "965" },
  { name: "Qatar", iso: "qa", dial: "974" },
  { name: "Bahrain", iso: "bh", dial: "973" },
  { name: "Oman", iso: "om", dial: "968" },
  { name: "Jordan", iso: "jo", dial: "962" },
  { name: "Lebanon", iso: "lb", dial: "961" },
  { name: "Egypt", iso: "eg", dial: "20" },
  { name: "Iraq", iso: "iq", dial: "964" },
  { name: "Russia", iso: "ru", dial: "7" },
  { name: "Kazakhstan", iso: "kz", dial: "7" },
  { name: "India", iso: "in", dial: "91" },
  { name: "Pakistan", iso: "pk", dial: "92" },
  { name: "United Kingdom", iso: "gb", dial: "44" },
  { name: "Germany", iso: "de", dial: "49" },
  { name: "France", iso: "fr", dial: "33" },
  { name: "United States", iso: "us", dial: "1" },
  { name: "Turkey", iso: "tr", dial: "90" },
  { name: "Philippines", iso: "ph", dial: "63" },
  { name: "Indonesia", iso: "id", dial: "62" },
  { name: "Malaysia", iso: "my", dial: "60" },
  { name: "Ukraine", iso: "ua", dial: "380" },
  { name: "Uzbekistan", iso: "uz", dial: "998" },
  { name: "Kyrgyzstan", iso: "kg", dial: "996" },
  { name: "Tajikistan", iso: "tj", dial: "992" },
  { name: "China", iso: "cn", dial: "86" },
  { name: "Armenia", iso: "am", dial: "374" },
  { name: "Georgia", iso: "ge", dial: "995" },
] as const;

const getAdultMaxDate = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setFullYear(date.getFullYear() - 18);
  return date;
};

const validateDateOfBirth = (value: string) => {
  if (!value) return "Select date of birth.";
  const selectedDate = parseISO(value);
  if (Number.isNaN(selectedDate.getTime())) return "Enter a valid date of birth.";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (selectedDate > today) return "Date of birth cannot be in the future";
  if (selectedDate > getAdultMaxDate()) return "Client must be at least 18 years old";
  return "";
};

const normalizeLocalPhone = (value: string, dialCode: string) =>
  value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 15 - dialCode.length);

const normalizePhone = (dialCode: string, localNumber: string) => {
  const digits = normalizeLocalPhone(localNumber, dialCode);
  return digits ? `+${dialCode}${digits}` : "";
};

const parsePhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  const country = [...PHONE_COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((item) => digits.startsWith(item.dial));

  if (!country) {
    return { dialCode: "971", isoCountry: "ae", localNumber: normalizeLocalPhone(digits, "971") };
  }

  return {
    dialCode: country.dial,
    isoCountry: country.iso,
    localNumber: normalizeLocalPhone(digits.slice(country.dial.length), country.dial),
  };
};

const validatePhone = (dialCode: string, localNumber: string) => {
  const digits = normalizeLocalPhone(localNumber, dialCode);
  if (!digits) return "Enter a phone number.";
  if (dialCode === "971" && digits.length !== 9) return "Enter a valid UAE phone number.";
  if (dialCode !== "971" && digits.length < 6) return "Enter a valid phone number.";
  return "";
};

interface ClientPhoneInputProps {
  dialCode: string;
  isoCountry: string;
  phoneNumber: string;
  hasError: boolean;
  onCountryChange: (dialCode: string, isoCountry: string) => void;
  onNumberChange: (phoneNumber: string) => void;
}

function ClientPhoneInput({
  dialCode,
  isoCountry,
  phoneNumber,
  hasError,
  onCountryChange,
  onNumberChange,
}: ClientPhoneInputProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredCountries = PHONE_COUNTRIES.filter((country) => {
    const query = search.trim().toLowerCase();
    return country.name.toLowerCase().includes(query) || country.dial.startsWith(query.replace(/\D/g, ""));
  });

  return (
    <div className="w-full min-w-0">
      <div
        className={cn(
          "flex h-12 w-full overflow-hidden rounded-md border bg-input text-base ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          hasError ? "border-destructive" : "border-input",
        )}
      >
        <Popover
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) setSearch("");
            else window.setTimeout(() => searchRef.current?.focus(), 0);
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Select phone country code"
              className="flex h-12 w-28 shrink-0 items-center justify-between gap-2 border-r border-border bg-muted px-3 text-foreground hover:bg-muted/80 focus:outline-none"
            >
              <img
                src={`https://flagcdn.com/20x15/${isoCountry}.png`}
                alt=""
                className="h-[15px] w-5 shrink-0 rounded-sm object-cover"
              />
              <span className="font-mono text-sm font-semibold">+{dialCode}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={8}
            className="w-[min(19rem,calc(100vw-2rem))] overflow-hidden border-border bg-popover p-0 text-popover-foreground shadow-xl"
          >
            <div className="border-b border-border p-2">
              <Input
                ref={searchRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search country or code..."
                className="h-11 bg-input text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {filteredCountries.length === 0 && (
                <p className="px-3 py-5 text-center text-sm text-muted-foreground">No countries found</p>
              )}
              {filteredCountries.map((country) => (
                <button
                  key={`${country.iso}-${country.dial}`}
                  type="button"
                  onClick={() => {
                    onCountryChange(country.dial, country.iso);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                    isoCountry === country.iso && dialCode === country.dial && "bg-accent text-accent-foreground",
                  )}
                >
                  <img
                    src={`https://flagcdn.com/20x15/${country.iso}.png`}
                    alt=""
                    className="h-[15px] w-5 shrink-0 rounded-sm object-cover"
                  />
                  <span className="min-w-0 flex-1 truncate text-left">{country.name}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">+{country.dial}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <input
          id="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          required
          placeholder="50 245 6090"
          value={phoneNumber}
          onChange={(event) => onNumberChange(event.target.value)}
          className="h-12 min-w-0 flex-1 border-0 bg-transparent px-3 font-mono text-base text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}

interface DateOfBirthPickerProps {
  value: string;
  hasError: boolean;
  onChange: (value: string) => void;
}

function DateOfBirthPicker({ value, hasError, onChange }: DateOfBirthPickerProps) {
  const selectedDate = value ? parseISO(value) : undefined;
  const nativeInputRef = useRef<HTMLInputElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const [manualValue, setManualValue] = useState(
    selectedDate ? format(selectedDate, "dd.MM.yyyy") : "",
  );
  const isNativeMobilePicker = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const userAgent = navigator.userAgent;
    const isAndroidChrome = /Android/i.test(userAgent) && /Chrome/i.test(userAgent);
    const isIOS =
      /iPhone|iPad|iPod/i.test(userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return isAndroidChrome || isIOS;
  }, []);

  useEffect(() => {
    setManualValue(value ? format(parseISO(value), "dd.MM.yyyy") : "");
  }, [value]);

  const openNativePicker = () => {
    const input = nativeInputRef.current;
    if (!input) return;

    try {
      if (typeof input.showPicker === "function") {
        input.showPicker();
        return;
      }
    } catch {
      // Browser denied showPicker; use focus/click fallback below.
    }

    input.focus({ preventScroll: true });
    input.click();
    window.setTimeout(() => manualInputRef.current?.focus({ preventScroll: true }), 0);
  };

  const handleManualChange = (rawValue: string) => {
    const digits = rawValue.replace(/\D/g, "").slice(0, 8);
    const formatted = [
      digits.slice(0, 2),
      digits.slice(2, 4),
      digits.slice(4, 8),
    ].filter(Boolean).join(".");
    setManualValue(formatted);

    if (!formatted) {
      onChange("");
      return;
    }

    const match = formatted.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) return;

    const [, day, month, year] = match;
    const internalValue = `${year}-${month}-${day}`;
    const parsedDate = parseISO(internalValue);
    if (
      !Number.isNaN(parsedDate.getTime()) &&
      format(parsedDate, "dd.MM.yyyy") === formatted
    ) {
      onChange(internalValue);
    } else {
      onChange("");
    }
  };

  const fieldClassName = cn(
    "relative flex h-12 w-full items-center rounded-md border border-input bg-input px-3 text-left ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
    !value && "text-muted-foreground",
    hasError && "border-destructive",
  );

  if (!isNativeMobilePicker) {
    return (
      <div className={fieldClassName}>
        <CalendarDays className="mr-2 h-4 w-4 shrink-0" />
        <input
          ref={manualInputRef}
          type="text"
          inputMode="numeric"
          autoComplete="bday"
          aria-label="Date of Birth"
          placeholder="Select date of birth"
          value={manualValue}
          onChange={(event) => handleManualChange(event.target.value)}
          onClick={openNativePicker}
          onBlur={() => {
            if (manualValue && manualValue.length !== 10) onChange("");
          }}
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-sm text-foreground outline-none placeholder:font-sans placeholder:text-muted-foreground"
        />
        <button
          type="button"
          aria-label="Open date of birth picker"
          onClick={openNativePicker}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
        <input
          ref={nativeInputRef}
          id="dob"
          type="date"
          required
          tabIndex={-1}
          aria-hidden="true"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        />
      </div>
    );
  }

  return (
    <div className={fieldClassName}>
      <CalendarDays className="mr-2 h-4 w-4 shrink-0" />
      <span className={cn("text-sm", value && "font-mono text-foreground")}>
        {selectedDate ? format(selectedDate, "dd.MM.yyyy") : "Select date of birth"}
      </span>
      <input
        id="dob"
        type="date"
        required
        aria-label="Date of Birth"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}

const requestToClientPayload = (request: ClientRegistrationRequest) => ({
  full_name: request.full_name.trim(),
  phone: request.phone.trim(),
  client_type: request.client_type,
  emirates_id: request.client_type === "Resident" ? request.emirates_id ?? "" : "",
  emirates_id_expiry: request.client_type === "Resident" ? request.emirates_id_expiry : null,
  passport_number: request.client_type === "Tourist" ? request.passport_number ?? "" : "",
  passport_expiry: request.client_type === "Tourist" ? request.passport_expiry : null,
  nationality: request.nationality.trim(),
  email: request.email?.trim() || null,
  license_number: request.license_number.trim(),
  license_expiry: request.license_expiry,
  date_of_birth: request.date_of_birth,
  passport_photo_url: request.passport_photo_url,
  eid_front_url: request.eid_front_url,
  eid_back_url: request.eid_back_url,
  license_front_url: request.license_front_url,
  license_back_url: request.license_back_url,
});

const formatDate = (value: string | null) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-AE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const documentLinks = (request: ClientRegistrationRequest) => [
  ["Passport Photo", request.passport_photo_url],
  ["Emirates ID Front", request.eid_front_url],
  ["Emirates ID Back", request.eid_back_url],
  ["License Front", request.license_front_url],
  ["License Back", request.license_back_url],
].filter(([, url]) => Boolean(url)) as [string, string][];

const getInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

const countryFlags: Record<string, string> = {
  "United Arab Emirates": "🇦🇪",
  India: "🇮🇳",
  Pakistan: "🇵🇰",
  Egypt: "🇪🇬",
  Philippines: "🇵🇭",
  Jordan: "🇯🇴",
  Lebanon: "🇱🇧",
  "Sri Lanka": "🇱🇰",
  Bangladesh: "🇧🇩",
  Nepal: "🇳🇵",
  "United Kingdom": "🇬🇧",
  "United States": "🇺🇸",
};

const getCountryFlag = (nationality: string) => countryFlags[nationality] || "🌐";

const Clients = () => {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [registrationRequests, setRegistrationRequests] = useState<ClientRegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [docFilter, setDocFilter] = useState<ClientFilter>("All");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [phoneDialCode, setPhoneDialCode] = useState("971");
  const [phoneIsoCountry, setPhoneIsoCountry] = useState("ae");
  const [phoneLocalNumber, setPhoneLocalNumber] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [dobError, setDobError] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [dupError, setDupError] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteTargetName, setDeleteTargetName] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<LegacyClientImportPreview | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [reviewingRequest, setReviewingRequest] = useState<ClientRegistrationRequest | null>(null);
  const [reviewActionLoading, setReviewActionLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isMobileClientsLayout, setIsMobileClientsLayout] = useState(false);

  const uploadClientDocument = async (file: File | undefined, field: ClientDocumentUrlField) => {
    if (!file) return;

    const uploadFile = await prepareImageForStorageUpload(file);
    const path = `client-documents/${Date.now()}_${uploadFile.name}`;
    logImageCompressionUpload("Clients", file, uploadFile, path);
    const { error: uploadError } = await supabase.storage
      .from("client-documents")
      .upload(path, uploadFile, { upsert: true });

    if (!uploadError) {
      const {
        data: { publicUrl },
      } = supabase.storage.from("client-documents").getPublicUrl(path);
      setForm((prev) => ({ ...prev, [field]: publicUrl }));
    }
  };

  const fetchData = async () => {
    const [clientsRes, contractsRes, requestsRes] = await Promise.all([
      supabase.from("clients").select("*").order("created_at", { ascending: false }),
      supabase.from("contracts").select("id, client_id, total_amount, payment_status, status"),
      supabase
        .from("client_registration_requests" as never)
        .select("*")
        .order("created_at", { ascending: false }),
    ]);
    if (clientsRes.error) toast.error(`Failed to load clients: ${toSupabaseMessage(clientsRes.error)}`);
    else setClients((clientsRes.data as any) || []);
    if (!contractsRes.error) setContracts(contractsRes.data || []);
    if (requestsRes.error) toast.error(`Failed to load registration requests: ${toSupabaseMessage(requestsRes.error)}`);
    else setRegistrationRequests((requestsRes.data as unknown as ClientRegistrationRequest[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const handleChange = () => setIsMobileClientsLayout(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const enriched = useMemo(() => {
    return clients.map((c) => {
      const cs = contracts.filter((k) => k.client_id === c.id);
      const outstanding = cs.reduce((sum, k) => {
        if (k.payment_status === "Paid") return sum;
        return sum + Number(k.total_amount);
      }, 0);
      const hasActive = cs.some((k) => k.status === "Active" || k.status === "Expiring Soon");
      return { ...c, totalContracts: cs.length, hasActive, outstanding };
    });
  }, [clients, contracts]);

  const filtered = useMemo(() => {
    let result = enriched;
    
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (c) =>
          c.full_name.toLowerCase().includes(q) ||
          (c.emirates_id && c.emirates_id.toLowerCase().includes(q)) ||
          (c.passport_number && c.passport_number.toLowerCase().includes(q)),
      );
    }

    if (docFilter === "Emirates ID") {
      result = result.filter((c) => c.client_type === "Resident");
    } else if (docFilter === "Passport") {
      result = result.filter((c) => c.client_type === "Tourist");
    } else if (docFilter === "Active") {
      result = result.filter((c) => c.hasActive);
    } else if (docFilter === "Outstanding") {
      result = result.filter((c) => c.outstanding > 0);
    }

    return result;
  }, [enriched, query, docFilter]);

  useEffect(() => {
    setPage(1);
  }, [query, docFilter, pageSize]);

  const effectivePageSize = isMobileClientsLayout ? 10 : pageSize;

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filtered.length / effectivePageSize));
    if (page > totalPages) setPage(totalPages);
  }, [filtered.length, page, effectivePageSize]);

  const paginatedClients = useMemo(
    () => getPaginatedRows(filtered, page, effectivePageSize),
    [filtered, page, effectivePageSize],
  );

  const mobileTotalPages = Math.max(1, Math.ceil(filtered.length / 10));
  const activeClientsCount = enriched.filter((client) => client.hasActive).length;
  const outstandingTotal = enriched.reduce((sum, client) => sum + client.outstanding, 0);

  const pendingRequests = useMemo(
    () => registrationRequests.filter((request) => request.status === "pending"),
    [registrationRequests],
  );

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setPhoneDialCode("971");
    setPhoneIsoCountry("ae");
    setPhoneLocalNumber("");
    setPhoneError("");
    setDobError("");
    setDupError("");
    setStep(1);
    setOpen(true);
  };

  const openEdit = (c: ClientRecord) => {
    const parsedPhone = parsePhone(c.phone);
    setEditingId(c.id);
    setForm({
      full_name: c.full_name,
      phone: c.phone,
      client_type: (c.client_type as ClientType) || "Resident",
      emirates_id: c.emirates_id ?? "",
      emirates_id_expiry: c.emirates_id_expiry ?? "",
      passport_number: c.passport_number ?? "",
      passport_expiry: c.passport_expiry ?? "",
      nationality: c.nationality ?? "",
      email: c.email ?? "",
      license_number: c.license_number ?? "",
      license_expiry: c.license_expiry ?? "",
      date_of_birth: c.date_of_birth ?? "",
      passport_photo_url: c.passport_photo_url ?? "",
      eid_front_url: c.eid_front_url ?? "",
      eid_back_url: c.eid_back_url ?? "",
      license_front_url: c.license_front_url ?? "",
      license_back_url: c.license_back_url ?? "",
    });
    setPhoneDialCode(parsedPhone.dialCode);
    setPhoneIsoCountry(parsedPhone.isoCountry);
    setPhoneLocalNumber(parsedPhone.localNumber);
    setPhoneError("");
    setDobError("");
    setDupError("");
    setStep(1);
    setOpen(true);
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    setImportLoading(true);
    setImportPreview(null);
    try {
      const preview = await previewLegacyClientImport(file, clients.map((client) => ({ phone: client.phone })));
      setImportPreview(preview);
    } catch (error) {
      console.error("Client import preview error:", error);
      toast.error("Could not read this CSV file");
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportReadyRows = async () => {
    if (!importPreview) return;
    const readyRows = importPreview.rows.filter((row) => row.ready);
    if (!readyRows.length) {
      toast.error("No rows are ready to import");
      return;
    }

    setImporting(true);
    const payload = readyRows.map((row) => ({
      full_name: row.full_name,
      phone: row.phone,
      email: row.email,
      nationality: row.nationality,
      client_type: row.client_type,
      emirates_id: row.emirates_id,
      passport_number: row.passport_number,
      license_number: row.license_number,
      license_expiry: row.license_expiry,
      emirates_id_expiry: row.emirates_id_expiry,
      passport_expiry: row.passport_expiry,
    }));

    const { error } = await supabase.from("clients").insert(payload as never);
    setImporting(false);
    if (error) {
      toast.error(`Failed to import clients: ${toSupabaseMessage(error)}`);
      return;
    }

    toast.success(`Imported ${readyRows.length} clients`);
    setImportOpen(false);
    setImportPreview(null);
    fetchData();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submitting client form...", { form, editingId });

    if (!form.full_name.trim()) {
      toast.error("Please enter the client's full name");
      return;
    }

    const nextPhoneError = validatePhone(phoneDialCode, phoneLocalNumber);
    const nextDobError = validateDateOfBirth(form.date_of_birth);
    setPhoneError(nextPhoneError);
    setDobError(nextDobError);
    if (nextPhoneError || nextDobError) return;

    const normalizedPhone = normalizePhone(phoneDialCode, phoneLocalNumber);
    setDupError("");

    if (!editingId) {
      const phoneToCheck = normalizedPhone;
      const emailToCheck = form.email.trim();
      const orParts: string[] = [];
      if (phoneToCheck) orParts.push(`phone.eq.${phoneToCheck}`);
      if (emailToCheck) orParts.push(`email.eq.${emailToCheck}`);
      if (orParts.length > 0) {
        const { data: existing, error: dupErr } = await supabase
          .from("clients")
          .select("id, full_name")
          .or(orParts.join(","))
          .limit(1);
        if (dupErr) {
          toast.error("Could not validate phone/email");
          return;
        }
        if (existing && existing.length > 0) {
          setDupError(`A client with this phone or email already exists: ${(existing[0] as any).full_name}`);
          return;
        }
      }
    }

    setSaving(true);
    const payload: any = {
      full_name: form.full_name.trim(),
      phone: normalizedPhone,
      client_type: form.client_type,
      emirates_id: form.client_type === "Resident" ? form.emirates_id.trim() : "",
      emirates_id_expiry: form.client_type === "Resident" ? (form.emirates_id_expiry || null) : null,
      passport_number: form.client_type === "Tourist" ? form.passport_number.trim() : "",
      passport_expiry: form.client_type === "Tourist" ? (form.passport_expiry || null) : null,
      nationality: form.nationality.trim(),
      email: form.email.trim() || null,
      license_number: form.license_number.trim(),
      license_expiry: form.license_expiry || null,
      date_of_birth: form.date_of_birth || null,
      passport_photo_url: form.passport_photo_url || null,
      eid_front_url: form.eid_front_url || null,
      eid_back_url: form.eid_back_url || null,
      license_front_url: form.license_front_url || null,
      license_back_url: form.license_back_url || null,
    };

    try {
      const { error } = editingId
        ? await supabase.from("clients").update(payload).eq("id", editingId)
        : await supabase.from("clients").insert(payload);

      setSaving(false);
      if (error) {
        toast.error(`Failed to ${editingId ? "update" : "add"} client: ${toSupabaseMessage(error)}`);
        console.error("Client submission error:", error);
      } else {
        toast.success(editingId ? "Client updated" : "Client added");
        setForm(emptyForm);
        setEditingId(null);
        setOpen(false);
        fetchData();
      }
    } catch (err) {
      setSaving(false);
      toast.error("An unexpected error occurred while saving client");
      console.error(err);
    }
  };

  const handleDeleteClient = async () => {
    const targetId = deleteTargetId || editingId;
    if (!targetId) return;
    setDeleting(true);
    const { count, error: activeErr } = await supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("client_id", targetId)
      .in("status", ["Active", "Expiring Soon"]);
    if (activeErr) {
      setDeleting(false);
      toast.error("Failed to verify active contracts");
      return;
    }
    if ((count ?? 0) > 0) {
      setDeleting(false);
      setConfirmDeleteOpen(false);
      toast.error("Cannot delete — client has active contracts.");
      return;
    }

    const { error: deleteErr } = await supabase.from("clients").delete().eq("id", targetId);
    setDeleting(false);
    setConfirmDeleteOpen(false);
    if (deleteErr) {
      toast.error(`Failed to delete client: ${deleteErr.message}`);
      return;
    }

    toast.success("Client deleted");
    setDeleteTargetId(null);
    setDeleteTargetName("");
    if (editingId) {
      setOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    }
    fetchData();
  };

  const handleAcceptRequest = async (request: ClientRegistrationRequest) => {
    setReviewActionLoading(true);
    const { data: insertedClient, error: insertError } = await supabase
      .from("clients")
      .insert(requestToClientPayload(request) as never)
      .select("id")
      .single();

    if (insertError) {
      setReviewActionLoading(false);
      toast.error(`Failed to accept request: ${toSupabaseMessage(insertError)}`);
      return;
    }

    const { error: updateError } = await supabase
      .from("client_registration_requests" as never)
      .update({
        status: "accepted",
        reviewed_at: new Date().toISOString(),
        created_client_id: (insertedClient as any).id,
      } as never)
      .eq("id" as never, request.id);

    setReviewActionLoading(false);
    if (updateError) {
      toast.error(`Client created, but request was not marked accepted: ${toSupabaseMessage(updateError)}`);
      fetchData();
      return;
    }

    toast.success("Client request accepted");
    setReviewingRequest(null);
    setRequestsOpen(false);
    fetchData();
  };

  const handleRejectRequest = async (request: ClientRegistrationRequest) => {
    setReviewActionLoading(true);
    const { error } = await supabase
      .from("client_registration_requests" as never)
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        rejection_reason: rejectionReason.trim() || null,
      } as never)
      .eq("id" as never, request.id);

    setReviewActionLoading(false);
    if (error) {
      toast.error(`Failed to reject request: ${toSupabaseMessage(error)}`);
      return;
    }

    toast.success("Client request rejected");
    setReviewingRequest(null);
    setRejectionReason("");
    fetchData();
  };

  return (
    <DashboardLayout title="Clients" subtitle="Manage your renters">
      <div className="flex flex-col gap-5">
        <style>{`
          @media (max-width: 767px) {
            header h1 + p {
              display: none;
            }
          }
        `}</style>

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

          <div className="hidden items-center gap-1.5 rounded-lg border border-border p-1 bg-muted/30 md:flex">
            {(["All", "Emirates ID", "Passport"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setDocFilter(opt)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-all",
                  docFilter === opt
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt}
              </button>
            ))}
          </div>

          <div className="flex w-full flex-wrap gap-2 md:w-auto md:flex-nowrap">
            <Dialog open={importOpen} onOpenChange={(v) => { setImportOpen(v); if (!v) setImportPreview(null); }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="w-full gap-1.5 bg-transparent sm:w-auto" onClick={() => setImportOpen(true)}>
                  <Upload className="h-4 w-4" />
                  Import CSV
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px] text-foreground font-dm-sans">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Import legacy clients</DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    Preview old CSV clients before inserting them. Existing phone numbers are skipped.
                  </DialogDescription>
                </DialogHeader>

              <div className="grid gap-4 py-2">
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center hover:border-foreground/30">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {importLoading ? "Reading CSV..." : "Choose CSV file"}
                  </span>
                  <span className="text-xs text-muted-foreground">No rows are imported until you confirm.</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    disabled={importLoading || importing}
                    onChange={(event) => handleImportFile(event.target.files?.[0])}
                  />
                </label>

                {importPreview && (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {[
                        ["Total rows", importPreview.totalRows],
                        ["Residents", importPreview.residents],
                        ["Tourists", importPreview.tourists],
                        ["Missing documents", importPreview.missingDocuments],
                        ["Duplicate phones", importPreview.duplicatesByPhone],
                        ["Ready to import", importPreview.rowsReady],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-border bg-card px-3 py-2">
                          <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
                          <div className="font-mono text-lg font-semibold text-foreground">{value}</div>
                        </div>
                      ))}
                    </div>

                    {importPreview.skippedMissingRequired > 0 && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
                        {importPreview.skippedMissingRequired} rows are missing full name or phone and will be skipped.
                      </div>
                    )}

                    <div className="max-h-64 overflow-auto rounded-lg border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-xs">Row</TableHead>
                            <TableHead className="text-xs">Name</TableHead>
                            <TableHead className="text-xs">Phone</TableHead>
                            <TableHead className="text-xs">Type</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {importPreview.rows.slice(0, 50).map((row) => (
                            <TableRow key={row.rowNumber}>
                              <TableCell className="font-mono text-xs">{row.rowNumber}</TableCell>
                              <TableCell className="text-sm">{row.full_name || "—"}</TableCell>
                              <TableCell className="font-mono text-xs">{row.phone || "—"}</TableCell>
                              <TableCell className="text-sm">{row.client_type}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={row.ready ? "secondary" : "outline"}
                                  className={cn(
                                    "text-[11px]",
                                    row.ready
                                      ? "bg-tint-green text-tint-green-foreground"
                                      : "border-amber-500/40 text-amber-700",
                                  )}
                                >
                                  {row.ready ? "Ready" : row.skipReason}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleImportReadyRows}
                  disabled={!importPreview || importPreview.rowsReady === 0 || importing}
                  className="bg-fd-accent text-white hover:bg-fd-accent/90"
                >
                  {importing ? "Importing..." : `Import ${importPreview?.rowsReady ?? 0} ready rows`}
                </Button>
              </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={requestsOpen} onOpenChange={(v) => { setRequestsOpen(v); if (!v) { setReviewingRequest(null); setRejectionReason(""); } }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="w-full gap-1.5 bg-transparent sm:w-auto" onClick={() => setRequestsOpen(true)}>
                  <Inbox className="h-4 w-4" />
                  Pending Requests
                  {pendingRequests.length > 0 && (
                    <Badge className="ml-1 bg-fd-accent text-white">{pendingRequests.length}</Badge>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px] text-foreground font-dm-sans">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Pending client requests</DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    Review public registration submissions before creating active client records.
                  </DialogDescription>
                </DialogHeader>

              {!reviewingRequest ? (
                <div className="grid gap-3 py-2">
                  {pendingRequests.length === 0 ? (
                    <div className="rounded-lg border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
                      No pending registration requests.
                    </div>
                  ) : (
                    pendingRequests.map((request) => (
                      <div key={request.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">{request.full_name}</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">{request.phone}</span>
                            <span>{request.client_type}</span>
                            <span>{formatDate(request.created_at)}</span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1.5 bg-transparent"
                          onClick={() => setReviewingRequest(request)}
                        >
                          <Eye className="h-4 w-4" />
                          Review
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="grid gap-4 py-2">
                  <div className="rounded-lg border border-border bg-muted/20 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-foreground">{reviewingRequest.full_name}</h3>
                        <p className="text-xs text-muted-foreground">Submitted {formatDate(reviewingRequest.created_at)}</p>
                      </div>
                      <Badge variant="outline">{reviewingRequest.client_type}</Badge>
                    </div>
                    <div className="grid gap-3 text-sm sm:grid-cols-2">
                      {[
                        ["Phone", reviewingRequest.phone],
                        ["Email", reviewingRequest.email || "—"],
                        ["Date of Birth", formatDate(reviewingRequest.date_of_birth)],
                        ["Nationality", reviewingRequest.nationality],
                        ["Emirates ID", reviewingRequest.emirates_id || "—"],
                        ["EID Expiry", formatDate(reviewingRequest.emirates_id_expiry)],
                        ["Passport", reviewingRequest.passport_number || "—"],
                        ["Passport Expiry", formatDate(reviewingRequest.passport_expiry)],
                        ["License", reviewingRequest.license_number],
                        ["License Expiry", formatDate(reviewingRequest.license_expiry)],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
                          <div className="font-medium text-foreground">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="mb-3 text-sm font-semibold text-foreground">Documents</div>
                    {documentLinks(reviewingRequest).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No documents uploaded.</p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {documentLinks(reviewingRequest).map(([label, url]) => (
                          <a
                            key={label}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                          >
                            {label}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="reject_reason" className="text-foreground">Reject reason (optional)</Label>
                    <Input
                      id="reject_reason"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Internal note"
                      className="bg-input border-border text-foreground"
                    />
                  </div>

                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button type="button" variant="outline" onClick={() => { setReviewingRequest(null); setRejectionReason(""); }} disabled={reviewActionLoading}>
                      Back
                    </Button>
                    <Button type="button" variant="destructive" className="gap-1.5" onClick={() => handleRejectRequest(reviewingRequest)} disabled={reviewActionLoading}>
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                    <Button type="button" className="gap-1.5 bg-fd-accent text-white hover:bg-fd-accent/90" onClick={() => handleAcceptRequest(reviewingRequest)} disabled={reviewActionLoading}>
                      <CheckCircle2 className="h-4 w-4" />
                      Accept
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
          </div>

          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setPhoneError(""); setDobError(""); setDupError(""); setStep(1); } }}>
            <DialogTrigger asChild>
              <Button size="sm" className="hidden gap-1.5 bg-fd-accent text-white hover:bg-fd-accent/90 md:inline-flex" onClick={openAdd}>
                <Plus className="h-4 w-4" />
                Add Client
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px] text-foreground font-dm-sans">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-foreground">{editingId ? "Edit client" : "Add new client"}</DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                      {editingId ? "Update the client's details below." : "Enter the client's details below."}
                    </DialogDescription>
                  </div>
                  <div className="bg-muted px-3 py-1 rounded-full text-xs font-medium text-muted-foreground">
                    Step {step} of 2
                  </div>
                </div>
              </DialogHeader>
              
              <form onSubmit={handleSubmit} className="grid gap-4 py-2">
                {dupError && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                    {dupError}
                  </div>
                )}
                {step === 1 ? (
                  <div className="grid gap-4">
                    <div className="grid gap-1.5">
                      <Label htmlFor="name" className="text-foreground">Full Name <span className="text-red-500">*</span></Label>
                      <Input 
                        id="name" 
                        required 
                        value={form.full_name} 
                        onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                        className="bg-input border-border text-foreground focus-visible:ring-ring"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="phone" className="text-foreground">Phone <span className="text-red-500">*</span></Label>
                      <ClientPhoneInput
                        dialCode={phoneDialCode}
                        isoCountry={phoneIsoCountry}
                        phoneNumber={phoneLocalNumber}
                        hasError={Boolean(phoneError)}
                        onCountryChange={(dialCode, isoCountry) => {
                          const localNumber = normalizeLocalPhone(phoneLocalNumber, dialCode);
                          setPhoneDialCode(dialCode);
                          setPhoneIsoCountry(isoCountry);
                          setPhoneLocalNumber(localNumber);
                          setForm((current) => ({
                            ...current,
                            phone: normalizePhone(dialCode, localNumber),
                          }));
                          setPhoneError("");
                          setDupError("");
                        }}
                        onNumberChange={(value) => {
                          const localNumber = value.replace(/\D/g, "").slice(0, 15 - phoneDialCode.length);
                          setPhoneLocalNumber(localNumber);
                          setForm((current) => ({
                            ...current,
                            phone: normalizePhone(phoneDialCode, localNumber),
                          }));
                          setPhoneError("");
                          setDupError("");
                        }}
                      />
                      {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="dob" className="text-foreground">Date of Birth <span className="text-red-500">*</span></Label>
                      <DateOfBirthPicker
                        value={form.date_of_birth}
                        hasError={Boolean(dobError)}
                        onChange={(dateOfBirth) => {
                          setForm((current) => ({ ...current, date_of_birth: dateOfBirth }));
                          setDobError(validateDateOfBirth(dateOfBirth));
                        }}
                      />
                      {dobError && <p className="text-xs text-destructive">{dobError}</p>}
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    <div className="grid gap-1.5">
                      <Label className="text-foreground">Client Type</Label>
                      <Tabs 
                        value={form.client_type} 
                        onValueChange={(v) => setForm({ ...form, client_type: v as ClientType })}
                        className="w-full"
                      >
                        <TabsList className="grid w-full grid-cols-2 bg-muted">
                          <TabsTrigger value="Resident" className="data-[state=active]:bg-background data-[state=active]:text-foreground">Resident</TabsTrigger>
                          <TabsTrigger value="Tourist" className="data-[state=active]:bg-background data-[state=active]:text-foreground">Tourist</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {form.client_type === "Resident" ? (
                        <>
                          <div className="grid gap-1.5">
                            <Label htmlFor="eid" className="text-foreground">Emirates ID <span className="text-red-500">*</span></Label>
                            <Input
                              id="eid"
                              required
                              value={form.emirates_id}
                              onChange={(e) => setForm({ ...form, emirates_id: e.target.value })}
                              className="bg-input border-border text-foreground focus-visible:ring-ring"
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="eidexp" className="text-foreground">Expiry Date <span className="text-red-500">*</span></Label>
                            <Input
                              id="eidexp"
                              type="date"
                              required
                              value={form.emirates_id_expiry}
                              onChange={(e) => setForm({ ...form, emirates_id_expiry: e.target.value })}
                              className="bg-input border-border text-foreground [color-scheme:dark]"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid gap-1.5">
                            <Label htmlFor="pass" className="text-foreground">Passport Number <span className="text-red-500">*</span></Label>
                            <Input
                              id="pass"
                              required
                              value={form.passport_number}
                              onChange={(e) => setForm({ ...form, passport_number: e.target.value })}
                              className="bg-input border-border text-foreground focus-visible:ring-ring"
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="passexp" className="text-foreground">Expiry Date <span className="text-red-500">*</span></Label>
                            <Input
                              id="passexp"
                              type="date"
                              required
                              value={form.passport_expiry}
                              onChange={(e) => setForm({ ...form, passport_expiry: e.target.value })}
                              className="bg-input border-border text-foreground [color-scheme:dark]"
                            />
                          </div>
                        </>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor="nat" className="text-foreground">Nationality <span className="text-red-500">*</span></Label>
                        <NationalityCombobox
                          id="nat"
                          value={form.nationality}
                          onChange={(v) => setForm({ ...form, nationality: v })}
                          // Note: NationalityCombobox might need internal styling for dark mode, 
                          // but I am restricted from editing it if it's a separate file.
                          // Assuming it handles its own styling or works with parent classes.
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="lic" className="text-foreground">License Number <span className="text-red-500">*</span></Label>
                        <Input 
                          id="lic" 
                          required 
                          value={form.license_number} 
                          onChange={(e) => setForm({ ...form, license_number: e.target.value })}
                          className="bg-input border-border text-foreground focus-visible:ring-ring"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor="licexp" className="text-foreground">License Expiry <span className="text-red-500">*</span></Label>
                        <Input 
                          id="licexp" 
                          type="date" 
                          required
                          value={form.license_expiry || ""} 
                          onChange={(e) => setForm({ ...form, license_expiry: e.target.value })}
                          className="bg-input border-border text-foreground [color-scheme:dark]"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="email" className="text-foreground">Email (optional)</Label>
                        <Input 
                          id="email" 
                          type="email" 
                          value={form.email || ""} 
                          onChange={(e) => { setForm({ ...form, email: e.target.value }); setDupError(""); }}
                          className="bg-input border-border text-foreground focus-visible:ring-ring"
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 pt-2 border-t border-border mt-2">
                      <Label className="text-sm font-semibold text-foreground">Documents</Label>
                      
                      <div className="grid grid-cols-2 gap-3">
                        {form.client_type === "Tourist" && (
                          <label className="bg-muted border border-dashed border-border rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:border-foreground/30 transition-colors">
                            <div className="bg-background rounded p-2">
                              <IdCard className="h-4 w-4 text-foreground" />
                            </div>
                            <div className="flex flex-col text-left">
                              <span className="text-foreground text-sm font-medium">Passport Photo</span>
                              <span className="text-muted-foreground text-xs">Tap to upload</span>
                            </div>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={async (e) => {
                                await uploadClientDocument(e.target.files?.[0], "passport_photo_url");
                              }}
                              className="hidden"
                            />
                          </label>
                        )}
                        
                        {form.client_type === "Resident" && (
                          <>
                            <label className="bg-muted border border-dashed border-border rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:border-foreground/30 transition-colors">
                              <div className="bg-background rounded p-2">
                                <IdCard className="h-4 w-4 text-foreground" />
                              </div>
                              <div className="flex flex-col text-left">
                                <span className="text-foreground text-sm font-medium">Emirates ID Front</span>
                                <span className="text-muted-foreground text-xs">Tap to upload</span>
                              </div>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                  await uploadClientDocument(e.target.files?.[0], "eid_front_url");
                                }}
                                className="hidden"
                              />
                            </label>
                            <label className="bg-muted border border-dashed border-border rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:border-foreground/30 transition-colors">
                              <div className="bg-background rounded p-2">
                                <IdCard className="h-4 w-4 text-foreground" />
                              </div>
                              <div className="flex flex-col text-left">
                                <span className="text-foreground text-sm font-medium">Emirates ID Back</span>
                                <span className="text-muted-foreground text-xs">Tap to upload</span>
                              </div>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                  await uploadClientDocument(e.target.files?.[0], "eid_back_url");
                                }}
                                className="hidden"
                              />
                            </label>
                          </>
                        )}

                        <label className="bg-muted border border-dashed border-border rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:border-foreground/30 transition-colors">
                          <div className="bg-background rounded p-2">
                            <FileText className="h-4 w-4 text-foreground" />
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="text-foreground text-sm font-medium">License Front</span>
                            <span className="text-muted-foreground text-xs">Tap to upload</span>
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={async (e) => {
                              await uploadClientDocument(e.target.files?.[0], "license_front_url");
                            }}
                            className="hidden"
                          />
                        </label>

                        <label className="bg-muted border border-dashed border-border rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:border-foreground/30 transition-colors">
                          <div className="bg-background rounded p-2">
                            <FileText className="h-4 w-4 text-foreground" />
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="text-foreground text-sm font-medium">License Back</span>
                            <span className="text-muted-foreground text-xs">Tap to upload</span>
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={async (e) => {
                              await uploadClientDocument(e.target.files?.[0], "license_back_url");
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                <DialogFooter className="gap-2 sm:gap-0 mt-4">
                  {step === 1 ? (
                    <div className="flex w-full justify-between gap-3">
                      <Button type="button" variant="outline" onClick={() => setOpen(false)} className="bg-transparent border-border text-muted-foreground hover:bg-muted hover:text-foreground">
                        Cancel
                      </Button>
                      <Button 
                        type="button" 
                        onClick={() => {
                          const nextPhoneError = validatePhone(phoneDialCode, phoneLocalNumber);
                          const nextDobError = validateDateOfBirth(form.date_of_birth);
                          setPhoneError(nextPhoneError);
                          setDobError(nextDobError);
                          if (!form.full_name.trim() || nextPhoneError || nextDobError) {
                            if (!form.full_name.trim()) toast.error("Please enter the client's full name");
                            return;
                          }
                          setStep(2);
                        }}
                        className="bg-fd-accent text-white hover:bg-fd-accent/90"
                      >
                        Next <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex w-full justify-between gap-3">
                      <Button type="button" variant="outline" onClick={() => setStep(1)} className="bg-transparent border-border text-muted-foreground hover:bg-muted hover:text-foreground">
                        <ChevronLeft className="mr-1 h-4 w-4" /> Back
                      </Button>
                      <div className="flex gap-3">
                        <Button type="submit" disabled={saving} className="bg-fd-accent text-white hover:bg-fd-accent/90">
                          {saving ? "Saving..." : editingId ? "Save Changes" : "Save Client"}
                        </Button>
                      </div>
                    </div>
                  )}
                </DialogFooter>
                {editingId && step === 2 && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setConfirmDeleteOpen(true)}
                    disabled={deleting}
                    className="mt-2"
                  >
                    Delete Client
                  </Button>
                )}
              </form>
            </DialogContent>
          </Dialog>
          <AlertDialog open={confirmDeleteOpen} onOpenChange={(v) => { setConfirmDeleteOpen(v); if (!v) { setDeleteTargetId(null); setDeleteTargetName(""); } }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {deleteTargetName || form.full_name || "client"}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This cannot be undone. Only clients without active contracts can be deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteClient}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Delete Client"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="-mx-2 grid grid-cols-3 gap-2 md:hidden">
          <div className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-[#21293d] bg-[#161b27] px-2 py-2 text-center">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-semibold text-foreground">{activeClientsCount} Active</span>
          </div>
          <div className="flex min-h-14 flex-col items-center justify-center rounded-xl border border-[#21293d] bg-[#161b27] px-2 py-2 text-center">
            <span className="font-mono text-sm font-semibold text-red-400">AED {outstandingTotal.toLocaleString()}</span>
            <span className="text-[11px] font-medium text-muted-foreground">Due</span>
          </div>
          <div className="flex min-h-14 items-center justify-center rounded-xl border border-[#21293d] bg-[#161b27] px-2 py-2 text-center">
            <span className="text-sm font-semibold text-foreground">{clients.length} Total</span>
          </div>
        </div>

        <div className="-mx-2 overflow-x-auto [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-2 px-2">
            {(["All", "Emirates ID", "Passport", "Active", "Outstanding"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setDocFilter(opt)}
                className={cn(
                  "h-9 rounded-full px-4 text-sm font-medium transition-colors",
                  docFilter === opt
                    ? "bg-[#2563eb] text-white"
                    : "bg-[#161b27] text-muted-foreground",
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div className="-mx-2 grid gap-2 px-2 md:hidden">
          {loading ? (
            <div className="rounded-xl border border-[#21293d] bg-[#161b27] px-4 py-8 text-center text-sm text-muted-foreground">
              Loading clients...
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-[#21293d] bg-[#161b27] px-4 py-8 text-center text-sm text-muted-foreground">
              No clients found.
            </div>
          ) : (
            paginatedClients.map((c) => {
              const documentPrefix = c.client_type === "Resident" ? "EID" : "PAS";
              const documentValue = c.client_type === "Resident" ? c.emirates_id : c.passport_number;
              const amountLabel = c.outstanding > 0 ? "Due" : c.totalContracts > 0 ? "Paid" : "Balance";

              return (
                <Link
                  key={c.id}
                  to={`/clients/${c.id}`}
                  className={cn(
                    "relative grid grid-cols-[44px_minmax(0,1fr)_88px] gap-3 rounded-xl border border-[#21293d] bg-[#161b27] p-3 text-left transition-opacity",
                    !c.hasActive && "opacity-60",
                  )}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#21293d] text-sm font-semibold text-foreground">
                    {getInitials(c.full_name)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-foreground">{c.full_name}</span>
                      <span className="shrink-0 text-sm">{getCountryFlag(c.nationality)}</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">{c.phone}</div>
                    <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                      {documentPrefix} {documentValue || "-"}
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-col items-end pr-5 text-right">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <span className={cn("h-2 w-2 rounded-full", c.hasActive ? "bg-emerald-500" : "bg-slate-500")} />
                      <span>{c.hasActive ? "Active" : "No active"}</span>
                    </div>
                    <div
                      className={cn(
                        "mt-2 font-mono text-xs font-semibold",
                        c.outstanding > 0 ? "text-red-400" : "text-emerald-400",
                      )}
                    >
                      AED {c.outstanding.toLocaleString()}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{amountLabel}</div>
                  </div>
                  <MoreVertical className="absolute right-2 top-2 h-4 w-4 text-muted-foreground" />
                </Link>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-center gap-3 md:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 bg-transparent"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
          >
            Prev
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {mobileTotalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 bg-transparent"
            onClick={() => setPage((current) => Math.min(mobileTotalPages, current + 1))}
            disabled={page >= mobileTotalPages}
          >
            Next
          </Button>
        </div>

        <Button
          type="button"
          aria-label="Add client"
          onClick={openAdd}
          className="fixed bottom-20 right-4 z-50 h-14 w-14 rounded-full bg-[#2563eb] p-0 text-white shadow-lg hover:bg-[#1d4ed8] md:hidden"
        >
          <Plus className="h-7 w-7" />
        </Button>

        <div className="hidden rounded-xl border border-border bg-card md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-5 text-xs">Client Name</TableHead>
                <TableHead className="text-xs">Phone</TableHead>
                <TableHead className="text-xs">Document</TableHead>
                <TableHead className="text-xs">Nationality</TableHead>
                <TableHead className="text-xs">Info</TableHead>
                <TableHead className="text-xs">Total Contracts</TableHead>
                <TableHead className="text-xs">Active</TableHead>
                <TableHead className="text-xs">Outstanding</TableHead>
                <TableHead className="px-5 text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">
                    Loading clients...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">
                    No clients found.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedClients.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="px-5 font-medium text-foreground">
                      <Link to={`/clients/${c.id}`} className="hover:underline">
                        {c.full_name}
                      </Link>
                      {c.is_new === true && (
                        <span className="ml-2 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full px-2 py-0.5">New</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.phone}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {c.client_type === "Resident" ? (
                        <span><span className="text-[10px] font-sans text-muted-foreground/60 mr-1">EID:</span>{c.emirates_id}</span>
                      ) : (
                        <span><span className="text-[10px] font-sans text-muted-foreground/60 mr-1">PAS:</span>{c.passport_number}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.nationality}</TableCell>
                    <TableCell>
                      <Badge
                        variant={isClientIncomplete(c) ? "outline" : "secondary"}
                        className={cn(
                          "text-[11px]",
                          isClientIncomplete(c)
                            ? "border-amber-500/40 text-amber-700"
                            : "bg-tint-green text-tint-green-foreground",
                        )}
                      >
                        {isClientIncomplete(c) ? "Missing info" : "Complete"}
                      </Badge>
                    </TableCell>
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
                      "text-sm font-medium",
                      c.outstanding > 0 ? "text-tint-rose-foreground" : "text-foreground",
                    )}>
                      AED {c.outstanding.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 text-xs"
                          onClick={() => openEdit(c)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTargetId(c.id);
                            setDeleteTargetName(c.full_name);
                            setConfirmDeleteOpen(true);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <ListPagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Clients;
