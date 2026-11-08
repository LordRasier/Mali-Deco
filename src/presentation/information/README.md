# Información de compra

El footer también enlaza `/contacto`, `/politica-de-privacidad`, `/terminos-y-condiciones`, `/preguntas-frecuentes` y `/sobre-mali`. [InformationController](information.controller.ts) publica únicamente estas rutas GET exactas, con contenido escapado y la misma cabecera/carrito. Las preguntas usan `details` nativos y funcionan sin JavaScript. El HTML conserva su lectura cuando falla el catálogo.

WhatsApp e Instagram se configuran desde Administración → Configuración → Redes y contacto, tras aplicar `StoreSocialLinks1793361500000`. El footer y Contacto reflejan los datos guardados al recargar. Los valores de entorno `STORE_WHATSAPP_NUMBER` y `STORE_INSTAGRAM_USERNAME` solo se usan como configuración inicial cuando todavía no se guardaron; un valor vacío guardado oculta el ícono. El resto de datos públicos usa `STORE_CONTACT_EMAIL`, `STORE_CONTACT_HOURS`, `STORE_LEGAL_NAME`, `STORE_CUIT`, `STORE_LEGAL_ADDRESS` y `STORE_DATA_FISCAL_URL`, documentadas en `.env.example`, y requiere reiniciar al cambiar. [storeInformation](store-information.ts) usa una lista explícita: no expone el entorno ni las credenciales de servicios. El enlace fiscal acepta solo HTTPS de dominios oficiales de AFIP/ARCA.

Por decisión del usuario, el contacto se configurará más adelante. No se inventan teléfonos, perfiles, identidad legal ni constancias fiscales. Contacto muestra el estado pendiente; Privacidad y Términos quedan como contenido inicial con identificación pendiente. Estas páginas usan `noindex` mientras falten sus datos necesarios. El footer enlaza a la explicación de arrepentimiento, no simula registrar una solicitud. El formulario real y la exhibición oficial completa de Data Fiscal siguen pendientes antes de vender públicamente.

Referencia visual del footer: [Roma 3D en Tiendanube](https://romaimpresiones3d.mitiendanube.com/), consultada el 8 de noviembre de 2026. Se retienen los colores configurados de MALI, con navegación agrupada y franja inferior. No se copian sellos, medios de pago, redes ni datos de esa tienda.

`GET /envios-y-reembolsos` sirve contenido público desde el servidor, con el shell y el carrito compartidos. No requiere sesión ni habilita checkout. El color proviene de `theme.css`. Si falla la lectura del nombre, la información sigue disponible con la marca genérica.

El alcance es informativo: no registra solicitudes ni ejecuta reembolsos. No hay un botón de arrepentimiento que simule enviar una solicitud. Falta definir el canal de atención y conectar un mecanismo real para solicitar la revocación, con constancia, antes de habilitar venta pública en línea. El plazo estimado de fabricación y preparación es de 1 a 3 días, según la pieza, confirmado por la tienda; se suma al plazo de transporte, que comienza desde el despacho. No se definió una tarifa fija ni envío gratis. Por ahora se remite al canal de compra.

Referencia de estructura: https://root3d.co.uk/shipping/ (consultada el 8 de noviembre de 2026). La redacción es propia y no adopta la exclusión británica de devoluciones para toda pieza impresa a pedido.

La política comercial indica fabricación a pedido, sin cambios voluntarios por elección de modelo/color después de fabricar. El envío inicial y los cambios voluntarios excepcionales acordados son a cargo del comprador. Los 5 días pedidos se expresan como recomendación de aviso de inconvenientes, sin reducir el arrepentimiento legal de 10 días ni la garantía. Se conservan los envíos a cargo de la tienda por arrepentimiento aplicable, fallas, daño en entrega o error del vendedor. La sección de reintegros permanece sin cambios.

Comparación realizada el 8 de noviembre de 2026: [M&M Studio](https://mymimpresion3d.mitiendanube.com/cambios-y-devoluciones/) distingue catálogo y personalización; [Roma 3D](https://romaimpresiones3d.mitiendanube.com/politicas-de-envio/) y [DidacTO3D](https://www.didacto3d.com.ar/politica-de-cambio-y-devolucion/) publican otras restricciones. Sus políticas son referencias comerciales, no una fuente de validez legal. [Tiendanube](https://ayuda.tiendanube.com/123288-mis-ventas/preguntas-frecuentes-relacionadas-con-el-boton-de-arrepentimiento) también explica el plazo de 10 días y la excepción de personalización.

Fuentes argentinas consultadas:

- Ley 24.240, artículo 34: https://www.argentina.gob.ar/normativa/nacional/638/actualizacion
- Código Civil y Comercial, artículos 1110–1116: https://www.argentina.gob.ar/normativa/nacional/ley-26994-235975/actualizacion
- Disposición 954/2025 (reemplazó la Resolución 424/2020): https://www.argentina.gob.ar/normativa/nacional/disposici%C3%B3n-954-2025-417152/texto
- Disposición 3/2026, complementaria sobre verificaciones razonables de identidad: https://www.argentina.gob.ar/normativa/nacional/disposici%C3%B3n-3-2026-423007/texto

Verificación HTTP y enlaces en `tests/http/home-mvc.test.ts`. Los assets nuevos están incluidos en las listas explícitas de publicación y empaquetado.

Validación del footer y páginas nuevas (8 de noviembre de 2026): tipos y 10 pruebas de configuración/renderizado/política de presentación/motor de vistas aprobadas. Las suites HTTP de portada y presentación intentaron conectar al servidor de prueba, pero 14 casos quedaron bloqueados por `connect EACCES` a loopback; no se atribuye validación HTTP automatizada completa. Revisión visual local en navegador a tamaño de escritorio y móvil, con acordeones y navegación.
