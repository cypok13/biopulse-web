// ============================================
// Biopulse — AI Parsing Test Suite
// Тест на реальных документах
// ============================================

// ============================================
// ДОКУМЕНТ 1: IMG_4855.jpeg — CiTiLab, фото экрана
// Тип: Кровь + биохимия + ферменты
// Язык: Сербский
// Пациент: Evgenija Krasnova
// Дата рождения: 04.06.2020 (ребёнок ~5 лет)
// Дата анализа: 24.02.2024
// Лаборатория: CiTiLab
// ============================================

export const GROUND_TRUTH_DOC1 = {
  patient_name: "Evgenija Krasnova",
  test_date: "2024-02-24",
  lab_name: "CiTiLab",
  language: "sr",
  document_type: "blood_chemistry",
  patient_dob: "2020-06-04",
  patient_sex: "female",
  readings: [
    // ── Krvna slika i markeri inflamacije ──
    { name: "Leukociti(10)", value: 10.10, unit: "10^9/L", ref_min: null, ref_max: null, flag: "normal" },
    { name: "Neutrofili(%)", value: 4.80, unit: "10^9/L", ref_min: null, ref_max: null, flag: "normal" },
    { name: "Limfociti(%)", value: 4.33, unit: "10^9/L", ref_min: null, ref_max: null, flag: "normal" },
    { name: "Monociti", value: 0.63, unit: "10^9/L", ref_min: null, ref_max: null, flag: "normal" },
    { name: "Eozinofili", value: 0.18, unit: "10^9/L", ref_min: 0.0, ref_max: 0.7, flag: "normal" },
    { name: "Bazofili", value: 0.09, unit: "10^9/L", ref_min: null, ref_max: null, flag: "normal" },
    { name: "Neutrofili(%)", value: 47.5, unit: "%", ref_min: null, ref_max: null, flag: "normal" },
    { name: "Limfociti(%)", value: 39.3, unit: "%", ref_min: 40.0, ref_max: 60.0, flag: "low" },
    { name: "Monociti(%)", value: 6.2, unit: "%", ref_min: 0.0, ref_max: 8.0, flag: "normal" },
    { name: "Eozinofili(%)", value: 1.8, unit: "%", ref_min: null, ref_max: null, flag: "normal" },
    { name: "Eritrociti", value: 4.64, unit: "10^12/L", ref_min: null, ref_max: null, flag: "normal" },
    { name: "Hemoglobin", value: 11.8, unit: "g/dL", ref_min: null, ref_max: null, flag: "normal" },
    // Примечание: на фото видно "10*-12/L" — это 10^12/L для эритроцитов
    { name: "MCV", value: 83, unit: "fL", ref_min: 73.0, ref_max: 85.0, flag: "normal" },
    { name: "MCH", value: 27.0, unit: "pg", ref_min: 24.00, ref_max: 30.0, flag: "normal" },
    { name: "MCHC", value: 32.8, unit: "g/dL", ref_min: null, ref_max: null, flag: "normal" },
    { name: "MPV", value: 9.8, unit: "fL", ref_min: null, ref_max: null, flag: "normal" },
    { name: "Trombociti", value: 381, unit: "10^9/L", ref_min: 150, ref_max: 400, flag: "normal" },
    { name: "Hematokrit", value: 11.7, unit: "%", ref_min: null, ref_max: null, flag: "normal" },
    // Примечание: Hematokrit 11.7% выглядит подозрительно низким — возможно ошибка чтения, 
    // реальное значение может быть 37% или подобное. Это типичный кейс для AI-парсинга!
    { name: "CRP", value: 0.10, unit: "mg/L", ref_min: null, ref_max: 5.0, flag: "normal" },

    // ── Biohemijske analize ──
    { name: "Ukupni bilirubin", value: 10.7, unit: "µmol/L", ref_min: null, ref_max: null, flag: "normal" },
    
    // ── Anemija ──
    { name: "Gvožđe", value: 49.2, unit: "µmol/L", ref_min: 53.0, ref_max: 97.0, flag: "low" },
    // ВАЖНО: Gvožđe (железо) ниже нормы — ключевой показатель!
    { name: "Feritin", value: 23.5, unit: "ng/mL", ref_min: null, ref_max: null, flag: "normal" },

    // ── Enzimi ──
    { name: "Alkalna fosfataza", value: 55, unit: "U/L", ref_min: 28, ref_max: 100, flag: "normal" },
    { name: "ALT", value: 7, unit: "U/L", ref_min: null, ref_max: 500, flag: "normal" },
    // Примечание: на фото видно ещё AST, но значение трудно прочитать
  ],
};

// ============================================
// ДОКУМЕНТ 2: 60009814376.pdf — Beo-Lab, микробиология
// Тип: Паразитология стула
// Язык: Сербский
// Пациент: Krasnova Evgeniia
// Дата рождения: 04/06/2020
// Дата анализа: 18/02/2026
// Лаборатория: Beo-Lab
// ============================================

export const GROUND_TRUTH_DOC2 = {
  patient_name: "Krasnova Evgeniia",
  test_date: "2026-02-18",
  lab_name: "Beo-Lab",
  language: "sr",
  document_type: "microbiology",
  patient_dob: "2020-06-04",
  patient_sex: "female",
  readings: [
    // Микробиология — качественные результаты (не числовые)
    // Это важный edge case: наш парсер должен уметь обрабатывать
    // "Nalaz negativan" (результат отрицательный) как качественный результат
    { name: "Stolica - paraziti (helminti)", value: "negativan", unit: null, ref_min: null, ref_max: null, flag: "normal", qualitative: true },
    { name: "Cryptosporidium", value: "negativan", unit: null, ref_min: null, ref_max: null, flag: "normal", qualitative: true },
    { name: "Giardia", value: "negativan", unit: null, ref_min: null, ref_max: null, flag: "normal", qualitative: true },
    { name: "Entamoeba", value: "negativan", unit: null, ref_min: null, ref_max: null, flag: "normal", qualitative: true },
  ],
  notes: [
    "Nisu nađena jaja crevnih parazita",
    "Stolica - bakteriološka i mikološka kultura: u radu",
    "Rezultat verifikovao: Dr med. Mirjana Kovačević",
  ],
};

// ============================================
// INSIGHTS из анализа документов
// ============================================

export const PARSING_INSIGHTS = {
  doc1_challenges: [
    "Фото экрана телефона — низкое качество, отражения, наклон",
    "Часть данных обрезана по краям",
    "Hematokrit 11.7% — вероятно ошибка OCR (реально ~37%)",
    "Некоторые референтные значения не видны",
    "Единицы измерения '10*9/L' могут парситься как текст",
    "Два столбца Neutrofili/Limfociti — абсолютные и процентные",
    "Gvožđe (железо) 49.2 при норме 53.0-97.0 — LOW flag",
    "Специальные символы: µmol/L, 10^9/L, 10^12/L",
    "Дата в формате DD.MM.YYYY (сербский)",
  ],
  doc2_challenges: [
    "PDF с текстом — парсится легче чем фото",
    "Качественные (не числовые) результаты: 'Nalaz negativan'",
    "Нет числовых biomarker readings — только positive/negative",
    "Информация о бак.посеве 'u radu' (в работе) — partial result",
    "Имя в формате 'Презиме, Име' (фамилия, имя)",
    "JMBG (национальный ID) — sensitive data, не сохранять!",
  ],
  prompt_improvements: [
    "Добавить поддержку qualitative results (positive/negative)",
    "Добавить поле document_type: 'blood' | 'microbiology' | 'urine' | 'hormone'",
    "Добавить поле patient_dob если видно в документе",
    "Добавить поле patient_sex если видно в документе",
    "Валидация: если Hematokrit < 20%, пометить как 'needs_review'",
    "Парсинг сербских символов: Ž, đ, ć, č, š",
    "Поддержка partial results (status: 'u radu')",
    "Фильтрация JMBG и других PII из raw_text",
  ],
};

// ============================================
// ОБНОВЛЁННЫЙ AI-ПРОМПТ (v2)
// На основе тестирования реальных документов
// ============================================

export const PARSE_PROMPT_V2 = `You are a medical lab results parser. Extract structured data from the uploaded medical lab report.

RULES:
1. Extract patient's full name exactly as written (combine Prezime + Ime if separate)
2. Extract test date in ISO format (YYYY-MM-DD). Convert DD.MM.YYYY or DD/MM/YYYY to ISO
3. Extract lab/clinic name
4. Detect document language (sr, ru, en, de, etc.)
5. Detect document type: "blood", "biochemistry", "hormone", "microbiology", "urine", "other"
6. Extract patient date of birth if visible (ISO format)
7. Extract patient sex if visible: "male" or "female"

FOR EACH TEST RESULT:
- name: exactly as written in the document
- value: numeric value OR qualitative result string (e.g., "negativan", "positive")  
- value_numeric: true if value is a number, false if qualitative
- unit: unit of measurement (null if qualitative)
- ref_min: lower reference range (null if not provided)
- ref_max: upper reference range (null if not provided)
- flag: "normal" | "low" | "high" | "critical"

VALIDATION:
- If Hematocrit < 20% or > 65%, set flag to "needs_review" 
- If a value seems impossibly high/low for the biomarker, set flag to "needs_review"
- For qualitative results (negative/positive), flag is "normal" for negative, "abnormal" for positive

PRIVACY:
- Do NOT include national ID numbers (JMBG, SNILS, SSN, etc.)
- Do NOT include patient address

Return ONLY valid JSON:
{
  "patient_name": "string or null",
  "test_date": "YYYY-MM-DD or null",
  "lab_name": "string or null",
  "language": "string",
  "document_type": "string",
  "patient_dob": "YYYY-MM-DD or null",
  "patient_sex": "male or female or null",
  "partial_result": false,
  "readings": [
    {
      "name": "string",
      "value": "number or string",
      "value_numeric": true,
      "unit": "string or null",
      "ref_min": null,
      "ref_max": null,
      "flag": "normal"
    }
  ],
  "notes": ["string"]
}

No markdown. No text outside JSON. Use null for unknown values.`;

// ============================================
// Сравнение v1 vs v2 промпта
// ============================================

export const PROMPT_CHANGELOG = {
  added: [
    "document_type field — blood, microbiology, etc.",
    "patient_dob — дата рождения из документа",
    "patient_sex — пол из документа", 
    "value_numeric — флаг числовой/качественный результат",
    "qualitative results support — 'negativan', 'positive'",
    "partial_result field — для документов 'u radu'",
    "notes array — для дополнительных заметок из документа",
    "PRIVACY: фильтрация JMBG/national IDs",
    "VALIDATION: impossible values → needs_review",
  ],
  fixed: [
    "Date parsing: DD.MM.YYYY AND DD/MM/YYYY → ISO",
    "Name format: Prezime + Ime → full name",
    "Serbian special chars: Ž, đ, ć, č, š",
  ],
};
