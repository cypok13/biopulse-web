// /app/d/[accountId]/p/[profileId]/page.tsx
// Страница профиля — графики динамики биомаркеров

import { createServerClient } from '@/lib/supabase';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({
  params,
}: {
  params: { accountId: string; profileId: string };
}) {
  const supabase = createServerClient();

  // Получаем профиль
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', params.profileId)
    .eq('account_id', params.accountId)
    .single();

  if (!profile) notFound();

  // Получаем все readings для профиля с biomarker info
  const { data: readings } = await supabase
    .from('readings')
    .select(`
      *,
      biomarkers:biomarker_id (
        canonical_name,
        display_name_en,
        display_name_ru,
        category,
        unit_default
      )
    `)
    .eq('profile_id', params.profileId)
    .order('tested_at', { ascending: true });

  // Группируем readings по биомаркеру для графиков
  const groupedReadings: Record<string, Array<{
    date: string;
    value: number;
    unit: string;
    flag: string;
    ref_min: number | null;
    ref_max: number | null;
    biomarker_name: string;
    category: string;
  }>> = {};

  for (const r of readings || []) {
    const key = (r as any).biomarkers?.canonical_name || r.original_name;
    if (!groupedReadings[key]) groupedReadings[key] = [];
    groupedReadings[key].push({
      date: r.tested_at,
      value: r.value,
      unit: r.unit || (r as any).biomarkers?.unit_default || '',
      flag: r.flag,
      ref_min: r.ref_min,
      ref_max: r.ref_max,
      biomarker_name: (r as any).biomarkers?.display_name_ru || (r as any).biomarkers?.display_name_en || r.original_name,
      category: (r as any).biomarkers?.category || 'other',
    });
  }

  // Группируем по категориям
  const categories: Record<string, string[]> = {};
  for (const [name, data] of Object.entries(groupedReadings)) {
    const cat = data[0]?.category || 'other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(name);
  }

  const categoryLabels: Record<string, string> = {
    blood: '🩸 Общий анализ крови',
    metabolic: '⚡ Метаболизм',
    lipid: '🫀 Липиды',
    hormone: '🧬 Гормоны',
    vitamin: '💊 Витамины',
    mineral: '🪨 Минералы',
    liver: '🫁 Печень',
    kidney: '🫘 Почки',
    inflammation: '🔥 Воспаление',
    other: '📋 Другое',
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <a href={`/d/${params.accountId}`} className="text-gray-500 hover:text-gray-300">
            ← Назад
          </a>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: profile.avatar_color }}
          >
            {profile.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-lg font-bold">{profile.full_name}</h1>
            <p className="text-xs text-gray-500">
              {Object.values(groupedReadings).flat().length} показателей · 
              {new Set((readings || []).map((r: any) => r.tested_at)).size} анализов
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {Object.entries(categories).map(([cat, biomarkerNames]) => (
          <section key={cat} className="mb-10">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
              {categoryLabels[cat] || cat}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {biomarkerNames.map((name) => {
                const data = groupedReadings[name];
                const latest = data[data.length - 1];
                const isAbnormal = latest?.flag !== 'normal';

                return (
                  <div
                    key={name}
                    className={`bg-gray-900 border rounded-xl p-4 ${
                      isAbnormal ? 'border-red-800/50' : 'border-gray-800'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-semibold text-sm">{latest.biomarker_name}</div>
                        <div className="text-xs text-gray-500">{latest.unit}</div>
                      </div>
                      <div className={`text-xl font-bold ${
                        latest.flag === 'high' ? 'text-red-400' :
                        latest.flag === 'low' ? 'text-blue-400' :
                        latest.flag === 'critical' ? 'text-red-500' :
                        'text-green-400'
                      }`}>
                        {latest.value}
                        {latest.flag === 'high' && ' ↑'}
                        {latest.flag === 'low' && ' ↓'}
                      </div>
                    </div>

                    {/* Mini sparkline placeholder — будет Recharts компонент */}
                    {data.length > 1 && (
                      <div className="mt-2 flex items-end gap-1 h-8">
                        {data.map((d, i) => {
                          const min = Math.min(...data.map(x => x.value));
                          const max = Math.max(...data.map(x => x.value));
                          const range = max - min || 1;
                          const height = ((d.value - min) / range) * 100;
                          return (
                            <div
                              key={i}
                              className={`flex-1 rounded-sm ${
                                d.flag !== 'normal' ? 'bg-red-500/40' : 'bg-cyan-500/40'
                              }`}
                              style={{ height: `${Math.max(10, height)}%` }}
                              title={`${d.date}: ${d.value}`}
                            />
                          );
                        })}
                      </div>
                    )}

                    {/* Ref range indicator */}
                    {latest.ref_min != null && latest.ref_max != null && (
                      <div className="mt-2 text-xs text-gray-600">
                        Норма: {latest.ref_min} — {latest.ref_max}
                      </div>
                    )}

                    <div className="mt-1 text-xs text-gray-600">
                      {data.length} измерений · последнее: {latest.date}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {Object.keys(groupedReadings).length === 0 && (
          <div className="text-center py-16 text-gray-500">
            Нет данных. Отправь анализы в Telegram-бот! 📸
          </div>
        )}
      </main>
    </div>
  );
}
