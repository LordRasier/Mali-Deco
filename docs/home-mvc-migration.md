# Portada y shell MVC — T11

> Registro histórico de una etapa. Rutas de preview, flags y comandos de convivencia ya no son operativos. Consultar el estado consolidado (retirado; ver cobertura de reemplazo) y el [inicio vigente](../README.md).
La portada aislada `GET /__mvc/inicio` comparte cabecera y pie con catálogo y producto. [Recorrido del código](../src/presentation/home/README.md) · [shell](../src/presentation/shell/README.md) · [mapa de rutas](routes.md).

## Unidades

1. Modelo de portada: marca pública, primera página limitada y primeros tres productos; error 503 distinto de catálogo vacío. Demo mantiene orden editorial y no usa servicios.
2. Arte: cinco originales aprobados permanecen disponibles a Next. `prepare:art` valida todo el conjunto y crea copias ignoradas; el build incluye únicamente los archivos permitidos. Trasladar propiedad definitiva al consolidar, no duplicar originales versionados.
3. Shell: parciales privados, CSS propio y adaptador DOM pequeño; navegación GET/anchors, menú/búsqueda excluyentes, teclado y foco. Sin nuevas dependencias.

## Evidencia

TDD: 3 pruebas del modelo, 3 HTTP, 1 de copia de arte, 2 de header; manifiestos de assets y rewrites actualizados después de observar RED. Se verifica igualdad de bytes de las cinco imágenes, rechazo de archivos vecinos y traversal HTTP sin normalización previa.

Revisión independiente del código sin hallazgos materiales; además se ejecutaron por separado 9 pruebas API y 2 del header, todas verdes, y se verificó orientación por README de portada y producto; detectó un test de traversal que `fetch` normalizaba antes de enviar. Se sustituyó por solicitud HTTP cruda contra la ubicación real de la plantilla.

Validación integrada: **232 pruebas API + 68 web = 300**, lint, typecheck y ambos builds correctos. El primer intento de lint incluyó herramientas temporales del snapshot; se repitió excluyendo únicamente esa carpeta y también se ejecutó lint en el workspace real. Un contrato de script de pruebas requería actualizar su expectativa por el nuevo paso `prepare:art`; corregido y suite completa repetida.

Artefacto compilado: 23 assets permitidos; API arrancó con las fuentes API/web y el public de web temporalmente ocultos en la copia aislada. Todas las páginas/assets respondieron 200 con flag activo y 404 sin él; los cinco SHA-256 coincidieron con originales. Se mantiene el rechazo de producción sin DB. Fuentes restauradas y preview normal reanudado.

Navegador: móvil 375 px sin overflow, hero responsivo y cinco imágenes cargadas; menú enfoca primer enlace, Escape vuelve al botón, búsqueda GET lleva al catálogo y un resultado abre la variante del detalle. Capturas móviles de portada/detalle inspeccionadas. Desktop 1280 px: DOM sin overflow y navegación visible; la captura del navegador integrado mostró artefactos de composición, por lo que **no se presenta como prueba visual desktop válida**. Sigue pendiente esa revisión visual humana y la aceptación del checkpoint B.

## Límites de convivencia

El flag local de desarrollo sigue siendo obligatorio. Las rutas reales permanecen en Next y la política de producción no cambia. No se modificaron cookies, CSRF, guardas de envío/checkout, datos ni proveedores. El build aún usa temporalmente fuentes cliente y originales de arte del workspace web; el **artefacto ejecutable** debe ser autónomo.

Fuentes: [Nest MVC](https://docs.nestjs.com/techniques/mvc), [ARIA expanded](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-expanded).
