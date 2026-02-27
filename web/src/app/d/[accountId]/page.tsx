// /app/d/[accountId]/page.tsx
import { createServerClient } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import { deleteProfile, renameProfile } from '@/app/actions';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

const DOC_TYPE_LABELS: Record<string, string> = {
  blood: '🩸 Кровь',
  biochemistry: '⚗️ Биохимия',
  hormone: '🧬 Гормоны',
  microbiology: '🦠 Микробиология',
  urine: '🧪 Моча',
  other: '📋 Другое',
};

export default async function DashboardPage({
  params,
}: {
  params: { accountId: string };
}) {
  const supabase = createServerClient();

  const { data: account } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', params.accountId)
    .single();

  if (!account) notFound();

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .eq('account_id', params.accountId)
    .order('is_primary', { ascending: false });

  const { data: documents } = await supabase
    .from('documents')
    .select('id, parsed_name, parsed_date, lab_name, language, ai_model, document_type, profile_id')
    .eq('account_id', params.accountId)
    .eq('status', 'done')
    .order('parsed_date', { ascending: false })
    .limit(30);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🫀</span>
            <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
              Biopulse
            </h1>
          </div>
          <div className="text-sm text-gray-500">
            {account.display_name || account.telegram_username}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Profiles */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Профили
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 flex-wrap">
            {(profiles || []).map((profile: any) => (
              <div key={profile.id} className="flex-shrink-0 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors">
                <a
                  href={`/d/${params.accountId}/p/${profile.id}`}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                    style={{ backgroundColor: profile.avatar_color }}
                  >
                    {profile.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{profile.full_name}</div>
                    <div className="text-xs text-gray-500">
                      {profile.is_primary ? '⭐ Основной' : 'Член семьи'}
                    </div>
                  </div>
                </a>
                {/* Управление профилем */}
                <div className="border-t border-gray-800 px-3 py-2 flex gap-2">
                  <details className="flex-1">
                    <summary className="text-xs text-gray-600 hover:text-gray-400 cursor-pointer select-none">
                      ✏️ Переименовать
                    </summary>
                    <form action={renameProfile} className="mt-2 flex gap-2">
                      <input type="hidden" name="profileId" value={profile.id} />
                      <input type="hidden" name="accountId" value={params.accountId} />
                      <input
                        type="text"
                        name="newName"
                        defaultValue={profile.full_name}
                        className="flex-1 text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-cyan-600"
                        placeholder="Имя Фамилия"
                      />
                      <button type="submit" className="text-xs px-2 py-1 bg-cyan-700 hover:bg-cyan-600 rounded text-white">
                        ✓
                      </button>
                    </form>
                  </details>
                  <form action={deleteProfile} onSubmit={undefined}>
                    <input type="hidden" name="profileId" value={profile.id} />
                    <input type="hidden" name="accountId" value={params.accountId} />
                    <ConfirmButton
                      message={`Удалить профиль "${profile.full_name}" и все его анализы?`}
                      className="text-xs text-gray-700 hover:text-red-500 transition-colors"
                      title="Удалить профиль"
                    >
                      🗑
                    </ConfirmButton>
                  </form>
                </div>
              </div>
            ))}
            {(!profiles || profiles.length === 0) && (
              <div className="text-gray-500 text-sm">
                Профили создадутся автоматически при загрузке первого анализа
              </div>
            )}
          </div>
        </section>

        {/* Recent documents */}
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Последние анализы
          </h2>
          <div className="space-y-2">
            {(documents || []).map((doc: any) => (
              <a
                key={doc.id}
                href={`/d/${params.accountId}/doc/${doc.id}`}
                className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center justify-between hover:border-gray-700 hover:bg-gray-900/80 transition-all group"
              >
                <div>
                  <div className="font-medium text-sm group-hover:text-cyan-400 transition-colors">
                    {doc.parsed_name || 'Неизвестный пациент'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {doc.parsed_date || '—'} · {doc.lab_name || 'Лаборатория не определена'}
                    {doc.document_type && doc.document_type !== 'other' && ` · ${DOC_TYPE_LABELS[doc.document_type] || doc.document_type}`}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-xs text-gray-600">{doc.language?.toUpperCase()}</div>
                  <div className="text-gray-700 group-hover:text-gray-500 transition-colors">→</div>
                </div>
              </a>
            ))}
            {(!documents || documents.length === 0) && (
              <div className="text-gray-500 text-sm text-center py-8">
                Здесь появятся загруженные анализы.<br/>
                Отправь фото или PDF в @biopulse_lab_bot! 📸
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
