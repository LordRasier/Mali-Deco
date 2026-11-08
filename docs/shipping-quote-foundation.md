# Cotización de envío: base sin conexión

Este corte prepara un contrato interno y una transformación para el cotizador nacional de Andreani. No crea una ruta HTTP, no registra un proveedor en Nest, no tiene transporte de red ni lee credenciales. La tienda sigue mostrando que el cálculo no está disponible. `DisabledShippingProvider` devuelve siempre indisponibilidad; las pruebas suministran un transporte ficticio al adaptador.

## Datos y conversiones

La entrada representa **un solo bulto** ya embalado. Las medidas son enteros positivos en milímetros, el peso opcional es entero positivo en gramos y el valor declarado opcional es un decimal sin impuestos representado como texto. Los valores deben provenir de catálogo, embalaje y precios confiables del servidor; nunca de la solicitud del comprador. Se calculan centímetros, kilogramos y volumen en cm³ con enteros y decimales exactos, sin números de punto flotante. No se asume que varios productos o bultos puedan enviarse juntos ni cómo se empacan.

El adaptador serializa `cpDestino`, `contrato`, `cliente` y `bultos[0][volumen]`, con medidas, peso, valor declarado y `sucursalOrigen` opcionales. El contrato y el cliente son configuración futura, no datos a incorporar al repositorio ni a logs. La cuenta y la autenticación deben verificarse antes de construir cualquier transporte real.

El parser valida la estructura de las tarifas y toma `tarifaConIva.total`, sin volver a sumar impuestos. La moneda y su exponente se proporcionan expresamente desde configuración validada por el comercio: Andreani no los informa en esta respuesta. El importe se conserva en unidades menores como texto entero; si la precisión no coincide, se rechaza en vez de redondear. La respuesta no aporta opciones múltiples, plazo ni vigencia: no se inventan.

Un fallo de transporte o respuesta HTTP no exitosa es `provider_error`; una respuesta exitosa inválida es `invalid_response`. Ninguno se interpreta como falta de cobertura o envío gratis. El formato de errores y las condiciones de cobertura aún requieren confirmación oficial. No registrar consultas completas: pueden contener identificadores de cuenta y código postal.

## Fuentes y pendientes

- [Documentación de transporte y cotizador Andreani](https://developers.andreani.com/document#transporte--distribucion--pre-envio--cotizador).
- [Especificación oficial Cotizador v2.1](https://a.storyblok.com/f/63950/x/785cfc88f2/api-cotizador-v2-1.xlsx): `GET /v1/tarifas`, host productivo `apis.andreani.com` y QA `apisqa.andreani.com`.

Antes de habilitarlo: confirmar cuenta y contrato, autorización y autenticación, moneda, cobertura y errores, criterios de embalaje y valor declarado, tiempos y vencimiento de cotización, límites y política de reintento. Implementar transporte y pruebas locales controladas, resolver los datos autoritativos y revisar el flujo completo antes de exponer una ruta pública. No hay configuración de activación live en este corte.
