import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import pdfParse = require('pdf-parse');
import type { ParsedLabResult } from '../../../shared/types';

// ============================================
// AI Parser — Claude Vision + GPT-4o
// ============================================

function buildParsePrompt(locale: string): string {
  const nameScriptInstruction = locale === 'ru'
    ? 'Return patient_name in Cyrillic (Russian) script. If the name is in Latin, transliterate it to Russian Cyrillic (e.g., "Krasnova Evgeniia" → "Краснова Евгения").'
    : 'Return patient_name in Latin script. If the name is in Cyrillic, transliterate it to Latin (e.g., "Краснова Евгения" → "Krasnova Evgenia").';

  return `You are a medical lab results parser. Extract structured data from the uploaded medical lab report.

RULES:
1. Extract patient's full name. If "Prezime" (surname) and "Ime" (name) are separate, combine as "Surname Firstname". ${nameScriptInstruction}
2. Extract test date in ISO format (YYYY-MM-DD). Convert DD.MM.YYYY or DD/MM/YYYY to ISO
3. Extract lab/clinic name
4. Detect document language (sr, ru, en, de, etc.)
5. Detect document type: "blood", "biochemistry", "hormone", "microbiology", "urine", "other"
6. Extract patient date of birth if visible (ISO format)
7. Extract patient sex if visible: "male" or "female"

FOR EACH TEST RESULT:
- name: exactly as written in the document
- value: numeric value OR qualitative result string (e.g., "negativan", "negative", "positive", "не обнаружено")
- value_numeric: true if value is a number, false if qualitative
- unit: unit of measurement (null if qualitative)
- ref_min: lower reference range number (null if not provided or qualitative)
- ref_max: upper reference range number (null if not provided or qualitative)
- flag: "normal" | "low" | "high" | "critical" | "needs_review"

VALIDATION:
- If Hematocrit < 20% or > 65%, set flag to "needs_review"
- If a numeric value seems impossibly wrong for the biomarker, set flag to "needs_review"
- For qualitative results (negative/positive/negativan/pozitivan), flag is "normal" for negative, "abnormal" for positive
- Compare numeric values to ref ranges to determine low/high flags

PRIVACY — do NOT include in output:
- National ID numbers (JMBG, SNILS, SSN, ИНН)
- Patient address
- Protocol/barcode numbers

Return ONLY valid JSON:
{
  "patient_name": "string or null",
  "test_date": "YYYY-MM-DD or null",
  "lab_name": "string or null",
  "language": "string",
  "document_type": "blood | biochemistry | hormone | microbiology | urine | other",
  "patient_dob": "YYYY-MM-DD or null",
  "patient_sex": "male | female | null",
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

No markdown formatting. No text outside the JSON object. Use null for unknown values.`;
}

// ============================================
// PDF text extraction helper
// ============================================

async function extractPdfText(base64: string): Promise<string> {
  const buffer = Buffer.from(base64, 'base64');
  const data = await pdfParse(buffer);
  return data.text || '';
}

// ============================================
// Claude Vision Parser
// ============================================

async function parseWithClaude(imageBase64: string, mimeType: string, prompt: string): Promise<{
  result: ParsedLabResult;
  model: string;
  tokensIn: number;
  tokensOut: number;
}> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  let contentBlock: any;

  if (mimeType === 'application/pdf') {
    // Claude supports PDFs natively via the document API
    contentBlock = {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: imageBase64,
      },
    };
  } else {
    contentBlock = {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
        data: imageBase64,
      },
    };
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          contentBlock,
          { type: 'text', text: prompt },
        ],
      },
    ],
  } as any);

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  const jsonStr = textContent.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const result = JSON.parse(jsonStr) as ParsedLabResult;

  return {
    result,
    model: 'claude-sonnet-4-5',
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
  };
}

// ============================================
// GPT-4o Vision Parser
// ============================================

async function parseWithOpenAI(imageBase64: string, mimeType: string, prompt: string): Promise<{
  result: ParsedLabResult;
  model: string;
  tokensIn: number;
  tokensOut: number;
}> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  let messageContent: OpenAI.Chat.ChatCompletionContentPart[];

  if (mimeType === 'application/pdf') {
    // GPT-4o doesn't support PDFs via image_url — extract text instead
    const pdfText = await extractPdfText(imageBase64);
    if (!pdfText || pdfText.trim().length < 30) {
      throw new Error(
        'Не удалось извлечь текст из PDF (возможно, это сканированный документ). ' +
        'Пожалуйста, отправь фото документа.'
      );
    }
    messageContent = [
      {
        type: 'text',
        text: `Текст медицинского документа (PDF):\n\n${pdfText}\n\n${prompt}`,
      },
    ];
  } else {
    messageContent = [
      {
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${imageBase64}`,
        },
      },
      { type: 'text', text: prompt },
    ];
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 4096,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: messageContent,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('No response from OpenAI');

  const result = JSON.parse(content) as ParsedLabResult;

  return {
    result,
    model: 'gpt-4o',
    tokensIn: response.usage?.prompt_tokens || 0,
    tokensOut: response.usage?.completion_tokens || 0,
  };
}

// ============================================
// Main Parser (A/B provider selection)
// ============================================

export async function parseLabDocument(
  imageBase64: string,
  mimeType: string,
  provider?: 'claude' | 'openai',
  locale?: string
): Promise<{
  result: ParsedLabResult;
  model: string;
  tokensIn: number;
  tokensOut: number;
  processingTimeMs: number;
}> {
  const startTime = Date.now();
  const prompt = buildParsePrompt(locale || 'en');

  // Определяем провайдера
  const aiProvider = provider || process.env.AI_PROVIDER || 'claude';

  let parseResult;

  if (aiProvider === 'both') {
    // A/B тест: случайный выбор
    const useClaude = Math.random() > 0.5;
    console.log(`[AI] A/B test: using ${useClaude ? 'Claude' : 'OpenAI'}`);

    try {
      parseResult = useClaude
        ? await parseWithClaude(imageBase64, mimeType, prompt)
        : await parseWithOpenAI(imageBase64, mimeType, prompt);
    } catch (error) {
      // Fallback на другой провайдер
      console.warn(`[AI] Primary failed, trying fallback...`);
      parseResult = useClaude
        ? await parseWithOpenAI(imageBase64, mimeType, prompt)
        : await parseWithClaude(imageBase64, mimeType, prompt);
    }
  } else if (aiProvider === 'openai') {
    parseResult = await parseWithOpenAI(imageBase64, mimeType, prompt);
  } else {
    parseResult = await parseWithClaude(imageBase64, mimeType, prompt);
  }

  const processingTimeMs = Date.now() - startTime;
  console.log(`[AI] Parsed in ${processingTimeMs}ms using ${parseResult.model}: ${parseResult.result.readings.length} readings`);

  return { ...parseResult, processingTimeMs };
}

// ============================================
// PDF to images (для будущей поддержки PDF)
// ============================================

export async function pdfPageToBase64(pdfBuffer: Buffer): Promise<string> {
  // Для MVP: отправляем PDF как есть в Claude (он поддерживает PDF)
  // Для OpenAI: нужна конвертация в изображение
  return pdfBuffer.toString('base64');
}
