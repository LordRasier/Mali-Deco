import { Controller, Get, Inject, Param, Req, Res } from '@nestjs/common';
import { SeoCatalog } from '../../modules/catalog/services/seo-catalog';
import { CatalogPage } from './catalog-page';

@Controller('categorias')
export class CategoryController {
  constructor(@Inject(CatalogPage) private readonly page: CatalogPage, @Inject(SeoCatalog) private readonly catalog: SeoCatalog) {}
  @Get(':slug')
  async show(@Param('slug') slug: string, @Req() req: { originalUrl: string }, @Res() res: { setHeader(k: string, v: string): unknown; status(code: number): { render(view: string, model: object): void } }) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const params = new URL(req.originalUrl, 'https://local.invalid').searchParams;
    const category = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? await this.catalog.category(slug) : undefined;
    const conflict = params.has('category') && (params.getAll('category').length !== 1 || params.get('category') !== slug);
    params.set('category', slug);
    const result = await this.page.read(params);
    const categoryLink = (href: string) => { if (!href) return ''; const url = new URL(href, 'https://local.invalid'); if (url.searchParams.get('category') !== slug) return href; url.searchParams.delete('category'); return `/categorias/${encodeURIComponent(slug)}${url.search ? url.search : ''}`; };
    result.model.previous = categoryLink(result.model.previous); result.model.next = categoryLink(result.model.next);
    res.status(!category ? 404 : conflict ? 400 : result.status).render('catalog', { ...result.model, categoryName: category?.name, categoryPath: `/categorias/${encodeURIComponent(slug)}`, noindex: !category || conflict || result.status >= 400 || result.model.empty });
  }
}
