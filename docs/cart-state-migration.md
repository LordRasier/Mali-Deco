# T09.1 — Estado compartido del carrito

> Registro histórico de una etapa. Rutas de preview, flags y comandos de convivencia ya no son operativos. Consultar el estado consolidado (retirado; ver cobertura de reemplazo) y el [inicio vigente](../README.md).
**Estado: implementado y verificado.** El usuario aceptó el patrón MVC y autorizó continuar con carrito y catálogo. Esta unidad extrae el estado de React; **no migra todavía el panel ni cambia la propiedad de rutas**.

## Recorrido para leer el código

1. [Entrada del carrito](../src/presentation/cart/client/README.md).
2. [Store](../src/presentation/cart/client/state/cart-store.ts): inicio/limpieza, acciones y concurrencia.
3. [Runtime](../src/presentation/cart/client/state/cart-runtime.ts): efectos de navegador; [snapshot](../src/presentation/cart/client/state/cart-snapshot.ts): proyección y totales.
4. Adaptador React (retirado; ver cobertura de reemplazo): suscripción y ciclo de vida en 15 líneas.
5. [Pruebas del store](../tests/client/cart-store.check.ts) y regresiones del hook (retirado; ver cobertura de reemplazo).

No se copiaron las reglas de almacenamiento o resolución: se reutilizan los clientes existentes. La ubicación temporal en la aplicación web mantiene un único propietario sin añadir un tercer paquete al monorepo. Tras migrar consumidores, el código podrá trasladarse con sus pruebas a la aplicación unificada.

## Contratos conservados

- Claves demo/API, formato de líneas, revisión persistida, nombre de lock y evento de sincronización.
- Prioridad de sesión existente, carrito vacío persistido y fallback a memoria sin prometer persistencia.
- Lectura dentro del lock, actualización entre vistas/pestañas y refresco al volver a una página.
- Resolución independiente de filtros, validación de todos los lotes y rechazo de respuestas parciales antes de podar.
- Invalidación de respuestas viejas al mutar, desmontar, cambiar modo o retirar/reagregar una línea.
- Límites de cantidades/líneas, importes exactos y separación de monedas.

## Evidencia

| Comprobación | Resultado |
|---|---|
| Store sin implementación | RED: módulo todavía ausente |
| Store implementado | 18 casos deterministas correctos antes de revisión |
| Hallazgo de revisión: notificación desmonta/reinicia | RED: 18 correctos / 2 fallidos |
| Corrección del ciclo de vida | GREEN: 20/20 |
| Regresiones existentes del hook | Correctas sin modificar el arnés, antes y después de extraer |
| Lint y tipos | Correctos; tipos de mocks corregidos para aceptar pares sin cantidad |
| Suite general | 194 API + 63 web correctas; la suite web incluye un wrapper que ejecuta los 20 casos del store |
| Build | API y Next correctos; suite y build web repetidos después de la corrección final |
| Enlaces de documentación | Destinos locales existentes |

La suite y el build se ejecutaron en la copia aislada de validación; lint y tipos también sobre el workspace. No se instalaron dependencias nuevas ni se modificaron esquema, permisos o proveedores. No se crearon commits; RDD permanece desactivado.

### Hallazgo corregido

El store publicaba `loading` antes de llamar al resolver. Un suscriptor podía desmontarlo o reiniciarlo durante esa notificación síncrona, y el ciclo viejo aún iniciaba una llamada. Los checks posteriores impedían adoptar o podar con esa respuesta, pero la llamada era innecesaria. Ahora se capturan las líneas solicitadas antes de publicar y se vuelve a verificar la vigencia antes de iniciar el resolver. Dos regresiones reprodujeron el fallo y pasaron tras la corrección. La revisión independiente confirmó el cierre por lectura; no se le atribuye otra ejecución de tests.

### Navegador real

Preview aislado de desarrollo en `http://127.0.0.1:50667`, demo explícita, sin base ni checkout/proveedor habilitados:

1. Catálogo → Florero Ondas → agregar Arena: panel y contador muestran una unidad sin recargar.
2. Incrementar desde el panel: dos unidades y $49.000,00; navegar al carrito conserva estado.
3. Abrir una segunda pestaña del mismo origen: muestra dos unidades. Incrementar allí actualiza **ambas pestañas** a tres unidades y $73.500,00 sin recargar ni forzar renders.
4. Navegar la primera pestaña al piloto MVC, eliminar el artículo sintético desde la segunda y volver atrás: carrito vacío, sin resurrección de líneas.
5. Recargar la segunda pestaña conserva el carrito vacío.

Esto comprueba suscripciones reales de React y eventos de storage, que el dispatcher simulado del arnés no puede demostrar. No se inspeccionaron cookies, tokens ni contenidos de storage mediante scripts; las comprobaciones usaron controles y texto visibles. Se observó un aviso de Next sobre `scroll-behavior: smooth` sin `data-scroll-behavior`; no se alteró el layout en esta unidad. No hubo fallo visible del carrito durante el recorrido.

## Pendiente

**Actualización posterior:** T09.2 ya tiene un panel aislado y bundle compilado; consultar [verificación del panel](cart-panel-migration.md). El listado siguiente registra lo pendiente al cerrar T09.1, no el estado más reciente.

T09.2: servir y conectar el panel desde vistas MVC con una entrega explícita del cliente de navegador; T09.3: conservar el adaptador y las guardas de cotización; después listado/filtros. Todavía no existe un consumidor MVC de este store, ni un bundle publicado para él. El paso por el piloto prueba continuidad de navegación, no paridad de una página de catálogo MVC.

Los casos de bloqueo/denegación de storage, respuestas API y carreras precisas se verificaron de forma determinista, no con una base real en navegador. Las comprobaciones administrativas de T08 siguen pendientes y no quedan cubiertas por estas dos pestañas de carrito demo.

Fuentes del contrato de integración: [useSyncExternalStore de React](https://react.dev/reference/react/useSyncExternalStore) y [Web Locks de W3C](https://www.w3.org/TR/web-locks/).
