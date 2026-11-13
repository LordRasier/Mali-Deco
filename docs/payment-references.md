# Número de operación en seguimiento

El detalle del pedido muestra el número de operación de Mercado Pago cuando existe una referencia verificada. No es el número del pedido, la preferencia de checkout ni una factura fiscal.

Los webhooks, el regreso del checkout y la revisión de reservas guardan el ID del pago que determinó el estado verificado. Si hay varios intentos, un aviso de un intento rechazado no reemplaza el ID del pago aprobado. La consulta exige coincidencia de vendedor, entorno, pedido, moneda e importe. Los resultados monetarios contradictorios se rechazan.

El seguimiento extrae únicamente el ID de los eventos del pedido autorizado por el correo, con el mismo estado de pago. No entrega el cuerpo de los eventos ni la respuesta del proveedor. Los pedidos anteriores que ya tenían el ID registrado lo muestran al actualizar la aplicación.

Para recuperar referencias que faltan en pedidos anteriores, después de actualizar el código:

```bash
npm run payments:sync-references
```

El comando utiliza las credenciales existentes de cada entorno y vendedor. Consulta Mercado Pago mediante GET y agrega solamente un evento con el número verificado cuando el estado coincide con el del pedido. No modifica estados, genera cobros, reenvía correos ni adjunta documentos. Puede repetirse: omite referencias ya registradas. Informa los casos omitidos o fallidos sin imprimir credenciales ni datos de clientes.

Los pedidos de prueba se verifican con `MERCADOPAGO_TEST_*` aunque el selector del administrador esté en producción; no es necesario cambiar ese selector. Si falla un pedido, una segunda tabla identifica su entorno, la etapa, el código y una descripción segura del error (por ejemplo, `provider_http_401`, `payment_amount_mismatch` o una variable faltante). No imprime claves, respuestas completas de la API ni consultas SQL.

El comando carga `.env` y después el archivo privado indicado en `MERCADOPAGO_ENV_FILE`, con el mismo cargador que usa la aplicación. No hace falta duplicar las claves en `.env`. La ruta relativa se resuelve desde el directorio de trabajo, y los valores ya presentes en el proceso tienen prioridad, incluso si están vacíos. Si ese archivo no se puede leer, el comando se detiene antes de conectarse a la base de datos e informa el problema sin mostrar secretos ni la ruta privada. La configuración inyectada por PM2 puede ser distinta de la disponible en la terminal.

Este cambio no requiere migración. Los comprobantes adjuntos del administrador mantienen su acceso privado; la factura fiscal y su eventual publicación al comprador son un flujo separado.
