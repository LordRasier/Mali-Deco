# Carrito y estimación de envío

El panel rápido y `/carrito` comparten filas, avisos y resumen. Los precios por unidad y por línea usan unidades monetarias enteras; cada moneda conserva su subtotal independiente. Si hay artículos sin resolver, se indica que el subtotal es parcial. Las imágenes proceden del catálogo resuelto; si no existen o fallan se muestra un marcador. Las imágenes de demo se identifican como ejemplos.

Las acciones de cantidad y eliminación usan el mismo `useCart` que las demás rutas. Eliminar opera sobre la última versión del carrito y no reescribe la sincronización existente. Al retirar una fila desde sus controles, el foco pasa a la fila siguiente o al enlace del carrito vacío. No se ofrece deshacer porque una restauración automática podría sobrescribir cambios de otra pestaña.

El panel y la página comparten el código postal, la selección y la cotización vigente. Con cuatro dígitos, el servidor consulta localidades de Andreani y, cuando hay varias, solicita elegir una; después consulta tarifas de Zipnova si el servicio local está habilitado. Las tarifas seleccionadas se suman solo a subtotales de la misma moneda y se invalidan cuando cambian el carrito o el destino, o cuando vencen. El modo demostración no muestra tarifas. La ruta no indexa el carrito y conserva los avisos cuando la resolución o el almacenamiento fallan. Más detalles y límites en `zipnova-quote-foundation.md`.

Verificación local: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. El chequeo `apps/web/tests/cart-ui.check.ts` cubre importes, monedas, enlaces, estado vacío y texto de envío; las regresiones del hook cubren conservación y eliminación concurrente.
