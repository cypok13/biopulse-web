-- ============================================
-- Biopulse — Initial Schema Migration
-- Version: 001
-- Date: 2026-02-25
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. ACCOUNTS (владелец аккаунта)
-- ============================================
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Auth-ready: этот id станет auth.users.id при миграции
    telegram_id BIGINT UNIQUE NOT NULL,
    telegram_username TEXT,
    display_name TEXT,
    locale TEXT NOT NULL DEFAULT 'ru',
    plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'lifetime')),
    plan_expires_at TIMESTAMPTZ,
    monthly_uploads INT NOT NULL DEFAULT 0,
    monthly_uploads_reset_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()) + INTERVAL '1 month',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounts_telegram_id ON accounts(telegram_id);

-- ============================================
-- 2. PROFILES (члены семьи)
-- ============================================
CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL, -- lowercase, trimmed — для матчинга
    date_of_birth DATE,
    sex TEXT CHECK (sex IN ('male', 'female')),
    avatar_color TEXT NOT NULL DEFAULT '#6366f1',
    is_primary BOOLEAN NOT NULL DEFAULT FALSE, -- основной профиль владельца
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_account_id ON profiles(account_id);
CREATE INDEX idx_profiles_normalized_name ON profiles(account_id, normalized_name);

-- ============================================
-- 3. DOCUMENTS (загруженные файлы)
-- ============================================
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    -- File info
    storage_path TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
    file_size INT,
    source TEXT NOT NULL DEFAULT 'telegram' CHECK (source IN ('telegram', 'web', 'api')),
    -- Processing
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error', 'needs_review')),
    error_message TEXT,
    -- Parsed metadata
    raw_text TEXT, -- полный текст OCR (для дебага и переобработки)
    parsed_json JSONB, -- полный JSON ответа от AI (для аудита)
    parsed_name TEXT, -- имя пациента из документа
    parsed_date DATE, -- дата анализа из документа
    parsed_dob DATE, -- дата рождения из документа
    parsed_sex TEXT CHECK (parsed_sex IN ('male', 'female')),
    document_type TEXT DEFAULT 'other' CHECK (document_type IN ('blood', 'biochemistry', 'hormone', 'microbiology', 'urine', 'other')),
    lab_name TEXT, -- название лаборатории
    language TEXT, -- auto-detected язык документа
    is_partial BOOLEAN DEFAULT FALSE, -- частичный результат ("u radu")
    -- AI tracking
    ai_model TEXT, -- 'claude-sonnet-4-5' | 'gpt-4o'
    ai_cost DECIMAL(8,6) DEFAULT 0, -- стоимость вызова API
    ai_tokens_in INT DEFAULT 0,
    ai_tokens_out INT DEFAULT 0,
    processing_time_ms INT, -- время обработки
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_account_id ON documents(account_id);
CREATE INDEX idx_documents_profile_id ON documents(profile_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_parsed_date ON documents(parsed_date);

-- ============================================
-- 4. BIOMARKERS (глобальный справочник)
-- ============================================
CREATE TABLE biomarkers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name TEXT UNIQUE NOT NULL, -- 'hemoglobin', 'glucose', etc.
    display_name_en TEXT NOT NULL,
    display_name_ru TEXT,
    aliases TEXT[] NOT NULL DEFAULT '{}', -- все возможные написания
    category TEXT NOT NULL DEFAULT 'other',
    unit_default TEXT, -- единица измерения по умолчанию
    ref_range_male_min DECIMAL,
    ref_range_male_max DECIMAL,
    ref_range_female_min DECIMAL,
    ref_range_female_max DECIMAL,
    description_en TEXT,
    description_ru TEXT,
    sort_order INT DEFAULT 0
);

CREATE INDEX idx_biomarkers_canonical ON biomarkers(canonical_name);
CREATE INDEX idx_biomarkers_category ON biomarkers(category);

-- ============================================
-- 5. READINGS (показатели из анализов)
-- ============================================
CREATE TABLE readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    biomarker_id UUID REFERENCES biomarkers(id) ON DELETE SET NULL,
    -- Values
    original_name TEXT NOT NULL, -- как написано в документе
    value DECIMAL, -- числовое значение (NULL для качественных)
    value_text TEXT, -- текстовое значение: "negativan", "positive", etc.
    is_qualitative BOOLEAN DEFAULT FALSE,
    unit TEXT, -- единица из документа
    ref_min DECIMAL, -- нижняя граница нормы (из документа)
    ref_max DECIMAL, -- верхняя граница нормы (из документа)
    flag TEXT DEFAULT 'normal' CHECK (flag IN ('normal', 'low', 'high', 'critical', 'needs_review', 'abnormal')),
    -- Date
    tested_at DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_readings_profile_id ON readings(profile_id);
CREATE INDEX idx_readings_biomarker_id ON readings(biomarker_id);
CREATE INDEX idx_readings_document_id ON readings(document_id);
CREATE INDEX idx_readings_tested_at ON readings(profile_id, tested_at);
-- Составной индекс для графиков динамики
CREATE INDEX idx_readings_profile_biomarker_date ON readings(profile_id, biomarker_id, tested_at);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE readings ENABLE ROW LEVEL SECURITY;
-- biomarkers — публичная таблица, RLS не нужен

-- Policies для service_role (бот и парсер)
-- Service role обходит RLS по умолчанию в Supabase

-- Policies для будущей auth (anon/authenticated)
-- Раскомментировать при подключении Supabase Auth:

-- CREATE POLICY "Users can view own account"
--     ON accounts FOR SELECT
--     USING (id = auth.uid());

-- CREATE POLICY "Users can view own profiles"
--     ON profiles FOR SELECT
--     USING (account_id = auth.uid());

-- CREATE POLICY "Users can view own documents"
--     ON documents FOR SELECT
--     USING (account_id = auth.uid());

-- CREATE POLICY "Users can view own readings"
--     ON readings FOR SELECT
--     USING (profile_id IN (
--         SELECT id FROM profiles WHERE account_id = auth.uid()
--     ));

-- ============================================
-- SEED: Базовые биомаркеры (топ-30)
-- ============================================
INSERT INTO biomarkers (canonical_name, display_name_en, display_name_ru, aliases, category, unit_default, ref_range_male_min, ref_range_male_max, ref_range_female_min, ref_range_female_max, sort_order) VALUES
-- Общий анализ крови
('hemoglobin', 'Hemoglobin', 'Гемоглобин', '{"Hb","HGB","гемоглобин","hemoglobina","Hgb"}', 'blood', 'g/dL', 13.5, 17.5, 12.0, 16.0, 1),
('rbc', 'Red Blood Cells', 'Эритроциты', '{"RBC","эритроциты","eritrocitos","red blood cells","Er"}', 'blood', '10^12/L', 4.5, 5.5, 4.0, 5.0, 2),
('wbc', 'White Blood Cells', 'Лейкоциты', '{"WBC","лейкоциты","leucocitos","white blood cells","Le"}', 'blood', '10^9/L', 4.0, 11.0, 4.0, 11.0, 3),
('platelets', 'Platelets', 'Тромбоциты', '{"PLT","тромбоциты","plaquetas","thrombocytes","Plt"}', 'blood', '10^9/L', 150, 400, 150, 400, 4),
('hematocrit', 'Hematocrit', 'Гематокрит', '{"HCT","Ht","гематокрит","hematocrito"}', 'blood', '%', 40, 54, 36, 48, 5),
('esr', 'ESR', 'СОЭ', '{"ESR","СОЭ","скорость оседания","sed rate","VSG"}', 'blood', 'mm/h', 0, 15, 0, 20, 6),

-- Биохимия
('glucose', 'Glucose', 'Глюкоза', '{"GLU","глюкоза","glucosa","blood sugar","сахар крови","Glu"}', 'metabolic', 'mmol/L', 3.9, 5.6, 3.9, 5.6, 10),
('creatinine', 'Creatinine', 'Креатинин', '{"CREA","креатинин","creatinina","Cr"}', 'kidney', 'umol/L', 62, 106, 44, 80, 11),
('urea', 'Urea', 'Мочевина', '{"BUN","мочевина","urea nitrogen"}', 'kidney', 'mmol/L', 2.5, 8.3, 2.5, 8.3, 12),
('alt', 'ALT', 'АЛТ', '{"ALT","АЛТ","SGPT","аланинаминотрансфераза","GPT"}', 'liver', 'U/L', 0, 41, 0, 33, 13),
('ast', 'AST', 'АСТ', '{"AST","АСТ","SGOT","аспартатаминотрансфераза","GOT"}', 'liver', 'U/L', 0, 40, 0, 32, 14),
('bilirubin_total', 'Total Bilirubin', 'Билирубин общий', '{"TBIL","билирубин общий","bilirubin total","Bil"}', 'liver', 'umol/L', 3.4, 20.5, 3.4, 20.5, 15),
('total_protein', 'Total Protein', 'Общий белок', '{"TP","общий белок","proteinas totales","total protein"}', 'metabolic', 'g/L', 64, 83, 64, 83, 16),
('albumin', 'Albumin', 'Альбумин', '{"ALB","альбумин","albumina"}', 'metabolic', 'g/L', 35, 52, 35, 52, 17),

-- Липиды
('cholesterol_total', 'Total Cholesterol', 'Холестерин общий', '{"CHOL","холестерин","colesterol total","TC"}', 'lipid', 'mmol/L', 0, 5.2, 0, 5.2, 20),
('hdl', 'HDL Cholesterol', 'ЛПВП', '{"HDL","ЛПВП","HDL-C","хороший холестерин"}', 'lipid', 'mmol/L', 1.0, 999, 1.2, 999, 21),
('ldl', 'LDL Cholesterol', 'ЛПНП', '{"LDL","ЛПНП","LDL-C","плохой холестерин"}', 'lipid', 'mmol/L', 0, 3.4, 0, 3.4, 22),
('triglycerides', 'Triglycerides', 'Триглицериды', '{"TG","триглицериды","trigliceridos","TRIG"}', 'lipid', 'mmol/L', 0, 1.7, 0, 1.7, 23),

-- Гормоны
('tsh', 'TSH', 'ТТГ', '{"TSH","ТТГ","тиреотропный гормон","tirotropina"}', 'hormone', 'mIU/L', 0.4, 4.0, 0.4, 4.0, 30),
('t4_free', 'Free T4', 'Т4 свободный', '{"FT4","Т4 св","free thyroxine","tiroxina libre","fT4"}', 'hormone', 'pmol/L', 12, 22, 12, 22, 31),
('t3_free', 'Free T3', 'Т3 свободный', '{"FT3","Т3 св","free triiodothyronine","fT3"}', 'hormone', 'pmol/L', 3.1, 6.8, 3.1, 6.8, 32),
('testosterone', 'Testosterone', 'Тестостерон', '{"testosterone","тестостерон","testosterona"}', 'hormone', 'nmol/L', 8.64, 29.0, 0.29, 1.67, 33),
('cortisol', 'Cortisol', 'Кортизол', '{"cortisol","кортизол","cortisola"}', 'hormone', 'nmol/L', 171, 536, 171, 536, 34),

-- Витамины и минералы
('vitamin_d', 'Vitamin D', 'Витамин D', '{"25-OH","витамин Д","vitamin D","25(OH)D","calcidiol"}', 'vitamin', 'ng/mL', 30, 100, 30, 100, 40),
('vitamin_b12', 'Vitamin B12', 'Витамин B12', '{"B12","витамин В12","cobalamin","кобаламин"}', 'vitamin', 'pg/mL', 200, 900, 200, 900, 41),
('ferritin', 'Ferritin', 'Ферритин', '{"ferritin","ферритин","ferritina"}', 'mineral', 'ng/mL', 30, 400, 13, 150, 42),
('iron', 'Iron', 'Железо', '{"Fe","железо","hierro","iron","сывороточное железо"}', 'mineral', 'umol/L', 11, 28, 7, 26, 43),

-- Воспаление
('crp', 'C-Reactive Protein', 'С-реактивный белок', '{"CRP","СРБ","С-реактивный","hs-CRP","PCR"}', 'inflammation', 'mg/L', 0, 5, 0, 5, 50),

-- Гликированный гемоглобин
('hba1c', 'HbA1c', 'Гликированный гемоглобин', '{"HbA1c","гликированный гемоглобин","glycated hemoglobin","A1C"}', 'metabolic', '%', 4, 5.6, 4, 5.6, 51),

-- Инсулин
('insulin', 'Insulin', 'Инсулин', '{"insulin","инсулин","insulina"}', 'hormone', 'mU/L', 2.6, 24.9, 2.6, 24.9, 52)

ON CONFLICT (canonical_name) DO NOTHING;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Автообновление updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Функция для сброса ежемесячного счётчика загрузок
CREATE OR REPLACE FUNCTION reset_monthly_uploads()
RETURNS void AS $$
BEGIN
    UPDATE accounts
    SET monthly_uploads = 0,
        monthly_uploads_reset_at = date_trunc('month', NOW()) + INTERVAL '1 month'
    WHERE monthly_uploads_reset_at <= NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STORAGE BUCKET (выполнить вручную в Supabase Dashboard)
-- ============================================
-- 1. Создать приватный бакет 'documents'
-- 2. Максимальный размер файла: 10MB
-- 3. Разрешённые типы: image/jpeg, image/png, image/webp, application/pdf
