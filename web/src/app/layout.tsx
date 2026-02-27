import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Biopulse — Семейный архив анализов",
  description: "Храните и отслеживайте результаты анализов для всей семьи. Графики динамики, автоматический парсинг, профили.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-dots min-h-screen">{children}</body>
    </html>
  );
}
