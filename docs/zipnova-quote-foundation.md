# Estimación de envío en el carrito

## Flujo de cotización

1. En la administración, cargar peso en gramos y ancho, alto y largo en milímetros por unidad del artículo. Los campos del paquete permanecen separados: el estimador dinámico utiliza los del artículo.
2. En modo API, ingresar el código postal una vez y elegir la localidad si hay varias coincidencias.
3. Al agregar, quitar o cambiar cantidades, se descarta el importe anterior y se recalcula tras 500 ms sin nuevos cambios. Se conservan el código postal y la localidad verificada.
4. El carrito muestra envío y total **estimados**. Un error, carrito vacío o cotización vencida no conserva el precio anterior como válido ni se interpreta como envío gratis.

La estimación local no exige confirmar físicamente un paquete listo para despachar. Sí exige medidas numéricas válidas y configuración explícita del proveedor; no se inventan tarifas ni se crean etiquetas o envíos. El embalaje definitivo puede modificar el costo. El checkout conserva su activación y validación independientes.

## Destino por código postal

El carrito desplegable y la página de carrito comparten el cálculo y el destino. Se aceptan los cuatro dígitos del código postal argentino; el CPA de ocho caracteres todavía no está soportado. Tras una pausa de 500 ms, la API local consulta el servicio público de localidades de Andreani. Por tanto, el código postal se envía a Andreani para resolver el destino. Si hay varias localidades o barrios, la persona elige uno antes de cotizar; no se elige una localidad arbitrariamente. Si el servicio no responde, se muestra una indisponibilidad y se puede reintentar: no se presenta como código inexistente.

La API devuelve identificadores opacos temporales asociados al código postal. Antes de cotizar, el servidor vuelve a resolver la selección contra su caché y envía a Zipnova los nombres de localidad y provincia; no reutiliza los identificadores de Andreani ni acepta esos nombres del navegador como autoridad. La caché geográfica tiene un máximo de 128 códigos, dura 24 horas para resultados positivos y dos minutos para resultados vacíos válidos; no guarda errores como códigos inexistentes. El servicio admite dos consultas simultáneas y 30 por minuto por proceso, y respeta `Retry-After`. Las respuestas demasiado grandes o incompletas se rechazan, no se recortan silenciosamente. Las cotizaciones conservan su propia vigencia de cinco minutos y se invalidan al cambiar el destino o el carrito; no se restauran al recargar la página.

Fuente: [documentación oficial de la API de localidades de Andreani](https://a.storyblok.com/f/63950/x/e85bc7b22f/api-localidades-v2-0.xlsx). La disponibilidad y cobertura postal de ese servicio son independientes de Zipnova.

Este corte agrega un adaptador de opciones múltiples, un resolver de catálogo y la ruta `POST /api/v1/shipping/quote`. Por defecto la ruta devuelve `DISABLED` antes de consultar catálogo o red. Existe una activación explícita preparada para después de revisar todos los requisitos; las pruebas usan transporte ficticio. La implementación existente de Andreani no cambia.

El adaptador recibe identificadores, cantidades y destino; un resolver inyectado debe consultar precios y medidas por unidad del artículo en el servidor. Sin catálogo o datos logísticos devuelve indisponibilidad antes de invocar el transporte. El usuario indicó que agrupa los artículos: `items` con `type_packaging=dynamic` envía una entrada por cada unidad comprada, para que Zipnova agrupe según la configuración de la cuenta. No se usa cada unidad como bulto ni se inventa una caja. También se admite la alternativa de bultos previamente resueltos.

Se usa `account_id` y `origin_id` explícitos. Peso en gramos y medidas en centímetros enteros: para `items` los milímetros se redondean hacia arriba al siguiente centímetro, sin subdeclarar ni añadir otro margen; para bultos ya definidos se exige conversión exacta. No se redondean pesos inferiores al mínimo permitido. El valor declarado usa precisión monetaria configurada y, al enviarse como número JSON, se rechaza si alcanza `10^(15-exponente)` o si el catálogo detecta pérdida de precisión. Se toma `amounts.price_incl_tax` del comprador conservando el texto numérico original de JSON antes de su conversión a unidades menores, sin sumar IVA ni multiplicar por bultos; moneda configurada explícitamente. Se ignoran resultados no seleccionables y puntos de retiro ausentes; para retiro se conserva `point_id`. En modo dinámico se valida y conserva el número de bultos devueltos por Zipnova. La opción seleccionada se suma con enteros exactos al subtotal solo si todo está en la misma moneda; se invalida ante cambios de carrito, precio o destino. El adaptador distingue fallos de configuración, catálogo, logística, destino, autorización, límite, timeout, respuesta y ausencia de opciones.

La cuenta tiene seleccionado empaquetado dinámico con límite de lado 150 cm y peso 30.000 g. Zipnova intenta minimizar bultos, pero puede generar más de uno. La guía no confirma cómo añade protección o tara de la caja; no se agregan valores inventados. Debe acordarse y verificarse qué protección está incluida en las medidas cargadas para cada unidad y contrastar bultos calculados con pedidos físicamente embalados. La API no documenta moneda en la respuesta de cotización. No hay sandbox confirmado. Se realizaron cotizaciones reales controladas con un producto sintético marcado como prueba; no se creó ni pagó ningún envío. Antes de usar datos comerciales reales deben validarse catálogo, precios y logística. No incluir credenciales en archivos versionados, logs o cliente.

## Configuración y transporte

### Archivo privado en desarrollo y producción

El arranque lee el archivo indicado explícitamente por `ZIPNOVA_ENV_FILE`, también en producción y en inicios directos sin npm. Una ruta relativa se resuelve desde el directorio de trabajo del proceso; una ruta absoluta permite conservar el archivo fuera de la carpeta del proyecto. No se descubre ni carga un archivo por defecto. En producción, el supervisor debe cargar el `.env` principal o inyectar esa variable, como el resto de la configuración de la aplicación.

En el `.env` principal:

```dotenv
ZIPNOVA_ENV_FILE=.env.zipnova
# En producción, conservar el origen HTTPS canónico de la tienda:
PUBLIC_SITE_URL=https://mali-store.com.ar
```

El archivo privado puede contener toda la configuración del proveedor:

```dotenv
ZIPNOVA_ENABLED=true
ZIPNOVA_CURRENCY=ARS
ZIPNOVA_CURRENCY_EXPONENT=2
ZIPNOVA_API_TOKEN=token_del_proveedor
ZIPNOVA_API_SECRET=secret_del_proveedor
ZIPNOVA_ACCOUNT_ID=identificador_de_cuenta
ZIPNOVA_ORIGIN_ID=identificador_de_origen
# Solo para desarrollo local:
# ZIPNOVA_OPERATOR_ORIGIN=http://127.0.0.1:3000
```

Reemplazar los valores de ejemplo por credenciales e identificadores válidos. Solo se importan esas ocho claves de Zipnova: se ignoran configuración de base, pagos, `NODE_ENV`, `PUBLIC_SITE_URL` y otras variables. Los valores presentes en el proceso tienen prioridad, incluidos valores vacíos y `ZIPNOVA_ENABLED=false`; evitar duplicarlos vacíos en el `.env` principal o en PM2. Un archivo configurado que no puede leerse interrumpe el inicio sin exponer su ruta ni contenido. La validación del proveedor mantiene bloqueadas las cotizaciones si falta una clave requerida. Reiniciar después de cambiar el archivo. No versionarlo ni incluirlo en logs; restringir su lectura al usuario del proceso. Los pagos se activan por separado en [Configuración → Pagos](payment-environments.md).

Las cotizaciones requieren `ZIPNOVA_ENABLED=true`, cuenta y origen de despacho como enteros positivos, moneda de tres letras mayúsculas, exponente entre 0 y 3, y token/secret válidos como formato. Una configuración incompleta devuelve `CONFIG_UNAVAILABLE`; la ausencia de catálogo o medidas devuelve indisponibilidad antes de la red. La búsqueda de localidades también queda bloqueada cuando Zipnova está deshabilitado o incompleto, aunque Andreani esté disponible. La validez numérica no certifica el embalaje físico ni garantiza el precio final.

En producción, la API valida POST JSON y Host/Origin exactos contra `PUBLIC_SITE_URL`, además de `Sec-Fetch-Site` cuando está presente. `ZIPNOVA_OPERATOR_ORIGIN` se usa únicamente para desarrollo local: exige origen loopback literal y socket local. Un valor HTTPS en esa variable no reemplaza `PUBLIC_SITE_URL` ni cambia la política de producción. El servidor Node escucha en `127.0.0.1`; el proxy productivo debe preservar el Host público.

El transporte usa solo el endpoint fijo de cotización, rechaza redirecciones, establece timeout y limita respuestas; no crea envíos. Por proceso admite hasta dos solicitudes simultáneas y diez por minuto; ante un 429 respeta `Retry-After` o espera un minuto si falta o es inválido. La cotización recibe un plazo interno máximo de cinco minutos, tras el cual el carrito descarta la selección y pide volver a cotizar; no es garantía de precio del transportista ni tiempo estimado de entrega. Las pruebas usan exclusivamente `fetch` simulado. Para habilitar una prueba local, verificar DB, cuenta, origen, moneda, credenciales y medidas numéricas del artículo. La validación física del embalaje corresponde al uso operativo, no al ingreso de medidas de prueba. Los controles de abuso y vigencia permanecen activos. La configuración vive en el proceso del servidor, nunca en el navegador ni en logs.

Para una futura configuración local, el usuario puede ejecutar desde la raíz del proyecto `powershell.exe -NoProfile -File .\scripts\setup-zipnova-local.ps1` en su propia consola. El script solicita token y secret con entrada oculta, usa la carpeta local del usuario resuelta por Windows (normalmente `%LOCALAPPDATA%\MaliDeco-Zipnova\zipnova.env`), verifica que no esté dentro de un repositorio Git ni atraviese enlaces, restringe la carpeta nueva al usuario y deja `ZIPNOVA_ENABLED=false`. No sobrescribe una carpeta existente ni acepta argumentos o credenciales en la línea de comandos. El archivo guarda texto sin cifrar y requiere proteger la cuenta y sus respaldos; no debe copiarse al chat, repositorio o almacenamiento sincronizado. El script admite solo caracteres seguros para el formato. La versión anterior se probó con valores ficticios; la protección de ruta actual se prueba sin ingresar credenciales.

Tras compilar, Node 24 puede cargar el archivo privado antes de iniciar la API, por ejemplo desde PowerShell con `$zipnovaEnvFile = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'MaliDeco-Zipnova\zipnova.env'` y luego `node --env-file="$zipnovaEnvFile" dist/main.js`. La configuración de DB y los demás valores requeridos deben estar disponibles para el proceso. Las variables ya presentes en el entorno prevalecen sobre el archivo: revisar en particular que no exista un `ZIPNOVA_ENABLED` heredado inesperado, sin imprimir credenciales. Cambios en el archivo o entorno requieren reiniciar el proceso. El usuario configuró la credencial existente de forma privada para la prueba local.

Fuentes: [Cotizar envíos, API Zipnova](https://docs.zipnova.com/envios/recursos-api/envios/cotizar-envios), [configurar empaquetado](https://ayuda-envios.zipnova.com/hc/es-419/articles/47233549333011-Configurar-empaquetado-de-env%C3%ADos), [autenticación](https://docs.zipnova.com/envios/principios/urls-y-autenticacion) y [opción env-file de Node](https://nodejs.org/api/cli.html#--env-filefile).
