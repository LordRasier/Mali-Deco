# Medición de comercio de Mali

Propiedad GA4: `564318429`, flujo web `16338364703`, medición `G-QJGL0X2DNK`. Contenedor: `GTM-5BWMK9SX`.

Estado al 17/11/2026: publicados GTM v4 (ecommerce del navegador) y v5 (captura de datos proporcionados por usuarios desactivada). Con autorización del propietario se aceptó la declaración solicitada por Google y se creó el secreto de Measurement Protocol **Mali servidor · compras y reembolsos**. Su valor permanece en la consola de GA4 y falta cargarlo en el entorno privado del servidor. No se desplegó el código ni se ejecutó la migración sobre la tienda. No se enviaron compras ni reembolsos de prueba a GA4.

## Qué mide la implementación

| Evento | Momento | Origen |
| --- | --- | --- |
| `view_item_list`, `select_item` | Catálogo renderizado y producto seleccionado | Navegador, con consentimiento |
| `view_item` | Producto o variante visible | Navegador, con consentimiento |
| `add_to_cart`, `remove_from_cart` | Cambio explícito y confirmado del carrito | Navegador, cantidades de la diferencia |
| `view_cart` | Apertura del carrito con productos resueltos | Navegador |
| `begin_checkout` | Checkout listo con carrito válido | Navegador |
| `add_shipping_info`, `add_payment_info` | Datos válidos al confirmar el pedido | Navegador, sólo códigos de envío y método |
| `purchase` | Transición de pago a aprobado verificada por MercadoPago | Servidor, Measurement Protocol |
| `refund` | Reembolso total verificado y compra previamente enviada | Servidor, Measurement Protocol |
| `contact_click` | Clic en WhatsApp, Instagram o email | Etiqueta existente; parámetro `contact_channel` |

Crear un pedido, redirigir al pago o volver a la tienda no representa una venta. Vaciar el carrito tras comprar tampoco representa `remove_from_cart`. Los refrescos de precios y cambios desde otra pestaña no producen movimientos ficticios.

Los importes se convierten de centavos a pesos. `value` suma los artículos; `shipping` se informa separado. Los precios y cantidades de ventas provienen de la cotización inmutable guardada por el servidor. `transaction_id` es el UUID del pedido. Los IDs de producto y variante permiten conciliar catálogo, carrito y ventas.

## Tag Manager

La etiqueta GA4 de ecommerce debe usar ID `G-QJGL0X2DNK`, nombre `{{Event}}` y **Enviar datos de comercio electrónico → Data Layer**. Activador de evento personalizado con expresión regular:

```text
^(view_item_list|select_item|view_item|add_to_cart|remove_from_cart|view_cart|begin_checkout|add_shipping_info|add_payment_info)$
```

Filtro Page Hostname: `^(www\.)?mali-store\.com\.ar$`. No añadir `purchase` ni `refund` a este activador. El cliente limpia `ecommerce` antes de cada evento para evitar heredar campos del anterior. La etiqueta de configuración existente carga una sola vez, después de aceptar medición.

## Instalación en el servidor

1. Desplegar código y bundles de la misma versión: `npm run build`.
2. Ejecutar `npm run migration:analytics` con las credenciales del servidor. Crea contexto de consentimiento y registro durable de envíos. No reconstruye ventas históricas.
3. En GA4, Administrar → Flujos de datos → Mali Store → Secretos de API de Measurement Protocol, obtener el secreto existente **Mali servidor · compras y reembolsos**. Guardarlo sólo en el entorno privado; nunca en el admin público, HTML, repositorio ni Tag Manager.
4. Configurar:

```dotenv
GA4_MEASUREMENT_ID=G-QJGL0X2DNK
GA4_API_SECRET=<secreto privado del flujo>
GA4_SERVER_ENABLED=false
```

5. Ejecutar `npm run analytics:check`. Usa exclusivamente `/debug/mp/collect`, con datos sintéticos, para validar `purchase` y `refund`; no carga ventas en los informes. La validación de esquema no demuestra credenciales correctas ni recepción real.
6. Publicar la etiqueta de ecommerce en GTM y comprobar con Tag Assistant los eventos reales del catálogo/carrito. Rechazar medición debe impedirlos. Confirmar que no aparecen email, teléfono, DNI, dirección ni campos libres del comprador.
7. Con `NODE_ENV=production`, activar `GA4_SERVER_ENABLED=true` y reiniciar el proceso con el entorno actualizado. En configuración de la tienda usar el contenedor GTM indicado; la propiedad GA4 debe coincidir con el entorno. Confirmar una compra real consentida contra el registro de envíos y GA4, sin generar una venta ficticia.

No activar la recopilación automática de datos proporcionados por usuarios ni etiquetas que inspeccionen formularios. Carrito y checkout conservan `noindex`; administración, seguimiento privado y retorno de pago no cargan Analytics.

## Consentimiento, entrega y límites

- Sin consentimiento no se encolan eventos de navegador ni se adjuntan identificadores a la orden. No hay reenvío retroactivo de interacciones anteriores a aceptar.
- El navegador obtiene `client_id` y `session_id` mediante `gtag get`, con tiempo límite. No interpreta cookies de GA. Guardar el contexto tarda como máximo unos dos segundos y su fallo no invalida el pedido.
- Se valida la sesión de checkout, CSRF, propiedad y pertenencia de una orden de producción reciente. No se reemplaza su identidad al repetir la solicitud.
- Los IDs de Analytics vencen a los 30 días. El worker los elimina incluso si se desactiva el envío, mientras permanezca configurado el ID de medición y el proceso funcione. Si se retira el módulo por completo, ejecutar esa limpieza desde mantenimiento.
- Rechazar medición revoca los contextos del navegador mediante una capacidad aleatoria de 256 bits, guardada localmente y hasheada en servidor. La revocación se serializa con las altas y conserva una marca durante 180 días para bloquear solicitudes que lleguen tarde. Se elimina la identidad almacenada; si no hay red, queda una revocación pendiente que se vuelve a intentar. Un nuevo consentimiento usa una capacidad nueva después de completar la revocación anterior. No puede retirar un evento ya transmitido. Borrar todo el almacenamiento local también elimina esa capacidad; los contextos remanentes vencen.
- El worker revisa cada 15 segundos el historial verificado de pagos. La clave única `(order_id,event_name)` y el reclamo durable previo al POST evitan envíos paralelos o por webhooks repetidos.
- Estado `accepted` significa HTTP 2xx de Google, no confirmación de ingreso al informe. Un timeout o corte después de reclamar queda `uncertain` y no se reintenta automáticamente: revisar antes de cualquier reenvío para no duplicar reembolsos. `failed` y `skipped` requieren diagnóstico, tampoco se reintentan solos.
- No se garantiza entrega exactamente una vez ante fallos de red: se prioriza no duplicar ingresos/reembolsos. Si un pago no tiene contexto consentido, no se informa a GA4.
- Se envían eventos hasta 72 horas después de su registro verificado. Sólo se adjunta la sesión original dentro del límite de 24 horas; liquidaciones posteriores pueden carecer de atribución de campaña. GA4 no sustituye el registro contable de pedidos.
- Sólo se instrumentan reembolsos **totales** confirmados. No se calcula un reembolso parcial con información incompleta, ni se infiere una venta histórica si el primer estado conocido es reembolsado. Contracargos y ajustes manuales tampoco se convierten automáticamente en `refund`.

## Reportes y validación

La colección **Mali · Marketing y ventas** preparada en GA4 reúne adquisición, campañas, páginas, productos, recorrido de compra/checkout y contactos. Mantener `purchase` como evento clave principal; los pasos del carrito son diagnóstico del embudo. Contactos son intención, no ventas. Usar UTMs coherentes en enlaces de Instagram, por ejemplo `utm_source=instagram&utm_medium=organic_social&utm_campaign=navidad_2026&utm_content=reel_esfera`.

Validaciones locales: `npm run typecheck`, `npm run build`, tests de `src/modules/analytics/` y `src/presentation/seo/client/`, pruebas HTTP de SEO y suite del cliente. Para probar SQL sin tocar la base de la tienda, usar el test de integración que crea y destruye una base temporal con prefijo `mali_analytics_test_`:

```powershell
$env:ANALYTICS_LOCAL_INTEGRATION='1'
node --env-file=.env --import tsx --test tests/integration/analytics.integration.ts
```

Requiere `NODE_ENV=development`, `DB_HOST=127.0.0.1` y un usuario local autorizado para crear esa base. El emisor de Google está simulado: la prueba no envía compras ni reembolsos a Internet.

Validación de esta entrega: compilación de producción y TypeScript correctos; pruebas específicas de Analytics, consentimiento, carrito, checkout y SEO correctas. En la suite ampliada de cliente/scripts pasaron 74 de 76 pruebas: las dos restantes dependen de conexiones locales que este entorno rechaza con `EACCES`. El test SQL aislado quedó bloqueado por el mismo permiso en `127.0.0.1:3306`. La suite general también detecta una expectativa anterior de rutas que omite `order-tracking`; no se cambió por ser ajena a esta integración. La recepción de ecommerce en producción y la validación contra Google siguen pendientes del despliegue y la configuración del secreto en el servidor.

Referencias: [ecommerce de GA4](https://developers.google.com/analytics/devguides/collection/ga4/ecommerce), [Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4), [validación](https://developers.google.com/analytics/devguides/collection/protocol/ga4/validating-events).
