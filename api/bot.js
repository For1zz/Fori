
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const TELEGRAM_TOKEN = process.env.BOT_TOKEN;

const DAYS = {
  Monday: 'Понедельник',
  Tuesday: 'Вторник',
  Wednesday: 'Среда',
  Thursday: 'Четверг',
  Friday: 'Пятница',
  Saturday: 'Суббота',
  Sunday: 'Воскресенье'
};

async function telegram(method, body) {
  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/${method}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );

  return response.json();
}

async function sendMessage(chatId, text, keyboard = null) {
  const body = { chat_id: chatId, text };

  if (keyboard) {
    body.reply_markup = {
      inline_keyboard: keyboard
    };
  }

  return telegram('sendMessage', body);
}

// МЕНЮ
async function showMenu(chatId) {
  const keyboard = [
    [
      { text: '📅 Понедельник', callback_data: 'day_Monday' },
      { text: '📅 Вторник', callback_data: 'day_Tuesday' }
    ],
    [
      { text: '📅 Среда', callback_data: 'day_Wednesday' },
      { text: '📅 Четверг', callback_data: 'day_Thursday' }
    ],
    [
      { text: '📅 Пятница', callback_data: 'day_Friday' }
    ],
    [
      { text: '📍 Сегодня', callback_data: 'today' },
      { text: '⏱ Сейчас', callback_data: 'now' }
    ]
  ];

  await sendMessage(
    chatId,
    '📚 Расписание ПО-42\n\nВыбери день недели:',
    keyboard
  );
}

// РАСПИСАНИЕ НА ДЕНЬ
async function showSchedule(chatId, day) {
  try {
    const { data, error } = await supabase
      .from('schedule')
      .select('*')
      .eq('group_name', 'ПО-42')
      .eq('day_of_week', day)
      .order('lesson_number');

    if (error) {
      console.error(error);
      await sendMessage(chatId, `❌ Ошибка базы:\n${error.message}`);
      return;
    }

    const dayName = DAYS[day] || day;

    if (!data || data.length === 0) {
      await sendMessage(
        chatId,
        `📅 ${dayName}\n\nНа этот день занятий нет.`,
        [[
          { text: '⬅️ Меню', callback_data: 'menu' }
        ]]
      );

      return;
    }

    let reply = `📚 Расписание ПО-42\n📅 ${dayName}\n\n`;

    for (const lesson of data) {
      reply += `${lesson.lesson_number}. ${lesson.subject_name}\n`;

      if (lesson.start_time && lesson.end_time) {
        reply += `⏰ ${String(lesson.start_time).slice(0, 5)} – ${String(lesson.end_time).slice(0, 5)}\n`;
      }

      if (lesson.room) {
        reply += `🏫 Кабинет: ${lesson.room}\n`;
      }

      if (lesson.teacher_name) {
        reply += `👨‍🏫 ${lesson.teacher_name}\n`;
      }

      reply += '\n';
    }

    await sendMessage(
      chatId,
      reply,
      [[
        { text: '⬅️ Выбрать другой день', callback_data: 'menu' }
      ]]
    );

  } catch (error) {
    console.error(error);
    await sendMessage(chatId, `❌ Ошибка:\n${error.message}`);
  }
}

// ВРЕМЯ КАЗАХСТАНА
function getKazakhstanTime() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Almaty',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());

  const values = {};

  for (const part of parts) {
    values[part.type] = part.value;
  }

  return {
    day: values.weekday,
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
}

function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  if (h > 0) return `${h} ч. ${m} мин.`;
  return `${m} мин.`;
}

// ФУНКЦИЯ СЕЙЧАС
async function showNow(chatId) {
  try {
    const current = getKazakhstanTime();
    const currentMinutes = current.hour * 60 + current.minute;
    const day = current.day;

    const { data, error } = await supabase
      .from('schedule')
      .select('*')
      .eq('group_name', 'ПО-42')
      .eq('day_of_week', day)
      .order('lesson_number');

    if (error) {
      await sendMessage(chatId, `❌ Ошибка базы:\n${error.message}`);
      return;
    }

    if (!data || data.length === 0) {
      await sendMessage(
        chatId,
        `📅 ${DAYS[day] || day}\n\nСегодня занятий нет.`,
        [[
          { text: '⬅️ Меню', callback_data: 'menu' }
        ]]
      );

      return;
    }

    const lessons = data
      .filter(lesson => lesson.start_time && lesson.end_time)
      .map(lesson => ({
        ...lesson,
        start: Number(String(lesson.start_time).slice(0, 2)) * 60 +
          Number(String(lesson.start_time).slice(3, 5)),
        end: Number(String(lesson.end_time).slice(0, 2)) * 60 +
          Number(String(lesson.end_time).slice(3, 5))
      }))
      .sort((a, b) => a.start - b.start);

    const currentLesson = lessons.find(
      lesson => currentMinutes >= lesson.start &&
                currentMinutes < lesson.end
    );

    if (currentLesson) {
      let reply = `🔴 СЕЙЧАС ИДЁТ ПАРА\n\n`;
      reply += `📅 ${DAYS[day]}\n`;
      reply += `${currentLesson.lesson_number}. ${currentLesson.subject_name}\n`;
      reply += `⏰ ${String(currentLesson.start_time).slice(0, 5)} – ${String(currentLesson.end_time).slice(0, 5)}\n`;

      if (currentLesson.room) {
        reply += `🏫 Кабинет: ${currentLesson.room}\n`;
      }

      if (currentLesson.teacher_name) {
        reply += `👨‍🏫 ${currentLesson.teacher_name}\n`;
      }

      reply += `\n⏳ До конца: ${formatMinutes(currentLesson.end - currentMinutes)}`;

      await sendMessage(chatId, reply, [[
        { text: '⬅️ Меню', callback_data: 'menu' }
      ]]);

      return;
    }

    const nextLesson = lessons.find(
      lesson => lesson.start > currentMinutes
    );

    if (nextLesson) {
      let reply = `🟡 ПЕРЕМЕНА\n\n`;
      reply += `📅 ${DAYS[day]}\n`;
      reply += `Следующая пара:\n\n`;
      reply += `${nextLesson.lesson_number}. ${nextLesson.subject_name}\n`;
      reply += `⏰ ${String(nextLesson.start_time).slice(0, 5)} – ${String(nextLesson.end_time).slice(0, 5)}\n`;

      if (nextLesson.room) {
        reply += `🏫 Кабинет: ${nextLesson.room}\n`;
      }

      if (nextLesson.teacher_name) {
        reply += `👨‍🏫 ${nextLesson.teacher_name}\n`;
      }

      reply += `\n⏳ До начала: ${formatMinutes(nextLesson.start - currentMinutes)}`;

      await sendMessage(chatId, reply, [[
        { text: '⬅️ Меню', callback_data: 'menu' }
      ]]);

      return;
    }

    await sendMessage(
      chatId,
      `🟢 НА СЕГОДНЯ ВСЁ!\n\n📅 ${DAYS[day]}\n\nВсе занятия завершены.`,
      [[
        { text: '⬅️ Меню', callback_data: 'menu' }
      ]]
    );

  } catch (error) {
    console.error(error);
    await sendMessage(chatId, `❌ Ошибка:\n${error.message}`);
  }
}

// ПОДПИСКА
async function subscribe(chatId) {
  const { error } = await supabase
    .from('bot_subscribers')
    .upsert(
      {
        chat_id: chatId,
        group_name: 'ПО-42'
      },
      { onConflict: 'chat_id' }
    );

  if (error) {
    console.error('Subscription error:', error);

    await sendMessage(
      chatId,
      `❌ Не удалось оформить подписку.\n${error.message}`
    );

    return false;
  }

  return true;
}

// ОТМЕНА ПОДПИСКИ
async function unsubscribe(chatId) {
  const { error } = await supabase
    .from('bot_subscribers')
    .delete()
    .eq('chat_id', chatId);

  if (error) {
    console.error('Unsubscribe error:', error);

    await sendMessage(
      chatId,
      `❌ Не удалось отключить уведомления.\n${error.message}`
    );

    return;
  }

  await sendMessage(
    chatId,
    '🔕 Утренние уведомления отключены.\n\nЧтобы снова подписаться, напиши /start.'
  );
}

function getToday() {
  return getKazakhstanTime().day;
}

// WEBHOOK
export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('Bot webhook is active');
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  try {
    const update = req.body;

    // СООБЩЕНИЯ
    if (update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text || '';

      if (text === '/start') {
        const success = await subscribe(chatId);

        if (success) {
          await sendMessage(
            chatId,
            '🔔 Ты подписан на утреннее расписание в 07:00 по времени Казахстана.\n\nОтключить уведомления: /stop'
          );
        }

        await showMenu(chatId);
      }

      if (text === '/schedule') {
        await showMenu(chatId);
      }

      if (text === '/stop') {
        await unsubscribe(chatId);
      }

      if (text === '/today') {
        await showSchedule(chatId, getToday());
      }

      if (text === '/now') {
        await showNow(chatId);
      }
    }

    // КНОПКИ
    if (update.callback_query) {
      const callback = update.callback_query;
      const chatId = callback.message.chat.id;
      const action = callback.data;

      await telegram('answerCallbackQuery', {
        callback_query_id: callback.id
      });

      if (action === 'menu') {
        await showMenu(chatId);
      }

      if (action === 'today') {
        await showSchedule(chatId, getToday());
      }

      if (action === 'now') {
        await showNow(chatId);
      }

      if (action.startsWith('day_')) {
        const day = action.replace('day_', '');
        await showSchedule(chatId, day);
      }
    }

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(200).json({ ok: true });
  }
}
