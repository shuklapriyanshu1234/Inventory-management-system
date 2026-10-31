import { apiRequest } from '../api.js';

export async function renderReports(container) {
  container.innerHTML = `<div style="text-align: center; padding: 3rem;">Loading analytics & demand forecast...</div>`;

  try {
    const forecast = await apiRequest('/api/reports/forecast');

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h3 style="font-size: 1.1rem; font-weight: 700;">Demand Forecasting & Optimal Reorder Analysis</h3>
          <p style="font-size: 0.85rem; color: var(--text-secondary);">Calculated using 30-day moving average demand, lead time, and safety buffer.</p>
        </div>
        <div>
          <button class="btn btn-primary btn-sm" id="btn-export-inventory-report">Export Full Inventory CSV</button>
        </div>
      </div>

      <div class="card-table">
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>On Hand</th>
                <th>Daily Demand</th>
                <th>Days Remaining</th>
                <th>Current Reorder</th>
                <th>Recommended Reorder Point</th>
                <th>Forecast Health</th>
              </tr>
            </thead>
            <tbody>
              ${forecast.map(f => `
                <tr>
                  <td><strong>${f.name}</strong><br><span style="font-size: 0.75rem; color: var(--text-muted);">${f.sku}</span></td>
                  <td>${f.category}</td>
                  <td><strong>${f.currentStock}</strong></td>
                  <td>${f.avgDailyDemand} units/day</td>
                  <td><strong>${f.daysOfInventoryRemaining} days</strong></td>
                  <td>${f.currentReorderLevel}</td>
                  <td><strong style="color: var(--primary);">${f.recommendedReorderPoint}</strong></td>
                  <td>
                    <span class="badge ${f.forecastStatus === 'CRITICAL_REORDER' ? 'badge-danger' : f.forecastStatus === 'ATTENTION_NEEDED' ? 'badge-warning' : 'badge-success'}">
                      ${f.forecastStatus}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('btn-export-inventory-report')?.addEventListener('click', () => {
      window.open('/api/reports/export?format=csv&type=inventory', '_blank');
    });

  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); padding: 2rem;">Error: ${err.message}</div>`;
  }
}
