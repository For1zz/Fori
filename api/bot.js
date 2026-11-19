
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
  const body = {
    chat_id: chatId,
    text
  };

  if (keyboard) {
    body.reply_markup = {
      inline_keyboard: keyboard
    };
  }

  return telegram('sendMessage', body);
}

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
      { text: '📍 Сегодня', callback_data: 'today' }
    ]
  ];

  await sendMessage(
    chatId,
    '📚 Расписание ПО-42\n\nВыбери день недели:',
    keyboard
  );
}

async function showSchedule(chatId, day) {
  try {
    const { data, error } = await supabase
      .from('schedule')
      .select('*')
      .eq('group_name', 'ПО-42')
      .eq('day_of_week', day)
      .order('lesson_number');

    // ВЫВОД НАСТОЯЩЕЙ ОШИБКИ
    if (error) {
      console.error('Supabase error:', error);

      await sendMessage(
        chatId,
        `❌ Ошибка базы данных:\n\n` +
        `Сообщение: ${error.message}\n` +
        `Код: ${error.code || 'не указан'}\n` +
        `Подробности: ${error.details || 'нет'}\n` +
        `Подсказка: ${error.hint || 'нет'}`
      );

      return;
    }

    const dayName = DAYS[day] || day;

    if (!data || data.length === 0) {
      await sendMessage(
        chatId,
        `📅 ${dayName}\n\nНа этот день занятий нет.`,
        [
          [
            { text: '⬅️ Выбрать другой день', callback_data: 'menu' }
          ]
        ]
      );

      return;
    }

    let reply = `📚 Расписание ПО-42\n📅 ${dayName}\n\n`;

    for (const lesson of data) {
      reply += `${lesson.lesson_number}. ${lesson.subject_name}\n`;

      if (lesson.start_time && lesson.end_time) {
        reply += `⏰ ${lesson.start_time} – ${lesson.end_time}\n`;
      } else if (lesson.start_time) {
        reply += `⏰ ${lesson.start_time}\n`;
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
      [
        [
          { text: '⬅️ Выбрать другой день', callback_data: 'menu' }
        ]
      ]
    );

  } catch (error) {
    console.error('Unexpected error:', error);

    await sendMessage(
      chatId,
      `❌ Ошибка программы:\n${error.message || error}`
    );
  }
}

function getToday() {
  const days = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
  ];

  return days[new Date().getDay()];
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('Bot webhook is active');
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  try {
    const update = req.body;

    // Обычные сообщения
    if (update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text || '';

      if (text === '/start' || text === '/schedule') {
        await showMenu(chatId);
      }

      if (text === '/today') {
        await showSchedule(chatId, getToday());
      }
    }

    // Нажатия на кнопки
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
