import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Account, Profile, Document } from '../../../shared/types';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service role для бота

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

// ============================================
// Accounts
// ============================================

export async function getOrCreateAccount(telegramId: number, username?: string, displayName?: string): Promise<Account> {
  const { data: existing } = await supabase
    .from('accounts')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (existing) {
    if (username && existing.telegram_username !== username) {
      await supabase
        .from('accounts')
        .update({ telegram_username: username })
        .eq('id', existing.id);
    }
    return existing as Account;
  }

  const { data: newAccount, error } = await supabase
    .from('accounts')
    .insert({
      telegram_id: telegramId,
      telegram_username: username || null,
      display_name: displayName || username || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create account: ${error.message}`);
  return newAccount as Account;
}

// ============================================
// Name normalization (profile deduplication)
// ============================================

// Транслитерация кириллицы → латиница для кросс-языкового матчинга
function transliterateCyrillicToLatin(str: string): string {
  const map: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  };
  return str.toLowerCase().split('').map(c => map[c] ?? c).join('');
}

// Умный ключ для матчинга: сортировка токенов + транслитерация
// "Krasnova Evgeniia" и "Evgeniia Krasnova" → одинаковый ключ
// "КРАСНОВА ЕВГЕНИЯ" → тот же ключ
export function smartNameKey(name: string): string {
  const latinized = transliterateCyrillicToLatin(name.toLowerCase().trim());
  // Убираем дефисы внутри двойных имён и нормализуем пробелы
  const cleaned = latinized.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = cleaned.split(' ').filter(t => t.length > 0).sort();
  return tokens.join(' ');
}

// Правильный Title Case ("КРАСНОВ АЛЕКСАНДР" → "Краснов Александр")
function toTitleCase(name: string): string {
  return name.trim().split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// Нормализация для backwards-compat
export function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

// ============================================
// Profiles
// ============================================

export async function findOrCreateProfile(accountId: string, fullName: string, locale?: string): Promise<Profile> {
  const smartKey = smartNameKey(fullName);

  // Загружаем все профили аккаунта и ищем совпадение по умному ключу
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('*')
    .eq('account_id', accountId);

  if (allProfiles) {
    // Шаг 1: точное совпадение по smart key
    for (const profile of allProfiles) {
      if (smartNameKey(profile.full_name) === smartKey) {
        return profile as Profile;
      }
    }

    // Шаг 2: нечёткое совпадение (обрабатывает варианты транслитерации Evgeniia/Evgeniya)
    const threshold = Math.max(2, Math.floor(smartKey.length * 0.2));
    let bestMatch: Profile | null = null;
    let bestDist = Infinity;
    for (const profile of allProfiles) {
      const existingKey = smartNameKey(profile.full_name);
      const dist = levenshtein(smartKey, existingKey);
      if (dist <= threshold && dist < bestDist) {
        bestDist = dist;
        bestMatch = profile as Profile;
      }
    }
    if (bestMatch) return bestMatch;
  }

  // Создаём новый профиль с правильным Title Case
  const displayName = toTitleCase(fullName);
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];
  const avatarColor = colors[Math.floor(Math.random() * colors.length)];
  const isPrimary = !allProfiles || allProfiles.length === 0;

  const { data: newProfile, error } = await supabase
    .from('profiles')
    .insert({
      account_id: accountId,
      full_name: displayName,
      normalized_name: normalizeName(fullName),
      avatar_color: avatarColor,
      is_primary: isPrimary,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create profile: ${error.message}`);
  return newProfile as Profile;
}

export async function getProfiles(accountId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('account_id', accountId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to get profiles: ${error.message}`);
  return (data || []) as Profile[];
}

// ============================================
// Documents
// ============================================

export async function createDocument(params: {
  accountId: string;
  storagePath: string;
  fileType: string;
  fileSize?: number;
  source?: string;
}): Promise<Document> {
  const { data, error } = await supabase
    .from('documents')
    .insert({
      account_id: params.accountId,
      storage_path: params.storagePath,
      file_type: params.fileType,
      file_size: params.fileSize || null,
      source: params.source || 'telegram',
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create document: ${error.message}`);
  return data as Document;
}

export async function updateDocument(id: string, updates: Partial<Document>): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .update(updates)
    .eq('id', id);

  if (error) throw new Error(`Failed to update document: ${error.message}`);
}

// ============================================
// Readings
// ============================================

export async function saveReadings(readings: Array<{
  document_id: string;
  profile_id: string;
  biomarker_id?: string;
  original_name: string;
  value: number | null;
  value_text?: string | null;
  is_qualitative?: boolean;
  unit?: string;
  ref_min?: number;
  ref_max?: number;
  flag: string;
  tested_at: string;
}>): Promise<void> {
  if (readings.length === 0) return;

  const { error } = await supabase
    .from('readings')
    .insert(readings);

  if (error) throw new Error(`Failed to save readings: ${error.message}`);
}

// ============================================
// Biomarker matching — fuzzy + cross-language
// ============================================

type BiomarkerMatch = {
  id: string;
  canonical_name: string;
  unit_default: string | null;
};

let biomarkersCache: Array<{
  id: string;
  canonical_name: string;
  display_name_en: string;
  display_name_ru: string | null;
  aliases: string[];
  unit_default: string | null;
}> | null = null;

// Расстояние Левенштейна для нечёткого матчинга
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

// Нормализация названия биомаркера (убираем спецсимволы, единицы и т.д.)
function normalizeBiomarkerName(name: string): string {
  return transliterateCyrillicToLatin(name.toLowerCase())
    .replace(/[()[\]/\\*.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function matchBiomarker(originalName: string): Promise<BiomarkerMatch | null> {
  if (!biomarkersCache) {
    const { data } = await supabase
      .from('biomarkers')
      .select('id, canonical_name, display_name_en, display_name_ru, aliases, unit_default');
    biomarkersCache = data || [];
  }

  const normalizedInput = normalizeBiomarkerName(originalName);

  // Шаг 1: точное совпадение
  for (const bm of biomarkersCache) {
    if (normalizeBiomarkerName(bm.canonical_name) === normalizedInput) {
      return { id: bm.id, canonical_name: bm.canonical_name, unit_default: bm.unit_default };
    }
    if (bm.display_name_en && normalizeBiomarkerName(bm.display_name_en) === normalizedInput) {
      return { id: bm.id, canonical_name: bm.canonical_name, unit_default: bm.unit_default };
    }
    if (bm.display_name_ru && normalizeBiomarkerName(bm.display_name_ru) === normalizedInput) {
      return { id: bm.id, canonical_name: bm.canonical_name, unit_default: bm.unit_default };
    }
    for (const alias of (bm.aliases || [])) {
      if (normalizeBiomarkerName(alias) === normalizedInput) {
        return { id: bm.id, canonical_name: bm.canonical_name, unit_default: bm.unit_default };
      }
    }
  }

  // Шаг 2: нечёткое совпадение (Левенштейн) — только для коротких имён
  if (normalizedInput.length >= 4) {
    let bestMatch: BiomarkerMatch | null = null;
    let bestScore = Infinity;
    const threshold = Math.max(2, Math.floor(normalizedInput.length * 0.2)); // 20% расстояние

    for (const bm of biomarkersCache) {
      const candidates = [
        normalizeBiomarkerName(bm.canonical_name),
        normalizeBiomarkerName(bm.display_name_en),
        ...(bm.aliases || []).map(normalizeBiomarkerName),
      ].filter(Boolean);

      for (const candidate of candidates) {
        if (Math.abs(candidate.length - normalizedInput.length) > threshold + 2) continue;
        const dist = levenshtein(normalizedInput, candidate);
        if (dist <= threshold && dist < bestScore) {
          bestScore = dist;
          bestMatch = { id: bm.id, canonical_name: bm.canonical_name, unit_default: bm.unit_default };
        }
      }
    }

    if (bestMatch) return bestMatch;
  }

  return null;
}

// ============================================
// Unit conversion
// ============================================

// Таблица конвертации: из каких единиц в canonical unit (unit_default биомаркера)
// factor: умножить значение на factor чтобы получить canonical unit
const UNIT_CONVERSION_MAP: Record<string, Record<string, number>> = {
  // Гемоглобин — canonical: g/dL
  'g/l':    { 'g/dl': 0.1,   'g/dL': 0.1  },
  'г/л':    { 'g/dl': 0.1,   'g/dL': 0.1  },
  'g/dl':   { 'g/dl': 1,     'g/dL': 1    },
  // Глюкоза, холестерин — canonical: mmol/L
  'mg/dl':  { 'mmol/l': 1/18.0182, 'mmol/L': 1/18.0182 },
  'мг/дл':  { 'mmol/l': 1/18.0182, 'mmol/L': 1/18.0182 },
  // Крeatinine, urea — canonical: µmol/L (creatinine) или mmol/L (urea)
  'mg/dl-creatinine': { 'umol/l': 88.402, 'µmol/L': 88.402 },
  'mg/dl-urea':       { 'mmol/l': 0.357,  'mmol/L': 0.357  },
  // Железо — canonical: µmol/L
  'µg/dl':  { 'umol/l': 0.1791, 'µmol/L': 0.1791 },
  'мкг/дл': { 'umol/l': 0.1791, 'µmol/L': 0.1791 },
  // Билирубин — canonical: µmol/L
  'mg/dl-bilirubin': { 'umol/l': 17.104, 'µmol/L': 17.104 },
};

// Нормализация строки единицы измерения
function normalizeUnit(unit: string): string {
  return unit.toLowerCase().trim()
    .replace('μ', 'µ')
    .replace('мкмоль', 'µmol')
    .replace('ммоль', 'mmol')
    .replace('мг', 'mg');
}

export function convertToCanonicalUnit(
  value: number,
  fromUnit: string,
  canonicalUnit: string,
  biomarkerCanonical?: string,
): { value: number; unit: string } {
  const normFrom = normalizeUnit(fromUnit);
  const normTo = normalizeUnit(canonicalUnit);

  if (normFrom === normTo) return { value, unit: canonicalUnit };

  // Пробуем прямой перевод
  const directMap = UNIT_CONVERSION_MAP[normFrom];
  if (directMap && directMap[normTo] !== undefined) {
    return { value: Math.round(value * directMap[normTo] * 10000) / 10000, unit: canonicalUnit };
  }

  // Пробуем перевод через любой из синонимов canonical unit
  for (const [from, toMap] of Object.entries(UNIT_CONVERSION_MAP)) {
    if (from === normFrom) {
      for (const [to, factor] of Object.entries(toMap)) {
        if (normalizeUnit(to) === normTo) {
          return { value: Math.round(value * factor * 10000) / 10000, unit: canonicalUnit };
        }
      }
    }
  }

  // Не нашли конвертацию — возвращаем как есть
  return { value, unit: fromUnit };
}

// ============================================
// Upload limits check
// ============================================

export async function checkUploadLimit(account: Account): Promise<{ allowed: boolean; remaining: number }> {
  const { PLAN_LIMITS } = await import('../../../shared/types');
  const limits = PLAN_LIMITS[account.plan as keyof typeof PLAN_LIMITS];

  if (limits.uploads_per_month === Infinity) {
    return { allowed: true, remaining: Infinity };
  }

  // Сброс ежемесячного счётчика если нужно
  if (new Date(account.monthly_uploads_reset_at) <= new Date()) {
    await supabase
      .from('accounts')
      .update({
        monthly_uploads: 0,
        monthly_uploads_reset_at: new Date(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          1
        ).toISOString(),
      })
      .eq('id', account.id);
    account.monthly_uploads = 0;
  }

  const remaining = limits.uploads_per_month - account.monthly_uploads;
  return { allowed: remaining > 0, remaining: Math.max(0, remaining) };
}

export async function incrementUploadCount(accountId: string, currentCount: number): Promise<void> {
  await supabase
    .from('accounts')
    .update({ monthly_uploads: currentCount + 1 })
    .eq('id', accountId);
}
