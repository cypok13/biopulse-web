// /app/d/[accountId]/page.tsx
// Dashboard page — профили и показатели
// Доступ по ссылке из Telegram-бота: /d/{accountId}

import { createServerClient } from '@/lib/supabase';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

// TODO: При подключении auth — заменить на проверку сессии
// Пока доступ по account ID (из Telegram-бота)

export default async function DashboardPage({
  params,
}: {
  params: { accountId: string };
}) {
  const supabase = createServerClient();

  // Получаем аккаунт
  const { data: account } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', params.accountId)
    .single();

  if (!account) notFound();

  // Получаем профили
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .eq('account_id', params.accountId)
    .order('is_primary', { ascending: false });

  // Получаем последние документы
  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('account_id', params.accountId)
    .eq('status', 'done')
    .order('parsed_date', { ascending: false })
    .limit(20);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
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
          <div className="flex gap-3 overflow-x-auto pb-2">
            {(profiles || []).map((profile: any) => (
              <a
                key={profile.id}
                href={`/d/${params.accountId}/p/${profile.id}`}
                className="flex-shrink-0 flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 hover:border-cyan-600 transition-colors"
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
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
          <div className="space-y-3">
            {(documents || []).map((doc: any) => (
              <div
                key={doc.id}
                className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium text-sm">
                    {doc.parsed_name || 'Неизвестный пациент'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {doc.parsed_date || '—'} · {doc.lab_name || 'Лаборатория не определена'} · {doc.ai_model}
                  </div>
                </div>
                <div className="text-xs text-gray-600">
                  {doc.language?.toUpperCase()}
                </div>
              </div>
            ))}
            {(!documents || documents.length === 0) && (
              <div className="text-gray-500 text-sm text-center py-8">
                Здесь появятся загруженные анализы.<br/>
                Отправь фото или PDF в Telegram-бот! 📸
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
