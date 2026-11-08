export const emailKinds = ['confirmed', 'shipped', 'delivered'] as const;
export type EmailKind = typeof emailKinds[number];
export const emailLabels: Record<EmailKind, string> = { confirmed: 'Compra confirmada', shipped: 'Pedido enviado', delivered: 'Pedido entregado' };
export type EmailOrder = {
  id: string; createdAt: string; currency: string; totalMinor: string;
  contact: { name: string; email: string };
  destination: { street: string; number: string; unit?: string | null; city: string; state: string; postalCode: string };
  shipping: { carrierName: string; serviceName: string; amountMinor: string; pickupPoint?: { description: string } | null };
  lines: { name: string; variantName: string; quantity: number; unitPriceMinor: string; lineTotalMinor: string }[];
  trackingNumber?: string; trackingUrl?: string;
};
export type EmailEvent = { detail: string; createdAt: string | Date };

/** Preview eligibility comes from recorded transitions, never from opening the preview itself. */
export function emailStages(events: readonly EmailEvent[]) {
  const found = new Map<EmailKind, string>();
  for (const event of [...events].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())) {
    let detail: { changes?: Record<string, { from?: unknown; to?: unknown }> };
    try { detail = JSON.parse(event.detail); } catch { continue; }
    if (!detail || typeof detail !== 'object') continue;
    const payment = detail.changes?.paymentStatus, shipping = detail.changes?.shippingStatus;
    const date = new Date(event.createdAt); if (!Number.isFinite(date.getTime())) continue;
    for (const kind of emailKinds) {
      const change = kind === 'confirmed' ? payment : shipping;
      const target = kind === 'confirmed' ? 'approved' : kind;
      if (change?.to === target && change.from !== target && !found.has(kind)) found.set(kind, date.toISOString());
    }
  }
  return emailKinds.map(kind => ({ kind, label: emailLabels[kind], occurredAt: found.get(kind) ?? null }));
}

/** Deliberately synthetic; no test message is sent to this address. */
export const exampleEmailOrder: EmailOrder = {
  id: 'd3c00001-0000-4000-8000-000000000001', createdAt: '2026-11-08T13:00:00Z', currency: 'ARS', totalMinor: '2880000',
  contact: { name: 'Sofía', email: 'cliente@example.test' },
  destination: { street: 'Calle de ejemplo', number: '123', city: 'Mar del Plata', state: 'Buenos Aires', postalCode: '7600' },
  shipping: { carrierName: 'Correo de ejemplo', serviceName: 'Entrega a domicilio', amountMinor: '480000' },
  lines: [{ name: 'Florero Ondas', variantName: 'PLA · Natural', quantity: 1, unitPriceMinor: '1500000', lineTotalMinor: '1500000' },
    { name: 'Organizador Arco', variantName: 'PLA · Terracota', quantity: 1, unitPriceMinor: '900000', lineTotalMinor: '900000' }],
  trackingNumber: 'EJEMPLO-123456', trackingUrl: 'https://example.test/seguimiento',
};
