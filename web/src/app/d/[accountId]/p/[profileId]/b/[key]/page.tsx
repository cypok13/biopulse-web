// /app/d/[accountId]/p/[profileId]/b/[key]/page.tsx
// История конкретного биомаркера

import { createServerClient } from '@/lib/supabase';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

const FLAG_LABELS: Record<string, { label: string; color: string }> = {
  normal:       { label: 'Норма',    color: 'text-green-400' },
  high:         { label: '↑ Выше',   color: 'text-red-400' },
  low:          { label: '↓ Ниже',   color: 'text-blue-400' },
  critical:     { label: '⚠ Крит',   color: 'text-red-500' },
  abnormal:     { label: '⚠ Откл',   color: 'text-orange-400' },
  needs_review: { label: '? Провер', color: 'text-yellow-400' },
};

export default async function BiomarkerPage({
  params,
}: {
  params: { accountId: string; profileId: string; key: string };
}) {
  const supabase = createServerClient();
  const bioKey = decodeURIComponent(params.key);

  // Get profile + account locale in parallel
  const [{ data: profile }, { data: account }] = await Promise.all([
    supabase.from('profiles').select('full_name, avatar_color, sex').eq('id', params.profileId).eq('account_id', params.accountId).single(),
    supabase.from('accounts').select('locale').eq('id', params.accountId).single(),
  ]);

  if (!profile) notFound();
  const locale: string = (account as any)?.locale || 'ru';

  // Get all readings for this profile, with biomarker info
  const { data: allReadings } = await supabase
    .from('readings')
    .select(`
      id,
      tested_at,
      value,
      value_text,
      is_qualitative,
      unit,
      flag,
      ref_min,
      ref_max,
      original_name,
      biomarkers:biomarker_id (
        canonical_name,
        display_name_ru,
        display_name_en,
        ref_range_male_min,
        ref_range_male_max,
        ref_range_female_min,
        ref_range_female_max
      )
    `)
    .eq('profile_id', params.profileId)
    .order('tested_at', { ascending: true });

  // Filter readings that match this biomarker key
  const readings = (allReadings || []).filter((r: any) => {
    const bm = r.biomarkers;
    const key = bm?.canonical_name || r.original_name.toLowerCase().trim();
    return key === bioKey;
  });

  if (readings.length === 0) notFound();

  const firstReading = readings[0] as any;
  const bm = firstReading.biomarkers;
  const displayName = locale === 'ru'
    ? (bm?.display_name_ru || bm?.display_name_en || firstReading.original_name)
    : (bm?.display_name_en || bm?.display_name_ru || firstReading.original_name);
  const unit = firstReading.unit || '';

  // Numeric readings for chart
  const numericReadings = readings.filter((r: any) => !r.is_qualitative && r.value !== null);
  const vals = numericReadings.map((r: any) => r.value as number);
  const minVal = vals.length ? Math.min(...vals) : 0;
  const maxVal = vals.length ? Math.max(...vals) : 1;
  const valRange = maxVal - minVal || 1;

  // Reference range: from most recent reading, fallback to biomarker table
  const latest = readings[readings.length - 1] as any;
  const sex = (profile as any)?.sex as string | null;
  const refMin = latest.ref_min ??
    (sex === 'male' ? bm?.ref_range_male_min : bm?.ref_range_female_min) ??
    bm?.ref_range_female_min ?? bm?.ref_range_male_min ?? null;
  const refMax = latest.ref_max ??
    (sex === 'male' ? bm?.ref_range_male_max : bm?.ref_range_female_max) ??
    bm?.ref_range_female_max ?? bm?.ref_range_male_max ?? null;

  // SVG sparkline dimensions
  const svgW = 600;
  const svgH = 160;
  const padX = 40;
  const padY = 20;
  const plotW = svgW - padX * 2;
  const plotH = svgH - padY * 2;

  const points = numericReadings.map((r: any, i: number) => {
    const x = numericReadings.length === 1
      ? padX + plotW / 2
      : padX + (i / (numericReadings.length - 1)) * plotW;
    const y = padY + plotH - (((r.value as number) - minVal) / valRange) * plotH;
    return { x, y, r };
  });

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');

  // Reference band y-coords (clamped to plot area)
  let refMinY: number | null = null;
  let refMaxY: number | null = null;
  if (refMin != null) {
    refMinY = padY + plotH - ((refMin - minVal) / valRange) * plotH;
  }
  if (refMax != null) {
    refMaxY = padY + plotH - ((refMax - minVal) / valRange) * plotH;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <a
            href={`/d/${params.accountId}/p/${params.profileId}`}
            className="text-gray-500 hover:text-gray-300 text-sm"
          >
            ← Назад
          </a>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ backgroundColor: profile.avatar_color }}
          >
            {profile.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold">{displayName}</h1>
            <p className="text-xs text-gray-500">
              {unit && <span>{unit} · </span>}
              {readings.length} измерений
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {/* Chart */}
        {numericReadings.length > 0 && (
          <section className="mb-8">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 overflow-x-auto">
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                className="w-full"
                style={{ minWidth: '300px', height: '160px' }}
              >
                {/* Reference band */}
                {refMinY != null && refMaxY != null && (
                  <rect
                    x={padX}
                    y={Math.min(refMinY, refMaxY)}
                    width={plotW}
                    height={Math.abs(refMinY - refMaxY)}
                    fill="rgba(16,185,129,0.08)"
                  />
                )}
                {refMinY != null && (
                  <line
                    x1={padX} y1={refMinY}
                    x2={padX + plotW} y2={refMinY}
                    stroke="rgba(16,185,129,0.3)"
                    strokeDasharray="4 3"
                    strokeWidth={1}
                  />
                )}
                {refMaxY != null && (
                  <line
                    x1={padX} y1={refMaxY}
                    x2={padX + plotW} y2={refMaxY}
                    stroke="rgba(16,185,129,0.3)"
                    strokeDasharray="4 3"
                    strokeWidth={1}
                  />
                )}

                {/* Line */}
                {points.length > 1 && (
                  <polyline
                    points={polyline}
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}

                {/* Dots */}
                {points.map((p, i) => {
                  const flag = (p.r as any).flag;
                  const color =
                    flag === 'high' || flag === 'critical' ? '#f87171' :
                    flag === 'low' ? '#60a5fa' :
                    flag === 'abnormal' ? '#fb923c' :
                    '#06b6d4';
                  return (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={4}
                      fill={color}
                      stroke="#0b0b18"
                      strokeWidth={2}
                    />
                  );
                })}

                {/* Y-axis labels */}
                <text x={padX - 6} y={padY + 4} fill="#4b5563" fontSize={10} textAnchor="end">
                  {maxVal.toFixed(1)}
                </text>
                <text x={padX - 6} y={padY + plotH + 4} fill="#4b5563" fontSize={10} textAnchor="end">
                  {minVal.toFixed(1)}
                </text>

                {/* X-axis date labels — first and last */}
                {points.length >= 1 && (
                  <text x={points[0].x} y={svgH - 2} fill="#4b5563" fontSize={9} textAnchor="middle">
                    {(points[0].r as any).tested_at}
                  </text>
                )}
                {points.length >= 2 && (
                  <text x={points[points.length - 1].x} y={svgH - 2} fill="#4b5563" fontSize={9} textAnchor="middle">
                    {(points[points.length - 1].r as any).tested_at}
                  </text>
                )}
              </svg>

              {/* Legend */}
              {(refMin != null || refMax != null) && (
                <div className="mt-2 text-xs text-gray-500 text-center">
                  Референс: {refMin != null ? `≥ ${refMin}` : ''}{refMin != null && refMax != null ? ' – ' : ''}{refMax != null ? `≤ ${refMax}` : ''} {unit}
                </div>
              )}
            </div>
          </section>
        )}

        {/* History table */}
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            История измерений
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs text-gray-500 text-left">
                  <th className="pb-3 pr-4 font-medium">Дата</th>
                  <th className="pb-3 pr-4 font-medium">Значение</th>
                  <th className="pb-3 pr-4 font-medium">Норма</th>
                  <th className="pb-3 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {[...readings].reverse().map((r: any) => {
                  const flag = FLAG_LABELS[r.flag] || FLAG_LABELS.normal;
                  const displayValue = r.is_qualitative
                    ? (r.value_text || '—')
                    : (r.value != null ? `${r.value} ${unit}` : '—');
                  const rMin = r.ref_min ??
                    (sex === 'male' ? bm?.ref_range_male_min : bm?.ref_range_female_min) ??
                    bm?.ref_range_female_min ?? bm?.ref_range_male_min ?? null;
                  const rMax = r.ref_max ??
                    (sex === 'male' ? bm?.ref_range_male_max : bm?.ref_range_female_max) ??
                    bm?.ref_range_female_max ?? bm?.ref_range_male_max ?? null;
                  const refRange = rMin != null && rMax != null
                    ? `${rMin} – ${rMax}`
                    : rMin != null ? `≥ ${rMin}`
                    : rMax != null ? `≤ ${rMax}`
                    : '—';
                  return (
                    <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-900/40">
                      <td className="py-3 pr-4 text-gray-400">{r.tested_at}</td>
                      <td className={`py-3 pr-4 font-bold ${flag.color}`}>
                        {displayValue}
                        {!r.is_qualitative && r.flag === 'high' && ' ↑'}
                        {!r.is_qualitative && r.flag === 'low' && ' ↓'}
                      </td>
                      <td className="py-3 pr-4 text-gray-500">{refRange}</td>
                      <td className={`py-3 text-xs ${flag.color}`}>{flag.label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
