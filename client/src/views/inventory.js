import { apiRequest } from '../api.js';
import { openModal, closeModal, showToast } from '../components/ui.js';

export async function renderInventory(container) {
  container.innerHTML = `<div style="text-align: center; padding: 3rem;">Loading inventory data...</div>`;

  try {
    const locations = await apiRequest('/api/locations');
    const stocks = await apiRequest('/api/inventory/stock');

    container.innerHTML = `
      <div style="display: flex; gap: 0.75rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
        <button class="btn btn-primary btn-sm" id="btn-adjust-stock">&#177; Manual Adjustment</button>
        <button class="btn btn-secondary btn-sm" id="btn-transfer-stock">&harr; Stock Transfer</button>
        <button class="btn btn-secondary btn-sm" id="btn-cycle-count">&#9745; Physical Count / Reconciliation</button>
        <button class="btn btn-secondary btn-sm" id="btn-view-ledger">&#128220; Movement Ledger</button>
      </div>

      <div class="card-table">
        <div class="table-header">
          <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
            <input type="text" id="inv-search" class="form-control" style="width: 250px;" placeholder="Filter by product, SKU...">
            <select id="inv-location-filter" class="form-control" style="width: 200px;">
              <option value="">All Locations</option>
              ${locations.map(l => `<option value="${l.id}">${l.name} (${l.code})</option>`).join('')}
            </select>
            <select id="inv-status-filter" class="form-control" style="width: 150px;">
              <option value="">All Statuses</option>
              <option value="low_stock">Low Stock Only</option>
              <option value="overstock">Overstock Only</option>
            </select>
          </div>
        </div>

        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Facility</th>
                <th>On Hand</th>
                <th>Reserved</th>
                <th>Available</th>
                <th>Valuation</th>
                <th>Alert Status</th>
              </tr>
            </thead>
            <tbody id="inventory-rows">
              ${renderInventoryRows(stocks)}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Filter Listeners
    const searchInput = document.getElementById('inv-search');
    const locFilter = document.getElementById('inv-location-filter');
    const statusFilter = document.getElementById('inv-status-filter');

    const updateFilter = async () => {
      const q = encodeURIComponent(searchInput.value);
      const loc = locFilter.value;
      const st = statusFilter.value;
      const res = await apiRequest(`/api/inventory/stock?search=${q}&locationId=${loc}&filter=${st}`);
      document.getElementById('inventory-rows').innerHTML = renderInventoryRows(res);
    };

    searchInput?.addEventListener('input', updateFilter);
    locFilter?.addEventListener('change', updateFilter);
    statusFilter?.addEventListener('change', updateFilter);

    // Modal Triggers
    document.getElementById('btn-adjust-stock')?.addEventListener('click', () => showAdjustmentModal(locations));
    document.getElementById('btn-transfer-stock')?.addEventListener('click', () => showTransferModal(locations));
    document.getElementById('btn-cycle-count')?.addEventListener('click', () => showCycleCountModal(locations));
    document.getElementById('btn-view-ledger')?.addEventListener('click', () => {
      window.open('/api/inventory/ledger/export/csv', '_blank');
    });

  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); padding: 2rem;">Error: ${err.message}</div>`;
  }
}

function renderInventoryRows(stocks) {
  if (stocks.length === 0) {
    return `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">No stock records found</td></tr>`;
  }
  return stocks.map(s => `
    <tr>
      <td><strong>${s.productName}</strong></td>
      <td><code>${s.sku}</code></td>
      <td>${s.locationName} <span style="font-size: 0.75rem; color: var(--text-muted);">(${s.locationCode})</span></td>
      <td><strong>${s.quantityOnHand}</strong></td>
      <td>${s.quantityReserved}</td>
      <td><strong style="color: var(--primary);">${s.quantityAvailable}</strong></td>
      <td>$${s.totalValue.toFixed(2)}</td>
      <td>
        ${s.isLowStock ? `<span class="badge badge-danger">Below Reorder (${s.reorderLevel})</span>` : ''}
        ${s.isOverStock ? `<span class="badge badge-warning">Overstock (${s.maxLevel})</span>` : ''}
        ${!s.isLowStock && !s.isOverStock ? `<span class="badge badge-success">Optimal</span>` : ''}
      </td>
    </tr>
  `).join('');
}

async function showAdjustmentModal(locations) {
  const products = await apiRequest('/api/products?limit=100');

  const content = `
    <form id="adjust-form">
      <div class="form-group">
        <label class="form-label">Location *</label>
        <select id="adj-loc" class="form-control" required>
          ${locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Product *</label>
        <select id="adj-prod" class="form-control" required>
          ${products.data.map(p => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('')}
        </select>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label class="form-label">Action *</label>
          <select id="adj-type" class="form-control" required>
            <option value="ADJUSTMENT_IN">Add Stock (+)</option>
            <option value="ADJUSTMENT_OUT">Deduct Stock (-)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Quantity *</label>
          <input type="number" id="adj-qty" class="form-control" min="1" value="5" required>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Reason *</label>
        <input type="text" id="adj-reason" class="form-control" required placeholder="e.g. Found extra uncounted box / damaged goods">
      </div>
    </form>
  `;

  openModal('Manual Stock Adjustment', content, async () => {
    try {
      const payload = {
        locationId: document.getElementById('adj-loc').value,
        productId: document.getElementById('adj-prod').value,
        type: document.getElementById('adj-type').value,
        quantity: parseInt(document.getElementById('adj-qty').value, 10),
        reason: document.getElementById('adj-reason').value
      };

      await apiRequest('/api/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      showToast('Stock adjustment applied and ledger updated', 'success');
      closeModal();
      document.dispatchEvent(new CustomEvent('app:refresh-data'));
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

async function showTransferModal(locations) {
  const products = await apiRequest('/api/products?limit=100');

  const content = `
    <form id="transfer-form">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label class="form-label">Source Location *</label>
          <select id="trf-src" class="form-control" required>
            ${locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Target Location *</label>
          <select id="trf-dst" class="form-control" required>
            ${locations.map((l, idx) => `<option value="${l.id}" ${idx === 1 ? 'selected' : ''}>${l.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Product *</label>
        <select id="trf-prod" class="form-control" required>
          ${products.data.map(p => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Transfer Quantity *</label>
        <input type="number" id="trf-qty" class="form-control" min="1" value="10" required>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <input type="text" id="trf-notes" class="form-control" placeholder="e.g. Weekly replenishment transfer">
      </div>
    </form>
  `;

  openModal('Transfer Stock Between Locations', content, async () => {
    try {
      const payload = {
        sourceLocationId: document.getElementById('trf-src').value,
        targetLocationId: document.getElementById('trf-dst').value,
        notes: document.getElementById('trf-notes').value,
        items: [{
          productId: document.getElementById('trf-prod').value,
          quantity: parseInt(document.getElementById('trf-qty').value, 10)
        }]
      };

      await apiRequest('/api/inventory/transfers', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      showToast('Stock transfer initiated (In-Transit)', 'success');
      closeModal();
      document.dispatchEvent(new CustomEvent('app:refresh-data'));
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

async function showCycleCountModal(locations) {
  const products = await apiRequest('/api/products?limit=20');

  const content = `
    <form id="count-form">
      <div class="form-group">
        <label class="form-label">Location for Physical Count *</label>
        <select id="cnt-loc" class="form-control" required>
          ${locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
        </select>
      </div>
      <p style="font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">Sample Cycle Count Items:</p>
      <div style="max-height: 250px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; padding: 0.75rem;">
        ${products.data.slice(0, 5).map((p, idx) => `
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; gap: 1rem;">
            <div style="font-size: 0.85rem; flex: 1;">
              <strong>${p.name}</strong><br>
              <span style="color: var(--text-muted); font-size: 0.75rem;">${p.sku}</span>
            </div>
            <div style="width: 100px;">
              <input type="number" class="form-control count-item-input" data-prod-id="${p.id}" value="${Math.max(0, p.totalOnHand)}" min="0" placeholder="Counted">
            </div>
          </div>
        `).join('')}
      </div>
      <div class="form-group" style="margin-top: 1rem;">
        <label class="form-label">Notes</label>
        <input type="text" id="cnt-notes" class="form-control" value="Bi-weekly cycle count batch">
      </div>
    </form>
  `;

  openModal('Start & Reconcile Physical Stock Count', content, async () => {
    try {
      const inputs = document.querySelectorAll('.count-item-input');
      const items = Array.from(inputs).map(inp => ({
        productId: inp.getAttribute('data-prod-id'),
        countedQuantity: parseInt(inp.value, 10) || 0
      }));

      const locationId = document.getElementById('cnt-loc').value;
      const notes = document.getElementById('cnt-notes').value;

      // 1. Create Stock Count
      const countRes = await apiRequest('/api/inventory/counts', {
        method: 'POST',
        body: JSON.stringify({ locationId, notes, items })
      });

      // 2. Automatically Reconcile variances
      await apiRequest(`/api/inventory/counts/${countRes.id}/reconcile`, {
        method: 'POST'
      });

      showToast(`Stock count ${countRes.countNumber} reconciled and ledger updated`, 'success');
      closeModal();
      document.dispatchEvent(new CustomEvent('app:refresh-data'));
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}
