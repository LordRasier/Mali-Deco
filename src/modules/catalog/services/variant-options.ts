import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { validAssignment } from './catalog-taxonomy';

export type VariantOption = { name: string; value: string };
export function validateVariantOptions(value: unknown): VariantOption[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 1) throw new BadRequestException('Usá una sola propiedad adicional y un valor por variante.');
  const names = new Set(['material', 'color']);
  return value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(k => !['name', 'value'].includes(k))
      || typeof item.name !== 'string' || typeof item.value !== 'string' || !item.name.trim() || !item.value.trim()
      || item.name.trim().length > 60 || item.value.trim().length > 100 || /[\p{Cc}\p{Cf}]/u.test(item.name + item.value)) {
      throw new BadRequestException('Cada variación necesita un nombre (hasta 60 caracteres) y un valor (hasta 100).');
    }
    const name = item.name.trim().normalize('NFC'), key = name.toLocaleLowerCase('es');
    if (names.has(key)) throw new BadRequestException('No repita una variación. Material y Color tienen sus propios campos.');
    names.add(key); return { name, value: item.value.trim().normalize('NFC') };
  });
}

/** Product lock also serializes image retirement. This write never changes price or stock. */
export async function saveVariantImage(db: DataSource, productId: string, id: string, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['imageId', 'expectedImageId'].includes(k))) throw new BadRequestException('Invalid image');
  const input = value as { imageId: string | null; expectedImageId: string | null };
  if (input.imageId === undefined || input.expectedImageId === undefined || !validAssignment(input.imageId) || !validAssignment(input.expectedImageId)) throw new BadRequestException('Invalid image');
  return db.transaction(async tx => {
    const parents = await tx.query('SELECT id FROM products WHERE id = ? AND archived_at IS NULL FOR UPDATE', [productId]);
    if (parents.length !== 1) throw new NotFoundException('Product not found');
    const variants = await tx.query('SELECT image_id AS imageId FROM product_variants WHERE id = ? AND product_id = ? AND archived_at IS NULL FOR UPDATE', [id, productId]);
    if (variants.length !== 1) throw new NotFoundException('Variant not found');
    if (variants[0].imageId !== input.expectedImageId) throw new ConflictException('La imagen cambió. Vuelva a abrir el selector.');
    if (input.imageId !== null) {
      const images = await tx.query('SELECT id FROM product_images WHERE id = ? AND product_id = ? AND retired_at IS NULL', [input.imageId, productId]);
      if (images.length !== 1) throw new BadRequestException('La imagen debe pertenecer a este producto y estar disponible.');
    }
    await tx.query('UPDATE product_variants SET image_id = ? WHERE id = ? AND product_id = ?', [input.imageId, id, productId]);
    return { id, productId, imageId: input.imageId };
  });
}
