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
    el.textContent = msg;
    el.className = `alert py-2 small ${isSuccess ? 'alert-success' : 'alert-danger'}`;
    el.classList.remove('d-none');
    setTimeout(() => { el.classList.add('d-none'); }, 3000);
  }

  let chartInstance = null;

  const DEVICE_LABELS = {
    ELECTRIC_POLE: 'Trụ điện',
    WATER_METER: 'Đồng hồ nước',
    TRANSFORMER: 'Trạm biến áp',
    VALVE: 'Van nước',
  };

  async function loadDevices() {
    const res = await apiFetch(`${API.devices}?page_size=999`);
    if (!res.ok) return;
    const data = await res.json();
    // Handle paginated or flat response
    const devices = data.results !== undefined ? data.results : data;
    
    const inputSelect = document.getElementById('input-device');
    const filterSelect = document.getElementById('filter-device');
    
    const inputOptions = devices
      .filter(d => d.device_type === 'WATER_METER' || d.device_type === 'ELECTRIC_METER')
      .map(d => {
        const label = DEVICE_LABELS[d.device_type] || d.device_type;
        return `<option value="${d.id}">${d.name} (${label})</option>`;
      }).join('');
      
    const filterOptions = devices.map(d => {
      const label = DEVICE_LABELS[d.device_type] || d.device_type;
      return `<option value="${d.id}">${d.name} (${label})</option>`;
    }).join('');
    
    if (inputSelect) inputSelect.innerHTML = '<option value="">-- Chọn đồng hồ / công tơ --</option>' + inputOptions;
    if (filterSelect) filterSelect.innerHTML = '<option value="">Tất cả thiết bị</option>' + filterOptions;
  }

  async function loadConsumptions() {
    const deviceId = document.getElementById('filter-device').value;
    const startDate = document.getElementById('filter-start').value;
    const endDate = document.getElementById('filter-end').value;

    const params = new URLSearchParams();
    if (deviceId) params.append('device_id', deviceId);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    const res = await apiFetch(`${API.consumptions}?${params.toString()}`);
    if (!res.ok) {
      showAlert('Lỗi khi tải dữ liệu tiêu thụ');
      return;
    }
    const data = await res.json();
    renderTable(data);
    renderChart(data);
  }

  function renderTable(data) {
    const tbody = document.getElementById('monitoring-table-body');
    const admin = isAdmin();
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="${admin ? 4 : 3}" class="text-muted py-4">Không có dữ liệu</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(row => {
      const actions = admin ? `
        <td class="admin-only">
          <button class="btn btn-sm btn-outline-danger btn-del" data-id="${row.id}">Xóa</button>
        </td>` : '';
      return `
        <tr>
          <td>${row.device_name}</td>
          <td>${row.date}</td>
          <td>${row.value}</td>
          ${actions}
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-del').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (!confirm('Bạn có chắc muốn xóa bản ghi này?')) return;
        const id = btn.getAttribute('data-id');
        await apiFetch(`${API.consumptions}${id}/`, { method: 'DELETE' });
        loadConsumptions();
      });
    });
  }

  function renderChart(data) {
    const ctx = document.getElementById('consumptionChart');
    if (!ctx) return;

    // Aggregate by date
    const agg = {};
    data.forEach(row => {
      agg[row.date] = (agg[row.date] || 0) + row.value;
    });

    const labels = Object.keys(agg).sort();
    const values = labels.map(l => agg[l]);

    if (chartInstance) {
      chartInstance.destroy();
    }

    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(14, 165, 233, 0.8)'); // var(--primary) with opacity
    gradient.addColorStop(1, 'rgba(14, 165, 233, 0.2)');

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Tổng tiêu thụ',
          data: values,
          backgroundColor: gradient,
          borderColor: '#0ea5e9',
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleFont: { family: 'Inter', size: 13 },
            bodyFont: { family: 'Inter', size: 14, weight: 'bold' },
            padding: 10,
            cornerRadius: 8,
            displayColors: false,
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
  }

  async function handleInputSubmit(e) {
    e.preventDefault();
    const valInput = document.getElementById('input-value');
    valInput.classList.remove('is-invalid');
    
    const body = {
      device: document.getElementById('input-device').value,
      date: document.getElementById('input-date').value,
      value: parseFloat(valInput.value),
    };

    if (body.value < 0) {
      valInput.classList.add('is-invalid');
      return;
    }

    const res = await apiFetch(API.consumptions, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    const result = await res.json().catch(()=>({}));
    if (!res.ok) {
      showAlert(result.detail || result.non_field_errors || 'Lỗi khi lưu dữ liệu (Có thể trùng ngày)', false);
      return;
    }
    showAlert('Lưu dữ liệu thành công', true);
    document.getElementById('monitoring-form').reset();
    loadConsumptions();
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
      document.getElementById('nav-users-link').classList.remove('d-none');
    }
    
    if (!isAdminOrOperator()) {
      document.getElementById('input-card').classList.add('d-none');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!requireAuth()) return;
    setupNav();

    document.getElementById('btn-logout').addEventListener('click', async () => {
      const refresh = localStorage.getItem(STORAGE.refresh);
      await fetch(API.logout, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(refresh ? { refresh } : {}),
      });
      clearAuth();
      window.location.href = '/login/';
    });

    document.getElementById('monitoring-form').addEventListener('submit', handleInputSubmit);
    
    document.getElementById('filter-form').addEventListener('submit', (e) => {
      e.preventDefault();
      loadConsumptions();
    });

    document.getElementById('btn-clear-filter').addEventListener('click', () => {
      document.getElementById('filter-device').value = '';
      document.getElementById('filter-start').value = '';
      document.getElementById('filter-end').value = '';
      loadConsumptions();
    });

    // Initialize
    document.getElementById('input-date').valueAsDate = new Date();
    loadDevices().then(loadConsumptions);
  });
})();
