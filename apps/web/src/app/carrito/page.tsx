import CartPageView from '../../components/CartPageView';
import { loadApiBrand } from '../../lib/api-catalog';
import { selectDataMode } from '../../lib/data-mode';
import { demoCatalog } from '../../lib/demo-catalog';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tu carrito | Tienda', robots: { index: false, follow: false } };

export default async function CartPage() {
  try {
    const mode = selectDataMode(process.env);
    const brand = mode === 'demo' ? demoCatalog.brand : await loadApiBrand(process.env.API_BASE_URL!).catch(() => 'Tienda');
    return <CartPageView mode={mode} brand={brand} />;
  } catch {
    return <main className="catalog-error"><h1>El carrito no está disponible por el momento.</h1><a href="/catalogo">Volver al catálogo</a></main>;
  }
}
