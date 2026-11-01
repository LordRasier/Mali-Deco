'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatPrice } from '../lib/cart';
import type { CartLine, Product, Variant } from '../lib/storefront-types';

export type CartItem = CartLine & { product: Product | null; variant: Variant | null };
type Props = { item: CartItem; position: number; demo: boolean; onAdjust: (difference: number) => void; onRemove: () => void };

export function CartItemRow({ item, position, demo, onAdjust, onRemove }: Props) {
  const [brokenImage, setBrokenImage] = useState<string | null>(null);
  const { product, variant, quantity } = item;
  const name = product?.name ?? `Artículo ${position} pendiente de verificación`;
  const variantName = variant?.name ?? 'Variante pendiente';
  const colorName = variant?.colorInfo?.name;
  const colorBase = colorName?.replace(/\s*\(ejemplo\)$/i, '').toLocaleLowerCase('es');
  const extraColor = colorBase && !variantName.toLocaleLowerCase('es').includes(colorBase) ? colorName : undefined;
  const href = product && variant ? `/productos/${encodeURIComponent(product.slug)}?variant=${encodeURIComponent(variant.id)}` : undefined;
  const image = product?.image && product.image !== brokenImage ? product.image : undefined;
  return <li className="cart-item">
    <div className="cart-item-media">{image ? <img className="cart-item-image" src={image} alt="" onError={() => setBrokenImage(image)} /> : <div className="cart-item-placeholder" role="img" aria-label="Imagen no disponible" />}{image && demo && <span className="cart-image-note">Imagen de ejemplo</span>}</div>
    <div className="cart-item-info">
      <h3>{href ? <Link href={href} data-cart-row-focus>{name}</Link> : <span tabIndex={-1} data-cart-row-focus>{name}</span>}</h3>
      <p>{variantName}{variant?.material?.name ? ` · ${variant.material.name}` : ''}{extraColor ? ` · Color: ${extraColor}` : ''}</p>
      <p className="cart-unit-price">{variant ? `${formatPrice(variant.priceMinor, variant.currency)} c/u` : 'Precio pendiente'}{variant && demo ? ' · ejemplo' : ''}</p>
      <div className="cart-item-actions">
        <div className="cart-quantity" role="group" aria-label={`Cantidad de ${name}, ${variantName}`}>
          <button type="button" onClick={() => onAdjust(-1)} aria-label={`Quitar una unidad de ${name}, ${variantName}`}>−</button>
          <span aria-label={`${quantity} unidad${quantity === 1 ? '' : 'es'}`}>{quantity}</span>
          <button type="button" disabled={quantity >= 999} onClick={() => onAdjust(1)} aria-label={`Agregar una unidad de ${name}, ${variantName}`}>+</button>
        </div>
        <button className="cart-remove" type="button" onClick={onRemove} aria-label={`Eliminar ${name}, ${variantName} del carrito`}>Eliminar</button>
      </div>
    </div>
    <div className="cart-line-price"><span>Total del artículo</span><strong>{variant ? formatPrice(BigInt(variant.priceMinor) * BigInt(quantity), variant.currency) : 'Pendiente'}</strong></div>
  </li>;
}
