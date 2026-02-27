import 'dotenv/config';
import { Bot, Context } from 'grammy';
import {
  getOrCreateAccount,
  findOrCreateProfile,
  createDocument,
  updateDocument,
  saveReadings,
  matchBiomarker,
  checkUploadLimit,
  incrementUploadCount,
  getProfiles,
  checkDuplicateDocument,
  supabase,
  convertToCanonicalUnit,
  smartNameKey,
} from './services/supabase';
import { parseLabDocument } from './services/ai-parser';
import type { Account, ParsedLabResult } from '../../shared/types';

// ============================================
// Multi-page document tracking (in-memory, resets on restart)
// ============================================

const MULTI_PAGE_WINDOW_MS = 2 * 60 * 1000; // 2 минуты

interface LastUploadState {
  documentId: string;
  profileId: string | null;
  patientName: string | null;
  labName: string | null;
  testDate: string | null;
  documentType: string | null;
  timestamp: number;
}

const lastUploadMap = new Map<string, LastUploadState>();

// ============================================
// Pending name selection state (Feature 7)
// ============================================

interface PendingNameState {
  documentId: string;
  parsed: ParsedLabResult;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  processingTimeMs: number;
  account: Account;
  chatId: number;
  remaining: number;
  isContinuation: boolean;
  continuationDocId: string | null;
  continuationProfileId: string | null;
  stage: 'select_profile' | 'enter_name';
  createdAt: number;
}

const pendingNameMap = new Map<string, PendingNameState>();

// ============================================
// Bot initialization
// ============================================

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

// ============================================
// /start command
// ============================================

bot.command('start', async (ctx) => {
  const account = await getOrCreateAccount(
    ctx.from!.id,
    ctx.from!.username,
    ctx.from!.first_name
  );

  const locale = account.locale || 'ru';

  const messages = {
    ru: `🫀 *Добро пожаловать в Biopulse!*

Я помогу тебе хранить и отслеживать результаты анализов для всей семьи.

*Как это работает:*
📸 Отправь мне фото или PDF анализов
🤖 Я автоматически распознаю все показатели
👤 Привяжу к профилю по имени из документа
📊 Покажу динамику в веб-дашборде

*Команды:*
/upload — загрузить анализ
/profiles — профили семьи
/dashboard — открыть веб-дашборд
/help — помощь
/lang — сменить язык

Просто отправь фото анализа — и я всё сделаю! 📋`,

    en: `🫀 *Welcome to Biopulse!*

I'll help you store and track lab results for your whole family.

*How it works:*
📸 Send me a photo or PDF of lab results
🤖 I'll automatically extract all biomarkers
👤 Match them to a profile by patient name
📊 View trends in the web dashboard

*Commands:*
/upload — upload lab results
/profiles — family profiles
/dashboard — open web dashboard
/help — help
/lang — change language

Just send a photo of your lab results — I'll handle the rest! 📋`,
  };

  await ctx.reply(messages[locale as 'ru' | 'en'] || messages.ru, {
    parse_mode: 'Markdown',
  });
});

// ============================================
// /profiles command
// ============================================

bot.command('profiles', async (ctx) => {
  const account = await getOrCreateAccount(ctx.from!.id, ctx.from!.username);
  const profiles = await getProfiles(account.id);

  if (profiles.length === 0) {
    await ctx.reply('У тебя пока нет профилей. Отправь первый анализ — профиль создастся автоматически по имени из документа! 📋');
    return;
  }

  let text = '👨‍👩‍👧‍👦 *Профили семьи:*\n\n';
  for (const p of profiles) {
    const badge = p.is_primary ? ' ⭐' : '';
    text += `• *${p.full_name}*${badge}\n`;
    if (p.date_of_birth) text += `  📅 ${p.date_of_birth}\n`;
    if (p.sex) text += `  ${p.sex === 'male' ? '♂️' : '♀️'}\n`;
    text += '\n';
  }

  await ctx.reply(text, { parse_mode: 'Markdown' });
});

// ============================================
// /dashboard command
// ============================================

bot.command('dashboard', async (ctx) => {
  const account = await getOrCreateAccount(ctx.from!.id, ctx.from!.username);
  const dashboardUrl = `${process.env.APP_URL}/d/${account.id}`;

  await ctx.reply(
    `📊 Твой дашборд:\n\n${dashboardUrl}\n\n_Здесь ты увидишь графики динамики, все профили и историю анализов._`,
    { parse_mode: 'Markdown' }
  );
});

// ============================================
// /lang command
// ============================================

bot.command('lang', async (ctx) => {
  await ctx.reply(
    'Выбери язык / Choose language:',
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🇷🇺 Русский', callback_data: 'lang_ru' },
            { text: '🇬🇧 English', callback_data: 'lang_en' },
          ],
          [
            { text: '🇷🇸 Srpski', callback_data: 'lang_sr' },
            { text: '🇩🇪 Deutsch', callback_data: 'lang_de' },
          ],
        ],
      },
    }
  );
});

bot.callbackQuery(/^lang_(.+)$/, async (ctx) => {
  const locale = ctx.match![1];
  const account = await getOrCreateAccount(ctx.from!.id, ctx.from!.username);

  await supabase
    .from('accounts')
    .update({ locale })
    .eq('id', account.id);

  const confirmations: Record<string, string> = {
    ru: '✅ Язык изменён на русский',
    en: '✅ Language changed to English',
    sr: '✅ Jezik promenjen na srpski',
    de: '✅ Sprache auf Deutsch geändert',
  };

  await ctx.answerCallbackQuery({ text: confirmations[locale] || '✅' });
  await ctx.editMessageText(confirmations[locale] || '✅ Done');
});

// ============================================
// Feature 7: Callback handler for profile selection
// ============================================

bot.callbackQuery(/^profile:(.+)$/, async (ctx) => {
  const profileData = ctx.match![1];
  const account = await getOrCreateAccount(ctx.from!.id, ctx.from!.username);
  const pending = pendingNameMap.get(account.id);

  await ctx.answerCallbackQuery();

  if (!pending) {
    await ctx.editMessageText('⏱️ Время ожидания истекло. Пожалуйста, загрузите документ ещё раз.');
    return;
  }

  if (Date.now() - pending.createdAt > 10 * 60 * 1000) {
    pendingNameMap.delete(account.id);
    await updateDocument(pending.documentId, { status: 'error', error_message: 'timeout' });
    await ctx.editMessageText('⏱️ Время ожидания истекло. Пожалуйста, загрузите документ ещё раз.');
    return;
  }

  if (profileData === 'new') {
    pending.stage = 'enter_name';
    await ctx.editMessageText('✏️ Введите имя пациента:');
  } else {
    pendingNameMap.delete(account.id);
    await ctx.editMessageText('⏳ Сохраняю анализ...');
    await completePendingDocument(pending, profileData, null);
  }
});

// ============================================
// /help command
// ============================================

bot.command('help', async (ctx) => {
  await ctx.reply(
`🫀 *Biopulse — Помощь* (@biopulse_lab_bot)

*Как загрузить анализ:*
1. Сфотографируй результат анализа
2. Отправь фото в этот чат
3. Бот распознает все показатели автоматически

*Многостраничные анализы:*
Отправляй страницы одного анализа подряд в течение 2 минут — бот автоматически объединит их в один документ и спишет только 1 кредит.

*Поддерживаемые форматы:*
📸 Фото (JPG, PNG)
📄 PDF документы

*Бот автоматически:*
• Находит имя пациента → привязывает к профилю
• Определяет дату анализа
• Извлекает все показатели с нормами
• Подсвечивает отклонения от нормы

*Команды:*
/start — начать
/profiles — профили семьи
/dashboard — веб-дашборд с графиками
/lang — сменить язык
/help — эта справка

_Документы могут быть на любом языке._`,
    { parse_mode: 'Markdown' }
  );
});

// ============================================
// Helper: save readings for a document
// ============================================

async function saveDocumentReadings(
  parsed: ParsedLabResult,
  targetDocId: string,
  profileId: string,
  fallbackDate?: string | null
): Promise<void> {
  if (!parsed.readings || parsed.readings.length === 0) return;

  const testedAt = parsed.test_date || fallbackDate || new Date().toISOString().split('T')[0];

  const readingsToSave = await Promise.all(
    parsed.readings.map(async (r) => {
      const bmMatch = await matchBiomarker(r.name);

      let numericValue: number | null = r.value_numeric ? Number(r.value) : null;
      let unit = r.unit || undefined;
      let refMin = r.ref_min || undefined;
      let refMax = r.ref_max || undefined;

      if (bmMatch?.unit_default && numericValue !== null && unit) {
        const converted = convertToCanonicalUnit(numericValue, unit, bmMatch.unit_default, bmMatch.canonical_name);
        if (converted.unit !== unit) {
          const factor = converted.value / numericValue;
          numericValue = converted.value;
          unit = converted.unit;
          if (refMin !== undefined) refMin = Math.round(refMin * factor * 10000) / 10000;
          if (refMax !== undefined) refMax = Math.round(refMax * factor * 10000) / 10000;
        }
      }

      return {
        document_id: targetDocId,
        profile_id: profileId,
        biomarker_id: bmMatch?.id || undefined,
        original_name: r.name,
        value: numericValue,
        value_text: !r.value_numeric ? String(r.value) : null,
        is_qualitative: !r.value_numeric,
        unit,
        ref_min: refMin,
        ref_max: refMax,
        flag: r.flag || 'normal',
        tested_at: testedAt,
      };
    })
  );

  await saveReadings(readingsToSave as any);
}

// ============================================
// Helper: build result message
// ============================================

function buildResultMessage(
  parsed: ParsedLabResult,
  isContinuation: boolean,
  remaining: number,
  model: string | null,
  overridePatientName?: string | null
): string {
  const readingsCount = parsed.readings?.length || 0;
  const flaggedCount = parsed.readings?.filter(r => r.flag !== 'normal').length || 0;

  let text: string;

  if (isContinuation) {
    text = `📎 *Продолжение анализа добавлено!*\n\n`;
    text += `📊 Добавлено показателей: *${readingsCount}*\n`;
  } else {
    text = `✅ *Анализ обработан!*\n\n`;

    const nameToShow = overridePatientName ?? parsed.patient_name;
    if (nameToShow) text += `👤 Пациент: *${nameToShow}*\n`;
    if (parsed.test_date) text += `📅 Дата: ${parsed.test_date}\n`;
    if (parsed.lab_name) text += `🏥 Лаборатория: ${parsed.lab_name}\n`;

    text += `\n📊 Найдено показателей: *${readingsCount}*\n`;
  }

  if (flaggedCount > 0) {
    text += `⚠️ Вне нормы: *${flaggedCount}*\n\n`;
    const flagged = parsed.readings?.filter(r => r.flag !== 'normal') || [];
    for (const r of flagged.slice(0, 10)) {
      const emoji = r.flag === 'high' ? '🔴↑' : r.flag === 'low' ? '🔵↓' : '⚠️';
      text += `${emoji} ${r.name}: *${r.value}* ${r.unit || ''}\n`;
    }
  } else if (!isContinuation) {
    text += `✅ Все показатели в норме\n`;
  }

  text += `\n📊 /dashboard — посмотреть графики`;
  if (!isContinuation) {
    text += `\n\n_Осталось загрузок: ${remaining - 1} | ${model}_`;
  }

  return text;
}

// ============================================
// Helper: complete pending document after name resolved (Feature 7)
// ============================================

async function completePendingDocument(
  pending: PendingNameState,
  profileId: string | null,
  newName: string | null
): Promise<void> {
  const { parsed, account, chatId, isContinuation, continuationDocId, documentId, model, remaining } = pending;

  let resolvedProfileId: string;
  let resolvedName: string | null = newName;

  if (profileId) {
    const { data } = await supabase.from('profiles').select('full_name').eq('id', profileId).single();
    resolvedProfileId = profileId;
    resolvedName = data?.full_name || null;
  } else if (newName) {
    const profile = await findOrCreateProfile(account.id, newName, account.locale);
    resolvedProfileId = profile.id;
    resolvedName = profile.full_name;
  } else {
    await bot.api.sendMessage(chatId, '❌ Не удалось определить профиль. Попробуйте загрузить документ ещё раз.');
    return;
  }

  let targetDocId: string;

  if (isContinuation && continuationDocId) {
    targetDocId = continuationDocId;
    await updateDocument(documentId, { status: 'done', parsed_name: 'Дополнительная страница', profile_id: resolvedProfileId });
  } else {
    await updateDocument(documentId, {
      status: 'done',
      profile_id: resolvedProfileId,
      parsed_name: resolvedName,
      parsed_date: parsed.test_date,
      lab_name: parsed.lab_name,
      language: parsed.language,
      document_type: parsed.document_type as any,
      ai_model: model,
      ai_tokens_in: pending.tokensIn,
      ai_tokens_out: pending.tokensOut,
      processing_time_ms: pending.processingTimeMs,
      parsed_json: parsed as any,
    });
    targetDocId = documentId;

    lastUploadMap.set(account.id, {
      documentId,
      profileId: resolvedProfileId,
      patientName: resolvedName,
      labName: parsed.lab_name || null,
      testDate: parsed.test_date || null,
      documentType: parsed.document_type || null,
      timestamp: Date.now(),
    });
  }

  await saveDocumentReadings(parsed, targetDocId, resolvedProfileId);

  if (!isContinuation) {
    await incrementUploadCount(account.id, account.monthly_uploads);
  }

  const text = buildResultMessage(parsed, isContinuation, remaining, model, resolvedName);
  await bot.api.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

// ============================================
// Core: async document processing
// ============================================

async function processDocumentAsync(params: {
  chatId: number;
  statusMsgId: number;
  account: Account;
  remaining: number;
  documentId: string;
  base64: string;
  mimeType: string;
}): Promise<void> {
  const { chatId, statusMsgId, account, remaining, documentId, base64, mimeType } = params;

  const deleteSatus = async () => {
    try { await bot.api.deleteMessage(chatId, statusMsgId); } catch {}
  };

  try {
    // 1. AI parsing
    const { result, model, tokensIn, tokensOut, processingTimeMs } = await parseLabDocument(base64, mimeType, undefined, account.locale);

    // 2. Feature 6: No readings → error, no credit
    if (!result.readings || result.readings.length === 0) {
      await updateDocument(documentId, { status: 'error', error_message: 'no_readings' });
      await deleteSatus();
      await bot.api.sendMessage(chatId,
        `❌ Не удалось извлечь показатели из документа.\n\n` +
        `Попробуйте:\n• Сфотографировать чётче / без бликов\n• Загрузить PDF вместо фото\n• Убедитесь, что это медицинский анализ`
      );
      return;
    }

    // 3. Feature 4: Duplicate check → reject, no credit
    const isDuplicate = await checkDuplicateDocument(account.id, result.patient_name, result.test_date, result.document_type);
    if (isDuplicate) {
      await updateDocument(documentId, { status: 'error', error_message: 'duplicate' });
      await deleteSatus();
      await bot.api.sendMessage(chatId,
        `⚠️ Этот анализ уже загружен.\n\nДубликат не сохранён, кредит не списан.`
      );
      return;
    }

    // 4. Feature 2.2: Multi-page detection (2-minute window, context matching)
    const lastState = lastUploadMap.get(account.id);
    const withinWindow = lastState && (Date.now() - lastState.timestamp) < MULTI_PAGE_WINDOW_MS;

    let isContinuation = false;
    let continuationDocId: string | null = null;
    let continuationProfileId: string | null = null;

    if (withinWindow && lastState) {
      const noName = !result.patient_name;
      const sameName = !!(result.patient_name && lastState.patientName &&
        smartNameKey(result.patient_name) === smartNameKey(lastState.patientName));
      const noLab = !result.lab_name;
      const sameLab = !!(result.lab_name && lastState.labName &&
        result.lab_name.toLowerCase().substring(0, 6) === lastState.labName.toLowerCase().substring(0, 6));
      const sameDocType = !!(result.document_type && lastState.documentType &&
        result.document_type === lastState.documentType);
      const sameDate = !!(result.test_date && lastState.testDate &&
        result.test_date === lastState.testDate);

      // Continuation: name matches (or absent) AND at least one context field matches
      if ((noName || sameName) && (noLab || sameLab || sameDocType || sameDate)) {
        // Only count as continuation if we have a resolved profile to attach to
        if (lastState.profileId) {
          isContinuation = true;
          continuationDocId = lastState.documentId;
          continuationProfileId = lastState.profileId;
          // Extend window for further pages
          lastUploadMap.set(account.id, { ...lastState, timestamp: Date.now() });
        }
      }
    }

    // 5. Feature 7: No patient name → ask user (only if not continuation with known profile)
    if (!isContinuation && !result.patient_name) {
      const profiles = await getProfiles(account.id);
      await deleteSatus();

      const inlineKeyboard = {
        inline_keyboard: [
          ...profiles.map(p => [{ text: p.full_name, callback_data: `profile:${p.id}` }]),
          [{ text: '➕ Добавить нового человека', callback_data: 'profile:new' }],
        ],
      };

      const question = profiles.length > 0
        ? `🤔 Не удалось определить пациента.\n\nДля кого эти анализы?`
        : `🤔 Не удалось определить пациента.\n\nКак зовут пациента?`;

      await bot.api.sendMessage(chatId, question, { reply_markup: inlineKeyboard });

      pendingNameMap.set(account.id, {
        documentId,
        parsed: result,
        model,
        tokensIn,
        tokensOut,
        processingTimeMs,
        account,
        chatId,
        remaining,
        isContinuation: false,
        continuationDocId: null,
        continuationProfileId: null,
        stage: 'select_profile',
        createdAt: Date.now(),
      });

      return;
    }

    // 6. Find or create profile
    let profileId: string | null = isContinuation ? continuationProfileId : null;
    if (!isContinuation && result.patient_name) {
      const profile = await findOrCreateProfile(account.id, result.patient_name, account.locale);
      profileId = profile.id;
    }

    // 7. Update document / handle continuation
    let targetDocId: string;

    if (isContinuation && continuationDocId) {
      targetDocId = continuationDocId;
      await updateDocument(documentId, {
        status: 'done',
        parsed_name: 'Дополнительная страница',
        profile_id: profileId,
      });
    } else {
      await updateDocument(documentId, {
        status: 'done',
        profile_id: profileId,
        parsed_name: result.patient_name,
        parsed_date: result.test_date,
        lab_name: result.lab_name,
        language: result.language,
        document_type: result.document_type as any,
        ai_model: model,
        ai_tokens_in: tokensIn,
        ai_tokens_out: tokensOut,
        processing_time_ms: processingTimeMs,
        parsed_json: result as any,
      });
      targetDocId = documentId;

      lastUploadMap.set(account.id, {
        documentId,
        profileId,
        patientName: result.patient_name || null,
        labName: result.lab_name || null,
        testDate: result.test_date || null,
        documentType: result.document_type || null,
        timestamp: Date.now(),
      });
    }

    // 8. Save readings
    if (profileId) {
      await saveDocumentReadings(result, targetDocId, profileId, lastState?.testDate);
    }

    // 9. Increment upload count (skip for continuation pages)
    if (!isContinuation) {
      await incrementUploadCount(account.id, account.monthly_uploads);
    }

    // 10. Send result
    const text = buildResultMessage(result, isContinuation, remaining, model);
    await deleteSatus();
    await bot.api.sendMessage(chatId, text, { parse_mode: 'Markdown' });

  } catch (error: any) {
    console.error('[ERROR] processDocumentAsync:', error);
    await deleteSatus();
    await bot.api.sendMessage(chatId,
      `❌ Ошибка обработки: ${error.message}\n\nПопробуй отправить документ ещё раз или в другом формате (фото/PDF).`
    );
    try { await updateDocument(documentId, { status: 'error', error_message: error.message }); } catch {}
  }
}

// ============================================
// Photo/Document handler — CORE FEATURE
// ============================================

async function handleLabUpload(ctx: Context, fileId: string, mimeType: string) {
  const account = await getOrCreateAccount(
    ctx.from!.id,
    ctx.from!.username,
    ctx.from!.first_name
  );

  // Проверяем лимит загрузок
  const { allowed, remaining } = await checkUploadLimit(account);
  if (!allowed) {
    await ctx.reply(
      `⚠️ Лимит бесплатных загрузок исчерпан (${account.plan === 'free' ? '3/мес' : '—'}).\n\n` +
      `Подключи Pro для безлимитных загрузок: /upgrade`,
    );
    return;
  }

  // Feature 5: Send immediate ack
  const statusMsg = await ctx.reply('✅ Получил! Обрабатываю... ⏳');
  const chatId = ctx.chat!.id;

  try {
    // Скачиваем файл из Telegram
    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

    const response = await fetch(fileUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    const base64 = buffer.toString('base64');

    // Загружаем оригинал в Supabase Storage
    const storagePath = `${account.id}/${Date.now()}_${file.file_path?.split('/').pop() || 'upload'}`;

    await supabase.storage
      .from('documents')
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    // Создаём запись документа
    const doc = await createDocument({
      accountId: account.id,
      storagePath,
      fileType: mimeType,
      fileSize: buffer.length,
      source: 'telegram',
    });

    await updateDocument(doc.id, { status: 'processing' });

    // Feature 5: Fire async processing without awaiting
    processDocumentAsync({
      chatId,
      statusMsgId: statusMsg.message_id,
      account,
      remaining,
      documentId: doc.id,
      base64,
      mimeType,
    }).catch(async (err) => {
      console.error('[ERROR] processDocumentAsync unhandled:', err);
      try { await bot.api.deleteMessage(chatId, statusMsg.message_id); } catch {}
      await bot.api.sendMessage(chatId, '❌ Ошибка обработки. Попробуйте ещё раз.');
    });

  } catch (error: any) {
    console.error('[ERROR] handleLabUpload sync:', error);
    try { await ctx.api.deleteMessage(chatId, statusMsg.message_id); } catch {}
    await ctx.reply(`❌ Не удалось загрузить файл: ${error.message}`);
  }
}

// Photo handler
bot.on('message:photo', async (ctx) => {
  const photo = ctx.message.photo;
  const largest = photo[photo.length - 1]; // самое большое разрешение
  await handleLabUpload(ctx, largest.file_id, 'image/jpeg');
});

// Document handler (PDF)
bot.on('message:document', async (ctx) => {
  const doc = ctx.message.document;
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

  if (!doc.mime_type || !allowedTypes.includes(doc.mime_type)) {
    await ctx.reply('⚠️ Поддерживаемые форматы: JPG, PNG, PDF. Отправь фото анализа или PDF-файл.');
    return;
  }

  await handleLabUpload(ctx, doc.file_id, doc.mime_type);
});

// ============================================
// Fallback for text messages (Feature 7: handle name input)
// ============================================

bot.on('message:text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;

  const account = await getOrCreateAccount(ctx.from!.id, ctx.from!.username);
  const pending = pendingNameMap.get(account.id);

  if (pending) {
    // Check expiry (10 minutes)
    if (Date.now() - pending.createdAt > 10 * 60 * 1000) {
      pendingNameMap.delete(account.id);
      await updateDocument(pending.documentId, { status: 'error', error_message: 'timeout' });
      await ctx.reply('⏱️ Время ожидания истекло. Пожалуйста, загрузите документ ещё раз.');
      return;
    }

    if (pending.stage === 'enter_name') {
      const name = ctx.message.text.trim();
      if (name.length < 2) {
        await ctx.reply('❌ Пожалуйста, введите корректное имя (минимум 2 символа).');
        return;
      }
      pendingNameMap.delete(account.id);
      await completePendingDocument(pending, null, name);
      return;
    }
  }

  await ctx.reply(
    '📋 Отправь мне фото или PDF анализа — я обработаю его автоматически!\n\nИли используй /help для справки.'
  );
});

// ============================================
// Error handling
// ============================================

bot.catch((err) => {
  console.error('[BOT ERROR]', err);
});

// ============================================
// Start bot
// ============================================

async function main() {
  console.log('🫀 Biopulse bot starting...');

  if (process.env.TELEGRAM_MODE === 'webhook') {
    console.log('Mode: webhook');
  } else {
    console.log('Mode: polling');
    await bot.start({
      onStart: () => console.log('✅ Biopulse bot is running!'),
    });
  }
}

main().catch(console.error);
