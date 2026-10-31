import { apiRequest } from '../api.js';
import { openModal, closeModal, showToast } from '../components/ui.js';

export async function renderOrders(container) {
  container.innerHTML = `<div style="text-align: center; padding: 3rem;">Loading sales orders...</div>`;

  try {
    const { data: orders } = await apiRequest('/api/orders?limit=50');
    const customers = await apiRequest('/api/orders/customers');
    const locations = await apiRequest('/api/locations');
    const products = await apiRequest('/api/products?limit=100');

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <button class="btn btn-primary btn-sm" id="btn-create-order">+ New Sales Order</button>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <input type="text" id="order-search" class="form-control" style="width: 250px;" placeholder="Search order # or customer...">
        </div>
      </div>

      <div class="card-table">
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer</th>
                <th>Fulfillment Center</th>
                <th>Total ($)</th>
                <th>Items</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="orders-rows">
              ${renderOrderRows(orders)}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('btn-create-order')?.addEventListener('click', () => showCreateOrderModal(customers, locations, products.data));
    bindOrderRowActions();

  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); padding: 2rem;">Error: ${err.message}</div>`;
  }
}

function renderOrderRows(orders) {
  if (orders.length === 0) {
    return `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">No sales orders found</td></tr>`;
  }

  const statusBadges = {
    PLACED: 'badge-primary',
    PICKED: 'badge-warning',
    PACKED: 'badge-warning',
    SHIPPED: 'badge-success',
    DELIVERED: 'badge-success',
    CANCELLED: 'badge-danger'
  };

  return orders.map(o => `
    <tr>
      <td><strong>${o.orderNumber}</strong></td>
      <td>${o.customer.name}</td>
      <td>${o.location.name}</td>
      <td>$${o.totalAmount.toFixed(2)}</td>
      <td>${o.items.length} lines</td>
      <td><span class="badge ${statusBadges[o.status] || 'badge-secondary'}">${o.status}</span></td>
      <td>${new Date(o.createdAt).toLocaleDateString()}</td>
      <td>
        <button class="btn btn-secondary btn-sm btn-order-action" data-id="${o.id}">Manage</button>
        <button class="btn btn-secondary btn-sm btn-order-slip" data-id="${o.id}">Print Slip</button>
      </td>
    </tr>
  `).join('');
}

function bindOrderRowActions() {
  document.querySelectorAll('.btn-order-action').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = btn.getAttribute('data-id');
      const order = await apiRequest(`/api/orders/${orderId}`);

      const content = `
        <div style="margin-bottom: 1rem;">
          <p><strong>Order:</strong> ${order.orderNumber} | <strong>Customer:</strong> ${order.customer.name}</p>
          <p><strong>Current Status:</strong> <span class="badge badge-primary">${order.status}</span></p>
          <p><strong>Total:</strong> $${order.totalAmount.toFixed(2)}</p>
        </div>

        <h4 style="font-size: 0.95rem; margin-bottom: 0.5rem;">Items & Backorder Status:</h4>
        <div style="border: 1px solid var(--border-color); border-radius: 6px; padding: 0.75rem; margin-bottom: 1rem;">
          ${order.items.map(i => `
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.4rem;">
              <span><strong>${i.product.name}</strong> (${i.product.sku}) x ${i.quantity}</span>
              <span>
                ${i.backorderedQuantity > 0 ? `<span style="color: var(--danger); font-weight: 600;">Backordered: ${i.backorderedQuantity}</span>` : '<span style="color: var(--success);">Reserved 100%</span>'}
              </span>
            </div>
          `).join('')}
        </div>

        <h4 style="font-size: 0.95rem; margin-bottom: 0.5rem;">Timeline History:</h4>
        <div style="border: 1px solid var(--border-color); border-radius: 6px; padding: 0.75rem; margin-bottom: 1rem; max-height: 120px; overflow-y: auto;">
          ${order.timeline.map(t => `
            <div style="font-size: 0.8rem; margin-bottom: 0.25rem;">
              <strong>${t.status}</strong> - ${t.notes || ''} <span style="color: var(--text-muted);">(${new Date(t.createdAt).toLocaleTimeString()})</span>
            </div>
          `).join('')}
        </div>

        <div class="form-group">
          <label class="form-label">Transition Order Status to:</label>
          <select id="update-order-status" class="form-control">
            <option value="PICKED" ${order.status === 'PLACED' ? 'selected' : ''}>PICKED</option>
            <option value="PACKED" ${order.status === 'PICKED' ? 'selected' : ''}>PACKED</option>
            <option value="SHIPPED" ${order.status === 'PACKED' ? 'selected' : ''}>SHIPPED (Deducts Stock)</option>
            <option value="DELIVERED" ${order.status === 'SHIPPED' ? 'selected' : ''}>DELIVERED</option>
            <option value="CANCELLED">CANCELLED (Releases Reservation)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <input type="text" id="update-order-notes" class="form-control" placeholder="e.g. Dispatched tracking #TRK-88992">
        </div>
      `;

      openModal(`Fulfillment: ${order.orderNumber}`, content, async () => {
        try {
          const status = document.getElementById('update-order-status').value;
          const notes = document.getElementById('update-order-notes').value;

          await apiRequest(`/api/orders/${orderId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status, notes })
          });

          showToast(`Order status updated to ${status}`, 'success');
          closeModal();
          document.dispatchEvent(new CustomEvent('app:refresh-data'));
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  });

  document.querySelectorAll('.btn-order-slip').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = btn.getAttribute('data-id');
      const slip = await apiRequest(`/api/orders/${orderId}/packing-slip`);

      openModal(`Packing Slip & Pick List: ${slip.orderNumber}`, `
        <div style="padding: 1.5rem; font-family: monospace; border: 1px solid var(--border-color); border-radius: 8px;">
          <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 0.5rem; margin-bottom: 1rem;">
            <h2>${slip.company}</h2>
            <h3>${slip.title}</h3>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 1rem; font-size: 0.9rem;">
            <div>
              <strong>Order #:</strong> ${slip.orderNumber}<br>
              <strong>Date:</strong> ${new Date(slip.orderDate).toLocaleDateString()}<br>
              <strong>Status:</strong> ${slip.status}
            </div>
            <div>
              <strong>Customer:</strong> ${slip.customer.name}<br>
              <strong>Address:</strong> ${slip.customer.address || 'N/A'}<br>
              <strong>Dispatch From:</strong> ${slip.dispatchLocation.name}
            </div>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 1rem;">
            <thead>
              <tr style="border-bottom: 1px solid #000;">
                <th style="text-align: left; padding: 4px;">SKU</th>
                <th style="text-align: left; padding: 4px;">Item</th>
                <th style="text-align: center; padding: 4px;">Ordered</th>
                <th style="text-align: center; padding: 4px;">Pick Qty</th>
                <th style="text-align: right; padding: 4px;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${slip.items.map(i => `
                <tr style="border-bottom: 1px dotted #ccc;">
                  <td style="padding: 4px;">${i.sku}</td>
                  <td style="padding: 4px;">${i.name}</td>
                  <td style="text-align: center; padding: 4px;">${i.ordered}</td>
                  <td style="text-align: center; padding: 4px; font-weight: bold;">[ ] ${i.pickQuantity}</td>
                  <td style="text-align: right; padding: 4px;">$${i.unitPrice.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="text-align: right; font-size: 1.1rem; font-weight: bold;">
            Total: $${slip.totalAmount.toFixed(2)}
          </div>
        </div>
      `, () => {
        window.print();
        closeModal();
      });
    });
  });
}

function showCreateOrderModal(customers, locations, products) {
  const content = `
    <form id="new-order-form">
      <div class="form-group">
        <label class="form-label">Customer *</label>
        <select id="ord-cust" class="form-control" required>
          ${customers.map(c => `<option value="${c.id}">${c.name} (${c.email})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Fulfillment Location *</label>
        <select id="ord-loc" class="form-control" required>
          ${locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Product *</label>
        <select id="ord-prod" class="form-control" required>
          ${products.map(p => `<option value="${p.id}">${p.name} ($${p.price})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Quantity *</label>
        <input type="number" id="ord-qty" class="form-control" min="1" value="2" required>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <input type="text" id="ord-notes" class="form-control" placeholder="e.g. Priority customer delivery">
      </div>
    </form>
  `;

  openModal('Place New Sales Order', content, async () => {
    try {
      const payload = {
        customerId: document.getElementById('ord-cust').value,
        locationId: document.getElementById('ord-loc').value,
        notes: document.getElementById('ord-notes').value,
        items: [{
          productId: document.getElementById('ord-prod').value,
          quantity: parseInt(document.getElementById('ord-qty').value, 10)
        }]
      };

      await apiRequest('/api/orders', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      showToast('Sales order placed and stock reserved', 'success');
      closeModal();
      document.dispatchEvent(new CustomEvent('app:refresh-data'));
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}
