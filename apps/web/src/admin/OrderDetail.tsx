'use client';

import { useEffect, useState } from 'react';
import { apiRequest, ApiError } from './api';
import { useSession } from './session';
import { orderDate, orderMoney, orderStatusLabel } from './Orders';
import type { OrderSummary } from './Orders';
import './orders.css';

interface Order extends OrderSummary {
  contact: { name: string; email: string; phone: string };
  destination: { country: string; postalCode: string; city: string; state: string; street: string; number: string; unit: string | null };
  shipping: { carrierName: string; serviceName: string; amountMinor: string; currency: string; pickupPoint: { id: number; description: string } | null };
  lines: { name: string; variantName: string; quantity: number; unitPriceMinor: string; lineTotalMinor: string; currency: string }[];
}

export function OrderDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { user } = useSession();
  const allowed = user?.role === 'owner' || user?.role === 'operations';
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!allowed) return;
    let current = true;
    setLoading(true); setError(''); setOrder(null);
    apiRequest<Order>(`/admin/orders/${encodeURIComponent(id)}`)
      .then(data => { if (current) setOrder(data); })
      .catch(failure => { if (current && !(failure instanceof ApiError && failure.status === 401)) setError(failure instanceof Error ? failure.message : 'No se pudo cargar el pedido.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [allowed, id, revision]);
  if (!allowed) return null;
  return <main className="admin-main orders">
    <button type="button" className="link-button" onClick={onBack}>← Volver a pedidos</button>
    {loading && <p role="status">Cargando pedido…</p>}
    {error && <div className="notice error" role="alert">{error} <button type="button" onClick={() => setRevision(value => value + 1)}>Reintentar</button></div>}
    {order && <>
      <div className="section-heading"><div><span className="eyebrow">Pedido</span><h1>{order.id}</h1><p>{orderDate(order.createdAt)}</p>{order.testLocal && <span className="order-test">Prueba local</span>}</div></div>
      <div className="order-grid">
        <section className="panel"><h2>Estado</h2><dl className="order-details"><div><dt>Pedido</dt><dd>{orderStatusLabel(order.orderStatus)}</dd></div><div><dt>Pago</dt><dd>{orderStatusLabel(order.paymentStatus)}</dd></div><div><dt>Preparación</dt><dd>{orderStatusLabel(order.fulfillmentStatus)}</dd></div><div><dt>Total</dt><dd><strong>{orderMoney(order.totalMinor, order.currency)}</strong></dd></div></dl></section>
        <section className="panel"><h2>Contacto</h2><dl className="order-details"><div><dt>Nombre</dt><dd>{order.contact.name}</dd></div><div><dt>Correo</dt><dd>{order.contact.email}</dd></div><div><dt>Teléfono</dt><dd>{order.contact.phone}</dd></div></dl></section>
        <section className="panel"><h2>Destino</h2><dl className="order-details"><div><dt>Dirección</dt><dd>{[order.destination.street, order.destination.number, order.destination.unit].filter(Boolean).join(' ')}</dd></div><div><dt>Localidad</dt><dd>{order.destination.city}</dd></div><div><dt>Provincia</dt><dd>{order.destination.state}</dd></div><div><dt>Código postal</dt><dd>{order.destination.postalCode}</dd></div><div><dt>País</dt><dd>{order.destination.country}</dd></div></dl></section>
        <section className="panel"><h2>Envío</h2><dl className="order-details"><div><dt>Estado</dt><dd>{orderStatusLabel(order.shippingStatus)}</dd></div><div><dt>Transportista</dt><dd>{order.shipping.carrierName}</dd></div><div><dt>Servicio</dt><dd>{order.shipping.serviceName}</dd></div><div><dt>Importe</dt><dd>{orderMoney(order.shipping.amountMinor, order.shipping.currency)}</dd></div>{order.shipping.pickupPoint && <div><dt>Punto de retiro</dt><dd>{order.shipping.pickupPoint.description} (ID {order.shipping.pickupPoint.id})</dd></div>}</dl></section>
      </div>
      <section className="panel order-lines"><h2>Artículos</h2>{order.lines.length === 0 ? <p>No hay artículos para mostrar.</p> : <div className="table-scroll"><table className="data-table"><thead><tr><th scope="col">Artículo</th><th scope="col">Variante</th><th scope="col">Cantidad</th><th scope="col">Precio unitario</th><th scope="col">Total</th></tr></thead><tbody>{order.lines.map((line, index) => <tr key={index}><td>{line.name}</td><td>{line.variantName}</td><td>{line.quantity}</td><td>{orderMoney(line.unitPriceMinor, line.currency)}</td><td>{orderMoney(line.lineTotalMinor, line.currency)}</td></tr>)}</tbody></table></div>}</section>
    </>}
  </main>;
}
