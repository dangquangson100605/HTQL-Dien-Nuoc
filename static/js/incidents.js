/* incidents.js — Quản lý Sự cố */
'use strict';
(() => {
  const STORAGE = { access: 'infra_access', refresh: 'infra_refresh', role: 'infra_role', username: 'infra_username' };
  const API = {
    incidents: '/api/incidents/',
    devices: '/api/devices/?page_size=500',
    edges: '/api/edges/?page_size=500',
    users: '/api/auth/users/',
    logout: '/api/auth/logout/',
  };
  const API_REFRESH = '/api/auth/token/refresh/';

  const STATUS_COLOR = { PENDING_VERIFY: 'warning', CONFIRMED: 'danger', ASSIGNED: 'primary', IN_PROGRESS: 'info', RESOLVED: 'success', CLOSED: 'secondary', REJECTED: 'dark' };
  const STATUS_LABEL = { PENDING_VERIFY: 'Chờ xác minh', CONFIRMED: 'Đã xác nhận', ASSIGNED: 'Đã phân công', IN_PROGRESS: 'Đang xử lý', RESOLVED: 'Đã xử lý', CLOSED: 'Đã đóng', REJECTED: 'Từ chối' };
  const SEVERITY_COLOR = { LOW: 'success', MEDIUM: 'warning', HIGH: 'danger', CRITICAL: 'dark' };
  const SEVERITY_ICON = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🔴', CRITICAL: '🚨' };

  let currentRole = '';
  let incidentMap = null;
  let incidentMarkers = [];
  let highlightLayer = null;
  let localDeviceLayer = null;
  let localEdgeLayer = null;
  // detailModal now operates as a sleek, non-blocking dummy object to keep compatibility
  const detailModal = { show: () => {}, hide: () => {} };
  const assignModal = new bootstrap.Modal(document.getElementById('assignModal'));
  const statusModal = new bootstrap.Modal(document.getElementById('statusModal'));

  let cachedDevices = [];
  let cachedWardList = [];
  let cachedEdges = [];
  let assignModalTechs = [];

  function incidentTechnicianUsernames(inc) {
    const list = inc.assigned_technician_usernames || [];
    if (list.length) return list;
    return inc.assigned_to_username ? [inc.assigned_to_username] : [];
  }

  function incidentTechnicianBadges(inc) {
    const names = incidentTechnicianUsernames(inc);
    if (!names.length) return '—';
    return names.map((name) =>
      `<span class="badge bg-light text-dark border me-1 mb-1"><i class="bi bi-person text-secondary"></i> ${name}</span>`
    ).join('');
  }

  function userIsAssignedToIncident(inc, username) {
    return incidentTechnicianUsernames(inc).includes(username);
  }

  function technicianOptionLabel(u) {
    const names = (u.managed_ward_names || []).slice(0, 2).join(', ');
    const extra = (u.managed_ward_names || []).length > 2 ? '…' : '';
    const suffix = names ? ` — ${names}${extra}` : '';
    return `${u.username}${suffix}`;
  }

  async function ensureDevicesAndEdges() {
    if (!cachedDevices.length) {
      try {
        const res = await apiFetch(API.devices);
        if (res.ok) {
          const data = await res.json();
          cachedDevices = data.results ?? data;
        }
      } catch (err) { console.error('Lỗi tải thiết bị:', err); }
    }
    if (!cachedEdges.length) {
      try {
        const res = await apiFetch(API.edges);
        if (res.ok) {
          const data = await res.json();
          cachedEdges = data.results ?? data;
        }
      } catch (err) { console.error('Lỗi tải tuyến mạng:', err); }
    }
  }

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
    currentRole = localStorage.getItem(STORAGE.role) || '';
    if (window.StaffNav) StaffNav.initNavUser();
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

  const DEVICE_LABELS = {
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

  function getDeviceIconByTypeAndStatus(type, status) {
    let color = '#198754';
    let iconClass = 'bi-cpu';
    let pulseClass = '';

    switch(type) {
      case 'TRANSFORMER':
        iconClass = 'bi-lightning-charge';
        break;
      case 'DISTRIBUTION_BOX':
        iconClass = 'bi-box-seam';
        break;
      case 'ELECTRIC_POLE':
        iconClass = 'bi-alt';
        break;
      case 'ELECTRIC_JUNCTION':
        iconClass = 'bi-signpost-split';
        break;
      case 'ELECTRIC_METER':
        iconClass = 'bi-speedometer';
        break;
      case 'WATER_TANK':
        iconClass = 'bi-moisture';
        break;
      case 'PUMP_STATION':
        iconClass = 'bi-water';
        break;
      case 'MAIN_VALVE':
      case 'BRANCH_VALVE':
      case 'VALVE':
        iconClass = 'bi-valve';
        break;
      case 'WATER_JUNCTION':
        iconClass = 'bi-diagram-3';
        break;
      case 'WATER_METER':
        iconClass = 'bi-speedometer2';
        break;
    }

    switch(status) {
      case 'ACTIVE':
        color = '#198754';
        break;
      case 'FAULT':
        color = '#dc3545';
        iconClass = 'bi-exclamation-triangle-fill';
        pulseClass = 'pulse-danger';
        break;
      case 'MAINTENANCE':
        color = '#6f42c1';
        iconClass = 'bi-tools';
        break;
      case 'INACTIVE':
        color = '#6c757d';
        iconClass = 'bi-slash-circle';
        break;
    }

    return L.divIcon({
      className: 'custom-device-marker',
      html: `
        <div class="marker-wrapper ${pulseClass}" style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 2px solid white; color: white; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 3px 6px rgba(0,0,0,0.3);">
          <i class="bi ${iconClass}"></i>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16]
    });
  }

  function getEdgeColorByTypeAndStatus(type, status) {
    let color = '#6c757d';
    let dashArray = null;
    let weight = 4;

    if (status === 'FAULT') {
      color = '#dc3545';
      dashArray = '6, 8';
      weight = 8;
    } else if (status === 'INACTIVE') {
      color = '#6c757d';
      weight = 3;
    } else {
      if (type === 'ELECTRIC') {
        color = '#fd7e14';
      } else if (type === 'WATER') {
        color = '#0d6efd';
      }
    }

    if (status === 'MAINTENANCE') {
      dashArray = '8, 8';
      weight = 5;
    }

    return { color, dashArray, weight };
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function devicePopupHtml(d) {
    const typeLabel = DEVICE_LABELS[d.device_type] || d.device_type;
    const statusLabels = {
      ACTIVE: '<span class="badge bg-success bg-opacity-10 text-success">Hoạt động</span>',
      FAULT: '<span class="badge bg-danger bg-opacity-10 text-danger">Lỗi trực tiếp</span>',
      MAINTENANCE: '<span class="badge bg-warning bg-opacity-10 text-warning">Đang bảo trì</span>',
      INACTIVE: '<span class="badge bg-secondary bg-opacity-10 text-secondary">Ngưng hoạt động</span>'
    };
    const statusHtml = statusLabels[d.status] || d.status;

    let attributesHtml = '';
    if (d.attributes && typeof d.attributes === 'object' && Object.keys(d.attributes).length > 0) {
      attributesHtml = `
        <div class="mt-2 pt-1 border-top" style="font-size: 11px;">
          <span class="text-muted fw-semibold">Thông số bổ sung:</span>
          <ul class="mb-0 ps-3 text-secondary" style="font-size: 10.5px; padding-left: 15px; margin-top: 2px;">
      `;
      for (const [key, value] of Object.entries(d.attributes)) {
        attributesHtml += `<li><strong>${escapeHtml(key)}:</strong> ${escapeHtml(String(value))}</li>`;
      }
      attributesHtml += `</ul></div>`;
    }

    return `
      <div class="p-1" style="min-width: 180px;">
        <h6 class="fw-bold mb-1 border-bottom pb-1 text-primary d-flex align-items-center justify-content-between">
          <span>${escapeHtml(d.name)}</span>
          <small class="text-muted" style="font-size: 11px;">#${escapeHtml(d.code)}</small>
        </h6>
        <div class="small mb-1" style="font-size: 12px; line-height: 1.4;">
          <div class="mb-1"><strong>Loại:</strong> <span class="text-secondary">${escapeHtml(typeLabel)}</span></div>
          <div class="mb-1"><strong>Trạng thái:</strong> ${statusHtml}</div>
          <div class="mb-1"><strong>Khu vực:</strong> <span class="text-muted">${escapeHtml(d.area || '—')}</span></div>
          <div class="mb-1"><strong>Địa chỉ:</strong> <span class="text-muted">${escapeHtml(d.address || '—')}</span></div>
          ${attributesHtml}
        </div>
      </div>
    `;
  }

  function edgePopupHtml(edge) {
    const fromDevName = edge.from_device_detail ? edge.from_device_detail.name : 'Không rõ';
    const toDevName = edge.to_device_detail ? edge.to_device_detail.name : 'Không rõ';
    
    const typeLabel = edge.network_type === 'ELECTRIC' ? 'Điện ⚡' : 'Nước 💧';
    const statusLabels = {
      ACTIVE: '<span class="badge bg-success bg-opacity-10 text-success">Hoạt động</span>',
      FAULT: '<span class="badge bg-danger bg-opacity-10 text-danger">Lỗi trực tiếp</span>',
      MAINTENANCE: '<span class="badge bg-warning bg-opacity-10 text-warning">Đang bảo trì</span>',
      INACTIVE: '<span class="badge bg-secondary bg-opacity-10 text-secondary">Ngưng sử dụng</span>'
    };
    const statusHtml = statusLabels[edge.status] || edge.status;

    return `
      <div class="p-1" style="min-width: 180px;">
        <h6 class="fw-bold mb-1 border-bottom pb-1 text-primary d-flex align-items-center justify-content-between">
          <span>${escapeHtml(edge.name || 'Tuyến mạng')}</span>
          <small class="text-muted" style="font-size: 11px;">#${escapeHtml(edge.code)}</small>
        </h6>
        <div class="small mb-1" style="font-size: 12px; line-height: 1.4;">
          <div class="mb-1"><strong>Từ:</strong> <span class="text-secondary">${escapeHtml(fromDevName)}</span></div>
          <div class="mb-1"><strong>Đến:</strong> <span class="text-secondary">${escapeHtml(toDevName)}</span></div>
          <div class="mb-1"><strong>Loại mạng:</strong> <span class="fw-medium">${escapeHtml(typeLabel)}</span></div>
          <div class="mb-1"><strong>Trạng thái:</strong> ${statusHtml}</div>
        </div>
      </div>
    `;
  }

  function initMap() {
    incidentMap = L.map('incident-map').setView([16.0544, 108.2022], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(incidentMap);
    localEdgeLayer = L.layerGroup().addTo(incidentMap);
    localDeviceLayer = L.layerGroup().addTo(incidentMap);
    highlightLayer = L.layerGroup().addTo(incidentMap);
    relayoutIncidentMap();
  }

  function relayoutIncidentMap() {
    if (incidentMap) {
      setTimeout(() => incidentMap.invalidateSize(), 50);
    }
  }

  function refreshMap(incidents) {
    incidentMarkers.forEach(m => incidentMap.removeLayer(m));
    incidentMarkers = [];
    incidents.forEach(inc => {
      if (['CLOSED', 'RESOLVED', 'REJECTED'].includes(inc.status)) return;
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
    if (status) {
      params.append('status', status);
    }
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
      tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">Không có sự cố nào.</td></tr>';
      return;
    }

    tbody.innerHTML = incidents.map(inc => {
      const locText = inc.address || inc.area || `${inc.latitude.toFixed(4)}, ${inc.longitude.toFixed(4)}`;
      const devText = inc.device_name ? `<span class="badge bg-light text-dark border"><i class="bi bi-cpu text-info"></i> ${inc.device_name}</span>` : '—';
      const edgeText = inc.edge_name ? `<span class="badge bg-light text-dark border"><i class="bi bi-bezier2 text-primary"></i> ${inc.edge_name}</span>` : '—';
      const techText = incidentTechnicianBadges(inc);

      return `
        <tr style="cursor:pointer;" onclick="window._viewIncident(${inc.id})">
          <td class="fw-medium">${inc.title}</td>
          <td class="text-center">${inc.type_display}</td>
          <td class="text-center"><span class="badge badge-premium badge-severity-${inc.severity.toLowerCase()}">${SEVERITY_ICON[inc.severity] || ''} ${inc.severity_display}</span></td>
          <td class="text-center"><span class="badge badge-premium badge-status-${inc.status.toLowerCase()}">${inc.status_display}</span></td>
          <td class="small text-wrap" style="max-width: 150px;">${locText}</td>
          <td class="text-muted small">${inc.reported_by_username}</td>
          <td>${devText}</td>
          <td>${edgeText}</td>
          <td>${techText}</td>
          <td class="text-center">
            <button class="btn btn-sm btn-outline-primary py-0 px-2" onclick="event.stopPropagation();window._viewIncident(${inc.id})">
              <i class="bi bi-eye"></i>
            </button>
          </td>
        </tr>`;
    }).join('');

    refreshMap(incidents);
  }

  async function viewIncident(id) {
    document.getElementById('incident-modal-title').innerHTML = 'Chi tiết Sự cố';
    document.getElementById('incident-detail-body').innerHTML = '<div class="text-center py-4"><div class="spinner-border text-danger" role="status"></div></div>';
    
    // Slide left layout: hide list and show details wrapper
    document.getElementById('incident-list-wrapper')?.classList.add('d-none');
    document.getElementById('incident-detail-wrapper')?.classList.remove('d-none');
    relayoutIncidentMap();



    const detailBody = document.getElementById('incident-detail-body');
    if (detailBody) detailBody.scrollTop = 0;

    const actionsEl = document.getElementById('incident-modal-actions');
    if (actionsEl) {
      actionsEl.innerHTML = '';
      actionsEl.classList.add('d-none');
      actionsEl.classList.remove('d-flex');
    }

    const res = await apiFetch(`${API.incidents}${id}/`);
    if (!res.ok) { document.getElementById('incident-detail-body').innerHTML = '<div class="text-danger">Lỗi tải dữ liệu.</div>'; return; }
    const inc = await res.json();

    await ensureDevicesAndEdges();

    // Dọn dẹp các nét vẽ highlight cũ
    if (highlightLayer) {
      highlightLayer.clearLayers();
    }

    // Tự động vẽ và định vị cục bộ
    if (incidentMap && inc.latitude && inc.longitude) {
      let latlngsToFit = [[inc.latitude, inc.longitude]];

      // Nếu có thiết bị liên kết, vẽ lên bản đồ tại chỗ
      if (inc.device) {
        const dev = cachedDevices.find(d => d.id === inc.device);
        if (dev && dev.latitude && dev.longitude) {
          const color = dev.status === 'ACTIVE' ? '#10b981' : '#f59e0b';
          const devMarker = L.circleMarker([dev.latitude, dev.longitude], {
            radius: 8,
            color: '#3b82f6',
            fillColor: color,
            fillOpacity: 0.9,
            weight: 3
          }).addTo(highlightLayer);
          devMarker.bindPopup(`<b>Thiết bị: ${dev.name}</b><br>Mã: ${dev.code}<br>Trạng thái: ${dev.status_display || dev.status}`);
          latlngsToFit.push([dev.latitude, dev.longitude]);
        }
      }

      // Nếu có tuyến mạng liên kết, vẽ lên bản đồ tại chỗ
      if (inc.edge) {
        const edge = cachedEdges.find(e => e.id === inc.edge);
        if (edge && edge.from_device_detail && edge.to_device_detail) {
          const fromD = edge.from_device_detail;
          const toD = edge.to_device_detail;
          if (fromD.latitude && fromD.longitude && toD.latitude && toD.longitude) {
            const color = edge.status === 'FAULT' ? '#ef4444' : '#3b82f6';
            const polyline = L.polyline([
              [fromD.latitude, fromD.longitude],
              [toD.latitude, toD.longitude]
            ], {
              color: color,
              weight: 6,
              opacity: 0.8,
              dashArray: edge.status === 'FAULT' ? '6, 8' : 'none'
            }).addTo(highlightLayer);
            polyline.bindPopup(`<b>Tuyến: ${edge.name || edge.code}</b><br>Trạng thái: ${edge.status_display || edge.status}`);
            
            L.circleMarker([fromD.latitude, fromD.longitude], { radius: 5, color: '#3b82f6', fillColor: '#fff', fillOpacity: 1 }).addTo(highlightLayer);
            L.circleMarker([toD.latitude, toD.longitude], { radius: 5, color: '#3b82f6', fillColor: '#fff', fillOpacity: 1 }).addTo(highlightLayer);

            latlngsToFit.push([fromD.latitude, fromD.longitude]);
            latlngsToFit.push([toD.latitude, toD.longitude]);
          }
        }
      }

      // Ôm trọn phạm vi sự cố + thiết bị/tuyến mạng liên quan
      if (latlngsToFit.length > 1) {
        incidentMap.fitBounds(L.latLngBounds(latlngsToFit), { padding: [50, 50] });
      } else {
        incidentMap.flyTo([inc.latitude, inc.longitude], 16);
        const marker = incidentMarkers.find(m => {
          const latlng = m.getLatLng();
          return Math.abs(latlng.lat - inc.latitude) < 0.0001 && Math.abs(latlng.lng - inc.longitude) < 0.0001;
        });
        if (marker) {
          setTimeout(() => marker.openPopup(), 400);
        }
      }
    }

    const isStaff = ['ADMIN', 'OPERATOR'].includes(currentRole);
    const isTech = currentRole === 'TECHNICIAN';
    const loggedInUser = localStorage.getItem(STORAGE.username) || '';
    const isAssignedTech = isTech && userIsAssignedToIncident(inc, loggedInUser);
    const assignedTechLabel = incidentTechnicianUsernames(inc).join(', ') || 'Chưa phân công';

    let assocHtml = '';
    if (isStaff && inc.target_type === 'UNKNOWN') {
      assocHtml = `
        <div class="row g-2 mt-3 p-3 border border-primary border-opacity-10 rounded bg-light bg-opacity-50">
          <div class="col-12"><span class="fw-semibold text-primary small"><i class="bi bi-link-45deg"></i> Xác định Vị trí / Thiết bị / Tuyến sự cố</span></div>
          <div class="col-md-6">
            <label class="form-label small text-muted mb-1">Thiết bị liên quan:</label>
            <select id="link-device-select" class="form-select form-select-sm">
              <option value="">-- Không có / Chọn thiết bị --</option>
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label small text-muted mb-1">Tuyến liên quan:</label>
            <select id="link-edge-select" class="form-select form-select-sm">
              <option value="">-- Không có / Chọn tuyến --</option>
            </select>
          </div>
          <div class="col-12 text-end mt-2">
            <button class="btn btn-sm btn-primary" onclick="window._saveAssociation(${inc.id})">
              <i class="bi bi-save me-1"></i> Lưu liên kết
            </button>
          </div>
        </div>
      `;
    }

    let addNoteHtml = '';
    if (isAssignedTech && ['ASSIGNED','IN_PROGRESS'].includes(inc.status)) {
      addNoteHtml = `
        <div class="mt-3 p-3 border rounded bg-light">
          <label class="form-label small fw-semibold text-dark mb-1"><i class="bi bi-chat-left-text me-1"></i> Thêm ghi chú xử lý</label>
          <div class="input-group">
            <input type="text" id="new-note-content" class="form-control form-control-sm" placeholder="Nhập ghi chú xử lý tiến độ...">
            <button class="btn btn-sm btn-primary" onclick="window._addNote(${inc.id})">Gửi</button>
          </div>
        </div>
      `;
    }

    document.getElementById('incident-modal-title').innerHTML = `<i class="bi bi-exclamation-octagon text-danger me-1"></i> ${inc.title}`;
    document.getElementById('incident-detail-body').innerHTML = `
      <div class="row g-3 mb-3">
        <div class="col-6"><span class="text-muted small d-block">Loại sự cố:</span> <strong>${inc.type_display}</strong></div>
        <div class="col-6"><span class="text-muted small d-block">Mức độ nghiêm trọng:</span> <span class="badge badge-premium badge-severity-${inc.severity.toLowerCase()}">${SEVERITY_ICON[inc.severity]} ${inc.severity_display}</span></div>
        <div class="col-6"><span class="text-muted small d-block">Trạng thái hiện tại:</span> <span class="badge badge-premium badge-status-${inc.status.toLowerCase()}">${inc.status_display}</span></div>
        <div class="col-6"><span class="text-muted small d-block">Người báo cáo:</span> <strong>${inc.reported_by_username}</strong></div>
        <div class="col-12"><span class="text-muted small d-block">Kỹ thuật viên phụ trách:</span> <strong class="text-primary">${assignedTechLabel}</strong></div>
        <div class="col-6"><span class="text-muted small d-block">Thiết bị liên quan:</span> ${inc.device ? `<strong>${inc.device_name}</strong> 
          <div class="mt-1 d-flex gap-1">
            <button onclick="window._focusLocalDevice(${inc.device})" class="btn btn-sm btn-outline-primary py-0 px-1" style="font-size: 10px;" title="Xem trên bản đồ bên cạnh"><i class="bi bi-geo-alt"></i> Định vị tại chỗ</button>
            <button onclick="window._focusLocalNetwork()" class="btn btn-sm btn-outline-secondary py-0 px-1" style="font-size: 10px;" title="Xem toàn bộ mạng lưới"><i class="bi bi-map"></i> Xem tổng quan mạng</button>
          </div>` : '<strong>—</strong>'}</div>
        <div class="col-6"><span class="text-muted small d-block">Tuyến mạng liên quan:</span> ${inc.edge ? `<strong>${inc.edge_name}</strong> 
          <div class="mt-1 d-flex gap-1">
            <button onclick="window._focusLocalEdge(${inc.edge})" class="btn btn-sm btn-outline-primary py-0 px-1" style="font-size: 10px;" title="Xem trên bản đồ bên cạnh"><i class="bi bi-geo-alt"></i> Định vị tại chỗ</button>
            <button onclick="window._focusLocalNetwork()" class="btn btn-sm btn-outline-secondary py-0 px-1" style="font-size: 10px;" title="Xem toàn bộ mạng lưới"><i class="bi bi-map"></i> Xem tổng quan mạng</button>
          </div>` : '<strong>—</strong>'}</div>
        <div class="col-6"><span class="text-muted small d-block">Phường/Xã:</span> 
          ${isStaff || isTech ? `
            <select id="edit-incident-ward-${inc.id}" class="form-select form-select-sm" style="font-size:12px; font-weight: 500; height: 30px; padding: 2px 8px;"></select>
          ` : `<strong>${inc.ward_name || inc.area || '—'}</strong>`}
        </div>
        <div class="col-12"><span class="text-muted small d-block">Địa chỉ chi tiết:</span> 
          ${isStaff || isTech ? `
            <div class="input-group input-group-sm">
              <input type="text" id="edit-incident-address-${inc.id}" class="form-control" style="font-size:12px; height: 30px;" value="${escapeHtml(inc.address || '')}" placeholder="Nhập địa chỉ chi tiết...">
              <button class="btn btn-primary btn-sm px-3" style="height: 30px; font-size:12px;" onclick="window._saveGeoInfo(${inc.id})"><i class="bi bi-save"></i> Lưu</button>
            </div>
          ` : `<strong>${inc.address || '—'}</strong>`}
        </div>
        <div class="col-12"><span class="text-muted small d-block">Tọa độ địa lý:</span> <code>${inc.latitude.toFixed(5)}, ${inc.longitude.toFixed(5)}</code> 
          <div class="mt-1 d-flex gap-1">
            <button onclick="window._focusLocalCoord(${inc.latitude}, ${inc.longitude})" class="btn btn-sm btn-outline-primary py-0 px-1" style="font-size: 10px;" title="Xem trên bản đồ bên cạnh"><i class="bi bi-geo-alt"></i> Định vị tại chỗ</button>
            <button onclick="window._focusLocalNetwork()" class="btn btn-sm btn-outline-secondary py-0 px-1" style="font-size: 10px;" title="Xem toàn bộ mạng lưới"><i class="bi bi-map"></i> Xem tổng quan mạng</button>
          </div></div>
        <div class="col-6"><span class="text-muted small d-block">Người xác nhận:</span> <strong class="text-dark">${inc.confirmed_by_username || 'Chưa xác nhận'}</strong></div>
        <div class="col-6"><span class="text-muted small d-block">Thời gian giải quyết:</span> <strong>${inc.resolved_at ? new Date(inc.resolved_at).toLocaleString('vi-VN') : '—'}</strong></div>
        <div class="col-12 mt-1"><span class="text-muted small d-block">Mô tả sự cố:</span><p class="mt-1 mb-0 bg-light p-2 rounded small text-secondary border">${inc.description || 'Không có mô tả chi tiết.'}</p></div>
        ${inc.status === 'REJECTED' && inc.rejection_reason ? `<div class="col-12 mt-1"><span class="text-muted small d-block">Lý do từ chối:</span><p class="mt-1 mb-0 bg-danger bg-opacity-10 p-2 rounded small text-danger border border-danger border-opacity-25">${inc.rejection_reason}</p></div>` : ''}
        ${inc.status === 'RESOLVED' && inc.result_note ? `<div class="col-12 mt-1"><span class="text-muted small d-block">Kết quả xử lý:</span><p class="mt-1 mb-0 bg-success bg-opacity-10 p-2 rounded small text-success border border-success border-opacity-25">${inc.result_note}</p></div>` : ''}
      </div>
      ${assocHtml}
      ${(localStorage.getItem(STORAGE.role) === 'ADMIN' && inc.history && inc.history.length) ? `
      <hr class="my-3">
      <h6 class="fw-semibold mb-2 text-dark"><i class="bi bi-clock-history me-1"></i> Lịch sử trạng thái</h6>
      <div id="history-list" class="mb-3 ps-3 border-start border-2 border-secondary">
        ${inc.history.map(h => `
          <div class="position-relative mb-3 pb-1" style="padding-left: 10px;">
            <div class="position-absolute bg-secondary rounded-circle" style="width: 10px; height: 10px; left: -16px; top: 5px;"></div>
            <div class="small text-muted fw-medium">${h.changed_by_username || 'Hệ thống'} — ${new Date(h.created_at).toLocaleString('vi-VN')}</div>
            <div class="small mt-1">
              ${h.old_status ? `<span class="badge bg-light text-secondary border">${STATUS_LABEL[h.old_status] || h.old_status}</span> ➡️ ` : ''}
              <span class="badge badge-status-${h.new_status.toLowerCase()}">${STATUS_LABEL[h.new_status] || h.new_status}</span>
            </div>
            ${h.note ? `<div class="small mt-1 text-secondary fst-italic">"${h.note}"</div>` : ''}
          </div>
        `).join('')}
      </div>` : ''}

      ${addNoteHtml}
      <hr class="my-3">
      <h6 class="fw-semibold mb-2 text-dark"><i class="bi bi-journal-text me-1"></i> Ghi chú tiến độ xử lý</h6>
      <div id="notes-list">
        ${inc.notes.length ? inc.notes.map(n => `
          <div class="border rounded p-2 mb-2 bg-light">
            <div class="small text-muted mb-1 fw-medium">${n.author_username} — ${new Date(n.created_at).toLocaleString('vi-VN')}</div>
            <div class="small text-secondary">${n.content}</div>
          </div>`).join('') : '<p class="text-muted small mb-0">Chưa có ghi chú xử lý.</p>'}
      </div>`;

    const wardSelect = document.getElementById(`edit-incident-ward-${inc.id}`);
    if (wardSelect && window.WardUtils && cachedWardList.length) {
      WardUtils.populateWardSelect(wardSelect, cachedWardList, { selectedId: inc.ward });
    }

    // Nút hành động
    if (actionsEl) {
      actionsEl.innerHTML = `<button class="btn btn-sm btn-outline-secondary" onclick="window._clearSelection()"><i class="bi bi-x-circle me-1"></i> Bỏ chọn</button>`;
      
      if (isStaff && (inc.status === 'PENDING_VERIFY' || (inc.status === 'ASSIGNED' && !inc.confirmed_by))) {
        actionsEl.innerHTML += `<button class="btn btn-sm btn-success" onclick="window._openConfirm(${inc.id})"><i class="bi bi-check-circle me-1"></i> Xác nhận</button>`;
        actionsEl.innerHTML += `<button class="btn btn-sm btn-outline-danger" onclick="window._openReject(${inc.id})"><i class="bi bi-x-circle me-1"></i> Từ chối</button>`;
      }
      if (isStaff && ['PENDING_VERIFY', 'CONFIRMED','ASSIGNED'].includes(inc.status)) {
        actionsEl.innerHTML += `<button class="btn btn-sm btn-primary" onclick="window._openAssign(${inc.id})"><i class="bi bi-person-check me-1"></i> Phân công</button>`;
      }
      if (isStaff && inc.status === 'RESOLVED') {
        actionsEl.innerHTML += `<button class="btn btn-sm btn-success" onclick="window._closeIncident(${inc.id})"><i class="bi bi-check-circle me-1"></i> Xác nhận hoàn thành &amp; thông báo người dân</button>`;
      }
      if (isAssignedTech && inc.status === 'ASSIGNED') {
        actionsEl.innerHTML += `<button class="btn btn-sm btn-primary" onclick="window._startProgress(${inc.id})"><i class="bi bi-hand-thumbs-up me-1"></i> Xác nhận công việc</button>`;
      }
      if (isAssignedTech && inc.status === 'IN_PROGRESS') {
        actionsEl.innerHTML += `<button class="btn btn-sm btn-success" onclick="window._resolveIncident(${inc.id})"><i class="bi bi-send-check me-1"></i> Báo hoàn thành &amp; gửi vận hành</button>`;
      }

      actionsEl.classList.remove('d-none');
      actionsEl.classList.add('d-flex');
    }

    // Nạp thiết bị & tuyến cho hộp chọn liên kết (nếu nhân viên vận hành cần liên kết)
    if (isStaff && inc.target_type === 'UNKNOWN') {
      const devSelect = document.getElementById('link-device-select');
      const edgeSelect = document.getElementById('link-edge-select');
      if (devSelect && edgeSelect) {
        devSelect.innerHTML = '<option value="">-- Không có / Chọn thiết bị --</option>' +
          cachedDevices.map(d => `<option value="${d.id}">${d.code} - ${d.name} (${d.status_display || d.status})</option>`).join('');

        edgeSelect.innerHTML = '<option value="">-- Không có / Chọn tuyến mạng --</option>' +
          cachedEdges.map(e => {
            const edgeLabel = e.name || (e.from_device_detail && e.to_device_detail ? `${e.from_device_detail.name} → ${e.to_device_detail.name}` : `Tuyến #${e.id}`);
            return `<option value="${e.id}">${edgeLabel} (${e.status_display || e.status})</option>`;
          }).join('');

        devSelect.addEventListener('change', () => { if (devSelect.value) edgeSelect.value = ''; });
        edgeSelect.addEventListener('change', () => { if (edgeSelect.value) devSelect.value = ''; });
      }
    }
  }

  function resolveIncidentWardId(inc) {
    if (window.WardUtils?.resolveWardId) return WardUtils.resolveWardId(inc);
    if (!inc) return null;
    if (inc.ward != null && inc.ward !== '') return Number(inc.ward);
    if (inc.device_detail?.ward != null) return Number(inc.device_detail.ward);
    return null;
  }

  async function loadTechnicians(wardId = null, { allowFallback = true } = {}) {
    if (!window.WardUtils?.fetchAssignableTechnicians) {
      assignModalTechs = [];
      return { techs: [], error: 'Thiếu WardUtils.', usedFallback: false };
    }
    let { techs, error } = await WardUtils.fetchAssignableTechnicians(apiFetch, API.users, wardId);
    let usedFallback = false;
    const role = localStorage.getItem(STORAGE.role) || '';
    if (!techs.length && !error && wardId != null && allowFallback && role === 'ADMIN') {
      const retry = await WardUtils.fetchAssignableTechnicians(apiFetch, API.users, null);
      if (retry.techs.length) {
        techs = retry.techs;
        usedFallback = true;
      } else if (retry.error) {
        error = retry.error;
      }
    }
    assignModalTechs = techs;
    return { techs, error, usedFallback };
  }

  function buildAssignTechCountOptions() {
    const select = document.getElementById('assign-tech-count');
    const confirmBtn = document.getElementById('btn-confirm-assign');
    if (!select) return;
    if (!assignModalTechs.length) {
      select.innerHTML = '<option value="0">—</option>';
      select.disabled = true;
      if (confirmBtn) confirmBtn.disabled = true;
      return;
    }
    select.disabled = false;
    if (confirmBtn) confirmBtn.disabled = false;
    const max = assignModalTechs.length;
    select.innerHTML = Array.from({ length: max }, (_, i) => {
      const n = i + 1;
      return `<option value="${n}">${n} KTV</option>`;
    }).join('');
  }

  function syncAssignTechOptions() {
    const pickers = Array.from(document.querySelectorAll('.assign-tech-picker'));
    const selected = new Set(pickers.map((p) => p.value).filter(Boolean));
    pickers.forEach((picker) => {
      const current = picker.value;
      picker.querySelectorAll('option').forEach((opt) => {
        if (!opt.value) return;
        opt.disabled = selected.has(opt.value) && opt.value !== current;
      });
    });
  }

  function renderAssignTechSlots(count = 1, emptyMessage = '') {
    const container = document.getElementById('assign-tech-slots');
    if (!container) return;

    if (!assignModalTechs.length) {
      container.innerHTML = `<p class="text-muted small mb-0">${emptyMessage || 'Không có KTV được phân quyền phường/xã này. Admin cần gán phường/xã cho KTV tại trang <strong>Tài khoản</strong>.'}</p>`;
      return;
    }

    const max = assignModalTechs.length;
    const slotCount = Math.min(Math.max(1, count), max);
    const countSelect = document.getElementById('assign-tech-count');
    if (countSelect) countSelect.value = String(slotCount);

    container.innerHTML = Array.from({ length: slotCount }, (_, i) => {
      const options = assignModalTechs.map((u) =>
        `<option value="${u.id}">${technicianOptionLabel(u)}</option>`
      ).join('');
      return `<div class="mb-2">
        <label class="form-label small mb-1">KTV ${i + 1}</label>
        <select class="form-select form-select-sm assign-tech-picker" data-slot="${i}">
          <option value="">-- Chọn kỹ thuật viên --</option>${options}
        </select>
      </div>`;
    }).join('');

    container.querySelectorAll('.assign-tech-picker').forEach((sel) => {
      sel.addEventListener('change', syncAssignTechOptions);
    });
  }

  window._viewIncident = viewIncident;
  window._openAssign = async (id) => {
    document.getElementById('assign-incident-id').value = id;
    detailModal.hide();

    let wardId = null;
    let wardLabel = '';
    let inc = null;
    const incRes = await apiFetch(`${API.incidents}${id}/`);
    if (incRes.ok) {
      inc = await incRes.json();
      wardId = resolveIncidentWardId(inc);
      wardLabel = [inc.ward_name, inc.ward_district].filter(Boolean).join(', ')
        || [inc.device_detail?.ward_name, inc.device_detail?.ward_district].filter(Boolean).join(', ')
        || inc.area || '';
    }

    const loadResult = await loadTechnicians(wardId);
    buildAssignTechCountOptions();
    renderAssignTechSlots(1, loadResult.error || '');

    const hint = document.getElementById('assign-ward-hint');
    if (hint) {
      if (loadResult.error) {
        hint.textContent = loadResult.error;
        hint.classList.remove('d-none', 'alert-info');
        hint.classList.add('alert-danger');
      } else if (loadResult.usedFallback) {
        hint.textContent = 'Không có KTV đúng phường/xã sự cố — đang hiển thị toàn bộ KTV. Kiểm tra phường/xã sự cố/thiết bị và phân quyền tại Tài khoản.';
        hint.classList.remove('d-none', 'alert-info');
        hint.classList.add('alert-warning');
      } else if (wardId) {
        hint.textContent = `Sự cố thuộc ${wardLabel || `phường/xã #${wardId}`}. Chỉ hiển thị KTV được phân quyền khu vực này.`;
        hint.classList.remove('d-none', 'alert-warning', 'alert-danger');
        hint.classList.add('alert-info');
      } else {
        hint.textContent = 'Sự cố chưa gán phường/xã — hiển thị mọi KTV trong phạm vi của bạn.';
        hint.classList.remove('d-none', 'alert-info', 'alert-danger');
        hint.classList.add('alert-warning');
      }
    }

    assignModal.show();
  };
  window._openStatus = (id, currentStatus) => {
    document.getElementById('status-incident-id').value = id;
    document.getElementById('status-new').value = currentStatus;
    document.getElementById('status-note').value = '';
    detailModal.hide();
    statusModal.show();
  };

  window._saveGeoInfo = async (id) => {
    const ward = parseInt(document.getElementById(`edit-incident-ward-${id}`).value, 10);
    const address = document.getElementById(`edit-incident-address-${id}`).value.trim();
    if (!ward) {
      showAlert('Vui lòng chọn phường/xã.');
      return;
    }

    const res = await apiFetch(`${API.incidents}${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ ward, address })
    });
    if (res.ok) {
      showAlert('Cập nhật phường/xã và địa chỉ thành công!', true);
      viewIncident(id);
      loadIncidents();
    } else {
      const d = await res.json().catch(() => ({}));
      showAlert(d.detail || JSON.stringify(d) || 'Lỗi cập nhật địa chỉ.');
    }
  };

  window._saveAssociation = async (id) => {
    const deviceId = document.getElementById('link-device-select').value;
    const edgeId = document.getElementById('link-edge-select').value;
    let targetType = 'UNKNOWN';
    if (deviceId) targetType = 'DEVICE';
    else if (edgeId) targetType = 'EDGE';

    const payload = {
      target_type: targetType,
      device: deviceId ? parseInt(deviceId) : null,
      edge: edgeId ? parseInt(edgeId) : null,
    };

    const res = await apiFetch(`${API.incidents}${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showAlert('Liên kết thiết bị/tuyến thành công!', true);
      viewIncident(id);
      loadIncidents();
    } else {
      const d = await res.json().catch(() => ({}));
      showAlert(d.detail || JSON.stringify(d) || 'Lỗi liên kết.');
    }
  };

  window._openConfirm = async (id) => {
    if (!confirm('Bạn có chắc chắn muốn xác nhận sự cố này không?')) return;
    const res = await apiFetch(`${API.incidents}${id}/update-status/`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'CONFIRMED' })
    });
    if (res.ok) {
      showAlert('Xác nhận sự cố thành công!', true);
      viewIncident(id);
      loadIncidents();
    } else {
      const d = await res.json().catch(() => ({}));
      showAlert(d.detail || 'Lỗi xác nhận.');
    }
  };

  window._openReject = async (id) => {
    const reason = prompt('Nhập lý do từ chối sự cố:');
    if (reason === null) return;
    if (!reason.trim()) { showAlert('Lý do từ chối không được để trống.'); return; }
    const res = await apiFetch(`${API.incidents}${id}/update-status/`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'REJECTED', rejection_reason: reason.trim() })
    });
    if (res.ok) {
      showAlert('Từ chối sự cố thành công!', true);
      viewIncident(id);
      loadIncidents();
    } else {
      const d = await res.json().catch(() => ({}));
      showAlert(d.detail || 'Lỗi từ chối.');
    }
  };

  window._closeIncident = async (id) => {
    if (!confirm('Xác nhận sự cố đã được khắc phục? Hệ thống sẽ thông báo cho người dân và ẩn sự cố khỏi bản đồ.')) return;
    const res = await apiFetch(`${API.incidents}${id}/update-status/`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'CLOSED' })
    });
    if (res.ok) {
      showAlert('Đóng sự cố thành công!', true);
      window._clearSelection?.();
      loadIncidents();
    } else {
      const d = await res.json().catch(() => ({}));
      showAlert(d.detail || 'Lỗi đóng sự cố.');
    }
  };

  window._startProgress = async (id) => {
    const res = await apiFetch(`${API.incidents}${id}/update-status/`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'IN_PROGRESS' })
    });
    if (res.ok) {
      showAlert('Đã xác nhận công việc!', true);
      viewIncident(id);
      loadIncidents();
    } else {
      const d = await res.json().catch(() => ({}));
      showAlert(d.detail || 'Lỗi cập nhật trạng thái.');
    }
  };

  window._resolveIncident = async (id) => {
    let note = '';
    while (!note.trim()) {
      note = prompt('Nhập ghi chú kết quả xử lý (bắt buộc):');
      if (note === null) return;
      if (!note.trim()) showAlert('Ghi chú kết quả xử lý là bắt buộc.');
    }
    const payload = { status: 'RESOLVED', result_note: note.trim() };

    const res = await apiFetch(`${API.incidents}${id}/update-status/`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      if (note.trim()) {
        await apiFetch(`${API.incidents}${id}/add-note/`, {
          method: 'POST',
          body: JSON.stringify({ content: `Báo cáo hoàn thành: ${note.trim()}` })
        });
      }
      showAlert('Đã gửi kết quả cho vận hành xác nhận!', true);
      viewIncident(id);
      loadIncidents();
    } else {
      const d = await res.json().catch(() => ({}));
      showAlert(d.detail || 'Lỗi báo hoàn thành.');
    }
  };

  window._addNote = async (id) => {
    const input = document.getElementById('new-note-content');
    const content = input ? input.value.trim() : '';
    if (!content) { showAlert('Vui lòng nhập nội dung ghi chú.'); return; }
    const res = await apiFetch(`${API.incidents}${id}/add-note/`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
    if (res.ok) {
      showAlert('Thêm ghi chú thành công!', true);
      viewIncident(id);
    } else {
      const d = await res.json().catch(() => ({}));
      showAlert(d.detail || 'Lỗi thêm ghi chú.');
    }
  };

  document.getElementById('assign-tech-count')?.addEventListener('change', (e) => {
    renderAssignTechSlots(parseInt(e.target.value, 10) || 1);
  });

  document.getElementById('btn-confirm-assign')?.addEventListener('click', async () => {
    const id = document.getElementById('assign-incident-id').value;
    const expectedCount = parseInt(document.getElementById('assign-tech-count')?.value || '1', 10);
    const techIds = Array.from(document.querySelectorAll('.assign-tech-picker'))
      .map((el) => el.value)
      .filter(Boolean);

    if (!techIds.length) {
      showAlert('Vui lòng chọn ít nhất một kỹ thuật viên.');
      return;
    }
    if (techIds.length !== expectedCount) {
      showAlert(`Vui lòng chọn đủ ${expectedCount} kỹ thuật viên.`);
      return;
    }
    if (new Set(techIds).size !== techIds.length) {
      showAlert('Không được chọn trùng kỹ thuật viên.');
      return;
    }

    const res = await apiFetch(`${API.incidents}${id}/assign/`, {
      method: 'PATCH',
      body: JSON.stringify({
        assigned_technicians: techIds.map((tid) => parseInt(tid, 10)),
        technician_count: expectedCount,
      }),
    });
    if (res.ok) {
      showAlert('Phân công thành công!', true);
      assignModal.hide();
      loadIncidents();
      viewIncident(id);
    }
    else { const d = await res.json().catch(() => ({})); showAlert(d.detail || 'Lỗi phân công.'); }
  });

  document.getElementById('btn-confirm-status')?.addEventListener('click', async () => {
    const id = document.getElementById('status-incident-id').value;
    const newStatus = document.getElementById('status-new').value;
    const note = document.getElementById('status-note').value.trim();
    const res = await apiFetch(`${API.incidents}${id}/update-status/`, { method: 'PATCH', body: JSON.stringify({ status: newStatus, result_note: note }) });
    if (res.ok) {
      if (note) await apiFetch(`${API.incidents}${id}/add-note/`, { method: 'POST', body: JSON.stringify({ content: note }) });
      showAlert('Cập nhật trạng thái thành công!', true);
      statusModal.hide();
      loadIncidents();
      viewIncident(id);
    } else { const d = await res.json().catch(() => ({})); showAlert(d.detail || 'Lỗi cập nhật.'); }
  });

  document.getElementById('btn-filter')?.addEventListener('click', loadIncidents);
  document.getElementById('btn-clear-filter')?.addEventListener('click', () => {
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-severity').value = '';
    document.getElementById('filter-type').value = '';
    loadIncidents();
  });

  window._focusLocalDevice = (deviceId) => {
    ensureDevicesAndEdges().then(() => {
      const dev = cachedDevices.find(d => d.id === deviceId);
      if (dev && incidentMap && dev.latitude && dev.longitude) {
        incidentMap.flyTo([dev.latitude, dev.longitude], 17);
      }
    });
  };

  window._focusLocalEdge = (edgeId) => {
    ensureDevicesAndEdges().then(() => {
      const edge = cachedEdges.find(e => e.id === edgeId);
      if (edge && incidentMap && edge.from_device_detail && edge.to_device_detail) {
        const fromD = edge.from_device_detail;
        const toD = edge.to_device_detail;
        if (fromD.latitude && fromD.longitude && toD.latitude && toD.longitude) {
          const bounds = L.latLngBounds([
            [fromD.latitude, fromD.longitude],
            [toD.latitude, toD.longitude]
          ]);
          incidentMap.fitBounds(bounds, { padding: [40, 40] });
        }
      }
    });
  };

  window._focusLocalCoord = (lat, lng) => {
    if (incidentMap) {
      incidentMap.flyTo([lat, lng], 17);
    }
  };

  window._clearSelection = () => {
    if (highlightLayer) highlightLayer.clearLayers();
    
    // Slide left layout: show list wrapper and hide details
    document.getElementById('incident-detail-wrapper')?.classList.add('d-none');
    document.getElementById('incident-list-wrapper')?.classList.remove('d-none');
    relayoutIncidentMap();

    const body = document.getElementById('incident-detail-body');
    if (body) {
      body.innerHTML = `
        <div class="text-center py-4">
          <div class="spinner-border text-danger" role="status"></div>
        </div>`;
    }
    const actions = document.getElementById('incident-modal-actions');
    if (actions) {
      actions.classList.add('d-none');
      actions.classList.remove('d-flex');
      actions.innerHTML = '';
    }
    document.getElementById('incident-modal-title').innerHTML = 'Chi tiết Sự cố';
    if (incidentMap) {
      incidentMap.setView([16.0544, 108.2022], 13);
    }
  };

  async function loadFullNetworkOnLocalMap() {
    await ensureDevicesAndEdges();
    
    if (!localDeviceLayer) localDeviceLayer = L.layerGroup().addTo(incidentMap);
    if (!localEdgeLayer) localEdgeLayer = L.layerGroup().addTo(incidentMap);
    
    localDeviceLayer.clearLayers();
    localEdgeLayer.clearLayers();

    // Render Edges
    cachedEdges.forEach(edge => {
      const fromDev = edge.from_device_detail;
      const toDev = edge.to_device_detail;
      if (fromDev && toDev && fromDev.latitude && fromDev.longitude && toDev.latitude && toDev.longitude) {
        const style = getEdgeColorByTypeAndStatus(edge.network_type, edge.status);
        const pts = [
          [fromDev.latitude, fromDev.longitude],
          [toDev.latitude, toDev.longitude]
        ];
        const lineOptions = {
          color: style.color,
          weight: style.weight || 4,
          opacity: 0.8
        };
        if (style.dashArray) {
          lineOptions.dashArray = style.dashArray;
        }
        const poly = L.polyline(pts, lineOptions).addTo(localEdgeLayer);
        poly.bindPopup(edgePopupHtml(edge));
      }
    });

    // Render Devices
    cachedDevices.forEach(d => {
      const customIcon = getDeviceIconByTypeAndStatus(d.device_type, d.status);
      const m = L.marker([d.latitude, d.longitude], { icon: customIcon }).addTo(localDeviceLayer);
      m.bindPopup(devicePopupHtml(d));
    });
  }

  window._focusLocalNetwork = () => {
    ensureDevicesAndEdges().then(() => {
      if (!cachedDevices.length || !incidentMap) return;
      const pts = cachedDevices.map(d => [d.latitude, d.longitude]);
      incidentMap.fitBounds(L.latLngBounds(pts), { padding: [50, 50] });
    });
  };

  const role = localStorage.getItem(STORAGE.role) || '';
  if (role === 'CITIZEN') {
    window.location.href = '/report/';
  } else {
    setupNav();
    WardUtils.fetchWards(apiFetch).then((w) => { cachedWardList = w; }).catch(() => {});
    initMap();
    window.addEventListener('resize', relayoutIncidentMap);
    loadIncidents();
    loadFullNetworkOnLocalMap();
    relayoutIncidentMap();
    pollNotifBadge();
    setInterval(pollNotifBadge, 30000);
  }
})();
