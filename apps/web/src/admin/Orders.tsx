'use client';

import { useEffect, useState } from 'react';
import { apiRequest, ApiError } from './api';
import { useSession } from './session';
import { formatPrice } from '../lib/cart';
import { OrderDetail } from './OrderDetail';
import './orders.css';

export interface OrderSummary {
  id: string;
  createdAt: string;
  orderStatus: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  shippingStatus: string;
  testLocal: boolean;
  currency: string;
  totalMinor: string;
}
interface OrdersPage { items: OrderSummary[]; page: number; limit: number; total: number }

export function orderStatusLabel(value: string): string {
  return ({ received: 'Recibido', not_started: 'No iniciado' } as Record<string, string>)[value] ?? value;
}
export function orderDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
export function orderMoney(value: string, currency: string): string {
  return formatPrice(BigInt(value), currency);
}

export function Orders() {
  const { user } = useSession();
  const allowed = user?.role === 'owner' || user?.role === 'operations';
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<OrdersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!allowed || selectedId) return;
    let current = true;
    setLoading(true);
    setError('');
    setResult(null);
    apiRequest<OrdersPage>(`/admin/orders?page=${page}&limit=20`)
      .then(data => { if (current) setResult(data); })
      .catch(failure => {
        if (current && !(failure instanceof ApiError && failure.status === 401)) setError(failure instanceof Error ? failure.message : 'No se pudieron cargar los pedidos.');
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [allowed, page, selectedId, revision]);

  if (!allowed) return null;
  if (selectedId) return <OrderDetail id={selectedId} onBack={() => setSelectedId(null)} />;
  const pages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;
  return <main className="admin-main orders">
    <div className="section-heading"><div><span className="eyebrow">Administración</span><h1>Pedidos</h1><p>Consultá los pedidos recibidos.</p></div></div>
    <div className="panel" aria-busy={loading}>
      {loading && <p role="status">Cargando pedidos…</p>}
      {error && <div className="notice error" role="alert">{error} <button type="button" onClick={() => setRevision(value => value + 1)}>Reintentar</button></div>}
      {!loading && !error && result && <>
        {result.items.length === 0 ? <p className="empty-state">No hay pedidos para mostrar en esta página.</p> :
          <div className="table-scroll"><table className="data-table orders-table"><thead><tr><th scope="col">Pedido</th><th scope="col">Fecha</th><th scope="col">Estado</th><th scope="col">Pago</th><th scope="col">Preparación</th><th scope="col">Total</th><th scope="col"><span className="sr-only">Detalle</span></th></tr></thead><tbody>
            {result.items.map(order => <tr key={order.id}><td><strong>{order.id}</strong>{order.testLocal && <span className="order-test">Prueba local</span>}</td><td>{orderDate(order.createdAt)}</td><td>{orderStatusLabel(order.orderStatus)}</td><td>{orderStatusLabel(order.paymentStatus)}</td><td>{orderStatusLabel(order.fulfillmentStatus)}</td><td>{orderMoney(order.totalMinor, order.currency)}</td><td><button type="button" className="link-button" onClick={() => setSelectedId(order.id)} aria-label={`Ver detalle del pedido ${order.id}`}>Ver detalle →</button></td></tr>)}
          </tbody></table></div>}
        <nav className="pagination" aria-label="Paginación de pedidos"><span>Página {result.page} de {pages} · {result.total} en total</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Siguiente</button></div></nav>
      </>}
    </div>
  </main>;
}
