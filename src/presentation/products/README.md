# Detalle de producto

[Presentación](../README.md) → `GET /productos/:slug` → [controlador](product.controller.ts) → [modelo](product-page.ts) → [vista](views/product.hbs) → [cliente de variantes](client/README.md).

El modelo consulta ajustes y la primera página pública de 100 variantes. Producto ausente devuelve HTML 404; fallo de servicio devuelve 503 con reintento, nunca datos demo. Demo es una configuración explícita exclusiva de desarrollo.

## Fronteras

- Solo DTO público dentro de un atributo HTML escapado; ningún script inline ni objeto de request en los locales.
- El cliente valida nuevamente el DTO y la selección antes de habilitar «Agregar». Una variante fuera de la página se resuelve por su par, sin recorrer todo el catálogo.
- Galería ordenada, imágenes publicadas y placeholder ante errores. Canonical solo en modo API con origen público válido.
- Nest registra `/productos/:slug` permanentemente. API correcta es indexable; demo y errores conservan `noindex`.

## Verificación

Desde la raíz: `node --import tsx --test src/presentation/products/product-page.test.ts tests/http/product-mvc.test.ts`.

[Evidencia y límites](../../../docs/product-mvc-migration.md).
