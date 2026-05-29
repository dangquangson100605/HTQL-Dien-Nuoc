(function () {
  const STORAGE = {
    access: 'infra_access',
    refresh: 'infra_refresh',
    role: 'infra_role',
    username: 'infra_username',
  };

  function clearStoredAuth() {
    Object.values(STORAGE).forEach((key) => localStorage.removeItem(key));
  }

  async function redirectIfLoggedIn() {
    try {
      const ts = new Date().getTime();
      const res = await fetch(`/api/auth/session-status/?t=${ts}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      if (data.authenticated && localStorage.getItem(STORAGE.access)) {
        const role = localStorage.getItem(STORAGE.role);
        if (role === 'CITIZEN') {
          window.location.href = '/lookup/';
        } else {
          window.location.href = '/app/';
        }
        return;
      }
      clearStoredAuth();
    } catch (_) {
      // Keep the login page usable when network/server is unstable.
    }
  }

  function showError(msg) {
    const el = document.getElementById('login-alert');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('d-none');
  }

  async function submitLogin(username, password) {
    const res = await fetch('/api/auth/login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        data.detail ||
        (typeof data === 'object' && data.non_field_errors && data.non_field_errors[0]) ||
        'Đăng nhập thất bại.';
      throw new Error(typeof msg === 'string' ? msg : 'Đăng nhập thất bại.');
    }
    localStorage.setItem(STORAGE.access, data.access);
    localStorage.setItem(STORAGE.refresh, data.refresh);
    if (data.role) localStorage.setItem(STORAGE.role, data.role);
    if (data.username) localStorage.setItem(STORAGE.username, data.username);
    if (data.role === 'CITIZEN') {
      window.location.href = '/lookup/';
    } else {
      window.location.href = '/app/';
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await redirectIfLoggedIn();
    const form = document.getElementById('login-form');
    const btn = document.getElementById('login-submit');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      if (!username || !password) {
        showError('Nhập đủ tên đăng nhập và mật khẩu.');
        return;
      }
      btn.disabled = true;
      try {
        await submitLogin(username, password);
      } catch (err) {
        showError(err.message || 'Lỗi mạng.');
      } finally {
        btn.disabled = false;
      }
    });
  });
})();
