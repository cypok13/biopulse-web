// /app/d/[accountId]/doc/[documentId]/page.tsx
// Детальная страница документа — показатели из конкретного анализа

import { createServerClient } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import { deleteDocument } from '@/app/actions';
import ConfirmButton from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';

const FLAG_LABELS: Record<string, { label: string; color: string }> = {
  normal:       { label: 'Норма',    color: 'text-green-400' },
  high:         { label: '↑ Выше',   color: 'text-red-400' },
  low:          { label: '↓ Ниже',   color: 'text-blue-400' },
  critical:     { label: '⚠ Крит',   color: 'text-red-500' },
  abnormal:     { label: '⚠ Откл',   color: 'text-orange-400' },
  needs_review: { label: '? Провер', color: 'text-yellow-400' },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  blood: '🩸 Кровь',
  biochemistry: '⚗️ Биохимия',
  hormone: '🧬 Гормоны',
  microbiology: '🦠 Микробиология',
  urine: '🧪 Моча',
  other: '📋 Другое',
};

export default async function DocumentPage({
  params,
}: {
  params: { accountId: string; documentId: string };
}) {
  const supabase = createServerClient();

  const { data: doc } = await supabase
    .from('documents')
    .select('*')
    .eq('id', params.documentId)
    .eq('account_id', params.accountId)
    .single();

  if (!doc) notFound();

  // Подписанная ссылка на исходный файл (действует 1 час)
  let sourceUrl: string | null = null;
  if (doc.storage_path) {
    const { data: signed } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.storage_path, 3600);
    sourceUrl = signed?.signedUrl ?? null;
  }

  const { data: readings } = await supabase
    .from('readings')
    .select(`
      *,
      biomarkers:biomarker_id (display_name_ru, display_name_en, canonical_name)
    `)
    .eq('document_id', params.documentId)
    .order('created_at', { ascending: true });

  const numericReadings = (readings || []).filter((r: any) => !r.is_qualitative && r.value !== null);
  const qualReadings = (readings || []).filter((r: any) => r.is_qualitative || r.value === null);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <a href={`/d/${params.accountId}`} className="text-gray-500 hover:text-gray-300 text-sm">
            ← Назад
          </a>
          <div className="flex-1">
            <h1 className="text-lg font-bold">{doc.parsed_name || 'Анализ'}</h1>
            <p className="text-xs text-gray-500">
              {doc.parsed_date || '—'} · {doc.lab_name || 'Лаборатория не определена'}
              {doc.document_type && ` · ${DOC_TYPE_LABELS[doc.document_type] || doc.document_type}`}
              {doc.language && ` · ${doc.language.toUpperCase()}`}
              {doc.ai_model && ` · ${doc.ai_model}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
              >
                📎 Исходник
              </a>
            )}
            <form action={deleteDocument}>
              <input type="hidden" name="documentId" value={params.documentId} />
              <input type="hidden" name="accountId" value={params.accountId} />
              <ConfirmButton
                message="Удалить этот анализ?"
                className="text-xs px-3 py-1.5 rounded-lg border border-red-900/50 text-red-600 hover:bg-red-900/20 hover:text-red-400 transition-colors"
              >
                🗑 Удалить
              </ConfirmButton>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Числовые показатели */}
        {numericReadings.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Числовые показатели
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-xs text-gray-500 text-left">
                    <th className="pb-3 pr-4 font-medium">Показатель</th>
                    <th className="pb-3 pr-4 font-medium">Значение</th>
                    <th className="pb-3 pr-4 font-medium">Ед. изм.</th>
                    <th className="pb-3 pr-4 font-medium">Норма</th>
                    <th className="pb-3 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {numericReadings.map((r: any) => {
                    const flag = FLAG_LABELS[r.flag] || FLAG_LABELS.normal;
                    const displayName = r.biomarkers?.display_name_ru || r.biomarkers?.display_name_en || r.original_name;
                    return (
                      <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-900/50">
                        <td className="py-3 pr-4">
                          <div className="font-medium">{displayName}</div>
                          {r.biomarkers && r.original_name !== displayName && (
                            <div className="text-xs text-gray-600">{r.original_name}</div>
                          )}
                        </td>
                        <td className={`py-3 pr-4 font-bold ${flag.color}`}>
                          {r.value}
                        </td>
                        <td className="py-3 pr-4 text-gray-500">{r.unit || '—'}</td>
                        <td className="py-3 pr-4 text-gray-500">
                          {r.ref_min != null && r.ref_max != null
                            ? `${r.ref_min} – ${r.ref_max}`
                            : r.ref_min != null ? `≥ ${r.ref_min}`
                            : r.ref_max != null ? `≤ ${r.ref_max}`
                            : '—'}
                        </td>
                        <td className={`py-3 text-xs ${flag.color}`}>{flag.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Качественные показатели */}
        {qualReadings.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Качественные показатели
            </h2>
            <div className="space-y-2">
              {qualReadings.map((r: any) => {
                const flag = FLAG_LABELS[r.flag] || FLAG_LABELS.normal;
                const displayName = r.biomarkers?.display_name_ru || r.biomarkers?.display_name_en || r.original_name;
                return (
                  <div key={r.id} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
                    <div className="text-sm">{displayName}</div>
                    <div className={`text-sm font-medium ${flag.color}`}>
                      {r.value_text || '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {(readings || []).length === 0 && (
          <div className="text-center py-16 text-gray-500">
            Показатели не найдены
          </div>
        )}
      </main>
    </div>
  );
}
