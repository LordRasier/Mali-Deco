# Storefront

La portada consume el catálogo público y ajustes publicados de la API. Configurar `API_BASE_URL` con el prefijo completo, por ejemplo `http://localhost:3001/api/v1/`. El nombre visible viene de `/catalog/settings`. Si falta configuración o falla la API, se muestra un error: **nunca** se sustituyen productos por datos ficticios.

Para revisar el concepto sin base de datos, iniciar Next en desarrollo con `STOREFRONT_MODE=demo`. Es una opción explícita de desarrollo; no se admite en producción. Las imágenes se generaron para ilustrar el concepto y los precios son de ejemplo. El contrato público actual no contiene imágenes ni colores: en modo API se muestran marcadores neutros y nombres de variantes, no arte de ejemplo. El carrito guarda solo IDs y cantidades en el navegador, separados por modo, y resuelve precios de los datos actuales. No implica reserva ni disponibilidad. Checkout, pagos y envíos no están conectados.

El adaptador recorre todas las páginas de productos y variantes con un máximo explícito de 1.000 de cada tipo y seis detalles simultáneos; si se supera el límite, falla en vez de truncar el catálogo. Esta primera implementación hace una petición de detalle por producto (N+1); antes de usar catálogos grandes se necesita paginación de interfaz y una estrategia de carga incremental. El backend no expone información de inventario ni fotos.

Verificación: desde la raíz, `npm run lint`, `npm run typecheck`, `npm test` y `npm run build`. Las pruebas del storefront también se pueden ejecutar con `npm test -w @store/web`. No se debe usar el modo demo para vender ni asumir que este slice habilita transacciones reales.

## Administración de catálogo (slice de desarrollo)

La ruta `/admin` usa la API real: inicio/cierre de sesión, consulta y gestión de productos y variantes. Los roles `owner` y `catalog` pueden gestionar el catálogo; `operations` puede iniciar y cerrar sesión, pero no editarlo. Los registros archivados son de solo lectura y no existe restauración. Las políticas de abastecimiento no son cantidades de inventario. Ventas, pedidos, stock, imágenes, pagos, envíos y ajustes administrativos aún no están implementados. No se simula el guardado ni se crean credenciales o cuentas de ejemplo.

Para desarrollo, use **exactamente** `http://localhost:3000` en el navegador y configure la API con `ADMIN_ORIGIN=http://localhost:3000`. Next redirige internamente `/api/v1/*` a `http://127.0.0.1:3001/api/v1/*` únicamente en desarrollo; el navegador sigue en el mismo origen. Opcionalmente, `DEV_API_PROXY_ORIGIN` cambia el destino mediante un origen HTTP(S) canónico, sin ruta, credenciales, consulta ni fragmento, por ejemplo `http://localhost:3001`. Esta opción es exclusiva del servidor de desarrollo y no debe confundirse con `API_BASE_URL`, que incluye `/api/v1/` para el storefront.

La sesión se mantiene en la cookie HttpOnly de Nest; el token CSRF permanece solo en memoria. Una recarga verifica la sesión y solicita un token nuevo. Distintas pestañas pueden invalidar mutuamente ese token: si se recibe un error de CSRF, recargue y revise antes de volver a enviar, sin asumir que una operación se completó. El servidor sigue siendo la autoridad para permisos y validaciones.

En producción el rewrite de Next está desactivado. Se requiere un ingreso HTTPS del mismo origen que envíe `/api/v1/*` a Nest y el resto a Next, preserve `Origin`, cookies y `X-CSRF-Token`/`Set-Cookie`, no almacene en caché respuestas de autenticación o administración y mantenga Nest privado. **Bloqueante de producción:** el limitador de inicio de sesión actual cuenta 10 intentos por 15 minutos por IP de conexión y cuenta, incluidos los exitosos. Tras un proxy, los clientes comparten el presupuesto de IP. Se necesita un diseño de ingreso/IP confiable revisado por separado; un limitador en el borde por sí solo no restablece el aislamiento por cliente. No habilitar `trust proxy` sin esa revisión.

La interfaz aún no se ha validado con MySQL, credenciales reales ni en un navegador real. Aplicar migraciones, crear la cuenta inicial y desplegar requieren sus propios pasos y autorización; no forman parte de este slice.
