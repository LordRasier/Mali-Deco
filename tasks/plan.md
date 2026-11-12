# Plan de reorganización y migración a NestJS MVC

## Featured products and discounted prices (2026-11-11)

1. Add an opt-in featured product flag and a featured source for landing blocks. Preserve existing published category/manual selections and the draft/publish boundary.
2. Add nullable variant discount prices with an additive migration. A discount is active only below the regular price; empty removes it, equal/higher retains the regular charge. Use integer minor units throughout.
3. Apply the effective price consistently to listing/filter/sort, cart, shipping, quote and locked order validation. Preserve immutable existing orders and payment amounts.
4. Add admin fields and diagonal discount ribbons with regular/effective prices. Multi-option cards show the discount of the selected option only, never an invented product-wide percentage.
5. Prove behavior with failing-first tests, browser fixtures, full checks and an independent monetary review. Local activation and subsequent GitHub publication were separately authorized on 2026-11-12; production access and migration execution remain out of scope.

## Contacto alineado y Mercado Pago de prueba (2026-11-07)

1. Corregir la grilla de contacto con columnas iguales; comprobar escritorio, tablet y móvil.
2. Incorporar Checkout Pro exclusivamente de prueba, desactivado por defecto, sobre el pedido y su total verificado. Persistir el inicio de pago y recuperar respuestas inciertas sin duplicar pedidos, preferencias ni descuentos de stock.
3. Abrir Mercado Pago en otra pestaña y consultar el resultado desde el servidor local. Validar cuenta vendedora de prueba, referencia, importe, moneda y modo de prueba; no confiar en parámetros del navegador.
4. Mantener las protecciones locales. Esta etapa no expone un webhook, no abre túneles y no habilita producción. La prueba externa requiere credenciales de cuenta de prueba y una URL HTTPS de retorno propia, configuradas y autorizadas por separado.
5. Pruebas primero, revisión independiente de pagos, suites completas, tipos, lint, compilación y capturas. Sin cambios a productos ni envíos reales.

La confirmación automática mediante notificaciones queda fuera de esta primera prueba local; el comprador conserva la pestaña local y consulta allí el estado confirmado por Mercado Pago.

## Checkout local compacto (2026-11-07)

Autorizado: recuperar el recorrido desde el carrito y registrar pedidos de prueba visibles en administración. Mercado Pago se presenta como método previsto, explícitamente inactivo; no se conectan credenciales, cobros, etiquetas ni envíos. Los pesos de los ejemplos son ficticios.

1. Restablecer página y API únicamente con opt-in de desarrollo local. Mostrar el acceso desde las tarjetas de resumen del carrito; producción y configuración predeterminada conservan 404. Cotizar pedidos locales con datos numéricos validados, sin declarar embalajes aptos para despacho. Conservar origen, sesión, CSRF, vencimiento e idempotencia.
2. Rediseñar la página existente: contacto, entrega, método de pago y resumen; campos de 44 px, filas compactas, bordes finos, blanco y color primario configurado. Mantener controles estables, validación nativa, errores, recuperación y confirmación accesible.
3. Verificar pruebas de límites/estado/interfaz primero en rojo, luego suites, tipos, lint y build. Recorrer el flujo local con datos sintéticos, comprobar pedido en DB y estados no iniciados, revisar 390/768/1280 px. No modificar catálogo, desplegar ni ejecutar transacciones reales.


## Personalización del escaparate y ampliación de imágenes

Cambio local solicitado: permitir al propietario elegir el color principal, subir el banner y la ilustración inferior desde Configuración; retirar «Ver carrito» del panel lateral y ampliar fotos de las tarjetas.

1. Ampliar los ajustes persistidos y la carga de imágenes existente, con migración aditiva, validación estricta, autorización owner/origen/CSRF y valores actuales como respaldo. Servir el tema como CSS del mismo origen, sin relajar CSP; conservar contraste legible para colores claros.
2. Exponer los controles en Configuración y usar las imágenes configuradas en inicio y fondo del catálogo. Mantener borradores ante errores y evitar escrituras repetidas o respuestas de sesiones anteriores.
3. Retirar el enlace redundante del carrito y agregar una ventana accesible de ampliación que use la foto actual de cada tarjeta, permita zoom y cierre con Escape, restaure foco/desplazamiento y gestione errores de imagen.
4. Escribir regresiones antes de cada comportamiento, ejecutar suites completas/tipos/lint/build, revisar el cambio y comprobar escritorio/móvil. No modificar productos, activar pagos ni realizar despliegues remotos.

## Ampliación: único origen de datos público

Retirar la selección de demostración en el arranque público y el cliente; conservar la clave del carrito real sin importar carritos sintéticos. Las variables antiguas no deben reactivar datos de ejemplo. Verificar con pruebas de configuración, HTTP y la suite existente; conectar únicamente la copia local autorizada, sin migraciones ni cambios a la base original. Los dobles de prueba siguen siendo explícitos y no constituyen un modo de ejecución público.

> Plan original aceptado. La implementación consolidada se documenta en [estado actual](todo.md) e [informe de cierre](../docs/rework-completion.md). Las instrucciones de convivencia son históricas.
**Estado: ejecución local autorizada por el usuario, por etapas.** T01–T07 completas para el piloto, T08 parcial y T21a adelantada; consultar [tareas](todo.md). El usuario aceptó el patrón del checkpoint A; T09.1–T09.4 entregan estado, cotización y [listado SSR aislado](../docs/catalog-ssr-migration.md). Controles visuales de filtros y paridad siguen pendientes. La autorización no incluye despliegues, cambios de base o proveedores. El destino sigue siendo una sola aplicación NestJS; Next aún atiende las páginas de negocio.

## Lectura rápida

1. Revisar la estructura propuesta y el mapa de rutas de este documento.
2. Aprobar las decisiones pendientes antes de cambiar comportamiento.
3. Ejecutar las unidades de [la lista de tareas](todo.md), conservando pruebas y posibilidad de reversión por etapa.

La reorganización de archivos, el cambio de renderizador y la eliminación del monorepo son **tres cambios separados**. Primero se prueba un módulo piloto; después se migra por recorridos completos; finalmente se retiran Next.js y los workspaces.

## Objetivo y límites

El objetivo es adoptar la claridad de Laravel: archivos con una responsabilidad, controladores pequeños, servicios y providers explícitos, modelos reconocibles y vistas con layouts y parciales. No se pretende reproducir Laravel ni introducir un framework propio sobre Nest.

- Mantener MariaDB, TypeORM, los datos, las migraciones existentes y los contratos observables durante la transición.
- Conservar el diseño y las capacidades actuales; cambiar React/Next por plantillas no autoriza un rediseño visual o funcional.
- Usar JavaScript del navegador donde haga falta para carrito, formularios, imágenes y recuperación de pedidos; vistas del servidor no significa eliminar toda interacción cliente.
- Incorporar eventos, listeners, colas, tareas programadas o triggers únicamente ante un caso de uso demostrado, con sus pruebas y costo operativo documentados.
- No implementar pagos, reservas de stock, despacho real ni preparación productiva como parte de esta reorganización.

## Punto de partida verificado antes de reorganizar

| Área | Situación actual | Consecuencia para el plan |
|---|---|---|
| Aplicaciones | [Manifiesto raíz](../package.json) con `apps/*`; [web](../package.json) usa Next.js y [API](../package.json) usa NestJS | Mantener ambos ejecutables hasta verificar la sustitución de las páginas |
| Catálogo | [Carpeta actual](../src/modules/catalog) con 31 archivos directos, incluyendo pruebas | Separar responsabilidades sin convertir cada archivo en una carpeta |
| Composición | [AppModule](../src/app.module.ts) registra numerosos controladores y providers | Extraer módulos funcionales con contratos de importación/exportación explícitos |
| Rutas | [Bootstrap](../src/main.ts) aplica `/api/v1` globalmente | Separar HTML y API sin cambiar accidentalmente las URLs JSON |
| Administración | [Navegación actual](../src/presentation/admin/client/navigation.ts) por fragmentos; [contrato de uso](../docs/admin-local.md) conserva borradores en memoria | Migrar enlaces y estado conscientemente; no perder formularios al cambiar de sección |
| Pruebas | [Pruebas web](../tests/client) incluyen imports de rutas actuales y arneses React | Sustituir cobertura de comportamiento, no borrar pruebas para conseguir verde |
| Compilación | [Configuración API](../tsconfig.build.json) compila TypeScript y excluye pruebas/arneses concretos | Incorporar plantillas y assets al build; mantener fuera los dobles de prueba |

### Alerta previa a la línea base

La inconsistencia previa del [arnés de checkout](../tests/browser/checkout-browser-harness.ts), cuya lista omitía las tablas de medios, quedó corregida en T02.1 con regresión RED/GREEN sobre el validador aislado. Véase [evidencia y límites](../docs/migration-baseline.md). No se ejecutó el arnés completo ni se comprobó una base real; esa validación sigue pendiente y no debe darse por aprobada por esta corrección.

## Estructura objetivo

Propuesta de destino final, **no estructura ya existente**. Los nombres técnicos siguen en inglés y la documentación mantiene el español profesional del repositorio.

```text
README.md                       Entrada al proyecto y comandos vigentes
package.json                    Una aplicación y un conjunto de comandos
src/
  README.md                     Mapa del código y recorrido de una petición
  main.ts                       Arranque, sin lógica de negocio
  app.module.ts                 Composición de módulos
  config/                       Configuración validada
  infrastructure/
    database/                   Conexión y migraciones históricas
  presentation/
    layouts/                    Estructura compartida de tienda y administración
    partials/                   Elementos visuales realmente compartidos
  modules/
    README.md                   Índice funcional con enlaces
    catalog/
      README.md                 Rutas, reglas y recorrido principal
      catalog.module.ts
      controllers/              Entradas HTTP web, API y administración
      services/                 Casos de uso y reglas existentes
      models/                   Entidades y tipos del catálogo
      queries/                  SQL y proyecciones de lectura, cuando corresponda
      views/                    Plantillas de esta funcionalidad
      client/                   Interacción del navegador de esta funcionalidad
    identity/
    storefront/
    cart/
    checkout/
    orders/
    shipping/
    media/
    settings/
public/                         Assets públicos, nunca fuentes o secretos
tests/
  integration/                  Pruebas con infraestructura aislada
  browser/                      Recorridos del navegador
  support/                      Dobles y arneses no productivos
docs/
  README.md                     Índice por necesidad del lector
  routes.md                     URL → módulo → controlador → servicio → vista
  decisions/                    Decisiones y alternativas relevantes
tasks/
  plan.md
  todo.md
```

### Reglas para que siga siendo intuitiva

1. **Primero funcionalidad, después responsabilidad.** No crear una carpeta global de todos los controladores o servicios. Los elementos de catálogo permanecen cerca del catálogo.
2. Crear solamente las subcarpetas que tengan contenido real. Un módulo pequeño no necesita todas las carpetas del ejemplo; subdividir `controllers/` o `views/` por `public/` y `admin/` cuando ayude a distinguir recorridos.
3. Mantener pruebas unitarias junto a lo que verifican. Mover integración y arneses fuera del código productivo, actualizando descubrimiento y exclusiones antes de retirar las rutas anteriores.
4. Controladores delegan; servicios no dependen de vistas o del navegador. Una página HTML puede invocar servicios directamente, sin hacer HTTP contra la propia aplicación. Mantener adaptadores JSON donde exista un cliente que los necesita.
5. No crear `common/`, `utils/` o `helpers/` como depósitos generales. Extraer algo compartido cuando haya consumidores reales y una responsabilidad con nombre claro.
6. Reutilizar comportamiento mediante composición/providers, no imitar traits de PHP ni crear clases base universales. Modelos no deben absorber renderizado, correo o acceso HTTP por comodidad.
7. No imponer un número arbitrario de líneas por archivo. Dividir por motivos de cambio, contratos y legibilidad; separar nombres ambiguos como `api.ts` o `types.ts` cuando su ámbito deje de ser evidente.

### Mapa de responsabilidades existentes

| Origen actual | Destino funcional propuesto | Qué preservar |
|---|---|---|
| `catalog` público, reglas, variantes y taxonomías | `modules/catalog` | Filtros, paginación, precios enteros y reglas de archivo |
| Ajustes incluidos en `catalog` | `modules/settings` | Autoridad owner y nombre de tienda real |
| Resolución y estado del carrito repartidos entre catálogo/web | `modules/cart`, usando servicios de catálogo | Claves de almacenamiento, monedas y reconciliación autoritativa |
| `identity` | `modules/identity` | Sesiones, roles, origen, CSRF y límites existentes |
| `shipping` | `modules/shipping`, con proveedores agrupados por integración | Activación local explícita y rechazo seguro |
| `checkout`, `orders`, `media` | Módulos homónimos | Idempotencia, revisiones, límites de carga y ausencia de operaciones reales |
| Portada y elementos compartidos web | `modules/storefront` y `presentation` | Arte aprobado, metadatos y comportamiento responsive |
| `database` y arneses mezclados | `infrastructure/database` y `tests` | Identidad de migraciones, descubrimiento y aislamiento |
| Contrato de proveedor de pagos existente | Mantener contrato y pruebas localizables con pedidos/checkout; decidir ubicación en su README | No crear un módulo de pagos vacío ni habilitar cobros |

## Navegación por rutas y por código

Los decoradores de los controladores son la autoridad de registro HTTP. El índice de rutas es documentación verificable, **no un segundo router mantenido a mano**. Elegir la composición del prefijo API mediante una prueba de integración antes de modificar el bootstrap.

| Ruta o familia | Propietario previsto | Recorrido que debe documentarse |
|---|---|---|
| `/` | storefront | Controlador web → catálogo/ajustes → vista de portada |
| `/catalogo` | catalog | Controlador web → consulta y filtros → vista de listado |
| `/productos/:slug` | catalog | Controlador web → producto/variantes → detalle o 404 |
| `/carrito` | cart | Vista → cliente local → resolución de catálogo |
| `/checkout` | checkout | Vista contenedora → cliente acotado → API de checkout local |
| `/admin` | identity y shell administrativo | Autenticación → navegación autorizada → página inicial |
| `/admin/products`, `/admin/classifications` | catalog | Rutas nuevas propuestas → casos de uso administrativos → vistas |
| `/admin/orders`, `/admin/settings` | orders, settings | Rutas nuevas propuestas → autorización por rol → vistas |
| `/api/v1/*`, incluyendo medios | Módulo funcional correspondiente | Mantener método, ruta, status, formato, permisos y efectos actuales |

No traducir ni renombrar las URLs públicas existentes durante esta migración. Las rutas administrativas nuevas requieren aprobación y compatibilidad con `/admin#products`, `#classifications`, `#orders` y `#settings`: el fragmento no llega al servidor, por lo que la compatibilidad necesita un pequeño puente cliente, no una redirección HTTP que intente leerlo.

Cada fila final de `docs/routes.md` tendrá método, URL, autenticación, controlador, servicio, vista/response y prueba asociada, con enlaces relativos. Los READMEs de módulo devolverán al índice y señalarán las dependencias hacia otros módulos.

**Prueba de orientación:** alguien que no implementó el cambio debe poder partir de `/productos/:slug` o de `/admin/orders`, encontrar su controlador y su prueba siguiendo enlaces, y explicar qué servicio llama sin buscar por todo el repositorio.

## Documentación por niveles

- **README raíz:** ejecutar la aplicación, estado real, estructura y enlaces a rutas, módulos, operaciones y plan.
- **README de cada carpeta funcional creada:** propósito, qué entra y qué no, puntos de entrada enlazados, relación con el padre/hijos, invariantes y verificación. No copiar listas exhaustivas de archivos.
- **Documentos de flujo:** catálogo, carrito, identidad, checkout y medios conservan sus detalles y límites; el README local enlaza el documento especializado en lugar de duplicarlo.
- **Decisiones:** registrar renderizador/build, fronteras de módulos, prefijos HTTP y transición de sesiones. Usar `docs/decisions/` si no aparece una convención previa al ejecutar la tarea; decisiones propuestas no se presentan como implementadas.
- **Comentarios de código:** explicar contratos, efectos secundarios y razones no evidentes. Evitar comentarios narrando cada instrucción.

Plantilla breve para los READMEs futuros:

```markdown
# Nombre y responsabilidad
Qué resuelve esta carpeta y qué queda fuera.

## Cómo recorrerla
Enlace al padre → punto de entrada → servicio → vista/resultado → prueba.

## Reglas importantes
Invariantes, permisos y efectos secundarios relevantes.

## Verificación
Comando enfocado y enlaces a pruebas y documentación de detalle.
```

No agregar READMEs a salidas generadas, dependencias o cada carpeta trivial. No mover todos los documentos existentes al principio: crear el índice, mantener enlaces y migrar cada documento junto con su funcionalidad. La organización documental debe reflejar el estado actual, no solamente el destino deseado.

## Transición sin perder comportamiento

### Convivencia temporal

Mantener Next y Nest mientras se migra. Un único origen visible para el navegador debe dirigir **una lista explícita de rutas** al renderizador nuevo; el resto permanece en el anterior. Diseñar primero el mecanismo local de asignación de rutas; no modificar ingress remoto ni habilitar exposición pública.

Migrar una ruta solamente después de comprobar su HTML, seguridad, estado y assets. Una excepción del nuevo renderizador no debe caer silenciosamente al anterior. Revertir una etapa cambia la asignación de esa ruta, no la base de datos ni operaciones ya efectuadas. No duplicar escrituras para comparar renderizadores.

Las páginas públicas actuales no son exclusivamente de lectura: [listado](../src/presentation/catalog/catalog-page.ts), [detalle](../src/presentation/products/product-page.ts) y [portada](../src/presentation/home/home-page.ts) usan el carrito; su [panel](../src/presentation/cart/client/browser/cart-surface.ts) incluye cotización. Por eso, antes del primer cambio de renderizador hay que portar y verificar el cliente compartido de carrito y su adaptador de cotización, preservando los bloqueos locales. La página completa del carrito y el checkout se migran después. Probar navegación MVC → página heredada → MVC, además de coexistencia entre pestañas, sin pérdida de estado.

### Contratos que no se pueden perder

| Riesgo | Tratamiento obligatorio |
|---|---|
| Prefijo global `/api/v1` | Verificar separación HTML/API y ausencia de rutas duplicadas con pruebas HTTP antes del cambio |
| Cookie checkout restringida a `/api/v1/checkout` | Conservar inicialmente esa cookie y la API JSON. La vista `/checkout` no supone que puede leerla; un cliente pequeño realiza las operaciones autorizadas |
| CSRF en header y validación JSON/origen | No sustituir peticiones por formularios HTML sin diseñar y probar el adaptador. No ampliar content types, orígenes o cookie paths para hacer funcionar una pantalla |
| Protecciones del proxy de Next | Preservar o reemplazar con evidencia cada guard antes de retirar Next; una vista nueva no habilita proveedores ni checkout |
| Borradores administrativos en memoria | Mantenerlos al navegar entre secciones mediante mejora cliente acotada, sin persistirlos en disco. Cualquier cambio de esta experiencia requiere aceptación explícita |
| Carrito y pedido incierto | Mantener claves separadas demo/API, cantidades, coordinación entre pestañas, clave idempotente y recuperación sin reenvío automático |
| Vistas y scripts nuevos | Escapar contenido, no insertar JSON sin serialización segura, no exponer secretos/tokens en assets o logs; revisar caché de HTML privado |
| Medios | Mantener permisos, tipos/tamaños, derivados, revisión optimista, retiro/restauración y rutas públicas |
| Build y traslado de pruebas | Servir plantillas/CSS/JS desde el artefacto compilado; preservar conteo de tests y exclusión de fixtures/arneses productivos |

## Orden de ejecución y puntos de aprobación

| Etapa | Entrega | Condición para continuar |
|---|---|---|
| 0. Inventario y línea base | Mapa de rutas, estado y evidencia de pruebas | Fallos existentes identificados; ninguna cobertura perdida |
| 1. Convenciones y piloto | Catálogo reorganizado, README navegable y prototipo MVC acotado | Validación humana de estructura, renderizador y estrategia de rutas |
| 2. Escaparate público | Adaptador de carrito/cotización primero; después portada, catálogo y producto con vistas | Paridad de URLs, interacción, filtros, errores, diseño y accesibilidad |
| 3. Estado y administración | Carrito, identidad y secciones administrativas | Seguridad, borradores y navegación atrás/adelante verificados |
| 4. Checkout local | Vistas y cliente mínimo sobre contratos conservados | Idempotencia y restricciones locales intactas; no ventas reales |
| 5. Consolidación | Retirada de Next, workspaces y rutas antiguas internas | Todos los recorridos aceptados; pruebas/build/docs reproducibles |

Las tareas concretas, dependencias, archivos y comprobaciones están en [todo.md](todo.md). No mezclar movimientos mecánicos y cambios de comportamiento en la misma unidad. Elegir un módulo piloto no autoriza reorganizar todo el árbol de una vez.

## Verificación y condiciones de cierre

Durante la convivencia, usar los comandos actuales: `npm run lint`, `npm run typecheck`, `npm test` y `npm run build`. Tras la consolidación, conservar esos comandos raíz y documentar sus nuevas rutas y alcance. Los comandos enfocados se determinan por las pruebas de cada unidad y se registran antes de editar.

- Aplicar TDD estricto al nuevo comportamiento: primero prueba fallida por la razón esperada, luego implementación y refactor. En movimientos puros, línea base más pruebas de descubrimiento/importación cuando corresponda.
- Comprobar pruebas descubiertas por nombre/recorrido, no solo un total o un exit code. Los patrones de búsqueda deben funcionar en Windows; no suponer que un glob del shell incluye nuevos niveles.
- Sustituir pruebas React por pruebas equivalentes de servicio, HTTP/HTML o navegador antes de retirar las anteriores. Revisar carga, vacío, error y recuperación además del caso feliz.
- Ejecutar integración de MariaDB solo con autorización y una base local aislada conforme a [validación local](../docs/ci.md) y [arnés de checkout](../docs/checkout-browser-e2e.md). No reutilizar la base de desarrollo ni crear/borrar esquemas automáticamente.
- Revisar en navegador móvil/escritorio, teclado, etiquetas, foco, mensajes de error, URLs compartidas y ausencia de fugas de datos privados.
- Revisión independiente de seguridad/arquitectura antes de cada corte irreversible. En implementación futura, comprobar el modo RDD para cambios de código y cumplirlo solo si ya está habilitado; este plan no lo activa.
- Cierre documental: todos los enlaces locales resuelven, ninguna instrucción activa exige Next, los límites de producción siguen visibles y los READMEs permiten realizar la prueba de orientación.

**Listo para consolidar no significa listo para vender.** Los bloqueos documentados de pagos, inventario, envíos y entrada pública continúan hasta sus entregas propias.

## Decisiones pendientes antes de implementar

1. Validar esta estructura por funcionalidad con responsabilidades internas y la experiencia de navegación de los READMEs.
2. Seleccionar motor y build de vistas mediante un piloto. Handlebars es candidato por el [ejemplo oficial MVC](https://docs.nestjs.com/http/mvc), no una dependencia ya elegida; verificar compatibilidad con la versión instalada, layouts, escape, assets y mantenimiento.
3. Aprobar las rutas administrativas propuestas y cómo conservar borradores y enlaces por fragmento.
4. Seleccionar la composición HTML/API y el selector local de rutas reversibles antes de mover cookies o retirar el proxy.

Para futuras necesidades, consultar [eventos](https://docs.nestjs.com/application/events), [colas](https://docs.nestjs.com/application/queues) y [tareas programadas](https://docs.nestjs.com/application/task-scheduling). Un evento interno no sustituye por sí solo una entrega durable; pagos y efectos externos necesitarán un diseño específico. No se agregan estas herramientas como parte del esqueleto.

## 2026-11-07 — Variant inventory and editable checkout quantities

Authorized scope: real per-variant stock in admin; shared quantity/removal controls in checkout; configurable product-wide large-order warning. No payment/shipment activation or remote work.

1. Inventory and warning settings: additive guarded migration, dedicated stock compare-and-set API/form, product threshold/text pair, public projections. Default stock0; existing made-to-order products retain behavior. General variant writes cannot overwrite inventory.
2. Server correctness: fresh stock validation for shipping/checkout; sorted parent then variant transaction locks; guarded decrement and order insert atomic; idempotent replay precedes stock work. Stock conflict is definitive only for first attempts; uncertain retries remain conservative. Test orders consume stock and say so.
3. Shared cart and checkout: all increase paths check fresh authoritative availability under existing browser lock; shortage preserves items and permits decrease/removal. Compact accessible − quantity + / trash; request locks and stable focus. Subtotal and shipping invalidated on edits, selected service revalidated against fresh quote. Product warnings aggregate variants at inclusive threshold.
4. Verify: strict RED/GREEN per slice; isolated MariaDB transaction/concurrency tests (no live fixture orders); full tests/types/lint/build; independent review; browser admin and checkout 390/768/1280 evidence. No production mode or made-up sample stock. Save scoped changes/artifacts before delivery.

Rollback boundaries: migration only if new stock/settings unpopulated; settings/API and public projections as coherent slice; stock validation/decrement and tests as one slice; shared UI quantity/warning behavior as one slice. Work remains uncommitted alongside prior user changes. SQL locking reference: https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/selecting-data/lock-in-share-mode (transaction-scoped locks).
