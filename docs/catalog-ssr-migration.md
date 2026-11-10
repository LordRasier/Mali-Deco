# T09.4 — Listado de catálogo SSR aislado

> Registro histórico de una etapa. Rutas de preview, flags y comandos de convivencia ya no son operativos. Consultar el estado consolidado (retirado; ver cobertura de reemplazo) y el [inicio vigente](../README.md).
**Implementado en `/__mvc/catalogo`; `/catalogo` sigue en Next.** La página entrega HTML con productos, búsqueda, orden, enlaces de paginación y el panel compartido de carrito/cotización. Los controles visuales de filtros avanzados y aplicar/cancelar móvil siguen pendientes en T09.5.

## Qué cambia

- [Controlador y orquestación](../src/presentation/catalog/README.md) invocan los servicios públicos existentes; no hay HTTP interno, otra conexión ni SQL nuevo.
- Se conservan duplicados de query hasta validarlos. URL inválida devuelve 400 antes de leer servicios; no se convierte silenciosamente a filtros vacíos.
- La moneda inicial viene de metadatos mediante un redirect local. Conserva búsqueda/clasificaciones y reinicia página; no presupone ARS para la API.
- El DTO `matchedVariant` se proyecta explícitamente; precio cero, variantes coincidentes y enlaces al detalle se conservan. Handlebars escapa nombres y marca.
- Errores de servicios producen HTML 503; nunca activan demo. Moneda no disponible y página vacía son estados separados.
- El diálogo se extrajo a un parcial único compartido. Diez assets explícitos forman el artefacto; vistas y código compartido no son públicos.

Las seis reglas puras canónicas ahora viven en API con reexports temporales en web. Sus cuerpos son iguales a los previos salvo un import; véase [la decisión](decisions/0003-shared-presentation.md). No se amplió `rootDir`, cambió de runner ni agregó dependencia.

## Pruebas y correcciones

- Orquestación: RED sin módulo → siete pruebas correctas de validación previa a I/O, redirect, DTO/precio cero, moneda desconocida, fallo API, demo y paginación.
- HTTP: RED 404 → renderizado, escape, contrato de query, aislamiento y errores correctos. Los assertions verifican también el escape de `=` que realiza Handlebars.
- Rewrites: RED por dos rutas ausentes → allowlist exacta de catálogo y CSS, sin producción ni cambios de rutas de negocio.
- La revisión independiente detectó que un fallo temprano de metadatos dejaba formularios sin sus filtros ocultos. Se reprodujo por HTTP y se corrigió ocultando esos controles en errores; el enlace de reintento conserva la consulta completa. Hallazgo cerrado por lectura independiente, no por otra ejecución de tests.
- Siete pruebas nativas de dinero/carrito y las comprobaciones TypeScript de catálogo siguen pasando. Una prueba adicional demuestra que facades y servidor comparten las mismas funciones/datos, no copias.
- Lint, tipos, suite y build API/Next correctos: **209 API + 65 web = 274**. El artefacto se comprueba sin fuentes API/web, con pilotos activados/desactivados y rechazo productivo sin base.

Durante la extracción, typecheck detectó un nivel de más en los imports relativos de los reexports y el `supplyMode` nullable del DTO; ambos se corrigieron sin casts que oculten el contrato. Un comando enfocado ejecutado fuera del directorio web no cargó su JSX config; la comprobación válida se repitió desde web. No se cambió React para resolver ese error de invocación.

## Navegador y alcance

En el preview demo aislado se verificaron redirect a moneda publicada, búsqueda y orden mediante GET conservando categoría/color/moneda, enlaces a la variante coincidente, navegación al detalle Next, agregar un artículo y volver al listado SSR con el mismo carrito. El diálogo compartido conserva cierre con Escape y foco. El artículo sintético se retiró al terminar.

Se inspeccionó una captura móvil completa a 375 × 812: tres tarjetas, imágenes ilustrativas y controles legibles sin desbordamiento horizontal. Esto no equivale a aprobación de paridad visual de escritorio ni de los futuros filtros móviles.

La entrega del listado es SSR, no un componente React hidratado. El JavaScript existente se usa para carrito/cotización. Las pruebas HTTP verifican HTML completo; demo no prueba consultas reales de MariaDB. Las imágenes demo continúan sirviéndose desde los assets de Next durante la convivencia.

No se ejecutaron migraciones, bootstrap, escrituras comerciales ni proveedores. RDD desactivado; sin commits. No se afirma paridad visual completa ni que T09 esté terminada: faltan filtros visuales/móviles y verificación de paridad antes de transferir `/catalogo`.

Próximo paso: [T09.5 en tareas](../tasks/todo.md).
