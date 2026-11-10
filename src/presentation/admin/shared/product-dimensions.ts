/** Forms use centimetres; the persisted/API contract remains integer millimetres. */
export const dimensionFields = [
  ['productWeightG', 'Peso (g)'], ['productWidthMm', 'Ancho (cm)'],
  ['productHeightMm', 'Alto (cm)'], ['productLengthMm', 'Largo (cm)'],
  ['packageWeightG', 'Peso (g)'], ['packageWidthMm', 'Ancho (cm)'],
  ['packageHeightMm', 'Alto (cm)'], ['packageLengthMm', 'Largo (cm)'],
] as const;
export type DimensionKey = (typeof dimensionFields)[number][0];

export function dimensionValue(key: DimensionKey, value: number | null | undefined): string {
  if (value == null) return '';
  if (!key.endsWith('Mm')) return String(value);
  return String(Math.floor(value / 10)) + (value % 10 ? ',' + value % 10 : '');
}

export function parseDimension(key: DimensionKey, raw: string): number | null {
  const value = raw.trim(); if (!value) return null;
  const centimetres = key.endsWith('Mm');
  const match = (centimetres ? /^(\d+)(?:[.,](\d))?$/ : /^(\d+)$/).exec(value);
  if (value.length > 32 || !match) throw Error(centimetres
    ? 'Las medidas en cm deben ser números positivos con hasta un decimal.'
    : 'Los pesos deben ser números enteros positivos en gramos.');
  const stored = centimetres ? Number(match[1]) * 10 + Number(match[2] ?? 0) : Number(match[1]);
  if (!Number.isSafeInteger(stored) || stored < 1 || stored > 4294967295) throw Error(centimetres
    ? 'Las medidas deben estar entre 0,1 y 429496729,5 cm.' : 'Los pesos deben estar entre 1 y 4294967295 g.');
  return stored;
}
