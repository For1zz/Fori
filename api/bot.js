
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const TELEGRAM_TOKEN = process.env.BOT_TOKEN;

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text
    })
  });
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

    if (!update?.message) {
      return res.status(200).json({ ok: true });
    }

    const chatId = update.message.chat.id;
    const text = update.message.text || '';

    if (text === '/start') {
      await sendMessage(
        chatId,
        'Привет! Я бот расписания.\n\nНапиши /today, чтобы посмотреть расписание на сегодня.'
      );
    }

    if (text === '/today') {
      const days = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday'
      ];

      const today = days[new Date().getDay()];

      const { data, error } = await supabase
        .from('schedule')
        .select('*')
        .eq('day_of_week', today)
        .order('lesson_number');

      if (error) {
        await sendMessage(chatId, 'Ошибка загрузки расписания.');
        return res.status(200).json({ ok: true });
      }

      if (!data || data.length === 0) {
        await sendMessage(chatId, 'На сегодня занятий нет.');
        return res.status(200).json({ ok: true });
      }

      let reply = '📚 Расписание на сегодня:\n\n';

      for (const lesson of data) {
        reply += `${lesson.lesson_number}. ${lesson.subject_name}\n`;
        if (lesson.start_time) reply += `⏰ ${lesson.start_time}`;
        if (lesson.room) reply += ` | Кабинет: ${lesson.room}`;
        if (lesson.teacher_name) reply += `\n👨‍🏫 ${lesson.teacher_name}`;
        reply += '\n\n';
      }

      await sendMessage(chatId, reply);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(200).json({ ok: true });
  }
}
