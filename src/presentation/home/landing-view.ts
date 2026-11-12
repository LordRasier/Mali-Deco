import { blockDefinitions, blockStyleChoices, type LandingBlock } from '../../shared/landing-layout';
import { contentHref, type ContentConfig } from '../../modules/settings/content-config';
import type { PublicCatalog } from '../../modules/catalog/services/public-catalog';
import type { PublicFacets } from '../../modules/catalog/services/public-facets';
import { catalogCards, publicProducts } from '../catalog/catalog-view';
import { categoryIcons, defaultCategoryPresentation } from '../../shared/category-presentation';
type ViewBlock = Record<string, unknown> & { columns: { id: string; blocks: ViewBlock[] }[] };
export async function landingView(config: ContentConfig, catalog: Pick<PublicCatalog, 'list' | 'selected'>, facets: Pick<PublicFacets, 'get'>, productRoute: string, preview: boolean) {
  let heading = false;
  const products = new Map<string, ReturnType<PublicCatalog['list']>>();
  let categories: ReturnType<PublicFacets['get']> | undefined;
  async function visit(blocks: LandingBlock[], path: string): Promise<ViewBlock[]> {
    const result: ViewBlock[] = [];
    for (const [index, block] of blocks.entries()) {
      if (!preview && (!block.enabled || !config.features.catalog && ['products', 'categories'].includes(block.type))) continue;
      const p = block.props, editorPath = `${path}.${index}`;
      const image = (key: string) => preview ? String(p[key] ?? '').replace('/catalog/content-media/', '/admin/settings/content/media/') : p[key];
      const view: ViewBlock = { ...p, id: block.id, editorPath, preview, disabled: !block.enabled, label: blockDefinitions[block.type].label,
        anchor: block.id === 'home-collection' ? 'coleccion' : block.id === 'home-about' ? 'historia' : 'bloque-' + block.id,
        [block.type === 'text-image' ? 'textImage' : block.type]: true, image: image('image'), mobileImage: image('mobileImage'),
        href: contentHref(config, String(p.href ?? '')), columns: [], columnCount: block.columns.length, propsColumns: p.columns,
        frameClasses: `landing-theme-${block.style.theme} landing-radius-${block.style.radius}`,
        classes: (Object.keys(blockStyleChoices) as (keyof typeof blockStyleChoices)[]).map(key => `landing-${key}-${block.style[key]}`).join(' ') };
      if (block.type === 'hero') { view.primaryHeading = !heading && block.enabled; if (block.enabled) heading = true; }
      if (block.type === 'products' && config.features.catalog) {
        const key = JSON.stringify([p.mode, p.productIds, p.category]);
        if (!products.has(key)) products.set(key, p.mode === 'manual' ? catalog.selected(p.productIds as string[]) : catalog.list({ limit: '24', sort: 'featured_first', ...(p.mode !== 'featured' && p.category ? { category: p.category } : {}) }));
        view.cards = catalogCards(publicProducts(await products.get(key)!).slice(0, Number(p.limit)), false, productRoute);
      }
      if (block.type === 'categories' && config.features.catalog) {
        categories ??= facets.get(); const available = (await categories).categories, ids = p.categoryIds as string[];
        view.items = (ids.length ? ids.flatMap(id => available.filter(c => c.id === id)) : available.slice(0, 24)).map(c => {
          const presentation = c.presentation ?? defaultCategoryPresentation();
          return { name: c.name, href: '/categorias/' + c.slug, description: presentation.description,
            image: p.cardStyle === 'icons' ? '' : presentation.image, imageAlt: presentation.imageAlt,
            iconPath: (categoryIcons[presentation.icon] ?? categoryIcons.grid).path };
        });
      }
      for (const [n, column] of block.columns.entries()) view.columns.push({ id: column.id, blocks: await visit(column.blocks, `${editorPath}.columns.${n}.blocks`) });
      result.push(view);
    }
    return result;
  }
  const landingBlocks = await visit(config.landing.blocks, 'landing.blocks');
  return { usesLanding: true, landingBlocks, needsPageHeading: !heading };
}
