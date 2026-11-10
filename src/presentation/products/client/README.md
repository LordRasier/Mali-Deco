# Cliente de producto

[Volver al producto](../README.md) · [Arranque compartido](../../browser/README.md)

El [estado](state/README.md) coordina selección URL, resolución por pares, cancelación y paginación segura. El [adaptador DOM](browser/README.md) valida el bootstrap de la plantilla, se suscribe y conserva un único propietario activo.

Las reglas de catálogo y la disponibilidad autoritativa pertenecen al servidor. Este cliente no escanea el catálogo para resolver una variante ni convierte una respuesta fallida en una selección válida.
