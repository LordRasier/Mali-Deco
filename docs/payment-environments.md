# Mercado Pago: producción y pruebas privadas

La pestaña **Configuración → Pagos** permite habilitar nuevos pedidos y elegir el entorno. La migración inicia con los pagos **deshabilitados**, en modo prueba. Agregar credenciales no activa cobros.

## Configuración del servidor

En `.env`, con los identificadores de las cuentas correspondientes:

```dotenv
NODE_ENV=production
PUBLIC_SITE_URL=https://mali-store.com.ar
ADMIN_ORIGIN=https://mali-store.com.ar
MERCADOPAGO_SELLER_ID=identificador_real
MERCADOPAGO_TEST_SELLER_ID=identificador_de_prueba
MERCADOPAGO_ENV_FILE=.env.mercadopago
```

El arranque productivo debe cargar `.env` explícitamente, como ya requiere la aplicación (por ejemplo `node --env-file=.env dist/main.js` o variables inyectadas por el supervisor). La ruta relativa de `MERCADOPAGO_ENV_FILE` se resuelve desde el directorio de trabajo; se puede usar una ruta absoluta privada.

En el archivo privado `.env.mercadopago`:

```dotenv
MERCADOPAGO_ACCESS_TOKEN=token_real
MERCADOPAGO_WEBHOOK_SECRET=firma_aplicacion_real
MERCADOPAGO_TEST_ACCESS_TOKEN=token_prueba
MERCADOPAGO_TEST_WEBHOOK_SECRET=firma_aplicacion_prueba
```

No definir esas mismas variables vacías en el entorno principal: las variables exportadas tienen prioridad sobre el archivo privado. Nunca hay sustitución de credenciales de prueba por credenciales reales. Las firmas deben corresponder a la aplicación que emite cada notificación; el nombre de una variable no crea una firma distinta en Mercado Pago.

El panel solo recibe estado de configuración, vendedor y URL de notificaciones. Los tokens y firmas no se guardan en la base, HTML, bundles ni auditoría. Continúan como secretos de servidor en texto plano; restringir los permisos del archivo al usuario del proceso. No se añadió un gestor de secretos ni cifrado en reposo.

**Verificar conexión** hace una lectura autenticada nueva del vendedor, sin crear un pago. Guardar un entorno habilitado también verifica vendedor, país MLA y tipo de cuenta. El prefijo del token no determina el entorno. Las credenciales reales requieren `NODE_ENV=production`; las de prueba funcionan en ese mismo despliegue.

Si falla esa verificación, el panel informa la causa y confirma que no cambió la configuración. Un error posterior o una respuesta perdida durante el guardado conserva la advertencia de resultado desconocido. Para diagnosticar desde la terminal, sin base de datos ni cambios de ajustes:

```sh
npm run payments:check -- production
# O bien, para la cuenta de prueba:
npm run payments:check -- test
```

El comando carga `.env` y `MERCADOPAGO_ENV_FILE`, usa solamente consultas GET e informa códigos seguros. Si el ID configurado no coincide con la cuenta autenticada, muestra ambos IDs para corregir `MERCADOPAGO_SELLER_ID` (o su equivalente de prueba). Debe ser el ID del usuario vendedor, no el Client ID de la aplicación. Nunca imprime tokens ni respuestas completas del proveedor.

## Migración y puesta en marcha

Antes de iniciar la versión nueva, ejecutar con la cuenta de mantenimiento:

```sh
npm run migration:payments
```

En el entorno local ya autorizado, el comando alternativo es `npm run migration:payments:local-root`. La migración `PaymentEnvironments1793362600000` añade configuración, auditoría y columnas de entorno/vendedor. Los pedidos anteriores eran pruebas locales: permanecen como pruebas y se recupera el vendedor de los pagos ya iniciados. Los pedidos antiguos sin intento de pago no reciben automáticamente un vendedor nuevo. El rollback que perdería esta evidencia se rechaza.

Reiniciar el proceso tras cargar o rotar credenciales. Cambiar el selector en el panel no necesita reinicio. Registrar en Mercado Pago las URLs mostradas en la pestaña:

| Entorno | Ruta |
|---|---|
| Producción | `/api/v1/payments/mercadopago/webhook/production` |
| Prueba | `/api/v1/payments/mercadopago/webhook/test` |

En las notificaciones Webhooks de cada aplicación de Mercado Pago, seleccionar el evento **Pagos** (`payment`). La URL de producción corresponde a la aplicación de la cuenta real, y la de prueba a la aplicación usada por el vendedor de prueba. Guardar la firma de cada aplicación en su variable correspondiente. Esta integración no procesa eventos `merchant_order` ni IPN.

La ruta antigua `/api/v1/payments/mercadopago/webhook` queda ligada a pruebas. El secreto genérico ya no se usa como secreto de prueba: completar `MERCADOPAGO_TEST_WEBHOOK_SECRET`.

El checkout necesita la configuración completa de cotización Zipnova (`ZIPNOVA_ENABLED`, cuenta, origen, moneda/exponente y token/secret). Se puede inyectar en el proceso o indicar `ZIPNOVA_ENV_FILE=.env.zipnova` en el `.env` principal: el cargador importa únicamente las ocho claves de Zipnova permitidas, también en producción. Los valores ya presentes en el proceso tienen prioridad, incluso si están vacíos. Consultar [la configuración de envíos](zipnova-quote-foundation.md). Una cotización fallida nunca se interpreta como envío gratuito.

El proxy debe preservar el Host público configurado. Sesiones y mutaciones exigen ese Host, Origin exacto, JSON y CSRF; en producción la cookie usa Secure, HttpOnly y SameSite Strict. El retorno `/checkout/return` no confirma pagos ni refleja parámetros recibidos: ofrece volver al checkout para consultar el estado autenticado.

## Reglas y casos de borde

- El selector solo afecta pedidos nuevos. Cada cotización y pedido guarda el entorno/vendedor. Cambiar la configuración invalida cotizaciones previas; la creación verifica la revisión bajo bloqueo de base de datos.
- Deshabilitar pagos nuevos no bloquea el inicio/consulta de pedidos ya creados ni los webhooks. Tampoco cambia las credenciales de pagos pendientes, devoluciones o contracargos.
- El modo prueba pausa nuevas compras públicas. Cada operación de prueba exige una sesión vigente del propietario además de la sesión/CSRF del checkout. Cerrar sesión revoca ese acceso; no basta conocer un identificador de pedido.
- Los nuevos pedidos de prueba validan disponibilidad sin descontar stock. Se listan con el filtro **Pruebas** y se excluyen de las métricas operativas reales. No admiten despacho ni seguimiento. Los pedidos locales antiguos conservaron sus movimientos de stock; la migración no los revierte.
- Los emails comerciales no se envían por pedidos de prueba. Si el subsistema de emails está en modo prueba, puede usar su destinatario de prueba configurado.
- Las preferencias tienen una reserva durable antes del POST. Una respuesta perdida queda incierta; los reintentos no crean otra preferencia. El comprador o administrador debe conciliar el estado, no generar otro cobro.
- Los webhooks validan firma y antigüedad (5 minutos, reloj del servidor sincronizado), vendedor, entorno, moneda, importe y referencia consultando la API. No confían en un estado recibido por navegador o cuerpo del webhook.
- El límite actual es ARS 9.999.999,99 por pedido. Se valida antes de confirmar el pedido y en el proveedor.
- Un cambio de vendedor configurado no reasigna pedidos históricos: falla cerrado si sus credenciales anteriores ya no están disponibles. Rotar un token de la misma cuenta requiere reinicio; cambiar de cuenta requiere planificar la conciliación pendiente.

## Validación y límites

`node scripts/test-payment-environments.mjs --local-root` ejecuta HTTP real contra MariaDB local en un esquema temporal propio que se elimina al terminar. Todas las respuestas de Mercado Pago y cotización son sintéticas. Prueba permisos/CSRF, secretos ausentes, aislamiento de stock, cotización obsoleta, pedidos concurrentes, selección de credenciales, callbacks por entorno, desactivación y preferencias inciertas.

La validación local no certifica la configuración de Nginx, TLS, credenciales ni entrega efectiva de webhooks de producción. Los pedidos nuevos cuentan con reservas y liberación condicionada a evidencia de ausencia de pago activo; los históricos requieren seguimiento operativo. Consultar [pago, recuperación y reservas](checkout-pay-and-recovery.md), incluida su migración obligatoria. No se incorporaron reembolsos automáticos ni creación de envíos en la API del transportista.

### Revisión del 12 de noviembre de 2026

- 116 verificaciones específicas aprobadas (pagos, checkout, pedidos, emails, configuración y formularios).
- 7 verificaciones de integración aprobadas con MariaDB y HTTP reales, sin transacciones externas.
- Tipado sin emisión y lint específico aprobados. Interfaz verificada en Chromium a 1280 y 390 px, incluyendo cambio de entorno, CSRF, verificación de conexión y persistencia del formulario.
- La integración detectó y corrigió pérdida de cabeceras al copiar solicitudes HTTP y coerción de booleanos JSON en MariaDB que mezclaba pruebas con ventas reales.
- Migración aplicada en la base local; pagos deshabilitados. No se modificó producción.
- La revisión automática del entorno bloqueó la suite completa, la repetición de regresión HTTP y la compilación final por un intento de telemetría a `dc.services.visualstudio.com` cuyo contenido no pudo determinar. Esos controles completos no se consideran aprobados. Los resultados anteriores corresponden a verificaciones específicas que sí finalizaron.
