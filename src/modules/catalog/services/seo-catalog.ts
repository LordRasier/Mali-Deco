import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';

export class SeoCatalog {
  constructor(private readonly db?: DataSource) {}
  private database() { if (!this.db?.isInitialized) throw new ServiceUnavailableException('Catalog unavailable'); return this.db; }
  async count(): Promise<number> {
    const [row] = await this.database().query("SELECT COUNT(*) AS total FROM products WHERE status = 'active' AND archived_at IS NULL");
    const total = Number(row?.total);
    if (!Number.isSafeInteger(total) || total < 0 || total > 1000000) throw new ServiceUnavailableException('Invalid sitemap size');
    return total;
  }
  async products(page: number): Promise<{ slug: string }[]> {
    if (!Number.isInteger(page) || page < 1 || page > 1000) throw new Error('Invalid sitemap page');
    return this.database().query("SELECT slug FROM products WHERE status = 'active' AND archived_at IS NULL ORDER BY id LIMIT 1000 OFFSET ?", [(page - 1) * 1000]);
  }
  async categories(): Promise<{ slug: string; name: string }[]> {
    return this.database().query("SELECT c.slug, c.name FROM categories c WHERE c.archived_at IS NULL AND EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id AND p.status = 'active' AND p.archived_at IS NULL) ORDER BY c.sort_order, c.name LIMIT 1000");
  }
  async category(slug: string): Promise<{ slug: string; name: string } | undefined> {
    const [row] = await this.database().query('SELECT slug, name FROM categories WHERE slug = ? AND archived_at IS NULL', [slug]);
    return row;
  }
  async redirect(slug: string): Promise<string | undefined> {
    try {
      const [row] = await this.database().query("SELECT p.slug FROM product_slug_redirects r JOIN products p ON p.id = r.product_id WHERE r.slug = ? AND p.status = 'active' AND p.archived_at IS NULL", [slug]);
      return row?.slug !== slug ? row?.slug : undefined;
    } catch (e) { if (e && typeof e === 'object' && 'code' in e && e.code === 'ER_NO_SUCH_TABLE') return undefined; throw e; }
  }
}
