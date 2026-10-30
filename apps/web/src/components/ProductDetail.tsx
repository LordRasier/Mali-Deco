'use client';

import { useEffect, useState } from 'react';
import type { Product } from '../lib/storefront-types';
import { formatPrice } from '../lib/cart';
import { Dialog } from './Dialog';
import { Icon } from './Icons';
import { Swatches } from './ProductCard';

export function ProductDetail({ product, demo, ready, preferredId, loading, error, warning, hasMore, onLoadMore, onRetry, onClose, onAdd }: {
  product: Product | null;
  demo: boolean;
  ready: boolean;
  preferredId?: string;
  loading?: boolean;
  error?: string | null;
  warning?: string | null;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onRetry?: () => void;
  onClose: () => void;
  onAdd: (productId: string, variantId: string) => void;
}) {
  const [variantId, setVariantId] = useState('');
  useEffect(() => setVariantId(preferredId !== undefined ? preferredId : product?.variants[0]?.id || ''), [product?.id, preferredId]);
  const variant = product?.variants.find(item => item.id === variantId);

  return (
    <Dialog open={!!product} onClose={onClose} label={product?.name || 'Detalle del producto'} className="product-dialog">
      {product && (
        <div className="detail-layout">
          <button className="dialog-close" onClick={onClose} aria-label="Cerrar detalle"><Icon name="close" /></button>
          {product.image ? <img className="detail-image" decoding="async" src={product.image} alt={`${product.name}, imagen ${demo ? 'de ejemplo' : 'del producto'}`} /> : <div className="detail-image image-placeholder" aria-hidden="true" />}
          <div className="detail-copy">
            <span className="eyebrow">OBJETOS CON PERSONALIDAD</span>
            <h2>{product.name}</h2>
            <p className="detail-price">
              {variant ? formatPrice(variant.priceMinor, variant.currency) : 'Sin variantes disponibles'}
              {demo && <small> · precio de ejemplo</small>}
            </p>
            <p>{product.description}</p>
            {product.variants.length > 0 && (
              <>
                <p className="variant-label">Variante: <strong>{variant?.name}</strong></p>
                <Swatches product={product} selected={variantId} onSelect={setVariantId} />
              </>
            )}
            {warning && <p role="alert">{warning}</p>}
            {loading && <p role="status">Cargando variantes…</p>}
            {error && <p role="alert">{error} <button type="button" className="inline-link" onClick={onRetry}>Reintentar</button></p>}
            {hasMore && !error && <button type="button" className="inline-link" disabled={loading} onClick={onLoadMore}>Mostrar más variantes</button>}
            {demo && <p className="fine-print">Imagen generada de ejemplo; no representa necesariamente el color seleccionado.</p>}
            <button className="button primary add-button" disabled={!variant || !ready || loading || !!error} onClick={() => variant && onAdd(product.id, variant.id)}>
              Agregar al carrito <Icon name="arrow" />
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
