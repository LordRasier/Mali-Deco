# Pagos de prueba locales

Checkout Pro vía Preferences, con verificación de vendedor de prueba, conciliación autenticada y Webhook S2S firmado. El pedido se crea una sola vez antes del pago; los reintentos no duplican preferencias ni stock. El modo productivo permanece deshabilitado.

- [Configuración, pruebas y límites](../../../docs/mercadopago-local.md).
- [Gestión administrativa de pedidos](../../../docs/admin-orders.md).
- [Decisión inicial](../../../docs/decisions/0005-local-test-payments.md), extendida ahora con un ingreso de webhook aislado.

Las migraciones 1100000 y 1200000 ya se aplicaron a la base local autorizada. La configuración externa se completa con credenciales de vendedor de prueba y la firma Webhooks. Nunca usar la cuenta real para ejecutar estos escenarios.

`npm run test:payments:local -- --local-root` ejecuta el ciclo con MariaDB real, HTTP real y respuestas simuladas de Mercado Pago en un esquema efímero. `npm run payments:tunnel` publica solo el ingreso limitado para pruebas del sandbox externo, sin abrir el admin ni el checkout local.
