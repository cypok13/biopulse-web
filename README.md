# 🫀 Biopulse — Семейный архив анализов

> Telegram-бот + веб-дашборд для хранения, парсинга и визуализации медицинских анализов.

## Архитектура

```
biopulse/
├── bot/                  # Telegram-бот (grammY)
│   ├── src/
│   │   ├── index.ts      # Точка входа бота
│   │   ├── handlers/     # Обработчики команд и документов
│   │   ├── services/     # AI парсинг, Supabase клиент
│   │   └── utils/        # Хелперы
│   ├── package.json
│   └── tsconfig.json
├── web/                  # Next.js веб-дашборд
│   ├── src/
│   │   ├── app/          # App Router pages
│   │   ├── components/   # UI компоненты
│   │   ├── lib/          # Supabase client, utils
│   │   └── types/        # TypeScript типы
│   ├── package.json
│   └── tailwind.config.ts
├── supabase/
│   └── migrations/       # SQL миграции
│       └── 001_initial_schema.sql
├── shared/               # Общие типы и константы
│   └── types.ts
├── .env.example
└── README.md
```

## Стек

- **Bot**: Node.js + TypeScript + grammY
- **Web**: Next.js 14 + Tailwind CSS + Recharts
- **DB**: Supabase (PostgreSQL) + Supabase Storage
- **AI**: Claude Vision API + OpenAI GPT-4o Vision (A/B)
- **Deploy**: VPS (PM2 + Nginx) → Vercel (фронт)

## Быстрый старт

### 1. Переменные окружения
```bash
cp .env.example .env
# Заполни все значения
```

### 2. Supabase
```bash
# Создай проект на supabase.com
# Примени миграцию: supabase/migrations/001_initial_schema.sql
```

### 3. Telegram-бот
```bash
cd bot
npm install
npm run dev
```

### 4. Веб-дашборд
```bash
cd web
npm install
npm run dev
```

## Деплой на VPS (PM2)

```bash
# Bot
cd bot && npm run build
pm2 start dist/index.js --name biopulse-bot

# Web
cd web && npm run build
pm2 start npm --name biopulse-web -- start
```

## Nginx конфиг

```nginx
server {
    listen 80;
    server_name biopulse.app;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
