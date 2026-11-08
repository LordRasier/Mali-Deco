# Reorganización modular y aislamiento de pruebas

> Registro histórico de una etapa. Rutas de preview, flags y comandos de convivencia ya no son operativos. Consultar el estado consolidado (retirado; ver cobertura de reemplazo) y el [inicio vigente](../README.md).
## Resultado

T03–T05 están implementadas. Se adelantó la unidad aislada T21a para separar arneses y pruebas del código productivo. **Next.js sigue atendiendo las páginas; todavía no se instaló un motor MVC ni se cambiaron URLs o políticas de seguridad.**

El punto de entrada para navegar es [apps/api](../README.md), seguido del [mapa de código](../src/README.md), el README de cada funcionalidad y el [mapa de rutas](routes.md). El [plan](../tasks/plan.md) conserva los cambios de renderizado pendientes.

## Qué cambió

- [AppModule](../src/app.module.ts) ahora compone siete módulos funcionales y una sola inicialización condicional de TypeORM. Ya no concentra controladores y factories de todo el negocio.
- Catálogo, identidad, medios, pedidos, checkout y envíos agrupan código por responsabilidad o integración. Ajustes tiene un módulo propio; no se crearon carpetas vacías para herramientas futuras.
- Cada carpeta funcional tiene un README corto con propósito, límites y enlaces. Catálogo pasó de 31 archivos directos a módulo + README; identidad de 22 a módulo + README; medios de 13 a módulo + README. Los archivos no se borraron: están agrupados con sus pruebas.
- [tests](../tests/README.md) contiene pruebas HTTP, infraestructura sin conexión, soporte de navegador e integración. El directorio productivo de base pasó de 28 archivos directos a 6, contando README; las migraciones permanecen en su ubicación y conservan su SQL.
- Se actualizaron imports, comando de bootstrap, descubrimiento de tests, typecheck, exclusiones de build y enlaces de documentación.

## Propiedad de dependencias

| Módulo | Imports funcionales | Exports intencionales |
|---|---|---|
| Identity | Ninguno | IdentityService, CatalogGuard, OwnerGuard |
| Catalog | Identity | Ninguno por ahora |
| Settings | Identity | Ninguno |
| Shipping | Ninguno | PostalCodeResolver |
| Orders | Identity | OrdersService |
| Checkout | Shipping, Orders | Ninguno |
| Media | Identity | Ninguno |

Se conservan los tokens de clase utilizados por los overrides del arnés. El resolver postal se crea una vez: sus candidatos y límites son estado compartido entre envíos y checkout. No se agregó otra conexión por módulo.

## Evidencia de pruebas

| Comprobación | Resultado final |
|---|---|
| `npm.cmd run lint` | Exit 0 |
| `npm.cmd run typecheck` | Exit 0 en ambos workspaces |
| `npm.cmd test` | Exit 0: API **182/182**, web **60/60**, sin omisiones |
| `npm.cmd run build` | Exit 0: API y Next |
| Inventario de archivos | 58 unitarios API, 26 runners web, 5 integraciones separadas |
| Contratos API | 50 combinaciones declaradas conservadas, incluidos métodos heredados |
| Código previo | 135 archivos TypeScript equivalentes tras normalizar únicamente paths relativos y el comentario de ubicación del arnés; AppModule excluido porque su composición cambió intencionalmente |
| Migraciones | Ocho archivos; nombres y SQL no modificados |

La verificación general se ejecutó en una copia temporal con dependencias físicas ya instaladas y contexto Git local, sin credenciales ni flags de proveedores. Se reemplazó y limpió únicamente el árbol API de esa copia para evitar aceptar archivos compilados obsoletos. No hubo instalación de paquetes ni cambios del lockfile.

### Pruebas nuevas y TDD

- [application-routing.test.ts](../tests/http/application-routing.test.ts): propiedad de providers por módulo, ausencia de duplicados en raíz, inventario congelado de rutas y HTTP real en loopback sin base. Los assertions de propiedad fallaron antes de extraer Identity, Catalog/Settings, Shipping/Orders/Checkout y Media; después pasaron.
- [module-composition.test.ts](../tests/http/module-composition.test.ts): conexión global falsa accesible desde features y mismo override postal capturado por ambos consumidores. No ejecuta SQL real.
- [build-boundary.test.ts](../tests/http/build-boundary.test.ts): falló con el build anterior sin `rootDir: src`; pasa con inclusión explícita de fuentes y descubrimiento de tests en ambos árboles.

Los errores intermedios de imports y nombres detectados durante los movimientos se corrigieron antes de la verificación final; no se deshabilitaron tests para compensarlos. La suite previa de negocio conserva sus aserciones.

## Artefacto compilado limpio

Una comprobación temporal (`node validation-logs/build-smoke.cjs` en la copia de validación) inspeccionó y ejecutó el artefacto:

1. **79 archivos JS**, incluyendo `main.js` y ocho migraciones; ningún `checkout-browser-*`, `*.test.*` o `*.integration.*`.
2. Se ocultó temporalmente el directorio fuente **de la copia**, con paths verificados dentro de esa copia. `node apps/api/dist/main.js` arrancó sin acceso a `src`; `/api/v1/health` respondió 200.
3. El mismo artefacto con `NODE_ENV=production` y sin base rechazó el arranque con exit 1 y `DB_HOST is required in production`, como corresponde.
4. Se cerró el proceso de prueba y se restauró la fuente temporal. No se movió ni borró la fuente del checkout para esta prueba.

Esta prueba no valida plantillas ni assets MVC: todavía no existen. Tampoco equivale a una instalación limpia desde npm.

## Preview y límites operativos

Se pausó el watcher API de este checkout y se reinició con la configuración local ya documentada, manteniendo checkout y Zipnova deshabilitados. No se modificó el otro preview compilado que estaba activo fuera del repositorio.

Después del arranque respondieron 200:

- `http://127.0.0.1:3101/api/v1/health`
- `http://127.0.0.1:3101/api/v1/catalog/facets?currency=ARS`
- `http://127.0.0.1:3100/catalogo`

Son comprobaciones de lectura del preview. No se ejecutaron migraciones, bootstrap, escrituras comerciales, cobros, cotizaciones externas ni el arnés integral de MariaDB. No se probó una sesión administrativa real en navegador como parte de esta entrega.

## Revisión y reversión

La revisión independiente inspeccionó módulos, límites de DI, token postal compartido, overrides del arnés, protección de carga de medios y exclusiones/descubrimiento. No encontró regresiones materiales de código. Detectó un comando antiguo de integración del pool en [mariadb-local.md](mariadb-local.md), que se corrigió sin cambiar sus requisitos de autorización. Esa revisión fue de código; no se presenta como una segunda ejecución de la suite.

La reversión de esta unidad restaura módulos/imports y movimientos juntos, con sus scripts de tests/build y documentación. No exige revertir esquema. No se crearon commits ni se alteró `.atl/`. RDD permanece desactivado; no se inició su ciclo.

## Próximo límite

Al cerrar esta etapa, T06 estaba pendiente de autorización para descargar el motor. Posteriormente el usuario autorizó npm público anónimo y se implementó el piloto; consultar [evidencia MVC posterior](mvc-verification.md). Este informe conserva la evidencia de la reorganización, no describe el estado más reciente del renderizador.
