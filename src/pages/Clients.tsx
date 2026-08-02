import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
import { createClientDocumentSignedUrl } from "@/lib/clientDocuments";
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
  license_type: "uae" | "foreign" | "international" | null;
  license_issuing_country: string | null;
  traffic_file_number: string | null;
  date_of_birth: string | null;
  unified_number: string | null;
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
  unified_number: "",
  emirates_id: "",
  emirates_id_expiry: "",
  passport_number: "",
  passport_expiry: "",
  nationality: "",
  email: "",
  license_number: "",
  license_expiry: "",
  license_type: "" as "" | "uae" | "foreign" | "international",
  license_issuing_country: "",
  traffic_file_number: "",
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
                className="h-[17m{Ó«h‘éì¶»§q«^v"“²Ò×Óà¢ÄÆW'DF–Æöt6öçFVçCà¢ÄÆW'DF–Æöt†VFW#à¢ÄÆW'DF–ÆöuF—FÆSäFVÆWFR¶FVÆWFUF&vWDæÖRÇÂf÷&ÒægVÆÅöæÖRÇÂ&6Æ–VçB'ÓóÂôÆW'DF–ÆöuF—FÆSà¢ÄÆW'DF–ÆötFW67&—F–öãà¢F†—26ææ÷B&RVæFöæRâöæÇ’6Æ–VçG2v—F†÷WB7F—fR6öçG&7G26â&RFVÆWFVBà¢ÂôÆW'DF–ÆötFW67&—F–öãà¢ÂôÆW'DF–Æöt†VFW#à¢ÄÆW'DF–Æötfö÷FW#à¢ÄÆW'DF–Æöt6æ6VÂF—6&ÆVC×¶FVÆWF–æwÓä6æ6VÃÂôÆW'DF–Æöt6æ6VÃà¢ÄÆW'DF–Æöt7F–öà¢öä6Æ–6³×¶†æFÆTFVÆWFT6Æ–VçGÐ¢6Æ74æÖSÒ&&rÖFW7G'V7F—fRFW‡BÖFW7G'V7F—fRÖf÷&Vw&÷VæB†÷fW#¦&rÖFW7G'V7F—fRó“ ¢F—6&ÆVC×¶FVÆWF–æwÐ¢à¢¶FVÆWF–ærò$FVÆWF–ærâââ"¢$FVÆWFR6Æ–VçB'Ð¢ÂôÆW'DF–Æöt7F–öãà¢ÂôÆW'DF–Æötfö÷FW#à¢ÂôÆW'DF–Æöt6öçFVçCà¢ÂôÆW'DF–Æösà¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ"Ö×‚Ó"w&–Bw&–BÖ6öÇ2Ó2vÓ"ÖC¦†–FFVâ#à¢ÆF—b6Æ74æÖSÒ&fÆW‚Ö–âÖ‚ÓB—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓ"&÷VæFVB×†Â&÷&FW"&÷&FW"Õ²3##“6EÒ&rÕ²3c##uÒ‚Ó"’Ó"FW‡BÖ6VçFW"#à¢Ç7â6Æ74æÖSÒ&‚Ó"rÓ"&÷VæFVBÖgVÆÂ&rÖVÖW&ÆBÓS"óà¢Ç7â6Æ74æÖSÒ'FW‡B×6ÒföçB×6VÖ–&öÆBFW‡BÖf÷&Vw&÷VæB#ç¶7F—fT6Æ–VçG46÷VçGÒ7F—fSÂ÷7ãà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚Ö–âÖ‚ÓBfÆW‚Ö6öÂ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVB×†Â&÷&FW"&÷&FW"Õ²3##“6EÒ&rÕ²3c##uÒ‚Ó"’Ó"FW‡BÖ6VçFW"#à¢Ç7â6Æ74æÖSÒ&föçBÖÖöæòFW‡B×6ÒföçB×6VÖ–&öÆBFW‡B×&VBÓC#äTB¶÷WG7FæF–æuF÷FÂçFôÆö6ÆU7G&–ær‚—ÓÂ÷7ãà¢Ç7â6Æ74æÖSÒ'FW‡BÕ³…ÒföçBÖÖVF—VÒFW‡BÖ×WFVBÖf÷&Vw&÷VæB#äGVSÂ÷7ãà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚Ö–âÖ‚ÓB—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVB×†Â&÷&FW"&÷&FW"Õ²3##“6EÒ&rÕ²3c##uÒ‚Ó"’Ó"FW‡BÖ6VçFW"#à¢Ç7â6Æ74æÖSÒ'FW‡B×6ÒföçB×6VÖ–&öÆBFW‡BÖf÷&Vw&÷VæB#ç¶6Æ–VçG2æÆVæwF‡ÒF÷FÃÂ÷7ãà¢ÂöF—cà¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ"Ö×‚Ó"÷fW&fÆ÷r×‚ÖWFò·67&öÆÆ&"×v–GFƒ¦æöæUÒÖC¦†–FFVâ²c£¢×vV&¶—B×67&öÆÆ&%Ó¦†–FFVâ#à¢ÆF—b6Æ74æÖSÒ&fÆW‚rÖÖ‚vÓ"‚Ó"#à¢²…²$ÆÂ"Â$VÖ—&FW2”B"Â%77÷'B"Â$7F—fR"Â$÷WG7FæF–ær%Ò26öç7B’æÖ‚†÷B’Óâ€¢Æ'WGFöà¢¶W“×¶÷GÐ¢G—SÒ&'WGFöâ ¢öä6Æ–6³×²‚’Óâ6WDFö4f–ÇFW"†÷B—Ð¢6Æ74æÖS×¶6â€¢&‚Ó’&÷VæFVBÖgVÆÂ‚ÓBFW‡B×6ÒföçBÖÖVF—VÒG&ç6—F–öâÖ6öÆ÷'2"À¢Fö4f–ÇFW"ÓÓÒ÷@¢ò&&rÕ²3#Sc6V%ÒFW‡B×v†—FR ¢¢&&rÕ²3c##uÒFW‡BÖ×WFVBÖf÷&Vw&÷VæB"À¢—Ð¢à¢¶÷GÐ¢Âö'WGFöãà¢’—Ð¢ÂöF—cà¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ"Ö×‚Ó"w&–BvÓ"‚Ó"ÖC¦†–FFVâ#à¢¶ÆöF–ærò€¢ÆF—b6Æ74æÖSÒ'&÷VæFVB×†Â&÷&FW"&÷&FW"Õ²3##“6EÒ&rÕ²3c##uÒ‚ÓB’Ó‚FW‡BÖ6VçFW"FW‡B×6ÒFW‡BÖ×WFVBÖf÷&Vw&÷VæB#à¢ÆöF–ær6Æ–VçG2ââà¢ÂöF—cà¢’¢f–ÇFW&VBæÆVæwF‚ÓÓÒò€¢ÆF—b6Æ74æÖSÒ'&÷VæFVB×†Â&÷&FW"&÷&FW"Õ²3##“6EÒ&rÕ²3c##uÒ‚ÓB’Ó‚FW‡BÖ6VçFW"FW‡B×6ÒFW‡BÖ×WFVBÖf÷&Vw&÷VæB#à¢æò6Æ–VçG2f÷VæBà¢ÂöF—cà¢’¢€¢v–æFVD6Æ–VçG2æÖ‚†2’Óâ°¢6öç7BFö7VÖVçE&Vf—‚Ò2æ6Æ–VçE÷G—RÓÓÒ%&W6–FVçB"ò$T”B"¢%2#°¢6öç7BFö7VÖVçEfÇVRÒ2æ6Æ–VçE÷G—RÓÓÒ%&W6–FVçB"ò2æVÖ—&FW5ö–B¢2ç77÷'EöçVÖ&W#°¢6öç7BÖ÷VçDÆ&VÂÒ2æ÷WG7FæF–ærâò$GVR"¢2çF÷FÄ6öçG&7G2âò%–B"¢$&Ææ6R#° ¢&WGW&â€¢ÄÆ–æ°¢¶W“×¶2æ–GÐ¢Fó×¶ö6Æ–VçG2òG¶2æ–GÖÐ¢6Æ74æÖS×¶6â€¢'&VÆF—fRw&–Bw&–BÖ6öÇ2Õ³CG…öÖ–æÖ‚ƒÃg"•óƒ‡…ÒvÓ2&÷VæFVB×†Â&÷&FW"&÷&FW"Õ²3##“6EÒ&rÕ²3c##uÒÓ2FW‡BÖÆVgBG&ç6—F–öâÖ÷6—G’"À¢2æ†47F—fRbb&÷6—G’Óc"À¢—Ð¢à¢ÆF—b6Æ74æÖSÒ&fÆW‚‚ÓrÓ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVBÖgVÆÂ&rÕ²3##“6EÒFW‡B×6ÒföçB×6VÖ–&öÆBFW‡BÖf÷&Vw&÷VæB#à¢¶vWD–æ—F–Ç2†2ægVÆÅöæÖR—Ð¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&Ö–â×rÓ#à¢ÆF—b6Æ74æÖSÒ&fÆW‚Ö–â×rÓ—FV×2Ö6VçFW"vÓãR#à¢Ç7â6Æ74æÖSÒ'G'Væ6FRFW‡B×6ÒföçB×6VÖ–&öÆBFW‡BÖf÷&Vw&÷VæB#ç¶2ægVÆÅöæÖWÓÂ÷7ãà¢Ç7â6Æ74æÖSÒ'6‡&–æ²ÓFW‡B×6Ò#ç¶vWD6÷VçG'”fÆr†2ææF–öæÆ—G’—ÓÂ÷7ãà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&×BÓG'Væ6FRFW‡B×‡2FW‡BÖ×WFVBÖf÷&Vw&÷VæB#ç¶2ç†öæWÓÂöF—cà¢ÆF—b6Æ74æÖSÒ&×BÓG'Væ6FRföçBÖÖöæòFW‡BÕ³…ÒFW‡BÖ×WFVBÖf÷&Vw&÷VæB#à¢¶Fö7VÖVçE&Vf—‡Ò¶Fö7VÖVçEfÇVRÇÂ"Ò'Ð¢ÂöF—cà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&fÆW‚Ö–â×rÓfÆW‚Ö6öÂ—FV×2ÖVæB"ÓRFW‡B×&–v‡B#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓãRFW‡BÕ³…ÒföçBÖÖVF—VÒFW‡BÖ×WFVBÖf÷&Vw&÷VæB#à¢Ç7â6Æ74æÖS×¶6â‚&‚Ó"rÓ"&÷VæFVBÖgVÆÂ"Â2æ†47F—fRò&&rÖVÖW&ÆBÓS"¢&&r×6ÆFRÓS"—Òóà¢Ç7ãç¶2æ†47F—fRò$7F—fR"¢$æò7F—fR'ÓÂ÷7ãà¢ÂöF—cà¢ÆF—`¢6Æ74æÖS×¶6â€¢&×BÓ"föçBÖÖöæòFW‡B×‡2föçB×6VÖ–&öÆB"À¢2æ÷WG7FæF–ærâò'FW‡B×&VBÓC"¢'FW‡BÖVÖW&ÆBÓC"À¢—Ð¢à¢TB¶2æ÷WG7FæF–ærçFôÆö6ÆU7G&–ær‚—Ð¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&×BÓãRFW‡BÕ³…ÒFW‡BÖ×WFVBÖf÷&Vw&÷VæB#ç¶Ö÷VçDÆ&VÇÓÂöF—cà¢ÂöF—cà¢ÄÖ÷&UfW'F–6Â6Æ74æÖSÒ&'6öÇWFR&–v‡BÓ"F÷Ó"‚ÓBrÓBFW‡BÖ×WFVBÖf÷&Vw&÷VæB"óà¢ÂôÆ–æ³à¢“°¢Ò¢—Ð¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓ2ÖC¦†–FFVâ#à¢Ä'WGFöà¢G—SÒ&'WGFöâ ¢f&–çCÒ&÷WFÆ–æR ¢6—¦SÒ'6Ò ¢6Æ74æÖSÒ&‚Ó’&r×G&ç7&VçB ¢öä6Æ–6³×²‚’Óâ6WEvR‚†7W'&VçB’ÓâÖF‚æÖ‚ƒÂ7W'&VçBÒ’—Ð¢F—6&ÆVC×·vRÃÒÐ¢à¢&W`¢Âô'WGFöãà¢Ç7â6Æ74æÖSÒ'FW‡B×6ÒFW‡BÖ×WFVBÖf÷&Vw&÷VæB#à¢vR·vWÒöb¶Öö&–ÆUF÷FÅvW7Ð¢Â÷7ãà¢Ä'WGFöà¢G—SÒ&'WGFöâ ¢f&–çCÒ&÷WFÆ–æR ¢6—¦SÒ'6Ò ¢6Æ74æÖSÒ&‚Ó’&r×G&ç7&VçB ¢öä6Æ–6³×²‚’Óâ6WEvR‚†7W'&VçB’ÓâÖF‚æÖ–â†Öö&–ÆUF÷FÅvW2Â7W'&VçB²’—Ð¢F—6&ÆVC×·vRãÒÖö&–ÆUF÷FÅvW7Ð¢à¢æW‡@¢Âô'WGFöãà¢ÂöF—cà ¢Ä'WGFöà¢G—SÒ&'WGFöâ ¢&–ÖÆ&VÃÒ$FB6Æ–VçB ¢öä6Æ–6³×¶÷VäFGÐ¢6Æ74æÖSÒ&f—†VB&÷GFöÒÓ#&–v‡BÓB¢ÓS‚ÓBrÓB&÷VæFVBÖgVÆÂ&rÕ²3#Sc6V%ÒÓFW‡B×v†—FR6†F÷rÖÆr†÷fW#¦&rÕ²3CFVC…ÒÖC¦†–FFVâ ¢à¢ÅÇW26Æ74æÖSÒ&‚ÓrrÓr"óà¢Âô'WGFöãà ¢ÆF—b6Æ74æÖSÒ&†–FFVâ&÷VæFVB×†Â&÷&FW"&÷&FW"Ö&÷&FW"&rÖ6&BÖC¦&Æö6²#à¢ÅF&ÆSà¢ÅF&ÆT†VFW#à¢ÅF&ÆU&÷r6Æ74æÖSÒ&†÷fW#¦&r×G&ç7&VçB#à¢ÅF&ÆT†VB6Æ74æÖSÒ'‚ÓRFW‡B×‡2#ä6Æ–VçBæÖSÂõF&ÆT†VCà¢ÅF&ÆT†VB6Æ74æÖSÒ'FW‡B×‡2#å†öæSÂõF&ÆT†VCà¢ÅF&ÆT†VB6Æ74æÖSÒ'FW‡B×‡2#äFö7VÖVçCÂõF&ÆT†VCà¢ÅF&ÆT†VB6Æ74æÖSÒ'FW‡B×‡2#äæF–öæÆ—G“ÂõF&ÆT†VCà¢ÅF&ÆT†VB6Æ74æÖSÒ'FW‡B×‡2#ä–æfóÂõF&ÆT†VCà¢ÅF&ÆT†VB6Æ74æÖSÒ'FW‡B×‡2#åF÷FÂ6öçG&7G3ÂõF&ÆT†VCà¢ÅF&ÆT†VB6Æ74æÖSÒ'FW‡B×‡2#ä7F—fSÂõF&ÆT†VCà¢ÅF&ÆT†VB6Æ74æÖSÒ'FW‡B×‡2#ä÷WG7FæF–æsÂõF&ÆT†VCà¢ÅF&ÆT†VB6Æ74æÖSÒ'‚ÓRFW‡B×‡2FW‡B×&–v‡B#ä7F–öç3ÂõF&ÆT†VCà¢ÂõF&ÆU&÷sà¢ÂõF&ÆT†VFW#à¢ÅF&ÆT&öG“à¢¶ÆöF–ærò€¢ÅF&ÆU&÷sà¢ÅF&ÆT6VÆÂ6öÅ7ã×³—Ò6Æ74æÖSÒ&‚Ó#BFW‡BÖ6VçFW"FW‡B×6ÒFW‡BÖ×WFVBÖf÷&Vw&÷VæB#à¢ÆöF–ær6Æ–VçG2ââà¢ÂõF&ÆT6VÆÃà¢ÂõF&ÆU&÷sà¢’¢f–ÇFW&VBæÆVæwF‚ÓÓÒò€¢ÅF&ÆU&÷sà¢ÅF&ÆT6VÆÂ6öÅ7ã×³—Ò6Æ74æÖSÒ&‚Ó#BFW‡BÖ6VçFW"FW‡B×6ÒFW‡BÖ×WFVBÖf÷&Vw&÷VæB#à¢æò6Æ–VçG2f÷VæBà¢ÂõF&ÆT6VÆÃà¢ÂõF&ÆU&÷sà¢’¢€¢v–æFVD6Æ–VçG2æÖ‚†2’Óâ€¢ÅF&ÆU&÷r¶W“×¶2æ–GÓà¢ÅF&ÆT6VÆÂ6Æ74æÖSÒ'‚ÓRföçBÖÖVF—VÒFW‡BÖf÷&Vw&÷VæB#à¢ÄÆ–æ²Fó×¶ö6Æ–VçG2òG¶2æ–GÖÒ6Æ74æÖSÒ&†÷fW#§VæFW&Æ–æR#à¢¶2ægVÆÅöæÖWÐ¢ÂôÆ–æ³à¢¶2æ—5öæWrÓÓÒG'VRbb€¢Ç7â6Æ74æÖSÒ&ÖÂÓ"&rÖ&ÇVRÓFW‡BÖ&ÇVRÓsFW‡B×‡2föçB×6VÖ–&öÆB&÷VæFVBÖgVÆÂ‚Ó"’ÓãR#äæWsÂ÷7ãà¢—Ð¢ÂõF&ÆT6VÆÃà¢ÅF&ÆT6VÆÂ6Æ74æÖSÒ'FW‡B×6ÒFW‡BÖ×WFVBÖf÷&Vw&÷VæB#ç¶2ç†öæWÓÂõF&ÆT6VÆÃà¢ÅF&ÆT6VÆÂ6Æ74æÖSÒ&föçBÖÖöæòFW‡B×‡2FW‡BÖ×WFVBÖf÷&Vw&÷VæB#à¢¶2æ6Æ–VçE÷G—RÓÓÒ%&W6–FVçB"ò€¢Ç7ããÇ7â6Æ74æÖSÒ'FW‡BÕ³…ÒföçB×6ç2FW‡BÖ×WFVBÖf÷&Vw&÷VæBóc×"Ó#äT”C£Â÷7ãç¶2æVÖ—&FW5ö–GÓÂ÷7ãà¢’¢€¢Ç7ããÇ7â6Æ74æÖSÒ'FW‡BÕ³…ÒföçB×6ç2FW‡BÖ×WFVBÖf÷&Vw&÷VæBóc×"Ó#å3£Â÷7ãç¶2ç77÷'EöçVÖ&W'ÓÂ÷7ãà¢—Ð¢ÂõF&ÆT6VÆÃà¢ÅF&ÆT6VÆÂ6Æ74æÖSÒ'FW‡B×6ÒFW‡BÖ×WFVBÖf÷&Vw&÷VæB#ç¶2ææF–öæÆ—G—ÓÂõF&ÆT6VÆÃà¢ÅF&ÆT6VÆÃà¢Ä&FvP¢f&–çC×¶—46Æ–VçD–æ6ö×ÆWFR†2’ò&÷WFÆ–æR"¢'6V6öæF'’'Ð¢6Æ74æÖS×¶6â€¢'FW‡BÕ³…Ò"À¢—46Æ–VçD–æ6ö×ÆWFR†2¢ò&&÷&FW"ÖÖ&W"ÓSóCFW‡BÖÖ&W"Ós ¢¢&&r×F–çBÖw&VVâFW‡B×F–çBÖw&VVâÖf÷&Vw&÷VæB"À¢—Ð¢à¢¶—46Æ–VçD–æ6ö×ÆWFR†2’ò$Ö—76–ær–æfò"¢$6ö×ÆWFR'Ð¢Âô&FvSà¢ÂõF&ÆT6VÆÃà¢ÅF&ÆT6VÆÂ6Æ74æÖSÒ'FW‡B×6ÒFW‡BÖf÷&Vw&÷VæB#ç¶2çF÷FÄ6öçG&7G7ÓÂõF&ÆT6VÆÃà¢ÅF&ÆT6VÆÃà¢Ç7â6Æ74æÖS×¶6â€¢&–æÆ–æRÖfÆW‚—FV×2Ö6VçFW"&÷VæFVBÖgVÆÂ‚Ó"’ÓãRFW‡B×‡2föçBÖÖVF—VÒ"À¢2æ†47F—fP¢ò&&r×F–çBÖw&VVâFW‡B×F–çBÖw&VVâÖf÷&Vw&÷VæB ¢¢&&rÖ×WFVBFW‡BÖ×WFVBÖf÷&Vw&÷VæB"À¢—Óà¢¶2æ†47F—fRò%–W2"¢$æò'Ð¢Â÷7ãà¢ÂõF&ÆT6VÆÃà¢ÅF&ÆT6VÆÂ6Æ74æÖS×¶6â€¢'FW‡B×6ÒföçBÖÖVF—VÒ"À¢2æ÷WG7FæF–ærâò'FW‡B×F–çB×&÷6RÖf÷&Vw&÷VæB"¢'FW‡BÖf÷&Vw&÷VæB"À¢—Óà¢TB¶2æ÷WG7FæF–ærçFôÆö6ÆU7G&–ær‚—Ð¢ÂõF&ÆT6VÆÃà¢ÅF&ÆT6VÆÂ6Æ74æÖSÒ'‚ÓRFW‡B×&–v‡B#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"§W7F–g’ÖVæBvÓ#à¢Ä'WGFöà¢6—¦SÒ'6Ò ¢f&–çCÒ&v†÷7B ¢6Æ74æÖSÒ&‚ÓrvÓFW‡B×‡2 ¢öä6Æ–6³×²‚’Óâ÷VäVF—B†2—Ð¢à¢ÅVæ6–Â6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óà¢VF—@¢Âô'WGFöãà¢Ä'WGFöà¢6—¦SÒ'6Ò ¢f&–çCÒ&v†÷7B ¢6Æ74æÖSÒ&‚ÓrrÓrÓFW‡BÖFW7G'V7F—fR†÷fW#§FW‡BÖFW7G'V7F—fR†÷fW#¦&rÖFW7G'V7F—fRó ¢öä6Æ–6³×²†R’Óâ°¢Rç7F÷&÷vF–öâ‚“°¢6WDFVÆWFUF&vWD–B†2æ–B“°¢6WDFVÆWFUF&vWDæÖR†2ægVÆÅöæÖR“°¢6WD6öæf—&ÔFVÆWFT÷Vâ‡G'VR“°¢×Ð¢à¢ÅG&6ƒ"6Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óà¢Âô'WGFöãà¢ÂöF—cà¢ÂõF&ÆT6VÆÃà¢ÂõF&ÆU&÷sà¢’¢—Ð¢ÂõF&ÆT&öG“à¢ÂõF&ÆSà¢ÄÆ—7Ev–æF–öà¢vS×·vWÐ¢vU6—¦S×·vU6—¦WÐ¢F÷FÃ×¶f–ÇFW&VBæÆVæwF‡Ð¢öåvT6†ævS×·6WEvWÐ¢öåvU6—¦T6†ævS×·6WEvU6—¦WÐ¢óà¢ÂöF—cà¢ÂöF—cà¢ÂôF6†&ö&DÆ–÷WCà¢“°§Ó° ¦W‡÷'BFVfVÇB6Æ–VçG3°