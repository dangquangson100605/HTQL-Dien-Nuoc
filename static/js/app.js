(function () {
  const STORAGE = {
    access: 'infra_access',
    refresh: 'infra_refresh',
    role: 'infra_role',
    username: 'infra_username',
  };

  const API = {
    refresh: '/api/auth/token/refresh/',
    logout: '/api/auth/logout/',
    devices: '/api/devices/',
  };

  const DEVICE_LABELS = {
    ELECTRIC_POLE: 'Trụ điện',
    WATER_METER: 'Đồng hồ nước',
    TRANSFORMER: 'Trạm biến áp',
    VALVE: 'Van nước',
  };

  /** @type {L.Map | null} */
  let map = null;
  /** @type {L.LayerGroup | null} */
  let markerLayer = null;
  /** @type {Map<number, L.CircleMarker>} */
  const markersById = new Map();

  let pickLocationMode = false;
  /** @type {bootstrap.Modal | null} */
  let deviceModal = null;
  /** @type {bootstrap.Modal | null} */
  let deleteModal = null;
  let deleteTargetId = null;

  function getAccess() {
    return localStorage.getItem(STORAGE.access);
  }

  function clearAuth() {
    localStorage.removeItem(STORAGE.access);
    localStorage.removeItem(STORAGE.refresh);
    localStorage.removeItem(STORAGE.role);
    localStorage.removeItem(STORAGE.username);
  }

  function isAdmin() {
    return localStorage.getItem(STORAGE.role) === 'ADMIN';
  }

  function requireAuth() {
    if (!getAccess()) {
      window.location.href = '/login/';
      return false;
    }
    return true;
  }

  async function tryRefresh() {
    const refresh = localStorage.getItem(STORAGE.refresh);
    if (!refresh) return false;
    const res = await fetch(API.refresh, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem(STORAGE.access, data.access);
    if (data.refresh) localStorage.setItem(STORAGE.refresh, data.refresh);
    return true;
  }

  async function apiFetch(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = getAccess();
    if (token) headers.Authorization = `Bearer ${token}`;
    const retry = options._retry === true;
    delete options._retry;
    let res = await fetch(url, { ...options, headers });
    if (res.status === 401 && !retry) {
      const ok = await tryRefresh();
      if (ok) return apiFetch(url, { ...options, _retry: true });
      clearAuth();
      window.location.href = '/login/';
    }
    return res;
  }

  function showAppAlert(msg) {
    const el = document.getElementById('app-alert');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('d-none');
  }

  function hideAppAlert() {
    const el = document.getElementById('app-alert');
    if (!el) return;
    el.classList.add('d-none');
  }

  function showModalAlert(msg) {
    const el = document.getElementById('modal-alert');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('d-none');
  }

  function hideModalAlert() {
    const el = document.getElementById('modal-alert');
    if (!el) return;
    el.classList.add('d-none');
  }

  function formatErrors(data) {
    if (!data || typeof data !== 'object') return 'Yêu cầu không hợp lệ.';
    if (data.detail) return String(data.detail);
    const parts = [];
    Object.keys(data).forEach((k) => {
      const v = data[k];
      if (Array.isArray(v)) parts.push(`${k}: ${v.join(' ')}`);
      else parts.push(`${k}: ${v}`);
    });
    return parts.join(' ') || 'Yêu cầu không hợp lệ.';
  }

  function initMap() {
    const el = document.getElementById('map');
    if (!el || map) return;
    map = L.map('map').setView([10.8231, 106.6297], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);

    map.on('click', (e) => {
      if (!pickLocationMode) return;
      const latEl = document.getElementById('device-lat');
      const lngEl = document.getElementById('device-lng');
      if (latEl) latEl.value = e.latlng.lat.toFixed(6);
      if (lngEl) lngEl.value = e.latlng.lng.toFixed(6);
    });
  }

  function devicePopupHtml(d) {
    const typeLabel = DEVICE_LABELS[d.device_type] || d.device_type;
    const status = d.is_active ? 'Hoạt động' : 'Báo lỗi / ngưng';
    return (
      `<div class="device-popup-title">${escapeHtml(d.name)}</div>` +
      `<div class="small text-muted">${escapeHtml(typeLabel)}</div>` +
      `<div class="small mt-1">${d.is_active ? '<span class="text-success">●</span>' : '<span class="text-danger">●</span>'} ${status}</div>`
    );
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function renderMarkers(devices) {
    if (!markerLayer) return;
    markerLayer.clearLayers();
    markersById.clear();
    devices.forEach((d) => {
      const color = d.is_active ? '#198754' : '#dc3545';
      const m = L.circleMarker([d.latitude, d.longitude], {
        radius: 10,
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.9,
      });
      m.bindPopup(devicePopupHtml(d));
      m.addTo(markerLayer);
      markersById.set(d.id, m);
    });
  }

  function renderTable(devices) {
    const tbody = document.getElementById('device-table-body');
    if (!tbody) return;
    const admin = isAdmin();
    const colspan = admin ? 4 : 3;
    if (!devices.length) {
      tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center text-muted py-4">Chưa có thiết bị.</td></tr>`;
      return;
    }
    tbody.innerHTML = devices
      .map((d) => {
        const typeLabel = DEVICE_LABELS[d.device_type] || d.device_type;
        const st = d.is_active
          ? '<span class="badge text-bg-success">Hoạt động</span>'
          : '<span class="badge text-bg-danger">Lỗi</span>';
        const actions = admin
          ? `<td class="admin-only text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-primary btn-edit" data-id="${d.id}">Sửa</button>
            <button type="button" class="btn btn-sm btn-outline-danger btn-del" data-id="${d.id}">Xóa</button>
          </td>`
          : '';
        return `<tr class="device-row" data-id="${d.id}" style="cursor:pointer;">
        <td>${escapeHtml(d.name)}</td>
        <td>${escapeHtml(typeLabel)}</td>
        <td>${st}</td>
        ${admin ? actions : ''}
      </tr>`;
      })
      .join('');

    tbody.querySelectorAll('.device-row').forEach((row) => {
      row.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        const id = Number(row.getAttribute('data-id'));
        const d = devices.find((x) => x.id === id);
        if (d && map) {
          map.flyTo([d.latitude, d.longitude], 16);
          const mk = markersById.get(id);
          if (mk) mk.openPopup();
        }
      });
    });

    tbody.querySelectorAll('.btn-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(btn.getAttribute('data-id'));
        const d = devices.find((x) => x.id === id);
        if (d) openEditModal(d);
      });
    });

    tbody.querySelectorAll('.btn-del').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(btn.getAttribute('data-id'));
        const d = devices.find((x) => x.id === id);
        if (d) openDeleteModal(id, d.name);
      });
    });
  }

  let cachedDevices = [];

  async function loadDevices() {
    hideAppAlert();
    const res = await apiFetch(API.devices);
    if (!res.ok) {
      showAppAlert('Không tải được danh sách thiết bị.');
      return;
    }
    cachedDevices = await res.json();
    renderMarkers(cachedDevices);
    renderTable(cachedDevices);
  }

  function openCreateModal() {
    hideModalAlert();
    document.getElementById('device-modal-title').textContent = 'Thêm thiết bị';
    document.getElementById('device-id').value = '';
    document.getElementById('device-name').value = '';
    document.getElementById('device-type').value = 'ELECTRIC_POLE';
    document.getElementById('device-lat').value = '10.823100';
    document.getElementById('device-lng').value = '106.629700';
    document.getElementById('device-active').checked = true;
    pickLocationMode = true;
    deviceModal.show();
  }

  function openEditModal(d) {
    hideModalAlert();
    document.getElementById('device-modal-title').textContent = 'Sửa thiết bị';
    document.getElementById('device-id').value = String(d.id);
    document.getElementById('device-name').value = d.name;
    document.getElementById('device-type').value = d.device_type;
    document.getElementById('device-lat').value = String(d.latitude);
    document.getElementById('device-lng').value = String(d.longitude);
    document.getElementById('device-active').checked = !!d.is_active;
    pickLocationMode = true;
    deviceModal.show();
  }

  function openDeleteModal(id, name) {
    deleteTargetId = id;
    document.getElementById('delete-device-name').textContent = name;
    deleteModal.show();
  }

  async function saveDevice() {
    hideModalAlert();
    const id = document.getElementById('device-id').value.trim();
    const body = {
      name: document.getElementById('device-name').value.trim(),
      device_type: document.getElementById('device-type').value,
      latitude: parseFloat(document.getElementById('device-lat').value),
      longitude: parseFloat(document.getElementById('device-lng').value),
      is_active: document.getElementById('device-active').checked,
    };
    if (!body.name) {
      showModalAlert('Nhập tên thiết bị.');
      return;
    }
    if (Number.isNaN(body.latitude) || Number.isNaN(body.longitude)) {
      showModalAlert('Tọa độ không hợp lệ.');
      return;
    }
    const url = id ? `${API.devices}${id}/` : API.devices;
    const method = id ? 'PATCH' : 'POST';
    const res = await apiFetch(url, { method, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showModalAlert(formatErrors(data));
      return;
    }
    deviceModal.hide();
    await loadDevices();
    if (data.id && map) {
      map.flyTo([data.latitude, data.longitude], 15);
    }
  }

  async function confirmDelete() {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    const res = await apiFetch(`${API.devices}${id}/`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showAppAlert(formatErrors(data));
      return;
    }
    deleteModal.hide();
    deleteTargetId = null;
    await loadDevices();
  }

  async function logout() {
    const refresh = localStorage.getItem(STORAGE.refresh);
    await fetch(API.logout, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(refresh ? { refresh } : {}),
    });
    clearAuth();
    window.location.href = '/login/';
  }

  function setupNav() {
    const u = localStorage.getItem(STORAGE.username) || '';
    const role = localStorage.getItem(STORAGE.role) || '';
    const navUser = document.getElementById('nav-user');
    const navRole = document.getElementById('nav-role');
    if (navUser) navUser.textContent = u ? `Xin chào, ${u}` : '';
    if (navRole) {
      const labels = {
        ADMIN: 'Quản trị',
        OPERATOR: 'Vận hành',
        TECHNICIAN: 'Kỹ thuật',
        CITIZEN: 'Người dân',
      };
      navRole.textContent = labels[role] || role || '—';
    }
    const addBtn = document.getElementById('btn-add-device');
    const adminCols = document.querySelectorAll('.admin-only');
    if (isAdmin()) {
      addBtn.classList.remove('d-none');
      adminCols.forEach((c) => c.classList.remove('d-none'));
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;
    setupNav();
    initMap();

    deviceModal = new bootstrap.Modal(document.getElementById('device-modal'));
    deleteModal = new bootstrap.Modal(document.getElementById('delete-modal'));

    document.getElementById('device-modal').addEventListener('hidden.bs.modal', () => {
      pickLocationMode = false;
    });

    document.getElementById('btn-logout').addEventListener('click', () => logout());

    document.getElementById('btn-add-device').addEventListener('click', () => openCreateModal());
    document.getElementById('device-save').addEventListener('click', () => saveDevice());
    document.getElementById('delete-confirm').addEventListener('click', () => confirmDelete());

    loadDevices();
  });
})();
