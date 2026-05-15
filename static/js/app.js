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
    incidents: '/api/incidents/',
    notifCount: '/api/notifications/unread-count/',
  };

  const DEVICE_LABELS = {
    ELECTRIC_POLE: 'Trụ điện',
    ELECTRIC_METER: 'Công tơ điện',
    WATER_METER: 'Đồng hồ nước',
    TRANSFORMER: 'Trạm biến áp',
    VALVE: 'Van nước',
  };

  /** @type {L.Map | null} */
  let map = null;
  /** @type {L.LayerGroup | null} */
  let markerLayer = null;
  /** @type {L.LayerGroup | null} */
  let routeLayer = null;
  /** @type {Map<number, L.CircleMarker>} */
  const markersById = new Map();
  /** @type {L.LayerGroup | null} */
  let incidentLayer = null;

  let pickLocationMode = false;
  /** @type {bootstrap.Modal | null} */
  let deviceModal = null;
  /** @type {bootstrap.Modal | null} */
  let deleteModal = null;
  let deleteTargetId = null;

  let currentPage = 1;
  let currentSearch = '';
  let currentType = '';
  let currentSort = '-updated_at';

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

  function showAppAlert(msg, isSuccess = false) {
    const el = document.getElementById('app-alert');
    if (!el) return;
    el.textContent = msg;
    el.className = `alert py-2 small ${isSuccess ? 'alert-success' : 'alert-danger'}`;
    el.classList.remove('d-none');
    if (isSuccess) {
      setTimeout(() => el.classList.add('d-none'), 3000);
    }
  }

  function hideAppAlert() {
    const el = document.getElementById('app-alert');
    if (!el) return;
    el.classList.add('d-none');
  }

  let searchTimer = null;
  function debounce(fn, ms = 300) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(fn, ms);
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
    routeLayer = L.layerGroup().addTo(map);

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

    drawRoutes(devices);
  }

  function drawRoutes(devices) {
    if (!routeLayer) return;
    routeLayer.clearLayers();
    
    devices.forEach(d => {
      if (d.parent) {
        const parentDevice = devices.find(x => x.id === d.parent);
        if (parentDevice) {
          const isElectric = ['ELECTRIC_POLE', 'TRANSFORMER', 'ELECTRIC_METER'].includes(d.device_type);
          const pts = [
            [d.latitude, d.longitude],
            [parentDevice.latitude, parentDevice.longitude]
          ];
          if (isElectric) {
            L.polyline(pts, { color: '#ef4444', weight: 3, opacity: 0.8, className: 'route-animated' }).addTo(routeLayer);
          } else {
            L.polyline(pts, { color: '#0ea5e9', weight: 3, opacity: 0.8 }).addTo(routeLayer);
          }
        }
      }
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
    const params = new URLSearchParams({
      page: currentPage,
      search: currentSearch,
      device_type: currentType,
      ordering: currentSort
    });
    
    const res = await apiFetch(`${API.devices}?${params.toString()}`);
    if (!res.ok) {
      showAppAlert('Không tải được danh sách thiết bị.');
      return;
    }
    const data = await res.json();
    
    // Check if paginated
    if (data.results !== undefined) {
      cachedDevices = data.results;
      updatePaginationUI(data);
    } else {
      cachedDevices = data;
      document.getElementById('page-info').textContent = `Tổng: ${data.length}`;
    }
    
    renderMarkers(cachedDevices);
    renderTable(cachedDevices);
  }

  function updatePaginationUI(data) {
    const info = document.getElementById('page-info');
    const btnPrev = document.getElementById('btn-prev-page');
    const btnNext = document.getElementById('btn-next-page');
    
    if (info) info.textContent = `Tổng: ${data.count} | Trang ${currentPage}`;
    if (btnPrev) btnPrev.disabled = !data.previous;
    if (btnNext) btnNext.disabled = !data.next;
  }

  function populateParentSelect(excludeId = null) {
    const parentSelect = document.getElementById('device-parent');
    if (!parentSelect) return;
    let options = '<option value="">-- Không có --</option>';
    cachedDevices.forEach(d => {
      if (excludeId && d.id === excludeId) return;
      options += `<option value="${d.id}">${d.name} (${DEVICE_LABELS[d.device_type] || d.device_type})</option>`;
    });
    parentSelect.innerHTML = options;
  }

  function openCreateModal() {
    hideModalAlert();
    populateParentSelect();
    document.getElementById('device-modal-title').textContent = 'Thêm thiết bị';
    document.getElementById('device-id').value = '';
    document.getElementById('device-name').value = '';
    document.getElementById('device-type').value = 'ELECTRIC_POLE';
    document.getElementById('device-parent').value = '';
    document.getElementById('device-attributes').value = '';
    document.getElementById('device-lat').value = '10.823100';
    document.getElementById('device-lng').value = '106.629700';
    document.getElementById('device-active').checked = true;
    pickLocationMode = true;
    deviceModal.show();
  }

  function openEditModal(d) {
    hideModalAlert();
    populateParentSelect(d.id);
    document.getElementById('device-modal-title').textContent = 'Sửa thiết bị';
    document.getElementById('device-id').value = String(d.id);
    document.getElementById('device-name').value = d.name;
    document.getElementById('device-type').value = d.device_type;
    document.getElementById('device-parent').value = d.parent ? String(d.parent) : '';
    document.getElementById('device-attributes').value = d.attributes ? JSON.stringify(d.attributes, null, 2) : '';
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
    document.querySelectorAll('#device-form .is-invalid').forEach(el => el.classList.remove('is-invalid'));
    
    const id = document.getElementById('device-id').value.trim();
    const nameEl = document.getElementById('device-name');
    const latEl = document.getElementById('device-lat');
    const lngEl = document.getElementById('device-lng');
    const attrEl = document.getElementById('device-attributes');
    
    let parsedAttributes = {};
    let attrError = false;
    if (attrEl.value.trim()) {
      try {
        parsedAttributes = JSON.parse(attrEl.value.trim());
      } catch (e) {
        attrError = true;
      }
    }
    
    const body = {
      name: nameEl.value.trim(),
      device_type: document.getElementById('device-type').value,
      parent: document.getElementById('device-parent').value || null,
      attributes: parsedAttributes,
      latitude: parseFloat(latEl.value),
      longitude: parseFloat(lngEl.value),
      is_active: document.getElementById('device-active').checked,
    };
    
    let hasError = false;
    
    if (!body.name) {
      nameEl.classList.add('is-invalid');
      hasError = true;
    }
    if (attrError) {
      attrEl.classList.add('is-invalid');
      hasError = true;
    }
    if (Number.isNaN(body.latitude) || body.latitude < -90 || body.latitude > 90) {
      latEl.classList.add('is-invalid');
      hasError = true;
    }
    if (Number.isNaN(body.longitude) || body.longitude < -180 || body.longitude > 180) {
      lngEl.classList.add('is-invalid');
      hasError = true;
    }
    
    if (hasError) {
      showModalAlert('Vui lòng kiểm tra lại các trường bị lỗi.');
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

  async function changePassword() {
    const cpAlert = document.getElementById('cp-alert');
    cpAlert.classList.add('d-none');
    const old_password = document.getElementById('cp-old').value;
    const new_password = document.getElementById('cp-new').value;
    if (!old_password || !new_password) {
      cpAlert.textContent = 'Vui lòng nhập đầy đủ thông tin.';
      cpAlert.classList.remove('d-none', 'alert-success');
      cpAlert.classList.add('alert-danger');
      return;
    }
    const res = await apiFetch('/api/auth/change-password/', {
      method: 'POST',
      body: JSON.stringify({ old_password, new_password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      cpAlert.textContent = formatErrors(data);
      cpAlert.classList.remove('d-none', 'alert-success');
      cpAlert.classList.add('alert-danger');
      return;
    }
    cpAlert.textContent = 'Đổi mật khẩu thành công!';
    cpAlert.classList.remove('d-none', 'alert-danger');
    cpAlert.classList.add('alert-success');
    document.getElementById('change-password-form').reset();
    setTimeout(() => {
      const modal = bootstrap.Modal.getInstance(document.getElementById('change-password-modal'));
      if (modal) modal.hide();
    }, 1500);
  }

  let idleTimer;
  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      logout();
    }, 15 * 60 * 1000); // 15 minutes
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
    const adminCols = document.querySelectorAll('.admin-only');
    const navUsersLink = document.getElementById('nav-users-link');
    const navDashboardLink = document.getElementById('nav-dashboard-link');
    if (isAdmin()) {
      adminCols.forEach((c) => c.classList.remove('d-none'));
      if (navUsersLink) navUsersLink.classList.remove('d-none');
      if (navDashboardLink) navDashboardLink.classList.remove('d-none');
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
    
    // Import / Export CSV
    const btnExport = document.getElementById('btn-export-csv');
    const btnImport = document.getElementById('btn-import-csv');
    const fileImport = document.getElementById('file-import-csv');
    
    if (btnExport) {
      btnExport.addEventListener('click', async () => {
        const token = getAccess();
        try {
          const res = await fetch(`${API.devices}export_csv/`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!res.ok) {
            showAppAlert('Lỗi khi xuất CSV');
            return;
          }
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'devices.csv';
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);
        } catch(e) {
          showAppAlert('Lỗi khi tải file');
        }
      });
    }
    if (btnImport && fileImport) {
      btnImport.addEventListener('click', () => fileImport.click());
      fileImport.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        
        const token = getAccess();
        const res = await fetch(`${API.devices}import_csv/`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        const data = await res.json().catch(()=>({}));
        if (res.ok) {
          showAppAlert(data.detail || 'Import thành công', true);
          loadDevices();
        } else {
          showAppAlert(data.detail || 'Lỗi import');
        }
        fileImport.value = '';
      });
    }

    // UX Filters
    const searchEl = document.getElementById('search-device');
    const typeEl = document.getElementById('filter-type');
    const sortEl = document.getElementById('sort-device');
    const prevEl = document.getElementById('btn-prev-page');
    const nextEl = document.getElementById('btn-next-page');

    if (searchEl) {
      searchEl.addEventListener('input', (e) => {
        currentSearch = e.target.value;
        currentPage = 1;
        debounce(() => loadDevices());
      });
    }
    if (typeEl) {
      typeEl.addEventListener('change', (e) => {
        currentType = e.target.value;
        currentPage = 1;
        loadDevices();
      });
    }
    if (sortEl) {
      sortEl.addEventListener('change', (e) => {
        currentSort = e.target.value;
        currentPage = 1;
        loadDevices();
      });
    }
    if (prevEl) {
      prevEl.addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; loadDevices(); }
      });
    }
    if (nextEl) {
      nextEl.addEventListener('click', () => {
        currentPage++; loadDevices();
      });
    }
    
    const btnCpSave = document.getElementById('cp-save');
    if (btnCpSave) btnCpSave.addEventListener('click', () => changePassword());

    // Load incident markers
    async function loadIncidentMarkers() {
      try {
        const res = await apiFetch(API.incidents);
        if (!res.ok) return;
        const data = await res.json();
        const incidents = data.results ?? data;
        if (incidentLayer) incidentLayer.clearLayers();
        else { incidentLayer = L.layerGroup().addTo(map); }
        const SCOLOR = { OPEN: '#ef4444', ASSIGNED: '#f59e0b', IN_PROGRESS: '#0ea5e9', RESOLVED: '#22c55e', CLOSED: '#94a3b8' };
        incidents.forEach(inc => {
          const color = SCOLOR[inc.status] || '#94a3b8';
          const m = L.circleMarker([inc.latitude, inc.longitude], {
            radius: 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.9
          }).addTo(incidentLayer);
          m.bindPopup(`<b>⚠ ${inc.title}</b><br>${inc.status_display}<br><a href="/incidents/" class="small">Xem chi tiết →</a>`);
        });
      } catch {}
    }

    // Poll notification badge
    async function pollNotifBadge() {
      try {
        const res = await apiFetch(API.notifCount);
        if (!res.ok) return;
        const { unread_count } = await res.json();
        const badge = document.getElementById('notif-badge');
        if (badge) {
          if (unread_count > 0) { badge.textContent = unread_count > 99 ? '99+' : unread_count; badge.classList.remove('d-none'); }
          else badge.classList.add('d-none');
        }
      } catch {}
    }

    ['mousemove', 'keydown', 'scroll', 'click'].forEach(evt =>
      document.addEventListener(evt, resetIdleTimer)
    );
    resetIdleTimer();

    loadDevices();
    loadIncidentMarkers();
    pollNotifBadge();
    setInterval(pollNotifBadge, 30000);
    setInterval(loadIncidentMarkers, 60000);
  });
})();
