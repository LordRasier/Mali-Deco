# Prueba aislada de checkout en navegador

Este arnés es exclusivamente para pruebas locales. Compone el `AppModule` real con `@nestjs/testing` y sustituye solamente la identidad administrativa, el destino postal y el proveedor de cotización por dobles sintéticos. Las sesiones de checkout, el catálogo, las cotizaciones y los pedidos usan Nest y MariaDB reales. El proveedor fake no se registra en el runtime normal ni se emite en una compilación limpia de producción. El smoke test comprueba aparte que el `AppModule` real arranca sin base y con checkout deshabilitado.

## Antes de comenzar

- Coordinar exclusividad: ningún otro proceso debe usar `store_integration_test`. El arnés exige 127.0.0.1:3306, root sin contraseña autorizado, esquema existente sin tablas, vistas, rutinas ni eventos, visibilidad de metadatos y ningún otro cliente conectado al esquema. Si no puede comprobarlo, no aplica migraciones. La comprobación no impide conexiones futuras: mantener exclusividad durante toda la prueba.
- Usar terminales nuevas y entorno limpio. El arnés rechaza variables `ZIPNOVA_*` heredadas salvo `ZIPNOVA_OPERATOR_ORIGIN` y `ZIPNOVA_ENABLED=false`. No usar credenciales reales, datos reales, la base de la aplicación ni el preview activo.
- Instalar el lockfile de la copia con `npm ci --ignore-scripts --no-audit --no-fund`. No usar GitHub Actions.

## Iniciar API de prueba

Desde la raíz del repositorio, en una terminal PowerShell dedicada:

```powershell
$env:NODE_ENV='development'
$env:LOCAL_TEST_CHECKOUT_ENABLED='true'
$env:CHECKOUT_BROWSER_E2E='1'
$env:DB_HOST='127.0.0.1'
$env:DB_PORT='3306'
$env:DB_USERNAME='root'
$env:DB_PASSWORD=''
$env:DB_ALLOW_EMPTY_PASSWORD='1'
$env:DB_DATABASE='store_integration_test'
$env:PORT='3191'
$env:ZIPNOVA_OPERATOR_ORIGIN='http://127.0.0.1:3190'
$env:ZIPNOVA_ENABLED='false'
.\node_modules\.bin\tsx.cmd --tsconfig apps/api/tsconfig.json apps/api/src/database/checkout-browser-harness.ts
```

El arnés aplica migraciones y crea un producto sintético de encargo. No cambia el fixture existente de la tienda. Esperar el mensaje de API lista; si hay error, detenerse y preservar el esquema para inspección. No imprimir cookies, tokens ni el contenido de pedidos.

## Iniciar Next y recorrer

En una segunda terminal dedicada, desde la misma raíz:

```powershell
$env:STOREFRONT_MODE='api'
$env:API_BASE_URL='http://127.0.0.1:3191/api/v1/'
$env:DEV_API_PROXY_ORIGIN='http://127.0.0.1:3191'
$env:ZIPNOVA_OPERATOR_ORIGIN='http://127.0.0.1:3190'
$env:ZIPNOVA_ENABLED='false'
$env:LOCAL_TEST_CHECKOUT_ENABLED='true'
$env:NEXT_TELEMETRY_DISABLED='1'
npm run dev -w @store/web -- --port 3190
```

En `http://127.0.0.1:3190`, agregar el artículo sintético y registrar **un solo pedido de prueba** con correo terminado en `@example.test` y dirección/teléfono sintéticos. Elegir la entrega simulada. Verificar la confirmación en pantalla: pedido de prueba recibido, pago y envío no iniciados. La vista `/admin` acepta únicamente en este arnés el usuario sintético `synthetic@example.test` y la clave sintética `synthetic-only`; no son cuentas persistidas. Comprobar lista y detalle del pedido.

El código postal y la localidad elegida en el carrito se comparten con el checkout. Al recargar, se conserva en `sessionStorage` un identificador opaco de localidad como sugerencia y solo se restaura si una consulta nueva devuelve ese mismo identificador para el código postal. Si cambió o fue desalojado, se pide elegir de nuevo. El checkout siempre obtiene una cotización propia del servidor; la estimación del carrito no autoriza el pedido.

Si el navegador conserva una sesión de una base de prueba anterior, el checkout permite descartarla explícitamente cuando no hay un intento incierto en esa pestaña y el navegador admite Web Locks. Las operaciones de inicio y descarte se coordinan entre pestañas que usen esta versión. Si existe un intento incierto en cualquier pestaña, no reiniciar: conservarlo y consultar al administrador. Descartar la sesión no crea ni reenvía un pedido; después hay que consultar la entrega nuevamente. Cookies duplicadas no se descartan automáticamente porque podrían pertenecer a rutas distintas.

En la primera terminal, escribir `verify` y Enter. La rutina comprueba la existencia y contenido de una orden sintética, luego ejercita por HTTP directo a Nest una sesión nueva, replay de la misma clave, rechazo de una cotización reutilizada y creación con una nueva cotización; exige tres órdenes persistidas en total. La evidencia de que la primera orden recorrió Next procede de la interacción y pantalla del navegador, no del conteo de base. `verify` debe ejecutarse una sola vez.

Escribir `stop` y detener Next. El esquema **siempre se preserva**, incluso si la prueba tiene éxito o falla. El arnés no elimina tablas ni ejecuta limpieza automática; la reversión de migraciones queda pendiente de una inspección y limpieza manual bajo exclusividad confirmada. No volver a ejecutar el arnés sobre un esquema no vacío.

El guard de red del arnés restringe `fetch` en su propio proceso al puerto API de loopback y rechaza redirecciones. No es un firewall para el navegador, Next ni otros transportes. No se realiza pago, envío ni llamada real a un proveedor; la autenticación real de administradores queda fuera de esta prueba.
