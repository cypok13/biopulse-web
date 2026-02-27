// ============================================
// Biopulse — Shared Types
// ============================================

// --- Database types ---

export interface Account {
  id: string;
  telegram_id: number;
  telegram_username: string | null;
  display_name: string | null;
  locale: 'ru' | 'en' | 'sr' | 'de';
  plan: 'free' | 'pro' | 'lifetime';
  plan_expires_at: string | null;
  monthly_uploads: number;
  monthly_uploads_reset_at: string;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  account_id: string;
  full_name: string;
  normalized_name: string;
  date_of_birth: string | null;
  sex: 'male' | 'female' | null;
  avatar_color: string;
  is_primary: boolean;
  created_at: string;
}

export interface Document {
  id: string;
  account_id: string;
  profile_id: string | null;
  storage_path: string;
  file_type: string;
  file_size: number | null;
  source: 'telegram' | 'web' | 'api';
  status: 'pending' | 'processing' | 'done' | 'error' | 'needs_review';
  error_message: string | null;
  raw_text: string | null;
  parsed_json: Record<string, unknown> | null;
  parsed_name: string | null;
  parsed_date: string | null;
  parsed_dob: string | null;
  parsed_sex: string | null;
  document_type: string | null;
  lab_name: string | null;
  language: string | null;
  is_partial: boolean;
  ai_model: string | null;
  ai_cost: number;
  ai_tokens_in: number;
  ai_tokens_out: number;
  processing_time_ms: number | null;
  created_at: string;
}

export interface Biomarker {
  id: string;
  canonical_name: string;
  display_name_en: string;
  display_name_ru: string | null;
  aliases: string[];
  category: string;
  unit_default: string | null;
  ref_range_male_min: number | null;
  ref_range_male_max: number | null;
  ref_range_female_min: number | null;
  ref_range_female_max: number | null;
  description_en: string | null;
  description_ru: string | null;
  sort_order: number;
}

export interface Reading {
  id: string;
  document_id: string;
  profile_id: string;
  biomarker_id: string | null;
  original_name: string;
  value: number;
  unit: string | null;
  ref_min: number | null;
  ref_max: number | null;
  flag: 'normal' | 'low' | 'high' | 'critical';
  tested_at: string;
  created_at: string;
}

// --- AI Parsing types ---

export interface ParsedLabResult {
  patient_name: string | null;
  test_date: string | null; // ISO date
  lab_name: string | null;
  language: string | null;
  document_type: 'blood' | 'biochemistry' | 'hormone' | 'microbiology' | 'urine' | 'other';
  patient_dob: string | null; // ISO date
  patient_sex: 'male' | 'female' | null;
  partial_result: boolean;
  readings: ParsedReading[];
  notes: string[];
}

export interface ParsedReading {
  name: string;          // как написано в документе
  value: number | string; // числовое или качественное значение
  value_numeric: boolean;
  unit: string | null;
  ref_min: number | null;
  ref_max: number | null;
  flag: 'normal' | 'low' | 'high' | 'critical' | 'needs_review' | 'abnormal';
}

// --- API Response types ---

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// --- Freemium ---

export const PLAN_LIMITS = {
  free: {
    uploads_per_month: 3,
    max_profiles: 2,
    export_pdf: false,
    priority_parsing: false,
  },
  pro: {
    uploads_per_month: Infinity,
    max_profiles: 10,
    export_pdf: true,
    priority_parsing: true,
  },
  lifetime: {
    uploads_per_month: Infinity,
    max_profiles: 20,
    export_pdf: true,
    priority_parsing: true,
  },
} as const;
