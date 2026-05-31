/**
 * Navbar thống nhất — hiển thị đủ menu theo role, không nhảy layout khi chuyển trang.
 */
(function (global) {
  const ROLE_LABELS = {
    ADMIN: 'Quản trị',
    OPERATOR: 'Vận hành',
    TECHNICIAN: 'Kỹ thuật',
    CITIZEN: 'Người dân',
  };

  function applyRoleEarly() {
    try {
      document.documentElement.dataset.userRole = localStorage.getItem('infra_role') || '';
    } catch (e) {
      /* ignore */
    }
  }

  function initNavUser() {
    const u = localStorage.getItem('infra_username') || '';
    const role = localStorage.getItem('infra_role') || '';
    const navUser = document.getElementById('nav-user');
    const navRole = document.getElementById('nav-role');
    if (navUser) navUser.textContent = u ? `Xin chào, ${u}` : '';
    if (navRole) navRole.textContent = ROLE_LABELS[role] || role || '—';
    applyRoleEarly();
  }

  function markActiveLink() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    document.querySelectorAll('.staff-nav-link[data-nav-href]').forEach((el) => {
      const href = (el.getAttribute('data-nav-href') || '').replace(/\/+$/, '') || '/';
      const match = path === href || (href !== '/' && path.startsWith(href));
      el.classList.toggle('staff-nav-active', match);
    });
  }

  function applyCitizenNav() {
    const role = localStorage.getItem('infra_role') || '';
    if (role !== 'CITIZEN') return;
    const mapLink = document.querySelector('.staff-nav-link[data-nav-href="/app/"]');
    if (mapLink) {
      mapLink.setAttribute('href', '/lookup/');
      mapLink.setAttribute('data-nav-href', '/lookup/');
      mapLink.innerHTML = '<i class="bi bi-search"></i> Tra cứu';
    }
  }

  applyRoleEarly();

  document.addEventListener('DOMContentLoaded', () => {
    initNavUser();
    applyCitizenNav();
    markActiveLink();
  });

  global.StaffNav = { applyRoleEarly, initNavUser, markActiveLink, applyCitizenNav };
})(window);
