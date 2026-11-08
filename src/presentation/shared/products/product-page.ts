import { CatalogHttpError, fetchProductDetail, loadApiBrand } from '../catalog/api-catalog';
import { selectDataMode } from '../runtime/data-mode';
import { demoCatalog } from '../catalog/demo-catalog';
import type { Product } from '../catalog/storefront-types';

type Ready = { kind: 'ready'; mode: 'demo' | 'api'; brand: string; product: Product; page: number; total: number };
export type ProductPageData = Ready | { kind: 'missing' } | { kind: 'unavailable' };

/** Only a product endpoint 404 is absence; configuration and settings failures are unavailable. */
export async function loadProductPage(slug: string): Promise<ProductPageData> {
  let mode: 'demo' | 'api', brand: string;
  try {
    mode = selectDataMode(process.env);
    brand = mode === 'demo' ? demoCatalog.brand : await loadApiBrand(process.env.API_BASE_URL!);
  } catch { return { kind: 'unavailable' }; }
  if (mode === 'demo') {
    const product = demoCatalog.products.find(item => item.slug === slug);
    return product ? { kind: 'ready', mode, brand, product, page: 1, total: product.variants.length } : { kind: 'missing' };
  }
  try {
    const result = await fetchProductDetail(process.env.API_BASE_URL!, slug);
    return { kind: 'ready', mode, brand, product: result.product, page: result.page, total: result.total };
  } catch (error) {
    return error instanceof CatalogHttpError && error.status === 404 ? { kind: 'missing' } : { kind: 'unavailable' };
  }
}

export { canonicalProductUrl } from '../../catalog/shared/product-url';
