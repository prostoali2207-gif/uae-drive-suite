import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Each pair was independently confirmed by joining the traffic-fines Excel
// (المخالفات_المرورية_export_1793281552930.xlsx, supplied 2026-10-29)
// to FleetDesk fines by exact fine number: 24 matches, eight specific types.
// The generic "مخالفات خارجية" is intentionally excluded.
const confirmedPairs: ReadonlyArray<readonly [string, string]> = [
  ["Exceeding maximum speed limit by no more than 20km/hr", "تجاوز الحد الاقصى للسرعة المقررة بما لا يزيد عن 20 كم / ساعة ."],
  ["Exceeding maximum speed limit by no more than 30km/hr", "تجاوز الحد الاقصى للسرعة المقررة بما لا يزيد عن 30 كم / ساعة ."],
  ["Exceeding maximum speed limit by no more than 50km/hr", "تجاوز الحد الأقصى للسرعة المقررة بما لا يزيد عن 50 كم / ساعة ."],
  ["Driving at night without lights", "السير ليلاً دون استعمال الأنوار ."],
  ["Non-compliance with the traffic compulsory lane for light vehicles", "عدم التزام المركبة الخفيفية بخط السير الإلزامي ."],
  ["Distracted driving caused by mobile phones", "الانشغال عن الطريق أثناء قيادة المركبة باستعمال الهاتف ."],
  ["Tailgating (no enough Distance to the car in front of you)", "عدم ترك مسافة كافية خلف المركبات الأمامية ."],
  ["Light vehicles jumping the red signal", "تجاوز الإشارة الضوئية الحمراء من قبل المركبات الخفيفية ."],
];

export const normalizeFineEnglish = (value: string): string =>
  value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

const confirmedByEnglish = new Map(confirmedPairs.map(([en, ar]) => [normalizeFineEnglish(en), ar]));

export const getConfirmedArabicDescription = (english: string | null | undefined): string =>
  english ? confirmedByEnglish.get(normalizeFineEnglish(english)) ?? "" : "";

export const isArabicFineDescription = (value: string): boolean => {
  const text = value.trim();
  return text.length > 0 && /[\u0600-\u06FF]/u.test(text) && !/[A-Za-z]/.test(text);
};

type TranslationRow = {
  id: string;
  owner_id: string;
  english_name: string;
  english_key: string;
  arabic_name: string;
  created_at: string;
  updated_at: string;
};
type TranslationDatabase = {
  public: {
    Tables: {
      fine_violation_translations: {
        Row: TranslationRow;
        Insert: Pick<TranslationRow, "owner_id" | "english_name" | "english_key" | "arabic_name">;
        Update: Partial<Pick<TranslationRow, "english_name" | "arabic_name" | "updated_at">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
const client = supabase as unknown as SupabaseClient<TranslationDatabase>;

export async function loadSavedArabicDescription(english: string): Promise<string | null> {
  if (!english.trim()) return null;
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("Session expired. Sign in again.");
  const { data, error } = await client.from("fine_violation_translations")
    .select("arabic_name")
    .eq("owner_id", authData.user.id)
    .eq("english_key", normalizeFineEnglish(english))
    .maybeSingle();
  if (error) throw new Error(`Could not load Arabic fine description: ${error.message}`);
  return data?.arabic_name ?? null;
}

export async function saveArabicDescription(english: string, arabic: string): Promise<void> {
  if (!english.trim() || !isArabicFineDescription(arabic)) {
    throw new Error("Enter the official Arabic violation description.");
  }
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("Session expired. Sign in again.");
  const { error } = await client.from("fine_violation_translations").upsert({
    owner_id: authData.user.id,
    english_name: english.trim(),
    english_key: normalizeFineEnglish(english),
    arabic_name: arabic.trim(),
  }, { onConflict: "owner_id,english_key" });
  if (error) throw new Error(`Could not save Arabic fine description: ${error.message}`);
}
