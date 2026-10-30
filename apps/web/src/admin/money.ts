/** Decimal amounts are converted with integer arithmetic, never floating point. */
export function currencyFractionDigits(currency: string): number {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('La moneda debe tener tres letras mayúsculas.');
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function decimalToMinor(value: string, currency: string): number {
  const digits = currencyFractionDigits(currency);
  if (value.length > 32) throw new Error('El precio supera el límite permitido.');
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(value.trim());
  if (!match || (match[2]?.length ?? 0) > digits) {
    throw new Error(`Ingresá un precio no negativo con hasta ${digits} decimales para ${currency}.`);
  }
  const fraction = (match[2] ?? '').padEnd(digits, '0');
  const amount = BigInt(match[1]) * 10n ** BigInt(digits) + BigInt(fraction || '0');
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('El precio supera el límite permitido.');
  return Number(amount);
}

export function minorToDecimal(value: string, currency: string): string {
  if (!/^\d+$/.test(value)) throw new Error('Precio inválido.');
  const digits = currencyFractionDigits(currency);
  const padded = value.padStart(digits + 1, '0');
  return digits === 0 ? padded : `${padded.slice(0, -digits)}.${padded.slice(-digits)}`;
}
