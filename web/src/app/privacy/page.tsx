export default function PrivacyPage() {
  return (
    <div className="min-h-screen px-6 py-16 max-w-2xl mx-auto">
      <h1 className="text-2xl font-extrabold mb-6">Политика конфиденциальности</h1>
      <div className="text-sm text-slate-400 space-y-4 leading-relaxed">
        <p>
          Biopulse хранит ваши медицинские данные в зашифрованном хранилище Supabase.
          Данные доступны только вам через привязанный Telegram-аккаунт.
        </p>
        <p>
          Загруженные документы обрабатываются через AI API (Anthropic Claude / OpenAI GPT-4o)
          для извлечения текстовых данных. Оригиналы хранятся в приватном хранилище
          и доступны только владельцу аккаунта.
        </p>
        <p>
          Мы не продаём и не передаём ваши данные третьим лицам.
          Национальные идентификаторы (JMBG, СНИЛС и т.д.) автоматически
          фильтруются и не сохраняются.
        </p>
        <p>
          Вы можете запросить полное удаление данных в любой момент через
          Telegram-бот (команда /delete).
        </p>
        <p className="text-slate-600 text-xs">
          Последнее обновление: февраль 2026
        </p>
      </div>
    </div>
  );
}
