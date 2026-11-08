# Tareas de reorganización y migración

> Registro histórico de avance por etapa; sus casillas reflejan el momento de cada anotación. El [estado actual](todo.md) y el [informe de cierre](../docs/rework-completion.md) prevalecen.

## Reglas para ejecutar una unidad

- Registrar commit/punto de partida, prueba enfocada, cambios esperados y ruta de reversión antes de editar. No crear commits sin autorización ni añadir atribución de IA.
- Mantener unidades pequeñas: objetivo de 3–5 archivos de implementación; si una tarea exige más, dividirla en subunidades explícitas antes de comenzar. Una tarea parametrizada se repite por ruta o módulo, no se ejecuta como un lote masivo.
- Cada unidad incluye sus pruebas y README correspondiente. Separar renombres de cambios funcionales; no sustituir documentación por árboles vacíos.
- Nuevo comportamiento: evidencia RED → GREEN → refactor. Todos los checkpoints requieren revisión humana antes de continuar.
- Verificación general **G**: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Comprobación de enlaces y correspondencia entre documentación y código en cada unidad.
- Verificación **H**: pruebas HTTP de métodos, URLs, status, permisos y respuestas. **B**: recorrido real en navegador. **I**: integración aislada con autorización previa, nunca una base compartida o productiva.

## Etapa 0 — Inventario y línea base

### T01 — Inventariar contratos y dependencias
- [x] Registrar rutas HTML/API/medios, roles, cookies, claves de almacenamiento y límites de desarrollo: [mapa actual](../docs/routes.md).
- [x] Crear matriz anterior → destino → prueba → propietario temporal para cada recorrido, incluyendo paths leídos por tests y scripts: [matriz](../docs/migration-map.md).

**Depende de:** nada. **Archivos:** nuevo `docs/routes.md`, `docs/migration-map.md`; referencias a `apps/api/src/main.ts`, `apps/web/src/app`, `src/presentation/admin/client/navigation.ts`. **Verificar:** contrastar la matriz con decoradores y rutas reales; distinguir destinos propuestos de enlaces existentes. **Alcance:** pequeño, solo documentación.

### T02 — Obtener evidencia de línea base
- [x] Ejecutar G, registrar resultados, pruebas descubiertas y bloqueos preexistentes sin dar por válidos resultados históricos: [línea base](../docs/migration-baseline.md).
- [x] Investigar la discrepancia del arnés con las tablas de medios y corregirla como unidad T02.1: extracción sin I/O, regresión RED/GREEN y cinco tests nuevos. No se ejecutó I/B ni se cambió la base.

**Depende de:** T01. **Archivos:** registro nuevo `docs/migration-baseline.md`; posible unidad posterior sobre `checkout-browser-harness.ts` y su prueba. **Verificar:** G; I solo si se autoriza un entorno aislado. No iniciar ni limpiar bases para completar este plan. **Alcance:** pequeño por ejecución/corrección.

## Etapa 1 — Convenciones y piloto

### T03 — Aprobar convenciones y mapa de lectura
- [x] Documentar estructura funcional, sentido de dependencias y READMEs: [entrada API](../README.md), [código](../src/README.md) y [decisión de organización](../docs/decisions/0001-feature-organization.md).
- [x] Registrar decisiones propuestas de vistas/prefijos/navegación, sin presentarlas como implementadas: [límites MVC](../docs/decisions/0002-mvc-boundaries.md).

**Depende de:** T01–T02. **Archivos:** `README.md`, futuro README de código y ADRs en `docs/decisions/` (una decisión por unidad). **Verificar:** revisión humana y enlaces; prueba de orientación descrita en el plan. **Alcance:** pequeño por decisión.

### T04 — Reorganizar un recorrido de catálogo sin cambiarlo
- [x] Reorganizar el recorrido de catálogo/facetas con controlador, servicio y prueba; mantener endpoint y comportamiento.
- [x] Actualizar imports/README y extender agrupación a otras responsabilidades; la suite completa descubre los tests anidados. [Evidencia](../docs/migration-stage-one.md).

**Depende de:** T03. **Archivos:** selección acotada dentro de `src/modules/catalog`, registro correspondiente en `app.module.ts`. **Verificar:** prueba enfocada, H y G; diff sin nuevas reglas ni SQL distinto. **Alcance:** pequeño por recorrido.

### T05 — Extraer composición modular de forma incremental
- [x] Crear CatalogModule y sustituir su registro central sin duplicar providers; contratos verificados antes/después.
- [x] Extraer Identity, Settings, Shipping, Orders, Checkout y Media en incrementos verificados; preservar resolver postal único y overrides. [Grafo y pruebas](../docs/migration-stage-one.md).

**Depende de:** T04 para el piloto. Con la autorización posterior de continuar directamente, los restantes módulos se integraron tras verificar el piloto, sin cambiar el renderizador. **Archivos:** módulo funcional, `app.module.ts`, prueba de composición y README del módulo. **Verificar:** arranque con/sin configuración permitida, identidad de providers y G. **Alcance:** pequeño por módulo; el checkpoint MVC sigue pendiente.

### T06 — Probar motor de vistas y artefacto compilado
- [x] Evaluar hbs 4.4.0 con página de lectura, layout, parcial y contenido no confiable; aceptación del patrón pendiente en checkpoint A.
- [x] Comprobar cuatro assets explícitos y arranque compilado sin fuentes; secretos y dobles quedan fuera. [Evidencia](../docs/mvc-verification.md).

**Depende de:** T03–T05 piloto. **Archivos:** manifiesto API/build/bootstrap y muestra MVC/prueba en subunidades separadas. **Verificar:** H de escape y estados; smoke del artefacto compilado, G. **Alcance:** separar elección/build de vista piloto si supera cinco archivos.

### T07 — Separar rutas HTML y API con reversión local
- [x] Probar `/__mvc/pilot` sin prefijo manteniendo los 50 contratos API, métodos y ausencia de alias prefijado. No generalizar la exclusión a namespaces administrativos.
- [x] Implementar selección local explícita del piloto bajo el origen Next; probar activado → desactivado → activado sin escrituras. La selección de páginas reales sigue pendiente.

**Depende de:** T06. **Archivos:** bootstrap/composición de rutas, configuración local de convivencia, pruebas y README operativo. **Verificar:** H de rutas antiguas/nuevas y B de reversión, G; ningún fallback por error ni acceso remoto. **Alcance:** dos unidades: prefijos y convivencia.

### T08 — Caracterizar frontera de sesiones y mutaciones
- [ ] Añadir pruebas de cookie scope, roles, CSRF/origen, logout, expiración y comportamiento entre pestañas bajo el origen de convivencia.
- [ ] Elegir adaptadores para HTML/JSON sin ampliar permisos ni content types; preservar guardas de checkout/envíos al retirar piezas Next.

**Avance T08:** caracterización HTTP de identidad/checkout completa con persistencia sintética; token obsoleto de otra pestaña simulado, no navegador administrativo real. Se mantienen adaptadores JSON y rechazo de formularios; las guardas de envíos pasaron por el proxy Next real. No se retiraron piezas Next. El recorrido real de sesiones y adaptadores de futuras pantallas permanece pendiente.

**Depende de:** T07. **Archivos:** pruebas de identidad y checkout/guardas, ADR de sesión y adaptador acotado cuando proceda. **Verificar:** H con origen/host/headers adversos y B de sesión; no cambiar cookie paths por conveniencia. **Alcance:** una frontera por unidad.

### Checkpoint A — Aceptar el patrón antes de extenderlo
- [ ] G y evidencias enfocadas revisadas; explicación de cualquier limitación de I.
- [x] Estructura piloto, motor, mapa de rutas y reversión aceptados por el usuario mediante confirmación explícita para continuar con carrito y catálogo.
- [ ] Los enlaces permiten encontrar implementación y pruebas sin búsqueda global.

## Etapa 2 — Escaparate público y widgets compartidos

### T09 — Migrar listado de catálogo
- [ ] Renderizar `/catalogo` conservando búsqueda, filtros, moneda, paginación, URL y los estados vacío/error/carga pertinentes.
- [ ] Mantener comportamiento móvil de aplicar/cancelar filtros, escapar contenido y sustituir cobertura React antes de retirarla.

**T09.1 completa:** [store de carrito](../src/presentation/cart/client/state/README.md) sin React y hook adaptador; 21 casos tras corregir reanudación en memoria. **T09.2 implementada en piloto aislado:** panel DOM y entrega del cliente compilado; cantidades, eliminación, foco y sincronización MVC/Next verificadas. [Evidencia](../docs/cart-panel-migration.md). **T09.3 implementada:** ciclo de envíos compartido entre React/MVC, proyección coherente y controles de destino/reintento; [evidencia](../docs/shipping-mvc-migration.md). **T09.4 implementada:** [listado SSR](../docs/catalog-ssr-migration.md), búsqueda/orden GET, paginación y filtros por URL; **T09.5 implementada:** [controles visuales y borrador móvil](../docs/catalog-filters-migration.md) verificados; la paridad del escaparate y traslado de rutas permanecen pendientes. No se cambió el dueño de rutas de negocio. Las pruebas administrativas pendientes de T08 no quedan cubiertas por el carrito.

**Subunidades obligatorias y ordenadas:** T09.1 portar el estado/almacenamiento compartido del carrito conservando claves y coordinación; T09.2 portar el panel de carrito; T09.3 conectar su adaptador de destino/cotización con los bloqueos actuales; T09.4 migrar el listado base; T09.5 migrar interacción de filtros. No cambiar el propietario de `/catalogo` antes de verificar T09.1–T09.3. Cada subunidad incluye su prueba enfocada y README, con un máximo objetivo de cinco archivos de implementación.

**Depende de:** checkpoint A y T08; cada subunidad depende de la anterior. **Archivos:** clientes/vistas/pruebas de cart y shipping primero; controlador web, proyección, plantilla y filtros después. **Verificar:** H, B escritorio/móvil y G; comparar con `apps/web/README.md`, incluyendo navegación MVC → página heredada → MVC y pestañas mixtas sin perder carrito ni relajar guardas. **Alcance:** cinco unidades mínimas, no una implementación conjunta.

### T10 — Migrar detalle de producto
- [ ] Conservar `/productos/:slug`, 404, paginación/selección de variantes e imágenes publicadas.
- [ ] Validar la variante elegida antes de agregarla al carrito y mantener errores sin datos ficticios.

**Depende de:** T09. **Archivos:** controlador/vista de detalle, cliente de variantes, pruebas y README. **Verificar:** H de slug/404 y B de variantes fuera de primera página, G. **Alcance:** separar vista de la interacción de variantes.

**Avance T10:** [detalle SSR y cliente compartido](../docs/product-mvc-migration.md) implementados y verificados en ruta aislada; el cambio de propietario de `/productos/:slug` y aceptación del checkpoint siguen pendientes.

### T11 — Migrar portada y elementos visuales compartidos
- [ ] Conservar portada, marca configurada, metadatos y arte aprobado; mantener demo explícita y no productiva.
- [ ] Compartir layouts/partiales reales, comprobar teclado, foco y navegación responsive.

**Depende de:** T09–T10. **Archivos:** módulo storefront, layout/partiales, assets y pruebas en unidades separadas. **Verificar:** B visual/móvil/teclado, H de errores y G. **Alcance:** una página o componente compartido por unidad.

**Avance T11:** [portada y shell](../docs/home-mvc-migration.md) implementados en `/__mvc/inicio`, con arte aprobado copiado al artefacto; G verde (300 pruebas), smoke sin fuentes y recorrido móvil. Desktop visual y aceptación humana pendientes.

### Checkpoint B — Escaparate público completo
- [x] Base visual y navegación del escaparate aceptadas explícitamente: «sí, luego puliremos; por ahora terminemos el rework». La aprobación permite continuar; no sustituye pruebas técnicas ni autoriza operaciones remotas.
- [x] Las cuatro páginas públicas pueden volver al renderizador anterior con el selector local; se verificaron ambos sentidos conservando el carrito.
- [ ] README de cada carpeta funcional e índice de rutas actualizados; G verde.

## Etapa 3 — Estado y administración

### T12 — Completar la página del carrito
- [ ] Migrar `/carrito` reutilizando el cliente compartido aprobado en T09.1–T09.3; conservar claves demo/API, cantidades, monedas y validación autoritativa por lotes sin duplicar estado.
- [ ] Probar recarga, pestañas concurrentes, almacenamiento no disponible y respuestas incompletas sin perder líneas indebidamente.

**Depende de:** checkpoint B, T08 y T09.1–T09.3. **Archivos:** controlador/vista de cart y pruebas; conservar referencia a `useCart.ts` y `cart-storage.ts` hasta cubrir todos sus contratos. **Verificar:** B de estados y concurrencia entre página/panel/pestañas, pruebas unitarias y G. **Alcance:** separar vista de los casos de recuperación pendientes.

**Avance T12:** [página y modal con contenido único](../docs/cart-page-migration.md), concurrencia, almacenamiento y reintento verificados. Selector de rutas canónicas verificado con cambio real MVC ↔ Next sin pérdida del carrito; [evidencia](../docs/public-route-migration.md).

### T13 — Migrar acceso y navegación administrativa
- [ ] Renderizar login y shell con permisos reales, logout y no indexación/caché privada; mantener servidor como autoridad.
- [ ] Implementar rutas aprobadas y puente para fragmentos antiguos; conservar borradores en memoria al navegar, descartándolos según el contrato actual al recargar o perder sesión.

**Depende de:** T08 y checkpoint B. **Archivos:** controladores/vistas de identity, shell y cliente de navegación en unidades separadas; README administrativo. **Verificar:** H/B con owner, catalog y operations, enlaces directos, atrás/adelante y varias pestañas; G. **Alcance:** separar acceso de navegación/estado.

### T14 — Migrar administración de productos
- [ ] Conservar alta, edición, archivo, validación y rechazo de edición de archivados.
- [ ] Mantener formularios y errores sin perder cambios al navegar; actualizar matriz de permisos y cobertura.

**Depende de:** T13 y módulo catálogo de T05. **Archivos:** controlador/vista/cliente de productos y pruebas por operación. **Verificar:** H/B CRUD autorizado y denegado, G. **Alcance:** unidades separadas de listado, edición y archivo.

### T15 — Migrar variantes y clasificaciones
- [ ] Conservar reglas de variantes, categorías, materiales y colores sin introducir inventario.
- [ ] Actualizar opciones sin borrar selecciones/borradores; mantener archivo sin restauración donde ese sea el contrato actual.

**Depende de:** T14. **Archivos:** una familia de vistas/clientes/pruebas de catálogo por unidad y su README. **Verificar:** H/B de opciones desactualizadas, permisos y validaciones; G. **Alcance:** variantes y cada clasificación por separado.

### T16 — Migrar gestión de imágenes
- [ ] Conservar carga, derivados, orden, límites, revisión optimista y retiro/restauración.
- [ ] Mantener claves de intento y tratamiento de respuestas inciertas sin duplicar cargas.

**Depende de:** T14 y módulo medios de T05. **Archivos:** cliente/vistas de medios, adaptador HTTP si hace falta, pruebas y README. **Verificar:** H/B de conflicto, reintento y archivo inválido; I solo autorizada; G. **Alcance:** separar carga de edición/orden/restauración.

### T17 — Migrar consulta de pedidos
- [ ] Conservar listado y detalle de pedidos locales para owner/operations; catalog sigue sin autorización.
- [ ] Mostrar límites de pedido de prueba, sin controles que simulen cobro o envío real.

**Depende de:** T13 y módulo pedidos de T05. **Archivos:** controlador, vistas de pedidos, pruebas y README. **Verificar:** H/B de roles/lista/detalle, G. **Alcance:** pequeño por pantalla.

### T18 — Migrar configuración de tienda
- [ ] Extraer responsabilidad de ajustes sin cambiar tablas ni contrato público de marca.
- [ ] Conservar edición exclusiva owner, validación y estados pendientes/errores.

**Depende de:** T13 y extracción settings de T05. **Archivos:** servicio/módulo de ajustes primero; controlador/vista/pruebas en unidad posterior. **Verificar:** H/B de roles y actualización visible de marca, G. **Alcance:** separar extracción mecánica de pantalla.

### Checkpoint C — Carrito y administración aceptados
- [ ] Borradores, roles, CSRF, medios y estado del carrito verificados sin regresiones.
- [ ] Cobertura heredada sustituida explícitamente y reversión de rutas comprobada.
- [ ] G verde y documentación funcional enlazada; defectos preexistentes no ocultos.

## Etapa 4 — Checkout exclusivamente local

### T19 — Migrar selección de destino y cotización
- [ ] Completar la interacción de destino/cotización del checkout reutilizando el adaptador del panel aprobado en T09.3; conservar contratos y flags deshabilitados por defecto, sin llamadas reales durante las pruebas.
- [ ] Migrar la vista/cliente sin perder el bloqueo de origen/host/headers de Next y Nest ni confundir error con envío gratis.

**Depende de:** T12, T08, checkpoint C. **Archivos:** vistas/clientes de shipping y checkout, pruebas y documentación de guardas. **Verificar:** H negativo, B con dobles aislados y G. **Alcance:** destino y cotización en unidades separadas.

### T20 — Migrar confirmación y recuperación de pedido
- [ ] Renderizar `/checkout` con cliente mínimo usando los endpoints y cookie scope existentes; no leer la cookie de checkout desde la ruta HTML.
- [ ] Conservar idempotencia, intento incierto, consulta de resultado, rechazo de cotización vencida/reutilizada y restricciones de reinicio de sesión.

**Depende de:** T19 y corrección de línea base cuando aplique. **Archivos:** plantilla/cliente de checkout y pruebas de ciclo de vida; adaptar arnés en unidad separada. **Verificar:** B/I aisladas autorizadas, H de replay y producción deshabilitada, G. **Alcance:** separar confirmación, recuperación y arnés.

### Checkpoint D — Paridad de todos los recorridos
- [ ] Checkout sigue sin cobrar, reservar stock ni crear envíos; pruebas usan datos sintéticos.
- [ ] API, imágenes, páginas y rutas administrativas conservan sus contratos.
- [ ] Revisión independiente de seguridad y autorización humana antes de retirar Next.

## Etapa 5 — Consolidación y documentación final

### T21 — Separar infraestructura y arneses de prueba
- [ ] Mover conexión/migraciones y soporte de pruebas a sus destinos sin cambiar nombres, SQL u orden de migraciones.
- [x] T21a anticipada: mover soporte/arneses a `tests` sin ejecutar SQL. La conexión y migraciones permanecen bajo `src/database`; su ubicación final raíz sigue pendiente.
- [x] Actualizar CLI, imports y descubrimiento; verificar build limpio con 79 JS y cero arneses/tests, además de arranque compilado sin fuentes. [Evidencia](../docs/migration-stage-one.md).

**Depende de:** checkpoint D; puede anticiparse una unidad aislada si no afecta el piloto. **Archivos:** configuración de base/build, scripts y pruebas movidas en lotes mecánicos acotados. **Verificar:** listado de migraciones descubiertas sin ejecutarlas, inventario de tests, G y smoke compilado. **Alcance:** una familia de soporte por unidad.

### T22 — Retirar Next y consolidar la aplicación raíz
- [ ] Confirmar que ninguna ruta/asset/test depende del renderizador antiguo antes de eliminarlo; conservar equivalente de cada prueba útil.
- [ ] Trasladar código a la estructura final, consolidar manifiesto/lockfile/scripts, retirar workspaces y probar el arranque único desde un build limpio.

**Depende de:** T21 y aprobación del checkpoint D. **Archivos:** trasladar por módulo con sus scripts/imports y mantener comandos operativos; consolidar manifiestos/lockfile y retirar workspaces solo cuando build/start/tests funcionen desde sus rutas nuevas; eliminar frontend en unidad final revisable. **Verificar:** instalación reproducible autorizada, G, H/B completos y smoke del artefacto fuera del árbol fuente; evidencia de reversión por versión anterior sin revertir esquema. **Alcance:** varias unidades ordenadas, nunca un único cambio masivo ni un manifiesto intermedio que deje de ejecutar la aplicación.

### T23 — Reconciliar documentación y enlaces
- [ ] Completar READMEs funcionales e índices; actualizar comandos, variables y diagramas afectados sin borrar advertencias de producción.
- [ ] Marcar instrucciones Next históricas como reemplazadas cuando corresponda; comprobar que enlaces y rutas de pruebas/documentos resuelven.

**Depende de:** cada slice para su documentación; cierre tras T22. **Archivos:** `README.md`, `docs/README.md`, `docs/routes.md` y documentos afectados, en grupos pequeños. **Verificar:** checker local de enlaces, revisión de comandos contra scripts reales y recorrido de lectura independiente. **Alcance:** 3–5 documentos por unidad.

### T24 — Validar orientación y cerrar la migración
- [ ] Un revisor encuentra controlador, servicio, vista y prueba partiendo de dos URLs y de dos carpetas sin búsqueda global; registrar confusiones y corregirlas.
- [ ] Registrar evidencia final de G/H/B e I autorizada, límites restantes y decisiones aceptadas; cerrar solo tareas realmente terminadas.

**Depende de:** T23. **Archivos:** evidencia final y esta lista. **Verificar:** revisión independiente y aceptación humana. **Alcance:** pequeño; las correcciones se desglosan si superan una unidad.

## Fuera del alcance de estas tareas

No habilitar RDD, automatizaciones, CI remoto, SSH, proveedores externos, pagos o envíos reales. No introducir eventos/colas/triggers de forma preventiva. No ejecutar migraciones o limpiezas sobre la base de desarrollo. No interpretar el cierre de esta migración como autorización productiva.
