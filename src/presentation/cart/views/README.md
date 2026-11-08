# Vista de carrito

[Volver al módulo](../README.md)

[cart.hbs](cart.hbs) es un documento HTML completo, con layout deshabilitado por el controlador mediante una opción fija y metadatos `noindex`. No interpolar HTML de productos en esta plantilla: el cliente compartido proyecta las respuestas mediante nodos de texto.

El botón inicia deshabilitado y se habilita cuando el cliente termina de preparar el store. El mensaje `noscript` explica la dependencia de JavaScript sin simular un carrito vacío.
