// /app/d/[accountId]/p/[profileId]/page.tsx
import { createServerClient } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import { deleteProfile } from '@/app/actions';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

const CATEGORY_LABELS_RU: Record<string, string> = {
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

const CATEGORY_LABELS_EN: Record<string, string> = {
  blood: '🩸 Blood Count',
  metabolic: '⚡ Metabolic',
  lipid: '🫀 Lipids',
  hormone: '🧬 Hormones',
  vitamin: '💊 Vitamins',
  mineral: '🪨 Minerals',
  liver: '🫁 Liver',
  kidney: '🫘 Kidney',
  inflammation: '🔥 Inflammation',
  other: '📋 Other',
};

export default async function ProfilePage({
  params,
}: {
  params: { accountId: string; profileId: string };
}) {
  const supabase = createServerClient();

  const [{ data: profile }, { data: account }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', params.profileId).eq('account_id', params.accountId).single(),
    supabase.from('accounts').select('locale').eq('id', params.accountId).single(),
  ]);

  if (!profile) notFound();

  const locale: string = (account as any)?.locale || 'ru';
  const categoryLabels = locale === 'ru' ? CATEGORY_LABELS_RU : CATEGORY_LABELS_EN;

  const { data: readings } = await supabase
    .from('readings')
    .select(`
      *,
      biomarkers:biomarker_id (
        canonical_name,
        display_name_en,
        display_name_ru,
        category,
        unit_default,
        ref_range_male_min,
        ref_range_male_max,
        ref_range_female_min,
        ref_range_female_max
      )
    `)
    .eq('profile_id', params.profileId)
    .order('tested_at', { ascending: true });

  // Группируем readings по биомаркеру
  // Ключ: canonical_name если есть биомаркер, иначе нормализованное original_name
  const groupedReadings: Record<string, Array<{
    id: string;
    date: string;
    value: number | null;
    value_text: string | null;
    is_qualitative: boolean;
    unit: string;
    flag: string;
    ref_min: number | null;
    ref_max: number | null;
    biomarker_name: string;
    original_name: string;
    category: string;
  }>> = {};

  for (const r of readings || []) {
    const bm = (r as any).biomarkers;
    // Для неизвестных биомаркеров группируем по нормализованному original_name
    const key = bm?.canonical_name || r.original_name.toLowerCase().trim();
    if (!groupedReadings[key]) groupedReadings[key] = [];

    // Fallback ref ranges from biomarker table if lab didn't provide them
    const sex = (profile as any)?.sex as string | null;
    const effectiveRefMin = r.ref_min ??
      (sex === 'male' ? bm?.ref_range_male_min : bm?.ref_range_female_min) ??
      bm?.ref_range_female_min ?? bm?.ref_range_male_min ?? null;
    const effectiveRefMax = r.ref_max ??
      (sex === 'male' ? bm?.ref_range_male_max : bm?.ref_range_female_max) ??
      bm?.ref_range_female_max ?? bm?.ref_range_male_max ?? null;

    // Locale-aware biomarker display name
    const biomarker_name = locale === 'ru'
      ? (bm?.display_name_ru || bm?.display_name_en || r.original_name)
      : (bm?.display_name_en || bm?.display_name_ru || r.original_name);

    groupedReadings[key].push({
      id: r.id,
      date: r.tested_at,
      value: r.value,
      value_text: r.value_text,
      is_qualitative: r.is_qualitative,
      unit: r.unit || bm?.unit_default || '',
      flag: r.flag,
      ref_min: effectiveRefMin,
      ref_max: effectiveRefMax,
      biomarker_name,
      original_name: r.original_name,
      category: bm?.category || 'other',
    });
  }

  // Разделяем на числовые и качественные группы
  const numericGroups: typeof groupedReadings = {};
  const qualGroups: typeof groupedReadings = {};

  for (const [key, data] of Object.entries(groupedReadings)) {
    const hasNumeric = data.some(d => !d.is_qualitative && d.value !== null);
    if (hasNumeric) {
      numericGroups[key] = data.filter(d => !d.is_qualitative && d.value !== null);
    } else {
      qualGroups[key] = data;
    }
  }

  // Группируем числовые по категориям
  const categories: Record<string, string[]> = {};
  for (const [key, data] of Object.entries(numericGroups)) {
    const cat = data[0]?.category || 'other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(key);
  }

  const totalReadings = Object.values(groupedReadings).flat().length;
  const totalTests = new Set((readings || []).map((r: any) => r.tested_at)).size;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <a href={`/d/${params.accountId}`} className="text-gray-500 hover:text-gray-300 text-sm">
            ← Назад
          </a>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
            style={{ backgroundColor: profile.avatar_color }}
          >
            {profile.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold">{profile.full_name}</h1>
            <p className="text-xs text-gray-500">
              {totalReadings} показателей · {totalTests} анализов
            </p>
          </div>
          <form action={deleteProfile}>
            <input type="hidden" name="profileId" value={params.profileId} />
            <input type="hidden" name="accountId" value={params.accountId} />
            <ConfirmButton
              message={`Удалить профиль "${profile.full_name}"?`}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-900/50 text-red-600 hover:bg-red-900/20 hover:text-red-400 transition-colors"
            >
              🗑 Удалить профиль
            </ConfirmButton>
          </form>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Числовые биомаркеры по категориям */}
        {Object.entries(categories).map(([cat, biomarkerKeys]) => (
          <section key={cat} className="mb-10">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
              {categoryLabels[cat] || cat}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {biomarkerKeys.map((key) => {
                const data = numericGroups[key];
                const latest = data[data.length - 1];
                const isAbnormal = latest?.flag !== 'normal';
                const bioKey = encodeURIComponent(key);

                return (
                  <a
                    key={key}
                    href={`/d/${params.accountId}/p/${params.profileId}/b/${bioKey}`}
                    className={`block bg-gray-900 border rounded-xl p-4 hover:border-gray-600 transition-all group ${
                      isAbnormal ? 'border-red-800/50 hover:border-red-700/50' : 'border-gray-800'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-semibold text-sm group-hover:text-cyan-400 transition-colors">
                          {latest.biomarker_name}
                        </div>
                        <div className="text-xs text-gray-500">{latest.unit}</div>
                      </div>
                      <div className={`text-xl font-bold ${
                        latest.flag === 'high' || latest.flag === 'critical' ? 'text-red-400' :
                        latest.flag === 'low' ? 'text-blue-400' :
                        latest.flag === 'abnormal' ? 'text-orange-400' :
                        'text-green-400'
                      }`}>
                        {latest.value}
                        {latest.flag === 'high' && ' ↑'}
                        {latest.flag === 'low' && ' ↓'}
                      </div>
                    </div>

                    {/* Мини-спарклайн */}
                    {data.length > 1 && (
                      <div className="mt-2 flex items-end gap-0.5 h-8">
                        {data.map((d, i) => {
                          const vals = data.map(x => x.value as number);
                          const min = Math.min(...vals);
                          const max = Math.max(...vals);
                          const range = max - min || 1;
                          const height = (((d.value as number) - min) / range) * 100;
                          return (
                            <div
                              key={i}
                              className={`flex-1 rounded-sm transition-colors ${
                                d.flag !== 'normal' ? 'bg-red-500/40 group-hover:bg-red-500/60' : 'bg-cyan-500/40 group-hover:bg-cyan-500/60'
                              }`}
                              style={{ height: `${Math.max(10, height)}%` }}
                              title={`${d.date}: ${d.value}`}
                            />
                          );
                        })}
                      </div>
                    )}

                    {latest.ref_min != null && latest.ref_max != null && (
                      <div className="mt-2 text-xs text-gray-600">
                        Норма: {latest.ref_min} — {latest.ref_max}
                      </div>
                    )}

                    <div className="mt-1 text-xs text-gray-600 flex justify-between">
                      <span>{data.length} измерений · последнее: {latest.date}</span>
                      <span className="text-gray-700 group-hover:text-gray-500">→</span>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        ))}

        {/* Качественные показатели */}
        {Object.keys(qualGroups).length > 0 && (
          <section className="mb-10">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
              📋 Качественные показатели
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Object.entries(qualGroups).map(([key, data]) => {
                const latest = data[data.length - 1];
                const isAbnormal = latest.flag !== 'normal';
                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between bg-gray-900 border rounded-xl px-4 py-3 ${
                      isAbnormal ? 'border-red-800/50' : 'border-gray-800'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-medium">{latest.biomarker_name}</div>
                      <div className="text-xs text-gray-600">{latest.date}</div>
                    </div>
                    <div className={`text-sm font-medium ${
                      isAbnormal ? 'text-orange-400' : 'text-green-400'
                    }`}>
                      {latest.value_text || '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {Object.keys(groupedReadings).length === 0 && (
          <div className="text-center py-16 text-gray-500">
            Нет данных. Отправь анализы в @biopulse_lab_bot! 📸
          </div>
        )}
      </main>
    </div>
  );
}
