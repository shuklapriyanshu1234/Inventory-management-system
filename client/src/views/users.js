import { apiRequest } from '../api.js';
import { openModal, closeModal, showToast } from '../components/ui.js';

export async function renderUsers(container) {
  container.innerHTML = `<div style="text-align: center; padding: 3rem;">Loading user management & audit logs...</div>`;

  try {
    const { data: users } = await apiRequest('/api/users');
    const { data: auditLogs } = await apiRequest('/api/users/audit-logs/all');

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <h3 style="font-size: 1.1rem; font-weight: 700;">Role-Based User Directory</h3>
        <button class="btn btn-primary btn-sm" id="btn-create-user">+ New User Account</button>
      </div>

      <div class="card-table">
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>User Name</th>
                <th>Email</th>
                <th>Assigned Role</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr>
                  <td><strong>${u.name}</strong></td>
                  <td>${u.email}</td>
                  <td><span class="badge badge-primary">${u.role}</span></td>
                  <td><span class="badge ${u.isActive ? 'badge-success' : 'badge-danger'}">${u.isActive ? 'Active' : 'Disabled'}</span></td>
                  <td>${new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Security & Audit Trail -->
      <div class="card-table" style="margin-top: 2rem;">
        <div class="table-header">
          <h3 style="font-size: 1.05rem; font-weight: 700;">Immutable Security Audit Log</h3>
        </div>
        <div class="table-responsive" style="max-height: 350px; overflow-y: auto;">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Entity</th>
                <th>User</th>
                <th>IP</th>
                <th>Payload Details</th>
              </tr>
            </thead>
            <tbody>
              ${auditLogs.map(l => `
                <tr>
                  <td style="font-size: 0.8rem;">${new Date(l.createdAt).toLocaleTimeString()}</td>
                  <td><span class="badge badge-secondary">${l.action}</span></td>
                  <td><strong>${l.entity}</strong></td>
                  <td>${l.user ? l.user.name : 'System'}</td>
                  <td style="font-size: 0.75rem; color: var(--text-muted);">${l.ipAddress || '127.0.0.1'}</td>
                  <td><code style="font-size: 0.75rem;">${l.details}</code></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('btn-create-user')?.addEventListener('click', showCreateUserModal);

  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); padding: 2rem;">Error: ${err.message}</div>`;
  }
}

function showCreateUserModal() {
  const content = `
    <form id="new-user-form">
      <div class="form-group">
        <label class="form-label">Full Name *</label>
        <input type="text" id="u-name" class="form-control" required placeholder="e.g. John Doe">
      </div>
      <div class="form-group">
        <label class="form-label">Email Address *</label>
        <input type="email" id="u-email" class="form-control" required placeholder="john@xyzretail.com">
      </div>
      <div class="form-group">
        <label class="form-label">Password *</label>
        <input type="password" id="u-pass" class="form-control" required value="Password123!">
      </div>
      <div class="form-group">
        <label class="form-label">Role *</label>
        <select id="u-role" class="form-control" required>
          <option value="WAREHOUSE_STAFF">Warehouse Staff</option>
          <option value="SALES">Sales Representative</option>
          <option value="MANAGER">Inventory Manager</option>
          <option value="ADMIN">System Administrator</option>
        </select>
      </div>
    </form>
  `;

  openModal('Register New Staff Member', content, async () => {
    try {
      const payload = {
        name: document.getElementById('u-name').value,
        email: document.getElementById('u-email').value,
        password: document.getElementById('u-pass').value,
        role: document.getElementById('u-role').value
      };

      await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      showToast('User created successfully', 'success');
      closeModal();
      document.dispatchEvent(new CustomEvent('app:refresh-data'));
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}
