import 'dotenv/config';
import { Bot, Context, InputFile } from 'grammy';
import {
  getOrCreateAccount,
  findOrCreateProfile,
  createDocument,
  updateDocument,
  saveReadings,
  matchBiomarker,
  checkUploadLimit,
  getProfiles,
  supabase,
  convertToCanonicalUnit,
  smartNameKey,
} from './services/supabase';
import { parseLabDocument } from './services/ai-parser';

// ============================================
// Multi-page document tracking (in-memory, resets on restart)
// ============================================

const MULTI_PAGE_WINDOW_MS = 5 * 60 * 1000; // 5 минут

interface LastUploadState {
  documentId: string;
  profileId: string | null;
  patientName: string | null;
  labName: string | null;
  testDate: string | null;
  timestamp: number;
}

const lastUploadMap = new Map<string, LastUploadState>();

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

  // Сообщаем что начали обработку
  const statusMsg = await ctx.reply('🔄 Обрабатываю документ... Это займёт 10-30 секунд.');

  try {
    // 1. Скачиваем файл из Telegram
    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    
    const response = await fetch(fileUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    const base64 = buffer.toString('base64');

    // 2. Загружаем оригинал в Supabase Storage
    const storagePath = `${account.id}/${Date.now()}_${file.file_path?.split('/').pop() || 'upload'}`;
    
    await supabase.storage
      .from('documents')
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    // 3. Создаём запись документа
    const doc = await createDocument({
      accountId: account.id,
      storagePath,
      fileType: mimeType,
      fileSize: buffer.length,
      source: 'telegram',
    });

    // 4. Обновляем статус
    await updateDocument(doc.id, { status: 'processing' });

    // 5. AI парсинг
    const { result, model, tokensIn, tokensOut, processingTimeMs } = await parseLabDocument(base64, mimeType, undefined, account.locale);

    // 5b. Проверяем: не является ли это продолжением предыдущего документа (в течение 5 мин)
    const lastState = lastUploadMap.get(account.id);
    const withinWindow = lastState && (Date.now() - lastState.timestamp) < MULTI_PAGE_WINDOW_MS;

    let isContinuation = false;
    let continuationDocId: string | null = null;
    let continuationProfileId: string | null = null;

    if (withinWindow && lastState) {
      // Считаем продолжением если: имя пациента отсутствует ИЛИ совпадает, И лаборатория совпадает
      const noName = !result.patient_name;
      const sameName = result.patient_name && lastState.patientName &&
        smartNameKey(result.patient_name) === smartNameKey(lastState.patientName);
      const noLab = !result.lab_name;
      const sameLab = result.lab_name && lastState.labName &&
        result.lab_name.toLowerCase().substring(0, 6) === lastState.labName.toLowerCase().substring(0, 6);

      if ((noName || sameName) && (noLab || sameLab)) {
        isContinuation = true;
        continuationDocId = lastState.documentId;
        continuationProfileId = lastState.profileId;
        // Продлеваем окно для следующих страниц
        lastUploadMap.set(account.id, { ...lastState, timestamp: Date.now() });
      }
    }

    // 6. Находим или создаём профиль (только для нового документа)
    let profileId: string | null = isContinuation ? continuationProfileId : null;
    if (!isContinuation && result.patient_name) {
      const profile = await findOrCreateProfile(account.id, result.patient_name, account.locale);
      profileId = profile.id;
    }

    // 7. Создаём/обновляем документ
    let targetDocId: string;
    if (isContinuation && continuationDocId) {
      targetDocId = continuationDocId;
      // Добавляем страницу в Storage но к тому же документу не добавляем запись
    } else {
      await updateDocument(doc.id, {
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
      targetDocId = doc.id;

      // Запоминаем для многостраничной детекции
      lastUploadMap.set(account.id, {
        documentId: doc.id,
        profileId,
        patientName: result.patient_name || null,
        labName: result.lab_name || null,
        testDate: result.test_date || null,
        timestamp: Date.now(),
      });
    }

    // 8. Сохраняем показатели (с конвертацией единиц и нечётким матчингом биомаркеров)
    if (result.readings && result.readings.length > 0 && profileId) {
      const testedAt = result.test_date || (lastState?.testDate) || new Date().toISOString().split('T')[0];

      const readingsToSave = await Promise.all(
        result.readings.map(async (r) => {
          const bmMatch = await matchBiomarker(r.name);

          let numericValue: number | null = r.value_numeric ? Number(r.value) : null;
          let unit = r.unit || undefined;
          let refMin = r.ref_min || undefined;
          let refMax = r.ref_max || undefined;

          // Конвертация единиц в canonical если нужно
          if (bmMatch?.unit_default && numericValue !== null && unit) {
            const converted = convertToCanonicalUnit(numericValue, unit, bmMatch.unit_default, bmMatch.canonical_name);
            if (converted.unit !== unit) {
              // Пересчитываем референсные значения с тем же коэффициентом
              const factor = converted.value / numericValue;
              numericValue = converted.value;
              unit = converted.unit;
              if (refMin !== undefined) refMin = Math.round(refMin * factor * 10000) / 10000;
              if (refMax !== undefined) refMax = Math.round(refMax * factor * 10000) / 10000;
            }
          }

          return {
            document_id: targetDocId,
            profile_id: profileId!,
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

    // Если продолжение — дополнительная страница в Storage не требует отдельного счётчика
    if (!isContinuation) {
      // 9. Обновляем счётчик загрузок
      await supabase
        .from('accounts')
        .update({ monthly_uploads: account.monthly_uploads + 1 })
        .eq('id', account.id);
    } else {
      // Помечаем вспомогательный документ как обработанный (он уже создан как pending)
      await updateDocument(doc.id, { status: 'done', parsed_name: 'Дополнительная страница' });
    }

    // 10. Формируем ответ
    const readingsCount = result.readings?.length || 0;
    const flaggedCount = result.readings?.filter(r => r.flag !== 'normal').length || 0;

    let responseText: string;

    if (isContinuation) {
      responseText = `📎 *Продолжение анализа добавлено!*\n\n`;
      responseText += `📊 Добавлено показателей: *${readingsCount}*\n`;
    } else {
      responseText = `✅ *Анализ обработан!*\n\n`;

      if (result.patient_name) {
        responseText += `👤 Пациент: *${result.patient_name}*\n`;
      }
      if (result.test_date) {
        responseText += `📅 Дата: ${result.test_date}\n`;
      }
      if (result.lab_name) {
        responseText += `🏥 Лаборатория: ${result.lab_name}\n`;
      }

      responseText += `\n📊 Найдено показателей: *${readingsCount}*\n`;
    }

    if (flaggedCount > 0) {
      responseText += `⚠️ Вне нормы: *${flaggedCount}*\n\n`;

      const flagged = result.readings?.filter(r => r.flag !== 'normal') || [];
      for (const r of flagged.slice(0, 10)) {
        const emoji = r.flag === 'high' ? '🔴↑' : r.flag === 'low' ? '🔵↓' : '⚠️';
        responseText += `${emoji} ${r.name}: *${r.value}* ${r.unit || ''}\n`;
      }
    } else if (!isContinuation) {
      responseText += `✅ Все показатели в норме\n`;
    }

    responseText += `\n📊 /dashboard — посмотреть графики`;
    if (!isContinuation) {
      responseText += `\n\n_Осталось загрузок: ${remaining - 1} | ${model}_`;
    }

    // Удаляем сообщение о обработке и отправляем результат
    await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id);
    await ctx.reply(responseText, { parse_mode: 'Markdown' });

  } catch (error: any) {
    console.error('[ERROR] Lab upload failed:', error);
    await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id);
    await ctx.reply(
      `❌ Ошибка обработки: ${error.message}\n\nПопробуй отправить документ ещё раз или в другом формате (фото/PDF).`
    );
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
// /help command
// ============================================

bot.command('help', async (ctx) => {
  await ctx.reply(
`🫀 *Biopulse — Помощь*

*Как загрузить анализ:*
1. Сфотографируй результат анализа
2. Отправь фото в этот чат
3. Бот распознает все показатели автоматически

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
// Fallback for text messages
// ============================================

bot.on('message:text', async (ctx) => {
  // Ignore commands (already handled)
  if (ctx.message.text.startsWith('/')) return;

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
    // Webhook mode (production)
    console.log('Mode: webhook');
    // bot.api.setWebhook(process.env.TELEGRAM_WEBHOOK_URL!);
    // Webhook handler будет в Next.js API route
  } else {
    // Polling mode (development)
    console.log('Mode: polling');
    await bot.start({
      onStart: () => console.log('✅ Biopulse bot is running!'),
    });
  }
}

main().catch(console.error);
