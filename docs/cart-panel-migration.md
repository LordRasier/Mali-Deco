# T09.2 — Panel de carrito MVC aislado

> Registro histórico de una etapa. Rutas de preview, flags y comandos de convivencia ya no son operativos. Consultar el estado consolidado (retirado; ver cobertura de reemplazo) y el [inicio vigente](../README.md).
**Actualización posterior:** la cotización del panel ya está conectada en T09.3; ver [su verificación](shipping-mvc-migration.md). Este informe conserva los resultados y límites de T09.2.

**Implementado como piloto de desarrollo, sin cambiar `/carrito` ni `/catalogo`.** Abrir `/__mvc/cart` bajo el origen Next de convivencia. Sigue pendiente T09.3, la cotización; el panel lo informa y no muestra envío gratuito.

## Recorrido

[Controlador y modo](../src/presentation/cart/README.md) → [plantilla](../src/presentation/cart/views/cart.hbs) → [adaptador DOM](../src/presentation/cart/client/browser/README.md) → [estado compartido](../src/presentation/cart/client/state/README.md).

El controlador rechaza cualquier query y no recibe formularios. `STOREFRONT_MODE` selecciona API/demo desde el proceso; valores desconocidos fallan. El cliente conserva claves, resolución autoritativa, límites, avisos de storage y subtotales por moneda. Las filas se actualizan por identidad sin reemplazar controles enfocados; los datos entran mediante nodos de texto, no HTML interpolado.

## Entrega del cliente

- Se declaró `esbuild` 0.28.2 como dependencia directa de desarrollo, reutilizando la versión **ya instalada y presente en el lockfile**. No hubo instalación, descarga ni cambio de versiones existentes.
- El [script de build](../scripts/build-browser.mjs) produce un JS autocontenido de **17.244 bytes**, con 14 módulos fuente y sin React/Next. Audita entradas, imports externos y salidas antes de escribir; rechaza referencias de entorno, source maps y salidas mayores de 100 KB.
- El parser público ya reutilizaba una función pura de precisión monetaria ubicada en administración: solo se permite ese archivo concreto, no toda la administración.
- `dev`, `build` y `test` de API generan el cliente primero y se detienen si falla. El generado se ignora en Git. Después de editar el cliente con un `dev` activo, repetir `npm run build:browser -w @store/api` y recargar.
- El build copia siete archivos explícitos: seis plantillas/estilos y el cliente. No publica fuentes, plantillas privadas, mapas ni metadatos como assets.
- Se verificó arranque compilado ocultando las fuentes **API y web** en la copia aislada: health 200; pilotos y assets 200 activados y 404 desactivados. Producción sin base sigue rechazando el arranque.

La CSP del carrito admite script/estilo/imagen/conexión del mismo origen, sin scripts inline. El piloto de texto mantiene `script-src 'none'`. Ambos requieren desarrollo y `MVC_PILOT_ENABLED=true`.

## Pruebas y revisión

| Comprobación | Resultado |
|---|---|
| Ruta nueva | RED 404 frente a 200 esperado → GREEN |
| Rewrites | RED por dos rutas ausentes → GREEN con allowlist exacta |
| Modo | RED sin módulo → GREEN con rechazo de desconocidos |
| HTTP | Query rechazada, sin alias API/POST, gates, MIME/nosniff, traversal crudo |
| Suite general | 197 API + 63 web correctas; el wrapper web ejecuta 21 casos internos del store |
| Lint, tipos y build | Correctos; suite/build repetidos tras correcciones |

Una ejecución enfocada inicial desde la raíz no cargó la configuración de decoradores de Nest; se corrigió el directorio antes de obtener el RED funcional. La suite completa detectó una aserción antigua del comando de tests: se actualizó al comando exacto nuevo, manteniendo el descubrimiento de todas las pruebas.

La revisión independiente encontró una pérdida potencial de memoria al suspender/reanudar: `pagehide` detenía el store y `pageshow` reconstruía desde storage, descartando líneas temporales si storage estaba denegado. Se reprodujo **20 correctas / 1 fallida** y se corrigió conservando memoria en el mismo propietario: **21/21**. Un propietario nuevo sigue sin recuperar esa memoria. El revisor confirmó el cierre por lectura, no por otra ejecución de tests.

En el navegador integrado, Escape llegó al documento pero no produjo `cancel`. Un handler acotado al diálogo abierto resolvió el cierre; se comprobó retorno del foco. No se atribuye ese comportamiento a todos los navegadores.

## Navegador real

Preview aislado sin base/proveedores, con demo explícita:

1. Agregar Arena desde Next; abrir MVC y comprobar la misma línea.
2. Incrementar en MVC actualiza la pestaña Next sin recargar y conserva el foco del botón.
3. Tab navega controles; Escape cierra y devuelve el foco. Eliminar la última línea enfoca el enlace vacío y anuncia la eliminación; Next también queda vacío.
4. Captura móvil 375 × 812 inspeccionada: sin desbordamiento del diálogo y controles de al menos 44 px.
5. Denegación sintética de las APIs de storage, sin leer su contenido: incrementar en memoria y emitir `pagehide/pageshow` con `persisted=true` conserva las líneas y el aviso. Recargar restaura lo persistido, no la modificación temporal.

El último caso verifica el adaptador en navegador con eventos controlados; **no demuestra elegibilidad real de BFCache**. No se afirma paridad visual completa de escritorio. Los errores HMR durante las pausas deliberadas correspondieron al reinicio del preview; el bundle MVC no carga HMR.

## Reversión y pendiente

Desactivar el flag en ambos procesos y reiniciar retira los pilotos sin transformar datos. Las páginas de negocio siguen en Next. El piloto usa el mismo carrito local: sus cantidades/eliminaciones sí afectan la otra vista del mismo modo/origen.

Faltan cotización y sus estados/guardas, después listado y filtros. No se retiró React ni se modificó checkout; no se ejecutaron migraciones ni llamadas a proveedores. Véanse [tareas](../tasks/todo.md).

Referencias: [API de esbuild](https://esbuild.github.io/api/), [diálogo HTML](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog).
