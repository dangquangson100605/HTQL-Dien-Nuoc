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
    users: '/api/auth/users/',
    notifCount: '/api/notifications/unread-count/',
  };

  /** Tâm bản đồ mặc định khi tải / F5: thành phố Đà Nẵng */
  const MAP_DEFAULT = { lat: 16.0544, lng: 108.2022, zoom: 13 };

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

  const ELECTRIC_TYPES = ['TRANSFORMER', 'DISTRIBUTION_BOX', 'ELECTRIC_POLE', 'ELECTRIC_JUNCTION', 'ELECTRIC_METER'];
  const WATER_TYPES = ['WATER_TANK', 'PUMP_STATION', 'MAIN_VALVE', 'BRANCH_VALVE', 'WATER_JUNCTION', 'WATER_METER', 'VALVE'];

  function deviceNetworkGroup(deviceType) {
    return ELECTRIC_TYPES.includes(deviceType) ? 'ELECTRIC' : 'WATER';
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function maxKmForDistrict(district) {
    return district === 'Hòa Vang' ? 12 : 4.5;
  }

  function getNearestWard(lat, lng) {
    let nearest = null;
    let nearestD = Infinity;
    cachedWards.forEach((w) => {
      const d = haversineKm(lat, lng, w.latitude, w.longitude);
      if (d < nearestD) {
        nearestD = d;
        nearest = w;
      }
    });
    return { ward: nearest, distanceKm: nearestD };
  }

  function updateDeviceCoordHint(ok, wardName) {
    const el = document.getElementById('device-coord-hint');
    if (!el) return;
    if (ok && wardName) {
      el.className = 'form-text small text-success mt-1 mb-1';
      el.innerHTML = `<i class="bi bi-check-circle"></i> Tọa độ khớp <strong>${escapeHtml(wardName)}</strong>`;
    } else {
      el.className = 'form-text small text-primary mt-1 mb-1';
      el.innerHTML = '<i class="bi bi-info-circle"></i> Chọn <strong>phường/xã</strong> trước, sau đó click trên bản đồ để lấy tọa độ (phải khớp phường/xã).';
    }
  }

  function validateCoordsForSelectedWard(lat, lng, showAlert = true) {
    const wardId = document.getElementById('device-ward')?.value;
    if (!wardId) {
      if (showAlert) showModalAlert('Vui lòng chọn phường/xã trước khi chọn tọa độ trên bản đồ.');
      updateDeviceCoordHint(false);
      return false;
    }
    const selected = cachedWards.find((w) => String(w.id) === wardId);
    if (!selected) return false;

    const { ward: nearest } = getNearestWard(lat, lng);
    const distSelected = haversineKm(lat, lng, selected.latitude, selected.longitude);
    const maxKm = maxKmForDistrict(selected.district);

    if (!nearest || String(nearest.id) !== String(selected.id) || distSelected > maxKm) {
      if (showAlert) {
        showModalAlert(
          `Tọa độ không thuộc "${selected.name}".`
          + (nearest && String(nearest.id) !== String(selected.id)
            ? ` Vị trí gần nhất: ${nearest.name}.`
            : ' Hãy click trong phạm vi phường/xã đã chọn.')
        );
      }
      updateDeviceCoordHint(false);
      return false;
    }
    updateDeviceCoordHint(true, selected.name);
    return true;
  }

  function setupAdminToolbar() {
    if (!isAdmin()) return;
    document.querySelectorAll('#sidebar-list-container .admin-only, .sidebar-actions .admin-only').forEach((el) => {
      el.classList.remove('d-none');
    });
  }

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
  let currentWard = '';
  let currentStatus = '';
  let currentSort = '-updated_at';
  let cachedWards = [];

  function getAccess() {
    return localStorage.getItem(STORAGE.access);
  }

  function clearAuth() {
    localStorage.removeItem(STORAGE.access);
    localStorage.removeItem(STORAGE.refresh);
    localStorage.removeItem(STORAGE.role);
    localStorage.removeItem(STORAGE.username);
  }

  /** @type {bootstrap.Modal | null} */
  let maintainStatusModal = null;
  /** @type {bootstrap.Modal | null} */
  let maintainAssignModal = null;
  let maintainAssignModalTechs = [];

  function getRole() {
    return localStorage.getItem(STORAGE.role) || '';
  }

  function isAdmin() {
    return getRole() === 'ADMIN';
  }

  function isTechnician() {
    return getRole() === 'TECHNICIAN';
  }

  function isOperator() {
    return getRole() === 'OPERATOR';
  }

  function canReportIncident() {
    const role = getRole();
    return role === 'ADMIN' || role === 'OPERATOR';
  }

  function canMaintainStatus() {
    const role = getRole();
    return role === 'ADMIN' || role === 'OPERATOR' || role === 'TECHNICIAN';
  }

  function canAssignMaintenance() {
    const role = getRole();
    return role === 'ADMIN' || role === 'OPERATOR';
  }

  function isAssignedToDeviceMaintenance(d) {
    if (!isTechnician()) return false;
    const usernames = d.maintenance_assigned_technician_usernames || [];
    if (!usernames.length) return true;
    const me = localStorage.getItem(STORAGE.username) || '';
    return usernames.includes(me);
  }

  function canTechnicianMaintainDevice(d) {
    if (!isTechnician()) return canMaintainStatus() && d.status !== 'ACTIVE';
    if (!['FAULT', 'MAINTENANCE', 'INACTIVE'].includes(d.status)) return false;
    return isAssignedToDeviceMaintenance(d);
  }

  function assignedMaintenanceInfoHtml(d) {
    const names = d.maintenance_assigned_technician_usernames || [];
    if (!names.length) return '';
    return `<div class="small text-info mt-1"><i class="bi bi-people-fill me-1"></i>KTV phụ trách: <strong>${names.map(escapeHtml).join(', ')}</strong></div>`;
  }

  function operatorAssignMaintenanceHtml(d) {
    if (!canAssignMaintenance()) return '';
    if (!['FAULT', 'INACTIVE'].includes(d.status)) return '';
    return `<div class="d-grid mt-2 pt-2 border-top">
      <button type="button" class="btn btn-warning btn-sm text-dark fw-medium py-1" onclick="window._openAssignMaintenance(${d.id}); event.preventDefault();">
        <i class="bi bi-tools"></i> Tiến hành bảo trì &amp; phân công KTV
      </button>
      <div class="form-text small text-center mt-1">Chọn KTV trong phường/xã của thiết bị</div>
    </div>`;
  }

  function operatorMaintenanceFollowUpHtml(d) {
    if (!isOperator() && !isAdmin()) return '';
    if (d.status !== 'MAINTENANCE') return '';
    if (!d.maintenance_pending_operator) {
      return `<div class="small text-muted mt-2 pt-2 border-top">Đang chờ KTV xác nhận và báo hoàn thành bảo trì.</div>`;
    }
    const noteHint = d.maintenance_result_note
      ? `<div class="small text-success mb-2"><strong>KTV ghi chú:</strong> ${escapeHtml(d.maintenance_result_note)}</div>`
      : '';
    return `<div class="d-grid gap-1 mt-2 pt-2 border-top">${noteHint}
      <button type="button" class="btn btn-success btn-sm fw-medium py-1" onclick="window._confirmMaintenance(${d.id}); event.preventDefault();">
        <i class="bi bi-check-circle"></i> Xác nhận hoàn thành &amp; về hoạt động
      </button>
      <button type="button" class="btn btn-outline-danger btn-sm fw-medium py-1" onclick="window._quickMaintainStatus('DEVICE', ${d.id}, 'FAULT', '${escapeHtml(d.name || '')}'); event.preventDefault();">
        <i class="bi bi-x-circle"></i> Vẫn còn lỗi
      </button>
    </div>`;
  }

  function technicianMaintenanceWorkflowHtml(d) {
    if (!isTechnician() || d.status !== 'MAINTENANCE') return '';
    if (!canTechnicianMaintainDevice(d)) {
      return `<div class="small text-muted mt-2 pt-2 border-top">Chưa được phân công bảo trì thiết bị này.</div>`;
    }
    if (!d.maintenance_acknowledged_at) {
      return `<div class="d-grid mt-2 pt-2 border-top">
        <button type="button" class="btn btn-primary btn-sm fw-medium py-1" onclick="window._ackMaintenance(${d.id}); event.preventDefault();">
          <i class="bi bi-hand-thumbs-up"></i> Xác nhận công việc
        </button>
      </div>`;
    }
    if (!d.maintenance_completed_at) {
      return `<div class="d-grid mt-2 pt-2 border-top">
        <button type="button" class="btn btn-success btn-sm fw-medium py-1" onclick="window._reportMaintenanceComplete(${d.id}); event.preventDefault();">
          <i class="bi bi-send-check"></i> Báo bảo trì xong &amp; gửi vận hành
        </button>
        <button type="button" class="btn btn-outline-danger btn-sm py-1" onclick="window._quickMaintainStatus('DEVICE', ${d.id}, 'FAULT', '${escapeHtml(d.name || '')}'); event.preventDefault();">
          <i class="bi bi-x-circle"></i> Vẫn còn lỗi
        </button>
      </div>`;
    }
    return `<div class="small text-info mt-2 pt-2 border-top"><i class="bi bi-hourglass-split me-1"></i>Đã gửi kết quả — chờ vận hành xác nhận.</div>`;
  }

  function deviceMaintainHtmlForRole(d) {
    if (isTechnician()) {
      return technicianMaintenanceWorkflowHtml(d);
    }
    if (isOperator()) {
      if (d.status === 'MAINTENANCE') {
        return operatorMaintenanceFollowUpHtml(d);
      }
      return '';
    }
    if (isAdmin() && canMaintainStatus() && d.status !== 'ACTIVE') {
      return technicianMaintainActionsHtml('DEVICE', d.id, d.status, d.name, d);
    }
    return '';
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
    map = L.map('map').setView([MAP_DEFAULT.lat, MAP_DEFAULT.lng], MAP_DEFAULT.zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);

    let clickPopup = null;
    map.on('click', (e) => {
      if (pickLocationMode) {
        if (!validateCoordsForSelectedWard(e.latlng.lat, e.latlng.lng)) return;
        const latEl = document.getElementById('device-lat');
        const lngEl = document.getElementById('device-lng');
        if (latEl) latEl.value = e.latlng.lat.toFixed(6);
        if (lngEl) lngEl.value = e.latlng.lng.toFixed(6);
        hideModalAlert();
      } else if (canReportIncident()) {
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

  function technicianMaintainActionsHtml(targetType, targetId, currentStatus, label, deviceObj) {
    if (isTechnician()) return '';
    if (targetType === 'DEVICE' && deviceObj && !canTechnicianMaintainDevice(deviceObj)) return '';
    if (!canMaintainStatus()) return '';
    const safeLabel = escapeHtml(label || '');
    let quickBtns = '';
    if (currentStatus === 'FAULT' || currentStatus === 'INACTIVE') {
      quickBtns = `
        <button type="button" class="btn btn-warning btn-sm text-dark fw-medium py-1" onclick="window._quickMaintainStatus('${targetType}', ${targetId}, 'MAINTENANCE', '${safeLabel}'); event.preventDefault();">
          <i class="bi bi-tools"></i> Bắt đầu bảo trì
        </button>
        <button type="button" class="btn btn-success btn-sm fw-medium py-1" onclick="window._quickMaintainStatus('${targetType}', ${targetId}, 'ACTIVE', '${safeLabel}'); event.preventDefault();">
          <i class="bi bi-check-circle"></i> Đã khắc phục
        </button>`;
    } else if (currentStatus === 'MAINTENANCE') {
      quickBtns = `
        <button type="button" class="btn btn-success btn-sm fw-medium py-1" onclick="window._quickMaintainStatus('${targetType}', ${targetId}, 'ACTIVE', '${safeLabel}'); event.preventDefault();">
          <i class="bi bi-check-circle"></i> Hoàn thành bảo trì
        </button>
        <button type="button" class="btn btn-outline-danger btn-sm fw-medium py-1" onclick="window._quickMaintainStatus('${targetType}', ${targetId}, 'FAULT', '${safeLabel}'); event.preventDefault();">
          <i class="bi bi-x-circle"></i> Vẫn còn lỗi
        </button>`;
    }
    const openModalBtn = (currentStatus === 'FAULT' || currentStatus === 'MAINTENANCE' || currentStatus === 'INACTIVE')
      ? `<button type="button" class="btn btn-outline-secondary btn-sm py-1" onclick="window._openMaintainStatusModal('${targetType}', ${targetId}, '${currentStatus}', '${safeLabel}'); event.preventDefault();">
          <i class="bi bi-arrow-repeat"></i> Cập nhật trạng thái...
        </button>`
      : '';
    if (!quickBtns && !openModalBtn) return '';
    return `<div class="d-grid gap-1 mt-2 pt-2 border-top">${quickBtns}${openModalBtn}</div>`;
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

    let reportHtml = '';
    if (canReportIncident()) {
      reportHtml = `
        <div class="d-grid mt-2">
          <a href="#" onclick="window._triggerReport('DEVICE', ${d.id}, ${d.latitude}, ${d.longitude}, '${typeParam}', '${escapeHtml(d.name)}', ${d.ward || 'null'}, '${escapeHtml(d.address || '')}'); event.preventDefault();" class="btn btn-danger btn-sm text-white fw-medium py-1 px-2 border-0 rounded d-flex align-items-center justify-content-center gap-1" style="font-size: 12px; background-color: #dc3545;">
            <i class="bi bi-exclamation-triangle"></i> Báo sự cố thiết bị này
          </a>
        </div>`;
    }

    const maintainHtml = deviceMaintainHtmlForRole(d);
    const assignHtml = operatorAssignMaintenanceHtml(d);

    return `
      <div class="p-1" style="min-width: 180px;">
        <h6 class="fw-bold mb-1 border-bottom pb-1 text-primary d-flex align-items-center justify-content-between">
          <span>${escapeHtml(d.name)}</span>
          <small class="text-muted" style="font-size: 11px;">#${escapeHtml(d.code)}</small>
        </h6>
        <div class="small mb-2" style="font-size: 12px; line-height: 1.4;">
          <div class="mb-1"><strong>Loại:</strong> <span class="text-secondary">${escapeHtml(typeLabel)}</span></div>
          <div class="mb-1"><strong>Trạng thái:</strong> ${statusHtml}</div>
          <div class="mb-1"><strong>Phường/Xã:</strong> <span class="text-muted">${escapeHtml(d.ward_name || d.area || '—')}</span></div>
          <div class="mb-1"><strong>Địa chỉ:</strong> <span class="text-muted">${escapeHtml(d.address || '—')}</span></div>
          ${assignedMaintenanceInfoHtml(d)}
          ${attributesHtml}
        </div>
        ${assignHtml}
        ${maintainHtml}
        ${reportHtml}
        ${adminActionsHtml}
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

    let midLat = MAP_DEFAULT.lat, midLng = MAP_DEFAULT.lng;
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

    let reportHtml = '';
    if (canReportIncident()) {
      reportHtml = `
        <div class="d-grid mt-2">
          <a href="#" onclick="window._triggerReport('EDGE', ${edge.id}, ${midLat}, ${midLng}, '${edge.network_type}', '${escapeHtml(edge.name || 'Tuyến mạng')}', '${escapeHtml(edgeArea)}', '${escapeHtml(edgeAddress)}'); event.preventDefault();" class="btn btn-danger btn-sm text-white fw-medium py-1 px-2 border-0 rounded d-flex align-items-center justify-content-center gap-1" style="font-size: 12px; background-color: #dc3545;">
            <i class="bi bi-exclamation-triangle"></i> Báo sự cố tuyến này
          </a>
        </div>`;
    }

    const maintainHtml = isTechnician()
      ? technicianMaintainActionsHtml('EDGE', edge.id, edge.status, edge.name || 'Tuyến mạng')
      : (canMaintainStatus() && edge.status !== 'ACTIVE'
        ? technicianMaintainActionsHtml('EDGE', edge.id, edge.status, edge.name || 'Tuyến mạng')
        : '');

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
        ${maintainHtml}
        ${reportHtml}
        ${adminActionsHtml}
      </div>
    `;
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function getWardMapZoom(district) {
    return district === 'Hòa Vang' ? 13 : 14;
  }

  function focusMapOnWardFilter() {
    if (!map) return;
    if (!currentWard) {
      map.flyTo([MAP_DEFAULT.lat, MAP_DEFAULT.lng], MAP_DEFAULT.zoom);
      return;
    }
    const ward = cachedWards.find((w) => String(w.id) === String(currentWard));
    if (ward) {
      map.flyTo([ward.latitude, ward.longitude], getWardMapZoom(ward.district));
    }
  }

  function getVisibleDeviceIds() {
    return new Set(cachedDevices.map((d) => d.id));
  }

  function filterDevicesForMap(devices) {
    let list = devices;
    if (currentWard) {
      list = list.filter((d) => String(d.ward) === String(currentWard));
    }
    if (currentType) {
      list = list.filter((d) => d.device_type === currentType);
    }
    if (currentStatus) {
      list = list.filter((d) => d.status === currentStatus);
    }
    return list;
  }

  function filterEdgesForMap(edges) {
    const visibleDeviceIds = getVisibleDeviceIds();
    return edges.filter((edge) => {
      const fromId = edge.from_device ?? edge.from_device_detail?.id;
      const toId = edge.to_device ?? edge.to_device_detail?.id;
      if (!fromId || !toId) return false;
      return visibleDeviceIds.has(fromId) && visibleDeviceIds.has(toId);
    });
  }

  function renderDeviceMarkers(devices) {
    if (!markerLayer) return;
    markerLayer.clearLayers();
    markersById.clear();

    const filtered = filterDevicesForMap(devices);

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

    filterEdgesForMap(edges).forEach(edge => {
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
    if (currentWard) {
      filtered = filterEdgesForMap(filtered);
    }
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

    tbody.querySelectorAll('.btn-maintain-device').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(btn.getAttribute('data-id'));
        const status = btn.getAttribute('data-status') || 'FAULT';
        const name = btn.getAttribute('data-name') || '';
        window._openMaintainStatusModal('DEVICE', id, status, name);
      });
    });
  }

  let cachedEdges = [];

  async function loadEdges() {
    if (!routeLayer) return;
    const params = new URLSearchParams({ page_size: '1000' });
    if (currentWard) params.set('ward', currentWard);

    const res = await apiFetch(`${API.edges}?${params.toString()}`);
    if (!res.ok) {
      console.warn('Không tải được danh sách tuyến mạng.');
      routeLayer.clearLayers();
      polylinesById.clear();
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

  function technicianTableActionHtml(d) {
    if (!canTechnicianMaintainDevice(d) || d.status !== 'MAINTENANCE') return '—';
    if (!d.maintenance_acknowledged_at) {
      return `<button type="button" class="btn btn-sm btn-primary btn-tech-ack py-0" data-id="${d.id}">Xác nhận CV</button>`;
    }
    if (!d.maintenance_completed_at) {
      return `<button type="button" class="btn btn-sm btn-success btn-tech-complete py-0" data-id="${d.id}">Báo xong</button>`;
    }
    return '<span class="text-muted small">Chờ VH</span>';
  }

  function renderTable(devices) {
    const tbody = document.getElementById('device-table-body');
    if (!tbody) return;
    const admin = isAdmin();
    const tech = isTechnician();
    const operator = canAssignMaintenance();
    if (tech) {
      document.querySelectorAll('.tech-maintain-col').forEach((el) => el.classList.remove('d-none'));
    }
    if (operator) {
      document.querySelectorAll('.operator-maint-col').forEach((el) => el.classList.remove('d-none'));
    }
    let colspan = 3;
    if (tech) colspan += 1;
    if (operator) colspan += 1;
    if (admin) colspan += 1;
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
        const assignedHint = (d.maintenance_assigned_technician_usernames || []).length
          ? `<div class="text-muted" style="font-size:10px;">KTV: ${escapeHtml(d.maintenance_assigned_technician_usernames.join(', '))}</div>`
          : '';
        const adminActions = admin
          ? `<td class="admin-only text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-primary btn-edit" data-id="${d.id}">Sửa</button>
            <button type="button" class="btn btn-sm btn-outline-danger btn-del" data-id="${d.id}">Xóa</button>
          </td>`
          : '';
        const techCol = tech
          ? `<td class="text-nowrap">${technicianTableActionHtml(d)}</td>`
          : '';
        const operatorCol = operator
          ? `<td class="text-nowrap">${['FAULT', 'INACTIVE'].includes(d.status)
            ? `<button type="button" class="btn btn-sm btn-warning text-dark btn-assign-maintain py-0" data-id="${d.id}" data-name="${escapeHtml(d.name)}" title="Chuyển sang bảo trì và phân công KTV">Bảo trì</button>`
            : (d.status === 'MAINTENANCE' && d.maintenance_pending_operator
              ? `<button type="button" class="btn btn-sm btn-success btn-confirm-maintain py-0" data-id="${d.id}">Xác nhận</button>`
              : '—')}</td>`
          : '';
        return `<tr class="device-row" data-id="${d.id}" style="cursor:pointer;">
        <td>${escapeHtml(d.name)}${assignedHint}</td>
        <td>${escapeHtml(typeLabel)}</td>
        <td>${st}</td>
        ${techCol}
        ${operatorCol}
        ${admin ? adminActions : ''}
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

    if (admin) {
      tbody.querySelectorAll('.admin-only').forEach((el) => el.classList.remove('d-none'));
    }

    tbody.querySelectorAll('.btn-tech-ack').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        window._ackMaintenance(Number(btn.getAttribute('data-id')));
      });
    });

    tbody.querySelectorAll('.btn-tech-complete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        window._reportMaintenanceComplete(Number(btn.getAttribute('data-id')));
      });
    });

    tbody.querySelectorAll('.btn-assign-maintain').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(btn.getAttribute('data-id'));
        window._openAssignMaintenance(id);
      });
    });

    tbody.querySelectorAll('.btn-confirm-maintain').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(btn.getAttribute('data-id'));
        window._confirmMaintenance(id);
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
    if (currentWard) params.set('ward', currentWard);
    if (currentStatus) params.set('status', currentStatus);
    
    const res = await apiFetch(`${API.devices}?${params.toString()}`);
    if (!res.ok) {
      showAppAlert('Không tải được danh sách thiết bị.');
      cachedDevices = [];
      renderDeviceMarkers([]);
      renderTable([]);
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
    renderTable(filterDevicesForMap(cachedDevices));
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
      const deviceType = document.getElementById('device-type')?.value;
      const netFilter = deviceType ? deviceNetworkGroup(deviceType) : null;

      allDevices.forEach(d => {
        if (excludeId && d.id === excludeId) return;
        if (netFilter && deviceNetworkGroup(d.device_type) !== netFilter) return;
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
    document.getElementById('devices-tab')?.click();
    populateParentSelect().then(() => {
      document.getElementById('device-parent').value = '';
    });
    document.getElementById('device-modal-title').textContent = 'Thêm thiết bị';
    document.getElementById('device-id').value = '';
    document.getElementById('device-name').value = '';
    document.getElementById('device-type').value = 'ELECTRIC_POLE';
    document.getElementById('device-status').value = 'ACTIVE';
    document.getElementById('device-ward').value = '';
    document.getElementById('device-address').value = '';
    document.getElementById('device-attributes').value = '';
    document.getElementById('device-lat').value = '';
    document.getElementById('device-lng').value = '';
    document.getElementById('device-active').checked = true;
    updateDeviceCoordHint(false);
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
    document.getElementById('device-ward').value = d.ward ? String(d.ward) : '';
    document.getElementById('device-address').value = d.address || '';
    
    populateParentSelect(d.id).then(() => {
      document.getElementById('device-parent').value = d.parent ? String(d.parent) : '';
    });
    document.getElementById('device-attributes').value = d.attributes ? JSON.stringify(d.attributes, null, 2) : '';
    document.getElementById('device-lat').value = String(d.latitude);
    document.getElementById('device-lng').value = String(d.longitude);
    document.getElementById('device-active').checked = !!d.is_active;
    validateCoordsForSelectedWard(d.latitude, d.longitude, false);
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
      ward: parseInt(document.getElementById('device-ward').value, 10) || null,
      address: document.getElementById('device-address').value.trim(),
      parent: (() => {
        const p = document.getElementById('device-parent').value;
        return p ? parseInt(p, 10) : null;
      })(),
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
    if (Number.isNaN(body.latitude) || body.latitude < -90 || body.latitude > 90
        || Number.isNaN(body.longitude) || body.longitude < -180 || body.longitude > 180) {
      latEl.classList.add('is-invalid');
      lngEl.classList.add('is-invalid');
      hasError = true;
    } else if (!validateCoordsForSelectedWard(body.latitude, body.longitude)) {
      latEl.classList.add('is-invalid');
      lngEl.classList.add('is-invalid');
      hasError = true;
    }
    if (!body.ward) {
      document.getElementById('device-ward')?.classList.add('is-invalid');
      hasError = true;
    }
    
    if (hasError) {
      if (!document.getElementById('modal-alert')?.textContent) {
        showModalAlert('Vui lòng kiểm tra lại các trường bị lỗi.');
      }
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
    showAppAlert(id ? 'Cập nhật thiết bị thành công!' : 'Thêm thiết bị mới thành công!', true);
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
    document.getElementById('edges-tab')?.click();
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

  function technicianOptionLabel(u) {
    const wards = (u.managed_ward_names || u.managed_wards || []).join(', ');
    return wards ? `${u.username} (${wards})` : u.username;
  }

  async function loadTechniciansForMaintenance(wardId = null, { allowFallback = true } = {}) {
    if (!window.WardUtils?.fetchAssignableTechnicians) {
      maintainAssignModalTechs = [];
      return { techs: [], error: 'Thiếu WardUtils.', usedFallback: false };
    }
    let { techs, error } = await WardUtils.fetchAssignableTechnicians(apiFetch, API.users, wardId);
    let usedFallback = false;
    if (!techs.length && !error && wardId != null && allowFallback && isAdmin()) {
      const retry = await WardUtils.fetchAssignableTechnicians(apiFetch, API.users, null);
      if (retry.techs.length) {
        techs = retry.techs;
        usedFallback = true;
        error = null;
      } else if (retry.error) {
        error = retry.error;
      }
    }
    maintainAssignModalTechs = techs;
    return { techs, error, usedFallback };
  }

  function buildMaintainAssignTechCountOptions() {
    const select = document.getElementById('maintain-assign-tech-count');
    const confirmBtn = document.getElementById('btn-confirm-maintain-assign');
    if (!select) return;
    if (!maintainAssignModalTechs.length) {
      select.innerHTML = '<option value="0">—</option>';
      select.disabled = true;
      if (confirmBtn) confirmBtn.disabled = true;
      return;
    }
    select.disabled = false;
    if (confirmBtn) confirmBtn.disabled = false;
    const max = maintainAssignModalTechs.length;
    select.innerHTML = Array.from({ length: max }, (_, i) => {
      const n = i + 1;
      return `<option value="${n}">${n} KTV</option>`;
    }).join('');
  }

  function syncMaintainAssignTechOptions() {
    const pickers = Array.from(document.querySelectorAll('.maintain-assign-tech-picker'));
    const selected = new Set(pickers.map((p) => p.value).filter(Boolean));
    pickers.forEach((picker) => {
      const current = picker.value;
      picker.querySelectorAll('option').forEach((opt) => {
        if (!opt.value) return;
        opt.disabled = selected.has(opt.value) && opt.value !== current;
      });
    });
  }

  function renderMaintainAssignTechSlots(count = 1, emptyMessage = '') {
    const container = document.getElementById('maintain-assign-tech-slots');
    if (!container) return;
    if (!maintainAssignModalTechs.length) {
      container.innerHTML = `<p class="text-muted small mb-0">${emptyMessage || 'Không có KTV được phân quyền phường/xã này. Admin cần gán phường/xã cho KTV tại trang <strong>Tài khoản</strong>.'}</p>`;
      return;
    }
    const max = maintainAssignModalTechs.length;
    const slotCount = Math.min(Math.max(1, count), max);
    const countSelect = document.getElementById('maintain-assign-tech-count');
    if (countSelect) countSelect.value = String(slotCount);
    container.innerHTML = Array.from({ length: slotCount }, (_, i) => {
      const options = maintainAssignModalTechs.map((u) =>
        `<option value="${u.id}">${technicianOptionLabel(u)}</option>`
      ).join('');
      return `<div class="mb-2">
        <label class="form-label small mb-1">KTV ${i + 1}</label>
        <select class="form-select form-select-sm maintain-assign-tech-picker" data-slot="${i}">
          <option value="">-- Chọn kỹ thuật viên --</option>${options}
        </select>
      </div>`;
    }).join('');
    container.querySelectorAll('.maintain-assign-tech-picker').forEach((sel) => {
      sel.addEventListener('change', syncMaintainAssignTechOptions);
    });
  }

  window._openAssignMaintenance = async function(deviceId) {
    if (map) map.closePopup();
    const device = cachedDevices.find((d) => d.id === deviceId);
    if (!device) return;

    const alertEl = document.getElementById('maintain-assign-alert');
    if (alertEl) alertEl.classList.add('d-none');

    document.getElementById('maintain-assign-device-id').value = String(deviceId);
    document.getElementById('maintain-assign-device-label').textContent =
      `Thiết bị: ${device.name} (${device.code}) — ${device.status_display || device.status}`;
    document.getElementById('maintain-assign-note').value = '';

    const hintEl = document.getElementById('maintain-assign-ward-hint');
    if (hintEl) {
      if (device.ward_name) {
        hintEl.textContent = `Phường/Xã thiết bị: ${device.ward_name}${device.ward_district ? ` (${device.ward_district})` : ''}. Chỉ hiển thị KTV được phân quyền đúng phường/xã này.`;
        hintEl.classList.remove('d-none', 'alert-warning');
        hintEl.classList.add('alert-info');
      } else {
        hintEl.textContent = 'Thiết bị chưa gán phường/xã — hiển thị mọi KTV trong phạm vi vận hành của bạn.';
        hintEl.classList.remove('d-none', 'alert-info');
        hintEl.classList.add('alert-warning');
      }
    }

    const wardId = WardUtils.resolveWardId(device);
    const loadResult = await loadTechniciansForMaintenance(wardId);
    if (loadResult.error) {
      if (alertEl) {
        alertEl.textContent = loadResult.error;
        alertEl.className = 'alert alert-danger py-2 small';
        alertEl.classList.remove('d-none');
      }
    } else if (loadResult.usedFallback && hintEl) {
      hintEl.textContent = 'Không có KTV đúng phường/xã thiết bị — đang hiển thị toàn bộ KTV. Kiểm tra lại phường/xã trên thiết bị và tài khoản KTV.';
      hintEl.classList.remove('d-none', 'alert-info');
      hintEl.classList.add('alert-warning');
    }
    buildMaintainAssignTechCountOptions();
    renderMaintainAssignTechSlots(1, loadResult.error ? loadResult.error : '');
    maintainAssignModal?.show();
  };

  async function submitMaintainAssign() {
    const alertEl = document.getElementById('maintain-assign-alert');
    if (alertEl) alertEl.classList.add('d-none');

    const deviceId = document.getElementById('maintain-assign-device-id')?.value;
    const expectedCount = parseInt(document.getElementById('maintain-assign-tech-count')?.value || '1', 10);
    const techIds = Array.from(document.querySelectorAll('.maintain-assign-tech-picker'))
      .map((sel) => sel.value)
      .filter(Boolean)
      .map((v) => parseInt(v, 10));

    if (!deviceId || !techIds.length) {
      if (alertEl) {
        alertEl.textContent = 'Vui lòng chọn ít nhất một kỹ thuật viên.';
        alertEl.className = 'alert alert-danger py-2 small';
        alertEl.classList.remove('d-none');
      }
      return;
    }
    if (techIds.length !== expectedCount) {
      if (alertEl) {
        alertEl.textContent = `Cần chọn đúng ${expectedCount} kỹ thuật viên.`;
        alertEl.className = 'alert alert-danger py-2 small';
        alertEl.classList.remove('d-none');
      }
      return;
    }

    const note = document.getElementById('maintain-assign-note')?.value.trim() || '';
    const res = await apiFetch(`${API.devices}${deviceId}/assign-maintenance/`, {
      method: 'PATCH',
      body: JSON.stringify({
        assigned_technicians: techIds,
        technician_count: expectedCount,
        note,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      maintainAssignModal?.hide();
      showAppAlert('Phân công bảo trì thành công!', true);
      refreshMap();
    } else if (alertEl) {
      alertEl.textContent = data.detail || formatErrors(data);
      alertEl.className = 'alert alert-danger py-2 small';
      alertEl.classList.remove('d-none');
    } else {
      showAppAlert(data.detail || 'Phân công thất bại.');
    }
  }

  async function submitMaintainStatus() {
    const alertEl = document.getElementById('maintain-status-alert');
    if (alertEl) alertEl.classList.add('d-none');

    const targetType = document.getElementById('maintain-target-type').value;
    const targetId = document.getElementById('maintain-target-id').value;
    const newStatus = document.getElementById('maintain-new-status').value;
    const note = document.getElementById('maintain-note').value.trim();
    if (!targetId || !newStatus) return;

    const base = targetType === 'EDGE' ? API.edges : API.devices;
    const res = await apiFetch(`${base}${targetId}/update-status/`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus, note }),
    });
    if (res.ok) {
      maintainStatusModal?.hide();
      if (map) map.closePopup();
      showAppAlert('Cập nhật trạng thái bảo trì thành công!', true);
      refreshMap();
    } else {
      const d = await res.json().catch(() => ({}));
      const msg = d.detail || formatErrors(d);
      if (alertEl) {
        alertEl.textContent = msg;
        alertEl.className = 'alert alert-danger py-2 small';
        alertEl.classList.remove('d-none');
      } else {
        showAppAlert(msg);
      }
    }
  }

  window._openMaintainStatusModal = function(targetType, targetId, currentStatus, label) {
    if (isTechnician() && targetType === 'DEVICE') {
      showAppAlert('KTV không tự chuyển trạng thái hoạt động. Hãy dùng "Báo bảo trì xong & gửi vận hành".');
      return;
    }
    if (map) map.closePopup();
    document.getElementById('maintain-target-type').value = targetType;
    document.getElementById('maintain-target-id').value = String(targetId);
    document.getElementById('maintain-target-label').textContent =
      `${targetType === 'EDGE' ? 'Tuyến' : 'Thiết bị'}: ${label || '#' + targetId}`;
    const sel = document.getElementById('maintain-new-status');
    if (sel) {
      if (currentStatus === 'FAULT' || currentStatus === 'INACTIVE') {
        sel.value = 'MAINTENANCE';
      } else if (currentStatus === 'MAINTENANCE') {
        sel.value = 'ACTIVE';
      }
    }
    document.getElementById('maintain-note').value = '';
    const alertEl = document.getElementById('maintain-status-alert');
    if (alertEl) alertEl.classList.add('d-none');
    maintainStatusModal?.show();
  };

  window._quickMaintainStatus = async function(targetType, targetId, newStatus, label) {
    if (isTechnician() && targetType === 'DEVICE') {
      if (newStatus === 'ACTIVE') {
        showAppAlert('KTV không được tự chuyển thiết bị sang hoạt động. Hãy "Báo bảo trì xong & gửi vận hành".');
        return;
      }
      if (newStatus === 'MAINTENANCE') {
        showAppAlert('Thiết bị đã do vận hành chuyển sang bảo trì. Hãy xác nhận công việc trước.');
        return;
      }
    }
    if (!confirm(`Xác nhận chuyển "${label || targetId}" sang trạng thái ${newStatus}?`)) return;
    document.getElementById('maintain-target-type').value = targetType;
    document.getElementById('maintain-target-id').value = String(targetId);
    document.getElementById('maintain-new-status').value = newStatus;
    document.getElementById('maintain-note').value = '';
    await submitMaintainStatus();
  };

  window._ackMaintenance = async function(deviceId) {
    const res = await apiFetch(`${API.devices}${deviceId}/acknowledge-maintenance/`, { method: 'PATCH', body: '{}' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      if (map) map.closePopup();
      showAppAlert('Đã xác nhận công việc bảo trì!', true);
      refreshMap();
    } else {
      showAppAlert(data.detail || 'Không xác nhận được công việc.');
    }
  };

  window._reportMaintenanceComplete = async function(deviceId) {
    const note = prompt('Nhập ghi chú kết quả bảo trì (bắt buộc). Thiết bị vẫn ở trạng thái bảo trì cho đến khi vận hành xác nhận:');
    if (note === null) return;
    if (!note.trim()) {
      showAppAlert('Ghi chú kết quả bảo trì là bắt buộc.');
      return;
    }
    const res = await apiFetch(`${API.devices}${deviceId}/report-maintenance-complete/`, {
      method: 'PATCH',
      body: JSON.stringify({ note: note.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      if (map) map.closePopup();
      showAppAlert('Đã báo bảo trì xong — chờ vận hành xác nhận hoạt động bình thường!', true);
      refreshMap();
    } else {
      showAppAlert(data.detail || 'Không gửi được kết quả bảo trì.');
    }
  };

  window._confirmMaintenance = async function(deviceId) {
    if (!confirm('Xác nhận hoàn thành bảo trì và chuyển thiết bị về trạng thái hoạt động?')) return;
    const res = await apiFetch(`${API.devices}${deviceId}/confirm-maintenance/`, { method: 'PATCH', body: '{}' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      if (map) map.closePopup();
      showAppAlert('Đã xác nhận hoàn thành bảo trì!', true);
      refreshMap();
    } else {
      showAppAlert(data.detail || 'Không xác nhận được hoàn thành bảo trì.');
    }
  };

  window._triggerReport = function(targetType, targetId, lat, lng, defaultType, targetName, wardId = null, address = '') {
    if (!canReportIncident()) return;
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
    if (wardId) document.getElementById('report-ward').value = String(wardId);
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
      ward: parseInt(document.getElementById('report-ward').value, 10),
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
    if (!body.ward) {
      document.getElementById('report-ward')?.classList.add('is-invalid');
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
      const params = new URLSearchParams();
      if (currentWard) params.set('ward', currentWard);
      const url = params.toString() ? `${API.incidents}?${params.toString()}` : API.incidents;
      const res = await apiFetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const incidents = data.results ?? data;
      if (incidentLayer) incidentLayer.clearLayers();
      else { incidentLayer = L.layerGroup().addTo(map); }
      const SCOLOR = { PENDING_VERIFY: '#ef4444', CONFIRMED: '#ea580c', ASSIGNED: '#f59e0b', IN_PROGRESS: '#0ea5e9', RESOLVED: '#22c55e', CLOSED: '#94a3b8', REJECTED: '#64748b' };
      incidents.forEach(inc => {
        if (['CLOSED', 'RESOLVED', 'REJECTED'].includes(inc.status)) return;
        if (currentWard && String(inc.ward) !== String(currentWard)) return;
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

  function relayoutMap() {
    if (map) {
      setTimeout(() => map.invalidateSize(), 50);
    }
  }

  function setupNav() {
    if (window.StaffNav) StaffNav.initNavUser();
    relayoutMap();
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;
    const role = localStorage.getItem(STORAGE.role) || '';
    if (role === 'CITIZEN') {
      window.location.href = '/lookup/';
      return;
    }
    setupNav();
    setupAdminToolbar();
    initMap();
    relayoutMap();
    window.addEventListener('resize', relayoutMap);

    WardUtils.fetchWards(apiFetch).then(async (wards) => {
      const role = getRole();
      if (role === 'OPERATOR' || role === 'TECHNICIAN') {
        try {
          const profileRes = await apiFetch('/api/auth/profile/');
          if (profileRes.ok) {
            const profile = await profileRes.json();
            const allowed = new Set((profile.managed_ward_ids || []).map(String));
            if (allowed.size) {
              wards = wards.filter((w) => allowed.has(String(w.id)));
            }
          }
        } catch (_) { /* giữ danh sách mặc định */ }
      }
      cachedWards = wards;
      WardUtils.populateWardSelect(document.getElementById('device-ward'), wards);
      WardUtils.populateWardSelect(document.getElementById('report-ward'), wards);
      WardUtils.populateWardSelect(document.getElementById('filter-ward'), wards, {
        placeholder: 'Tất cả phường/xã',
      });
      document.getElementById('device-ward')?.addEventListener('change', (e) => {
        const opt = e.target.selectedOptions[0];
        if (opt?.dataset.lat) {
          document.getElementById('device-lat').value = parseFloat(opt.dataset.lat).toFixed(6);
          document.getElementById('device-lng').value = parseFloat(opt.dataset.lng).toFixed(6);
          if (map) map.flyTo([parseFloat(opt.dataset.lat), parseFloat(opt.dataset.lng)], 15);
        }
        const lat = parseFloat(document.getElementById('device-lat')?.value);
        const lng = parseFloat(document.getElementById('device-lng')?.value);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
          validateCoordsForSelectedWard(lat, lng, false);
        } else {
          updateDeviceCoordHint(false);
        }
      });
      document.getElementById('device-type')?.addEventListener('change', () => {
        const devId = document.getElementById('device-id')?.value;
        populateParentSelect(devId ? parseInt(devId, 10) : null);
      });
      document.getElementById('report-ward')?.addEventListener('change', (e) => {
        const opt = e.target.selectedOptions[0];
        if (opt?.dataset.lat && map) {
          map.flyTo([parseFloat(opt.dataset.lat), parseFloat(opt.dataset.lng)], 15);
        }
      });
    }).catch(() => showAppAlert('Không tải danh mục phường/xã.'));

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
    const maintainEl = document.getElementById('maintain-status-modal');
    if (maintainEl) maintainStatusModal = new bootstrap.Modal(maintainEl);
    const maintainAssignEl = document.getElementById('maintain-assign-modal');
    if (maintainAssignEl) maintainAssignModal = new bootstrap.Modal(maintainAssignEl);
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
    document.getElementById('btn-maintain-save')?.addEventListener('click', () => submitMaintainStatus());
    document.getElementById('btn-confirm-maintain-assign')?.addEventListener('click', () => submitMaintainAssign());
    document.getElementById('maintain-assign-tech-count')?.addEventListener('change', (e) => {
      renderMaintainAssignTechSlots(parseInt(e.target.value, 10) || 1);
    });
    
    // Import / Export Excel
    const btnExport = document.getElementById('btn-export-excel');
    const btnImport = document.getElementById('btn-import-csv');
    const fileImport = document.getElementById('file-import-csv');
    
    if (btnExport) {
      btnExport.addEventListener('click', async () => {
        const token = getAccess();
        try {
          const res = await fetch(`${API.devices}export-excel/`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!res.ok) {
            showAppAlert('Lỗi khi xuất Excel');
            return;
          }
          const blob = await res.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const cd = res.headers.get('Content-Disposition') || '';
          const match = cd.match(/filename="([^"]+)"/);
          a.download = match ? match[1] : 'bao_cao_thiet_bi.xlsx';
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
    const wardFilterEl = document.getElementById('filter-ward');
    if (wardFilterEl) {
      wardFilterEl.addEventListener('change', async (e) => {
        currentWard = e.target.value;
        currentPage = 1;
        await refreshMap();
        focusMapOnWardFilter();
        loadIncidentMarkers();
      });
    }
    const statusFilterEl = document.getElementById('filter-device-status');
    if (statusFilterEl) {
      statusFilterEl.addEventListener('change', (e) => {
        currentStatus = e.target.value;
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
      relayoutMap();
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
