import Storefront from '../components/Storefront';
import { loadApiCatalog } from '../lib/api-catalog';
import { selectDataMode } from '../lib/data-mode';
import { demoCatalog } from '../lib/demo-catalog';

export const dynamic = 'force-dynamic';

export default async function Home() {
  try {
    const mode = selectDataMode(process.env);
    const data = mode === 'demo' ? demoCatalog : await loadApiCatalog(process.env.API_BASE_URL!);
    return <Storefront data={data} />;
  } catch {
    // Do not substitute generated products or conceal an unavailable published catalog.
    return <main className="catalog-error"><h1>La tienda no está disponible por el momento.</h1><p>El catálogo no pudo cargarse. Intentá nuevamente más tarde.</p></main>;
  }
}
