import type { ShippingRequest } from './shipping.types';

export type AndreaniAccount = { contract: string; customer: string; originBranch?: string };

function required(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128 || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new Error('Invalid shipping identifier');
  return value.trim();
}

function positiveInteger(value: number): bigint {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid package measurement');
  return BigInt(value);
}

function decimalFromInteger(value: bigint, scale: number): string {
  const digits = value.toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

export function serializeAndreaniQuery(request: ShippingRequest, account: AndreaniAccount): URLSearchParams {
  const { parcel } = request;
  const width = positiveInteger(parcel.widthMm);
  const height = positiveInteger(parcel.heightMm);
  const length = positiveInteger(parcel.lengthMm);
  const query = new URLSearchParams({
    cpDestino: required(request.destinationPostalCode), contrato: required(account.contract), cliente: required(account.customer),
    'bultos[0][volumen]': decimalFromInteger(width * height * length, 3),
    'bultos[0][anchoCm]': decimalFromInteger(width, 1),
    'bultos[0][altoCm]': decimalFromInteger(height, 1),
    'bultos[0][largoCm]': decimalFromInteger(length, 1),
  });
  if (account.originBranch !== undefined) query.set('sucursalOrigen', required(account.originBranch));
  if (parcel.weightGrams !== undefined) query.set('bultos[0][kilos]', decimalFromInteger(positiveInteger(parcel.weightGrams), 3));
  if (parcel.declaredValue !== undefined) {
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(parcel.declaredValue) || parcel.declaredValue.length > 30) throw new Error('Invalid declared value');
    query.set('bultos[0][valorDeclarado]', parcel.declaredValue);
  }
  return query;
}
