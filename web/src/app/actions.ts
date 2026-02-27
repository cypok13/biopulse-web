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

  const { data: doc } = await supabase
    .from('documents')
    .select('id, account_id, storage_path, profile_id')
    .eq('id', documentId)
    .eq('account_id', accountId)
    .single();

  if (!doc) return;

  if (doc.storage_path) {
    await supabase.storage.from('documents').remove([doc.storage_path]);
  }

  // readings удалятся каскадно (ON DELETE CASCADE)
  await supabase.from('documents').delete().eq('id', documentId);

  // Если у профиля больше нет документов — удаляем профиль
  if (doc.profile_id) {
    const { count } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', doc.profile_id);

    if ((count || 0) === 0) {
      await supabase.from('profiles').delete().eq('id', doc.profile_id);
    }
  }

  revalidatePath(`/d/${accountId}`);
  redirect(`/d/${accountId}`);
}

export async function deleteProfile(formData: FormData) {
  const profileId = formData.get('profileId') as string;
  const accountId = formData.get('accountId') as string;
  const supabase = createServerClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, account_id')
    .eq('id', profileId)
    .eq('account_id', accountId)
    .single();

  if (!profile) return;

  // Получаем все документы профиля для удаления из Storage
  const { data: docs } = await supabase
    .from('documents')
    .select('id, storage_path')
    .eq('profile_id', profileId);

  const storagePaths = (docs || []).map(d => d.storage_path).filter(Boolean) as string[];
  if (storagePaths.length > 0) {
    await supabase.storage.from('documents').remove(storagePaths);
  }

  // Удаляем документы (readings каскадируются через ON DELETE CASCADE)
  if ((docs || []).length > 0) {
    await supabase.from('documents').delete().in('id', docs!.map(d => d.id));
  }

  // Удаляем профиль (оставшиеся readings каскадируются через ON DELETE CASCADE)
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
