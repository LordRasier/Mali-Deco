import { localCheckoutPageEnabled } from '../presentation-policy';
import { NotFoundException } from '@nestjs/common';
import type { PublicCatalog } from '../../modules/catalog/services/public-catalog';
import { demoCatalog } from '../catalog/shared/demo-catalog';
import { catalogImageUrl, fixtureImageId, productPresentation } from '../catalog/shared/editorial-art';
import type { Product } from '../catalog/shared/storefront-types';
import { canonicalProductUrl } from '../catalog/shared/product-url';
import { canonicalRoutes, type StorefrontRoutes } from '../routing/storefront-routes';

type Detail = Awaited<ReturnType<PublicCatalog['detail']>>;
type Model = { checkoutEnabled: boolean; layout: false; routes: StorefrontRoutes; mode: 'demo' | 'api'; demo: boolean; ready: boolean; brand: string; title: string; name: string; description: string;
  bootstrap: string; variants: { name: string; id: string }[]; hasVariants: boolean; moreImages: boolean;
  images: { url: string; srcset: string; alt: string; first: boolean; illustration: boolean; position: number }[];
  dimensions: { width: string; height: string; length: string }; message: string; canonical: string; retry: boolean };

function demoDetail(product: Product): Detail {
  return { id: product.id, slug: product.slug, name: product.name, description: product.description,
    bulkWarningThreshold: product.bulkWarningThreshold ?? null, bulkWarningMessage: product.bulkWarningMessage ?? null,
    productWidthMm: null, productHeightMm: null, productLengthMm: null, category: product.category ?? null, images: [],
    variants: product.variants.map(variant => ({ id: variant.id, name: variant.name, priceMinor: variant.priceMinor, currency: variant.currency,
      supplyMode: variant.supplyMode ?? null, stockQuantity: variant.stockQuantity ?? 0, material: variant.material ?? null, color: variant.colorInfo ?? null })), page: 1, limit: 100, total: product.variants.length };
}

/** Only a product lookup 404 is absence; settings/configuration failures remain unavailable. */
export class ProductPage {
  constructor(private readonly catalog: Pick<PublicCatalog, 'settings' | 'detail'>, private readonly mode: 'demo' | 'api',
    private readonly environment: { NODE_ENV?: string; LOCAL_TEST_CHECKOUT_ENABLED?: string; DEV_FIXTURE_PRODUCT_ID?: string; PUBLIC_SITE_URL?: string } = {}, private readonly routes: StorefrontRoutes = canonicalRoutes) {}

  async read(slug: string) {
    const model: Model = { layout: false, routes: this.routes, checkoutEnabled: localCheckoutPageEnabled(this.environment, this.mode), mode: this.mode, demo: this.mode === 'demo', ready: false, brand: 'Tienda', title: 'Producto no disponible', name: '', description: '',
      bootstrap: '', variants: [], hasVariants: false, images: [], moreImages: false, dimensions: { width: '', height: '', length: '' }, message: 'No pudimos cargar el producto. Intentá nuevamente.', canonical: '', retry: true };
    try {
      const settings = this.mode === 'demo' ? { name: demoCatalog.brand } : await this.catalog.settings();
      if (typeof settings.name !== 'string' || !settings.name.trim()) throw new Error('Invalid public brand');
      model.brand = settings.name.trim();
    } catch { return { status: 503, model }; }
    try {
      const demo = this.mode === 'demo' ? demoCatalog.products.find(product => product.slug === slug) : undefined;
      let detail: Detail;
      if (this.mode === 'demo') {
        if (!demo) throw new NotFoundException();
        detail = demoDetail(demo);
      } else detail = await this.catalog.detail(slug, { page: '1', limit: '100' });
      model.title = model.name = detail.name; model.description = detail.description;
      model.canonical = this.mode === 'api' ? canonicalProductUrl(this.environment.PUBLIC_SITE_URL, slug) ?? '' : '';
      model.bootstrap = JSON.stringify(detail); // Template escapes this as an HTML attribute, never as executable script.
      model.variants = detail.variants.map(({ id, name }) => ({ id, name })); model.hasVariants = !!detail.variants.length;
      const dimension = (value: number | null) => this.mode === 'demo' ? 'No disponible en esta vista' : value === null ? 'No informado' : `${value} mm`;
      model.dimensions = { width: dimension(detail.productWidthMm), height: dimension(detail.productHeightMm), length: dimension(detail.productLengthMm) };
      model.images = detail.images.map((image, index) => ({ url: catalogImageUrl(image.id, 800), srcset: `${catalogImageUrl(image.id, 800)} 800w, ${catalogImageUrl(image.id, 1600)} 1600w`,
        alt: image.alt || `${detail.name}, imagen del producto`, first: index === 0, illustration: false, position: index + 1 }));
      if (!model.images.length) {
        const product = demo ?? { id: detail.id, slug: detail.slug, name: detail.name, description: detail.description, variants: [] };
        const fallback = productPresentation(product, this.mode, fixtureImageId(this.environment));
        if (fallback.image) model.images = [{ url: fallback.image, srcset: '', alt: `${detail.name}, imagen ilustrativa`, first: true, illustration: fallback.illustration, position: 1 }];
      }
      model.moreImages = detail.images.length > 1; model.ready = true; model.message = '';
      return { status: 200, model };
    } catch (error) {
      if (error instanceof NotFoundException) { model.title = 'Producto no encontrado'; model.message = 'Este producto no está disponible.'; model.retry = false; return { status: 404, model }; }
      return { status: 503, model };
    }
  }
}
