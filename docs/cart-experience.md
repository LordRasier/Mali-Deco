# Carrito y envío pendiente

El panel rápido y `/carrito` comparten filas, avisos y resumen. Los precios por unidad y por línea usan unidades monetarias enteras; cada moneda conserva su subtotal independiente. Si hay artículos sin resolver, se indica que el subtotal es parcial. Las imágenes proceden del catálogo resuelto; si no existen o fallan se muestra un marcador. Las imágenes de demo se identifican como ejemplos.

Las acciones de cantidad y eliminación usan el mismo `useCart` que las demás rutas. Eliminar opera sobre la última versión del carrito y no reescribe la sincronización existente. Al retirar una fila desde sus controles, el foco pasa a la fila siguiente o al enlace del carrito vacío. No se ofrece deshacer porque una restauración automática podría sobrescribir cambios de otra pestaña.

El campo de código postal es una preparación visual. El botón de cálculo está deshabilitado: no hay solicitud, tarifa, fecha, proveedor ni pago simulados. La integración real de Andreani requiere contrato y documentación confirmados; el subtotal no incluye envío. La ruta no indexa el carrito y conserva los avisos cuando la resolución o el almacenamiento fallan.

Verificación local: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. El chequeo `apps/web/tests/cart-ui.check.ts` cubre importes, monedas, enlaces, estado vacío y texto de envío; las regresiones del hook cubren conservación y eliminación concurrente.
