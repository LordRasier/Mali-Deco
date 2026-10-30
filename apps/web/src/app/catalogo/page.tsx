import CatalogListing from '../../components/CatalogListing';
import { loadApiBrand } from '../../lib/api-catalog';
import { selectDataMode } from '../../lib/data-mode';
import { demoCatalog } from '../../lib/demo-catalog';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Objetos | Tienda' };
export default async function CatalogPage() {
  try {
    const mode = selectDataMode(process.env);
    const brand = mode === 'demo' ? demoCatalog.brand : await loadApiBrand(process.env.API_BASE_URL!);
    return <CatalogListing mode={mode} brand={brand} />;
  } catch {
    return <main className="catalog-error"><h1>La tienda no está disponible por el momento.</h1><p>El catálogo no pudo cargarse. Intentá nuevamente más tarde.</p><a href="/">Volver al inicio</a></main>;
  }
}
