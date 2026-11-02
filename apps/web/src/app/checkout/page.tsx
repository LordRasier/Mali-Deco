import { notFound } from 'next/navigation';
import CheckoutView from '../../components/CheckoutView';
import { loadApiBrand } from '../../lib/api-catalog';
import { localCheckoutEnabled } from '../../lib/checkout-config';
import { selectDataMode } from '../../lib/data-mode';
import '../checkout.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Checkout de prueba | Tienda', robots: { index: false, follow: false } };

export default async function CheckoutPage() {
  if (!localCheckoutEnabled(process.env)) notFound();
  let mode: ReturnType<typeof selectDataMode>;
  try { mode = selectDataMode(process.env); } catch {
    return <main className="catalog-error"><h1>El checkout de prueba no está disponible.</h1><a href="/carrito">Volver al carrito</a></main>;
  }
  if (mode !== 'api') notFound();
  try {
    const brand = await loadApiBrand(process.env.API_BASE_URL!);
    return <CheckoutView brand={brand} />;
  } catch {
    return <main className="catalog-error"><h1>El checkout de prueba no está disponible.</h1><a href="/carrito">Volver al carrito</a></main>;
  }
}
