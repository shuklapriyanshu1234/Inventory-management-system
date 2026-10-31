import { apiRequest } from '../api.js';
import { openModal, closeModal, showToast } from '../components/ui.js';

export async function renderProducts(container) {
  container.innerHTML = `<div style="text-align: center; padding: 3rem;">Loading product catalog...</div>`;

  try {
    const categories = await apiRequest('/api/products/categories');
    const { data: products, meta } = await apiRequest('/api/products?limit=50');

    container.innerHTML = `
      <div class="card-table">
        <div class="table-header">
          <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
            <input type="text" id="prod-search" class="form-control" style="width: 250px;" placeholder="Search SKU, barcode, name...">
            <select id="category-filter" class="form-control" style="width: 180px;">
              <option value="">All Categories</option>
              ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
          </div>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" id="btn-export-csv">Export CSV</button>
            <button class="btn btn-secondary btn-sm" id="btn-import-csv">Import CSV</button>
            <button class="btn btn-primary btn-sm" id="btn-create-product">+ Add Product</button>
          </div>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Barcode</th>
                <th>Category</th>
                <th>Price</th>
                <th>Cost</th>
                <th>Stock (Available / On Hand)</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="product-rows">
              ${renderProductTableRows(products)}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Bind Actions
    document.getElementById('btn-create-product')?.addEventListener('click', () => showProductModal(categories));
    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
      window.open('/api/products/export/csv', '_blank');
    });
    document.getElementById('btn-import-csv')?.addEventListener('click', showImportModal);

    const searchInput = document.getElementById('prod-search');
    const catSelect = document.getElementById('category-filter');
    const handleFilter = async () => {
      const q = encodeURIComponent(searchInput.value);
      const cat = catSelect.value;
      const res = await apiRequest(`/api/products?search=${q}&categoryId=${cat}`);
      document.getElementById('product-rows').innerHTML = renderProductTableRows(res.data);
      bindRowActions();
    };
    searchInput?.addEventListener('input', handleFilter);
    catSelect?.addEventListener('change', handleFilter);

    bindRowActions();
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); padding: 2rem;">Error: ${err.message}</div>`;
  }
}

function renderProductTableRows(products) {
  if (products.length === 0) {
    return `<tr><td colspan="9" style="text-align: center; padding: 2rem; color: var(--text-muted);">No products found</td></tr>`;
  }
  return products.map(p => `
    <tr>
      <td><strong>${p.name}</strong></td>
      <td><code>${p.sku}</code></td>
      <td><span style="font-family: monospace;">${p.barcode}</span></td>
      <td>${p.category.name}</td>
      <td>$${p.price.toFixed(2)}</td>
      <td>$${p.cost.toFixed(2)}</td>
      <td>
        <strong>${p.totalAvailable}</strong> / ${p.totalOnHand}
        ${p.isLowStock ? `<span class="badge badge-danger" style="margin-left: 0.4rem;">Low</span>` : ''}
        ${p.isOverStock ? `<span class="badge badge-warning" style="margin-left: 0.4rem;">Over</span>` : ''}
      </td>
      <td>
        <span class="badge ${p.isActive ? 'badge-success' : 'badge-danger'}">
          ${p.isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td>
        <button class="btn btn-secondary btn-sm btn-print-label" data-id="${p.id}">Label</button>
      </td>
    </tr>
  `).join('');
}

function bindRowActions() {
  document.querySelectorAll('.btn-print-label').forEach(btn => {
    btn.addEventListener('click', async () => {
      const prodId = btn.getAttribute('data-id');
      const label = await apiRequest(`/api/barcode-rfid/label/${prodId}`);
      openModal(`Barcode Label: ${label.sku}`, `
        <div style="text-align: center; padding: 1.5rem; border: 2px dashed var(--border-color); border-radius: 8px;">
          <h2 style="font-size: 1.2rem; margin-bottom: 0.25rem;">XYZ Retail Corp</h2>
          <h3 style="font-size: 1rem; color: var(--primary);">${label.name}</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted);">SKU: ${label.sku} | Price: $${label.price}</p>
          <div style="margin: 1.25rem 0;">
            <img src="${label.barcodeDataUrl}" alt="Barcode" style="max-width: 260px; height: 60px;">
          </div>
          <p style="font-family: monospace; font-size: 1.1rem; letter-spacing: 0.1em;">${label.barcode}</p>
        </div>
      `, () => {
        window.print();
        closeModal();
      });
    });
  });
}

function showProductModal(categories) {
  const content = `
    <form id="product-form">
      <div class="form-group">
        <label class="form-label">Product Name *</label>
        <input type="text" id="m-name" class="form-control" required placeholder="e.g. Ergonomic Office Chair">
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label class="form-label">SKU *</label>
          <input type="text" id="m-sku" class="form-control" required placeholder="e.g. CHAIR-ERG-01">
        </div>
        <div class="form-group">
          <label class="form-label">Barcode *</label>
          <input type="text" id="m-barcode" class="form-control" required placeholder="e.g. 793573187210">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Category *</label>
        <select id="m-category" class="form-control" required>
          ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label class="form-label">Selling Price ($) *</label>
          <input type="number" step="0.01" id="m-price" class="form-control" required value="19.99">
        </div>
        <div class="form-group">
          <label class="form-label">Unit Cost ($) *</label>
          <input type="number" step="0.01" id="m-cost" class="form-control" required value="10.00">
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label class="form-label">Reorder Level (Min)</label>
          <input type="number" id="m-reorder" class="form-control" value="10">
        </div>
        <div class="form-group">
          <label class="form-label">Max Capacity</label>
          <input type="number" id="m-max" class="form-control" value="100">
        </div>
      </div>
    </form>
  `;

  openModal('Add New Product', content, async () => {
    try {
      const payload = {
        name: document.getElementById('m-name').value,
        sku: document.getElementById('m-sku').value,
        barcode: document.getElementById('m-barcode').value,
        categoryId: document.getElementById('m-category').value,
        price: parseFloat(document.getElementById('m-price').value),
        cost: parseFloat(document.getElementById('m-cost').value),
        reorderLevel: parseInt(document.getElementById('m-reorder').value, 10),
        maxLevel: parseInt(document.getElementById('m-max').value, 10),
      };

      await apiRequest('/api/products', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      showToast('Product created successfully', 'success');
      closeModal();
      document.dispatchEvent(new CustomEvent('app:refresh-data'));
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function showImportModal() {
  const content = `
    <div class="form-group">
      <label class="form-label">Select CSV File</label>
      <input type="file" id="csv-file-input" accept=".csv" class="form-control">
      <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;">
        Format header required: sku, barcode, name, category, price, cost, reorderLevel
      </p>
    </div>
  `;

  openModal('Import Products from CSV', content, async () => {
    const fileInput = document.getElementById('csv-file-input');
    if (!fileInput?.files[0]) {
      showToast('Please select a file', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    try {
      const res = await apiRequest('/api/products/import/csv', {
        method: 'POST',
        body: formData
      });
      showToast(`Imported ${res.total} products successfully`, 'success');
      closeModal();
      document.dispatchEvent(new CustomEvent('app:refresh-data'));
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}
