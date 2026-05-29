/* notifications.js — Hộp thư Thông báo (v3)
   PB335, PB336, PB357, PB358, PB360, PB371
   - Filter: Tất cả / Chưa đọc / Đã đọc
   - Type chips: theo loại thông báo
   - Badge số chưa đọc real-time
   - Mark read / mark all read
*/
'use strict';
(() => {
  const STORAGE = {
    access: 'infra_access',
    refresh: 'infra_refresh',
    role: 'infra_role',
    username: 'infra_username',
  };
  const API_NOTIF = '/api/notifications/';
  const API_REFRESH = '/api/auth/token/refresh/';

  /* ── Shared apiFetch with auto token refresh ─────────────────────── */
  async function apiFetch(url, opts = {}, retry = true) {
    const token = localStorage.getItem(STORAGE.access);
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    };
    const res = await fetch(url, { ...opts, headers });

    if (res.status === 401 && retry) {
      const refreshed = await refreshToken();
      if (refreshed) return apiFetch(url, opts, false);
      window.location.href = '/login/';
    }
    return res;
  }

  async function refreshToken() {
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
    } catch {
      return false;
    }
  }

  /* ── Navbar setup ────────────────────────────────────────────────── */
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

    if (role === 'CITIZEN') {
      const mapLink = document.querySelector('a[href="/app/"]');
      if (mapLink) {
        mapLink.setAttribute('href', '/lookup/');
        mapLink.innerHTML = '<i class="bi bi-search"></i> Tra cứu';
      }
      const incidentsLink = document.querySelector('a[href="/incidents/"]');
      if (incidentsLink) {
        incidentsLink.setAttribute('href', '/report/');
        incidentsLink.innerHTML = '<i class="bi bi-plus-circle"></i> Báo cáo';
      }
    }

    document.getElementById('btn-logout')?.addEventListener('click', async () => {
      const refresh = localStorage.getItem(STORAGE.refresh);
      await apiFetch('/api/auth/logout/', { method: 'POST', body: JSON.stringify({ refresh }) });
      localStorage.clear();
      window.location.href = '/login/';
    });
  }

  /* ── State ───────────────────────────────────────────────────────── */
  let allNotifs = [];
  let activeFilter = 'all';   // 'all' | 'unread' | 'read'
  let activeType = 'all';     // 'all' | 'NEW_INCIDENT' | 'ASSIGNED' | ...

  const NOTIF_META = {
    NEW_INCIDENT: { icon: '🔴', label: 'Sự cố mới', badgeClass: 'bg-danger' },
    ASSIGNED:     { icon: '👷', label: 'Được phân công', badgeClass: 'bg-warning text-dark' },
    STATUS_UPDATE:{ icon: '🔧', label: 'Cập nhật trạng thái', badgeClass: 'bg-info text-dark' },
    RESOLVED:     { icon: '✅', label: 'Đã giải quyết', badgeClass: 'bg-success' },
    CONFIRMED:    { icon: '✔️', label: 'Đã xác nhận', badgeClass: 'bg-primary' },
    REJECTED:     { icon: '❌', label: 'Từ chối', badgeClass: 'bg-dark' },
  };

  /* ── Render ──────────────────────────────────────────────────────── */
  function getFiltered() {
    return allNotifs.filter(n => {
      const statusOk = activeFilter === 'all'
        || (activeFilter === 'unread' && !n.is_read)
        || (activeFilter === 'read' && n.is_read);
      const typeOk = activeType === 'all' || n.notif_type === activeType;
      return statusOk && typeOk;
    });
  }

  function render() {
    const filtered = getFiltered();
    const el = document.getElementById('notif-list');
    if (!el) return;

    if (!filtered.length) {
      el.innerHTML = `
        <div class="text-center py-5 text-muted">
          <i class="bi bi-bell-slash" style="font-size:3rem;opacity:0.3;"></i>
          <p class="mt-3 mb-0">Không có thông báo nào.</p>
        </div>`;
      return;
    }

    el.innerHTML = filtered.map(n => {
      const meta = NOTIF_META[n.notif_type] || { icon: '📢', label: n.notif_type, badgeClass: 'bg-secondary' };
      const timeStr = new Date(n.created_at).toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
      return `
        <div class="card border-0 shadow-sm mb-2 ${n.is_read ? 'opacity-65' : 'border-start border-4 border-primary'}" id="notif-item-${n.id}" style="${n.is_read ? '' : 'background:#f0f7ff;'}">
          <div class="card-body py-3 d-flex align-items-start gap-3">
            <div class="fs-3 flex-shrink-0 mt-1">${meta.icon}</div>
            <div class="flex-grow-1 min-w-0">
              <div class="d-flex justify-content-between align-items-start flex-wrap gap-1 mb-1">
                <span class="badge ${meta.badgeClass}">${meta.label}</span>
                <small class="text-muted">${timeStr}</small>
              </div>
              <div class="fw-medium ${n.is_read ? 'text-muted' : 'text-dark'}">${n.message}</div>
              ${n.incident_title
                ? `<div class="text-muted small mt-1">
                     <i class="bi bi-link-45deg"></i>
                     <a href="/incidents/" class="text-decoration-none text-primary">Xem sự cố: ${n.incident_title}</a>
                   </div>`
                : ''}
            </div>
            <div class="flex-shrink-0 ms-2">
              ${!n.is_read
                ? `<button class="btn btn-sm btn-outline-primary" onclick="markRead(${n.id})" title="Đánh dấu đã đọc">
                     <i class="bi bi-check2"></i>
                   </button>`
                : `<i class="bi bi-check2-all text-muted" title="Đã đọc"></i>`}
            </div>
          </div>
        </div>`;
    }).join('');
  }

  /* ── Badge ───────────────────────────────────────────────────────── */
  function updateUnreadBadge() {
    const unread = allNotifs.filter(n => !n.is_read).length;
    const badge = document.getElementById('unread-badge');
    if (!badge) return;
    if (unread > 0) {
      badge.textContent = unread > 99 ? '99+' : unread;
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }
    // Also update filter tab text
    const unreadBtn = document.querySelector('[data-filter="unread"]');
    if (unreadBtn) {
      unreadBtn.innerHTML = `Chưa đọc${unread > 0 ? ` <span class="badge bg-danger rounded-pill ms-1">${unread}</span>` : ''}`;
    }
  }

  /* ── Load ────────────────────────────────────────────────────────── */
  async function loadNotifications() {
    const res = await apiFetch(API_NOTIF);
    if (!res.ok) return;
    const data = await res.json();
    allNotifs = data.results ?? data;
    updateUnreadBadge();
    render();
  }

  /* ── Actions ─────────────────────────────────────────────────────── */
  window.markRead = async (id) => {
    const res = await apiFetch(`${API_NOTIF}${id}/mark-read/`, { method: 'PATCH' });
    if (res.ok) {
      const notif = allNotifs.find(n => n.id === id);
      if (notif) notif.is_read = true;
      updateUnreadBadge();
      render();
    }
  };

  document.getElementById('btn-mark-all-read')?.addEventListener('click', async () => {
    const res = await apiFetch(`${API_NOTIF}mark-all-read/`, { method: 'POST' });
    if (res.ok) {
      allNotifs.forEach(n => n.is_read = true);
      updateUnreadBadge();
      render();
    }
  });

  /* ── Filter tabs (read status) ───────────────────────────────────── */
  document.getElementById('status-filter-tabs')?.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      document.querySelectorAll('#status-filter-tabs button').forEach(b => {
        b.classList.remove('btn-primary', 'active');
        b.classList.add('btn-outline-primary');
      });
      btn.classList.add('btn-primary', 'active');
      btn.classList.remove('btn-outline-primary');
      render();
    });
  });

  /* ── Type chips ──────────────────────────────────────────────────── */
  document.getElementById('type-filter-chips')?.querySelectorAll('[data-type]').forEach(chip => {
    chip.addEventListener('click', () => {
      activeType = chip.dataset.type;
      document.querySelectorAll('#type-filter-chips [data-type]').forEach(c => {
        c.classList.remove('bg-primary', 'text-white');
        c.classList.add('bg-white');
      });
      chip.classList.add('bg-primary', 'text-white');
      chip.classList.remove('bg-white');
      render();
    });
  });

  /* ── Poll badge real-time every 30s ─────────────────────────────── */
  async function pollBadge() {
    try {
      const res = await apiFetch(`${API_NOTIF}unread-count/`);
      if (!res.ok) return;
      const { unread_count } = await res.json();
      const badge = document.getElementById('unread-badge');
      if (!badge) return;
      if (unread_count > 0) {
        badge.textContent = unread_count > 99 ? '99+' : unread_count;
        badge.classList.remove('d-none');
        // Nếu có thông báo mới (nhiều hơn hiện tại), reload lại list
        if (unread_count > allNotifs.filter(n => !n.is_read).length) {
          await loadNotifications();
        }
      } else {
        badge.classList.add('d-none');
      }
    } catch {}
  }

  /* ── Init ────────────────────────────────────────────────────────── */
  setupNav();
  loadNotifications();
  setInterval(pollBadge, 30000);
})();
