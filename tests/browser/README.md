# Soporte de pruebas en navegador

[Volver a pruebas](../README.md)

[checkout-browser-harness.ts](checkout-browser-harness.ts) es una entrada explícita para un entorno aislado, no un servidor normal. [La política](checkout-browser-policy.ts) valida el entorno; [el transporte](checkout-browser-network.ts) acota red; [el inventario](checkout-browser-schema.ts) rechaza objetos no esperados.

Los archivos `*.test.ts` no ejecutan el arnés ni SQL real. Para ejecutar el arnés completo, seguir [las instrucciones de aislamiento](../../docs/checkout-browser-e2e.md), con autorización y exclusividad. No usar la base del preview ni proveedores reales. Los objetos se preservan para inspección, no se limpian automáticamente.

## Vista aislada del carrito y los envíos

[shipping-preview.ts](shipping-preview.ts) sirve la plantilla, estilos y cliente actuales con un producto y tarifas explícitamente simulados. Ejecutar desde la raíz `node --import tsx tests/browser/shipping-preview.ts` después de `npm run build:browser`; muestra su dirección loopback en un puerto aleatorio. Ingresar 7604 para opciones de ejemplo, 7600 para elegir localidad y 9999 para simular indisponibilidad. No lee `.env`, no usa DB ni proveedores y no crea pedidos. La vista inicializa únicamente el almacenamiento de su propio origen aislado. Detener ese proceso al terminar; no es una vista pública ni un modo de la tienda.
