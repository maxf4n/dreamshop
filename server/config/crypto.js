// server/config/crypto.js
//
// Здесь ты вручную задаёшь адреса для приёма крипты.
// Каждая сеть — это отдельный объект в массиве networks.
// Замени плейсхолдеры (REPLACE_ME) на свои адреса.
//
// Курсы подтягиваются с CoinGecko каждые 60 секунд.
// Если CoinGecko недоступен — используются значения из rateFallback.

module.exports = {
  // Валюта заказа (в ней хранятся цены товаров и total_amount)
  fiatCurrency: 'USD',

  // Через сколько минут страница оплаты «протухает» (клиент увидит надпись «истёк»)
  paymentWindowMinutes: 30,

  // Кэш курсов (секунд)
  rateCacheTtlSeconds: 60,

  // Резервные курсы, если CoinGecko не ответил
  rateFallback: {
    USDT: 1.0,
    BTC: 65000,
    ETH: 3200,
  },

  // id монет в CoinGecko
  coingeckoIds: {
    USDT: 'tether',
    BTC: 'bitcoin',
    ETH: 'ethereum',
  },

  // ─── Сети ──────────────────────────────────────────────────────────────────
  // id        — уникальный id (латиница, цифры, подчёркивание)
  // coin      — тикер монеты
  // network   — короткое имя сети
  // networkLabel — как показывать пользователю
  // address   — ТВОЙ адрес для приёма. ЗАМЕНИ!
  // decimals  — сколько знаков после точки отдавать пользователю
  // minUsd    — минимальная сумма в USD для этой сети
  // enabled   — включена ли сеть (true/false)
  // color     — цвет для иконки монеты
  // note      — текст для пользователя (например, про комиссию сети)
  networks: [
    {
      id: 'usdt_trc20',
      coin: 'USDT',
      network: 'TRC20',
      networkLabel: 'TRON (TRC20)',
      address: 'TREPLACE_ME_TRC20_ADDRESS',
      decimals: 2,
      minUsd: 1,
      enabled: true,
      color: '#26a17b',
      note: 'Комиссия сети ~1 USDT',
    },
    {
      id: 'usdt_erc20',
      coin: 'USDT',
      network: 'ERC20',
      networkLabel: 'Ethereum (ERC20)',
      address: '0xREPLACE_ME_ERC20_ADDRESS',
      decimals: 2,
      minUsd: 10,
      enabled: true,
      color: '#26a17b',
      note: 'Высокая комиссия сети Ethereum',
    },
    {
      id: 'usdt_bep20',
      coin: 'USDT',
      network: 'BEP20',
      networkLabel: 'BNB Smart Chain (BEP20)',
      address: '0xREPLACE_ME_BEP20_ADDRESS',
      decimals: 2,
      minUsd: 1,
      enabled: true,
      color: '#26a17b',
      note: 'Комиссия сети ~0.3 USDT',
    },
    {
      id: 'btc',
      coin: 'BTC',
      network: 'BTC',
      networkLabel: 'Bitcoin',
      address: 'REPLACE_ME_BTC_ADDRESS',
      decimals: 8,
      minUsd: 5,
      enabled: true,
      color: '#f7931a',
      note: '',
    },
    {
      id: 'eth_erc20',
      coin: 'ETH',
      network: 'ERC20',
      networkLabel: 'Ethereum (ERC20)',
      address: '0xREPLACE_ME_ETH_ERC20_ADDRESS',
      decimals: 6,
      minUsd: 10,
      enabled: true,
      color: '#627eea',
      note: 'Высокая комиссия сети Ethereum',
    },
    {
      id: 'eth_bep20',
      coin: 'ETH',
      network: 'BEP20',
      networkLabel: 'BNB Smart Chain (BEP20)',
      address: '0xREPLACE_ME_ETH_BEP20_ADDRESS',
      decimals: 6,
      minUsd: 5,
      enabled: true,
      color: '#627eea',
      note: 'BEP20-версия ETH',
    },
  ],
};