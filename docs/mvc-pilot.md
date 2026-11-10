# Piloto MVC de desarrollo

> Registro histórico de una etapa. Rutas de preview, flags y comandos de convivencia ya no son operativos. Consultar el estado consolidado (retirado; ver cobertura de reemplazo) y el [inicio vigente](../README.md).
Una página aislada permite comprobar NestJS + Handlebars antes de sustituir vistas de la tienda. **No hay traspaso de catálogo, carrito, checkout o administración.** Las rutas de negocio y sus permisos siguen vigentes.

## Qué está implementado

Además del piloto de texto, `/__mvc/cart` permite revisar el [panel compartido sin React](cart-panel-migration.md). Requiere el mismo flag en ambos procesos; para compartir el carrito demo configurar también `STOREFRONT_MODE=demo` en la API, no solo en Next. Si se omite, el panel usa el carrito API separado. No configurar demo para vender.

- `hbs` 4.4.0 fijado en manifiesto/lockfile, instalado desde npm público sin credenciales y sin scripts de instalación. Se agregaron nueve paquetes; no se cambiaron versiones de paquetes existentes.
- Layout, parcial, mensaje escapado y CSS local. El motor se instancia por aplicación; se deshabilitan explícitamente los dos permisos de acceso a prototipos que hbs habilita por defecto.
- Registro opcional de `/__mvc/pilot` y middleware estático acotado a `/__mvc/assets/`. Solo funcionan con desarrollo + flag exacto `true`.
- Next puede reenviar esos dos paths al mismo origen API de desarrollo. No hay fallback automático ni reescrituras MVC en producción.

Ver [código y recorrido](../src/presentation/README.md), [rutas](routes.md) y [decisión](decisions/0002-mvc-boundaries.md).

## Ejecutar sin base ni proveedores

Usar terminales nuevas y un checkout/copia sin otro Next dev ejecutándose sobre la misma salida `.next/dev`. No lanzar un segundo Next en esa carpeta mientras el preview existente esté activo.

API, desde la raíz:

```powershell
Remove-Item Env:DB_HOST -ErrorAction SilentlyContinue
$env:NODE_ENV='development'
$env:MVC_PILOT_ENABLED='true'
$env:PORT='3171'
$env:ZIPNOVA_ENABLED='false'
$env:LOCAL_TEST_CHECKOUT_ENABLED='false'
npm run dev:api
```

Next, en otra terminal:

```powershell
$env:NODE_ENV='development'
$env:MVC_PILOT_ENABLED='true'
$env:DEV_API_PROXY_ORIGIN='http://127.0.0.1:3171'
$env:STOREFRONT_MODE='demo'
$env:ZIPNOVA_ENABLED='false'
$env:LOCAL_TEST_CHECKOUT_ENABLED='false'
$env:NEXT_TELEMETRY_DISABLED='1'
npm run dev -w @store/web -- --port 3170
```

Abrir `http://127.0.0.1:3170/__mvc/pilot`. El navegador permanece en el origen Next mientras Nest renderiza HTML. El mensaje se puede probar con `?message=Texto`, hasta 200 unidades UTF-16. No introducir secretos en URLs. El modo demo de las páginas heredadas es explícito y no habilita ventas.

Para desactivar, quitar `MVC_PILOT_ENABLED` o ponerlo en `false` **en ambos procesos y reiniciarlos**. El piloto y sus assets deben devolver 404; las páginas heredadas mantienen su dueño. No hay cambio de datos que revertir. Flags distintos entre procesos son un error visible, no permiso para habilitar una ruta automáticamente.

## Seguridad y límites de la prueba

El controlador no acepta `layout`, `settings`, `cache`, `_locals` ni otros campos. Construye locales propios y fija el nombre de vista. Escapar HTML no vuelve confiables plantillas, getters u objetos arbitrarios. La CSP bloquea scripts; el root estático no incluye las plantillas.

Las pruebas HTTP de identidad y checkout usan los servicios reales con persistencia sintética en memoria. Comprueban roles, headers CSRF, rotación/revocación/expiración, flags y paths de cookies y rechazo de headers de proxy. **No son integración MariaDB ni un recorrido completo de administración con dos pestañas reales.** No se modificó el protocolo para admitir formularios HTML.

El argumento de entorno de `applicationModule`/`configureHttp` selecciona presentación; no sustituye la configuración de base y otros servicios, que conserva su entorno de proceso. Usar una selección capturada y una sola raíz dinámica por aplicación.

## Verificación

Desde la raíz:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Las pruebas específicas están en [presentación](../src/presentation), [MVC HTTP](../tests/http/mvc-pilot.test.ts), [identidad](../tests/http/mvc-session-boundaries.test.ts), [checkout](../tests/http/mvc-checkout-boundary.test.ts), [assets](../tests/http/view-assets.test.ts) y rewrites (retirado; ver cobertura de reemplazo).

Para la evidencia, consultar [verificación MVC](mvc-verification.md). El usuario ya aceptó el patrón del piloto; antes de migrar páginas reales siguen pendientes las subunidades de cliente compartido del carrito/cotización y sus verificaciones. El frontend existente no debe eliminarse todavía.

Fuentes: [MVC de Nest](https://docs.nestjs.com/http/mvc), [hbs](https://github.com/pillarjs/hbs), [opciones de Handlebars](https://handlebarsjs.com/api-reference/runtime-options.html), [rewrites de Next](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites). Revisar una versión fijada y su changelog no equivale a una auditoría global del proyecto.
