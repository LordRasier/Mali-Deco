import type { Metadata } from 'next';
import './globals.css';
import './product-page.css';
import './cart.css';
import type { ReactNode } from 'react';
import { ShippingProvider } from '../components/ShippingProvider';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return { title: process.env.STORE_NAME?.trim() || 'Tienda' };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="es"><body><ShippingProvider>{children}</ShippingProvider></body></html>;
}
