'use client';

import type { Product } from '../lib/storefront-types';
import { formatPrice } from '../lib/cart';

interface SwatchesProps {
  product: Product;
  selected?: string;
  onSelect?: (id: string) => void;
}

export function Swatches({ product, selected, onSelect }: SwatchesProps) {
  const hasColors = product.variants.every(variant => !!variant.color);
  if (!onSelect && !hasColors) return null;
  return (
    <div className={hasColors ? 'swatches' : 'variant-options'} role={onSelect ? 'group' : undefined} aria-label={onSelect ? 'Variantes disponibles' : undefined}>
      {product.variants.map(variant => onSelect ? (
        <button
          key={variant.id}
          type="button"
          className={hasColors ? `swatch ${selected === variant.id ? 'selected' : ''}` : `variant-option ${selected === variant.id ? 'selected' : ''}`}
          style={variant.color ? { background: variant.color } : undefined}
          title={variant.name}
          aria-label={variant.name}
          aria-pressed={selected === variant.id}
          onClick={() => onSelect(variant.id)}
        >{hasColors ? null : variant.name}</button>
      ) : <span key={variant.id} className="swatch" style={{ background: variant.color }} title={variant.name} />)}
    </div>
  );
}

interface ProductCardProps {
  product: Product;
  demo: boolean;
  onOpen: () => void;
}

export function ProductCard({ product, demo, onOpen }: ProductCardProps) {
  return (
    <article className="product-card">
      <button
        className="product-image"
        type="button"
        onClick={onOpen}
        aria-label={`Ver ${product.name}`}
      >
        {product.image ? <img src={product.image} alt="" loading="lazy" decoding="async" /> : <span className="image-placeholder" aria-hidden="true" />}
        <span className="card-plus" aria-hidden="true">+</span>
      </button>
      <div className="card-info">
        <div>
          <h3><button type="button" onClick={onOpen}>{product.name}</button></h3>
          <p>
            {product.variants[0] ? `${demo ? '' : `${product.variants[0].name}: `}${formatPrice(product.variants[0].priceMinor, product.variants[0].currency)}` : 'Sin precio disponible'}
            {demo && <span> · precio de ejemplo</span>}
          </p>
        </div>
        <Swatches product={product} />
        <button
          className="mobile-plus"
          type="button"
          onClick={onOpen}
          aria-label={`Ver ${product.name}`}
        >
          +
        </button>
      </div>
    </article>
  );
}
