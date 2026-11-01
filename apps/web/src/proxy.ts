import { NextResponse, type NextRequest } from 'next/server';
import { allowLocalShippingProxy } from './lib/local-shipping-guard';

export function proxy(request: NextRequest) {
  if (!allowLocalShippingProxy(request, process.env)) return new NextResponse(null, { status: 403 });
  return NextResponse.next();
}

export const config = { matcher: ['/api/v1/shipping/quote', '/api/v1/shipping/destination'] };
