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
    consumptions: '/api/consumptions/',
  };

  function getAccess() { return localStorage.getItem(STORAGE.access); }
  function clearAuth() {
    localStorage.removeItem(STORAGE.access);
    localStorage.removeItem(STORAGE.refresh);
    localStorage.removeItem(STORAGE.role);
    localStorage.removeItem(STORAGE.username);
  }
  function isAdminOrOperator() {
    const role = localStorage.getItem(STORAGE.role);
    return role === 'ADMIN' || role === 'OPERATOR';
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

  function showAlert(msg, isSuccess = false) {
    const el = document.getElementById('app-alert');
    if (!el) return;
    
    // Icon mapping using Bootstrap Icons
    const icon = isSuccess 
      ? '<i class="bi bi-check-circle-fill text-success fs-5"></i>' 
      : '<i class="bi bi-exclamation-triangle-fill text-danger fs-5"></i>';
      
    el.innerHTML = `${icon} <div class="fw-semibold small">${msg}</div>`;
    
    el.className = `alert ${isSuccess ? 'alert-success-premium' : 'alert-danger-premium'}`;
    el.classList.remove('d-none');
    el.style.animation = 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    
    if (el.timeoutId) clearTimeout(el.timeoutId);
    
    el.timeoutId = setTimeout(() => {
      el.style.animation = 'slideOutRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
      setTimeout(() => {
        el.classList.add('d-none');
        el.style.animation = '';
      }, 300);
    }, 4000);
  }

  let chartInstance = null;

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
    VALVE: 'Van nước (cũ)',
  };

  async function loadConsumptions() {
    const tbody = document.getElementById('monitoring-table-body');
    const admin = isAdmin();
    
    const groupAreaChk = document.getElementById('filter-group-area');
    const byArea = groupAreaChk ? groupAreaChk.checked : false;
    
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="${admin && !byArea ? 4 : 3}" class="text-center py-5">
        <div class="spinner-border spinner-border-sm text-primary" role="status"></div><span class="ms-2">Đang tải...</span>
      </td></tr>`;
    }

    try {
      const deviceCodeInput = document.getElementById('filter-device-code');
      const deviceCode = deviceCodeInput ? deviceCodeInput.value.trim() : '';
      const deviceTypeSel = document.getElementById('filter-device-type');
      const deviceType = deviceTypeSel ? deviceTypeSel.value : '';
      const startInput = document.getElementById('filter-start');
      const startMonth = startInput ? startInput.value : '';
      const endInput = document.getElementById('filter-end');
      const endMonth = endInput ? endInput.value : '';

      const params = new URLSearchParams();
      if (deviceCode && !byArea) params.append('device_code', deviceCode);
      if (deviceType) params.append('device_type', deviceType);
      if (startMonth) params.append('start_date', startMonth + '-01');
      if (endMonth) params.append('end_date', endMonth + '-01');
      params.append('page_size', '10000');

      const url = byArea ? `${API.consumptions}by-area/?${params.toString()}` : `${API.consumptions}?${params.toString()}`;
      const res = await apiFetch(url);
      if (!res.ok) {
        showAlert('Lỗi khi tải dữ liệu tiêu thụ');
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="${admin && !byArea ? 4 : 3}" class="text-muted py-4 text-center">Lỗi khi tải dữ liệu tiêu thụ</td></tr>`;
        }
        return;
      }
      const data = await res.json();
      const listData = data.results !== undefined ? data.results : data;
      renderTable(listData, byArea, deviceType);
      try {
        renderChart(listData, byArea, deviceType);
      } catch (chartErr) {
        console.error('Error rendering chart:', chartErr);
      }
    } catch (err) {
      console.error('Error in loadConsumptions:', err);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="${admin && !byArea ? 4 : 3}" class="text-danger py-4 text-center">Đã xảy ra lỗi khi tải dữ liệu</td></tr>`;
      }
    }
  }

  function renderTable(data, byArea = false, deviceType = '') {
    const tbody = document.getElementById('monitoring-table-body');
    if (!tbody) return;
    const admin = isAdmin();
    
    const thDevice = tbody.closest('table').querySelector('thead th:first-child');
    if (thDevice) thDevice.textContent = byArea ? 'Khu vực' : 'Thiết bị';

    const thAction = tbody.closest('table').querySelector('thead th:nth-child(4)');
    if (thAction) {
      if (byArea) thAction.classList.add('d-none');
      else if (admin) thAction.classList.remove('d-none');
    }

    if (!data || !data.length) {
      tbody.innerHTML = `<tr><td colspan="${admin && !byArea ? 4 : 3}" class="text-muted py-4">Không có dữ liệu tiêu thụ phù hợp với bộ lọc</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(row => {
      const parts = row.date.split('-');
      const formattedMonth = parts.length >= 2 ? `Tháng ${parts[1]}/${parts[0]}` : row.date;

      if (byArea) {
        const unit = deviceType === 'WATER_METER' ? 'm³' : deviceType === 'ELECTRIC_METER' ? 'kWh' : 'đơn vị';
        return `
          <tr>
            <td><strong>${row.area || 'Không có khu vực'}</strong></td>
            <td>${formattedMonth}</td>
            <td><strong>${row.value}</strong> ${unit}</td>
          </tr>
        `;
      }

      const actions = admin ? `
        <td class="admin-only">
          <button class="btn btn-sm btn-outline-danger btn-del" data-id="${row.id}">Xóa</button>
        </td>` : '';

      return `
        <tr>
          <td>${row.device_name || 'Không rõ'} (${row.device_type === 'WATER_METER' ? 'Nước' : 'Điện'})</td>
          <td>${formattedMonth}</td>
          <td><strong>${row.value}</strong> ${row.device_type === 'WATER_METER' ? 'm³' : 'kWh'}</td>
          ${actions}
        </tr>
      `;
    }).join('');

    if (!byArea) {
      tbody.querySelectorAll('.btn-del').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          if (!confirm('Bạn có chắc muốn xóa bản ghi này?')) return;
          const id = btn.getAttribute('data-id');
          try {
            const res = await apiFetch(`${API.consumptions}${id}/`, { method: 'DELETE' });
            if (res.ok) {
              showAlert('Xóa bản ghi thành công', true);
              loadConsumptions();
            } else {
              showAlert('Lỗi khi xóa bản ghi');
            }
          } catch (err) {
            console.error(err);
            showAlert('Lỗi hệ thống khi xóa bản ghi');
          }
        });
      });
    }
  }

  function renderChart(data, byArea = false, deviceType = '') {
    const ctx = document.getElementById('consumptionChart');
    if (!ctx) return;

    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    if (typeof Chart === 'undefined') {
      console.warn('Chart.js library is not available. Skipping chart render.');
      return;
    }

    if (!data || !data.length) {
      return;
    }

    if (byArea) {
      // Group by unique area
      const uniqueDates = Array.from(new Set(data.map(row => row.date))).sort();
      const labels = uniqueDates.map(dateStr => {
        const parts = dateStr.split('-');
        return parts.length >= 2 ? `T${parts[1]}/${parts[0]}` : dateStr;
      });

      const uniqueAreas = Array.from(new Set(data.map(row => row.area)));
      const areaColors = ['#fd7e14', '#0ea5e9', '#10b981', '#a855f7', '#ec4899', '#3b82f6', '#20c997', '#6f42c1'];

      const datasets = uniqueAreas.map((area, idx) => {
        const color = areaColors[idx % areaColors.length];
        
        const valuesForDates = uniqueDates.map(d => {
          const matchedRow = data.find(row => row.area === area && row.date === d);
          return matchedRow ? matchedRow.value : 0;
        });

        const unit = deviceType === 'WATER_METER' ? ' (m³)' : deviceType === 'ELECTRIC_METER' ? ' (kWh)' : '';

        return {
          label: area + unit,
          data: valuesForDates,
          backgroundColor: color,
          borderColor: color,
          borderWidth: 1,
          borderRadius: 4,
          maxBarThickness: 35
        };
      });

      chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { 
              display: true,
              position: 'top',
              labels: { font: { family: 'Inter', size: 11 } }
            },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              titleFont: { family: 'Inter', size: 12 },
              bodyFont: { family: 'Inter', size: 13, weight: 'bold' }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { borderDash: [4, 4], color: '#e2e8f0' },
              border: { display: false }
            },
            x: {
              grid: { display: false },
              border: { display: false }
            }
          }
        }
      });
      return;
    }

    // Normalize date to YYYY-MM-01 client-side for aggregation
    const normalizedData = data.map(row => {
      let normDate = row.date;
      if (normDate && normDate.includes('-')) {
        const parts = normDate.split('-');
        if (parts.length >= 2) {
          normDate = `${parts[0]}-${parts[1]}-01`;
        }
      }
      return {
        ...row,
        normalizedDate: normDate
      };
    });

    // Aggregate by normalized date and device_type
    const aggElec = {};
    const aggWater = {};
    let hasElec = false;
    let hasWater = false;

    normalizedData.forEach(row => {
      const dKey = row.normalizedDate;
      if (row.device_type === 'ELECTRIC_METER') {
        aggElec[dKey] = (aggElec[dKey] || 0) + row.value;
        hasElec = true;
      } else if (row.device_type === 'WATER_METER') {
        aggWater[dKey] = (aggWater[dKey] || 0) + row.value;
        hasWater = true;
      } else {
        const nameLower = (row.device_name || '').toLowerCase();
        if (nameLower.includes('nước') || nameLower.includes('water')) {
          aggWater[dKey] = (aggWater[dKey] || 0) + row.value;
          hasWater = true;
        } else {
          aggElec[dKey] = (aggElec[dKey] || 0) + row.value;
          hasElec = true;
        }
      }
    });

    const uniqueDates = Array.from(new Set(normalizedData.map(row => row.normalizedDate))).sort();
    const labels = uniqueDates.map(dateStr => {
      const parts = dateStr.split('-');
      return parts.length >= 2 ? `T${parts[1]}/${parts[0]}` : dateStr;
    });

    const datasets = [];

    if (hasElec) {
      const elecCtx = ctx.getContext('2d');
      const gradientElec = elecCtx.createLinearGradient(0, 0, 0, 300);
      gradientElec.addColorStop(0, 'rgba(245, 158, 11, 0.8)'); // Amber
      gradientElec.addColorStop(1, 'rgba(245, 158, 11, 0.2)');

      datasets.push({
        label: 'Điện tiêu thụ (kWh)',
        data: uniqueDates.map(d => aggElec[d] !== undefined ? parseFloat(aggElec[d].toFixed(2)) : 0),
        backgroundColor: gradientElec,
        borderColor: '#f59e0b',
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
        yAxisID: 'y', // Left axis
      });
    }

    if (hasWater) {
      const waterCtx = ctx.getContext('2d');
      const gradientWater = waterCtx.createLinearGradient(0, 0, 0, 300);
      gradientWater.addColorStop(0, 'rgba(14, 165, 233, 0.8)'); // Sky Blue
      gradientWater.addColorStop(1, 'rgba(14, 165, 233, 0.2)');

      datasets.push({
        label: 'Nước tiêu thụ (m³)',
        data: uniqueDates.map(d => aggWater[d] !== undefined ? parseFloat(aggWater[d].toFixed(2)) : 0),
        backgroundColor: gradientWater,
        borderColor: '#0ea5e9',
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
        yAxisID: 'y1', // Right axis
      });
    }

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { 
            display: datasets.length > 0,
            position: 'top',
            labels: {
              font: { family: 'Inter', size: 12 }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleFont: { family: 'Inter', size: 13 },
            bodyFont: { family: 'Inter', size: 14, weight: 'bold' },
            padding: 10,
            cornerRadius: 8,
            displayColors: true,
          }
        },
        scales: {
          y: { 
            type: 'linear',
            display: hasElec,
            position: 'left',
            beginAtZero: true,
            grid: { borderDash: [4, 4], color: '#e2e8f0' },
            border: { display: false },
            title: {
              display: true,
              text: 'Điện tiêu thụ (kWh)',
              font: { family: 'Inter', size: 11, weight: 'bold' }
            }
          },
          y1: {
            type: 'linear',
            display: hasWater,
            position: 'right',
            beginAtZero: true,
            grid: { drawOnChartArea: false }, // avoid grid lines overlapping
            border: { display: false },
            title: {
              display: true,
              text: 'Nước tiêu thụ (m³)',
              font: { family: 'Inter', size: 11, weight: 'bold' }
            }
          },
          x: {
            grid: { display: false },
            border: { display: false }
          }
        }
      }
    });
  }

  async function handleInputSubmit(e) {
    e.preventDefault();
    try {
      const valInput = document.getElementById('input-value');
      const codeInput = document.getElementById('input-device-code');
      const dateInput = document.getElementById('input-date');
      
      valInput.classList.remove('is-invalid');
      codeInput.classList.remove('is-invalid');
      
      const deviceCode = codeInput.value.trim();
      const value = parseFloat(valInput.value);
      const monthVal = dateInput.value;
      
      if (value < 0) {
        valInput.classList.add('is-invalid');
        return;
      }

      // Lookup device ID by unique code
      const devRes = await apiFetch(`${API.devices}?code=${encodeURIComponent(deviceCode)}`);
      if (!devRes.ok) {
        showAlert('Lỗi khi kiểm tra thiết bị');
        return;
      }
      const devData = await devRes.json();
      let devices = devData.results !== undefined ? devData.results : devData;

      // Fallback: If not found by exact code, try searching by device name
      if (!devices || devices.length === 0) {
        const searchRes = await apiFetch(`${API.devices}?search=${encodeURIComponent(deviceCode)}`);
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const found = searchData.results !== undefined ? searchData.results : searchData;
          if (found && found.length > 0) {
            // Try to find an exact case-insensitive name match, or fall back to the first match
            const exact = found.find(d => 
              d.name.toLowerCase() === deviceCode.toLowerCase() || 
              d.code.toLowerCase() === deviceCode.toLowerCase()
            );
            devices = exact ? [exact] : [found[0]];
          }
        }
      }
      
      if (!devices || devices.length === 0) {
        showAlert('Không tìm thấy thiết bị nào trùng khớp với mã hoặc tên đã nhập!', false);
        codeInput.classList.add('is-invalid');
        return;
      }
      
      const deviceId = devices[0].id;
      const body = {
        device: deviceId,
        date: monthVal + '-01',
        value: value,
      };

      const res = await apiFetch(API.consumptions, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      const result = await res.json().catch(()=>({}));
      if (!res.ok) {
        let errorMsg = result.detail || result.non_field_errors;
        if (!errorMsg && typeof result === 'object') {
          // Format validation errors cleanly
          errorMsg = Object.entries(result)
            .map(([field, errs]) => `${field === 'device' ? 'Thiết bị' : field === 'date' ? 'Ngày' : field === 'value' ? 'Giá trị' : field}: ${Array.isArray(errs) ? errs.join(', ') : errs}`)
            .join('; ');
        }
        showAlert(errorMsg || 'Lỗi khi ghi nhận (Có thể chỉ số của tháng này đã được ghi nhận trước đó)', false);
        return;
      }
      showAlert('Lưu chỉ số tiêu thụ thành công', true);
      
      document.getElementById('monitoring-form').reset();
      document.getElementById('filter-device-code').value = deviceCode;
      
      const now = new Date();
      document.getElementById('input-date').value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      
      loadConsumptions();
    } catch (err) {
      console.error('Error saving consumption:', err);
      showAlert('Đã xảy ra lỗi hệ thống khi lưu dữ liệu tiêu thụ', false);
    }
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
    
    if (isAdmin()) {
      const link = document.getElementById('nav-users-link');
      if (link) link.classList.remove('d-none');
    }
    
    if (!isAdminOrOperator()) {
      const card = document.getElementById('input-card');
      if (card) card.classList.add('d-none');
    }
  }

  async function loadDevicesForAutocomplete() {
    try {
      const res = await apiFetch(`${API.devices}?page_size=1000`);
      if (!res.ok) return;
      const data = await res.json();
      const devices = data.results !== undefined ? data.results : data;
      if (!devices || !Array.isArray(devices)) return;

      // Filter to only electric and water meters
      const meters = devices.filter(d => d.device_type === 'ELECTRIC_METER' || d.device_type === 'WATER_METER');

      const inputDatalist = document.getElementById('input-devices-datalist');
      const filterDatalist = document.getElementById('filter-devices-datalist');

      if (inputDatalist && filterDatalist) {
        const html = meters.map(d => {
          const typeLabel = d.device_type === 'WATER_METER' ? 'Nước' : 'Điện';
          return `<option value="${d.code}">${d.code} — ${d.name} (${typeLabel})</option>`;
        }).join('');
        
        inputDatalist.innerHTML = html;
        filterDatalist.innerHTML = html;
      }
    } catch (err) {
      console.error('Error loading devices for autocomplete:', err);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;
    setupNav();
    loadDevicesForAutocomplete();

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        const refresh = localStorage.getItem(STORAGE.refresh);
        try {
          await fetch(API.logout, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(refresh ? { refresh } : {}),
          });
        } catch (err) {
          console.error(err);
        }
        clearAuth();
        window.location.href = '/login/';
      });
    }

    const form = document.getElementById('monitoring-form');
    if (form) {
      form.addEventListener('submit', handleInputSubmit);
    }
    
    const filterForm = document.getElementById('filter-form');
    if (filterForm) {
      filterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        loadConsumptions();
      });
    }

    // Xử lý bật/tắt nhóm theo khu vực (Area aggregation switch toggle)
    const groupAreaChk = document.getElementById('filter-group-area');
    const codeInput = document.getElementById('filter-device-code');
    if (groupAreaChk) {
      groupAreaChk.addEventListener('change', () => {
        if (groupAreaChk.checked) {
          if (codeInput) {
            codeInput.value = '';
            codeInput.disabled = true;
          }
          // Tự động chọn loại thiết bị điện nếu chưa chọn loại nào, tránh cộng gộp kWh và m³
          const typeSel = document.getElementById('filter-device-type');
          if (typeSel && !typeSel.value) {
            typeSel.value = 'ELECTRIC_METER';
          }
        } else {
          if (codeInput) {
            codeInput.disabled = false;
          }
        }
      });
    }

    const clearFilterBtn = document.getElementById('btn-clear-filter');
    if (clearFilterBtn) {
      clearFilterBtn.addEventListener('click', () => {
        if (groupAreaChk) {
          groupAreaChk.checked = false;
        }
        if (codeInput) {
          codeInput.value = '';
          codeInput.disabled = false;
        }
        const typeSel = document.getElementById('filter-device-type');
        if (typeSel) typeSel.value = '';
        const startInput = document.getElementById('filter-start');
        if (startInput) startInput.value = '';
        const endInput = document.getElementById('filter-end');
        if (endInput) endInput.value = '';
        loadConsumptions();
      });
    }

    // Set default month input
    const inputDate = document.getElementById('input-date');
    if (inputDate) {
      const now = new Date();
      inputDate.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }
    
    loadConsumptions();
  });
})();
