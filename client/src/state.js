// Global State & SSE Real-time Listener
import { showToast } from './components/ui.js';

export const state = {
  user: JSON.parse(localStorage.getItem('xyz_user') || 'null'),
  currentRoute: 'dashboard',
  theme: localStorage.getItem('xyz_theme') || 'light'
};

export function initSSE() {
  const evtSource = new EventSource('/api/inventory/sse');

  evtSource.addEventListener('stock:updated', (e) => {
    const data = JSON.parse(e.data);
    showToast(`Stock updated: Product ${data.productId.slice(0, 6)} - On Hand: ${data.quantityOnHand}`, 'info');
    document.dispatchEvent(new CustomEvent('app:refresh-data'));
  });

  evtSource.addEventListener('order:created', (e) => {
    const data = JSON.parse(e.data);
    showToast(`New order placed: ${data.orderNumber}`, 'success');
    document.dispatchEvent(new CustomEvent('app:refresh-data'));
  });

  evtSource.addEventListener('stock:po_received', (e) => {
    const data = JSON.parse(e.data);
    showToast(`PO goods received: ${data.poNumber}`, 'success');
    document.dispatchEvent(new CustomEvent('app:refresh-data'));
  });

  evtSource.onerror = () => {
    // Reconnection is handled automatically by EventSource
  };
}
