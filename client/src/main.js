import { state, initSSE } from './state.js';
import { apiRequest, setTokens, clearAuth } from './api.js';
import { showToast } from './components/ui.js';

// Views
import { renderDashboard } from './views/dashboard.js';
import { renderProducts } from './views/products.js';
import { renderInventory } from './views/inventory.js';
import { renderOrders } from './views/orders.js';
import { renderSuppliers } from './views/suppliers.js';
import { renderBarcodeRfid } from './views/barcodeRfid.js';
import { renderReports } from './views/reports.js';
import { renderUsers } from './views/users.js';
import { renderIntegrations } from './views/integrations.js';

const app = document.getElementById('app');

function initApp() {
  document.documentElement.setAttribute('data-theme', state.theme);

  // Check auth
  if (!state.user && window.location.hash !== '#reset-password') {
    renderLoginView();
    return;
  }

  initSSE();
  renderAppShell();
  handleRouting();

  window.addEventListener('hashchange', handleRouting);
  document.addEventListener('app:refresh-data', () => {
    handleRouting();
  });
}

function renderLoginView() {
  app.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg-primary); padding: 1.5rem;">
      <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 2.5rem; width: 100%; max-width: 420px; box-shadow: var(--shadow-md);">
        <div style="text-align: center; margin-bottom: 2rem;">
          <div class="logo-badge" style="display: inline-block; margin-bottom: 0.75rem;">XYZ RETAIL</div>
          <h2 style="font-size: 1.35rem; font-weight: 700;">Enterprise Inventory OS</h2>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">Sign in to access logistics and stock control</p>
        </div>

        <form id="login-form">
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input type="email" id="login-email" class="form-control" required value="admin@xyzretail.com">
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" id="login-password" class="form-control" required value="Admin123!">
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 0.5rem;">Sign In &rarr;</button>
        </form>

        <div style="margin-top: 1.5rem; text-align: center;">
          <a href="#reset-password" id="link-forgot-pw" style="font-size: 0.82rem; color: var(--primary); text-decoration: none;">Forgot password?</a>
        </div>

        <div style="margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--border-color); font-size: 0.78rem; color: var(--text-muted); text-align: center;">
          <strong>Demo Logins:</strong><br>
          Admin: <code>admin@xyzretail.com</code> | Pass: <code>Admin123!</code><br>
          Warehouse: <code>warehouse@xyzretail.com</code> | Sales: <code>sales@xyzretail.com</code>
        </div>
      </div>
    </div>
  `;

  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      setTokens(res.accessToken, res.refreshToken);
      localStorage.setItem('xyz_user', JSON.stringify(res.user));
      state.user = res.user;

      showToast(`Welcome back, ${res.user.name}`, 'success');
      window.location.hash = '#dashboard';
      renderAppShell();
      handleRouting();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function renderAppShell() {
  const user = state.user;
  const isAdmin = user.role === 'ADMIN';
  const isManager = user.role === 'MANAGER' || isAdmin;

  app.innerHTML = `
    <div class="app-container">
      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <span class="logo-badge">XYZ</span>
          <span class="logo-title">Inventory OS</span>
        </div>
        <ul class="nav-menu">
          <li class="nav-item"><a class="nav-link" href="#dashboard" data-route="dashboard">&#128202; Dashboard</a></li>
          <li class="nav-item"><a class="nav-link" href="#products" data-route="products">&#128230; Products</a></li>
          <li class="nav-item"><a class="nav-link" href="#inventory" data-route="inventory">&#128200; Stock & Ledger</a></li>
          <li class="nav-item"><a class="nav-link" href="#orders" data-route="orders">&#128722; Sales Orders</a></li>
          <li class="nav-item"><a class="nav-link" href="#suppliers" data-route="suppliers">&#128666; Suppliers & POs</a></li>
          <li class="nav-item"><a class="nav-link" href="#barcode-rfid" data-route="barcode-rfid">&#128247; Barcode & RFID</a></li>
          <li class="nav-item"><a class="nav-link" href="#reports" data-route="reports">&#128197; Analytics & Demand</a></li>
          ${isAdmin ? `<li class="nav-item"><a class="nav-link" href="#users" data-route="users">&#128101; Users & Audit</a></li>` : ''}
          ${isManager ? `<li class="nav-item"><a class="nav-link" href="#integrations" data-route="integrations">&#9881; Integrations & API</a></li>` : ''}
        </ul>
        <div class="sidebar-footer">
          <div>
            <div style="font-size: 0.85rem; font-weight: 700;">${user.name}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${user.role}</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-logout">&#10006;</button>
        </div>
      </aside>

      <!-- Main Layout -->
      <main class="main-content">
        <header class="topbar">
          <h1 class="page-title" id="page-title">Dashboard</h1>
          <div class="topbar-actions">
            <button class="btn btn-secondary btn-sm" id="btn-theme-toggle">&#9788; Theme</button>
          </div>
        </header>
        <section class="content-body" id="page-content">
          <!-- View Injected Here -->
        </section>
      </main>
    </div>
  `;

  // Theme Toggle
  document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('xyz_theme', state.theme);
    document.documentElement.setAttribute('data-theme', state.theme);
  });

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    clearAuth();
    state.user = null;
    showToast('Signed out', 'info');
    renderLoginView();
  });
}

function handleRouting() {
  const hash = window.location.hash.slice(1) || 'dashboard';
  const content = document.getElementById('page-content');
  const title = document.getElementById('page-title');
  if (!content) return;

  // Active link styling
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.getAttribute('data-route') === hash) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  switch (hash) {
    case 'dashboard':
      title.innerText = 'Executive Inventory Overview';
      renderDashboard(content);
      break;
    case 'products':
      title.innerText = 'Product Catalog & Categories';
      renderProducts(content);
      break;
    case 'inventory':
      title.innerText = 'Multi-Location Stock & Audit Ledger';
      renderInventory(content);
      break;
    case 'orders':
      title.innerText = 'Order Management & Pick Slips';
      renderOrders(content);
      break;
    case 'suppliers':
      title.innerText = 'Suppliers & Purchase Order Receiving';
      renderSuppliers(content);
      break;
    case 'barcode-rfid':
      title.innerText = 'Barcode Scanning & RFID Portal';
      renderBarcodeRfid(content);
      break;
    case 'reports':
      title.innerText = 'Analytics & Predictive Demand Forecasting';
      renderReports(content);
      break;
    case 'users':
      title.innerText = 'User Management & Audit Trails';
      renderUsers(content);
      break;
    case 'integrations':
      title.innerText = 'Integrations, Webhooks & ERP Adapters';
      renderIntegrations(content);
      break;
    default:
      title.innerText = 'Dashboard';
      renderDashboard(content);
  }
}

// Bootstrap
initApp();
