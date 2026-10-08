(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const state = {
    orderId: null,
    data: null,
    selectedNetworkId: null,
    selectedOption: null,
    timerInterval: null,
    windowSeconds: 30 * 60,
    expired: false,
    markedPaid: false,
  };

  function toast(msg, kind = '') {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast ' + kind;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  function money(n) { return '$' + Number(n || 0).toFixed(2); }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseOrderIdFromUrl() {
    const url = new URL(window.location.href);
    const id = Number(url.searchParams.get('order'));
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  /* ---------- Timer ---------- */

  function startTimer(createdAt, windowMinutes) {
    const created = new Date(
      (createdAt.includes('T') ? createdAt : createdAt.replace(' ', 'T') + 'Z')
    ).getTime();
    const endAt = created + windowMinutes * 60 * 1000;

    function tick() {
      const now = Date.now();
      const left = Math.max(0, endAt - now);
      const totalSec = Math.floor(left / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      $('#timerValue').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

      if (left <= 0) {
        state.expired = true;
        $('.timer').classList.add('expired');
        clearInterval(state.timerInterval);
      }
    }
    tick();
    state.timerInterval = setInterval(tick, 1000);
  }

  /* ---------- Render ---------- */

  function render() {
    const { order, options } = state.data;

    $('#orderId').textContent = String(order.id);
    $('#orderTotal').textContent = money(order.total_amount);
    $('#sumFiat').textContent = money(order.total_amount);

    const coins = [];
    const seen = new Set();
    for (const o of options) {
      if (!seen.has(o.coin)) {
        seen.add(o.coin);
        coins.push(o.coin);
      }
    }

    if (order.crypto_network_id && options.some((o) => o.id === order.crypto_network_id)) {
      state.selectedNetworkId = order.crypto_network_id;
    } else if (!state.selectedNetworkId) {
      const firstCoin = coins[0];
      const firstNet = options.find((o) => o.coin === firstCoin && o.eligible)
        || options.find((o) => o.coin === firstCoin);
      if (firstNet) state.selectedNetworkId = firstNet.id;
    }

    const activeCoin = state.selectedNetworkId
      ? options.find((o) => o.id === state.selectedNetworkId)?.coin
      : coins[0];

    const tabs = $('#coinTabs');
    tabs.innerHTML = '';
    coins.forEach((coin) => {
      const sample = options.find((o) => o.coin === coin);
      const btn = document.createElement('button');
      btn.className = 'coin-tab' + (coin === activeCoin ? ' active' : '');
      btn.type = 'button';
      btn.dataset.coin = coin;
      btn.innerHTML = `<span class="coin-dot" style="background:${escapeHtml(sample.color)}"></span>${escapeHtml(coin)}`;
      btn.addEventListener('click', () => {
        const firstNet = options.find((o) => o.coin === coin && o.eligible)
          || options.find((o) => o.coin === coin);
        if (firstNet) selectNetwork(firstNet.id);
      });
      tabs.appendChild(btn);
    });

    const list = $('#networkList');
    list.innerHTML = '';
    options
      .filter((o) => o.coin === activeCoin)
      .forEach((o) => {
        const div = document.createElement('div');
        div.className = 'network-item';
        if (o.id === state.selectedNetworkId) div.classList.add('active');
        if (!o.eligible) div.classList.add('disabled');
        div.innerHTML = `
          <div>
            <div class="net-name">${escapeHtml(o.networkLabel)}</div>
            <div class="net-sub">${o.eligible ? `Min ${money(o.minUsd)}` : `Minimum ${money(o.minUsd)}`}</div>
          </div>
          <div class="net-amount">
            ${escapeHtml(o.amountString)} ${escapeHtml(o.coin)}
            <small>${money(o.rate)} / ${escapeHtml(o.coin)}</small>
          </div>
        `;
        div.addEventListener('click', () => {
          if (!o.eligible) {
            toast(`Minimum for this network is ${money(o.minUsd)}`, 'error');
            return;
          }
          selectNetwork(o.id);
        });
        list.appendChild(div);
      });

    if (order.status === 'paid') {
      showAlreadyPaid();
      return;
    }
    if (state.markedPaid || order.crypto_marked_paid_at) {
      showMarkedPaid();
      return;
    }

    if (!state.selectedNetworkId) {
      $('#payCard') && $('#payCard').remove();
      return;
    }

    const opt = options.find((o) => o.id === state.selectedNetworkId);
    if (!opt) return;
    state.selectedOption = opt;
    renderPayCard(opt);
  }

  function renderPayCard(opt) {
    $('#badgeSymbol').textContent = opt.coin;
    $('#badgeNetwork').textContent = opt.networkLabel;
    $('#addressValue').textContent = opt.address;
    $('#amountValue').textContent = `${opt.amountString} ${opt.coin}`;
    $('#sumRate').textContent = `1 ${opt.coin} = ${money(opt.rate)}`;
    $('#rowRate').hidden = false;
    $('#sumCrypto').textContent = `${opt.amountString} ${opt.coin}`;

    const qrData = encodeURIComponent(opt.qrPayload || opt.address);
    $('#qrImage').src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${qrData}`;

    $('#netNote').textContent = opt.note || '';

    const btn = $('#btnPaid');
    btn.disabled = false;
    btn.onclick = markPaid;
    $('#paidHint').textContent = 'After sending, click "I have paid" — the manager will confirm receipt.';
  }

  async function selectNetwork(networkId) {
    state.selectedNetworkId = networkId;
    try {
      await API.post(`/api/orders/${state.orderId}/crypto/select`, { network_id: networkId });
    } catch (e) {
      console.warn('select network failed', e);
    }
    render();
    const card = document.querySelector('.pay-card');
    if (card && window.innerWidth <= 820) {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function markPaid() {
    try {
      await API.post(`/api/orders/${state.orderId}/crypto/mark-paid`);
      state.markedPaid = true;
      showMarkedPaid();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  function showMarkedPaid() {
    const screen = $('#payScreen');
    screen.innerHTML = `
      <div class="paid-success" style="grid-column: 1 / -1">
        <div class="check">✓</div>
        <h2>Thank you! We received your payment notice</h2>
        <p class="muted">
          Once the transfer is confirmed, the order status will change to "Paid".
          This usually takes 5 to 30 minutes depending on network load.
        </p>
        <p class="muted small">Order #${escapeHtml(state.orderId)}</p>
        <a href="/" class="btn btn-outline" style="display:inline-block;margin-top:16px">
          Back to Home
        </a>
      </div>
    `;
  }

  function showAlreadyPaid() {
    const screen = $('#payScreen');
    screen.innerHTML = `
      <div class="paid-success" style="grid-column: 1 / -1">
        <div class="check">✓</div>
        <h2>Order already paid</h2>
        <p class="muted">Order #${escapeHtml(state.orderId)} — status "Paid".</p>
        <a href="/" class="btn btn-outline" style="display:inline-block;margin-top:16px">
          Back to Home
        </a>
      </div>
    `;
  }

  function setupCopy() {
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('.copy-btn');
      if (!btn) return;
      const which = btn.dataset.copy;
      const opt = state.selectedOption;
      if (!opt) return;
      const text = which === 'address' ? opt.address : `${opt.amountString}`;
      try {
        await navigator.clipboard.writeText(text);
        toast('Copied', 'success');
      } catch {
        toast('Copy failed', 'error');
      }
    });
  }

  async function boot() {
    setupCopy();

    state.orderId = parseOrderIdFromUrl();
    if (!state.orderId) {
      $('#loading').classList.add('hidden');
      $('#errorBox').classList.remove('hidden');
      $('#errorText').textContent = 'Order ID is missing from the URL (?order=…).';
      return;
    }

    try {
      const data = await API.get(`/api/orders/${state.orderId}/crypto/options`);
      state.data = data;
      $('#loading').classList.add('hidden');
      $('#payScreen').classList.remove('hidden');

      const windowMinutes = data.paymentWindowMinutes || 30;
      startTimer(data.order.created_at, windowMinutes);

      render();
    } catch (err) {
      $('#loading').classList.add('hidden');
      $('#errorBox').classList.remove('hidden');
      if (err.status === 401) {
        $('#errorText').textContent =
          'You are not signed in. Please log in and open this link again.';
      } else if (err.status === 403) {
        $('#errorText').textContent = 'This is not your order.';
      } else if (err.status === 404) {
        $('#errorText').textContent = 'Order not found.';
      } else {
        $('#errorText').textContent = err.message || 'Failed to load.';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();