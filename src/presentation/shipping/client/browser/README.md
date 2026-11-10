# Adaptador DOM de cotización

[Volver a envíos](../README.md) · [Plantilla Nest](../../../cart/views/cart.hbs)

[shipping-panel.ts](shipping-panel.ts) conecta código postal, selector de localidad, reintento y estimaciones a la sesión compartida. Los cambios del carrito sincronizan la sesión; las publicaciones de envíos solo renderizan. No llamar a `syncCart` desde el render: produciría ciclos de notificación y podría rearmar trabajo suspendido.

Los controles se crean en la plantilla y mantienen su identidad/foco. Las opciones usan nodos de texto. El diálogo del carrito controla suspensión/reanudación de ambos clientes; la limpieza retira suscripciones antes de disponer la sesión.

El código postal y el botón outline Calcular/Recalcular forman una fila compacta. Se conserva el cálculo automático; botón y Enter reutilizan el reintento de la sesión y se bloquean durante una consulta. No se agrega otra sesión ni un formulario de compra.

[shipping-options.ts](shipping-options.ts) muestra únicamente opciones vigentes y coherentes con el carrito y su moneda. Agrupa entrega a domicilio y retiro, con dos servicios iniciales por grupo y una expansión nativa para los restantes. Los radios conservan los índices originales del proveedor; elegir un punto de retiro exige seleccionar explícitamente una dirección recibida, sin inventar sucursales, plazos ni tarifas. Los controles y expansiones se conservan al cambiar la selección; al invalidarse las opciones se devuelve el foco al código postal si era necesario.

Una estimación de retiro informa que falta elegir sucursal; no selecciona un punto automáticamente ni implementa confirmación de checkout. Los tests de navegador usan respuestas sintéticas; no se presentan como integración con un proveedor real.
