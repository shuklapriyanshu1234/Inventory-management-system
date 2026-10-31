import { apiRequest } from '../api.js';
import { openModal, closeModal, showToast } from '../components/ui.js';

export async function renderIntegrations(container) {
  container.innerHTML = `<div style="text-align: center; padding: 3rem;">Loading integrations & API keys...</div>`;

  try {
    const keys = await apiRequest('/api/integrations/keys');
    const webhooks = await apiRequest('/api/integrations/webhooks');

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        
        <!-- API Keys -->
        <div class="card-table">
          <div class="table-header">
            <h3 style="font-size: 1.05rem; font-weight: 700;">REST API Keys</h3>
            <button class="btn btn-primary btn-sm" id="btn-create-key">+ Generate API Key</button>
          </div>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key Prefix</th>
                  <th>Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${keys.map(k => `
                  <tr>
                    <td><strong>${k.name}</strong></td>
                    <td><code>${k.key.slice(0, 12)}...</code></td>
                    <td><span class="badge badge-secondary">${k.role}</span></td>
                    <td>
                      <button class="btn btn-secondary btn-sm btn-delete-key" data-id="${k.id}">Revoke</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Webhooks -->
        <div class="card-table">
          <div class="table-header">
            <h3 style="font-size: 1.05rem; font-weight: 700;">Webhooks (Event Subscriptions)</h3>
            <button class="btn btn-primary btn-sm" id="btn-create-webhook">+ Add Webhook</button>
          </div>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Target URL</th>
                  <th>Events</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${webhooks.length === 0 ? `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No webhooks registered</td></tr>` : ''}
                ${webhooks.map(w => `
                  <tr>
                    <td><code style="font-size: 0.8rem;">${w.url}</code></td>
                    <td>${w.events}</td>
                    <td><span class="badge badge-success">Active</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <!-- ERP & Accounting Integration Adapters -->
      <div class="card-table">
        <div class="table-header">
          <h3 style="font-size: 1.05rem; font-weight: 700;">ERP & Accounting System Adapters</h3>
        </div>
        <div style="padding: 1.5rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem;">
          <div style="border: 1px solid var(--border-color); border-radius: 8px; padding: 1.25rem;">
            <h4 style="font-size: 1rem; margin-bottom: 0.4rem;">SAP / Oracle NetSuite ERP Sync</h4>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
              Export full plant inventory, standard valuation, and bin storage for material resource planning.
            </p>
            <button class="btn btn-secondary btn-sm" id="btn-erp-sync">Preview ERP Payload</button>
          </div>

          <div style="border: 1px solid var(--border-color); border-radius: 8px; padding: 1.25rem;">
            <h4 style="font-size: 1rem; margin-bottom: 0.4rem;">QuickBooks / Xero Journal Entries</h4>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
              Export general ledger double-entry transactions (Asset debits vs. COGS credits) from stock movements.
            </p>
            <button class="btn btn-secondary btn-sm" id="btn-accounting-sync">Preview Journal Entries</button>
          </div>

          <div style="border: 1px solid var(--border-color); border-radius: 8px; padding: 1.25rem;">
            <h4 style="font-size: 1rem; margin-bottom: 0.4rem;">OpenAPI / Swagger Documentation</h4>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
              Interactive documentation for developers and external logistics systems.
            </p>
            <a href="/api/docs" target="_blank" class="btn btn-primary btn-sm">Open Swagger UI &rarr;</a>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-create-key')?.addEventListener('click', showCreateKeyModal);
    document.getElementById('btn-create-webhook')?.addEventListener('click', showCreateWebhookModal);

    document.getElementById('btn-erp-sync')?.addEventListener('click', async () => {
      const payload = await apiRequest('/api/integrations/adapters/erp/inventory-sync');
      openModal('SAP/NetSuite ERP Material Inventory Export', `
        <pre style="max-height: 350px; overflow-y: auto; background: var(--bg-primary); padding: 1rem; border-radius: 6px; font-size: 0.8rem;">${JSON.stringify(payload, null, 2)}</pre>
      `);
    });

    document.getElementById('btn-accounting-sync')?.addEventListener('click', async () => {
      const payload = await apiRequest('/api/integrations/adapters/accounting/journal-entries');
      openModal('Universal General Ledger Journal Entries', `
        <pre style="max-height: 350px; overflow-y: auto; background: var(--bg-primary); padding: 1rem; border-radius: 6px; font-size: 0.8rem;">${JSON.stringify(payload, null, 2)}</pre>
      `);
    });

  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); padding: 2rem;">Error: ${err.message}</div>`;
  }
}

function showCreateKeyModal() {
  const content = `
    <form id="key-form">
      <div class="form-group">
        <label class="form-label">Integration System Name *</label>
        <input type="text" id="k-name" class="form-control" required placeholder="e.g. Warehouse Robot AGV Client">
      </div>
      <div class="form-group">
        <label class="form-label">Role Permissions *</label>
        <select id="k-role" class="form-control">
          <option value="MANAGER">Manager</option>
          <option value="ADMIN">Admin</option>
          <option value="WAREHOUSE_STAFF">Warehouse Staff</option>
        </select>
      </div>
    </form>
  `;

  openModal('Generate New API Key', content, async () => {
    try {
      const payload = {
        name: document.getElementById('k-name').value,
        role: document.getElementById('k-role').value
      };
      const res = await apiRequest('/api/integrations/keys', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast(`API Key created: ${res.key}`, 'success');
      closeModal();
      document.dispatchEvent(new CustomEvent('app:refresh-data'));
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function showCreateWebhookModal() {
  const content = `
    <form id="hook-form">
      <div class="form-group">
        <label class="form-label">Webhook Destination URL *</label>
        <input type="url" id="w-url" class="form-control" required placeholder="https://api.partner.com/webhooks/inventory">
      </div>
      <div class="form-group">
        <label class="form-label">Shared Secret (HMAC-SHA256) *</label>
        <input type="text" id="w-sec" class="form-control" required value="xyz_webhook_secret_key_12345">
      </div>
      <div class="form-group">
        <label class="form-label">Event Triggers</label>
        <select id="w-events" class="form-control" multiple style="height: 100px;">
          <option value="*" selected>All Events (*)</option>
          <option value="order.created">order.created</option>
          <option value="stock.low">stock.low</option>
          <option value="po.received">po.received</option>
        </select>
      </div>
    </form>
  `;

  openModal('Add Webhook Endpoint', content, async () => {
    try {
      const select = document.getElementById('w-events');
      const selectedEvents = Array.from(select.selectedOptions).map(o => o.value);
      const payload = {
        url: document.getElementById('w-url').value,
        secret: document.getElementById('w-sec').value,
        events: selectedEvents
      };
      await apiRequest('/api/integrations/webhooks', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Webhook registered successfully', 'success');
      closeModal();
      document.dispatchEvent(new CustomEvent('app:refresh-data'));
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}
