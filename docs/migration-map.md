# Matriz de migración y dependencias

> Registro histórico de una etapa. Rutas de preview, flags y comandos de convivencia ya no son operativos. Consultar el estado consolidado (retirado; ver cobertura de reemplazo) y el [inicio vigente](../README.md).
**Etapa T01: inventario actual.** Ninguna ruta cambió de propietario. Los destinos son propuestas del [plan](../tasks/plan.md), no carpetas ya creadas. Consultar el [mapa de rutas](routes.md) para seguir cada entrada al código y sus pruebas.

**Actualización T03–T05/T21a:** la API ya está dividida en siete módulos, sus archivos agrupados y el soporte de pruebas trasladado a `tests`. Next conserva todas las páginas. Las tablas siguientes conservan el origen de la línea base para orientar la transición; el estado actualizado y sus límites están en [la evidencia modular](migration-stage-one.md).

## Propiedad temporal por recorrido

| Recorrido | Origen actual | Destino final propuesto | Propietario actual y condición de traspaso |
|---|---|---|---|
| Portada, listado, detalle | `apps/web/src/app`, `components`, `lib` | `src/modules/storefront`, `catalog`, layouts compartidos | Next; T09.1–T09.3 (carrito/cotización) antes del primer cambio de página, luego T09–T11 |
| Panel y página de carrito | `useCart`, `cart-storage`, `cart-resolution`, `CartDialog` | `src/modules/cart/{client,views,controllers}` | Next + resolución Nest; preservar claves/pestañas antes de T12 |
| Acceso y shell administrativo | `src/presentation/admin/client`, `src/modules/identity` | `src/modules/identity`, presentación administrativa | Next para UI, Nest para seguridad; T08/T13 antes de migrar secciones |
| Productos, variantes, clasificaciones | `src/modules/catalog`, UI `admin` | `src/modules/catalog` | Nest negocio/API, Next UI; T14–T15 después de shell y pruebas de permisos |
| Imágenes | `src/modules/media`, UI `ProductImages` | `src/modules/media` | Nest HTTP/persistencia, Next UI; T16 conserva revisión/idempotencia |
| Consulta de pedidos | `src/modules/orders`, UI `Orders`/`OrderDetail` | `src/modules/orders` | Nest negocio/API, Next UI; T17 conserva roles y estados locales |
| Ajustes de tienda | `catalog/store-settings`, UI `StoreSettings` | `src/modules/settings` | Nest negocio/API, Next UI; T18 sin cambiar esquema |
| Destino y cotización | `src/modules/shipping`, componentes/lib web | `src/modules/shipping` | Next UI/proxy y Nest guardas/proveedores; adaptador T09.3, checkout T19 |
| Confirmación y recuperación | `checkout`, `orders`, `CheckoutView` | `src/modules/checkout` | Next UI, Nest API; T20 conserva JSON/cookie scope/clave de intento |
| API y medios públicos | Controladores Nest y prefijo global | Controladores de cada módulo funcional | Nest siempre; T07 separa HTML sin modificar `/api/v1/*` |
| Migraciones y pool | `src/infrastructure/database` | `src/infrastructure/database` | Nest/CLI; T21 mueve rutas pero no DDL ni identidad de migraciones |
| Arnés y dobles | `database/checkout-browser-*`, pruebas web | `tests/{integration,browser,support}` | Solo pruebas; no importar ni empaquetar en producción |

## Dependencias que condicionan el orden

```text
Inventario + línea base
  → convenciones + piloto de catálogo
  → composición modular + prueba MVC/build
  → prefijos/rutas y frontera de sesión
  → cliente compartido carrito/destino/cotización
  → páginas públicas → carrito completo
  → acceso/shell → productos → variantes/clasificaciones/imágenes
                  → pedidos y ajustes
  → checkout local y recuperación
  → infraestructura/arneses → retirada de Next/workspaces
```

Las ramas del diagrama no autorizan cambios concurrentes sobre archivos compartidos. Mantener un escritor por unidad conectada. La composición de providers, prefijos, cookies y assets se revisa antes del traspaso de una ruta; no corregir esos contratos incidentalmente al mover una vista.

## Rutas internas y herramientas acopladas

| Dependencia actual | Riesgo al mover | Verificación necesaria |
|---|---|---|
| [AppModule](../src/app.module.ts) y imports relativos de catálogo/identidad | Provider duplicado, import roto, ciclo | Prueba de composición y arranque offline |
| [Configuración de base](../src/infrastructure/database/database-options.ts) importa entidades y usa `__dirname` para migraciones | Omitir/repetir migraciones o alterar metadatos | Comparar descubrimiento y nombres sin ejecutar DDL |
| [Scripts API](../package.json) apuntan a `src/main.ts`, bootstrap y data-source | CLI rota tras consolidar carpetas | Probar resolución de paths; no ejecutar bootstrap/migraciones automáticamente |
| `tsx --test src/**/*.test.ts` | Nueva profundidad puede cambiar descubrimiento | Contar archivos y nombres de tests ejecutados; confirmar comportamiento en Windows |
| [Pruebas web](../tests/client) importan fuente y lanzan archivos `.check.ts/.cjs/.tsx` | Borrar tests o perder aserciones al retirar React | Trasladar o sustituir por cobertura equivalente antes de eliminar arneses |
| [Build API](../tsconfig.build.json) excluye `checkout-browser-*` y pruebas | Incluir fixtures/arneses en distribución | Inspeccionar artefacto compilado tras cada cambio de ruta |
| Config Next (retirado; ver cobertura de reemplazo), proxy (retirado; ver cobertura de reemplazo), scripts locales | Cambiar origen, headers o abrir una función bloqueada | Pruebas negativas HTTP y convivencia bajo un origen |
| [Prueba de almacenamiento privado](../src/modules/shipping/private-path.test.ts) | Copia sin Git falla por falta de contexto, no por código | El sandbox de validación necesita un repositorio Git local |
| Dependencias de Next fuera de la copia mediante enlace | Turbopack rechaza resolver fuera de la raíz | Dependencias físicas en la copia para build representativo |

## Cobertura inicial y límites

Antes de cambios de fuente hay **54 archivos API `*.test.ts`**, **26 archivos web `*.test.mjs`** y **5 archivos de integración API `*.integration.ts`**. Los archivos auxiliares `.check.*` de web también ejecutan aserciones: el conteo del runner principal no representa todas esas aserciones internas. La línea base registra los resultados observados, no porcentajes de cobertura inventados.

Una prueba con transportes o base simulados no equivale a integración MariaDB ni a una visita de navegador. Consultar [validación local](ci.md), [checkout en navegador](checkout-browser-e2e.md) y [estado de desarrollo](estado-del-desarrollo.md) antes de ejecutar pruebas que requieran servicios.

## Reversión por unidad

- Documentación: revertir solo sus cambios, sin tocar fuentes o datos.
- Movimiento mecánico: restaurar archivo y sus imports/tests juntos; conservar el comportamiento anterior.
- Ruta MVC: volver a asignarla al renderizador anterior bajo el mismo origen. No repetir escrituras para comparar.
- Consolidación: mantener una versión anterior utilizable; no retirar workspaces hasta tener scripts nuevos operativos. No revertir esquema para cambiar renderizador.
