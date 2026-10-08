(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const state = {
    cities: [],
    districts: [],
    products: [],
    orders: [],
    editingCityId: null,
    editingDistrictId: null,
    editingProductId: null,
  };

  /* ---------- Utils ---------- */

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function money(n) { return '$' + Number(n || 0).toFixed(2); }
  function gramsFmt(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return '0';
    return Number.isInteger(num) ? String(num) : num.toFixed(1);
  }
  function fmtDate(s) {
    if (!s) return '—';
    // SQLite CURRENT_TIMESTAMP даёт UTC без таймзоны, добавим Z
    const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
    try {
      return new Date(iso).toLocaleString('ru-RU');
    } catch {
      return s;
    }
  }

  let toastTimer;
  function toast(msg, kind = '') {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast ' + kind;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
  }

  function confirmDialog(msg) {
    return window.confirm(msg);
  }

  /* ---------- Auth ---------- */

  async function checkAuth() {
    try {
      await API.get('/api/admin/me');
      showApp();
      return true;
    } catch {
      showLogin();
      return false;
    }
  }

  function showLogin() {
    $('#loginScreen').classList.remove('hidden');
    $('#adminApp').classList.add('hidden');
  }

  function showApp() {
    $('#loginScreen').classList.add('hidden');
    $('#adminApp').classList.remove('hidden');
    switchTab('dashboard');
    loadAll();
  }

  async function handleLogin(e) {
    e.preventDefault();
    const password = $('#loginPassword').value;
    const errEl = $('#loginError');
    errEl.classList.add('hidden');
    try {
      await API.post('/api/admin/login', { password });
      $('#loginPassword').value = '';
      showApp();
    } catch (err) {
      errEl.textContent = err.message || 'Ошибка входа';
      errEl.classList.remove('hidden');
    }
  }

  async function handleLogout() {
    try {
      await API.post('/api/admin/logout');
    } catch { /* ignore */ }
    showLogin();
  }

  /* ---------- Tabs ---------- */

  function switchTab(tab) {
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== tab));
    if (tab === 'dashboard') loadStats();
    if (tab === 'cities') loadCities();
    if (tab === 'districts') loadDistricts();
    if (tab === 'products') loadProducts();
    if (tab === 'orders') loadOrders();
  }

  /* ---------- Loaders ---------- */

  async function loadAll() {
    await Promise.all([loadCities(), loadDistricts(), loadProducts(), loadOrders(), loadStats()]);
  }

  async function loadStats() {
    try {
      const s = await API.get('/api/admin/stats');
      $('#stUsers').textContent = s.users;
      $('#stOrders').textContent = s.orders;
      $('#stPaid').textContent = s.paid;
      $('#stUnpaid').textContent = s.unpaid;
      $('#stDeposit').textContent = s.security_deposit_required;
      $('#stRevenue').textContent = money(s.revenue_paid);
    } catch (err) {
      toast('Не удалось загрузить статистику: ' + err.message, 'error');
    }
  }

  async function loadCities() {
    try {
      state.cities = await API.get('/api/admin/cities');
      renderCities();
      fillCitySelects();
    } catch (err) {
      toast('Ошибка загрузки городов: ' + err.message, 'error');
    }
  }

  async function loadDistricts() {
    try {
      const cityId = $('#districtFilterCity') ? $('#districtFilterCity').value : '';
      const url = cityId ? `/api/admin/districts?city_id=${cityId}` : '/api/admin/districts';
      state.districts = await API.get(url);
      renderDistricts();
    } catch (err) {
      toast('Ошибка загрузки районов: ' + err.message, 'error');
    }
  }

  async function loadProducts() {
    try {
      state.products = await API.get('/api/admin/products');
      renderProducts();
    } catch (err) {
      toast('Ошибка загрузки товаров: ' + err.message, 'error');
    }
  }

  async function loadOrders() {
    try {
      const status = $('#orderStatusFilter') ? $('#orderStatusFilter').value : '';
      const url = status ? `/api/admin/orders?status=${status}` : '/api/admin/orders';
      state.orders = await API.get(url);
      renderOrders();
    } catch (err) {
      toast('Ошибка загрузки заказов: ' + err.message, 'error');
    }
  }

  /* ---------- Render: cities ---------- */

  function renderCities() {
    const tb = $('#citiesTable tbody');
    tb.innerHTML = '';
    state.cities.forEach((c) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.id}</td>
        <td>${escapeHtml(c.name)}</td>
        <td>${c.is_active ? '✓' : '—'}</td>
        <td class="muted">${fmtDate(c.created_at)}</td>
        <td class="actions">
          <button class="btn btn-outline btn-sm" data-act="edit" data-id="${c.id}">Изменить</button>
          <button class="btn btn-danger btn-sm" data-act="delete" data-id="${c.id}">Удалить</button>
        </td>
      `;
      tb.appendChild(tr);
    });
  }

  function fillCitySelects() {
    const selects = [$('#districtCity'), $('#districtFilterCity')];
    selects.forEach((sel) => {
      if (!sel) return;
      const prev = sel.value;
      const isFilter = sel.id === 'districtFilterCity';
      sel.innerHTML = isFilter ? '<option value="">Все города</option>' : '';
      state.cities.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = String(c.id);
        opt.textContent = c.name + (c.is_active ? '' : ' (неактивен)');
        sel.appendChild(opt);
      });
      if (prev && sel.querySelector(`option[value="${prev}"]`)) sel.value = prev;
    });
  }

  function resetCityForm() {
    state.editingCityId = null;
    $('#cityId').value = '';
    $('#cityName').value = '';
    $('#cityActive').checked = true;
    $('#citySubmit').textContent = 'Добавить';
    $('#cityCancel').classList.add('hidden');
  }

  async function submitCity(e) {
    e.preventDefault();
    const name = $('#cityName').value.trim();
    const is_active = $('#cityActive').checked;
    if (!name) return;
    try {
      if (state.editingCityId) {
        await API.put(`/api/admin/cities/${state.editingCityId}`, { name, is_active });
        toast('Город обновлён', 'success');
      } else {
        await API.post('/api/admin/cities', { name, is_active });
        toast('Город добавлен', 'success');
      }
      resetCityForm();
      await loadCities();
    } catch (err) {
      toast('Ошибка: ' + err.message, 'error');
    }
  }

  async function citiesAction(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const city = state.cities.find((c) => c.id === id);
    if (!city) return;

    if (btn.dataset.act === 'edit') {
      state.editingCityId = id;
      $('#cityId').value = String(id);
      $('#cityName').value = city.name;
      $('#cityActive').checked = !!city.is_active;
      $('#citySubmit').textContent = 'Сохранить';
      $('#cityCancel').classList.remove('hidden');
    } else if (btn.dataset.act === 'delete') {
      if (!confirmDialog(`Удалить город "${city.name}"?`)) return;
      try {
        await API.del(`/api/admin/cities/${id}`);
        toast('Город удалён', 'success');
        await loadCities();
      } catch (err) {
        toast('Ошибка: ' + err.message, 'error');
      }
    }
  }

  /* ---------- Render: districts ---------- */

  function renderDistricts() {
    const tb = $('#districtsTable tbody');
    tb.innerHTML = '';
    state.districts.forEach((d) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${d.id}</td>
        <td>${escapeHtml(d.city_name || '')}</td>
        <td>${escapeHtml(d.name)}</td>
        <td>${d.is_active ? '✓' : '—'}</td>
        <td class="actions">
          <button class="btn btn-outline btn-sm" data-act="edit" data-id="${d.id}">Изменить</button>
          <button class="btn btn-danger btn-sm" data-act="delete" data-id="${d.id}">Удалить</button>
        </td>
      `;
      tb.appendChild(tr);
    });
  }

  function resetDistrictForm() {
    state.editingDistrictId = null;
    $('#districtId').value = '';
    $('#districtName').value = '';
    $('#districtActive').checked = true;
    $('#districtSubmit').textContent = 'Добавить';
    $('#districtCancel').classList.add('hidden');
  }

  async function submitDistrict(e) {
    e.preventDefault();
    const city_id = Number($('#districtCity').value);
    const name = $('#districtName').value.trim();
    const is_active = $('#districtActive').checked;
    if (!city_id || !name) return;
    try {
      if (state.editingDistrictId) {
        await API.put(`/api/admin/districts/${state.editingDistrictId}`, {
          city_id, name, is_active,
        });
        toast('Район обновлён', 'success');
      } else {
        await API.post('/api/admin/districts', { city_id, name, is_active });
        toast('Район добавлен', 'success');
      }
      resetDistrictForm();
      await loadDistricts();
    } catch (err) {
      toast('Ошибка: ' + err.message, 'error');
    }
  }

  async function districtsAction(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const d = state.districts.find((x) => x.id === id);
    if (!d) return;

    if (btn.dataset.act === 'edit') {
      state.editingDistrictId = id;
      $('#districtId').value = String(id);
      $('#districtCity').value = String(d.city_id);
      $('#districtName').value = d.name;
      $('#districtActive').checked = !!d.is_active;
      $('#districtSubmit').textContent = 'Сохранить';
      $('#districtCancel').classList.remove('hidden');
    } else if (btn.dataset.act === 'delete') {
      if (!confirmDialog(`Удалить район "${d.name}"?`)) return;
      try {
        await API.del(`/api/admin/districts/${id}`);
        toast('Район удалён', 'success');
        await loadDistricts();
      } catch (err) {
        toast('Ошибка: ' + err.message, 'error');
      }
    }
  }

  /* ---------- Render: products ---------- */

  function renderProducts() {
    const tb = $('#productsTable tbody');
    tb.innerHTML = '';
    state.products.forEach((p) => {
      const desc = (p.description || '').slice(0, 60) + ((p.description || '').length > 60 ? '…' : '');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${p.id}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${money(p.price_per_gram)}</td>
        <td>${gramsFmt(p.min_grams)}</td>
        <td>${p.is_active ? '✓' : '—'}</td>
        <td class="muted">${escapeHtml(desc)}</td>
        <td class="actions">
          <button class="btn btn-outline btn-sm" data-act="edit" data-id="${p.id}">Изменить</button>
          <button class="btn btn-danger btn-sm" data-act="delete" data-id="${p.id}">Удалить</button>
        </td>
      `;
      tb.appendChild(tr);
    });
  }

  function resetProductForm() {
    state.editingProductId = null;
    $('#productId').value = '';
    $('#productName').value = '';
    $('#productPrice').value = '';
    $('#productMin').value = '';
    $('#productDesc').value = '';
    $('#productActive').checked = true;
    $('#productSubmit').textContent = 'Добавить';
    $('#productCancel').classList.add('hidden');
  }

  async function submitProduct(e) {
    e.preventDefault();
    const name = $('#productName').value.trim();
    const price_per_gram = Number($('#productPrice').value);
    const min_grams = Number($('#productMin').value);
    const description = $('#productDesc').value.trim();
    const is_active = $('#productActive').checked;

    if (!name) return toast('Введите название', 'error');
    if (!Number.isFinite(price_per_gram) || price_per_gram <= 0) {
      return toast('Цена должна быть больше 0', 'error');
    }
    if (!Number.isFinite(min_grams) || min_grams <= 0) {
      return toast('Минимум должен быть больше 0', 'error');
    }
    if (Math.abs(min_grams * 10 - Math.round(min_grams * 10)) > 1e-9) {
      return toast('Мин. количество — с точностью до 0.1 г', 'error');
    }

    const payload = { name, description, price_per_gram, min_grams, is_active };

    try {
      if (state.editingProductId) {
        await API.put(`/api/admin/products/${state.editingProductId}`, payload);
        toast('Товар обновлён', 'success');
      } else {
        await API.post('/api/admin/products', payload);
        toast('Товар добавлен', 'success');
      }
      resetProductForm();
      await loadProducts();
    } catch (err) {
      toast('Ошибка: ' + err.message, 'error');
    }
  }

  async function productsAction(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const p = state.products.find((x) => x.id === id);
    if (!p) return;

    if (btn.dataset.act === 'edit') {
      state.editingProductId = id;
      $('#productId').value = String(id);
      $('#productName').value = p.name;
      $('#productPrice').value = p.price_per_gram;
      $('#productMin').value = p.min_grams;
      $('#productDesc').value = p.description || '';
      $('#productActive').checked = !!p.is_active;
      $('#productSubmit').textContent = 'Сохранить';
      $('#productCancel').classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (btn.dataset.act === 'delete') {
      if (!confirmDialog(`Удалить товар "${p.name}"?`)) return;
      try {
        await API.del(`/api/admin/products/${id}`);
        toast('Товар удалён', 'success');
        await loadProducts();
      } catch (err) {
        toast('Ошибка: ' + err.message, 'error');
      }
    }
  }

  /* ---------- Render: orders ---------- */

  function statusLabel(s) {
    if (s === 'paid') return 'Оплачен';
    if (s === 'security_deposit_required') return 'Требуется депозит';
    return 'Не оплачен';
  }

  function renderOrders() {
    const tb = $('#ordersTable tbody');
    tb.innerHTML = '';
    if (state.orders.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="8" class="muted" style="text-align:center">Заказов нет</td>';
      tb.appendChild(tr);
      return;
    }
    state.orders.forEach((o) => {
      const tr = document.createElement('tr');
      const itemsHtml = (o.items || [])
        .map(
          (it) => `<li>${escapeHtml(it.product_name_snapshot)} — ${gramsFmt(it.quantity_grams)} г · ${money(it.amount)}</li>`
        )
        .join('');

      tr.innerHTML = `
        <td>#${o.id}</td>
        <td>${escapeHtml(o.username)}</td>
        <td>
          <div>${escapeHtml(o.city_name || '')}</div>
          <div class="muted small">${escapeHtml(o.district_name || '')}</div>
        </td>
        <td><ul class="order-items-mini">${itemsHtml}</ul>        ${
          o.crypto_address
            ? `<div class="muted small" style="margin-top:6px">
                 <span class="mono" title="${escapeHtml(o.crypto_address)}">${escapeHtml(o.crypto_address.slice(0, 12) + '…')}</span>
                 · ${escapeHtml(String(o.crypto_amount))}
               </div>`
            : ''
        }</td>
        <td><b>${money(o.total_amount)}</b></td>
        <td>
          <div>${o.payment_method ? escapeHtml(o.payment_method) : '—'}</div>
          ${
            o.crypto_network_label
              ? `<div class="muted small">${escapeHtml(o.crypto_network_label)}</div>`
              : ''
          }
          ${
            o.crypto_marked_paid_at
              ? `<div class="muted small" title="${escapeHtml(o.crypto_marked_paid_at)}">👤 отметил оплату</div>`
              : ''
          }
        </td>        <td>
          <select class="status-select" data-order-id="${o.id}">
            <option value="unpaid"${o.status === 'unpaid' ? ' selected' : ''}>Не оплачен</option>
            <option value="paid"${o.status === 'paid' ? ' selected' : ''}>Оплачен</option>
            <option value="security_deposit_required"${o.status === 'security_deposit_required' ? ' selected' : ''}>Требуется депозит</option>
          </select>
        </td>
        <td class="muted">${fmtDate(o.created_at)}</td>
      `;
      tb.appendChild(tr);
    });
  }

  async function ordersStatusChange(e) {
    const sel = e.target.closest('select.status-select');
    if (!sel) return;
    const id = Number(sel.dataset.orderId);
    const status = sel.value;
    try {
      await API.patch(`/api/admin/orders/${id}/status`, { status });
      toast(`Статус заказа #${id}: ${statusLabel(status)}`, 'success');
      // Обновляем локальный массив без перезагрузки, чтобы сохранить фильтр
      const o = state.orders.find((x) => x.id === id);
      if (o) o.status = status;
    } catch (err) {
      toast('Ошибка: ' + err.message, 'error');
      await loadOrders();
    }
  }

  /* ---------- Wiring ---------- */

  function wireUp() {
    $('#loginForm').addEventListener('submit', handleLogin);
    $('#btnLogout').addEventListener('click', handleLogout);

    $$('.nav-item').forEach((b) =>
      b.addEventListener('click', () => switchTab(b.dataset.tab))
    );

    // Cities
    $('#cityForm').addEventListener('submit', submitCity);
    $('#cityCancel').addEventListener('click', resetCityForm);
    $('#citiesTable').addEventListener('click', citiesAction);

    // Districts
    $('#districtForm').addEventListener('submit', submitDistrict);
    $('#districtCancel').addEventListener('click', resetDistrictForm);
    $('#districtsTable').addEventListener('click', districtsAction);
    $('#districtFilterCity').addEventListener('change', loadDistricts);

    // Products
    $('#productForm').addEventListener('submit', submitProduct);
    $('#productCancel').addEventListener('click', resetProductForm);
    $('#productsTable').addEventListener('click', productsAction);

    // Orders
    $('#orderStatusFilter').addEventListener('change', loadOrders);
    $('#ordersRefresh').addEventListener('click', loadOrders);
    $('#ordersTable').addEventListener('change', ordersStatusChange);
  }

  /* ---------- Boot ---------- */

  async function boot() {
    wireUp();
    await checkAuth();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();