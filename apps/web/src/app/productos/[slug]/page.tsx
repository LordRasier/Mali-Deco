import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProductPageView from '../../../components/ProductPageView';
import { canonicalProductUrl, loadProductPage } from '../../../lib/product-page';
import { fixtureImageId } from '../../../lib/editorial-art';

type Props = { params: Promise<{ slug: string }> };
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadProductPage(slug);
  if (data.kind !== 'ready') return { title: 'Producto no disponible', robots: { index: false, follow: false } };
  const canonical = data.mode === 'api' ? canonicalProductUrl(process.env.PUBLIC_SITE_URL, slug) : undefined;
  return {
    title: `${data.product.name} | ${data.brand}`,
    description: data.product.description || undefined,
    ...(canonical ? { alternates: { canonical } } : {}),
    ...(data.mode === 'demo' ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function ProductRoute({ params }: Props) {
  const { slug } = await params;
  const data = await loadProductPage(slug);
  if (data.kind === 'missing') notFound();
  if (data.kind === 'unavailable') return <main className="catalog-error"><h1>El producto no está disponible por el momento.</h1><p>No pudimos consultar la tienda. Intentá nuevamente.</p><a href="">Reintentar</a></main>;
  return <ProductPageView data={data} fixtureImageId={fixtureImageId(process.env)} />;
}
