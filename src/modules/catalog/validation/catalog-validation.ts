import { BadRequestException } from '@nestjs/common';

export interface ProductInput {
  name: string; slug: string; description: string; status: 'draft' | 'active';
  bulkWarningThreshold?: number | null; bulkWarningMessage?: string | null;
  productWeightG?: number | null; productWidthMm?: number | null; productHeightMm?: number | null; productLengthMm?: number | null;
  packageWeightG?: number | null; packageWidthMm?: number | null; packageHeightMm?: number | null; packageLengthMm?: number | null;
}

const dimensions = ['productWeightG', 'productWidthMm', 'productHeightMm', 'productLengthMm', 'packageWeightG', 'packageWidthMm', 'packageHeightMm', 'packageLengthMm'] as const;

export function validateProduct(product: ProductInput): void {
  if (!product || typeof product !== 'object') throw new BadRequestException('Invalid product');
  if (typeof product.name !== 'string' || !product.name.trim() || product.name.length > 255) throw new BadRequestException('Invalid product name');
  if (typeof product.description !== 'string' || Buffer.byteLength(product.description, 'utf8') > 65535) throw new BadRequestException('Invalid description');
  if (typeof product.slug !== 'string' || product.slug.length > 255 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug)) throw new BadRequestException('Invalid slug');
  if (!['draft', 'active'].includes(product.status)) throw new BadRequestException('Invalid status');
  if (product.bulkWarningThreshold !== undefined || product.bulkWarningMessage !== undefined) {
    const threshold = product.bulkWarningThreshold, message = product.bulkWarningMessage;
    if (!(threshold === null && message === null) && (!Number.isSafeInteger(threshold) || Number(threshold) < 1 || Number(threshold) > 1000
      || typeof message !== 'string' || !message.trim() || message.length > 300 || [...message].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) throw new BadRequestException('Invalid bulk order warning');
  }
  for (const key of dimensions) {
    const value = product[key];
    if (value != null && (!Number.isSafeInteger(value) || value < 1 || value > 4294967295)) throw new BadRequestException(`Invalid ${key}`);
  }
}

export function parseCatalogQuery(query: Record<string, unknown>) {
  const integer = (value: unknown, fallback: number, max: number): number => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) throw new BadRequestException('Invalid pagination');
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n > max) throw new BadRequestException('Invalid pagination');
    return n;
  };
  if (query.search !== undefined && typeof query.search !== 'string') throw new BadRequestException('Invalid search');
  const search = (query.search as string | undefined)?.trim() || undefined;
  if (search && search.length > 100) throw new BadRequestException('Search too long');
  return { page: integer(query.page, 1, 10000), limit: integer(query.limit, 24, 100), search };
}
