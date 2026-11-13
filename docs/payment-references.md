# Número de operación en seguimiento

El detalle del pedido muestra el número de operación de Mercado Pago cuando existe una referencia verificada. No es el número del pedido, la preferencia de checkout ni una factura fiscal.

Los webhooks, el regreso del checkout y la revisión de reservas guardan el ID del pago que determinó el estado verificado. Si hay varios intentos, un aviso de un intento rechazado no reemplaza el ID del pago aprobado. La consulta exige coincidencia de vendedor, entorno, pedido, moneda e importe. Los resultados monetarios contradictorios se rechazan.

El seguimiento extrae únicamente el ID de los eventos del pedido autorizado por el correo, con el mismo estado de pago. No entrega el cuerpo de los eventos ni la respuesta del proveedor. Los pedidos anteriores que ya tenían el ID registrado lo muestran al actualizar la aplicación.

Para recuperar referencias que faltan en pedidos anteriores, después de actualizar el código:

```bash
npm run payments:sync-references
```

El comando utiliza las credenciales existentes de cada entorno y vendedor. Consulta Mercado Pago mediante GET y agrega solamente un evento con el número verificado cuando el estado coincide con el del pedido. No modifica estados, genera cobros, reenvía correos ni adjunta documentos. Puede repetirse: omite referencias ya registradas. Informa los casos omitidos o fallidos sin imprimir credenciales ni datos de clientes.

Este cambio no requiere migración. Los comprobantes adjuntos del administrador mantienen su acceso privado; la factura fiscal y su eventual publicación al comprador son un flujo separado.
