/* dashboard.js — Dashboard Admin */
'use strict';
(() => {
  const STORAGE = { access: 'infra_access', refresh: 'infra_refresh', role: 'infra_role', username: 'infra_username' };
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

  function makeChart(id, type, labels, data, colors, opts = {}) {
    const ctx = document.getElementById(id)?.getContext('2d');
    if (!ctx) return;
    return new Chart(ctx, {
      type,
      data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: type === 'bar' ? 6 : 0, borderWidth: type === 'doughnut' ? 2 : 0, borderColor: '#fff' }] },
      options: {
        responsive: true,
        plugins: { legend: { position: type === 'bar' || type === 'line' ? 'top' : 'bottom', labels: { font: { family: 'Inter', size: 12 }, boxWidth: 12 } }, tooltip: { bodyFont: { family: 'Inter' } } },
        scales: type === 'bar' || type === 'line' ? { y: { beginAtZero: true, ticks: { precision: 0, font: { family: 'Inter' } } }, x: { ticks: { font: { family: 'Inter' } } } } : {},
        ...opts,
      },
    });
  }

  async function loadStats() {
    // Fetch network summary (accessible to all authenticated users)
    let summary = null;
    try {
      const summaryRes = await apiFetch('/api/network/summary/');
      if (summaryRes.ok) {
        summary = await summaryRes.json();
      }
    } catch (e) {
      console.error("Failed to fetch network summary:", e);
    }

    // Populate KPI cards if summary was successfully fetched
    if (summary) {
      document.getElementById('stat-devices').textContent = summary.total_devices ?? 0;
      document.getElementById('stat-total-edges').textContent = summary.total_edges ?? 0;
      document.getElementById('stat-fault-devices').textContent = summary.fault_devices ?? 0;
      document.getElementById('stat-fault-edges').textContent = summary.fault_edges ?? 0;
      document.getElementById('stat-open').textContent = summary.open_incidents ?? 0;
      document.getElementById('stat-in-progress').textContent = (summary.in_progress_incidents ?? 0) + (summary.assigned_incidents ?? 0);
      document.getElementById('stat-resolved').textContent = summary.resolved_incidents ?? 0;
    } else {
      document.getElementById('stat-devices').textContent = 'N/A';
      document.getElementById('stat-total-edges').textContent = 'N/A';
      document.getElementById('stat-fault-devices').textContent = 'N/A';
      document.getElementById('stat-fault-edges').textContent = 'N/A';
      document.getElementById('stat-open').textContent = 'N/A';
      document.getElementById('stat-in-progress').textContent = 'N/A';
      document.getElementById('stat-resolved').textContent = 'N/A';
    }

    // Fetch detailed stats for charts (accessible to ADMIN and OPERATOR)
    let stats = null;
    try {
      const res = await apiFetch('/api/incidents/stats/');
      if (res.ok) {
        stats = await res.json();
      }
    } catch (e) {
      console.error("Failed to fetch detailed incident stats:", e);
    }

    if (!stats) {
      console.log("Detailed stats not available (likely non-ADMIN/OPERATOR role), skipping charts.");
      return;
    }

    // Chart: status
    const statusLabels = {
      PENDING_VERIFY: 'Chờ xác minh',
      CONFIRMED: 'Đã xác nhận',
      ASSIGNED: 'Đã phân công',
      IN_PROGRESS: 'Đang xử lý',
      RESOLVED: 'Đã xử lý',
      CLOSED: 'Đã đóng',
      REJECTED: 'Từ chối'
    };
    const statusColors = {
      PENDING_VERIFY: '#f59e0b',
      CONFIRMED: '#ef4444',
      ASSIGNED: '#3b82f6',
      IN_PROGRESS: '#0ea5e9',
      RESOLVED: '#22c55e',
      CLOSED: '#94a3b8',
      REJECTED: '#64748b'
    };
    const sKeys = Object.keys(stats.by_status || {});
    makeChart('chart-status', 'doughnut', sKeys.map(k => statusLabels[k] || k), sKeys.map(k => stats.by_status[k]), sKeys.map(k => statusColors[k] || '#94a3b8'));

    // Chart: severity
    const sevLabels = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', CRITICAL: 'Khẩn cấp' };
    const sevColors = { LOW: '#22c55e', MEDIUM: '#f59e0b', HIGH: '#ef4444', CRITICAL: '#7f1d1d' };
    const sevKeys = Object.keys(stats.by_severity || {});
    makeChart('chart-severity', 'bar', sevKeys.map(k => sevLabels[k] || k), sevKeys.map(k => stats.by_severity[k]), sevKeys.map(k => sevColors[k] || '#94a3b8'));

    // Chart: type
    const typeLabels = { ELECTRIC: 'Điện', WATER: 'Nước', OTHER: 'Khác' };
    const typeColors = ['#f59e0b', '#0ea5e9', '#94a3b8'];
    const tKeys = Object.keys(stats.by_type || {});
    makeChart('chart-type', 'doughnut', tKeys.map(k => typeLabels[k] || k), tKeys.map(k => stats.by_type[k]), typeColors);

    // Chart: trend
    const trend = stats.trend_7days || [];
    const trendLabels = trend.map(t => new Date(t.day).toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' }));
    const trendData = trend.map(t => t.count);
    const ctx = document.getElementById('chart-trend')?.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, 200);
      grad.addColorStop(0, 'rgba(14,165,233,0.3)');
      grad.addColorStop(1, 'rgba(14,165,233,0)');
      new Chart(ctx, {
        type: 'line',
        data: { labels: trendLabels, datasets: [{ label: 'Số sự cố', data: trendData, borderColor: '#0ea5e9', backgroundColor: grad, borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#0ea5e9', tension: 0.4, fill: true }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
      });
    }
  }

  setupNav();
  loadStats();
  pollNotifBadge();
  setInterval(pollNotifBadge, 30000);
})();
