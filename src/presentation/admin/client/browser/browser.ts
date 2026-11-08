import '../admin.css';
import '../product-images.css';
import '../product-editor.css';
import '../variant-drawer.css';
import '../product-list.css';
import { sessionStore } from '../session-store';
import { mountAdmin } from './admin-dom';
import { installAdminLifecycle } from './admin-lifecycle';
import { registerAdminFeature } from './admin-features';
import { mountAdminProducts } from './products/product-dom';
import { mountSettings } from './settings/settings-browser';
import { mountOrders } from './orders/orders-browser';
import { mountAdminMedia } from './media/media-browser';
import { registerProductMedia } from './products/product-media';
import { mountClassifications } from './classifications/classification-dom';

registerAdminFeature('products', mountAdminProducts);
registerAdminFeature('settings', mountSettings);
registerAdminFeature('orders', mountOrders);
registerAdminFeature('classifications', mountClassifications);
registerProductMedia(mountAdminMedia);

const root = document.querySelector<HTMLElement>('[data-admin-root]');
if (root) {
  try { installAdminLifecycle(window, () => mountAdmin(root), () => { void sessionStore.retry(); }); }
  catch {
    const message = document.createElement('p'); message.setAttribute('role', 'alert');
    message.textContent = 'No se pudo iniciar esta vista. Recargue la página o utilice el administrador actual.'; root.append(message);
  }
}
