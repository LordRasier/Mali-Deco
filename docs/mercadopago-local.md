# Mercado Pago: pruebas locales

## Estado

Las migraciones `CheckoutPaymentStarts1793361100000` y `OrderManagement1793361200000` se aplicaron a `mali_catalog_pruebas` el 7 de noviembre de 2026. Se respaldó el pedido anterior, se conservó su contenido y se verificaron los permisos de lectura/escritura del usuario de aplicación con una transacción revertida. La aplicación sigue usando `mali_catalog_app`; root solo se utilizó para migrar y para bases sintéticas de pruebas.

El módulo implementa Checkout Pro con Preferences. El panel de Mercado Pago advierte que Preferences será descontinuada próximamente: antes de producción habrá que confirmar su calendario y migrar el adaptador a Orders. Los resultados automáticos descritos aquí usan respuestas simuladas en el límite HTTP del proveedor; **no equivalen a una compra completada en el sandbox externo**.

## Compra externa ejecutada: 7 de noviembre de 2026

Se completó desde la interfaz del checkout local una compra con el comprador de prueba y la Visa de prueba terminada en 3704. Mercado Pago mostró el pago acreditado y la API autenticada confirmó `approved/accredited`.

- Pedido: `74972132-708f-4c83-a4bd-2f027db79e4b`.
- Pago: `188379382118`. Total: ARS 54.262,00 (productos 42.000,00 + cotización OCA 12.262,00). No se creó un despacho.
- Vendedor: `3826128012`, verificado por `/users/me`, sitio MLA y etiqueta `test_user`. Comprador: `3824811758`.
- Se observó `live_mode: true` para este pago de cuentas de prueba. El adaptador ahora acepta ambos valores booleanos después de verificar la cuenta de prueba; conserva la coincidencia de vendedor, referencia, moneda e importe. Las cuentas reales siguen rechazadas.
- El pedido pasó a aprobado mediante un **reenvío firmado generado localmente**, enviado a la URL pública del webhook. Este consultó el pago real de prueba en Mercado Pago; un segundo reenvío devolvió 200 sin duplicar el historial ni incrementar la revisión (3).
- La notificación original `payment.created` se inspeccionó después de reautenticar: falló con **HTTP 530** por indisponibilidad del túnel temporal. Se restableció el túnel, se actualizó la URL de prueba en el panel y en `.env`, y la simulación enviada desde Mercado Pago respondió **200 OK**. La segunda compra descrita abajo confirmó la entrega automática.
- Se corrigió también la disponibilidad de Mercado Pago en el renderizado del checkout: se pasa solo el indicador booleano, sin secretos.

Evidencia no secreta: `artifacts/payment-scenarios/external-checkout.json` y las capturas que referencia. Pasaron los 27 escenarios con MariaDB/HTTP reales y proveedor simulado (28 tests contando el contenedor), además de los 32 tests focalizados de pagos y presentación.

## Segunda compra: S2S automático confirmado

El 7 de noviembre de 2026 a las 17:17 (Argentina) se completó una segunda compra desde el checkout local con la misma cuenta compradora y tarjeta de prueba.

- Pedido `c2870348-7f37-40bb-a757-75955975f153`.
- Pago `187322657419`, aprobado por ARS 25.847,00 (producto 15.000 + cotización OCA 10.847).
- **El pedido cambió de `pending` a `approved` automáticamente por el webhook**, antes de usar “Consultar pago” y sin enviar notificaciones manuales para este pago.
- Un único evento de aprobación con el ID del pago; revisión 3 conservada tras consultar desde el navegador. Pedido operativo `received`, envío `not_started`; ningún despacho creado.
- La API confirmó vendedor, importe y referencia. Evidencia: `artifacts/payment-scenarios/automatic-webhook-checkout.json`.
- La primera simulación del panel ya probó HTTP 200 y firma válida. La consulta posterior del registro del segundo evento en Chrome se interrumpió por una interfaz de extensión abierta; la recepción automática quedó demostrada por el historial transaccional local previo a la consulta del comprador.

El túnel debe permanecer activo durante las pruebas. Si se detiene, ejecutar `npm run payments:tunnel` y actualizar ambas URL locales y la URL de prueba del panel. Las preferencias ya emitidas conservan su URL anterior: crear una nueva compra para probar la nueva URL. El lanzador solo toma hostnames del mensaje de éxito; nunca la dirección de la API de Cloudflare contenida en un error.

## Escenarios externos adicionales: 7 de noviembre de 2026

Se ejecutaron tres compras desde el checkout local con la misma cuenta compradora de prueba, tarjeta Visa de prueba y total ARS 25.847,00 por pedido:

| Caso | Pedido | Pago | Respuesta de Mercado Pago | Estado local |
| --- | --- | --- | --- | --- |
| Rechazo general (`OTHE`) | `99a34be7-c583-4fb0-ac68-7d6dc1dea2eb` | `188389727870` | `rejected / cc_rejected_other_reason` | Rechazado |
| Fondos insuficientes (`FUND`) | `98a8ebd4-c996-4a06-9ba3-77e029a7d405` | `187327614649` | `rejected / cc_rejected_insufficient_amount` | Rechazado |
| Pendiente (`CONT`) | `ea52cd7d-f011-40d5-bea5-4d9fceb1eed9` | `188390744306` | `in_process / pending_contingency` | Pendiente |

Los dos rechazos actualizaron el pedido automáticamente por S2S, antes de usar «Consultar pago», sin reenvíos manuales. Cada uno registra un único cambio de pendiente a rechazado, con su ID de pago y revisión 3. En CONT el estado local ya era pendiente al preparar la preferencia: se comprobó la respuesta externa y que el pedido siguiera sin acreditarse (revisión 2). El panel Webhooks de Mercado Pago, filtrado por ambiente Prueba, confirmó **200 - Entregada** para los tres eventos `payment.created`: OTHE 20:41:24, FUND 20:43:59 y CONT 20:45:23 UTC. Así se verificó también la recepción del pendiente, aunque no generara otro cambio de estado. Todos conservaron pedido `received` y envío `not_started`.

La compra CONT se inició desde el resultado FUND en la misma pestaña, sin recargar ni reiniciar la sesión. Se verificaron formulario limpio, nueva cotización, referencia independiente y pago no iniciado; se corrigió que la interfaz conservaba el mensaje del pago anterior. El resultado pendiente no muestra «Iniciar otra compra».

Evidencia: `artifacts/payment-scenarios/additional-external-checkouts.json`, `mercadopago-escenarios-webhooks-200.jpg`, `mercadopago-rechazado.jpg`, `mercadopago-fondos-insuficientes.jpg`, `mercadopago-pendiente.jpg`, `checkout-rechazado.jpg`, `checkout-compra-consecutiva.jpg` y `checkout-pendiente.jpg` en la misma carpeta. Son operaciones sintéticas: no se cobraron fondos reales ni se crearon despachos. Las pruebas descuentan stock de los productos de ejemplo según el comportamiento actual.

Validación de código: 54 tests focalizados de checkout, 66 tests de cliente, 28 tests de integración con MariaDB/HTTP reales y proveedor simulado, build, TypeScript y ESLint de archivos cambiados. La revisión visual de estos nuevos pedidos en el admin requiere iniciar sesión administrativa; los estados persistidos y la presentación de estados tienen comprobación por base de datos y tests.

## Dominio de producción previsto

El dominio confirmado es **https://mali-store.com.ar**. Estas son las direcciones previstas para el despliegue:

Para las URL canónicas, el despliegue usará `PUBLIC_SITE_URL=https://mali-store.com.ar`; el ejemplo de configuración incluye ese valor comentado.

| Uso | URL |
| --- | --- |
| Tienda | `https://mali-store.com.ar` |
| Notificaciones S2S | `https://mali-store.com.ar/api/v1/payments/mercadopago/webhook` |
| Retorno del checkout | `https://mali-store.com.ar/payments/return` |

Son direcciones de destino, no evidencia de un despliegue activo. El entorno actual conserva el vendedor de prueba y el túnel local. El adaptador actual exige desarrollo y una cuenta `test_user`: antes de cobrar en producción falta implementar/configurar el modo productivo con las credenciales de la cuenta receptora, HTTPS, webhook estable y su firma, y validar una compra controlada en el entorno desplegado. No reutilizar el secreto ni el token del sandbox como credenciales productivas.

## Repetir una compra en la misma pestaña

Tras consultar un resultado confirmado (aprobado, rechazado, cancelado, reintegrado o contracargado), **Iniciar otra compra** limpia los datos del formulario y la referencia de recuperación de ese intento. Conserva la sesión y el carrito; exige cotizar de nuevo y confirmar expresamente un pedido nuevo. Un pago pendiente, en mediación o incierto mantiene su referencia y no permite descartarla desde este botón. Un error de almacenamiento o una referencia distinta también bloquean el reinicio.

## Repetir los escenarios automáticos

En esta instalación de MariaDB local, cuya cuenta root sin contraseña confirmó el titular:

```powershell
npm run test:payments:local -- --local-root
```

Sin esa opción se usan las variables DB de la terminal o de `.env`. El usuario de prueba necesita permisos para crear/eliminar su esquema aislado. El programa exige `NODE_ENV=development` y `DB_HOST=127.0.0.1`; crea una base aleatoria `mali_payments_test_*`. Nunca ejecuta estas pruebas sobre `mali_catalog_pruebas`. Elimina solo su base al pasar; ante un fallo, la conserva y muestra el nombre para diagnóstico.

El reporte queda en `artifacts/payment-scenarios/latest.json`. Se utilizan servicios reales, migraciones reales, transacciones MariaDB y el controlador HTTP del webhook. Solo Mercado Pago y las tarifas del correo están simulados.

| Escenario | Comprobación |
| --- | --- |
| Pendiente, autorizado, en proceso | Nunca se informa como acreditado |
| Aprobado, rechazado, cancelado | Estado persistido y visible en el admin |
| Reintegro parcial y total | Se distinguen; una respuesta anterior no revierte el reintegro |
| Disputa y contracargo | Se muestran; una mediación puede resolverse con aprobación verificada |
| Notificaciones concurrentes o repetidas | Sin duplicar historial, pedidos ni descuentos de stock |
| Firma alterada | Rechazo antes de consultar al proveedor |
| Vendedor, tipo de bandera live_mode, moneda, importe o referencia incorrectos | El pedido no se marca como pagado |
| Búsqueda incompleta o pagos monetarios ambiguos | No se elige un resultado arbitrario |
| Proveedor caído o sesión del comprador vencida | Reintento recuperable; S2S no necesita cookie del comprador |
| Respuesta perdida al crear el pago | Queda incierto; no se emite un segundo POST |
| Pedido cancelado | Se bloquea un nuevo checkout; se registran pagos previos sin reabrir el pedido |
| Admin con versión anterior | Conflicto sin sobrescribir el pago recibido |
| Comprobantes repetidos y límite de archivos | Deduplicación, bytes íntegros y límite de 20 |
| Falla al registrar el historial | Pago e historial se revierten juntos |

## Conectar el sandbox externo

1. Crear la aplicación en la cuenta receptora elegida, con **Checkout Pro / API de Preferences**, y aceptar los términos personalmente. El MCP debe exponerse en la sesión antes de poder operarlo: registrarlo en Codex no habilita por sí solo las herramientas de esta conversación.
2. Crear/seleccionar un vendedor y un comprador **de prueba**, del sitio Argentina. Usar el token correspondiente al vendedor de prueba. No poner el token de la cuenta receptora real: el adaptador verifica ID, sitio `MLA` y etiqueta `test_user` antes de crear una preferencia.
3. Ejecutar `npm run payments:tunnel`. Requiere `LOCAL_PAYMENT_GATEWAY_ENABLED=true` en `.env`. El lanzador descarga la versión oficial fijada de cloudflared, verifica SHA-256 y expone solo un servidor de ingreso en `127.0.0.1:3001`.
4. Copiar las dos URL que imprime a `MERCADOPAGO_TEST_RETURN_URL` y `MERCADOPAGO_WEBHOOK_URL` en `.env`. La URL actual también queda en `.local-tools/payment-tunnel.json`. En Mercado Pago, configurar el evento **Pagos** con la URL del webhook y obtener su firma secreta.
5. Ejecutar `powershell -File scripts/setup-mercadopago-local.ps1`. Introducir allí ID de vendedor, Access Token y firma. La entrada de secretos está oculta; se guardan en `.env.mercadopago.local`, excluido de Git y con ACL del usuario. Nunca pegarlos en chat ni pasarlos como argumentos. El script activa solo el modo de prueba.
6. Reiniciar `npm run dev`. Crear un pedido desde el checkout local, abrir Mercado Pago y usar el comprador/tarjeta de prueba. El pago debe actualizar el mismo pedido en el admin sin depender de volver del checkout. El listado se refresca cada 30 segundos cuando no hay cambios sin guardar.

El túnel es temporal: su hostname cambia al reiniciarlo. Actualizar tanto `.env` como la configuración Webhooks del panel; cerrar el proceso corta el acceso. No publicar el puerto 3000: contiene admin, autenticación y checkout. El ingreso público solo admite `POST /api/v1/payments/mercadopago/webhook` y `GET /payments/return`; no reenvía cookies ni cabeceras de proxy. El retorno ignora sus parámetros y jamás acredita pagos.

## Prueba manual del checkout externo

Usar las [tarjetas y escenarios publicados por Mercado Pago](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/integration-test/test-purchases), en una sesión de comprador de prueba separada de la cuenta vendedora. Como mínimo: `APRO` para aprobación, `CONT` para pendiente, `OTHE` para rechazo general y `FUND` para fondos insuficientes. Los rechazos específicos del formulario, cuotas y validación se prueban con los restantes códigos de esa tabla.

En cada caso verificar importe, referencia del pedido, estado en Mercado Pago, estado en admin y un único historial por cambio. Reenviar la notificación desde el panel y comprobar que no se duplique. Probar también cerrar el checkout antes de volver a la tienda. Los reintegros/contracargos y fallas técnicas tienen cobertura automática; su verificación externa depende de las operaciones disponibles para la cuenta de prueba. Este cambio no ejecuta reintegros, despachos ni reposiciones de stock automáticas.

Fuentes: [estados de Payments](https://www.mercadopago.com.ar/developers/es/docs/checkout-api-payments/response-handling/query-results), [Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), [descarga oficial de cloudflared](https://developers.cloudflare.com/tunnel/downloads/).
