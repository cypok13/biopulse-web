import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="border-b border-white/5 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-500 flex items-center justify-center text-sm shadow-lg shadow-cyan-500/20">
              🫀
            </div>
            <span className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-slate-100 to-cyan-300 bg-clip-text text-transparent">
              Biopulse
            </span>
          </div>
          <a
            href="https://t.me/biopulse_bot"
            className="text-xs font-semibold px-4 py-2 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors"
          >
            Открыть в Telegram →
          </a>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-2 border border-white/5 text-xs text-slate-400 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Бета · Бесплатно · 3 анализа в месяц
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-tight max-w-3xl mb-6">
          <span className="bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Все анализы.
          </span>
          <br />
          <span className="bg-gradient-to-r from-cyan-300 to-violet-400 bg-clip-text text-transparent">
            Одно место.
          </span>
        </h1>

        <p className="text-slate-400 text-lg max-w-xl mb-10 leading-relaxed">
          Отправь фото анализа в Telegram — получи распознанные показатели,
          графики динамики и профили для всей семьи.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mb-16">
          <a
            href="https://t.me/biopulse_bot"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 text-white font-bold text-sm shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-[1.02] transition-all"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.2-.04-.28-.02-.12.03-2.02 1.28-5.69 3.76-.54.37-1.03.55-1.47.54-.48-.01-1.4-.27-2.09-.49-.84-.27-1.51-.42-1.45-.88.03-.24.37-.49 1.02-.74 3.98-1.73 6.64-2.87 7.97-3.43 3.8-1.58 4.59-1.85 5.1-1.86.11 0 .37.03.54.17.14.12.18.28.2.47-.01.06.01.24 0 .37z"/></svg>
            Начать в Telegram
          </a>
          <a
            href="#how"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-surface-2 text-slate-300 font-semibold text-sm border border-white/5 hover:bg-surface-3 transition-colors"
          >
            Как это работает ↓
          </a>
        </div>

        {/* Features */}
        <div id="how" className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl w-full mb-20">
          {[
            {
              icon: "📸", title: "Отправь фото",
              desc: "Фото или PDF анализа из любой лаборатории на любом языке",
            },
            {
              icon: "🤖", title: "AI распознает",
              desc: "Claude & GPT-4o извлекут все показатели, имя, дату, лабораторию",
            },
            {
              icon: "📊", title: "Смотри динамику",
              desc: "Графики по каждому показателю, профили семьи, отклонения от нормы",
            },
          ].map((f, i) => (
            <div
              key={i}
              className="bg-surface-1 border border-white/5 rounded-2xl p-6 text-left hover:border-cyan-500/20 transition-colors"
            >
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="text-sm font-bold mb-1.5 text-slate-200">{f.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Supported labs */}
        <div className="max-w-xl mb-20">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">
            Поддерживаемые языки и лаборатории
          </h2>
          <div className="flex flex-wrap gap-2 justify-center">
            {["🇷🇺 Русский", "🇷🇸 Srpski", "🇬🇧 English", "🇩🇪 Deutsch", "Invitro", "Helix", "Beo-Lab", "CiTiLab", "Synevo", "CMD"].map((t) => (
              <span
                key={t}
                className="px-3 py-1.5 rounded-lg bg-surface-2 border border-white/5 text-xs text-slate-400"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Pricing */}
        <div className="max-w-2xl w-full mb-20">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">
            Тарифы
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-surface-1 border border-white/5 rounded-2xl p-6 text-left">
              <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">Free</div>
              <div className="text-3xl font-black mb-1">$0</div>
              <div className="text-xs text-slate-500 mb-4">навсегда</div>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>✓ 3 анализа в месяц</li>
                <li>✓ 2 профиля семьи</li>
                <li>✓ Графики динамики</li>
                <li>✓ AI-распознавание</li>
              </ul>
            </div>
            <div className="bg-gradient-to-br from-cyan-500/5 to-violet-500/5 border border-cyan-500/20 rounded-2xl p-6 text-left relative">
              <div className="absolute -top-2.5 right-4 px-2 py-0.5 rounded-md bg-cyan-500 text-[10px] font-bold text-white">
                СКОРО
              </div>
              <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2">Pro</div>
              <div className="text-3xl font-black mb-1">$4.99<span className="text-base font-normal text-slate-500">/мес</span></div>
              <div className="text-xs text-slate-500 mb-4">или $39.99/год</div>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>✓ Безлимитные анализы</li>
                <li>✓ 10 профилей семьи</li>
                <li>✓ Экспорт в PDF</li>
                <li>✓ Приоритетный парсинг</li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <span>© 2026 Biopulse · Все анализы. Одно место.</span>
          <div className="flex gap-4">
            <a href="https://t.me/biopulse_bot" className="hover:text-slate-400 transition-colors">Telegram</a>
            <a href="/privacy" className="hover:text-slate-400 transition-colors">Приватность</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
