import { publicVariantName } from '../../../shared/public-variant-name';

type SavedVariant = { variantId: string; variantName: string };
type MaterialReader = { query(sql: string, params: string[]): Promise<{ variantId: string; name: string }[]> };

/** Read only the purchased variants, including archived ones; unrelated materials cannot hide a color or design. */
export async function publicMaterialNames(db: MaterialReader, variantIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(variantIds)];
  if (!ids.length) return new Map();
  const rows: { variantId: string; name: string }[] = await db.query(`SELECT v.id AS variantId, m.name FROM product_variants v
    JOIN materials m ON m.id = v.material_id WHERE v.id IN (${ids.map(() => '?').join(',')})`, ids);
  return new Map(rows.map(row => [row.variantId, row.name]));
}

export function publicOrderVariantName(name: string, variants: SavedVariant[], materials: Map<string, string>) {
  return publicVariantName(name, variants.filter(variant => variant.variantName === name).map(variant => materials.get(variant.variantId) ?? ''));
}

export async function publicOrderLines<T extends { variantName: string }>(db: MaterialReader, lines: T[], variants: SavedVariant[] = []): Promise<T[]> {
  const materials = await publicMaterialNames(db, variants.map(variant => variant.variantId));
  return lines.map(line => ({ ...line, variantName: publicOrderVariantName(line.variantName, variants, materials) }));
}
