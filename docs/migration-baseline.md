# Línea base de la reorganización

> Registro histórico de una etapa. Rutas de preview, flags y comandos de convivencia ya no son operativos. Consultar el estado consolidado (retirado; ver cobertura de reemplazo) y el [inicio vigente](../README.md).
Evidencia histórica de T01–T02. El avance posterior está en [reorganización modular](migration-stage-one.md); los enlaces de este documento apuntan a las ubicaciones actuales.

## Resultado

La etapa inicial T01–T02 está completada: [rutas](routes.md) y [dependencias](migration-map.md) inventariadas, cuatro comprobaciones generales aprobadas y una inconsistencia previa del arnés corregida con regresión. **No se migraron rutas, vistas ni módulos de negocio.**

Punto de partida: commit `761508f`, rama `codex/consolidate-local-admin`. Antes de ejecutar ya existían cambios de documentación del plan y la carpeta no versionada `.atl/`; se conservaron. No se crearon commits ni se cambió de rama.

## Entorno y aislamiento

- Windows, Node.js `v24.12.0`, npm `11.6.2`; dependencias ya instaladas del proyecto, copiadas físicamente a un directorio temporal. No hubo instalación ni actualización de paquetes.
- La copia contiene el código versionado del árbol de trabajo y un repositorio Git local nuevo, sin remoto. Para la segunda verificación se incorporaron únicamente los tres archivos de la corrección.
- Se retiraron del entorno de los comandos variables de base, proveedores y configuración local del storefront. Checkout y Zipnova deshabilitados; telemetría Next deshabilitada.
- Los procesos de preview existentes no se detuvieron ni se usaron como entorno de pruebas. Los builds se escribieron en la copia, no en su salida activa.
- Las pruebas HTTP del proyecto pueden abrir puertos efímeros de loopback y usar dobles. No se ejecutaron migraciones, bootstrap de usuarios, integración con MariaDB ni solicitudes reales a proveedores.

Esto prueba el código con las dependencias existentes; **no sustituye una instalación limpia desde lockfile**, la integración real ni una revisión de producción.

## Resultados antes y después

| Comando desde la raíz de la copia | Línea base sin corrección | Después de corregir el arnés |
|---|---|---|
| `npm.cmd run lint` | Exit 0 | Exit 0 |
| `npm.cmd run typecheck` | Exit 0, ambos workspaces | Exit 0, ambos workspaces |
| `npm.cmd test` | Exit 0; API 172/172, web 60/60 | Exit 0; API 177/177, web 60/60 |
| `npm.cmd run build` | Exit 0; TypeScript API y Next | Exit 0; TypeScript API y Next |

Ningún test del runner principal fue omitido o cancelado en las ejecuciones aprobadas. Los cinco tests nuevos explican el aumento de API; las aserciones de los subprocesos `.check.*` web no se cuentan por separado. No se midió cobertura porcentual.

El mapa API se contrastó automáticamente con los metadatos de los controladores de `AppModule`, incluyendo la herencia de taxonomías: **50 métodos/rutas declarados y 50 documentados, sin faltantes ni extras**. Esta inspección no instancia la aplicación, no abre puertos y no conecta una base; confirma registro declarativo, no respuestas HTTP.

Antes había 54 archivos de tests API y 26 web; después hay 55 y 26. Los cinco archivos `*.integration.ts` se inventariaron, **no se ejecutaron**. La salida compilada API de la copia se inspeccionó: no contiene archivos `checkout-browser-*`, `*.test.*` ni `*.integration.*`.

### Incidencias del entorno de validación

El primer intento de copia usó un enlace a dependencias fuera de su raíz y no tenía Git. Fallaron una prueba de protección del almacenamiento privado (necesita contexto Git) y Turbopack (no resuelve ese enlace fuera de su raíz). Se conservó la evidencia y se corrigió **la copia temporal**, no el código de aplicación: repositorio Git local y dependencias físicas. Luego tests y build pasaron. No se deshabilitaron pruebas ni se cambió el bundler.

Persisten advertencias previas `MODULE_TYPELESS_PACKAGE_JSON` en tests web. No se alteró el sistema de módulos como parte de la reorganización.

## Corrección T02.1 — Inventario de tablas del arnés

**Causa:** el [arnés](../tests/browser/checkout-browser-harness.ts) ejecuta el conjunto de migraciones, pero su lista de tablas esperadas no incluía `product_images`, `product_image_derivatives` y `product_image_quota`, creadas por la [migración de medios](../src/infrastructure/database/migrations/1793360700000-product-images.ts). El esquema completo de 16 tablas era rechazado por una lista de 13.

**Cambio:** extraer la comprobación sin I/O a [checkout-browser-schema.ts](../tests/browser/checkout-browser-schema.ts) y agregar únicamente esos tres nombres. Se mantiene el conteo exacto, la lista explícita y el requisito `BASE TABLE`. No se cambiaron preflight, migraciones, credenciales, conexiones, fixtures o limpieza.

### Evidencia de regresión

Comando actual para repetir la prueba desde la raíz (en T02 se ejecutó antes del traslado, desde `src/database`):

```powershell
.\node_modules\.bin\tsx.cmd --test tests/browser/checkout-browser-schema.test.ts
```

1. Se preparó la extracción conservando la lista antigua y se caracterizó el rechazo de esquema vacío. El fallo inicial de importación durante esa preparación **no se usa como prueba del defecto**.
2. **RED:** la [regresión](../tests/browser/checkout-browser-schema.test.ts) captura las sentencias emitidas por la migración real de medios mediante un `QueryRunner` falso, sin ejecutar SQL. Con la lista antigua, 4 tests pasaron y el caso de esquema completo falló con `Unexpected objects after migration`.
3. **GREEN:** tras agregar los tres nombres, 5/5 tests pasan: esquema completo, vacío, tabla requerida ausente, nombre inesperado con igual conteo y rechazo de vistas/tablas adicionales.
4. Las cuatro comprobaciones generales volvieron a pasar con la corrección incorporada en la copia aislada.

**Límite:** se verificó el validador del inventario, no una ejecución integral del arnés sobre MariaDB. Esa ejecución sigue requiriendo autorización, exclusividad y un esquema aislado conforme a [checkout en navegador](checkout-browser-e2e.md).

**Reversión de esta unidad:** restaurar el bloque original del arnés y retirar los dos archivos `checkout-browser-schema*` juntos. No requiere revertir datos o migraciones. El inventario documental es una unidad separada.

## Revisión y siguiente límite

Una revisión independiente de seguridad/arquitectura comparó el inventario con controladores, guardas, sesiones, migraciones y exclusiones del build; no encontró bloqueos materiales en esta unidad. Esa revisión fue de código, no una segunda ejecución de tests o de servicios.

RDD se consultó antes de editar fuente: `off`, gobernado por configuración global; no se inició ningún ciclo RDD. No se habilitaron automatizaciones ni ejecución remota.

El siguiente bloque es T03–T05: convenciones documentadas y piloto de catálogo. Hay procesos de desarrollo observando el código actual; antes de mover archivos de la aplicación debe coordinarse la pausa/reinicio del preview o un entorno de trabajo aislado. T06–T08 y los checkpoints posteriores siguen pendientes; Next continúa atendiendo todas las páginas.
