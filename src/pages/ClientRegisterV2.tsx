import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  BriefcaseBusiness,
  Check,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  CloudUpload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { COUNTRIES, PRIORITY_COUNTRIES } from "@/data/countries";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ClientType = "Resident" | "Tourist";

interface Step1 {
  full_name: string;
  phone: string;
  date_of_birth: string;
  email: string;
  nationality: string;
}

interface Step2 {
  client_type: ClientType | "";
}

interface Step3 {
  emirates_id: string;
  emirates_id_expiry: string;
  passport_number: string;
  passport_expiry: string;
  license_number: string;
  license_expiry: string;
}

interface DocFile {
  url: string;
  name: string;
  size: number;
}

interface Docs {
  eid_front: DocFile | null;
  eid_back: DocFile | null;
  license_front: DocFile | null;
  license_back: DocFile | null;
  passport_photo: DocFile | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

const ALL_COUNTRIES = [
  ...PRIORITY_COUNTRIES,
  ...COUNTRIES.filter((c) => !PRIORITY_COUNTRIES.includes(c)),
];

const fieldClassName =
  "h-12 rounded-xl border-slate-200 bg-white text-base text-slate-950 shadow-sm shadow-slate-200/60 placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-100 [color-scheme:light]";

const labelClassName = "text-sm font-semibold text-slate-800";

const REQUIRED_MESSAGE = "Required";

function toDateInputString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getAdultMaxDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return toDateInputString(date);
}

function validateDateOfBirth(value: string) {
  if (!value) return REQUIRED_MESSAGE;
  if (value > getAdultMaxDate()) return "Driver must be at least 18 years old.";
  return "";
}

function formatEmiratesId(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 15);
  const parts = [
    digits.slice(0, 3),
    digits.slice(3, 7),
    digits.slice(7, 14),
    digits.slice(14, 15),
  ].filter(Boolean);
  return parts.join("-");
}

function isValidEmiratesId(value: string) {
  return /^784-\d{4}-\d{7}-\d$/.test(value);
}

function getPhoneError(dialCode: string, phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return REQUIRED_MESSAGE;
  if (dialCode === "971" && digits.length < 9) return "Enter a valid UAE phone number.";
  return "";
}

// ── Progress bar ──────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: "Personal Info" },
  { n: 2, label: "Identity" },
  { n: 3, label: "Documents" },
  { n: 4, label: "Review" },
];

function ProgressBar({ current, completedSteps }: { current: number; completedSteps: number[] }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-3 py-3 shadow-sm shadow-slate-200/70">
      <div className="flex items-start gap-0">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex flex-1 items-start">
            <div className="flex min-w-0 flex-col items-center gap-2">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold transition-all",
                  completedSteps.includes(s.n)
                    ? "border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-200"
                    : current === s.n
                    ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-200"
                    : "border-slate-200 bg-slate-50 text-slate-400",
                )}
              >
                {completedSteps.includes(s.n) ? <Check className="h-4 w-4" /> : s.n}
              </div>
              <span
                className={cn(
                  "max-w-[4.75rem] text-center text-[11px] font-semibold leading-tight",
                  current === s.n ? "text-blue-700" : completedSteps.includes(s.n) ? "text-emerald-700" : "text-slate-400",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "mx-1 mt-5 h-0.5 flex-1 rounded-full transition-all",
                  completedSteps.includes(s.n) ? "bg-emerald-400" : "bg-slate-200",
                )}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Upload card ───────────────────────────────────────────────────────────────

interface UploadCardProps {
  label: string;
  value: DocFile | null;
  onChange: (f: DocFile | null) => void;
}

function UploadCard({ label, value, onChange }: UploadCardProps) {
  const [uploading, setUploading] = useState(false);
  const [sizeError, setSizeError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setSizeError(false);
    if (file.size > 5 * 1024 * 1024) {
      setSizeError(true);
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("client-documents")
        .upload(path, file, { upsert: false });
      if (error) {
        console.error("Upload error:", error);
        return;
      }
      const { data: urlData } = supabase.storage
        .from("client-documents")
        .getPublicUrl(path);
      onChange({ url: urlData.publicUrl, name: file.name, size: file.size });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="grid gap-2">
      <Label className={labelClassName}>{label}</Label>
      {value ? (
        <div className="relative flex min-h-[128px] items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 pr-16">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute right-3 top-3 cursor-pointer border-none bg-transparent text-xs font-semibold text-blue-600 underline"
          >
            Replace
          </button>
          {value.name.match(/\.(jpg|jpeg|png|webp)$/i) ? (
            <img
              src={value.url}
              alt={label}
              className="h-14 w-14 rounded-xl border border-slate-200 object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white text-xs font-semibold text-slate-500">
              PDF
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold text-slate-950">{value.name}</p>
            <p className="text-xs text-slate-500">{formatBytes(value.size)}</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
              <Check className="h-3 w-3" /> Uploaded
            </span>
          </div>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => !uploading && inputRef.current?.click()}
          className="flex min-h-[190px] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-slate-200 bg-white px-5 py-8 text-center shadow-sm shadow-slate-200/50 transition-colors hover:border-blue-400 hover:bg-blue-50 sm:min-h-[210px]"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
            <CloudUpload className={cn("h-6 w-6", uploading ? "animate-pulse text-blue-500" : "text-blue-600")} />
          </div>
          <p className="max-w-[15rem] text-sm font-semibold leading-5 text-slate-700">
            {uploading ? "Uploading…" : (
              <>
                <span className="text-blue-700">Drop file here</span>
                {" or "}
                <span className="text-blue-700">Choose File</span>
              </>
            )}
          </p>
          <p className="text-[10px] text-gray-400">JPG, PNG, PDF · max 5 MB</p>
          {sizeError && (
            <p className="text-xs font-medium text-red-600">File exceeds 5 MB limit</p>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}

// ── Field row helper ──────────────────────────────────────────────────────────

function ReviewRow({
  label,
  value,
  dateStatus,
}: {
  label: string;
  value: string;
  dateStatus?: DateValidationStatus;
}) {
  const isEmpty = !value || value === "—";
  const valueClassName = cn(
    "min-w-0 break-words text-base font-semibold sm:text-right",
    dateStatus === "expired" && "text-red-600",
    dateStatus === "expiring_soon" && "text-yellow-600",
    dateStatus !== "expired" && dateStatus !== "expiring_soon" && "text-slate-950",
  );

  return (
    <div className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      {isEmpty ? (
        <span className="text-base text-slate-500">Not provided</span>
      ) : (
        <span className={valueClassName}>{value}</span>
      )}
    </div>
  );
}

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-700">{title}</p>
        <button
          type="button"
          onClick={onEdit}
          className="text-sm font-semibold text-blue-600 hover:underline"
        >
          Edit
        </button>
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

// ── Phone input component ─────────────────────────────────────────────────────

interface DialCountry { name: string; iso2: string; dial: string; }

const DIAL_COUNTRIES: DialCountry[] = [
  { name: "United Arab Emirates", iso2: "ae", dial: "971" },
  { name: "Saudi Arabia",         iso2: "sa", dial: "966" },
  { name: "Kuwait",               iso2: "kw", dial: "965" },
  { name: "Qatar",                iso2: "qa", dial: "974" },
  { name: "Bahrain",              iso2: "bh", dial: "973" },
  { name: "Oman",                 iso2: "om", dial: "968" },
  { name: "Jordan",               iso2: "jo", dial: "962" },
  { name: "Lebanon",              iso2: "lb", dial: "961" },
  { name: "Egypt",                iso2: "eg", dial: "20"  },
  { name: "Iraq",                 iso2: "iq", dial: "964" },
  { name: "Russia",               iso2: "ru", dial: "7"   },
  { name: "Kazakhstan",           iso2: "kz", dial: "7"   },
  { name: "India",                iso2: "in", dial: "91"  },
  { name: "Pakistan",             iso2: "pk", dial: "92"  },
  { name: "United Kingdom",       iso2: "gb", dial: "44"  },
  { name: "Germany",              iso2: "de", dial: "49"  },
  { name: "France",               iso2: "fr", dial: "33"  },
  { name: "United States",        iso2: "us", dial: "1"   },
  { name: "Turkey",               iso2: "tr", dial: "90"  },
  { name: "Philippines",          iso2: "ph", dial: "63"  },
  { name: "Indonesia",            iso2: "id", dial: "62"  },
  { name: "Malaysia",             iso2: "my", dial: "60"  },
  { name: "Ukraine",              iso2: "ua", dial: "380" },
  { name: "Uzbekistan",           iso2: "uz", dial: "998" },
  { name: "Kyrgyzstan",           iso2: "kg", dial: "996" },
  { name: "Tajikistan",           iso2: "tj", dial: "992" },
  { name: "China",                iso2: "cn", dial: "86"  },
  { name: "Armenia",              iso2: "am", dial: "374" },
  { name: "Georgia",              iso2: "ge", dial: "995" },
];

interface PhoneInputProps {
  dialCode: string;
  isoCountry: string;
  countryCode: string;
  phoneNumber: string;
  onChange: (field: "dialCode" | "isoCountry" | "countryCode" | "phoneNumber", value: string) => void;
  hasError?: boolean;
}

function PhoneInput({ dialCode, isoCountry, phoneNumber, onChange, hasError }: PhoneInputProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isDropdownOpen]);

  const filtered = DIAL_COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.dial.startsWith(search.replace(/\D/g, "")),
  );

  return (
    <div ref={wrapRef} className="relative w-full min-w-0">
      <div
        className={cn(
          "flex h-12 w-full overflow-hidden rounded-xl border bg-white text-base shadow-sm shadow-slate-200/60 ring-offset-background focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100",
          hasError ? "border-red-400" : "border-slate-200",
        )}
      >
        {/* Country selector button */}
        <button
          type="button"
          onClick={() => setIsDropdownOpen((o) => !o)}
          className="flex w-28 shrink-0 items-center justify-between gap-2 border-r border-slate-200 bg-slate-50 px-3 hover:bg-slate-100 focus:outline-none"
        >
          <img
            src={`https://flagcdn.com/20x15/${isoCountry}.png`}
            alt=""
            className="h-[15px] w-5 shrink-0 rounded-sm object-cover"
          />
          <span className="font-semibold text-slate-900">+{dialCode}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        </button>

        {/* Local number input — never affected by dropdown state */}
        <input
          type="tel"
          inputMode="numeric"
          placeholder="50 123 4567"
          value={phoneNumber}
          onChange={(e) => onChange("phoneNumber", e.target.value)}
          className="min-w-0 flex-1 bg-white px-3 py-2 text-base text-slate-950 outline-none placeholder:text-slate-400 [color-scheme:light]"
        />
      </div>

      {/* Dropdown */}
      {isDropdownOpen && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-200/80">
          <div className="border-b border-gray-100 p-2">
            <input
              autoFocus
              type="text"
              placeholder="Search country or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 [color-scheme:light]"
            />
          </div>
          <div className="max-h-[260px] overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-gray-400">No results</p>
            )}
            {filtered.map((c) => (
              <button
                key={`${c.iso2}-${c.dial}`}
                type="button"
                onClick={() => {
                  onChange("dialCode", c.dial);
                  onChange("isoCountry", c.iso2);
                  onChange("countryCode", c.name);
                  setIsDropdownOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50",
                  isoCountry === c.iso2 && dialCode === c.dial
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-800",
                )}
              >
                <img
                  src={`https://flagcdn.com/20x15/${c.iso2}.png`}
                  alt=""
                  className="h-[15px] w-5 shrink-0 rounded-sm object-cover"
                />
                <span className="flex-1 text-left">{c.name}</span>
                <span className="text-xs text-gray-400">+{c.dial}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Date validation ───────────────────────────────────────────────────────────

function NationalityCombobox({
  value,
  onChange,
  hasError,
}: {
  value: string;
  onChange: (value: string) => void;
  hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const query = search.trim().toLowerCase();
  const options = ALL_COUNTRIES.filter((country) => country.toLowerCase().includes(query));

  return (
    <div ref={wrapRef} className="relative">
      <button
        id="nationality"
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          fieldClassName,
          "flex w-full items-center justify-between px-3 text-left",
          !value && "text-slate-500",
          hasError && "border-red-400",
        )}
        aria-expanded={open}
      >
        <span className="truncate">{value || "Select nationality"}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/80">
          <div className="border-b border-slate-100 p-3">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search nationality"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 [color-scheme:light]"
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto py-1">
            {options.length === 0 ? (
              <p className="px-4 py-4 text-center text-sm text-slate-500">No country found</p>
            ) : (
              options.map((country) => (
                <button
                  key={country}
                  type="button"
                  onClick={() => {
                    onChange(country);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "flex min-h-11 w-full items-center px-4 py-2 text-left text-sm hover:bg-blue-50",
                    value === country ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-800",
                  )}
                >
                  {country}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type DateValidationStatus = 'empty' | 'expired' | 'expiring_soon' | 'valid';

function getDateValidationStatus(dateValue: string): DateValidationStatus {
  if (!dateValue) return 'empty';
  const expiry = new Date(dateValue);
  const today = new Date();
  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 30) return 'expiring_soon';
  return 'valid';
}

function DateValidationBadge({ status, dateValue }: { status: DateValidationStatus; dateValue: string }) {
  if (status === 'empty') return null;

  if (status === 'expired') {
    return (
      <div className="mt-1 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-600">
        <AlertCircle size={14} className="shrink-0" />
        Document Expired — please upload a valid document
      </div>
    );
  }

  if (status === 'expiring_soon') {
    const expiry = new Date(dateValue);
    const today = new Date();
    const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return (
      <div className="mt-1 flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-2 text-xs text-yellow-700">
        <AlertTriangle size={14} className="shrink-0" />
        Expires in {diffDays} day{diffDays !== 1 ? 's' : ''} — consider requesting a renewal
      </div>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-600">
      <CheckCircle size={14} className="shrink-0" />
      Valid
    </div>
  );
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface ExistingClientRow {
  id: string;
  full_name: string;
  phone: string;
  date_of_birth: string | null;
  email: string | null;
  nationality: string;
  client_type: string;
  emirates_id: string | null;
  emirates_id_expiry: string | null;
  passport_number: string | null;
  passport_expiry: string | null;
  license_number: string;
  license_expiry: string | null;
  eid_front_url?: string | null;
  eid_back_url?: string | null;
  license_front_url?: string | null;
  license_back_url?: string | null;
  passport_photo_url?: string | null;
}

function parseStoredPhone(phone: string): {
  dialCode: string;
  isoCountry: string;
  countryCode: string;
  phoneNumber: string;
} {
  const normalized = phone.replace(/\s/g, "");
  if (!normalized.startsWith("+")) {
    return {
      dialCode: "971",
      isoCountry: "ae",
      countryCode: "United Arab Emirates",
      phoneNumber: normalized.replace(/\D/g, ""),
    };
  }
  const sorted = [...DIAL_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (normalized.startsWith(`+${c.dial}`)) {
      return {
        dialCode: c.dial,
        isoCountry: c.iso2,
        countryCode: c.name,
        phoneNumber: normalized.slice(1 + c.dial.length).replace(/\D/g, ""),
      };
    }
  }
  return {
    dialCode: "971",
    isoCountry: "ae",
    countryCode: "United Arab Emirates",
    phoneNumber: normalized.replace(/\D/g, ""),
  };
}

function docFromUrl(url: string | null | undefined): DocFile | null {
  if (!url) return null;
  const name = url.split("/").pop() ?? "document";
  return { url, name, size: 0 };
}

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  return value.split("T")[0];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClientRegisterV2() {
  const [searchParams] = useSearchParams();
  const ownerId = searchParams.get("owner_id") ?? "";

  // Step state
  const [step, setStep] = useState(1);

  // Step 1 fields
  const [s1, setS1] = useState<Step1>({
    full_name: "",
    phone: "",
    date_of_birth: "",
    email: "",
    nationality: "",
  });
  // Phone: 4 separate fields (default UAE +971)
  const [dialCode, setDialCode] = useState("971");
  const [isoCountry, setIsoCountry] = useState("ae");
  const [countryCode, setCountryCode] = useState("United Arab Emirates");
  const [phoneNumber, setPhoneNumber] = useState("");

  // Step 2 fields
  const [s2, setS2] = useState<Step2>({ client_type: "" });

  // Step 3 fields
  const [s3, setS3] = useState<Step3>({
    emirates_id: "",
    emirates_id_expiry: "",
    passport_number: "",
    passport_expiry: "",
    license_number: "",
    license_expiry: "",
  });

  // Document uploads
  const [docs, setDocs] = useState<Docs>({
    eid_front: null,
    eid_back: null,
    license_front: null,
    license_back: null,
    passport_photo: null,
  });

  const setDoc = (key: keyof Docs, val: DocFile | null) =>
    setDocs((prev) => ({ ...prev, [key]: val }));

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [closeBlocked, setCloseBlocked] = useState(false);

  // Step 1 validation
  const [s1Errors, setS1Errors] = useState<Partial<Record<keyof Step1, string>>>({});
  const [s2Error, setS2Error] = useState("");
  const [s3Errors, setS3Errors] = useState<Partial<Record<keyof Step3, string>>>({});

  // Returning customer lookup
  const [returningOpen, setReturningOpen] = useState(false);
  const [returningName, setReturningName] = useState("");
  const [returningDob, setReturningDob] = useState("");
  const [returningStatus, setReturningStatus] = useState<"idle" | "loading" | "not_found" | "found">("idle");
  const [returningBanner, setReturningBanner] = useState<string | null>(null);
  const [existingClientId, setExistingClientId] = useState<string | null>(null);

  // ── Guards ──────────────────────────────────────────────────────────────────

  const handleClose = () => {
    window.close();
    setTimeout(() => {
      setCloseBlocked(true);
    }, 300);
  };

  if (!ownerId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <X className="h-6 w-6 text-red-600" />
          </div>
          <p className="font-semibold text-gray-900">Invalid registration link.</p>
          <p className="mt-1 text-sm text-gray-500">Please use the link provided by your rental company.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="mx-4 w-full max-w-md rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <CheckCircle size={40} className="text-green-600" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-gray-900">Registration Submitted!</h2>
          <p className="mb-1 text-lg text-gray-600">Thank you, {s1.full_name}!</p>
          <p className="mb-8 text-sm text-gray-500">
            Your details have been received. Our team will contact you shortly via WhatsApp to confirm your booking.
          </p>
          {closeBlocked ? (
            <p className="text-sm text-gray-400 text-center">You can now close this tab manually.</p>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              className="w-full rounded-xl bg-gray-100 py-3 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Close this page
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  const goToStep = (n: number) => {
    setStep(n);
    window.scrollTo({ top: 0 });
  };

  const validateStep1 = () => {
    const errs: Partial<Record<keyof Step1, string>> = {};
    if (!s1.full_name.trim()) errs.full_name = REQUIRED_MESSAGE;
    const phoneError = getPhoneError(dialCode, phoneNumber);
    if (phoneError) errs.phone = phoneError;
    const dobError = validateDateOfBirth(s1.date_of_birth);
    if (dobError) errs.date_of_birth = dobError;
    if (!s1.nationality) errs.nationality = REQUIRED_MESSAGE;
    return errs;
  };

  const validateStep2 = () => {
    return s2.client_type ? "" : REQUIRED_MESSAGE;
  };

  const validateStep3 = () => {
    const errs: Partial<Record<keyof Step3, string>> = {};
    if (!s3.license_number.trim()) errs.license_number = REQUIRED_MESSAGE;
    if (s2.client_type === "Resident") {
      if (!s3.emirates_id.trim()) errs.emirates_id = REQUIRED_MESSAGE;
      else if (!isValidEmiratesId(s3.emirates_id.trim())) errs.emirates_id = "Enter a valid Emirates ID.";
      if (!s3.emirates_id_expiry) errs.emirates_id_expiry = REQUIRED_MESSAGE;
      if (!s3.license_expiry) errs.license_expiry = REQUIRED_MESSAGE;
    }
    return errs;
  };

  const hasRequiredErrors = () => {
    return (
      Object.keys(validateStep1()).length > 0 ||
      !!validateStep2() ||
      Object.keys(validateStep3()).length > 0
    );
  };

  const handleStep1Continue = () => {
    const errs = validateStep1();
    if (Object.keys(errs).length) { setS1Errors(errs); return; }
    setS1Errors({});
    goToStep(2);
  };

  const prefillFromClient = (client: ExistingClientRow) => {
    const phone = parseStoredPhone(client.phone ?? "");
    setDialCode(phone.dialCode);
    setIsoCountry(phone.isoCountry);
    setCountryCode(phone.countryCode);
    setPhoneNumber(phone.phoneNumber);

    setS1({
      full_name: client.full_name ?? "",
      phone: client.phone ?? "",
      date_of_birth: toDateInputValue(client.date_of_birth),
      email: client.email ?? "",
      nationality: client.nationality ?? "",
    });

    setS2({
      client_type: (client.client_type === "Tourist" ? "Tourist" : "Resident") as ClientType,
    });

    setS3({
      emirates_id: formatEmiratesId(client.emirates_id ?? ""),
      emirates_id_expiry: toDateInputValue(client.emirates_id_expiry),
      passport_number: client.passport_number ?? "",
      passport_expiry: toDateInputValue(client.passport_expiry),
      license_number: client.license_number ?? "",
      license_expiry: toDateInputValue(client.license_expiry),
    });

    setDocs({
      eid_front: docFromUrl(client.eid_front_url),
      eid_back: docFromUrl(client.eid_back_url),
      license_front: docFromUrl(client.license_front_url),
      license_back: docFromUrl(client.license_back_url),
      passport_photo: docFromUrl(client.passport_photo_url),
    });
    setS1Errors({});
    setS2Error("");
    setS3Errors({});
  };

  const handleFindProfile = async () => {
    if (!returningName.trim() || !returningDob) return;

    setReturningStatus("loading");
    setReturningBanner(null);

    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .ilike("full_name", returningName.trim())
      .eq("date_of_birth" as never, returningDob)
      .eq("owner_id", ownerId)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      setReturningStatus("not_found");
      return;
    }

    const client = data as unknown as ExistingClientRow;
    prefillFromClient(client);
    setExistingClientId(client.id);
    setReturningStatus("found");
    setReturningBanner(`Welcome back, ${client.full_name}! Your details have been pre-filled.`);
    setTimeout(() => goToStep(4), 1000);
  };

  const handleSubmit = async () => {
    setSubmitError("");
    const step1Errors = validateStep1();
    const step2Error = validateStep2();
    const step3Errors = validateStep3();
    setS1Errors(step1Errors);
    setS2Error(step2Error);
    setS3Errors(step3Errors);
    if (Object.keys(step1Errors).length || step2Error || Object.keys(step3Errors).length) {
      setSubmitError("Please complete the required fields before submitting.");
      if (Object.keys(step1Errors).length) goToStep(1);
      else if (step2Error) goToStep(2);
      else goToStep(3);
      return;
    }
    setSubmitting(true);
    try {
      const isResident = s2.client_type === "Resident";
      const payload = {
        owner_id: ownerId,
        full_name: s1.full_name.trim(),
        phone: phoneNumber.trim() ? `+${dialCode}${phoneNumber.trim()}` : "",
        date_of_birth: s1.date_of_birth || null,
        email: s1.email.trim() || null,
        nationality: s1.nationality,
        client_type: s2.client_type || "Resident",
        emirates_id: isResident ? s3.emirates_id.trim() : "",
        emirates_id_expiry: isResident ? s3.emirates_id_expiry || null : null,
        passport_number: !isResident ? s3.passport_number.trim() : "",
        passport_expiry: !isResident ? s3.passport_expiry || null : null,
        license_number: s3.license_number.trim(),
        license_expiry: s3.license_expiry || null,
        eid_front_url: docs.eid_front?.url ?? null,
        eid_back_url: docs.eid_back?.url ?? null,
        license_front_url: docs.license_front?.url ?? null,
        license_back_url: docs.license_back?.url ?? null,
        passport_photo_url: docs.passport_photo?.url ?? null,
      };

      if (existingClientId) {
        const { owner_id: _ownerId, ...updatePayload } = payload;
        const { error } = await supabase
          .from("clients")
          .update(updatePayload as never)
          .eq("id", existingClientId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clients").insert(payload as never);
        if (error) throw error;
      }
      setSubmitted(true);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const isResident = s2.client_type === "Resident";
  const step1ValidationErrors = validateStep1();
  const step2ValidationError = validateStep2();
  const step3ValidationErrors = validateStep3();
  const completedSteps = [
    step > 1 && Object.keys(step1ValidationErrors).length === 0 ? 1 : null,
    step > 2 && !step2ValidationError ? 2 : null,
    step > 3 && Object.keys(step3ValidationErrors).length === 0 ? 3 : null,
  ].filter((n): n is number => n !== null);
  const requiredReviewIssues = [
    step1ValidationErrors.full_name && "Full Name",
    step1ValidationErrors.phone && "Phone",
    step1ValidationErrors.date_of_birth && "Date of Birth",
    step1ValidationErrors.nationality && "Nationality",
    step2ValidationError && "Client Type",
    step3ValidationErrors.emirates_id && "Emirates ID",
    step3ValidationErrors.emirates_id_expiry && "Emirates ID Expiry",
    step3ValidationErrors.license_number && "License Number",
    step3ValidationErrors.license_expiry && "License Expiry",
  ].filter((item): item is string => Boolean(item));

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen overflow-x-hidden bg-white">
      {/* Top nav */}
      <div className="border-b border-slate-100 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
          <div>
            <span className="text-xl font-extrabold tracking-tight text-slate-950">FleetDesk</span>
            <p className="text-xs font-medium text-slate-500">Secure rental registration</p>
          </div>
          <a href="mailto:support@fleetdesk.app" className="text-sm font-medium text-slate-500 hover:text-blue-600">
            Need help?
          </a>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 pb-16 pt-8 sm:px-6">
        {/* Progress */}
        <div className="mb-8">
          <ProgressBar current={step} completedSteps={completedSteps} />
        </div>

        {returningBanner && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {returningBanner}
          </div>
        )}

        {/* ── STEP 1: Personal Information ── */}
        {step === 1 && (
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
            <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-slate-950">Personal Information</h1>
            <p className="mb-8 text-base leading-6 text-slate-600">Tell us a bit about yourself.</p>

            <div className="grid gap-5">
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => setReturningOpen((o) => !o)}
                  className="max-w-full rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-left text-sm font-semibold text-blue-700"
                >
                  Already registered? Find your profile →
                </button>

                {returningOpen && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-4">
                      <Input
                        placeholder="Full name as registered"
                        value={returningName}
                        onChange={(e) => {
                          setReturningName(e.target.value);
                          if (returningStatus !== "idle") setReturningStatus("idle");
                        }}
                        className={fieldClassName}
                      />
                      <div className="grid gap-2">
                        <Label htmlFor="returning_dob" className={labelClassName}>Date of Birth</Label>
                        <Input
                          id="returning_dob"
                          type="date"
                          max={getAdultMaxDate()}
                          value={returningDob}
                          onChange={(e) => {
                            setReturningDob(e.target.value);
                            if (returningStatus !== "idle") setReturningStatus("idle");
                          }}
                          className={fieldClassName}
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={handleFindProfile}
                        disabled={returningStatus === "loading" || !returningName.trim() || !returningDob}
                        className="h-12 w-full rounded-xl bg-blue-600 font-semibold text-white hover:bg-blue-700"
                      >
                        Find my profile
                      </Button>
                      {returningStatus === "loading" && (
                        <p className="text-sm text-gray-500">Searching...</p>
                      )}
                      {returningStatus === "not_found" && (
                        <p className="text-sm text-red-600">No profile found. Please fill in your details below.</p>
                      )}
                      {returningStatus === "found" && returningBanner && (
                        <p className="text-sm text-green-600">{returningBanner}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="full_name" className={labelClassName}>Full Name <span className="text-red-500">*</span></Label>
                <Input
                  id="full_name"
                  placeholder="As on official ID"
                  value={s1.full_name}
                  onChange={(e) => setS1((p) => ({ ...p, full_name: e.target.value }))}
                  className={cn(fieldClassName, s1Errors.full_name && "border-red-400 focus-visible:ring-red-300")}
                />
                {s1Errors.full_name && <p className="text-xs text-red-500">{s1Errors.full_name}</p>}
              </div>

              <div className="grid gap-5 sm:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
                <div className="grid min-w-0 gap-2">
                  <Label htmlFor="phone" className={labelClassName}>Phone <span className="text-red-500">*</span></Label>
                  <PhoneInput
                    dialCode={dialCode}
                    isoCountry={isoCountry}
                    countryCode={countryCode}
                    phoneNumber={phoneNumber}
                    hasError={!!s1Errors.phone}
                    onChange={(field, value) => {
                      if (field === "dialCode") setDialCode(value);
                      else if (field === "isoCountry") setIsoCountry(value);
                      else if (field === "countryCode") setCountryCode(value);
                      else {
                        setPhoneNumber(value.replace(/\D/g, ""));
                        if (s1Errors.phone) setS1Errors((p) => ({ ...p, phone: "" }));
                      }
                    }}
                  />
                  {s1Errors.phone && <p className="text-xs text-red-500">{s1Errors.phone}</p>}
                </div>
                <div className="grid min-w-0 gap-2">
                  <Label htmlFor="dob" className={labelClassName}>Date of Birth <span className="text-red-500">*</span></Label>
                  <Input
                    id="dob"
                    type="date"
                    max={getAdultMaxDate()}
                    value={s1.date_of_birth}
                    onChange={(e) => {
                      setS1((p) => ({ ...p, date_of_birth: e.target.value }));
                      if (s1Errors.date_of_birth) setS1Errors((p) => ({ ...p, date_of_birth: "" }));
                    }}
                    className={cn(fieldClassName, s1Errors.date_of_birth && "border-red-400")}
                  />
                  {s1Errors.date_of_birth && <p className="text-xs text-red-500">{s1Errors.date_of_birth}</p>}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="email" className={labelClassName}>Email <span className="font-normal text-slate-500">(optional)</span></Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@email.com"
                  value={s1.email}
                  onChange={(e) => setS1((p) => ({ ...p, email: e.target.value }))}
                  className={fieldClassName}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="nationality" className={labelClassName}>Nationality <span className="text-red-500">*</span></Label>
                <NationalityCombobox
                  value={s1.nationality}
                  hasError={!!s1Errors.nationality}
                  onChange={(value) => {
                    setS1((p) => ({ ...p, nationality: value }));
                    if (s1Errors.nationality) setS1Errors((p) => ({ ...p, nationality: "" }));
                  }}
                />
                {s1Errors.nationality && <p className="text-xs text-red-500">{s1Errors.nationality}</p>}
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <Button onClick={handleStep1Continue} className="h-12 w-full gap-2 rounded-xl bg-blue-600 px-6 font-semibold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 sm:w-auto">
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Identity ── */}
        {step === 2 && (
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
            <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-slate-950">Are you a UAE resident? <span className="text-red-500">*</span></h1>
            <p className="mb-8 text-base leading-6 text-slate-600">Select your residency status.</p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(
                [
                  {
                    type: "Resident" as ClientType,
                    icon: <Building2 className="h-7 w-7" />,
                    title: "Resident",
                    sub: "I am a UAE resident",
                  },
                  {
                    type: "Tourist" as ClientType,
                    icon: <BriefcaseBusiness className="h-7 w-7" />,
                    title: "Tourist",
                    sub: "I am visiting the UAE",
                  },
                ] as const
              ).map(({ type, icon, title, sub }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setS2({ client_type: type });
                    setS2Error("");
                  }}
                  className={cn(
                    "relative flex min-h-[154px] flex-col items-center justify-center gap-3 rounded-2xl border p-6 text-center transition-all",
                    s2.client_type === type
                      ? "border-blue-600 bg-blue-50 shadow-md shadow-blue-100"
                      : "border-slate-200 bg-white shadow-sm shadow-slate-200/60 hover:border-blue-200 hover:bg-blue-50/50",
                  )}
                >
                  {s2.client_type === type && (
                    <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600">
                      <Check className="h-3 w-3 text-white" />
                    </span>
                  )}
                  <span className={cn(s2.client_type === type ? "text-blue-600" : "text-gray-500")}>
                    {icon}
                  </span>
                  <div>
                    <p className="text-base font-bold text-slate-950">{title}</p>
                    <p className="mt-1 text-sm leading-5 text-slate-600">{sub}</p>
                  </div>
                </button>
              ))}
            </div>
            {s2Error && <p className="mt-3 text-sm font-medium text-red-600">{s2Error}</p>}

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="ghost" onClick={() => goToStep(1)} className="h-12 w-full gap-1.5 rounded-xl px-4 text-slate-600 sm:w-auto">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                onClick={() => {
                  const error = validateStep2();
                  setS2Error(error);
                  if (!error) goToStep(3);
                }}
                disabled={!s2.client_type}
                className="h-12 w-full gap-2 rounded-xl bg-blue-600 px-6 font-semibold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-50 sm:w-auto"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Documents ── */}
        {step === 3 && (
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
            <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-slate-950">Documents</h1>
            <p className="mb-4 text-base leading-6 text-slate-600">
              {isResident ? "Provide your Emirates ID and driving license details." : "Provide your passport and driving license details."}
            </p>
            <div className="mb-8 flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm leading-5 text-blue-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>You can continue without uploads, but documents may be required before handover.</p>
            </div>

            <div className="grid gap-6">
              {/* ID fields */}
              <div className="grid gap-5 lg:grid-cols-2">
                {isResident ? (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="eid" className={labelClassName}>Emirates ID Number <span className="text-red-500">*</span></Label>
                      <Input
                        id="eid"
                        placeholder="784-YYYY-XXXXXXX-X"
                        inputMode="numeric"
                        value={s3.emirates_id}
                        onChange={(e) => {
                          setS3((p) => ({ ...p, emirates_id: formatEmiratesId(e.target.value) }));
                          if (s3Errors.emirates_id) setS3Errors((p) => ({ ...p, emirates_id: "" }));
                        }}
                        className={cn(fieldClassName, s3Errors.emirates_id && "border-red-400")}
                      />
                      {s3Errors.emirates_id && <p className="text-xs text-red-500">{s3Errors.emirates_id}</p>}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="eid_exp" className={labelClassName}>Emirates ID Expiry <span className="text-red-500">*</span></Label>
                      <Input
                        id="eid_exp"
                        type="date"
                        value={s3.emirates_id_expiry}
                        onChange={(e) => {
                          setS3((p) => ({ ...p, emirates_id_expiry: e.target.value }));
                          if (s3Errors.emirates_id_expiry) setS3Errors((p) => ({ ...p, emirates_id_expiry: "" }));
                        }}
                        className={cn(fieldClassName, s3Errors.emirates_id_expiry && "border-red-400")}
                      />
                      {s3Errors.emirates_id_expiry && <p className="text-xs text-red-500">{s3Errors.emirates_id_expiry}</p>}
                      <DateValidationBadge status={getDateValidationStatus(s3.emirates_id_expiry)} dateValue={s3.emirates_id_expiry} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="pass" className={labelClassName}>Passport Number</Label>
                      <Input
                        id="pass"
                        value={s3.passport_number}
                        onChange={(e) => setS3((p) => ({ ...p, passport_number: e.target.value }))}
                        className={fieldClassName}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="pass_exp" className={labelClassName}>Passport Expiry</Label>
                      <Input
                        id="pass_exp"
                        type="date"
                        value={s3.passport_expiry}
                        onChange={(e) => setS3((p) => ({ ...p, passport_expiry: e.target.value }))}
                        className={fieldClassName}
                      />
                      <DateValidationBadge status={getDateValidationStatus(s3.passport_expiry)} dateValue={s3.passport_expiry} />
                    </div>
                  </>
                )}

                <div className="grid gap-2">
                  <Label htmlFor="lic" className={labelClassName}>License Number <span className="text-red-500">*</span></Label>
                  <Input
                    id="lic"
                    value={s3.license_number}
                    onChange={(e) => {
                      setS3((p) => ({ ...p, license_number: e.target.value }));
                      if (s3Errors.license_number) setS3Errors((p) => ({ ...p, license_number: "" }));
                    }}
                    className={cn(fieldClassName, s3Errors.license_number && "border-red-400")}
                  />
                  {s3Errors.license_number && <p className="text-xs text-red-500">{s3Errors.license_number}</p>}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="lic_exp" className={labelClassName}>
                    License Expiry {isResident && <span className="text-red-500">*</span>}
                  </Label>
                  <Input
                    id="lic_exp"
                    type="date"
                    value={s3.license_expiry}
                    onChange={(e) => {
                      setS3((p) => ({ ...p, license_expiry: e.target.value }));
                      if (s3Errors.license_expiry) setS3Errors((p) => ({ ...p, license_expiry: "" }));
                    }}
                    className={cn(fieldClassName, s3Errors.license_expiry && "border-red-400")}
                  />
                  {s3Errors.license_expiry && <p className="text-xs text-red-500">{s3Errors.license_expiry}</p>}
                  <DateValidationBadge status={getDateValidationStatus(s3.license_expiry)} dateValue={s3.license_expiry} />
                </div>
              </div>

              {/* Upload cards — row 1: ID documents */}
              <div className="grid gap-5 lg:grid-cols-2">
                {isResident ? (
                  <>
                    <UploadCard label="Emirates ID Front" value={docs.eid_front} onChange={(v) => setDoc("eid_front", v)} />
                    <UploadCard label="Emirates ID Back" value={docs.eid_back} onChange={(v) => setDoc("eid_back", v)} />
                  </>
                ) : (
                  <>
                    <UploadCard label="Passport Photo" value={docs.passport_photo} onChange={(v) => setDoc("passport_photo", v)} />
                    <div className="hidden lg:block" />
                  </>
                )}
              </div>

              {/* Upload cards — row 2: License */}
              <div className="grid gap-5 lg:grid-cols-2">
                <UploadCard label="License Front" value={docs.license_front} onChange={(v) => setDoc("license_front", v)} />
                <UploadCard label="License Back" value={docs.license_back} onChange={(v) => setDoc("license_back", v)} />
              </div>
            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="ghost" onClick={() => goToStep(2)} className="h-12 w-full gap-1.5 rounded-xl px-4 text-slate-600 sm:w-auto">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                onClick={() => {
                  const errs = validateStep3();
                  setS3Errors(errs);
                  if (Object.keys(errs).length) return;
                  goToStep(4);
                }}
                disabled={
                  getDateValidationStatus(s3.emirates_id_expiry) === 'expired' ||
                  getDateValidationStatus(s3.passport_expiry) === 'expired' ||
                  getDateValidationStatus(s3.license_expiry) === 'expired'
                }
                className="h-12 w-full gap-2 rounded-xl bg-blue-600 px-6 font-semibold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Review & Submit ── */}
        {step === 4 && (
          <div className="grid gap-4">
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
              <h1 className="mb-2 text-2xl font-extrabold tracking-tight text-slate-950">Review & Submit</h1>
              <p className="mb-8 text-base leading-6 text-slate-600">Please review your details before submitting.</p>

              {requiredReviewIssues.length > 0 && (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <p className="font-semibold">Required fields need attention:</p>
                  <p className="mt-1">{requiredReviewIssues.join(", ")}</p>
                </div>
              )}

              <div className="grid gap-4">
                <ReviewSection title="Personal Information" onEdit={() => goToStep(1)}>
                  <ReviewRow label="Full Name" value={s1.full_name} />
                  <ReviewRow label="Phone" value={phoneNumber ? `+${dialCode} ${phoneNumber}` : ""} />
                  <ReviewRow label="Date of Birth" value={formatDisplayDate(s1.date_of_birth)} />
                  <ReviewRow label="Email" value={s1.email} />
                  <ReviewRow label="Nationality" value={s1.nationality} />
                </ReviewSection>

                <ReviewSection title="Identity" onEdit={() => goToStep(2)}>
                  <ReviewRow label="Type" value={s2.client_type} />
                  {isResident ? (
                    <>
                      <ReviewRow label="Emirates ID" value={s3.emirates_id} />
                      <ReviewRow
                        label="EID Expiry"
                        value={formatDisplayDate(s3.emirates_id_expiry)}
                        dateStatus={getDateValidationStatus(s3.emirates_id_expiry)}
                      />
                    </>
                  ) : (
                    <>
                      <ReviewRow label="Passport Number" value={s3.passport_number} />
                      <ReviewRow
                        label="Passport Expiry"
                        value={formatDisplayDate(s3.passport_expiry)}
                        dateStatus={getDateValidationStatus(s3.passport_expiry)}
                      />
                    </>
                  )}
                  <ReviewRow label="License Number" value={s3.license_number} />
                  <ReviewRow
                    label="License Expiry"
                    value={formatDisplayDate(s3.license_expiry)}
                    dateStatus={getDateValidationStatus(s3.license_expiry)}
                  />
                </ReviewSection>

                <ReviewSection title="Documents" onEdit={() => goToStep(3)}>
                  {isResident && (
                    <>
                      <ReviewRow label="Emirates ID Front" value={docs.eid_front ? "✓ Uploaded" : "Missing"} />
                      <ReviewRow label="Emirates ID Back" value={docs.eid_back ? "✓ Uploaded" : "Missing"} />
                    </>
                  )}
                  {!isResident && (
                    <ReviewRow label="Passport Photo" value={docs.passport_photo ? "✓ Uploaded" : "Missing"} />
                  )}
                  <ReviewRow label="License Front" value={docs.license_front ? "✓ Uploaded" : "Missing"} />
                  <ReviewRow label="License Back" value={docs.license_back ? "✓ Uploaded" : "Missing"} />
                </ReviewSection>
              </div>

              {submitError && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {submitError}
                </div>
              )}

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button variant="ghost" onClick={() => goToStep(3)} className="h-12 w-full gap-1.5 rounded-xl px-4 text-slate-600 sm:w-auto">
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || requiredReviewIssues.length > 0}
                  className="h-12 w-full gap-2 rounded-xl bg-blue-600 px-6 font-semibold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {submitting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Submitting…
                    </>
                  ) : (
                    "Submit Registration"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
