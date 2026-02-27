export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl mb-6">🫀</div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent mb-4">
          Biopulse
        </h1>
        <p className="text-gray-400 text-lg mb-8">
          Семейный трекер лабораторных анализов
        </p>
        <a
          href="https://t.me/biopulse_lab_bot"
          className="inline-block bg-cyan-500 hover:bg-cyan-400 text-black font-bold px-8 py-3 rounded-xl transition-colors"
        >
          Открыть бота в Telegram
        </a>
      </div>
    </div>
  );
}
