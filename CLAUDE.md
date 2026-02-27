# CLAUDE.md — Biopulse Project Onboarding

## What is Biopulse?

Biopulse is a family medical lab results tracker. Users send photos/PDFs of lab results to a Telegram bot, AI parses them into structured biomarker readings, and a web dashboard shows trends over time.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Telegram    │────▶│  Bot (grammY)│────▶│  Supabase    │
│  User sends  │     │  Node.js     │     │  PostgreSQL  │
│  photo/PDF   │     │  + AI Parser │     │  + Storage   │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                                          ┌──────▼───────┐
                                          │  Web Dashboard│
                                          │  Next.js 14   │
                                          │  on Vercel    │
                                          └──────────────┘
```

**Two separate deployments:**
- **Bot** → VPS at `72.56.85.231` (PM2 process `biopulse-bot`)
- **Web** → Vercel (GitHub repo `cypok13/biopulse-web`)

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Bot framework | grammY (Telegram Bot API) |
| Bot runtime | Node.js 22, TypeScript, PM2 |
| AI parsing | OpenAI GPT-4o (configured via `AI_PROVIDER=openai`) |
| Database | Supabase (PostgreSQL) |
| File storage | Supabase Storage (bucket: `documents`) |
| Web framework | Next.js 14 (App Router, Server Components) |
| Styling | Tailwind CSS (dark theme) |
| Charts | Recharts |
| Web hosting | Vercel |
| Font | Outfit (Google Fonts) |

## Project Structure

### Bot (on VPS: `/opt/biopulse/biopulse/`)

```
bot/
├── src/
│   ├── index.ts          # Main bot entry point, all command handlers
│   ├── services/
│   │   ├── ai-parser.ts  # AI prompt for lab result parsing (v2)
│   │   └── supabase.ts   # Database operations (accounts, profiles, documents, readings)
│   └── tests/
│       └── parsing-ground-truth.ts  # Manual extraction reference data
├── dist/                 # Compiled JS (rootDir is ".." so structure is dist/bot/src/...)
├── tsconfig.json
├── package.json
└── .env                  # Runtime config (NOT in git)

shared/
├── types.ts              # Shared TypeScript interfaces (ParsedLabResult, ParsedReading, etc.)

supabase/
└── migrations/
    └── 001_initial_schema.sql  # Database schema (5 tables, 30 biomarkers)
```

### Web (GitHub: `cypok13/biopulse-web`)

```
src/
├── app/
│   ├── layout.tsx              # Root layout, metadata, Outfit font
│   ├── globals.css             # Tailwind directives, custom properties, dot pattern
│   ├── page.tsx                # Landing page (hero, features, pricing)
│   ├── privacy/page.tsx        # Privacy policy
│   └── d/
│       └── [accountId]/
│           ├── page.tsx        # Dashboard (profiles list, stats, documents)
│           └── p/
│               └── [profileId]/
│                   └── page.tsx  # Profile (biomarker charts, qualitative results)
├── components/
│   ├── Header.tsx              # Sticky nav with plan badge
│   └── BiomarkerCard.tsx       # Recharts AreaChart card with gradient, reference lines
├── lib/
│   ├── supabase.ts             # Browser + Server Supabase clients
│   └── types.ts                # TypeScript types, CATEGORY_META, PLAN_LIMITS
```

## Database Schema (Supabase)

5 tables:

### accounts
- `id` UUID PK
- `telegram_id` BIGINT UNIQUE
- `telegram_username` TEXT
- `display_name` TEXT
- `locale` TEXT DEFAULT 'ru'
- `plan` TEXT DEFAULT 'free' (free | pro | lifetime)
- `monthly_uploads` INT DEFAULT 0

### profiles
- `id` UUID PK
- `account_id` → accounts
- `full_name` TEXT
- `normalized_name` TEXT (lowercase, for matching across documents)
- `date_of_birth` DATE
- `sex` TEXT (male | female)
- `avatar_color` TEXT
- `is_primary` BOOLEAN

### documents
- `id` UUID PK
- `account_id` → accounts
- `profile_id` → profiles (nullable, assigned after parsing)
- `telegram_file_id` TEXT
- `file_type` TEXT (photo | document)
- `storage_path` TEXT
- `status` TEXT (pending | processing | done | error)
- `parsed_name`, `parsed_date`, `lab_name`, `language`
- `document_type` TEXT (blood | biochemistry | hormone | microbiology | urine | other)
- `ai_model` TEXT

### readings
- `id` UUID PK
- `document_id` → documents
- `profile_id` → profiles
- `biomarker_id` → biomarkers (nullable)
- `original_name` TEXT
- `value` DECIMAL (nullable for qualitative)
- `value_text` TEXT (for qualitative results like "negativan")
- `is_qualitative` BOOLEAN
- `unit` TEXT
- `ref_min`, `ref_max` DECIMAL
- `flag` TEXT (normal | low | high | critical | needs_review | abnormal)
- `tested_at` DATE

### biomarkers
- `id` UUID PK
- `canonical_name` TEXT UNIQUE (e.g., "hemoglobin")
- `display_name_en`, `display_name_ru`
- `category` TEXT (blood | metabolic | lipid | hormone | vitamin | mineral | liver | kidney | inflammation)
- `unit_default` TEXT
- Pre-seeded with 30 common biomarkers

## AI Parsing (ai-parser.ts)

The bot sends lab document images/PDFs to OpenAI GPT-4o with a structured prompt that returns JSON:

```typescript
interface ParsedLabResult {
  patient_name: string | null;
  test_date: string | null;         // ISO format
  lab_name: string | null;
  language: string | null;
  document_type: 'blood' | 'biochemistry' | 'hormone' | 'microbiology' | 'urine' | 'other';
  patient_dob: string | null;
  patient_sex: 'male' | 'female' | null;
  partial_result: boolean;
  readings: ParsedReading[];
  notes: string[];
}

interface ParsedReading {
  name: string;
  value: number | string;           // supports qualitative ("negativan")
  value_numeric: boolean;
  unit: string | null;
  ref_min: number | null;
  ref_max: number | null;
  flag: 'normal' | 'low' | 'high' | 'critical' | 'needs_review' | 'abnormal';
}
```

Key parsing features:
- Multi-language (Russian, Serbian, English, German)
- Handles photo quality issues (OCR errors → needs_review flag)
- Qualitative results ("negativan" → flag "normal")
- Filters sensitive data (JMBG, СНИЛС)
- Date formats: DD.MM.YYYY, DD/MM/YYYY → ISO

## Bot Commands

| Command | Handler | Description |
|---------|---------|-------------|
| /start | Creates account in Supabase, sends welcome | First-time setup |
| /help | Static text | Shows help message |
| /dashboard | Generates Vercel URL with account ID | Links to web dashboard |
| /profiles | Lists profiles from Supabase | Shows family members |
| /lang | Language switcher | ru/en/sr |
| Photo/PDF | Downloads file → AI parse → save to DB | Main workflow |

## Environment Variables

### Bot (.env on VPS)
```
SUPABASE_URL=https://gnwzulmtaupnoobogtul.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
TELEGRAM_BOT_TOKEN=8234589351:AAH...
TELEGRAM_MODE=polling
AI_PROVIDER=openai
OPENAI_API_KEY=sk-proj-...
APP_URL=https://biopulse-web.vercel.app
NODE_ENV=production
```

### Web (Vercel Environment Variables)
```
NEXT_PUBLIC_SUPABASE_URL=https://gnwzulmtaupnoobogtul.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Deployment

### Bot (VPS: 72.56.85.231)
```bash
ssh root@72.56.85.231
cd /opt/biopulse/biopulse/bot
npm run build                    # TypeScript → dist/
pm2 restart biopulse-bot         # Restart process
pm2 logs biopulse-bot --lines 30 # Check logs
```

Build note: `tsconfig.json` has `rootDir: ".."` and `strict: false` because shared/ is outside bot/. Compiled output is at `dist/bot/src/index.js`.

### Web (Vercel — auto-deploys on git push)
```bash
cd ~/path/to/biopulse-web
# Edit files
git add . && git commit -m "description" && git push
# Vercel auto-deploys in ~45 seconds
```

## Current Status & Known Issues

### ✅ Working
- Telegram bot responds to /start, /help, /dashboard, /profiles
- Account creation in Supabase
- Dashboard link generation
- Landing page on Vercel (needs successful deploy)

### 🔴 Needs Fix
1. **Vercel deploy failing** — TypeScript errors were fixed in biopulse-web-v2.tar.gz but may need force push to GitHub
2. **PDF/photo parsing not responding** — Bot receives file but may error during AI parsing. Check `pm2 logs biopulse-bot` for errors. Likely issues:
   - OpenAI API key may be invalid
   - File download from Telegram may fail
   - Supabase Storage bucket "documents" may not be created yet
3. **Vercel Environment Variables** not yet configured — dashboard pages will 500 without Supabase keys

### 🟡 TODO
- Create Supabase Storage bucket "documents" (Storage → New bucket → private)
- Add Vercel environment variables
- Test end-to-end: photo → parse → save → view in dashboard
- Biomarker matching (map parsed names to canonical biomarker IDs)
- Stripe integration for Pro plan
- Mobile-responsive dashboard improvements

## Design System

- **Background**: #0b0b18 (surface-0), #12121f (surface-1), #1a1a2e (surface-2)
- **Accent**: #06b6d4 (cyan-500), #67e8f9 (cyan-300)
- **Error/High**: #f87171 (red-400)
- **Low**: #60a5fa (blue-400)
- **Success**: #34d399 (emerald-400)
- **Font**: Outfit (weights 300-900)
- **Mono**: JetBrains Mono
- **Style**: Dark medical-tech aesthetic, subtle dot pattern, stagger animations

## Telegram Bot Info
- Username: @biopulse_lab_bot
- Token stored in .env on VPS (not in code)

## Quick Debug Commands (on VPS)
```bash
pm2 status                        # Check if bot is running
pm2 logs biopulse-bot --lines 50  # Recent logs
pm2 restart biopulse-bot          # Restart after code change
cat /opt/biopulse/biopulse/bot/.env  # Check env vars
```
