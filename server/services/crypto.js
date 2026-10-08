// server/services/crypto.js
const axios = require('axios');
const config = require('../config/crypto');

let rateCache = { ts: 0, data: null };

async function fetchRates() {
  const now = Date.now();
  if (rateCache.data && now - rateCache.ts < config.rateCacheTtlSeconds * 1000) {
    return rateCache.data;
  }

  const ids = [...new Set(Object.values(config.coingeckoIds))].join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;

  try {
    const { data } = await axios.get(url, { timeout: 5000 });
    const rates = {};
    for (const [coin, id] of Object.entries(config.coingeckoIds)) {
      const v = data && data[id] && Number(data[id].usd);
      rates[coin] = Number.isFinite(v) && v > 0 ? v : config.rateFallback[coin];
    }
    rateCache = { ts: now, data: rates };
    return rates;
  } catch (e) {
    console.warn('[crypto] CoinGecko недоступен, использую fallback:', e.message);
    rateCache = { ts: now, data: { ...config.rateFallback } };
    return rateCache.data;
  }
}

function roundCryptoUp(amount, decimals) {
  const factor = Math.pow(10, decimals);
  // округляем вверх — чтобы не прислать меньше, чем нужно
  return Math.ceil(amount * factor) / factor;
}

/**
 * Возвращает список доступных опций оплаты для указанной суммы в USD.
 * Каждая опция содержит готовый crypto_amount (уже округлённый).
 */
async function getPaymentOptions(amountUsd) {
  const rates = await fetchRates();
  const options = [];

  for (const net of config.networks) {
    if (!net.enabled) continue;
    const rate = rates[net.coin];
    if (!Number.isFinite(rate) || rate <= 0) continue;

    const minUsd = Number(net.minUsd || 0);
    const eligible = Number(amountUsd) + 1e-9 >= minUsd;

    const rawAmount = Number(amountUsd) / rate;
    const amount = roundCryptoUp(rawAmount, net.decimals);

    options.push({
      id: net.id,
      coin: net.coin,
      network: net.network,
      networkLabel: net.networkLabel,
      address: net.address,
      amount,
      amountString: amount.toFixed(net.decimals),
      rate,
      minUsd,
      eligible,
      note: net.note || '',
      color: net.color || '#7c5cff',
    });
  }

  return { rates, options, fiat: config.fiatCurrency };
}

/**
 * Возвращает строку для QR-кода.
 * Для BTC используем BIP21, для ETH (нативная монета) — EIP-681.
 * Для токенов (USDT/ETH в BEP20/ERC20/TRC20) просто адрес.
 */
function buildQrPayload(option) {
  const { coin, network, address, amount } = option;
  if (coin === 'BTC' && network === 'BTC') {
    const a = Number(amount).toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
    return `bitcoin:${address}?amount=${a}`;
  }
  if (coin === 'ETH' && network === 'ERC20' && option.id === 'eth_erc20') {
    // EIP-681 для нативной ETH-транзакции
    const wei = BigInt(Math.round(Number(amount) * 1e6)) * BigInt(1e12);
    return `ethereum:${address}?value=${wei.toString()}`;
  }
  return address;
}

module.exports = {
  fetchRates,
  getPaymentOptions,
  buildQrPayload,
  paymentWindowMinutes: config.paymentWindowMinutes,
  config,
};