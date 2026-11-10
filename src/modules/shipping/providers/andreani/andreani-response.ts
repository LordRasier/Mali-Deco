import type { MoneyConfig } from '../../contracts/shipping.types';

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid provider response');
  return value as Record<string, unknown>;
}

function decimal(value: unknown): string {
  if (typeof value !== 'string' || value.length > 30 || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) throw new Error('Invalid provider decimal');
  return value;
}

function minorUnits(value: unknown, exponent: number): string {
  const [whole, fraction = ''] = decimal(value).split('.');
  if (fraction.length > exponent) throw new Error('Unsupported monetary precision');
  return (BigInt(whole) * 10n ** BigInt(exponent) + BigInt((fraction + '0'.repeat(exponent)).slice(0, exponent) || '0')).toString();
}

export function parseAndreaniQuote(value: unknown, money: MoneyConfig): { amountMinor: string; currency: string } {
  if (!/^[A-Z]{3}$/.test(money.currency) || !Number.isInteger(money.exponent) || money.exponent < 0 || money.exponent > 3) throw new Error('Invalid currency configuration');
  const response = object(value);
  decimal(response.pesoAforado);
  const beforeTax = object(response.tarifaSinIva);
  const withTax = object(response.tarifaConIva);
  for (const tariff of [beforeTax, withTax]) {
    for (const key of ['seguroDistribucion', 'distribucion', 'total']) minorUnits(tariff[key], money.exponent);
  }
  return { amountMinor: minorUnits(withTax.total, money.exponent), currency: money.currency };
}
