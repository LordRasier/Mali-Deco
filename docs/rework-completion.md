# Aplicación NestJS única

El rework de código está implementado: un manifiesto y un servidor atienden páginas Handlebars, assets y los 50 contratos de API existentes. Next y React fueron retirados de fuentes, manifiesto y lockfile. El pulido visual quedó pospuesto por decisión del usuario; esto no habilita producción.

## Recorrer el proyecto

- [Rutas](routes.md) → [presentación](../src/presentation/README.md) → controlador/modelo/vista/cliente de cada funcionalidad.
- [Módulos](../src/modules/README.md) contienen negocio y transporte JSON; [infraestructura](../src/infrastructure/README.md) contiene base y migraciones.
- [Pruebas](../tests/README.md): unitarias junto al código; HTTP, cliente, infraestructura y arneses separados.
- [Scripts](../scripts/README.md): build limpio, clientes auditados, copias por allowlist y smoke local.

No se agregaron eventos, colas ni triggers sin un caso real. Tampoco carpetas de arquitectura vacías. El estado interactivo vive en stores nativos y los servicios de negocio no renderizan HTML.

## Contratos conservados

Un origen y puerto predeterminado 3000: conservar el origen anterior mantiene el ámbito del almacenamiento. Carrito y checkout conservan claves, locks e identidad de reintento; no migran datos de usuario. Las cookies administrativas y de checkout mantienen sus alcances; `/checkout` no recibe la cookie limitada a `/api/v1/checkout` en SSR.

Roles y CSRF se validan en servidor. Demo solo en desarrollo explícito; API caída nunca se convierte en demo. Checkout y proveedores siguen con opt-in independiente. Las ocho migraciones conservan contenido, clases y orden; no se ejecutó SQL.

Las rutas `__mvc` y flags del piloto ya no existen como mecanismos de activación. Los assets admiten nombres fijos y GET/HEAD; fuentes, plantillas, README y dotfiles nunca son públicos.

## Evidencia

- `npm run lint`, `npm run typecheck`, `npm test` y `npm run build`: pasaron desde la raíz. Suite final: 285 pruebas servidor, 65 pruebas/wrappers cliente y 6 de arquitectura/scripts, cero fallos. Los 26 wrappers con subprocesos usan el entorno corregido; el revisor confirmó 21 checks de checkout realmente ejecutados y ninguno omitido.
- Revisión independiente: 9 pruebas HTTP/permanentes pasadas, 50 contratos API preservados; ocho migraciones fuente/compiladas comparadas sin SQL. Grafo de 193 fuentes de build sin tests ni arneses.
- Artefacto copiado a un directorio temporal sin `src`, `resources`, `tests` ni `apps`; únicamente `dist` y acceso a dependencias instaladas. Sirve inicio, catálogo, producto, carrito y admin; rechaza checkout deshabilitado, preview antiguo y archivos no permitidos. Producción sin DB_HOST sigue rechazando el arranque. Cinco imágenes conservan SHA-256.
- Navegador nuevo a 375×812 contra ese artefacto: producto → agregar → carrito → recarga → abrir/cerrar diálogo. Un solo contenido de carrito, datos conservados, cero errores de página y sin desborde horizontal.
- Recorridos sintéticos anteriores verificaron autenticación/roles, borradores, pedidos/ajustes, medios y checkout incierto. No equivalen a integración real ni a una aprobación visual final. El CRUD completo de variantes/clasificaciones tiene cobertura HTTP/estado/DOM; no se afirma un recorrido integral nuevo de navegador para cada combinación.
- Smoke `npm run check:local-shipping`: pasó con un servidor Nest y entorno limitado.
- Orientación independiente: dos URLs y dos carpetas recorridas hasta controlador/servicio/vista/prueba sin búsqueda global; se corrigió una etiqueta heredada del hook.
- [Cobertura equivalente al retirar React](renderer-retirement.md) y [checkout](checkout-test-retirement.md). Detectado y corregido `NODE_TEST_CONTEXT` heredado: una regresión con fallo intencional impide considerar éxito una ejecución anidada omitida.

## Límite de instalación limpia

El lockfile se regeneró **offline**, con configuración npm vacía y sin workspaces ni paquetes React/Next. `npm ci --offline --ignore-scripts` en una carpeta nueva no pudo completarse: faltó `walk@2.3.15` en la caché (ENOTCACHED). No se descargó ni se alteró la política para resolverlo. Build y pruebas utilizan las dependencias existentes; no se afirma instalación limpia verificada.

Los antiguos directorios ignorados de caché/build y archivos privados no fueron eliminados. Ningún script vigente los usa. El retiro del renderizador se comprueba en fuentes y manifiestos, no mediante una limpieza destructiva de cachés ajenas.

## Alcance y reversión

No se ejecutaron base, bootstrap, migraciones, proveedores, pagos, envíos, despliegues, commits ni cambios remotos. La revisión nativa resultó no evaluable; se usó revisión independiente, sin afirmar aprobación nativa. Para revertir, recuperar una versión anterior del código en otra copia conservando configuración y origen; no revertir esquema ni borrar datos como parte de este rework.

[Estado de tareas](../tasks/todo.md) · [Inicio vigente](../README.md) · [Pendientes de producto](estado-del-desarrollo.md).
