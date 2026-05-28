/* analytics.js — Báo cáo & Phân tích Sự cố
   PB389, PB391, PB392, PB393, PB398, PB399, PB401
   - Filter theo ngày / loại / severity / trạng thái
   - Summary stats + Charts (status, severity, type, trend)
   - Danh sách sự cố có pagination
   - Auto token refresh
*/
'use strict';
(() => {
  const STORAGE = {
    access: 'infra_access',
    refresh: 'infra_refresh',
    role: 'infra_role',
    username: 'infra_username',
  };
  const API_REPORT = '/api/incidents/report/';
  const API_REFRESH = '/api/auth/token/refresh/';

  /* ── Auto token refresh ──────────────────────────────────────────── */
  async function apiFetch(url, opts = {}, retry = true) {
    const token = localStorage.getItem(STORAGE.access);
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    };
    const res = await fetch(url, { ...opts, headers });
    if (res.status === 401 && retry) {
      const ok = await doRefresh();
      if (ok) return apiFetch(url, opts, false);
      window.location.href = '/login/';
    }
    return res;
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

  /* ── Navbar ──────────────────────────────────────────────────────── */
  function setupNav() {
    const u = localStorage.getItem(STORAGE.username) || '';
    const role = localStorage.getItem(STORAGE.role) || '';
    const el = document.getElementById('nav-user');
    const roleEl = document.getElementById('nav-role');
    if (el) el.textContent = u ? `Xin chào, ${u}` : '';
    const labels = { ADMIN: 'Quản trị', OPERATOR: 'Vận hành', TECHNICIAN: 'Kỹ thuật', CITIZEN: 'Người dân' };
    if (roleEl) roleEl.textContent = labels[role] || role;
    if (role === 'ADMIN' || role === 'OPERATOR') {
      document.getElementById('nav-dashboard-link')?.classList.remove('d-none');
      document.getElementById('nav-analytics-link')?.classList.remove('d-none');
    }

    document.getElementById('btn-logout')?.addEventListener('click', async () => {
      const refresh = localStorage.getItem(STORAGE.refresh);
      await apiFetch('/api/auth/logout/', { method: 'POST', body: JSON.stringify({ refresh }) });
      localStorage.clear();
      window.location.href = '/login/';
    });

    // Notification badge
    pollNotifBadge();
    setInterval(pollNotifBadge, 30000);
  }

  async function pollNotifBadge() {
    try {
      const res = await apiFetch('/api/notifications/unread-count/');
      if (!res.ok) return;
      const { unread_count } = await res.json();
      const badge = document.getElementById('notif-badge');
      if (!badge) return;
      if (unread_count > 0) {
        badge.textContent = unread_count > 99 ? '99+' : unread_count;
        badge.classList.remove('d-none');
      } else badge.classList.add('d-none');
    } catch {}
  }

  /* ── Chart instances (để destroy trước khi re-render) ────────────── */
  const charts = {};

  function destroyChart(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  }

  function makeChart(id, type, labels, data, colors, extraOpts = {}) {
    destroyChart(id);
    const ctx = document.getElementById(id)?.getContext('2d');
    if (!ctx) return;
    charts[id] = new Chart(ctx, {
      type,
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderRadius: type === 'bar' ? 6 : 0,
          borderWidth: type === 'doughnut' ? 2 : 0,
          borderColor: '#fff',
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: (type === 'bar' || type === 'line') ? 'top' : 'bottom',
            labels: { font: { family: 'Inter', size: 12 }, boxWidth: 12 },
          },
          tooltip: { bodyFont: { family: 'Inter' } },
        },
        scales: (type === 'bar' || type === 'line')
          ? { y: { beginAtZero: true, ticks: { precision: 0, font: { family: 'Inter' } } }, x: { ticks: { font: { family: 'Inter' } } } }
          : {},
        ...extraOpts,
      },
    });
  }

  /* ── Labels & Colors ─────────────────────────────────────────────── */
  const STATUS_LABELS = { OPEN: 'Mới', ASSIGNED: 'Phân công', IN_PROGRESS: 'Đang xử lý', RESOLVED: 'Đã xử lý', CLOSED: 'Đóng' };
  const STATUS_COLORS = { OPEN: '#ef4444', ASSIGNED: '#f59e0b', IN_PROGRESS: '#0ea5e9', RESOLVED: '#22c55e', CLOSED: '#94a3b8' };
  const SEV_LABELS   = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', CRITICAL: 'Khẩn cấp' };
  const SEV_COLORS   = { LOW: '#22c55e', MEDIUM: '#f59e0b', HIGH: '#ef4444', CRITICAL: '#7f1d1d' };
  const TYPE_LABELS  = { ELECTRIC: '⚡ Điện', WATER: '💧 Nước', OTHER: '🔧 Khác' };
  const TYPE_COLORS  = ['#f59e0b', '#0ea5e9', '#94a3b8'];

  /* ── Render summary ──────────────────────────────────────────────── */
  function renderSummary(summary) {
    const { total, by_status, by_severity, by_type, resolved_count, resolution_rate } = summary;

    document.getElementById('stat-total').textContent = total;
    const openCount = (by_status.OPEN || 0) + (by_status.ASSIGNED || 0);
    document.getElementById('stat-open').textContent = openCount;
    document.getElementById('stat-resolved').textContent = resolved_count;
    document.getElementById('stat-rate').textContent = resolution_rate + '%';

    // Chart: status
    const sKeys = Object.keys(by_status);
    makeChart('chart-status', 'doughnut',
      sKeys.map(k => STATUS_LABELS[k] || k),
      sKeys.map(k => by_status[k]),
      sKeys.map(k => STATUS_COLORS[k] || '#94a3b8'),
    );

    // Chart: severity
    const sevKeys = Object.keys(by_severity);
    makeChart('chart-severity', 'bar',
      sevKeys.map(k => SEV_LABELS[k] || k),
      sevKeys.map(k => by_severity[k]),
      sevKeys.map(k => SEV_COLORS[k] || '#94a3b8'),
    );

    // Chart: type
    const tKeys = Object.keys(by_type);
    makeChart('chart-type', 'doughnut',
      tKeys.map(k => TYPE_LABELS[k] || k),
      tKeys.map(k => by_type[k]),
      TYPE_COLORS,
    );
  }

  /* ── Render trend ────────────────────────────────────────────────── */
  function renderTrend(trend) {
    destroyChart('chart-trend');
    const ctx = document.getElementById('chart-trend')?.getContext('2d');
    if (!ctx) return;
    const labels = trend.map(t => {
      const d = new Date(t.day);
      return d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });
    });
    const data = trend.map(t => t.count);
    const grad = ctx.createLinearGradient(0, 0, 0, 200);
    grad.addColorStop(0, 'rgba(34,197,94,0.3)');
    grad.addColorStop(1, 'rgba(34,197,94,0)');
    charts['chart-trend'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Số sự cố',
          data,
          borderColor: '#22c55e',
          backgroundColor: grad,
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: '#22c55e',
          tension: 0.4,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  /* ── Render table ────────────────────────────────────────────────── */
  function renderTable(incidents) {
    const tbody = document.getElementById('incidents-table-body');
    if (!tbody) return;

    const { results, count, page, page_size, total_pages } = incidents;

    document.getElementById('incident-count').textContent =
      `${count} sự cố${page > 1 ? ` — Trang ${page}/${total_pages}` : ''}`;

    if (!results.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">Không có sự cố nào.</td></tr>`;
      renderPagination(0, 1, 1);
      return;
    }

    const SEV_BADGE = { LOW: 'bg-success', MEDIUM: 'bg-warning text-dark', HIGH: 'bg-danger', CRITICAL: 'bg-dark' };
    const STA_BADGE = { OPEN: 'bg-danger', ASSIGNED: 'bg-warning text-dark', IN_PROGRESS: 'bg-info text-dark', RESOLVED: 'bg-success', CLOSED: 'bg-secondary' };

    tbody.innerHTML = results.map(inc => {
      const created = new Date(inc.created_at).toLocaleDateString('vi-VN');
      const resolved = inc.resolved_at ? new Date(inc.resolved_at).toLocaleDateString('vi-VN') : '—';
      return `
        <tr>
          <td class="ps-3 text-muted">#${inc.id}</td>
          <td class="fw-medium" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${inc.title}">${inc.title}</td>
          <td>${TYPE_LABELS[inc.incident_type] || inc.incident_type}</td>
          <td><span class="badge ${SEV_BADGE[inc.severity] || 'bg-secondary'}">${SEV_LABELS[inc.severity] || inc.severity}</span></td>
          <td><span class="badge ${STA_BADGE[inc.status] || 'bg-secondary'}">${STATUS_LABELS[inc.status] || inc.status}</span></td>
          <td>${inc.reported_by || '—'}</td>
          <td>${inc.assigned_to || '<span class="text-muted">Chưa phân</span>'}</td>
          <td>${created}</td>
          <td>${resolved}</td>
        </tr>`;
    }).join('');

    renderPagination(count, page, total_pages);
  }

  /* ── Pagination ──────────────────────────────────────────────────── */
  let currentPage = 1;

  function renderPagination(total, page, totalPages) {
    const info = document.getElementById('pagination-info');
    const controls = document.getElementById('pagination-controls');
    if (info) info.textContent = `Tổng: ${total} sự cố — Trang ${page}/${totalPages}`;
    if (!controls) return;

    const pages = [];
    for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p++) pages.push(p);

    controls.innerHTML = [
      `<button class="btn btn-sm btn-outline-secondary" ${page <= 1 ? 'disabled' : ''} onclick="gotoPage(${page - 1})"><i class="bi bi-chevron-left"></i></button>`,
      ...pages.map(p => `<button class="btn btn-sm ${p === page ? 'btn-primary' : 'btn-outline-secondary'}" onclick="gotoPage(${p})">${p}</button>`),
      `<button class="btn btn-sm btn-outline-secondary" ${page >= totalPages ? 'disabled' : ''} onclick="gotoPage(${page + 1})"><i class="bi bi-chevron-right"></i></button>`,
    ].join('');
  }

  window.gotoPage = (p) => {
    currentPage = p;
    loadReport();
  };

  /* ── Get filter params ───────────────────────────────────────────── */
  function getFilterParams() {
    const params = new URLSearchParams();
    const from = document.getElementById('filter-date-from')?.value;
    const to = document.getElementById('filter-date-to')?.value;
    const type = document.getElementById('filter-type')?.value;
    const sev = document.getElementById('filter-severity')?.value;
    const sta = document.getElementById('filter-status')?.value;
    if (from) params.set('date_from', from);
    if (to) params.set('date_to', to);
    if (type) params.set('incident_type', type);
    if (sev) params.set('severity', sev);
    if (sta) params.set('status', sta);
    params.set('page', currentPage);
    params.set('page_size', 20);
    return params.toString();
  }

  /* ── Load report ─────────────────────────────────────────────────── */
  async function loadReport() {
    const url = `${API_REPORT}?${getFilterParams()}`;
    try {
      const res = await apiFetch(url);
      if (!res.ok) {
        if (res.status === 403) {
          document.getElementById('incidents-table-body').innerHTML =
            `<tr><td colspan="9" class="text-center py-4 text-danger"><i class="bi bi-lock me-1"></i>Bạn không có quyền xem báo cáo này.</td></tr>`;
        }
        return;
      }
      const data = await res.json();
      renderSummary(data.summary);
      renderTrend(data.trend);
      renderTable(data.incidents);
    } catch (e) {
      console.error('loadReport error:', e);
    }
  }

  /* ── Filter events ───────────────────────────────────────────────── */
  document.getElementById('btn-apply-filter')?.addEventListener('click', () => {
    currentPage = 1;
    loadReport();
  });

  document.getElementById('btn-reset-filter')?.addEventListener('click', () => {
    ['filter-date-from', 'filter-date-to', 'filter-type', 'filter-severity', 'filter-status']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    currentPage = 1;
    loadReport();
  });

  // Default: last 30 days
  function setDefaultDates() {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 29);
    const fmt = d => d.toISOString().split('T')[0];
    const fromEl = document.getElementById('filter-date-from');
    const toEl = document.getElementById('filter-date-to');
    if (fromEl && !fromEl.value) fromEl.value = fmt(from);
    if (toEl && !toEl.value) toEl.value = fmt(to);
  }

  /* ── Init ────────────────────────────────────────────────────────── */
  setupNav();
  setDefaultDates();
  loadReport();
})();
