# Portada MVC

[Presentación](../README.md) → `GET /` → [controlador](home.controller.ts) → [modelo](home-page.ts) → [vista](views/home.hbs).

El modelo toma marca y primeros tres productos de una consulta pública limitada a 24. Demo conserva el orden editorial y no consulta servicios. Un fallo devuelve 503; catálogo vacío no es fallo.

## Arte y navegación

La portada conserva imágenes aprobadas, dos resoluciones del hero y secciones `coleccion`/`historia`. [Cabecera y pie compartidos](../shell/README.md) enlazan las rutas canónicas permanentes de Nest. API correcta es indexable; demo y errores conservan `noindex`.

El texto del banner aprovecha una columna de hasta 38 rem en escritorio. El título usa saltos naturales equilibrados, sin `<br>` ni bloques forzados para el acento azul; la descripción admite hasta 46 caracteres tipográficos de ancho (34 en móvil). Se conservan la escala tipográfica, el espacio reservado para los objetos y la composición móvil con la imagen debajo.

Los cinco originales siguen en [resources/storefront](../../../resources/storefront). [prepare:art](../../../scripts/copy-storefront-art.mjs) genera copias ignoradas antes de dev/test/build, y el [copiador de dist](../../../scripts/copy-view-assets.mjs) permite solo los archivos declarados. No crear duplicados versionados ni depender de las fuentes al ejecutar el artefacto.

Desde la raíz: `node --import tsx --test src/presentation/home/home-page.test.ts tests/http/home-mvc.test.ts tests/http/storefront-art.test.ts`.

[Evidencia](../../../docs/home-mvc-migration.md).
