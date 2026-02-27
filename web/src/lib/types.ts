export interface Account {
  id: string;
  telegram_id: number;
  telegram_username: string | null;
  display_name: string | null;
  locale: string;
  plan: "free" | "pro" | "lifetime";
  plan_expires_at: string | null;
  monthly_uploads: number;
  created_at: string;
}

export interface Profile {
  id: string;
  account_id: string;
  full_name: string;
  normalized_name: string;
  date_of_birth: string | null;
  sex: "male" | "female" | null;
  avatar_color: string;
  is_primary: boolean;
  created_at: string;
}

export interface Document {
  id: string;
  account_id: string;
  profile_id: string | null;
  status: string;
  parsed_name: string | null;
  parsed_date: string | null;
  lab_name: string | null;
  language: string | null;
  ai_model: string | null;
  document_type: string | null;
  created_at: string;
}

export interface Reading {
  id: string;
  document_id: string;
  profile_id: string;
  biomarker_id: string | null;
  original_name: string;
  value: number | null;
  value_text: string | null;
  is_qualitative: boolean;
  unit: string | null;
  ref_min: number | null;
  ref_max: number | null;
  flag: string;
  tested_at: string;
}

export interface Biomarker {
  id: string;
  canonical_name: string;
  display_name_en: string;
  display_name_ru: string | null;
  category: string;
  unit_default: string | null;
}

// Reading joined with biomarker info
export interface ReadingWithBiomarker extends Reading {
  biomarkers: Biomarker | null;
}

// Grouped readings for charts
export interface BiomarkerTimeline {
  name: string;
  canonical: string;
  category: string;
  unit: string;
  ref_min: number | null;
  ref_max: number | null;
  points: Array<{
    date: string;
    value: number;
    flag: string;
  }>;
}

export const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  blood: { label: "Общий анализ крови", icon: "🩸", color: "#ef4444" },
  metabolic: { label: "Метаболизм", icon: "⚡", color: "#f59e0b" },
  lipid: { label: "Липидный профиль", icon: "🫀", color: "#06b6d4" },
  hormone: { label: "Гормоны", icon: "🧬", color: "#8b5cf6" },
  vitamin: { label: "Витамины", icon: "💊", color: "#10b981" },
  mineral: { label: "Минералы", icon: "🪨", color: "#14b8a6" },
  liver: { label: "Печень", icon: "🫁", color: "#d97706" },
  kidney: { label: "Почки", icon: "🫘", color: "#7c3aed" },
  inflammation: { label: "Воспаление", icon: "🔥", color: "#dc2626" },
  other: { label: "Другое", icon: "📋", color: "#64748b" },
};

export const PLAN_LIMITS = {
  free: { uploads_per_month: 3, max_profiles: 2 },
  pro: { uploads_per_month: Infinity, max_profiles: 10 },
  lifetime: { uploads_per_month: Infinity, max_profiles: 20 },
} as const;
