import { apiRequest } from '../api.js';

export async function renderDashboard(container) {
  container.innerHTML = `<div style="text-align: center; padding: 3rem;">Loading real-time KPIs...</div>`;

  try {
    const data = await apiRequest('/api/reports/dashboard');
    const { kpis, stockByLocation, topSellers, recentMovements } = data;

    container.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Total Inventory Value</div>
          <div class="kpi-value">$${kpis.totalInventoryValue.toLocaleString()}</div>
          <div class="kpi-subtext">Across all facilities</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Units on Hand</div>
          <div class="kpi-value">${kpis.totalStockOnHand.toLocaleString()}</div>
          <div class="kpi-subtext">Active items</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Stockout Risks (Low Stock)</div>
          <div class="kpi-value" style="color: var(--danger);">${kpis.lowStockCount}</div>
          <div class="kpi-subtext">Below reorder point</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Order Fulfillment Rate</div>
          <div class="kpi-value" style="color: var(--success);">${kpis.orderFulfillmentRate}%</div>
          <div class="kpi-subtext">Target: 95.0%</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Inventory Accuracy</div>
          <div class="kpi-value" style="color: var(--primary);">${kpis.inventoryAccuracyRate}%</div>
          <div class="kpi-subtext">Target: 98.0%</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Turnover Ratio</div>
          <div class="kpi-value">${kpis.inventoryTurnoverRate}x</div>
          <div class="kpi-subtext">Annualized COGS / Stock</div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        <!-- Stock Distribution by Location -->
        <div class="card-table" style="margin-bottom: 0;">
          <div class="table-header">
            <h3 style="font-size: 1.05rem; font-weight: 700;">Stock by Location</h3>
          </div>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Facility</th>
                  <th>Type</th>
                  <th>Units</th>
                  <th>Valuation</th>
                </tr>
              </thead>
              <tbody>
                ${stockByLocation.map(loc => `
                  <tr>
                    <td><strong>${loc.name}</strong></td>
                    <td><span class="badge ${loc.type === 'WAREHOUSE' ? 'badge-primary' : 'badge-success'}">${loc.type}</span></td>
                    <td>${loc.totalItems.toLocaleString()}</td>
                    <td>$${loc.value.toLocaleString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Top Selling Products -->
        <div class="card-table" style="margin-bottom: 0;">
          <div class="table-header">
            <h3 style="font-size: 1.05rem; font-weight: 700;">Top Performing Products</h3>
          </div>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Sold</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                ${topSellers.map(ts => `
                  <tr>
                    <td><strong>${ts.name || 'Product'}</strong></td>
                    <td><code>${ts.sku || 'SKU'}</code></td>
                    <td>${ts.unitsSold} units</td>
                    <td>$${ts.revenue.toLocaleString()}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Recent Stock Ledger Movements -->
      <div class="card-table">
        <div class="table-header">
          <h3 style="font-size: 1.05rem; font-weight: 700;">Recent Stock Movement Ledger</h3>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Product</th>
                <th>Location</th>
                <th>Type</th>
                <th>Change</th>
                <th>Quantity</th>
                <th>Reason / Reference</th>
              </tr>
            </thead>
            <tbody>
              ${recentMovements.map(m => `
                <tr>
                  <td>${new Date(m.createdAt).toLocaleTimeString()}</td>
                  <td><strong>${m.product.name}</strong></td>
                  <td>${m.location.name}</td>
                  <td><span class="badge ${m.changeQuantity > 0 ? 'badge-success' : 'badge-danger'}">${m.type}</span></td>
                  <td><strong>${m.changeQuantity > 0 ? '+' : ''}${m.changeQuantity}</strong></td>
                  <td>${m.beforeQuantity} &rarr; ${m.afterQuantity}</td>
                  <td>${m.reason || m.referenceType || 'Adjustment'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); padding: 2rem;">Failed to load dashboard: ${err.message}</div>`;
  }
}
