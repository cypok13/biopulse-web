'use server';

import { createServerClient } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

function toTitleCase(name: string): string {
  return name.trim().split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export async function deleteDocument(formData: FormData) {
  const documentId = formData.get('documentId') as string;
  const accountId = formData.get('accountId') as string;
  const supabase = createServerClient();

  // Проверяем что документ принадлежит аккаунту
  const { data: doc } = await supabase
    .from('documents')
    .select('id, account_id, storage_path')
    .eq('id', documentId)
    .eq('account_id', accountId)
    .single();

  if (!doc) return;

  // Удаляем readings
  await supabase.from('readings').delete().eq('document_id', documentId);

  // Удаляем из Storage
  if (doc.storage_path) {
    await supabase.storage.from('documents').remove([doc.storage_path]);
  }

  // Удаляем документ
  await supabase.from('documents').delete().eq('id', documentId);

  revalidatePath(`/d/${accountId}`);
  redirect(`/d/${accountId}`);
}

export async function deleteProfile(formData: FormData) {
  const profileId = formData.get('profileId') as string;
  const accountId = formData.get('accountId') as string;
  const supabase = createServerClient();

  // Проверяем что профиль принадлежит аккаунту
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, account_id')
    .eq('id', profileId)
    .eq('account_id', accountId)
    .single();

  if (!profile) return;

  // Удаляем readings → documents обновятся через ON DELETE SET NULL
  await supabase.from('readings').delete().eq('profile_id', profileId);
  await supabase.from('profiles').delete().eq('id', profileId);

  revalidatePath(`/d/${accountId}`);
  redirect(`/d/${accountId}`);
}

export async function renameProfile(formData: FormData) {
  const profileId = formData.get('profileId') as string;
  const accountId = formData.get('accountId') as string;
  const newName = formData.get('newName') as string;

  if (!newName?.trim()) return;

  const supabase = createServerClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, account_id')
    .eq('id', profileId)
    .eq('account_id', accountId)
    .single();

  if (!profile) return;

  const displayName = toTitleCase(newName);

  await supabase
    .from('profiles')
    .update({
      full_name: displayName,
      normalized_name: displayName.toLowerCase(),
    })
    .eq('id', profileId);

  revalidatePath(`/d/${accountId}`);
  revalidatePath(`/d/${accountId}/p/${profileId}`);
  redirect(`/d/${accountId}`);
}
