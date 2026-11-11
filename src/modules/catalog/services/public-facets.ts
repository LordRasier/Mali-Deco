import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { assertMinorUnits } from '../models/price';
import type { CategoryPresentations } from './category-presentation';
import type { CategoryPresentation } from '../../../shared/category-presentation';

const MAX_CHOICES = 200;
interface LookupRow { id: string; slug: string; name: string; sortOrder: number; presentation?: CategoryPresentation }
interface ColorRow extends LookupRow { hex: string | null }
interface PriceRow { minMinor: string | number | null; maxMinor: string | number | null }

/** Public metadata is global, not narrowed by current search or selected taxonomy filters. */
export class PublicFacets {
  constructor(private readonly db?: DataSource, private readonly presentations?: Pick<CategoryPresentations, 'decorate'>) {}

  async get(query: Record<string, unknown> = {}) {
    if (Object.keys(query).some((key) => key !== 'currency') ||
        (query.currency !== undefined && (typeof query.currency !== 'string' || !/^[A-Z]{3}$/.test(query.currency)))) {
      throw new BadRequestException('Invalid facets query');
    }
    if (!this.db?.isInitialized) throw new ServiceUnavailableException('Catalog database unavailable');
    const db = this.db;
    const currency = query.currency as string | undefined;
    const currencyClause = currency ? ' AND v.currency = ?' : '';
    const params = currency ? [currency] : [];
    // LIMIT one past the response bound, so clients know whether choices were truncated.
    const categories: LookupRow[] = await db.query(`SELECT c.id, c.slug, c.name, c.sort_order AS sortOrder
      FROM categories c WHERE c.archived_at IS NULL AND EXISTS (
        SELECT 1 FROM products p WHERE p.category_id = c.id AND p.status = 'active' AND p.archived_at IS NULL
        ${currency ? `AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.archived_at IS NULL${currencyClause})` : ''}
      ) ORDER BY c.sort_order ASC, c.name ASC, c.id ASC LIMIT 201`, params);
    const materials: LookupRow[] = await db.query(`SELECT m.id, m.slug, m.name, m.sort_order AS sortOrder
      FROM materials m WHERE m.archived_at IS NULL AND EXISTS (
        SELECT 1 FROM product_variants v JOIN products p ON p.id = v.product_id
        WHERE v.material_id = m.id AND v.archived_at IS NULL AND p.status = 'active' AND p.archived_at IS NULL${currencyClause}
      ) ORDER BY m.sort_order ASC, m.name ASC, m.id ASC LIMIT 201`, params);
    const colors: ColorRow[] = await db.query(`SELECT c.id, c.slug, c.name, c.sort_order AS sortOrder, c.hex
      FROM colors c WHERE c.archived_at IS NULL AND EXISTS (
        SELECT 1 FROM product_variants v JOIN products p ON p.id = v.product_id
        WHERE v.color_id = c.id AND v.archived_at IS NULL AND p.status = 'active' AND p.archived_at IS NULL${currencyClause}
      ) ORDER BY c.sort_order ASC, c.name ASC, c.id ASC LIMIT 201`, params);
    // Currency choices must remain global even when a currency is selected, or switching is impossible.
    const currencies: Array<{ currency: string }> = await db.query(`SELECT DISTINCT v.currency
      FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE v.archived_at IS NULL AND p.status = 'active' AND p.archived_at IS NULL
      ORDER BY v.currency ASC`);
    let priceRange: { currency: string; minMinor: number; maxMinor: number } | null = null;
    if (currency) {
      const [range]: PriceRow[] = await db.query(`SELECT MIN(v.price_minor) AS minMinor, MAX(v.price_minor) AS maxMinor
        FROM product_variants v JOIN products p ON p.id = v.product_id
        WHERE v.archived_at IS NULL AND p.status = 'active' AND p.archived_at IS NULL AND v.currency = ?`, [currency]);
      if (range && range.minMinor !== null && range.maxMinor !== null) {
        const minMinor = Number(range.minMinor);
        const maxMinor = Number(range.maxMinor);
        assertMinorUnits(minMinor);
        assertMinorUnits(maxMinor);
        priceRange = { currency, minMinor, maxMinor };
      }
    }
    return {
      categories: this.presentations ? await this.presentations.decorate(categories.slice(0, MAX_CHOICES)) : categories.slice(0, MAX_CHOICES), materials: materials.slice(0, MAX_CHOICES), colors: colors.slice(0, MAX_CHOICES),
      currencies: currencies.map((row) => row.currency), priceRange,
      truncated: { categories: categories.length > MAX_CHOICES, materials: materials.length > MAX_CHOICES, colors: colors.length > MAX_CHOICES },
    };
  }
}
