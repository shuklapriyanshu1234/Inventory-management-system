import { apiRequest } from '../api.js';
import { openModal, closeModal, showToast } from '../components/ui.js';

export async function renderSuppliers(container) {
  container.innerHTML = `<div style="text-align: center; padding: 3rem;">Loading supplier and PO management...</div>`;

  try {
    const suppliers = await apiRequest('/api/suppliers');
    const { data: pos } = await apiRequest('/api/suppliers/purchase-orders?limit=50');
    const suggestions = await apiRequest('/api/suppliers/reorder-suggestions');
    const locations = await apiRequest('/api/locations');

    container.innerHTML = `
      <!-- Low Stock Reorder Suggestions & Auto-Drafting -->
      ${suggestions.length > 0 ? `
        <div style="background: var(--warning-light); border: 1px solid var(--warning); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 2rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <strong style="color: var(--warning); font-size: 1.05rem;">&#9888; ${suggestions.length} Low-Stock Items Need Reordering</strong>
              <div style="font-size: 0.85rem; color: var(--text-secondary);">Stock is below safety thresholds. Review suggested replenishment batches.</div>
            </div>
            <button class="btn btn-primary btn-sm" id="btn-auto-draft-po">&#9889; Auto-Draft Purchase Order</button>
          </div>
          <div style="display: flex; gap: 0.75rem; overflow-x: auto; padding-bottom: 0.5rem;">
            ${suggestions.map(s => `
              <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.75rem; min-width: 220px; font-size: 0.85rem;">
                <strong>${s.name}</strong><br>
                <code>${s.sku}</code><br>
                Current: <strong style="color: var(--danger);">${s.currentStock}</strong> / Min: ${s.reorderLevel}<br>
                Suggested PO: <strong>+${s.suggestedQuantity} units</strong> ($${s.estimatedCost.toFixed(2)})
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <h3 style="font-size: 1.1rem; font-weight: 700;">Purchase Orders & Goods Receiving</h3>
        <button class="btn btn-primary btn-sm" id="btn-create-po">+ Create Purchase Order</button>
      </div>

      <div class="card-table">
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>PO #</th>
                <th>Supplier</th>
                <th>Destination</th>
                <th>Total Cost</th>
                <th>Status</th>
                <th>Expected Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${pos.length === 0 ? `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">No purchase orders found</td></tr>` : ''}
              ${pos.map(po => `
                <tr>
                  <td><strong>${po.poNumber}</strong></td>
                  <td>${po.supplier.name}</td>
                  <td>${po.destinationLocation.name}</td>
                  <td>$${po.totalAmount.toFixed(2)}</td>
                  <td>
                    <span class="badge ${po.status === 'RECEIVED' ? 'badge-success' : po.status === 'DRAFT' ? 'badge-secondary' : 'badge-warning'}">
                      ${po.status}
                    </span>
                  </td>
                  <td>${po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : 'N/A'}</td>
                  <td>
                    ${po.status !== 'RECEIVED' && po.status !== 'CANCELLED' ? `
                      <button class="btn btn-secondary btn-sm btn-receive-po" data-id="${po.id}">Receive Goods</button>
                    ` : `<span style="font-size: 0.8rem; color: var(--text-muted);">Completed</span>`}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Supplier Performance Metrics -->
      <div class="card-table" style="margin-top: 2rem;">
        <div class="table-header">
          <h3 style="font-size: 1.05rem; font-weight: 700;">Supplier Performance Directory</h3>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Supplier Name</th>
                <th>Contact</th>
                <th>Email / Phone</th>
                <th>Avg Lead Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${suppliers.map(s => `
                <tr>
                  <td><strong>${s.name}</strong></td>
                  <td>${s.contactName || 'N/A'}</td>
                  <td>${s.email || ''} ${s.phone || ''}</td>
                  <td>${s.leadTimeDays} days</td>
                  <td><span class="badge ${s.isActive ? 'badge-success' : 'badge-danger'}">${s.isActive ? 'Active' : 'Inactive'}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Auto draft handler
    document.getElementById('btn-auto-draft-po')?.addEventListener('click', async () => {
      try {
        await apiRequest('/api/suppliers/auto-draft-po', {
          method: 'POST',
          body: JSON.stringify({
            supplierId: suppliers[0].id,
            destinationLocationId: locations[0].id
          })
        });
        showToast('Auto-draft purchase order created successfully', 'success');
        document.dispatchEvent(new CustomEvent('app:refresh-data'));
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Create PO modal
    document.getElementById('btn-create-po')?.addEventListener('click', async () => {
      const products = await apiRequest('/api/products?limit=100');
      showCreatePoModal(suppliers, locations, products.data);
    });

    // Receive Goods
    document.querySelectorAll('.btn-receive-po').forEach(btn => {
      btn.addEventListener('click', async () => {
        const poId = btn.getAttribute('data-id');
        const po = pos.find(p => p.id === poId);

        const content = `
          <p style="margin-bottom: 1rem;">
            Receiving for <strong>${po.poNumber}</strong> at <strong>${po.destinationLocation.name}</strong>
          </p>
          <div style="border: 1px solid var(--border-color); border-radius: 6px; padding: 0.75rem;">
            ${po.items.map(item => `
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                <div>
                  <strong>${item.product.name}</strong><br>
                  <span style="font-size: 0.8rem; color: var(--text-muted);">Ordered: ${item.orderedQuantity} | Previously Received: ${item.receivedQuantity}</span>
                </div>
                <div style="width: 110px;">
                  <input type="number" class="form-control po-receive-input" data-prod-id="${item.productId}" value="${item.orderedQuantity - item.receivedQuantity}" min="1" max="${item.orderedQuantity - item.receivedQuantity}">
                </div>
              </div>
            `).join('')}
          </div>
        `;

        openModal('Receive Goods to Inventory', content, async () => {
          try {
            const inputs = document.querySelectorAll('.po-receive-input');
            const itemsToReceive = Array.from(inputs).map(inp => ({
              productId: inp.getAttribute('data-prod-id'),
              receivedQuantity: parseInt(inp.value, 10)
            })).filter(i => i.receivedQuantity > 0);

            await apiRequest(`/api/suppliers/purchase-orders/${poId}/receive`, {
              method: 'POST',
              body: JSON.stringify({ items: itemsToReceive })
            });

            showToast('Goods received: Stock levels updated and ledger logged', 'success');
            closeModal();
            document.dispatchEvent(new CustomEvent('app:refresh-data'));
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    });

  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); padding: 2rem;">Error: ${err.message}</div>`;
  }
}

function showCreatePoModal(suppliers, locations, products) {
  const content = `
    <form id="new-po-form">
      <div class="form-group">
        <label class="form-label">Supplier *</label>
        <select id="po-supplier" class="form-control" required>
          ${suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Destination Warehouse *</label>
        <select id="po-loc" class="form-control" required>
          ${locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Product *</label>
        <select id="po-prod" class="form-control" required>
          ${products.map(p => `<option value="${p.id}" data-cost="${p.cost}">${p.name} (Cost: $${p.cost})</option>`).join('')}
        </select>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label class="form-label">Order Quantity *</label>
          <input type="number" id="po-qty" class="form-control" min="1" value="25" required>
        </div>
        <div class="form-group">
          <label class="form-label">Unit Cost ($) *</label>
          <input type="number" step="0.01" id="po-cost" class="form-control" value="10.00" required>
        </div>
      </div>
    </form>
  `;

  openModal('Create New Purchase Order', content, async () => {
    try {
      const payload = {
        supplierId: document.getElementById('po-supplier').value,
        destinationLocationId: document.getElementById('po-loc').value,
        items: [{
          productId: document.getElementById('po-prod').value,
          orderedQuantity: parseInt(document.getElementById('po-qty').value, 10),
          unitCost: parseFloat(document.getElementById('po-cost').value)
        }]
      };

      await apiRequest('/api/suppliers/purchase-orders', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      showToast('Purchase order drafted successfully', 'success');
      closeModal();
      document.dispatchEvent(new CustomEvent('app:refresh-data'));
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}
