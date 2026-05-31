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

  let reportMap, reportMarker;
  let reportWards = [];

  const reportMarkerIcon = L.divIcon({
    className: '',
    html: '<div style="background:#ef4444;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>',
    iconAnchor: [8, 8],
  });

  function updateReportCoordHint(result) {
    const el = document.getElementById('report-coord-hint');
    if (!el) return;
    if (result?.ok && result.selected) {
      el.className = 'form-text small text-success mt-1 mb-0';
      el.innerHTML = `<i class="bi bi-check-circle"></i> Tọa độ khớp <strong>${result.selected.name}</strong>`;
      return;
    }
    el.className = 'form-text small text-primary mt-1 mb-0';
    el.innerHTML = '<i class="bi bi-info-circle"></i> Chọn <strong>phường/xã</strong> trước, sau đó click trên bản đồ (tọa độ phải khớp phường/xã).';
  }

  function clearReportMarker() {
    if (reportMarker && reportMap) {
      reportMap.removeLayer(reportMarker);
      reportMarker = null;
    }
  }

  function setReportMarker(lat, lng) {
    if (!reportMap) return;
    clearReportMarker();
    reportMarker = L.marker([lat, lng], { icon: reportMarkerIcon }).addTo(reportMap);
  }

  function validateReportCoords(lat, lng, showAlertMsg = false) {
    const wardId = document.getElementById('report-ward')?.value;
    const result = WardUtils.validateCoordsForWard(reportWards, wardId, lat, lng);
    updateReportCoordHint(result);
    if (!result.ok && showAlertMsg) showAlert(result.message);
    return result.ok;
  }

  function readReportCoords() {
    const lat = parseFloat(document.getElementById('report-lat')?.value);
    const lng = parseFloat(document.getElementById('report-lng')?.value);
    return { lat, lng, valid: !Number.isNaN(lat) && !Number.isNaN(lng) };
  }

  function initMap() {
    let defaultLat = 16.0544; // Đà Nẵng
    let defaultLng = 108.2022;
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
      setReportMarker(defaultLat, defaultLng);
    }

    reportMap.on('click', (e) => {
      const { lat, lng } = e.latlng;
      if (!validateReportCoords(lat, lng, true)) return;
      document.getElementById('report-lat').value = lat.toFixed(6);
      document.getElementById('report-lng').value = lng.toFixed(6);
      setReportMarker(lat, lng);
    });

    document.getElementById('report-ward')?.addEventListener('change', (e) => {
      const opt = e.target.selectedOptions[0];
      if (opt?.dataset.lat && reportMap) {
        reportMap.flyTo([parseFloat(opt.dataset.lat), parseFloat(opt.dataset.lng)], 15, { duration: 1.5 });
      }
      const { lat, lng, valid } = readReportCoords();
      if (valid) {
        if (!validateReportCoords(lat, lng, true)) {
          document.getElementById('report-lat').value = '';
          document.getElementById('report-lng').value = '';
          clearReportMarker();
        }
      } else {
        updateReportCoordHint(null);
      }
    });

    ['report-lat', 'report-lng'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => {
        const { lat, lng, valid } = readReportCoords();
        if (!valid) {
          clearReportMarker();
          updateReportCoordHint(null);
          return;
        }
        if (validateReportCoords(lat, lng, true)) {
          setReportMarker(lat, lng);
        } else {
          clearReportMarker();
        }
      });
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
    
    document.getElementById('detail-assignee').textContent = (() => {
      const names = inc.assigned_technician_usernames?.length
        ? inc.assigned_technician_usernames
        : (inc.assigned_to_username ? [inc.assigned_to_username] : []);
      return names.length ? names.map((n) => `@${n}`).join(', ') : 'Chưa phân công';
    })();
    
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
    
    // Update the count badge
    const countEl = document.getElementById('my-incidents-count');
    if (countEl) {
      countEl.textContent = `${incidents.length} sự cố`;
    }

    const el = document.getElementById('my-incidents-list');
    if (!el) return;

    if (!incidents.length) {
      el.innerHTML = '<div class="text-center text-muted py-5 small"><i class="bi bi-info-circle me-1 fs-5"></i> Bạn chưa báo cáo sự cố nào.</div>';
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
    
    const SEVERITY_ICON = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🔴', CRITICAL: '🚨' };
    const TYPE_ICON = { ELECTRIC: '⚡ Điện', WATER: '💧 Nước', OTHER: '🔧 Khác' };

    el.innerHTML = `
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0" style="font-size: 13.5px;">
          <thead class="table-light">
            <tr>
              <th scope="col" class="ps-3 py-3">Tiêu đề sự cố</th>
              <th scope="col" class="text-center py-3">Loại sự cố</th>
              <th scope="col" class="text-center py-3">Mức độ</th>
              <th scope="col" class="text-center py-3">Trạng thái</th>
              <th scope="col" class="text-center py-3">Khu vực</th>
              <th scope="col" class="text-center py-3">Ngày báo cáo</th>
              <th scope="col" class="text-center py-3">Hành động</th>
            </tr>
          </thead>
          <tbody>
            ${incidents.map(inc => {
              const statusCol = STATUS_COLOR[inc.status] || 'secondary';
              const sev = inc.severity || 'MEDIUM';
              return `
                <tr class="my-incident-item" data-id="${inc.id}" style="cursor: pointer;">
                  <td class="ps-3 fw-semibold text-dark">${inc.title}</td>
                  <td class="text-center">${TYPE_ICON[inc.incident_type] || inc.type_display || '🔧 Khác'}</td>
                  <td class="text-center">
                    <span class="badge bg-light text-dark border px-2 py-1 rounded-pill" style="font-size: 11.5px; font-weight: 500;">
                      ${SEVERITY_ICON[sev] || ''} ${inc.severity_display || sev}
                    </span>
                  </td>
                  <td class="text-center">
                    <span class="badge bg-${statusCol} bg-opacity-10 text-${statusCol} border border-${statusCol} border-opacity-25 rounded-pill px-2.5 py-1" style="font-size: 11.5px; font-weight: 600;">
                      ${inc.status_display}
                    </span>
                  </td>
                  <td class="text-center text-secondary">${inc.ward_name || inc.area || '—'}</td>
                  <td class="text-center text-muted small">${new Date(inc.created_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td class="text-center">
                    <button class="btn btn-sm btn-outline-primary px-3 py-1 rounded-pill fw-semibold" style="font-size: 12px;">
                      <i class="bi bi-eye"></i> Xem
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

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
    const ward = parseInt(document.getElementById('report-ward').value, 10);
    const address = document.getElementById('report-address').value.trim();

    if (!title || !desc) { showAlert('Vui lòng nhập tiêu đề và mô tả.'); return; }
    if (!ward) { showAlert('Vui lòng chọn phường/xã.'); return; }
    if (isNaN(lat) || isNaN(lng)) { showAlert('Vui lòng chọn vị trí trên bản đồ.'); return; }
    if (!validateReportCoords(lat, lng, true)) return;

    const body = {
      title,
      description: desc,
      incident_type: document.getElementById('report-type').value,
      severity: document.getElementById('report-severity').value,
      latitude: lat,
      longitude: lng,
      device: document.getElementById('report-device').value || null,
      edge: (targetTypeParam === 'EDGE' && edgeIdParam) ? parseInt(edgeIdParam) : null,
      target_type: targetTypeParam || (document.getElementById('report-device').value ? 'DEVICE' : 'UNKNOWN'),
      ward,
      address
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
        clearReportMarker();
        updateReportCoordHint(null);
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

  // Fix Leaflet map sizing when returning to reporting tab
  document.getElementById('new-report-tab')?.addEventListener('shown.bs.tab', () => {
    if (reportMap) {
      reportMap.invalidateSize();
    }
  });

  setupNav();
  initMap();
  WardUtils.fetchWards(apiFetch).then((wards) => {
    reportWards = wards;
    WardUtils.populateWardSelect(document.getElementById('report-ward'), wards);
    const { lat, lng, valid } = readReportCoords();
    if (valid && !validateReportCoords(lat, lng, false)) {
      document.getElementById('report-lat').value = '';
      document.getElementById('report-lng').value = '';
      clearReportMarker();
    }
  }).catch(() => showAlert('Không tải danh mục phường/xã.'));
  prefillIncidentType();
  loadDevices().then(() => {
    handleEdgeSelection();
  });
  loadMyIncidents();
  pollNotifBadge();
  setInterval(pollNotifBadge, 30000);
})();
