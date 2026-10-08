(function () {
  'use strict';

  /* ---------------- State ---------------- */

  const state = {
    user: null,
    settings: { brandName: 'DreamShop', telegramManagerLink: '' },
    cities: [],
    districts: [],
    products: [],
    selectedCity: null,
    selectedDistrict: null,
    cart: [], // [{ product_id, name, price_per_gram, min_grams, quantity_grams }]
    currentProduct: null,
    authMode: 'login', // 'login' | 'register'
    pendingCheckout: false, // true, если после логина нужно оформить заказ
  };

  /* ---------------- Helpers ---------------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function money(n) {
    return '$' + Number(n || 0).toFixed(2);
  }

  function gramsFmt(n) {
    // Убираем .0 у целых, оставляем .X для дробных
    const num = Number(n);
    if (!Number.isFinite(num)) return '0';
    return Number.isInteger(num) ? String(num) : num.toFixed(1);
  }

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
  }

  function closeAllModals() {
    $$('.modal').forEach((m) => {
      m.classList.add('hidden');
      m.setAttribute('aria-hidden', 'true');
    });
  }

  /* ---------------- Splash ---------------- */

  function runSplash() {
    const splash = $('#splash');
    const app = $('#app');
    setTimeout(() => {
      splash.classList.add('splash-hidden');
      app.classList.remove('hidden');
      setTimeout(() => splash.remove(), 800);
    }, 2000);
  }

  /* ---------------- Cart ---------------- */

    const CART_STORAGE_KEY = 'dreamshop_cart_v1';

  function saveCart() {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart));
    } catch (e) {
      console.warn('[cart] save failed', e);
    }
  }

  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      // Валидация: оставляем только корректные позиции
      state.cart = parsed
        .filter(
          (it) =>
            it &&
            Number.isInteger(it.product_id) &&
            typeof it.name === 'string' &&
            Number.isFinite(Number(it.price_per_gram)) &&
            Number.isFinite(Number(it.min_grams)) &&
            Number.isFinite(Number(it.quantity_grams)) &&
            Number(it.quantity_grams) > 0
        )
        .map((it) => ({
          product_id: Number(it.product_id),
          name: String(it.name),
          price_per_gram: Number(it.price_per_gram),
          min_grams: Number(it.min_grams),
          quantity_grams: Math.round(Number(it.quantity_grams) * 10) / 10,
        }));
    } catch (e) {
      console.warn('[cart] load failed', e);
      state.cart = [];
    }
  }

  function cartTotal() {
    return state.cart.reduce(
      (sum, it) => sum + Number(it.price_per_gram) * Number(it.quantity_grams),
      0
    );
  }

  function cartCount() {
    return state.cart.length;
  }

  function updateCartBadge() {
    $('#cartCount').textContent = String(cartCount());
  }

  function renderCart() {
    const wrap = $('#cartItems');
    const emptyMsg = $('#cartEmpty');
    wrap.innerHTML = '';

    if (state.cart.length === 0) {
      emptyMsg.classList.remove('hidden');
    } else {
      emptyMsg.classList.add('hidden');
    }

    state.cart.forEach((it, idx) => {
      const amount = Number(it.price_per_gram) * Number(it.quantity_grams);
      const div = document.createElement('div');
      div.className = 'cart-item';
      div.innerHTML = `
        <div>
          <div class="ci-name">${escapeHtml(it.name)}</div>
          <div class="ci-sub">${money(it.price_per_gram)} / г · мин ${gramsFmt(it.min_grams)} г</div>
        </div>
        <input class="ci-qty" type="number" step="0.1" min="${it.min_grams}" value="${gramsFmt(
        it.quantity_grams
      )}" data-idx="${idx}" />
        <div class="ci-amount">${money(amount)}</div>
        <button class="ci-remove" data-remove="${idx}" type="button" title="Удалить">×</button>
      `;
      wrap.appendChild(div);
    });

    $('#cartTotal').textContent = money(cartTotal());
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function addToCart(product, qty) {
    const existing = state.cart.find((it) => it.product_id === product.id);
    if (existing) {
      existing.quantity_grams = Number(existing.quantity_grams) + Number(qty);
    } else {
      state.cart.push({
        product_id: product.id,
        name: product.name,
        price_per_gram: Number(product.price_per_gram),
        min_grams: Number(product.min_grams),
        quantity_grams: Number(qty),
      });
    }
    // Нормализуем точность до 0.1
    state.cart.forEach((it) => {
      it.quantity_grams = Math.round(it.quantity_grams * 10) / 10;
    });
    updateCartBadge();
    renderCart();
    saveCart();
  }

  /* ---------------- Combobox (city / district) ---------------- */

  function setupCombo({ inputId, listId, comboId, getItems, onSelect, disabled }) {
    const input = $('#' + inputId);
    const list = $('#' + listId);
    const combo = $('#' + comboId);

    function renderList(filter) {
      const items = getItems() || [];
      const q = String(filter || '').trim().toLowerCase();
      const filtered = q
        ? items.filter((it) => it.name.toLowerCase().includes(q))
        : items;

      list.innerHTML = '';
      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'combo-item empty';
        empty.textContent = items.length ? 'Ничего не найдено' : 'Нет данных';
        list.appendChild(empty);
      } else {
        filtered.forEach((it) => {
          const el = document.createElement('div');
          el.className = 'combo-item';
          el.textContent = it.name;
          el.addEventListener('mousedown', (e) => {
            e.preventDefault();
            input.value = it.name;
            list.classList.add('hidden');
            onSelect(it);
          });
          list.appendChild(el);
        });
      }
    }

    input.addEventListener('focus', () => {
      if (disabled && disabled()) return;
      renderList(input.value);
      list.classList.remove('hidden');
    });

    input.addEventListener(
      'input',
      debounce(() => {
        if (disabled && disabled()) return;
        renderList(input.value);
        list.classList.remove('hidden');
      }, 80)
    );

    input.addEventListener('blur', () => {
      // даём сработать mousedown
      setTimeout(() => list.classList.add('hidden'), 120);
    });

    combo.addEventListener('click', (e) => {
      if (e.target === input) return;
      input.focus();
    });

    return { input, list, renderList };
  }

  /* ---------------- Loaders ---------------- */

  async function loadSettings() {
    try {
      const s = await API.get('/api/settings/public');
      state.settings = { ...state.settings, ...s };
    } catch (e) {
      console.warn('settings load failed', e);
    }
    if (state.settings.brandName) {
      $('#brand').textContent = state.settings.brandName;
      document.title = state.settings.brandName;
    }
  }

  async function loadCities() {
    try {
      state.cities = await API.get('/api/cities');
    } catch (e) {
      console.error('cities load failed', e);
      state.cities = [];
    }
  }

  async function loadDistricts(cityId) {
    try {
      state.districts = await API.get(`/api/cities/${cityId}/districts`);
    } catch (e) {
      console.error('districts load failed', e);
      state.districts = [];
    }
  }

  async function loadProducts() {
    try {
      state.products = await API.get('/api/products');
    } catch (e) {
      console.error('products load failed', e);
      state.products = [];
    }
  }

  async function loadUser() {
    try {
      state.user = await API.get('/api/auth/me');
    } catch {
      state.user = null;
    }
    renderAuthUI();
  }

  /* ---------------- Render ---------------- */

  function renderAuthUI() {
    const btnLogin = $('#btnLogin');
    const btnProfile = $('#btnProfile');
    if (state.user) {
      btnLogin.classList.add('hidden');
      btnProfile.classList.remove('hidden');
      $('#profileUsername').textContent = state.user.username;
    } else {
      btnLogin.classList.remove('hidden');
      btnProfile.classList.add('hidden');
    }
  }

  function renderProducts() {
    const section = $('#productsSection');
    const empty = $('#emptyState');
    const ul = $('#productList');
    ul.innerHTML = '';

    if (!state.selectedCity || !state.selectedDistrict) {
      section.classList.add('hidden');
      empty.classList.remove('hidden');
      return;
    }

    section.classList.remove('hidden');
    empty.classList.add('hidden');

    if (state.products.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Товары пока не добавлены.';
      ul.appendChild(li);
      return;
    }

    state.products.forEach((p) => {
      const li = document.createElement('li');
      li.className = 'product-item';
      li.dataset.id = String(p.id);
      li.innerHTML = `
        <div class="product-info">
          <div class="product-name">${escapeHtml(p.name)}</div>
          <div class="product-desc">${escapeHtml(p.description || '')}</div>
        </div>
        <div class="product-price">
          ${money(p.price_per_gram)}<span class="per">/ г</span>
        </div>
      `;
      li.addEventListener('click', () => openProductModal(p));
      ul.appendChild(li);
    });
  }

  /* ---------------- Product modal ---------------- */

  function openProductModal(product) {
    state.currentProduct = product;
    $('#pmTitle').textContent = product.name;
    $('#pmDesc').textContent = product.description || '';
    $('#pmPrice').textContent = money(product.price_per_gram);
    $('#pmMin').textContent = `Минимальный заказ: ${gramsFmt(product.min_grams)} г`;

    const qtyInput = $('#pmQty');
    qtyInput.min = String(product.min_grams);
    qtyInput.step = '0.1';
    qtyInput.value = gramsFmt(product.min_grams);
    recalcProductModal();

    openModal('productModal');
  }

  function recalcProductModal() {
    const p = state.currentProduct;
    if (!p) return;
    const qty = Number($('#pmQty').value) || 0;
    const amount = qty * Number(p.price_per_gram);
    $('#pmTotal').textContent = money(amount);
  }

  /* ---------------- Checkout / auth ---------------- */

  function requireLogin(cb) {
    if (state.user) {
      cb();
      return;
    }
    state.pendingCheckout = true;
    openAuthModal('login');
  }

  function openAuthModal(mode) {
    state.authMode = mode || 'login';
    $$('.tab').forEach((t) =>
      t.classList.toggle('active', t.dataset.tab === state.authMode)
    );
    $('#authSubmit').textContent = state.authMode === 'login' ? 'Войти' : 'Зарегистрироваться';
    $('#authError').classList.add('hidden');
    $('#authForm').reset();
    openModal('authModal');
  }

  async function submitAuth(e) {
    e.preventDefault();
    const username = $('#authUsername').value.trim();
    const password = $('#authPassword').value;
    const errorEl = $('#authError');
    errorEl.classList.add('hidden');

    // Клиентская валидация до отправки
    if (username.length < 3) {
      errorEl.textContent = 'Имя пользователя — минимум 3 символа.';
      errorEl.classList.remove('hidden');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      errorEl.textContent = 'Имя пользователя: только латиница, цифры и знак подчёркивания.';
      errorEl.classList.remove('hidden');
      return;
    }
    if (password.length < 6) {
      errorEl.textContent = 'Пароль — минимум 6 символов.';
      errorEl.classList.remove('hidden');
      return;
    }

    try {
      const path = state.authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const user = await API.post(path, { username, password });
      state.user = user;
      renderAuthUI();
      closeModal('authModal');

      if (state.pendingCheckout) {
        state.pendingCheckout = false;
        doCheckout();
      }
    } catch (err) {
      errorEl.textContent = err.message || 'Ошибка';
      errorEl.classList.remove('hidden');
    }
  }

  /* ---------------- Checkout ---------------- */

  async function doCheckout() {
    if (state.cart.length === 0) return;
    if (!state.selectedCity || !state.selectedDistrict) {
      alert('Выберите город и район.');
      return;
    }

    const payload = {
      city_id: state.selectedCity.id,
      district_id: state.selectedDistrict.id,
      items: state.cart.map((it) => ({
        product_id: it.product_id,
        quantity_grams: Number(it.quantity_grams),
      })),
    };

    try {
      const order = await API.post('/api/orders', payload);
      // Очищаем корзину
      state.cart = [];
      updateCartBadge();
      renderCart();
      saveCart();
      closeModal('cartModal');

      // Открываем модалку оплаты
      $('#payOrderId').textContent = String(order.id);
      $('#payAmount').textContent = money(order.total_amount);
      $('#payInfo').classList.add('hidden');
      $('#payInfo').innerHTML = '';
      $('#payTelegram').disabled = false;
      $('#payCrypto').disabled = false;
      openModal('payModal');
    } catch (err) {
      alert('Не удалось оформить заказ: ' + (err.message || 'ошибка'));
    }
  }

  async function payTelegram() {
    const orderId = Number($('#payOrderId').textContent);
    if (!orderId) return;
    try {
      const r = await API.post(`/api/orders/${orderId}/pay/telegram`);
      const link =
        r.telegramManagerLink ||
        state.settings.telegramManagerLink ||
        '';
      const info = $('#payInfo');
      info.innerHTML = link
        ? `Для оплаты свяжитесь с менеджером: <a href="${escapeHtml(
            link
          )}" target="_blank" rel="noopener">${escapeHtml(link)}</a>`
        : 'Ссылка на менеджера не настроена. Обратитесь в поддержку.';
      info.classList.remove('hidden');
    } catch (err) {
      alert('Ошибка: ' + (err.message || 'не удалось'));
    }
  }

  function payCrypto() {
    const orderId = Number($('#payOrderId').textContent);
    if (!orderId) return;
    // Открываем страницу оплаты в новом табе
    window.open(`/pay?order=${orderId}`, '_blank', 'noopener');
    closeModal('payModal');
  }

  /* ---------------- Profile ---------------- */

  async function openProfile() {
    if (!state.user) return;
    openModal('profileModal');
    const wrap = $('#profileOrders');
    wrap.innerHTML = '<p class="muted">Загрузка…</p>';
    try {
      const orders = await API.get('/api/orders/my');
      if (!orders.length) {
        wrap.innerHTML = '<p class="muted">Заказов пока нет.</p>';
        return;
      }
      wrap.innerHTML = '';
      orders.forEach((o) => {
        const card = document.createElement('div');
        card.className = 'order-card';
        const itemsHtml = (o.items || [])
          .map(
            (it) => `
            <li>
              <span>${escapeHtml(it.product_name_snapshot)} — ${gramsFmt(
              it.quantity_grams
            )} г</span>
              <span>${money(it.amount)}</span>
            </li>`
          )
          .join('');
        card.innerHTML = `
          <div class="order-head">
            <span class="order-id">Заказ #${o.id}</span>
            <span class="status-pill status-${o.status}">${statusLabel(o.status)}</span>
          </div>
          <div class="order-meta">
            ${escapeHtml(o.city_name)} · ${escapeHtml(o.district_name)} · ${new Date(
          o.created_at + 'Z'
        ).toLocaleString('ru-RU')}
          </div>
          <ul class="order-items">${itemsHtml}</ul>
          <div class="order-head" style="margin-top:8px">
            <span class="muted small">Итого</span>
            <span class="order-total">${money(o.total_amount)}</span>
          </div>
        `;
        wrap.appendChild(card);
      });
    } catch (err) {
      wrap.innerHTML = `<p class="error">Не удалось загрузить заказы: ${escapeHtml(
        err.message || ''
      )}</p>`;
    }
  }

  function statusLabel(s) {
    if (s === 'paid') return 'Оплачен';
    if (s === 'security_deposit_required') return 'Требуется депозит';
    return 'Не оплачен';
  }

  async function logout() {
    try {
      await API.post('/api/auth/logout');
    } catch {
      /* ignore */
    }
    state.user = null;
    state.cart = [];
    saveCart();
    updateCartBadge();
    renderCart();
    renderAuthUI();
    closeModal('profileModal');
  }

  /* ---------------- Wire up ---------------- */

  function wireUp() {
    // Модалки закрываются по крестику и по клику на фон
    document.addEventListener('click', (e) => {
      const closeBtn = e.target.closest('[data-close]');
      if (closeBtn) {
        const modal = closeBtn.closest('.modal');
        if (modal) {
          modal.classList.add('hidden');
          modal.setAttribute('aria-hidden', 'true');
        }
        return;
      }
      if (e.target.classList && e.target.classList.contains('modal')) {
        e.target.classList.add('hidden');
        e.target.setAttribute('aria-hidden', 'true');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllModals();
    });

    // Кнопки шапки
    $('#btnLogin').addEventListener('click', () => openAuthModal('login'));
    $('#btnProfile').addEventListener('click', openProfile);
    $('#btnLogout').addEventListener('click', logout);
    $('#btnCart').addEventListener('click', () => {
      renderCart();
      openModal('cartModal');
    });

    // Auth tabs
    $$('.tab').forEach((tab) => {
      tab.addEventListener('click', () => openAuthModal(tab.dataset.tab));
    });
    $('#authForm').addEventListener('submit', submitAuth);

    // Product modal
    $('#pmQty').addEventListener('input', recalcProductModal);
    $('#pmAdd').addEventListener('click', () => {
      const p = state.currentProduct;
      if (!p) return;
      const qty = Number($('#pmQty').value);
      if (!Number.isFinite(qty) || qty <= 0) {
        alert('Введите корректное количество');
        return;
      }
      if (qty + 1e-9 < Number(p.min_grams)) {
        alert(`Минимальное количество — ${gramsFmt(p.min_grams)} г`);
        return;
      }
      // Проверка точности 0.1
      if (Math.abs(qty * 10 - Math.round(qty * 10)) > 1e-9) {
        alert('Точность — не более 0.1 г');
        return;
      }
      addToCart(p, qty);
      closeModal('productModal');
    });

    // Cart interactions
    $('#cartItems').addEventListener('input', (e) => {
      const t = e.target;
      if (!t.classList.contains('ci-qty')) return;
      const idx = Number(t.dataset.idx);
      const item = state.cart[idx];
      if (!item) return;
      let val = Number(t.value);
      if (!Number.isFinite(val) || val <= 0) return;
      if (val + 1e-9 < item.min_grams) val = item.min_grams;
      val = Math.round(val * 10) / 10;
      item.quantity_grams = val;
      // Не перерисовываем весь список, чтобы не терять фокус — обновим только сумму
      renderCart();
      saveCart();
    });

    $('#cartItems').addEventListener('click', (e) => {
      const t = e.target;
      const idx = t.dataset ? t.dataset.remove : null;
      if (idx !== undefined && idx !== null && idx !== '') {
        state.cart.splice(Number(idx), 1);
        updateCartBadge();
        renderCart();
        saveCart();
      }
    });

    $('#cartCheckout').addEventListener('click', () => {
      if (state.cart.length === 0) return;
      if (!state.selectedCity || !state.selectedDistrict) {
        alert('Выберите город и район.');
        return;
      }
      requireLogin(() => doCheckout());
    });

    // Pay buttons
    $('#payTelegram').addEventListener('click', payTelegram);
    $('#payCrypto').addEventListener('click', payCrypto);
  }

  /* ---------------- Boot ---------------- */

  async function boot() {
    runSplash();
    wireUp();

    // Комбобокс города
    setupCombo({
      inputId: 'cityInput',
      listId: 'cityList',
      comboId: 'cityCombo',
      getItems: () => state.cities,
      onSelect: async (city) => {
        state.selectedCity = city;
        state.selectedDistrict = null;
        state.districts = [];
        const dInput = $('#districtInput');
        dInput.disabled = false;
        dInput.value = '';
        dInput.placeholder = 'Начните вводить название района';
        await loadDistricts(city.id);
        renderProducts();
      },
      disabled: () => false,
    });

    // Комбобокс района
    setupCombo({
      inputId: 'districtInput',
      listId: 'districtList',
      comboId: 'districtCombo',
      getItems: () => state.districts,
      onSelect: (district) => {
        state.selectedDistrict = district;
        renderProducts();
      },
      disabled: () => !state.selectedCity,
    });

    // Данные
    await Promise.all([loadSettings(), loadCities(), loadProducts(), loadUser()]);

    loadCart();
    updateCartBadge();
    renderCart();
    renderProducts();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();