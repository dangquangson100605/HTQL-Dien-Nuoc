/* report.js — Báo cáo Sự cố */
'use strict';
(() => {
  const STORAGE = { access: 'infra_access', refresh: 'infra_refresh', role: 'infra_role', username: 'infra_username' };
  const API = { incidents: '/api/incidents/', devices: '/api/devices/?page_size=999', notifications: '/api/notifications/', logout: '/api/auth/logout/' };

  // Parse query parameters from URL
  const urlParams = new URLSearchParams(window.location.search);
  const deviceIdParam = urlParams.get('device_id');
  const edgeIdParam = urlParams.get('edge_id');
  const latParam = urlParams.get('lat');
  const lngParam = urlParams.get('lng');
  const typeParam = urlParams.get('type'); // ELECTRIC / WATER
  const targetTypeParam = urlParams.get('target_type'); // DEVICE / EDGE

  const API_REFRESH = '/api/auth/token/refresh/';

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

  function setupNav() {
    const u = localStorage.getItem(STORAGE.username) || '';
    const role = localStorage.getItem(STORAGE.role) || '';
    const el = document.getElementById('nav-user');
    const roleEl = document.getElementById('nav-role');
    if (el) el.textContent = u ? `Xin chào, ${u}` : '';
    if (roleEl) {
      const labels = { ADMIN: 'Quản trị', OPERATOR: 'Vận hành', TECHNICIAN: 'Kỹ thuật', CITIZEN: 'Người dân' };
      roleEl.textContent = labels[role] || role;
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

  let reportMap, reportMarker;
  function initMap() {
    let defaultLat = 10.8231; // Ho Chi Minh City standard default if not set
    let defaultLng = 106.6297;
    let hasCoords = false;

    if (latParam && lngParam) {
      const lat = parseFloat(latParam);
      const lng = parseFloat(lngParam);
      if (!isNaN(lat) && !isNaN(lng)) {
        defaultLat = lat;
        defaultLng = lng;
        hasCoords = true;

        const latInput = document.getElementById('report-lat');
        const lngInput = document.getElementById('report-lng');
        if (latInput) latInput.value = lat.toFixed(6);
        if (lngInput) lngInput.value = lng.toFixed(6);
      }
    }

    reportMap = L.map('report-map').setView([defaultLat, defaultLng], hasCoords ? 17 : 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(reportMap);

    if (hasCoords) {
      reportMarker = L.marker([defaultLat, defaultLng], { icon: L.divIcon({ className: '', html: '<div style="background:#ef4444;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>', iconAnchor: [8, 8] }) }).addTo(reportMap);
    }

    reportMap.on('click', (e) => {
      const { lat, lng } = e.latlng;
      document.getElementById('report-lat').value = lat.toFixed(6);
      document.getElementById('report-lng').value = lng.toFixed(6);
      if (reportMarker) reportMap.removeLayer(reportMarker);
      reportMarker = L.marker([lat, lng], { icon: L.divIcon({ className: '', html: '<div style="background:#ef4444;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>', iconAnchor: [8, 8] }) }).addTo(reportMap);
    });
  }

  function prefillIncidentType() {
    if (typeParam) {
      const typeSelect = document.getElementById('report-type');
      if (typeSelect) {
        if (typeParam === 'ELECTRIC' || typeParam === 'WATER') {
          typeSelect.value = typeParam;
        }
      }
    }
  }

  async function loadDevices() {
    const res = await apiFetch(API.devices);
    if (!res.ok) return;
    const data = await res.json();
    const devices = data.results ?? data;
    const select = document.getElementById('report-device');
    if (!select) return;
    const LABELS = {
      TRANSFORMER: 'Trạm biến áp',
      DISTRIBUTION_BOX: 'Tủ điện / tủ phân phối',
      ELECTRIC_POLE: 'Trụ điện',
      ELECTRIC_JUNCTION: 'Điểm nối điện',
      ELECTRIC_METER: 'Công tơ điện',
      WATER_TANK: 'Bể nước',
      PUMP_STATION: 'Trạm bơm',
      MAIN_VALVE: 'Van tổng',
      BRANCH_VALVE: 'Van nhánh',
      WATER_JUNCTION: 'Điểm nối nước',
      WATER_METER: 'Đồng hồ nước',
      VALVE: 'Van nước (cũ)'
    };
    select.innerHTML = '<option value="">-- Không rõ --</option>' + devices.map(d => `<option value="${d.id}">${d.name} (${LABELS[d.device_type] || d.device_type})</option>`).join('');

    if (deviceIdParam && targetTypeParam === 'DEVICE') {
      select.value = deviceIdParam;
    }
  }

  function handleEdgeSelection() {
    if (targetTypeParam === 'EDGE' && edgeIdParam) {
      const deviceSelect = document.getElementById('report-device');
      if (deviceSelect) {
        let edgeInfo = document.getElementById('report-edge-info');
        if (!edgeInfo) {
          edgeInfo = document.createElement('div');
          edgeInfo.id = 'report-edge-info';
          edgeInfo.className = 'alert alert-info py-2 small mb-3 mt-1';
          deviceSelect.parentNode.insertBefore(edgeInfo, deviceSelect.nextSibling);
        }
        edgeInfo.innerHTML = `<i class="bi bi-link-45deg"></i> Đang tải thông tin tuyến mạng...`;

        deviceSelect.value = "";
        deviceSelect.disabled = true;

        apiFetch(`/api/edges/${edgeIdParam}/`)
          .then(res => {
            if (!res.ok) throw new Error();
            return res.json();
          })
          .then(edge => {
            if (edge && edge.code) {
              const edgeName = edge.name || `Tuyến ${edge.from_device_detail?.name || ''} - ${edge.to_device_detail?.name || ''}`;
              edgeInfo.innerHTML = `<i class="bi bi-link-45deg"></i> Đang báo cáo sự cố cho tuyến: <strong class="text-primary">${edgeName} (#${edge.code})</strong>`;
            } else {
              edgeInfo.innerHTML = `<i class="bi bi-link-45deg"></i> Đang báo cáo sự cố cho tuyến mạng ID: <strong>#${edgeIdParam}</strong>.`;
            }
          })
          .catch(() => {
            edgeInfo.innerHTML = `<i class="bi bi-link-45deg"></i> Đang báo cáo sự cố cho tuyến mạng ID: <strong>#${edgeIdParam}</strong>.`;
          });
      }
    }
  }

  function showIncidentDetail(inc) {
    document.getElementById('detail-title').textContent = inc.title;
    
    const statusBadges = {
      PENDING_VERIFY: 'bg-warning text-dark',
      OPEN: 'bg-warning text-dark',
      CONFIRMED: 'bg-danger text-white',
      ASSIGNED: 'bg-primary text-white',
      IN_PROGRESS: 'bg-info text-white',
      RESOLVED: 'bg-success text-white',
      CLOSED: 'bg-secondary text-white',
      REJECTED: 'bg-dark text-white'
    };
    const severityBadges = {
      LOW: 'bg-success bg-opacity-10 text-success border border-success border-opacity-25 rounded-pill',
      MEDIUM: 'bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25 rounded-pill',
      HIGH: 'bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 rounded-pill',
      CRITICAL: 'bg-danger text-white border border-danger rounded-pill'
    };

    const statusEl = document.getElementById('detail-status');
    statusEl.textContent = inc.status_display;
    statusEl.className = 'badge ' + (statusBadges[inc.status] || 'bg-secondary');

    const severityEl = document.getElementById('detail-severity');
    severityEl.textContent = 'Mức: ' + (inc.severity_display || inc.severity);
    severityEl.className = 'badge ' + (severityBadges[inc.severity] || 'bg-secondary');

    document.getElementById('detail-type').textContent = inc.type_display || inc.incident_type;
    document.getElementById('detail-desc').textContent = inc.description;
    
    document.getElementById('detail-assignee').textContent = inc.assigned_to_username ? `@${inc.assigned_to_username}` : 'Chưa phân công';
    
    const lastUpdate = inc.updated_at ? new Date(inc.updated_at) : new Date(inc.created_at);
    document.getElementById('detail-updated').textContent = lastUpdate.toLocaleString('vi-VN');

    // Populate timeline notes
    const notesContainer = document.getElementById('detail-notes-timeline');
    if (notesContainer) {
      if (!inc.notes || inc.notes.length === 0) {
        notesContainer.innerHTML = '<div class="text-muted small py-2">Chưa có ghi chú xử lý nào.</div>';
        notesContainer.classList.remove('border-start');
      } else {
        notesContainer.classList.add('border-start');
        notesContainer.innerHTML = inc.notes.map(note => `
          <div class="mb-3 position-relative ps-2" style="padding-left: 10px;">
            <span class="position-absolute start-0 translate-middle bg-primary rounded-circle" style="width: 8px; height: 8px; margin-left: -4px; top: 8px;"></span>
            <div class="small fw-bold text-dark">${note.author_name || note.author_username || 'Nhân viên'}</div>
            <div class="text-muted small" style="font-size: 0.7rem;"><i class="bi bi-clock"></i> ${new Date(note.created_at).toLocaleString('vi-VN')}</div>
            <div class="text-secondary small mt-1 p-2 bg-light rounded border">${note.content}</div>
          </div>
        `).join('');
      }
    }

    const modal = new bootstrap.Modal(document.getElementById('incident-detail-modal'));
    modal.show();
  }

  async function loadMyIncidents() {
    const res = await apiFetch(API.incidents);
    if (!res.ok) return;
    const data = await res.json();
    const incidents = data.results ?? data;
    const el = document.getElementById('my-incidents-list');
    if (!el) return;

    if (!incidents.length) {
      el.innerHTML = '<div class="text-center text-muted small py-4">Chưa có sự cố nào.</div>';
      return;
    }

    const STATUS_COLOR = { 
      PENDING_VERIFY: 'warning',
      OPEN: 'warning', 
      CONFIRMED: 'danger',
      ASSIGNED: 'primary', 
      IN_PROGRESS: 'info', 
      RESOLVED: 'success', 
      CLOSED: 'secondary',
      REJECTED: 'dark'
    };
    
    el.innerHTML = incidents.map(inc => `
      <div class="px-3 py-2 border-bottom my-incident-item" data-id="${inc.id}" style="cursor: pointer; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f8f9fa'" onmouseout="this.style.backgroundColor='transparent'">
        <div class="d-flex justify-content-between align-items-start">
          <div class="fw-semibold small text-dark">${inc.title}</div>
          <span class="badge bg-${STATUS_COLOR[inc.status] || 'secondary'} bg-opacity-10 text-${STATUS_COLOR[inc.status] || 'secondary'} border border-${STATUS_COLOR[inc.status] || 'secondary'} border-opacity-25 rounded-pill px-2 py-0.5" style="font-size: 0.7rem;">${inc.status_display}</span>
        </div>
        <div class="d-flex justify-content-between align-items-center mt-1">
          <span class="text-muted small" style="font-size: 0.75rem;"><i class="bi bi-clock"></i> ${new Date(inc.created_at).toLocaleDateString('vi-VN')}</span>
          <span class="text-primary small" style="font-size: 0.75rem;">Chi tiết <i class="bi bi-arrow-right"></i></span>
        </div>
      </div>`).join('');

    // Bắt sự kiện click
    el.querySelectorAll('.my-incident-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id');
        const inc = incidents.find(i => i.id == id);
        if (inc) {
          showIncidentDetail(inc);
        }
      });
    });
  }

  function showAlert(msg, isSuccess = false) {
    const el = document.getElementById('app-alert');
    if (!el) return;
    el.textContent = msg;
    el.className = `alert py-2 small ${isSuccess ? 'alert-success' : 'alert-danger'}`;
    el.classList.remove('d-none');
    if (isSuccess) setTimeout(() => el.classList.add('d-none'), 4000);
  }

  document.getElementById('report-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('report-title').value.trim();
    const desc = document.getElementById('report-desc').value.trim();
    const lat = parseFloat(document.getElementById('report-lat').value);
    const lng = parseFloat(document.getElementById('report-lng').value);

    if (!title || !desc) { showAlert('Vui lòng nhập tiêu đề và mô tả.'); return; }
    if (isNaN(lat) || isNaN(lng)) { showAlert('Vui lòng chọn vị trí trên bản đồ.'); return; }

    const body = {
      title,
      description: desc,
      incident_type: document.getElementById('report-type').value,
      severity: document.getElementById('report-severity').value,
      latitude: lat,
      longitude: lng,
      device: document.getElementById('report-device').value || null,
      edge: (targetTypeParam === 'EDGE' && edgeIdParam) ? parseInt(edgeIdParam) : null,
      target_type: targetTypeParam || (document.getElementById('report-device').value ? 'DEVICE' : 'UNKNOWN')
    };

    const btn = document.getElementById('btn-submit-report');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Đang gửi...';

    try {
      const res = await apiFetch(API.incidents, { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showAlert('✅ Báo cáo sự cố đã được gửi thành công!', true);
        document.getElementById('report-form').reset();
        if (reportMarker) { reportMap.removeLayer(reportMarker); reportMarker = null; }
        // Re-enable device select and remove edge banner if form reset is triggered
        const deviceSelect = document.getElementById('report-device');
        if (deviceSelect) {
          deviceSelect.disabled = false;
          document.getElementById('report-edge-info')?.remove();
        }
        loadMyIncidents();
      } else {
        const msg = Object.values(data).flat().join(' ') || 'Gửi báo cáo thất bại.';
        showAlert(msg);
      }
    } catch { showAlert('Lỗi kết nối.'); }
    finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-send me-1"></i> Gửi báo cáo'; }
  });

  setupNav();
  initMap();
  prefillIncidentType();
  loadDevices().then(() => {
    handleEdgeSelection();
  });
  loadMyIncidents();
  pollNotifBadge();
  setInterval(pollNotifBadge, 30000);
})();
