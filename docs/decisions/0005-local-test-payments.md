# Checkout Pro de prueba sin exponer las API locales

**Estado: adoptado para implementación local — 2026-11-07. Activación externa pendiente.**

Extiende [0004](0004-local-checkout-preview.md) únicamente con pagos de prueba explícitos. El flujo productivo y los despachos siguen fuera de alcance. Se conserva el registro de pedidos y el descuento de stock existentes; pagar nunca vuelve a crear un pedido.

Se eligió abrir Checkout Pro en otra pestaña y reconciliar mediante una consulta autenticada iniciada por el usuario desde la página local. No se publica un webhook ni se debilitan las comprobaciones de loopback, origen, sesión o CSRF. La página HTTPS de retorno pertenece al usuario y no es fuente de autoridad. Esto evita exponer las API locales, a cambio de requerir consulta manual y conservar la sesión original.

Una preferencia tiene una única oportunidad de creación por pedido: se persiste una marca incierta antes del POST. No se supone idempotencia del proveedor. Respuestas perdidas requieren revisión; repetir automáticamente el POST podría producir un segundo medio de pago. El vendedor de prueba se verifica con identidad autenticada, se vincula a la fila persistida y no se infiere de un prefijo de token. Los pagos consultados deben tener `live_mode=false`, referencia, vendedor, moneda e importe correctos.

La configuración incompleta no activa pagos. No se agregan dependencias. La migración está escrita pero no aplicada; no se modificaron credenciales locales, no se llamó al proveedor autenticado y no hay prueba externa completada. La alternativa de webhook público se posterga porque requiere un destino autorizado, firma, exposición aislada y operación que no pertenecen al alcance local actual.

El rollback rechaza una tabla de inicios no vacía para no perder evidencia de idempotencia y resultados inciertos. Las migraciones requieren detener escritores antes de ejecutarse.

Contrato, fuentes oficiales, límites de recuperación y preparación de una prueba autorizada: [módulo de pagos](../../src/modules/payments/README.md).
