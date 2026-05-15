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
    users: '/api/auth/users/',
    changePassword: '/api/auth/change-password/',
    auditLogs: '/api/auth/audit-logs/',
  };

  const ROLE_LABELS = {
    ADMIN: 'Quản trị viên',
    OPERATOR: 'Nhân viên vận hành',
    TECHNICIAN: 'Kỹ thuật viên',
    CITIZEN: 'Người dân',
  };

  let userModal = null;
  let deleteModal = null;
  let auditModal = null;
  let deleteTargetId = null;

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

  function requireAdmin() {
    if (!getAccess() || !isAdmin()) {
      window.location.href = '/app/';
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

  function showAppAlert(msg) {
    const el = document.getElementById('app-alert');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('d-none');
  }

  function hideAppAlert() {
    const el = document.getElementById('app-alert');
    if (!el) return;
    el.classList.add('d-none');
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

  function escapeHtml(s) {
    if (!s) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function getRoleBadgeClass(role) {
    switch (role) {
      case 'ADMIN': return 'text-bg-danger';
      case 'OPERATOR': return 'text-bg-warning';
      case 'TECHNICIAN': return 'text-bg-info';
      default: return 'text-bg-secondary';
    }
  }

  let cachedUsers = [];

  async function loadUsers() {
    hideAppAlert();
    const res = await apiFetch(API.users);
    if (!res.ok) {
      showAppAlert('Không tải được danh sách tài khoản.');
      return;
    }
    cachedUsers = await res.json();
    renderTable(cachedUsers);
  }

  function renderTable(users) {
    const tbody = document.getElementById('user-table-body');
    if (!tbody) return;
    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Chưa có dữ liệu.</td></tr>`;
      return;
    }

    const currentUsername = localStorage.getItem(STORAGE.username);

    tbody.innerHTML = users
      .map((u) => {
        const typeLabel = ROLE_LABELS[u.role] || u.role;
        const badgeClass = getRoleBadgeClass(u.role);
        
        let delBtn = `<button type="button" class="btn btn-sm btn-outline-danger btn-del" data-id="${u.id}">Xóa</button>`;
        if (u.username === currentUsername) {
            delBtn = `<button type="button" class="btn btn-sm btn-outline-secondary" disabled title="Không thể xóa chính mình">Xóa</button>`;
        }

        let statusHtml = '';
        if (u.is_active !== undefined) {
          statusHtml = `<div class="form-check form-switch d-inline-block m-0">
            <input class="form-check-input status-toggle" type="checkbox" role="switch" data-id="${u.id}" ${u.is_active ? 'checked' : ''} ${u.username === currentUsername ? 'disabled' : ''}>
            <label class="form-check-label small">${u.is_active ? 'Hoạt động' : 'Bị khóa'}</label>
          </div>`;
        }

        return `<tr>
        <td>#${u.id}</td>
        <td class="fw-medium">${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.email || '—')}</td>
        <td><span class="badge ${badgeClass}">${escapeHtml(typeLabel)}</span></td>
        <td>${statusHtml}</td>
        <td class="text-end text-nowrap">
          <button type="button" class="btn btn-sm btn-outline-primary btn-edit" data-id="${u.id}">Sửa</button>
          ${delBtn}
        </td>
      </tr>`;
      })
      .join('');

    tbody.querySelectorAll('.btn-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-id'));
        const u = users.find((x) => x.id === id);
        if (u) openEditModal(u);
      });
    });

    tbody.querySelectorAll('.btn-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-id'));
        const u = users.find((x) => x.id === id);
        if (u) openDeleteModal(id, u.username);
      });
    });

    tbody.querySelectorAll('.status-toggle').forEach((toggle) => {
      toggle.addEventListener('change', async (e) => {
        const id = Number(toggle.getAttribute('data-id'));
        const is_active = e.target.checked;
        const res = await apiFetch(`${API.users}${id}/`, {
          method: 'PATCH',
          body: JSON.stringify({ is_active })
        });
        if (!res.ok) {
          e.target.checked = !is_active; // revert
          showAppAlert('Lỗi cập nhật trạng thái.');
        } else {
          const lbl = e.target.nextElementSibling;
          if (lbl) lbl.textContent = is_active ? 'Hoạt động' : 'Bị khóa';
        }
      });
    });
  }

  function openCreateModal() {
    hideModalAlert();
    document.getElementById('user-modal-title').textContent = 'Thêm tài khoản';
    document.getElementById('user-id').value = '';
    document.getElementById('user-username').value = '';
    document.getElementById('user-email').value = '';
    document.getElementById('user-role').value = 'CITIZEN';
    document.getElementById('user-password').value = '';
    
    document.getElementById('password-req').classList.remove('d-none');
    document.getElementById('user-password').placeholder = 'Nhập mật khẩu';
    document.getElementById('password-hint').textContent = 'Mật khẩu là bắt buộc khi tạo mới.';
    
    userModal.show();
  }

  function openEditModal(u) {
    hideModalAlert();
    document.getElementById('user-modal-title').textContent = 'Sửa tài khoản';
    document.getElementById('user-id').value = String(u.id);
    document.getElementById('user-username').value = u.username;
    document.getElementById('user-email').value = u.email || '';
    document.getElementById('user-role').value = u.role;
    document.getElementById('user-password').value = '';
    
    document.getElementById('password-req').classList.add('d-none');
    document.getElementById('user-password').placeholder = 'Để trống nếu không muốn đổi';
    document.getElementById('password-hint').textContent = 'Chỉ nhập nếu bạn muốn thay đổi mật khẩu.';

    userModal.show();
  }

  function openDeleteModal(id, name) {
    deleteTargetId = id;
    document.getElementById('delete-username').textContent = name;
    deleteModal.show();
  }

  async function saveUser() {
    hideModalAlert();
    const id = document.getElementById('user-id').value.trim();
    const body = {
      username: document.getElementById('user-username').value.trim(),
      email: document.getElementById('user-email').value.trim(),
      role: document.getElementById('user-role').value,
    };
    const pw = document.getElementById('user-password').value;
    
    if (!body.username) {
      showModalAlert('Tên đăng nhập không được để trống.');
      return;
    }
    
    if (!id && !pw) {
      showModalAlert('Mật khẩu là bắt buộc khi tạo mới.');
      return;
    }

    if (pw) {
      body.password = pw;
    }

    const url = id ? `${API.users}${id}/` : API.users;
    const method = id ? 'PATCH' : 'POST';
    
    const res = await apiFetch(url, { method, body: JSON.stringify(body) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showModalAlert(formatErrors(data));
      return;
    }
    
    userModal.hide();
    await loadUsers();
  }

  async function confirmDelete() {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    const res = await apiFetch(`${API.users}${id}/`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showAppAlert(formatErrors(data));
      return;
    }
    deleteModal.hide();
    deleteTargetId = null;
    await loadUsers();
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
    const res = await apiFetch(API.changePassword, {
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

  async function loadAuditLogs() {
    const tbody = document.getElementById('audit-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Đang tải...</td></tr>';
    const res = await apiFetch(API.auditLogs);
    if (!res.ok) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger py-3">Lỗi tải dữ liệu.</td></tr>';
      return;
    }
    const data = await res.json();
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Không có nhật ký nào.</td></tr>';
      return;
    }
    tbody.innerHTML = data.slice(0, 50).map(log => {
      const ts = new Date(log.timestamp).toLocaleString('vi-VN');
      const uname = log.username || 'Khách (Anonymous)';
      const actionClass = log.action === 'DELETE' ? 'text-danger' : 'text-primary';
      return `<tr>
        <td class="small text-muted">${ts}</td>
        <td>${escapeHtml(uname)}</td>
        <td class="fw-bold ${actionClass}">${escapeHtml(log.action)}</td>
        <td class="small font-monospace">${escapeHtml(log.path)}</td>
        <td class="small text-muted">${escapeHtml(log.ip_address || '')}</td>
      </tr>`;
    }).join('');
  }

  function setupNav() {
    const u = localStorage.getItem(STORAGE.username) || '';
    const role = localStorage.getItem(STORAGE.role) || '';
    const navUser = document.getElementById('nav-user');
    const navRole = document.getElementById('nav-role');
    if (navUser) navUser.textContent = u ? `Xin chào, ${u}` : '';
    if (navRole) {
      navRole.textContent = ROLE_LABELS[role] || role || '—';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!requireAdmin()) return;
    setupNav();

    userModal = new bootstrap.Modal(document.getElementById('user-modal'));
    deleteModal = new bootstrap.Modal(document.getElementById('delete-modal'));
    auditModal = new bootstrap.Modal(document.getElementById('audit-modal'));

    document.getElementById('btn-logout').addEventListener('click', () => logout());
    document.getElementById('btn-add-user').addEventListener('click', () => openCreateModal());
    document.getElementById('user-save').addEventListener('click', () => saveUser());
    document.getElementById('delete-confirm').addEventListener('click', () => confirmDelete());
    
    const btnCpSave = document.getElementById('cp-save');
    if (btnCpSave) btnCpSave.addEventListener('click', () => changePassword());

    const btnAudit = document.getElementById('btn-audit-log');
    if (btnAudit) {
      btnAudit.addEventListener('click', () => {
        auditModal.show();
        loadAuditLogs();
      });
    }

    ['mousemove', 'keydown', 'scroll', 'click'].forEach(evt => 
      document.addEventListener(evt, resetIdleTimer)
    );
    resetIdleTimer();

    loadUsers();
  });
})();
