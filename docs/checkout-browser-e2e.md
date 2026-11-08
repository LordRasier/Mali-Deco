# Prueba aislada de checkout en navegador

Este arnés es exclusivamente para pruebas locales autorizadas. Compone la aplicación Nest real mediante `applicationModule` y `@nestjs/testing`, con HTML canónico y API `/api/v1` en el mismo servidor. Sustituye solamente la identidad administrativa, el destino postal y el proveedor de cotización por dobles sintéticos. Las sesiones de checkout, el catálogo, las cotizaciones y los pedidos usan Nest y MariaDB reales. El proveedor simulado no se registra en el runtime normal ni se emite en una compilación limpia de producción. No hay servidor Next ni proxy entre navegador y API.

## Antes de comenzar

- Coordinar exclusividad: ningún otro proceso debe usar `store_integration_test`. El arnés exige 127.0.0.1:3306, root sin contraseña autorizado, esquema existente sin tablas, vistas, rutinas ni eventos, visibilidad de metadatos y ningún otro cliente conectado al esquema. Si no puede comprobarlo, no aplica migraciones. La comprobación no impide conexiones futuras: mantener exclusividad durante toda la prueba.
- Usar terminales nuevas y entorno limpio. El arnés rechaza variables `ZIPNOVA_*` heredadas salvo `ZIPNOVA_OPERATOR_ORIGIN` y `ZIPNOVA_ENABLED=false`. No usar credenciales reales, datos reales, la base de la aplicación ni el preview activo.
- Instalar el lockfile de la copia con `npm ci --ignore-scripts --no-audit --no-fund`. No usar GitHub Actions.
- La autorización para desarrollar localmente no autoriza ejecutar este arnés contra una base. Confirmar primero el esquema, la cuenta y la operación de prueba; no ejecutar la integración de MariaDB como parte de una verificación ordinaria sin base.

## Iniciar el único servidor de prueba

Desde la raíz del repositorio, en una terminal PowerShell dedicada:

```powershell
$env:NODE_ENV='development'
$env:STOREFRONT_MODE='api'
$env:LOCAL_TEST_CHECKOUT_ENABLED='true'
$env:CHECKOUT_BROWSER_E2E='1'
$env:DB_HOST='127.0.0.1'
$env:DB_PORT='3306'
$env:DB_USERNAME='root'
$env:DB_PASSWORD=''
$env:DB_ALLOW_EMPTY_PASSWORD='1'
$env:DB_DATABASE='store_integration_test'
$env:PORT='3191'
$env:ZIPNOVA_OPERATOR_ORIGIN='http://127.0.0.1:3191'
$env:ZIPNOVA_ENABLED='false'
npm run prepare:assets
.\node_modules\.bin\tsx.cmd --tsconfig tsconfig.json tests/browser/checkout-browser-harness.ts
```

El puerto es configurable, pero `ZIPNOVA_OPERATOR_ORIGIN` debe ser exactamente `http://127.0.0.1:<PORT>`, sin barra final ni alias `localhost`. El servidor normal usa 3000 por defecto; el ejemplo reserva 3191 para aislar esta prueba. No definir `API_BASE_URL` ni `DEV_API_PROXY_ORIGIN`.

El arnés aplica migraciones y crea un producto sintético de encargo. No cambia el fixture existente de la tienda. Esperar el mensaje de servidor Nest listo; si hay error, detenerse y preservar el esquema para inspección. No imprimir cookies, tokens ni el contenido de pedidos.

## Recorrer la tienda del mismo origen

En `http://127.0.0.1:3191`, agregar el artículo sintético y registrar **un solo pedido de prueba** en `/checkout`, con correo terminado en `@example.test` y dirección/teléfono sintéticos. Elegir la entrega simulada. Verificar la confirmación en pantalla: pedido de prueba recibido, pago y envío no iniciados. La vista `/admin` acepta únicamente en este arnés el usuario sintético `synthetic@example.test` y la clave sintética `synthetic-only`; no son cuentas persistidas. Comprobar lista y detalle del pedido. No iniciar un segundo servidor web.

El código postal y la localidad elegida en el carrito se comparten con el checkout. Al recargar, se conserva en `sessionStorage` un identificador opaco de localidad como sugerencia y solo se restaura si una consulta nueva devuelve ese mismo identificador para el código postal. Si cambió o fue desalojado, se pide elegir de nuevo. El checkout siempre obtiene una cotización propia del servidor; la estimación del carrito no autoriza el pedido.

Si el navegador conserva una sesión de una base de prueba anterior, el checkout permite descartarla explícitamente cuando no hay un intento incierto en esa pestaña y el navegador admite Web Locks. Las operaciones de inicio y descarte se coordinan entre pestañas que usen esta versión. Si existe un intento incierto en cualquier pestaña, no reiniciar: conservarlo y consultar al administrador. Descartar la sesión no crea ni reenvía un pedido; después hay que consultar la entrega nuevamente. Cookies duplicadas no se descartan automáticamente porque podrían pertenecer a rutas distintas.

En la terminal del servidor, escribir `verify` y Enter. La rutina comprueba la existencia y contenido de una orden sintética, luego ejercita por HTTP del mismo origen una sesión nueva, replay de la misma clave, rechazo de una cotización reutilizada y creación con una nueva cotización; exige tres órdenes persistidas en total. La evidencia de que la primera orden recorrió la vista de checkout procede de la interacción y pantalla del navegador, no del conteo de base. `verify` debe ejecutarse una sola vez.

Escribir `stop`. El esquema **siempre se preserva**, incluso si la prueba tiene éxito o falla. El arnés no elimina tablas ni ejecuta limpieza automática; la reversión de migraciones queda pendiente de una inspección y limpieza manual bajo exclusividad confirmada. No volver a ejecutar el arnés sobre un esquema no vacío.

El guard de red del arnés restringe `fetch` en su propio proceso al único servidor HTTP de loopback y rechaza redirecciones. No es un firewall para el navegador ni para otros transportes. No se realiza pago, envío ni llamada real a un proveedor; la autenticación real de administradores queda fuera de esta prueba.

## Verificación sin base de datos

`node scripts/check-local-shipping.mjs` inicia un único Nest temporal con entorno explícitamente permitido, sin configuración de base, credenciales ni proveedor habilitado. Comprueba HTML canónico y API en el mismo origen, checkout deshabilitado por defecto, respuestas de envío no disponible, y rechazo de Origin/Host ajenos, alias de host, puertos distintos, solicitudes cross-site y contenido no JSON. Reemplaza el antiguo smoke del proxy Next. Sus pruebas aisladas se ejecutan con `node --test scripts/check-local-shipping.test.mjs`; ninguna ejecuta el arnés de MariaDB.
