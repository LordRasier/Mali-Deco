/** Package measurements must come from trusted server-side logistics data. */
export type ShippingRequest = {
  destinationPostalCode: string;
  parcel: { widthMm: number; heightMm: number; lengthMm: number; weightGrams?: number; declaredValue?: string };
};

export type QuoteResult =
  | { status: 'quoted'; amountMinor: string; currency: string }
  | { status: 'unavailable'; reason: 'disabled' | 'provider_error' | 'invalid_response' };

export interface ShippingProvider { quote(request: ShippingRequest): Promise<QuoteResult> }
export type MoneyConfig = { currency: string; exponent: number };
