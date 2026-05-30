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
    edges: '/api/edges/',
    incidents: '/api/incidents/',
    notifCount: '/api/notifications/unread-count/',
  };

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

  /** @type {L.Map | null} */
  let map = null;
  /** @type {L.LayerGroup | null} */
  let markerLayer = null;
  /** @type {L.LayerGroup | null} */
  let routeLayer = null;
  /** @type {Map<number, L.CircleMarker>} */
  const markersById = new Map();
  /** @type {Map<number, L.Polyline>} */
  const polylinesById = new Map();
  /** @type {L.LayerGroup | null} */
  let incidentLayer = null;

  let pickLocationMode = false;
  /** @type {bootstrap.Modal | null} */
  let deviceModal = null;
  /** @type {bootstrap.Modal | null} */
  let deleteModal = null;
  let deleteTargetId = null;
  /** @type {bootstrap.Modal | null} */
  let reportModal = null;
  /** @type {bootstrap.Modal | null} */
  let edgeModal = null;
  /** @type {bootstrap.Modal | null} */
  let deleteEdgeModal = null;
  let deleteEdgeTargetId = null;

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

    let clickPopup = null;
    map.on('click', (e) => {
      if (pickLocationMode) {
        const latEl = document.getElementById('device-lat');
        const lngEl = document.getElementById('device-lng');
        if (latEl) latEl.value = e.latlng.lat.toFixed(6);
        if (lngEl) lngEl.value = e.latlng.lng.toFixed(6);
      } else {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        const content = `
          <div class="p-1" style="min-width: 150px;">
            <h6 class="fw-bold mb-1 border-bottom pb-1 text-danger">Báo sự cố</h6>
            <p class="small text-muted mb-2">Tọa độ: ${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
            <div class="d-grid">
              <button type="button" class="btn btn-danger btn-sm text-white fw-medium py-1 px-2 border-0 rounded d-flex align-items-center justify-content-center gap-1" 
                      onclick="window._triggerReport('UNKNOWN', null, ${lat}, ${lng}, 'OTHER', 'Vị trí bản đồ'); event.preventDefault();" style="font-size: 12px; background-color: #dc3545;">
                <i class="bi bi-exclamation-triangle"></i> Báo sự cố tại đây
              </button>
            </div>
          </div>
        `;
        if (clickPopup) {
          clickPopup.setLatLng(e.latlng).setContent(content).openOn(map);
        } else {
          clickPopup = L.popup().setLatLng(e.latlng).setContent(content).openOn(map);
        }
      }
    });
  }

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
        <div class="marker-wrapper ${pulseClass}" style="background-color: ${color};">
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

  function devicePopupHtml(d) {
    const typeLabel = DEVICE_LABELS[d.device_type] || d.device_type;
    const statusLabels = {
      ACTIVE: '<span class="badge bg-success bg-opacity-10 text-success">Hoạt động</span>',
      FAULT: '<span class="badge bg-danger bg-opacity-10 text-danger">Lỗi trực tiếp</span>',
      MAINTENANCE: '<span class="badge bg-warning bg-opacity-10 text-warning">Đang bảo trì</span>',
      INACTIVE: '<span class="badge bg-secondary bg-opacity-10 text-secondary">Ngưng hoạt động</span>'
    };
    const statusHtml = statusLabels[d.status] || d.status;

    const isElectric = ['ELECTRIC_POLE', 'TRANSFORMER', 'ELECTRIC_METER', 'DISTRIBUTION_BOX', 'ELECTRIC_JUNCTION'].includes(d.device_type);
    const typeParam = isElectric ? 'ELECTRIC' : 'WATER';

    let adminActionsHtml = '';
    if (isAdmin()) {
      adminActionsHtml = `
        <div class="d-flex gap-1 mt-2 pt-2 border-top">
          <button type="button" class="btn btn-outline-primary btn-sm flex-fill py-1 px-2" onclick="window._editDevice(${d.id}); event.preventDefault();" style="font-size: 11px;">
            <i class="bi bi-pencil-square"></i> Sửa
          </button>
          <button type="button" class="btn btn-outline-danger btn-sm flex-fill py-1 px-2" onclick="window._deleteDevice(${d.id}, '${escapeHtml(d.name)}'); event.preventDefault();" style="font-size: 11px;">
            <i class="bi bi-trash"></i> Xóa
          </button>
        </div>
      `;
    }

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
        <div class="small mb-2" style="font-size: 12px; line-height: 1.4;">
          <div class="mb-1"><strong>Loại:</strong> <span class="text-secondary">${escapeHtml(typeLabel)}</span></div>
          <div class="mb-1"><strong>Trạng thái:</strong> ${statusHtml}</div>
          <div class="mb-1"><strong>Khu vực:</strong> <span class="text-muted">${escapeHtml(d.area || '—')}</span></div>
          <div class="mb-1"><strong>Địa chỉ:</strong> <span class="text-muted">${escapeHtml(d.address || '—')}</span></div>
          ${attributesHtml}
        </div>
        <div class="d-grid mt-2">
          <a href="#" onclick="window._triggerReport('DEVICE', ${d.id}, ${d.latitude}, ${d.longitude}, '${typeParam}', '${escapeHtml(d.name)}', '${escapeHtml(d.area || '')}', '${escapeHtml(d.address || '')}'); event.preventDefault();" class="btn btn-danger btn-sm text-white fw-medium py-1 px-2 border-0 rounded d-flex align-items-center justify-content-center gap-1" style="font-size: 12px; background-color: #dc3545; transition: background 0.2s;">
            <i class="bi bi-exclamation-triangle"></i> Báo sự cố thiết bị này
          </a>
          ${adminActionsHtml}
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

    let midLat = 10.8231, midLng = 106.6297;
    if (edge.from_device_detail && edge.to_device_detail) {
      midLat = (edge.from_device_detail.latitude + edge.to_device_detail.latitude) / 2;
      midLng = (edge.from_device_detail.longitude + edge.to_device_detail.longitude) / 2;
    }

    const edgeArea = edge.from_device_detail ? (edge.from_device_detail.area || '') : '';
    const edgeAddress = edge.from_device_detail ? (edge.from_device_detail.address || '') : '';

    let adminActionsHtml = '';
    if (isAdmin()) {
      adminActionsHtml = `
        <div class="d-flex gap-1 mt-2 pt-2 border-top">
          <button type="button" class="btn btn-outline-primary btn-sm flex-fill py-1 px-2" onclick="window._editEdge(${edge.id}); event.preventDefault();" style="font-size: 11px;">
            <i class="bi bi-pencil-square"></i> Sửa
          </button>
          <button type="button" class="btn btn-outline-danger btn-sm flex-fill py-1 px-2" onclick="window._deleteEdge(${edge.id}, '${escapeHtml(edge.name || 'Tuyến mạng')}'); event.preventDefault();" style="font-size: 11px;">
            <i class="bi bi-trash"></i> Xóa
          </button>
        </div>
      `;
    }

    return `
      <div class="p-1" style="min-width: 180px;">
        <h6 class="fw-bold mb-1 border-bottom pb-1 text-primary d-flex align-items-center justify-content-between">
          <span>${escapeHtml(edge.name || 'Tuyến mạng')}</span>
          <small class="text-muted" style="font-size: 11px;">#${escapeHtml(edge.code)}</small>
        </h6>
        <div class="small mb-2" style="font-size: 12px; line-height: 1.4;">
          <div class="mb-1"><strong>Từ:</strong> <span class="text-secondary">${escapeHtml(fromDevName)}</span></div>
          <div class="mb-1"><strong>Đến:</strong> <span class="text-secondary">${escapeHtml(toDevName)}</span></div>
          <div class="mb-1"><strong>Loại mạng:</strong> <span class="fw-medium">${escapeHtml(typeLabel)}</span></div>
          <div class="mb-1"><strong>Trạng thái:</strong> ${statusHtml}</div>
        </div>
        <div class="d-grid mt-2">
          <a href="#" onclick="window._triggerReport('EDGE', ${edge.id}, ${midLat}, ${midLng}, '${edge.network_type}', '${escapeHtml(edge.name || 'Tuyến mạng')}', '${escapeHtml(edgeArea)}', '${escapeHtml(edgeAddress)}'); event.preventDefault();" class="btn btn-danger btn-sm text-white fw-medium py-1 px-2 border-0 rounded d-flex align-items-center justify-content-center gap-1" style="font-size: 12px; background-color: #dc3545; transition: background 0.2s;">
            <i class="bi bi-exclamation-triangle"></i> Báo sự cố tuyến này
          </a>
          ${adminActionsHtml}
        </div>
      </div>
    `;
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function renderDeviceMarkers(devices) {
    if (!markerLayer) return;
    markerLayer.clearLayers();
    markersById.clear();
    
    const filtered = currentType
      ? devices.filter(d => d.device_type === currentType)
      : devices;

    filtered.forEach((d) => {
      const customIcon = getDeviceIconByTypeAndStatus(d.device_type, d.status);
      const m = L.marker([d.latitude, d.longitude], {
        icon: customIcon
      });
      m.bindPopup(devicePopupHtml(d));
      m.addTo(markerLayer);
      markersById.set(d.id, m);
    });
  }

  function renderNetworkEdges(edges) {
    if (!routeLayer) return;
    routeLayer.clearLayers();
    polylinesById.clear();
    
    edges.forEach(edge => {
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
          opacity: edge.status === 'FAULT' ? 0.95 : 0.85
        };
        
        if (style.dashArray) {
          lineOptions.dashArray = style.dashArray;
        }
        
        const poly = L.polyline(pts, lineOptions).addTo(routeLayer);
        poly.bindPopup(edgePopupHtml(edge));
        polylinesById.set(edge.id, poly);
      }
    });
  }

  function renderEdgeTable(edges) {
    const tbody = document.getElementById('edge-table-body');
    if (!tbody) return;
    const admin = isAdmin();
    const colspan = admin ? 4 : 3;

    // Lấy bộ lọc từ DOM
    const searchVal = document.getElementById('search-edge')?.value.toLowerCase().trim() || '';
    const typeVal = document.getElementById('filter-edge-type')?.value || '';

    let filtered = edges;
    if (searchVal) {
      filtered = filtered.filter(e => 
        (e.name && e.name.toLowerCase().includes(searchVal)) || 
        (e.code && e.code.toLowerCase().includes(searchVal))
      );
    }
    if (typeVal) {
      filtered = filtered.filter(e => e.network_type === typeVal);
    }

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center text-muted py-4">Chưa có dữ liệu tuyến mạng phù hợp.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered
      .map((e) => {
        const typeLabel = e.network_type === 'ELECTRIC' ? '<span class="badge bg-warning text-dark">Điện ⚡</span>' : '<span class="badge bg-primary">Nước 💧</span>';
        const fromName = e.from_device_detail ? escapeHtml(e.from_device_detail.name) : 'Không rõ';
        const toName = e.to_device_detail ? escapeHtml(e.to_device_detail.name) : 'Không rõ';
        
        const statusBadges = {
          ACTIVE: '<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 rounded-pill">Hoạt động</span>',
          FAULT: '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 rounded-pill">Lỗi</span>',
          MAINTENANCE: '<span class="badge bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25 rounded-pill">Bảo trì</span>',
          INACTIVE: '<span class="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25 rounded-pill">Ngưng sử dụng</span>'
        };
        const statusHtml = statusBadges[e.status] || `<span class="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25 rounded-pill">${e.status}</span>`;
        
        const actions = admin
          ? `<td class="admin-only text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-primary btn-edit-edge" data-id="${e.id}">Sửa</button>
            <button type="button" class="btn btn-sm btn-outline-danger btn-del-edge" data-id="${e.id}">Xóa</button>
          </td>`
          : '';

        return `<tr class="edge-row" data-id="${e.id}" style="cursor:pointer;">
        <td>
          <div class="fw-semibold text-dark">${escapeHtml(e.name)}</div>
          <small class="text-muted" style="font-size: 10px;">#${escapeHtml(e.code)}</small>
        </td>
        <td>${typeLabel}<br>${statusHtml}</td>
        <td>
          <div style="font-size: 11px;" title="${fromName} ➡️ ${toName}">
            ${fromName}<br>➡️ ${toName}
          </div>
        </td>
        ${admin ? actions : ''}
      </tr>`;
      })
      .join('');

    tbody.querySelectorAll('.edge-row').forEach((row) => {
      row.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        const id = Number(row.getAttribute('data-id'));
        const edge = edges.find((x) => x.id === id);
        if (edge && map) {
          const fromDev = edge.from_device_detail;
          const toDev = edge.to_device_detail;
          if (fromDev && toDev) {
            const midLat = (fromDev.latitude + toDev.latitude) / 2;
            const midLng = (fromDev.longitude + toDev.longitude) / 2;
            map.flyTo([midLat, midLng], 15);
            const poly = polylinesById.get(id);
            if (poly) poly.openPopup();
          }
        }
      });
    });

    tbody.querySelectorAll('.btn-edit-edge').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(btn.getAttribute('data-id'));
        openEditEdgeModal(id);
      });
    });

    tbody.querySelectorAll('.btn-del-edge').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(btn.getAttribute('data-id'));
        const edge = edges.find((x) => x.id === id);
        if (edge) openDeleteEdgeModal(id, edge.name);
      });
    });

    if (admin) {
      tbody.querySelectorAll('.admin-only').forEach((el) => el.classList.remove('d-none'));
    }
  }

  let cachedEdges = [];

  async function loadEdges() {
    if (!routeLayer) return;
    const res = await apiFetch(`${API.edges}?page_size=1000`);
    if (!res.ok) {
      console.warn('Không tải được danh sách tuyến mạng.');
      return;
    }
    const data = await res.json();
    cachedEdges = data.results ?? data;
    renderNetworkEdges(cachedEdges);
    renderEdgeTable(cachedEdges);
  }

  async function refreshMap() {
    await Promise.all([loadDevices(), loadEdges()]);
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
        const statusBadges = {
          ACTIVE: '<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 rounded-pill">Hoạt động</span>',
          FAULT: '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 rounded-pill">Lỗi</span>',
          MAINTENANCE: '<span class="badge bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25 rounded-pill">Bảo trì</span>',
          INACTIVE: '<span class="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25 rounded-pill">Ngưng hoạt động</span>'
        };
        const st = statusBadges[d.status] || `<span class="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25 rounded-pill">${d.status}</span>`;
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
      ordering: currentSort,
      page_size: 1000
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
    
    renderDeviceMarkers(cachedDevices);
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

  async function populateParentSelect(excludeId = null) {
    const parentSelect = document.getElementById('device-parent');
    if (!parentSelect) return;
    
    parentSelect.innerHTML = '<option value="">-- Đang tải... --</option>';
    parentSelect.disabled = true;

    try {
      const res = await apiFetch(`${API.devices}?page_size=1000`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const allDevices = data.results || data;

      let options = '<option value="">-- Không có --</option>';
      allDevices.forEach(d => {
        if (excludeId && d.id === excludeId) return;
        const typeLabel = DEVICE_LABELS[d.device_type] || d.device_type;
        options += `<option value="${d.id}">${escapeHtml(d.name)} (${escapeHtml(typeLabel)})</option>`;
      });
      parentSelect.innerHTML = options;
    } catch (e) {
      parentSelect.innerHTML = '<option value="">-- Lỗi tải dữ liệu --</option>';
    } finally {
      parentSelect.disabled = false;
    }
  }

  function openCreateModal() {
    hideModalAlert();
    populateParentSelect().then(() => {
      document.getElementById('device-parent').value = '';
    });
    document.getElementById('device-modal-title').textContent = 'Thêm thiết bị';
    document.getElementById('device-id').value = '';
    document.getElementById('device-name').value = '';
    document.getElementById('device-type').value = 'ELECTRIC_POLE';
    document.getElementById('device-status').value = 'ACTIVE';
    document.getElementById('device-area').value = '';
    document.getElementById('device-address').value = '';
    document.getElementById('device-attributes').value = '';
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
    document.getElementById('device-status').value = d.status || 'ACTIVE';
    document.getElementById('device-area').value = d.area || '';
    document.getElementById('device-address').value = d.address || '';
    
    populateParentSelect(d.id).then(() => {
      document.getElementById('device-parent').value = d.parent ? String(d.parent) : '';
    });
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
      status: document.getElementById('device-status').value,
      area: document.getElementById('device-area').value.trim(),
      address: document.getElementById('device-address').value.trim(),
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
    await refreshMap();
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
    await refreshMap();
  }

  const ELECTRIC_TYPES = ['TRANSFORMER', 'DISTRIBUTION_BOX', 'ELECTRIC_POLE', 'ELECTRIC_JUNCTION', 'ELECTRIC_METER'];
  const WATER_TYPES = ['WATER_TANK', 'PUMP_STATION', 'MAIN_VALVE', 'BRANCH_VALVE', 'WATER_JUNCTION', 'WATER_METER', 'VALVE'];
  let cachedEdgeDevices = [];

  async function populateEdgeDeviceSelects() {
    const fromSelect = document.getElementById('edge-from-device');
    const toSelect = document.getElementById('edge-to-device');
    if (!fromSelect || !toSelect) return;
    
    fromSelect.innerHTML = '<option value="">-- Đang tải... --</option>';
    toSelect.innerHTML = '<option value="">-- Đang tải... --</option>';
    
    try {
      const res = await apiFetch(`${API.devices}?page_size=1000`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      cachedEdgeDevices = data.results || data;
    } catch (e) {
      fromSelect.innerHTML = '<option value="">-- Lỗi tải thiết bị --</option>';
      toSelect.innerHTML = '<option value="">-- Lỗi tải thiết bị --</option>';
    }
  }

  function filterEdgeDevicesByType() {
    const fromSelect = document.getElementById('edge-from-device');
    const toSelect = document.getElementById('edge-to-device');
    const edgeTypeSelect = document.getElementById('edge-type');
    if (!fromSelect || !toSelect || !edgeTypeSelect) return;

    const edgeType = edgeTypeSelect.value;
    const prevFromVal = fromSelect.value;
    const prevToVal = toSelect.value;
    
    const filtered = cachedEdgeDevices.filter(d => {
      if (edgeType === 'ELECTRIC') {
        return ELECTRIC_TYPES.includes(d.device_type);
      } else {
        return WATER_TYPES.includes(d.device_type);
      }
    });
    
    let options = '<option value="">-- Chọn thiết bị --</option>';
    filtered.forEach(d => {
      const typeLabel = DEVICE_LABELS[d.device_type] || d.device_type;
      options += `<option value="${d.id}">${escapeHtml(d.name)} (${escapeHtml(typeLabel)})</option>`;
    });
    
    fromSelect.innerHTML = options;
    toSelect.innerHTML = options;
    
    if (filtered.some(d => String(d.id) === prevFromVal)) {
      fromSelect.value = prevFromVal;
    }
    if (filtered.some(d => String(d.id) === prevToVal)) {
      toSelect.value = prevToVal;
    }
  }

  function showEdgeModalAlert(msg) {
    const el = document.getElementById('edge-modal-alert');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('d-none');
  }

  function hideEdgeModalAlert() {
    const el = document.getElementById('edge-modal-alert');
    if (!el) return;
    el.classList.add('d-none');
  }

  async function openCreateEdgeModal() {
    hideEdgeModalAlert();
    await populateEdgeDeviceSelects();
    document.getElementById('edge-modal-title').textContent = 'Thêm tuyến mạng';
    document.getElementById('edge-id').value = '';
    document.getElementById('edge-name').value = '';
    document.getElementById('edge-code').value = '';
    document.getElementById('edge-type').value = 'ELECTRIC';
    document.getElementById('edge-status').value = 'ACTIVE';
    filterEdgeDevicesByType();
    document.getElementById('edge-from-device').value = '';
    document.getElementById('edge-to-device').value = '';
    document.getElementById('edge-description').value = '';
    edgeModal.show();
  }

  async function openEditEdgeModal(edgeId) {
    hideEdgeModalAlert();
    await populateEdgeDeviceSelects();
    
    const edge = cachedEdges.find(e => e.id === edgeId);
    if (!edge) {
      console.error("Không tìm thấy tuyến mạng ID:", edgeId);
      return;
    }
    
    document.getElementById('edge-modal-title').textContent = 'Sửa tuyến mạng';
    document.getElementById('edge-id').value = String(edge.id);
    document.getElementById('edge-name').value = edge.name || '';
    document.getElementById('edge-code').value = edge.code || '';
    document.getElementById('edge-type').value = edge.network_type || 'ELECTRIC';
    document.getElementById('edge-status').value = edge.status || 'ACTIVE';
    filterEdgeDevicesByType();
    document.getElementById('edge-from-device').value = edge.from_device ? String(edge.from_device) : '';
    document.getElementById('edge-to-device').value = edge.to_device ? String(edge.to_device) : '';
    document.getElementById('edge-description').value = edge.description || '';
    edgeModal.show();
  }

  function openDeleteEdgeModal(id, name) {
    deleteEdgeTargetId = id;
    document.getElementById('delete-edge-name').textContent = name || 'Tuyến mạng';
    deleteEdgeModal.show();
  }

  async function saveEdge() {
    hideEdgeModalAlert();
    document.querySelectorAll('#edge-form .is-invalid').forEach(el => el.classList.remove('is-invalid'));
    
    const id = document.getElementById('edge-id').value.trim();
    const nameEl = document.getElementById('edge-name');
    const fromEl = document.getElementById('edge-from-device');
    const toEl = document.getElementById('edge-to-device');
    
    const body = {
      name: nameEl.value.trim(),
      code: document.getElementById('edge-code').value.trim() || null,
      network_type: document.getElementById('edge-type').value,
      status: document.getElementById('edge-status').value,
      from_device: parseInt(fromEl.value),
      to_device: parseInt(toEl.value),
      description: document.getElementById('edge-description').value.trim()
    };
    
    let hasError = false;
    if (!body.name) {
      nameEl.classList.add('is-invalid');
      hasError = true;
    }
    if (!fromEl.value) {
      fromEl.classList.add('is-invalid');
      hasError = true;
    }
    if (!toEl.value) {
      toEl.classList.add('is-invalid');
      hasError = true;
    }
    if (fromEl.value && toEl.value && fromEl.value === toEl.value) {
      toEl.classList.add('is-invalid');
      showEdgeModalAlert('Thiết bị đầu và thiết bị cuối không được trùng nhau.');
      hasError = true;
    }
    
    if (hasError) return;
    
    const url = id ? `${API.edges}${id}/` : API.edges;
    const method = id ? 'PATCH' : 'POST';
    const res = await apiFetch(url, { method, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showEdgeModalAlert(formatErrors(data));
      return;
    }
    
    edgeModal.hide();
    await refreshMap();
    showAppAlert('Lưu tuyến mạng thành công!', true);
  }

  async function confirmDeleteEdge() {
    if (!deleteEdgeTargetId) return;
    const id = deleteEdgeTargetId;
    const res = await apiFetch(`${API.edges}${id}/`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showAppAlert(formatErrors(data));
      return;
    }
    deleteEdgeModal.hide();
    deleteEdgeTargetId = null;
    await refreshMap();
    showAppAlert('Đã xóa tuyến mạng thành công!', true);
  }

  // Global window functions for map popup buttons
  window._editEdge = function(id) {
    if (map) map.closePopup();
    openEditEdgeModal(id);
  };
  
  window._deleteEdge = function(id, name) {
    if (map) map.closePopup();
    openDeleteEdgeModal(id, name);
  };
  
  window._editDevice = function(id) {
    if (map) map.closePopup();
    const d = cachedDevices.find(x => x.id === id);
    if (d) openEditModal(d);
  };
  
  window._deleteDevice = function(id, name) {
    if (map) map.closePopup();
    openDeleteModal(id, name);
  };

  window._triggerReport = function(targetType, targetId, lat, lng, defaultType, targetName, area = '', address = '') {
    const modalAlert = document.getElementById('report-modal-alert');
    if (modalAlert) modalAlert.classList.add('d-none');
    
    // Reset form fields
    const form = document.getElementById('report-incident-form');
    if (form) form.reset();
    
    // Remove invalid classes
    document.querySelectorAll('#report-incident-form .is-invalid').forEach(el => el.classList.remove('is-invalid'));

    // Set hidden fields
    document.getElementById('report-target-type').value = targetType;
    document.getElementById('report-device-id').value = targetType === 'DEVICE' ? targetId : '';
    document.getElementById('report-edge-id').value = targetType === 'EDGE' ? targetId : '';
    
    // Set coordinate fields
    document.getElementById('report-lat').value = parseFloat(lat).toFixed(6);
    document.getElementById('report-lng').value = parseFloat(lng).toFixed(6);
    
    // Set area & address
    document.getElementById('report-area').value = area;
    document.getElementById('report-address').value = address;
    
    // Set default incident type
    const typeSelect = document.getElementById('report-incident-type');
    if (typeSelect) {
      if (defaultType === 'ELECTRIC') {
        typeSelect.value = 'ELECTRIC';
      } else if (defaultType === 'WATER') {
        typeSelect.value = 'WATER';
      } else {
        typeSelect.value = 'OTHER';
      }
    }

    // Set target description
    const descEl = document.getElementById('report-target-desc');
    if (descEl) {
      if (targetType === 'DEVICE') {
        descEl.innerHTML = `<span class="badge bg-primary me-1">Thiết bị</span> <strong>${escapeHtml(targetName)}</strong> (ID: ${targetId})`;
      } else if (targetType === 'EDGE') {
        descEl.innerHTML = `<span class="badge bg-info text-dark me-1">Tuyến mạng</span> <strong>${escapeHtml(targetName)}</strong> (ID: ${targetId})`;
      } else {
        descEl.innerHTML = `<span class="badge bg-secondary me-1">Vị trí</span> <strong>Tọa độ bản đồ</strong> (${parseFloat(lat).toFixed(6)}, ${parseFloat(lng).toFixed(6)})`;
      }
    }

    if (reportModal) {
      reportModal.show();
    }
  };

  async function submitIncidentReport() {
    const modalAlert = document.getElementById('report-modal-alert');
    if (modalAlert) modalAlert.classList.add('d-none');
    
    document.querySelectorAll('#report-incident-form .is-invalid').forEach(el => el.classList.remove('is-invalid'));
    
    const targetType = document.getElementById('report-target-type').value;
    const deviceId = document.getElementById('report-device-id').value;
    const edgeId = document.getElementById('report-edge-id').value;
    const titleEl = document.getElementById('report-title');
    const descEl = document.getElementById('report-description');
    
    const body = {
      title: titleEl.value.trim(),
      description: descEl.value.trim(),
      incident_type: document.getElementById('report-incident-type').value,
      severity: document.getElementById('report-severity').value,
      latitude: parseFloat(document.getElementById('report-lat').value),
      longitude: parseFloat(document.getElementById('report-lng').value),
      area: document.getElementById('report-area').value.trim(),
      address: document.getElementById('report-address').value.trim(),
      target_type: targetType,
      device: targetType === 'DEVICE' ? parseInt(deviceId) : null,
      edge: targetType === 'EDGE' ? parseInt(edgeId) : null,
    };
    
    let hasError = false;
    if (!body.title) {
      titleEl.classList.add('is-invalid');
      hasError = true;
    }
    if (!body.description) {
      descEl.classList.add('is-invalid');
      hasError = true;
    }
    
    if (hasError) {
      if (modalAlert) {
        modalAlert.textContent = 'Vui lòng điền đầy đủ các trường bắt buộc.';
        modalAlert.classList.remove('d-none');
      }
      return;
    }
    
    const res = await apiFetch(API.incidents, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (modalAlert) {
        modalAlert.textContent = formatErrors(data);
        modalAlert.classList.remove('d-none');
      }
      return;
    }
    
    if (reportModal) {
      reportModal.hide();
    }
    
    showAppAlert('Báo cáo sự cố thành công!', true);
    
    // Refresh device/edge layers & incident markers
    await refreshMap();
    await loadIncidentMarkers();
  }

  // Load incident markers
  async function loadIncidentMarkers() {
    try {
      const res = await apiFetch(API.incidents);
      if (!res.ok) return;
      const data = await res.json();
      const incidents = data.results ?? data;
      if (incidentLayer) incidentLayer.clearLayers();
      else { incidentLayer = L.layerGroup().addTo(map); }
      const SCOLOR = { PENDING_VERIFY: '#ef4444', CONFIRMED: '#ea580c', ASSIGNED: '#f59e0b', IN_PROGRESS: '#0ea5e9', RESOLVED: '#22c55e', CLOSED: '#94a3b8', REJECTED: '#64748b' };
      incidents.forEach(inc => {
        if (inc.status === 'CLOSED') return;
        const color = SCOLOR[inc.status] || '#94a3b8';
        const m = L.circleMarker([inc.latitude, inc.longitude], {
          radius: 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.9
        }).addTo(incidentLayer);
        m.bindPopup(`<b>⚠ ${inc.title}</b><br>${inc.status_display}<br><a href="/incidents/" class="small">Xem chi tiết →</a>`);
      });
    } catch {}
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
    }
    if (role === 'ADMIN' || role === 'OPERATOR') {
      if (navDashboardLink) navDashboardLink.classList.remove('d-none');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;
    const role = localStorage.getItem(STORAGE.role) || '';
    if (role === 'CITIZEN') {
      window.location.href = '/lookup/';
      return;
    }
    setupNav();
    initMap();

    deviceModal = {
      show: () => {
        document.getElementById('sidebar-list-container')?.classList.add('d-none');
        document.getElementById('sidebar-edge-form-container')?.classList.add('d-none');
        document.getElementById('sidebar-device-form-container')?.classList.remove('d-none');
        pickLocationMode = true;
      },
      hide: () => {
        document.getElementById('sidebar-device-form-container')?.classList.add('d-none');
        document.getElementById('sidebar-list-container')?.classList.remove('d-none');
        pickLocationMode = false;
      }
    };

    edgeModal = {
      show: () => {
        document.getElementById('sidebar-list-container')?.classList.add('d-none');
        document.getElementById('sidebar-device-form-container')?.classList.add('d-none');
        document.getElementById('sidebar-edge-form-container')?.classList.remove('d-none');
      },
      hide: () => {
        document.getElementById('sidebar-edge-form-container')?.classList.add('d-none');
        document.getElementById('sidebar-list-container')?.classList.remove('d-none');
      }
    };

    deleteModal = new bootstrap.Modal(document.getElementById('delete-modal'));
    reportModal = new bootstrap.Modal(document.getElementById('report-incident-modal'));
    deleteEdgeModal = new bootstrap.Modal(document.getElementById('delete-edge-modal'));

    // Bind cancel/close buttons for sidebar forms
    document.querySelectorAll('.btn-cancel-device').forEach(btn => {
      btn.addEventListener('click', () => deviceModal.hide());
    });
    document.querySelectorAll('.btn-cancel-edge').forEach(btn => {
      btn.addEventListener('click', () => edgeModal.hide());
    });

    document.getElementById('btn-logout').addEventListener('click', () => logout());

    document.getElementById('btn-add-device').addEventListener('click', () => openCreateModal());
    
    const btnAddEdge = document.getElementById('btn-add-edge');
    if (btnAddEdge) {
      btnAddEdge.addEventListener('click', () => openCreateEdgeModal());
    }

    document.getElementById('device-save').addEventListener('click', () => saveDevice());
    document.getElementById('delete-confirm').addEventListener('click', () => confirmDelete());
    document.getElementById('edge-save').addEventListener('click', () => saveEdge());
    document.getElementById('delete-edge-confirm').addEventListener('click', () => confirmDeleteEdge());
    document.getElementById('btn-report-submit').addEventListener('click', () => submitIncidentReport());
    
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
          refreshMap();
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
        debounce(() => refreshMap());
      });
    }
    if (typeEl) {
      typeEl.addEventListener('change', (e) => {
        currentType = e.target.value;
        currentPage = 1;
        refreshMap();
      });
    }
    if (sortEl) {
      sortEl.addEventListener('change', (e) => {
        currentSort = e.target.value;
        currentPage = 1;
        refreshMap();
      });
    }
    if (prevEl) {
      prevEl.addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; refreshMap(); }
      });
    }
    if (nextEl) {
      nextEl.addEventListener('click', () => {
        currentPage++; refreshMap();
      });
    }

    // UX Filters for Edges
    const searchEdgeEl = document.getElementById('search-edge');
    const filterEdgeTypeEl = document.getElementById('filter-edge-type');
    
    if (searchEdgeEl) {
      searchEdgeEl.addEventListener('input', () => {
        renderEdgeTable(cachedEdges);
      });
    }
    if (filterEdgeTypeEl) {
      filterEdgeTypeEl.addEventListener('change', () => {
        renderEdgeTable(cachedEdges);
      });
    }
    
    const btnCpSave = document.getElementById('cp-save');
    if (btnCpSave) btnCpSave.addEventListener('click', () => changePassword());

    const edgeTypeSelect = document.getElementById('edge-type');
    if (edgeTypeSelect) {
      edgeTypeSelect.addEventListener('change', () => {
        filterEdgeDevicesByType();
      });
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

    refreshMap().then(() => {
      // Parse query parameters from URL
      const urlParams = new URLSearchParams(window.location.search);
      const deviceParam = urlParams.get('device');
      const edgeParam = urlParams.get('edge');
      const latParam = urlParams.get('lat');
      const lngParam = urlParams.get('lng');

      if (deviceParam) {
        const id = parseInt(deviceParam);
        const d = cachedDevices.find(x => x.id === id);
        if (d && map) {
          map.flyTo([d.latitude, d.longitude], 17);
          const mk = markersById.get(id);
          if (mk) {
            setTimeout(() => mk.openPopup(), 400);
          }
        }
      } else if (edgeParam) {
        const id = parseInt(edgeParam);
        const edge = cachedEdges.find(x => x.id === id);
        if (edge && map) {
          const fromDev = edge.from_device_detail;
          const toDev = edge.to_device_detail;
          if (fromDev && toDev) {
            const midLat = (fromDev.latitude + toDev.latitude) / 2;
            const midLng = (fromDev.longitude + toDev.longitude) / 2;
            map.flyTo([midLat, midLng], 17);
            setTimeout(() => {
              L.popup()
                .setLatLng([midLat, midLng])
                .setContent(edgePopupHtml(edge))
                .openOn(map);
            }, 400);
          }
        }
      } else if (latParam && lngParam) {
        const lat = parseFloat(latParam);
        const lng = parseFloat(lngParam);
        if (!isNaN(lat) && !isNaN(lng) && map) {
          map.flyTo([lat, lng], 17);
          setTimeout(() => {
            L.popup()
              .setLatLng([lat, lng])
              .setContent(`<div class="p-2 small"><b>Vị trí sự cố:</b><br>Tọa độ: ${lat.toFixed(5)}, ${lng.toFixed(5)}</div>`)
              .openOn(map);
          }, 400);
        }
      }
    });

    loadIncidentMarkers();
    pollNotifBadge();
    setInterval(pollNotifBadge, 30000);
    setInterval(loadIncidentMarkers, 60000);
  });
})();
