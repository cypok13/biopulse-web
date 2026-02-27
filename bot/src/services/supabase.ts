import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Account, Profile, Document } from '../../../shared/types';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service role для бота

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

// ============================================
// Accounts
// ============================================

export async function getOrCreateAccount(telegramId: number, username?: string, displayName?: string): Promise<Account> {
  // Попробуем найти существующий аккаунт
  const { data: existing } = await supabase
    .from('accounts')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (existing) {
    // Обновим username если изменился
    if (username && existing.telegram_username !== username) {
      await supabase
        .from('accounts')
        .update({ telegram_username: username })
        .eq('id', existing.id);
    }
    return existing as Account;
  }

  // Создаём новый аккаунт
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
// Profiles
// ============================================

export function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

export async function findOrCreateProfile(accountId: string, fullName: string): Promise<Profile> {
  const normalized = normalizeName(fullName);

  // Ищем существующий профиль
  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('account_id', accountId)
    .eq('normalized_name', normalized)
    .single();

  if (existing) return existing as Profile;

  // Генерируем случайный цвет для аватара
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];
  const avatarColor = colors[Math.floor(Math.random() * colors.length)];

  // Считаем существующие профили
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact' })
    .eq('account_id', accountId);

  const isPrimary = (count || 0) === 0; // первый профиль = основной

  const { data: newProfile, error } = await supabase
    .from('profiles')
    .insert({
      account_id: accountId,
      full_name: fullName.trim(),
      normalized_name: normalized,
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
  value: number;
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
// Biomarkers matching
// ============================================

let biomarkersCache: Array<{ id: string; canonical_name: string; aliases: string[] }> | null = null;

export async function matchBiomarker(originalName: string): Promise<string | null> {
  if (!biomarkersCache) {
    const { data } = await supabase
      .from('biomarkers')
      .select('id, canonical_name, aliases');
    biomarkersCache = data || [];
  }

  const normalizedInput = originalName.toLowerCase().trim();

  for (const bm of biomarkersCache) {
    // Проверяем canonical_name
    if (bm.canonical_name === normalizedInput) return bm.id;

    // Проверяем aliases
    for (const alias of bm.aliases) {
      if (alias.toLowerCase() === normalizedInput) return bm.id;
    }
  }

  return null;
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
