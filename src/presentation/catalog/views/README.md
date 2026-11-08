# Vistas de catálogo

[Volver al catálogo](../README.md)

[catalog.hbs](catalog.hbs) recibe un modelo explícito y usa escape normal de Handlebars. No propagar query, headers ni objetos de repositorio directamente a opciones del motor. El controlador fija plantilla y layout.

Los formularios preservan parámetros válidos mediante campos ocultos. Ante fallo de metadatos se ocultan, para no enviar una consulta accidentalmente más amplia. El parcial del carrito se registra desde su carpeta privada y se comparte con las demás páginas canónicas.
