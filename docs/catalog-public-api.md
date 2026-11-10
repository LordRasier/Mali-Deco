# Catálogo público y carrito

Las rutas conservan el prefijo de la API configurado. Los datos proceden de MariaDB; no se crean artículos ni taxonomías de demostración mediante migraciones. Una base no configurada responde 503. Los campos sin clasificar siguen siendo `null` y no se infieren del nombre ni de `supplyMode`.

## `GET /catalog/products`

Devuelve `{ items, page, limit, total }`, contando y paginando productos. Parámetros opcionales:

- `search`: texto, recortado, máximo 100 caracteres.
- `category`, `material`, `color`: slugs separados por comas, hasta 20 por grupo; OR dentro de cada grupo, AND entre grupos.
- `currency`: código de tres letras mayúsculas. `minPriceMinor` y `maxPriceMinor` son enteros no negativos seguros e inclusivos, en esa moneda; exigen `currency`.
- `sort`: `name_asc` (predeterminado), `name_desc`, `price_asc`, `price_desc`. Ordenar por precio exige `currency`.
- `page`: 1–10000; `limit`: 1–100 (predeterminado 24).

Los parámetros desconocidos o mal formados y los intervalos invertidos devuelven 400; un slug válido pero desconocido produce cero resultados. Una **misma variante** no archivada debe satisfacer todos los criterios de material, color, moneda y precio. Los productos activos sin clasificación o variantes siguen apareciendo si no hay un filtro de variante. No existe filtro de stock; `supplyMode` no representa inventario. Los empates se resuelven por nombre y por ID para paginación determinista, no como una instantánea de catálogo entre peticiones concurrentes.

Cada elemento añade a `{id, slug, name, description}` estos campos:

```json
{
  "productWidthMm": 125, "productHeightMm": null, "productLengthMm": 80,
  "category": { "id": "...", "slug": "decoracion", "name": "Decoración" },
  "matchedVariant": {
    "id": "...", "name": "Rojo", "priceMinor": 12500, "currency": "ARS", "supplyMode": "made_to_order",
    "material": { "id": "...", "slug": "pla", "name": "PLA" },
    "color": { "id": "...", "slug": "rojo", "name": "Rojo", "hex": "#FF0000" }
  },
  "priceRange": { "currency": "ARS", "minMinor": 12500, "maxMinor": 15000 }
}
```

Cualquiera de `category`, `matchedVariant`, `material`, `color` o `priceRange` puede ser `null`. El rango y el representante consideran solo variantes que satisfacen el filtro; con moneda se elige el menor precio y luego ID. Sin moneda, el representante se elige por ID y el rango es `null`: nunca se comparan importes de distintas monedas. `matchedVariant` es solo un resumen, no la lista completa.

Cada producto incluye además `matchedVariants` (hasta diez variantes que satisfacen los mismos filtros y orden que el representante), `variantCount` (cantidad de variantes activas del producto, sin filtros) e `images` (hasta diez imágenes públicas ordenadas). `primaryImage` sigue siendo la primera imagen o `null`. Las imágenes pertenecen al producto, no a una variante: no se debe inferir que representen un color específico. La lista completa de variantes se consulta mediante el detalle paginado.

El listado incluye `productWidthMm`, `productHeightMm` y `productLengthMm`: medidas generales del producto en milímetros, o `null` cuando no están informadas. No incluye medidas del embalaje. Las tarjetas las presentan en centímetros debajo del nombre, omitiendo las dimensiones ausentes.

## `GET /catalog/facets?currency=ARS`

Devuelve `{categories, materials, colors, currencies, priceRange, truncated}`. Cada opción tiene `{id, slug, name, sortOrder}`; los colores agregan `hex` nullable. Las opciones provienen de datos públicos existentes y son globales, restringidas solo por la moneda opcional; `currencies` permanece global para permitir cambiarla. El rango existe solo con moneda explícita y variantes elegibles. Cada lista de taxonomía tiene como máximo 200 elementos, con flags `truncated.categories`, `.materials` y `.colors`; no hay recuentos dinámicos por faceta. Listas vacías y rango `null` no indican error.

## `GET /catalog/products/:slug`

Conserva detalle paginado `{id, slug, name, description, variants, page, limit, total}` y añade `category` y `material`/`color` en cada variante. La página de variantes no debe confundirse con todas las variantes del producto.

## `POST /catalog/cart/resolve`

Recibe `{ "lines": [{ "productId": "...", "variantId": "..." }] }` con hasta 100 pares distintos; IDs ASCII visibles de 1–36 caracteres. Responde 200 con `{resolved, missing}` que particionan exactamente los pares pedidos. Cada elemento de `resolved` contiene `{productId, variantId, product: {id, slug, name, description}, variant}`; la variante tiene los mismos campos públicos que `matchedVariant`. Se comprueba que el producto esté activo, que producto y variante no estén archivados y que la variante pertenezca al producto. No intervienen filtros, páginas, moneda ni `supplyMode`; no es reserva ni comprobación de existencias.

El cliente debe validar la partición completa y solo entonces retirar los pares explícitamente incluidos en `missing`. Si hay error de red, 503, respuesta incompleta o inválida, conservar las líneas y su última información, y permitir reintentar. Dividir carritos mayores de 100 líneas en lotes. Nunca quitar una línea porque no aparezca en la página filtrada actual.
