const TelegramBot = require('node-telegram-bot-api');

let bot = null;
let initAttempted = false;

function getBot() {
  if (bot) return bot;
  if (initAttempted) return null;
  initAttempted = true;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN не задан — уведомления отключены');
    return null;
  }
  try {
    bot = new TelegramBot(token, { polling: false });
    console.log('[telegram] Бот инициализирован');
    return bot;
  } catch (e) {
    console.error('[telegram] Ошибка инициализации:', e.message);
    return null;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function notifyNewOrder(order, items, user, city, district) {
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chatId) {
    console.warn('[telegram] TELEGRAM_ADMIN_CHAT_ID не задан — пропуск уведомления');
    return;
  }
  const b = getBot();
  if (!b) return;

  const lines = [];
  lines.push(`<b>🛒 Новый заказ #${order.id}</b>`);
  lines.push('');
  lines.push(`<b>Пользователь:</b> ${escapeHtml(user.username)} (ID ${user.id})`);
  lines.push(`<b>Город:</b> ${escapeHtml(city.name)}`);
  lines.push(`<b>Район:</b> ${escapeHtml(district.name)}`);
  lines.push('');
  lines.push('<b>Состав:</b>');
  for (const it of items) {
    lines.push(
      `• ${escapeHtml(it.product_name_snapshot)} — ` +
        `${it.quantity_grams} г × $${Number(it.price_per_gram_snapshot).toFixed(2)} = ` +
        `<b>$${Number(it.amount).toFixed(2)}</b>`
    );
  }
  lines.push('');
  lines.push(`<b>Итого: $${Number(order.total_amount).toFixed(2)}</b>`);
  lines.push(`<b>Статус:</b> ${escapeHtml(order.status)}`);

  try {
    await b.sendMessage(chatId, lines.join('\n'), { parse_mode: 'HTML' });
  } catch (e) {
    console.error('[telegram] Не удалось отправить уведомление:', e.message);
  }
}

async function notifyPaymentReceived(order) {
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chatId) return;
  const b = getBot();
  if (!b) return;

  const text =
    `<b>💰 Оплата получена</b>\n` +
    `Заказ #${order.id} — $${Number(order.total_amount).toFixed(2)}\n` +
    `Способ: ${escapeHtml(order.payment_method || 'crypto')}`;

  try {
    await b.sendMessage(chatId, text, { parse_mode: 'HTML' });
  } catch (e) {
    console.error('[telegram] Ошибка отправки:', e.message);
  }
}

module.exports = { notifyNewOrder, notifyPaymentReceived };