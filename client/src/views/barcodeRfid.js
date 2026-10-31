import { apiRequest } from '../api.js';
import { openModal, closeModal, showToast } from '../components/ui.js';

let html5QrCode = null;

export async function renderBarcodeRfid(container) {
  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1.5rem;">
      
      <!-- Barcode Scanner Card (USB Scanner & Phone Camera) -->
      <div class="card-table">
        <div class="table-header">
          <h3 style="font-size: 1.05rem; font-weight: 700;">&#128247; Barcode & Camera Scanner</h3>
        </div>
        <div style="padding: 1.5rem;">
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
            Works with any standard <strong>USB barcode scanner</strong> (type or scan into input) or live camera scan.
          </p>

          <div class="form-group">
            <label class="form-label">Barcode / SKU Input</label>
            <div style="display: flex; gap: 0.5rem;">
              <input type="text" id="scan-input" class="form-control" autofocus placeholder="Scan barcode here or press Enter...">
              <button class="btn btn-primary" id="btn-scan-lookup">Lookup</button>
            </div>
          </div>

          <div style="margin: 1.25rem 0;">
            <button class="btn btn-secondary btn-sm" id="btn-toggle-camera">&#128248; Start Camera Scanner</button>
          </div>

          <div id="reader-container" style="display: none; margin-bottom: 1rem; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-color);">
            <div id="qr-reader" style="width: 100%;"></div>
          </div>

          <!-- Scan Lookup Result Display -->
          <div id="scan-result-card" style="display: none; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; margin-top: 1rem;"></div>
        </div>
      </div>

      <!-- RFID Hardware Integration & Mock Portal Reader -->
      <div class="card-table">
        <div class="table-header">
          <h3 style="font-size: 1.05rem; font-weight: 700;">&#128225; RFID Reader Interface</h3>
        </div>
        <div style="padding: 1.5rem;">
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
            Hardware abstraction interface for fixed portal / handheld RFID readers (e.g. Zebra FX9600, Impinj Speedway).
          </p>

          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem;">
            <div>
              <span class="badge badge-success">&#9679; Connected</span>
              <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 0.5rem;">Model: Zebra-FX9600-Sim</span>
            </div>
            <button class="btn btn-primary btn-sm" id="btn-trigger-rfid">&#128225; Trigger Portal Scan</button>
          </div>

          <div class="table-responsive" style="max-height: 280px; overflow-y: auto;">
            <table>
              <thead>
                <tr>
                  <th>EPC Tag</th>
                  <th>SKU</th>
                  <th>Signal (dBm)</th>
                </tr>
              </thead>
              <tbody id="rfid-tags-rows">
                <tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Click 'Trigger Portal Scan' to read RFID EPC tags</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  `;

  // Bind Barcode Lookup
  const scanInput = document.getElementById('scan-input');
  const triggerLookup = async () => {
    const code = scanInput.value.trim();
    if (!code) return;
    try {
      const res = await apiRequest(`/api/barcode-rfid/lookup/${encodeURIComponent(code)}`);
      displayScanResult(res);
      showToast(`Found: ${res.product.name}`, 'success');
    } catch (err) {
      displayScanError(code, err.message);
    }
  };

  scanInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') triggerLookup();
  });
  document.getElementById('btn-scan-lookup')?.addEventListener('click', triggerLookup);

  // Camera Scanner Handler
  const cameraBtn = document.getElementById('btn-toggle-camera');
  const readerBox = document.getElementById('reader-container');

  cameraBtn?.addEventListener('click', () => {
    if (readerBox.style.display === 'none') {
      readerBox.style.display = 'block';
      cameraBtn.innerText = '⏹ Stop Camera Scanner';
      startCamera();
    } else {
      stopCamera();
      readerBox.style.display = 'none';
      cameraBtn.innerText = '📷 Start Camera Scanner';
    }
  });

  // RFID Trigger Handler
  document.getElementById('btn-trigger-rfid')?.addEventListener('click', async () => {
    try {
      showToast('Reading RFID portal field...', 'info');
      const res = await apiRequest('/api/barcode-rfid/rfid/scan', { method: 'POST' });
      document.getElementById('rfid-tags-rows').innerHTML = res.tags.map(t => `
        <tr>
          <td><code style="font-size: 0.75rem;">${t.epc}</code></td>
          <td><strong>${t.sku}</strong></td>
          <td>${t.rssi} dBm</td>
        </tr>
      `).join('');
      showToast(`Detected ${res.scannedCount} RFID tags in field`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function displayScanResult({ product, totalOnHand, totalReserved, totalAvailable }) {
  const resultCard = document.getElementById('scan-result-card');
  resultCard.style.display = 'block';
  resultCard.innerHTML = `
    <h4 style="font-size: 1rem; color: var(--primary); margin-bottom: 0.25rem;">${product.name}</h4>
    <div style="font-size: 0.85rem; margin-bottom: 0.75rem;">
      SKU: <code>${product.sku}</code> | Barcode: <code>${product.barcode}</code> | Category: <strong>${product.category.name}</strong>
    </div>
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; text-align: center; background: var(--bg-surface); border-radius: 6px; padding: 0.5rem;">
      <div><span style="font-size: 0.75rem; color: var(--text-muted);">On Hand</span><br><strong>${totalOnHand}</strong></div>
      <div><span style="font-size: 0.75rem; color: var(--text-muted);">Reserved</span><br><strong>${totalReserved}</strong></div>
      <div><span style="font-size: 0.75rem; color: var(--text-muted);">Available</span><br><strong style="color: var(--success);">${totalAvailable}</strong></div>
    </div>
  `;
}

function displayScanError(code, message) {
  const resultCard = document.getElementById('scan-result-card');
  resultCard.style.display = 'block';
  resultCard.innerHTML = `
    <div style="color: var(--danger); font-size: 0.9rem;">
      <strong>Item Not Found:</strong> Could not find product with Barcode/SKU "${code}". (${message})
    </div>
  `;
}

function startCamera() {
  if (typeof Html5Qrcode === 'undefined') {
    showToast('Html5Qrcode scanner library not loaded', 'error');
    return;
  }

  html5QrCode = new Html5Qrcode('qr-reader');
  html5QrCode.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      document.getElementById('scan-input').value = decodedText;
      document.getElementById('btn-scan-lookup').click();
      stopCamera();
      document.getElementById('reader-container').style.display = 'none';
      document.getElementById('btn-toggle-camera').innerText = '📷 Start Camera Scanner';
    },
    (errorMessage) => {
      // scan error/seeking
    }
  ).catch(err => {
    showToast(`Camera access error: ${err}`, 'error');
  });
}

function stopCamera() {
  if (html5QrCode) {
    html5QrCode.stop().catch(() => {}).then(() => {
      html5QrCode = null;
    });
  }
}
