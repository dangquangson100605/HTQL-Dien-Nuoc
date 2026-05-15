/* incidents.js — Quản lý Sự cố */
'use strict';
(() => {
  const STORAGE = { access: 'infra_access', refresh: 'infra_refresh', role: 'infra_role', username: 'infra_username' };
  const API = {
    incidents: '/api/incidents/',
    users: '/api/auth/users/',
    logout: '/api/auth/logout/',
  };
  const API_REFRESH = '/api/auth/token/refresh/';

  const STATUS_COLOR = { OPEN: 'danger', ASSIGNED: 'warning', IN_PROGRESS: 'info', RESOLVED: 'success', CLOSED: 'secondary' };
  const SEVERITY_COLOR = { LOW: 'success', MEDIUM: 'warning', HIGH: 'danger', CRITICAL: 'dark' };
  const SEVERITY_ICON = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🔴', CRITICAL: '🚨' };

  let currentRole = '';
  let incidentMap = null;
  let incidentMarkers = [];
  const detailModal = new bootstrap.Modal(document.getElementById('incidentDetailModal'));
  const assignModal = new bootstrap.Modal(document.getElementById('assignModal'));
  const statusModal = new bootstrap.Modal(document.getElementById('statusModal'));

  async function doRefresh() {
    const refresh = localStorage.getItem(STORAGE.refresh);
    if (!refresh) return false;
    try {
      const res = await fetch(API_REFRESH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      localStorage.setItem(STORAGE.access, data.access);
      if (data.refresh) localStorage.setItem(STORAGE.refresh, data.refresh);
      return true;
    } catch { return false; }
  }

  async function apiFetch(url, opts = {}, retry = true) {
    const token = localStorage.getItem(STORAGE.access);
    const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers };
    const res = await fetch(url, { ...opts, headers });
    if (res.status === 401 && retry) {
      const ok = await doRefresh();
      if (ok) return apiFetch(url, opts, false);
      window.location.href = '/login/';
    }
    return res;
  }

  function showAlert(msg, isSuccess = false) {
    const el = document.getElementById('app-alert');
    if (!el) return;
    el.textContent = msg;
    el.className = `alert py-2 small ${isSuccess ? 'alert-success' : 'alert-danger'}`;
    el.classList.remove('d-none');
    if (isSuccess) setTimeout(() => el.classList.add('d-none'), 3000);
  }

  function setupNav() {
    const u = localStorage.getItem(STORAGE.username) || '';
    currentRole = localStorage.getItem(STORAGE.role) || '';
    const el = document.getElementById('nav-user');
    const roleEl = document.getElementById('nav-role');
    if (el) el.textContent = u ? `Xin chào, ${u}` : '';
    const labels = { ADMIN: 'Quản trị', OPERATOR: 'Vận hành', TECHNICIAN: 'Kỹ thuật', CITIZEN: 'Người dân' };
    if (roleEl) roleEl.textContent = labels[currentRole] || currentRole;
    if (currentRole === 'ADMIN') {
      document.getElementById('nav-users-link')?.classList.remove('d-none');
      document.getElementById('nav-dashboard-link')?.classList.remove('d-none');
    }
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
      const refresh = localStorage.getItem(STORAGE.refresh);
      await apiFetch(API.logout, { method: 'POST', body: JSON.stringify({ refresh }) });
      localStorage.clear();
      window.location.href = '/login/';
    });
  }

  async function pollNotifBadge() {
    try {
      const res = await apiFetch('/api/notifications/unread-count/');
      if (!res.ok) return;
      const { unread_count } = await res.json();
      const badge = document.getElementById('notif-badge');
      if (badge) {
        if (unread_count > 0) { badge.textContent = unread_count > 99 ? '99+' : unread_count; badge.classList.remove('d-none'); }
        else badge.classList.add('d-none');
      }
    } catch {}
  }

  function initMap() {
    incidentMap = L.map('incident-map').setView([16.0544, 108.2022], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(incidentMap);
  }

  function refreshMap(incidents) {
    incidentMarkers.forEach(m => incidentMap.removeLayer(m));
    incidentMarkers = [];
    incidents.forEach(inc => {
      const color = inc.status === 'RESOLVED' || inc.status === 'CLOSED' ? '#22c55e' :
                    inc.severity === 'CRITICAL' ? '#7f1d1d' :
                    inc.severity === 'HIGH' ? '#ef4444' : '#f59e0b';
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)" title="${inc.title}"></div>`,
        iconAnchor: [7, 7],
      });
      const m = L.marker([inc.latitude, inc.longitude], { icon })
        .addTo(incidentMap)
        .bindPopup(`<b>${inc.title}</b><br><span class="badge bg-secondary">${inc.status_display}</span>`);
      incidentMarkers.push(m);
    });
  }

  async function loadIncidents() {
    const status = document.getElementById('filter-status').value;
    const severity = document.getElementById('filter-severity').value;
    const type = document.getElementById('filter-type').value;
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (severity) params.append('severity', severity);
    if (type) params.append('incident_type', type);

    const res = await apiFetch(`${API.incidents}?${params}`);
    if (!res.ok) return;
    const data = await res.json();
    const incidents = data.results ?? data;
    const countEl = document.getElementById('incident-count');
    if (countEl) countEl.textContent = `${incidents.length} sự cố`;

    const tbody = document.getElementById('incident-table-body');
    if (!tbody) return;
    if (!incidents.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Không có sự cố nào.</td></tr>';
      return;
    }

    tbody.innerHTML = incidents.map(inc => `
      <tr style="cursor:pointer;" onclick="window._viewIncident(${inc.id})">
        <td class="fw-medium">${inc.title}</td>
        <td class="text-center">${inc.type_display}</td>
        <td class="text-center"><span class="badge bg-${SEVERITY_COLOR[inc.severity]}">${SEVERITY_ICON[inc.severity]} ${inc.severity_display}</span></td>
        <td class="text-center"><span class="badge bg-${STATUS_COLOR[inc.status]} bg-opacity-75">${inc.status_display}</span></td>
        <td class="text-muted small">${inc.reported_by_username}</td>
        <td class="text-muted small">${new Date(inc.created_at).toLocaleDateString('vi-VN')}</td>
        <td class="text-center"><button class="btn btn-sm btn-outline-primary py-0 px-2" onclick="event.stopPropagation();window._viewIncident(${inc.id})"><i class="bi bi-eye"></i></button></td>
      </tr>`).join('');

    refreshMap(incidents);
  }

  async function viewIncident(id) {
    document.getElementById('incident-modal-title').textContent = 'Chi tiết Sự cố';
    document.getElementById('incident-detail-body').innerHTML = '<div class="text-center py-4"><div class="spinner-border text-danger" role="status"></div></div>';
    document.getElementById('incident-modal-actions').innerHTML = '';
    detailModal.show();

    const res = await apiFetch(`${API.incidents}${id}/`);
    if (!res.ok) { document.getElementById('incident-detail-body').innerHTML = '<div class="text-danger">Lỗi tải dữ liệu.</div>'; return; }
    const inc = await res.json();

    document.getElementById('incident-modal-title').textContent = inc.title;
    document.getElementById('incident-detail-body').innerHTML = `
      <div class="row g-2 mb-3">
        <div class="col-6"><span class="text-muted small">Loại:</span> <strong>${inc.type_display}</strong></div>
        <div class="col-6"><span class="text-muted small">Mức độ:</span> <span class="badge bg-${SEVERITY_COLOR[inc.severity]}">${SEVERITY_ICON[inc.severity]} ${inc.severity_display}</span></div>
        <div class="col-6"><span class="text-muted small">Trạng thái:</span> <span class="badge bg-${STATUS_COLOR[inc.status]} bg-opacity-75">${inc.status_display}</span></div>
        <div class="col-6"><span class="text-muted small">Người báo:</span> <strong>${inc.reported_by_username}</strong></div>
        <div class="col-6"><span class="text-muted small">KTV phụ trách:</span> <strong>${inc.assigned_to_username || '—'}</strong></div>
        <div class="col-6"><span class="text-muted small">Thiết bị:</span> <strong>${inc.device_name || '—'}</strong></div>
        <div class="col-12"><span class="text-muted small">Tọa độ:</span> ${inc.latitude.toFixed(5)}, ${inc.longitude.toFixed(5)}</div>
        <div class="col-12 mt-1"><span class="text-muted small">Mô tả:</span><p class="mt-1 mb-0">${inc.description}</p></div>
      </div>
      <hr class="my-2">
      <h6 class="fw-semibold mb-2"><i class="bi bi-journal-text me-1"></i> Ghi chú tiến độ</h6>
      <div id="notes-list">
        ${inc.notes.length ? inc.notes.map(n => `
          <div class="border rounded p-2 mb-2 bg-light">
            <div class="small text-muted mb-1">${n.author_username} — ${new Date(n.created_at).toLocaleString('vi-VN')}</div>
            <div>${n.content}</div>
          </div>`).join('') : '<p class="text-muted small">Chưa có ghi chú.</p>'}
      </div>`;

    // Action buttons
    const actionsEl = document.getElementById('incident-modal-actions');
    actionsEl.innerHTML = `<button class="btn btn-secondary" data-bs-dismiss="modal">Đóng</button>`;
    if (currentRole === 'ADMIN') {
      actionsEl.innerHTML += `<button class="btn btn-primary" onclick="window._openAssign(${inc.id})"><i class="bi bi-person-check me-1"></i> Phân công</button>`;
    }
    if (['ADMIN', 'OPERATOR', 'TECHNICIAN'].includes(currentRole)) {
      actionsEl.innerHTML += `<button class="btn btn-warning" onclick="window._openStatus(${inc.id}, '${inc.status}')"><i class="bi bi-pencil me-1"></i> Cập nhật trạng thái</button>`;
    }
  }

  async function loadTechnicians() {
    const res = await apiFetch(`${API.users}?role=TECHNICIAN`);
    if (!res.ok) return;
    const data = await res.json();
    const techs = data.results ?? data;
    const select = document.getElementById('assign-technician');
    if (!select) return;
    select.innerHTML = '<option value="">-- Chọn kỹ thuật viên --</option>' + techs.filter(u => u.role === 'TECHNICIAN').map(u => `<option value="${u.id}">${u.username}</option>`).join('');
  }

  window._viewIncident = viewIncident;
  window._openAssign = (id) => {
    document.getElementById('assign-incident-id').value = id;
    detailModal.hide();
    loadTechnicians();
    assignModal.show();
  };
  window._openStatus = (id, currentStatus) => {
    document.getElementById('status-incident-id').value = id;
    document.getElementById('status-new').value = currentStatus;
    document.getElementById('status-note').value = '';
    detailModal.hide();
    statusModal.show();
  };

  document.getElementById('btn-confirm-assign')?.addEventListener('click', async () => {
    const id = document.getElementById('assign-incident-id').value;
    const techId = document.getElementById('assign-technician').value;
    if (!techId) { showAlert('Vui lòng chọn kỹ thuật viên.'); return; }
    const res = await apiFetch(`${API.incidents}${id}/assign/`, { method: 'PATCH', body: JSON.stringify({ assigned_to: techId }) });
    if (res.ok) { showAlert('Phân công thành công!', true); assignModal.hide(); loadIncidents(); }
    else { const d = await res.json().catch(() => ({})); showAlert(d.detail || 'Lỗi phân công.'); }
  });

  document.getElementById('btn-confirm-status')?.addEventListener('click', async () => {
    const id = document.getElementById('status-incident-id').value;
    const newStatus = document.getElementById('status-new').value;
    const note = document.getElementById('status-note').value.trim();
    const res = await apiFetch(`${API.incidents}${id}/update-status/`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
    if (res.ok) {
      if (note) await apiFetch(`${API.incidents}${id}/add-note/`, { method: 'POST', body: JSON.stringify({ content: note }) });
      showAlert('Cập nhật trạng thái thành công!', true);
      statusModal.hide();
      loadIncidents();
    } else { const d = await res.json().catch(() => ({})); showAlert(d.detail || 'Lỗi cập nhật.'); }
  });

  document.getElementById('btn-filter')?.addEventListener('click', loadIncidents);
  document.getElementById('btn-clear-filter')?.addEventListener('click', () => {
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-severity').value = '';
    document.getElementById('filter-type').value = '';
    loadIncidents();
  });

  setupNav();
  initMap();
  loadIncidents();
  pollNotifBadge();
  setInterval(pollNotifBadge, 30000);
})();
