export type StockInput = { stockQuantity: number; expectedStockQuantity: number };
const integer = (value: string, max: number) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= max;
export function stockInput(quantity: string, expected: string): StockInput {
  if (!integer(quantity, 1000000) || !integer(expected, 1000000)) throw new Error('El stock debe ser un entero entre 0 y 1000000.');
  return { stockQuantity: Number(quantity), expectedStockQuantity: Number(expected) };
}
export function bulkWarningInput(threshold: string, message: string) {
  const text = message.trim();
  if (!threshold && !text) return { bulkWarningThreshold: null, bulkWarningMessage: null };
  if (!integer(threshold, 1000) || Number(threshold) < 1 || !text || text.length > 300 || [...text].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
    throw new Error('Indique una cantidad entre 1 y 1000 y un mensaje de hasta 300 caracteres, o deje ambos vacíos.');
  return { bulkWarningThreshold: Number(threshold), bulkWarningMessage: text };
}
