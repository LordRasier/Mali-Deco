'use client';

import type { Product } from '../lib/storefront-types';
import { formatPrice } from '../lib/cart';
import { productPresentation } from '../lib/editorial-art';

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
  fixtureImageId?: string;
  onOpen?: () => void;
}

export function ProductCard({ product, demo, fixtureImageId }: ProductCardProps) {
  const variant = product.variants[0]?.id;
  const presentation = productPresentation(product, demo ? 'demo' : 'api', fixtureImageId);
  const href = `/productos/${encodeURIComponent(product.slug)}${variant ? `?variant=${encodeURIComponent(variant)}` : ''}`;
  return (
    <article className="product-card">
      <a
        className="product-image"
        href={href}
        aria-label={`Ver ${product.name}`}
      >
        {presentation.image ? <img src={presentation.image} alt="" loading="lazy" decoding="async" /> : <span className="image-placeholder" aria-hidden="true" />}
        <span className="card-plus" aria-hidden="true">+</span>
      </a>
      <div className="card-info">
        <div>
          <h3><a href={href}>{product.name}</a></h3>
          {presentation.illustration && <p className="illustration-note">Imagen ilustrativa</p>}
          <p>
            {product.variants[0] ? `${product.priceRange && product.priceRange.minMinor !== product.priceRange.maxMinor ? 'Desde ' : ''}${formatPrice(product.variants[0].priceMinor, product.variants[0].currency)}` : 'Sin precio disponible'}
            {demo && <span> · precio de ejemplo</span>}
          </p>
        </div>
        <Swatches product={product} />
        <a
          className="mobile-plus"
          href={href}
          aria-label={`Ver ${product.name}`}
        >
          +
        </a>
      </div>
    </article>
  );
}
