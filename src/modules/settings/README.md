# Ajustes de tienda

## WhatsApp e Instagram

El owner configura `whatsappNumber` e `instagramUsername` desde Administración → Configuración → Redes y contacto, con la misma sesión/origen/CSRF que nombre y color. Los campos se guardan en `store_settings` mediante la migración aditiva `StoreSocialLinks1793361500000`. No se requieren credenciales de redes sociales.

WhatsApp acepta un número internacional, normaliza espacios, guiones, paréntesis y `+`, y publica `https://wa.me/<dígitos>`. Instagram acepta usuario, `@usuario` o URL HTTPS de un perfil de `instagram.com`; se guarda el usuario normalizado y se genera un destino fijo. Se rechazan dominios ajenos, rutas de publicaciones y valores no válidos. [Normalización compartida](../../shared/social-links.ts), [pruebas](store-social-links.test.ts).

Omitir un campo en la API conserva su valor. Guardar `""` oculta el ícono; no recupera la variable de entorno anterior. Nombre, color y redes se validan antes de una única escritura. El footer y Contacto leen los cambios en la siguiente carga, sin reiniciar. Mientras falte la migración, el admin deshabilita los nuevos campos y permite seguir guardando nombre y color; una escritura de redes sin esquema devuelve 503 y no simula éxito.

La migración local fue ejecutada por el usuario desde su terminal. Se verificó en el admin que los campos están habilitados y, en una carga nueva de la tienda, que ambos enlaces guardados aparecen en el footer. La conexión directa desde el entorno de ejecución sigue bloqueada (`EACCES 127.0.0.1:3306`); no se inspeccionó por SQL el historial de migraciones. Para otros entornos, usar la conexión administradora de migraciones sin ampliar permisos de la cuenta de aplicación.

Desde la raíz del proyecto, `npm run migration:social-links` carga `.env` (las variables ya exportadas tienen prioridad) y aplica **solo** esta migración, conservando el registro de TypeORM y sin ejecutar otras pendientes. Usar la conexión local autorizada para migraciones. Si hay un fallo de DDL, inspeccionar el esquema antes de repetir. Luego pulsar **Recargar configuración** en el admin: la respuesta vuelve a comprobar las columnas y habilita WhatsApp/Instagram sin cerrar la sesión. Un esquema migrado sin fila de ajustes también permite la primera configuración.

Para el root local sin contraseña confirmado por el usuario, `npm run migration:social-links:local-root` selecciona esas credenciales y `DB_ALLOW_EMPTY_PASSWORD=1` únicamente en el proceso de migración. Conserva `DB_DATABASE`/`DB_PORT`, no modifica `.env` ni permisos y rechaza cualquier entorno distinto de `development` o host distinto de `127.0.0.1`. El comando normal mantiene las credenciales configuradas. Ambos necesitan acceso de la terminal a MariaDB; no resuelven un bloqueo de conexión `EACCES`.

[Volver a módulos](../README.md)

[SettingsModule](settings.module.ts) importa identidad y es dueño de [StoreSettings y su controlador](store-settings.ts). [Pruebas](store-settings.test.ts) verifican nombre y autorización.

## Reglas y verificación

Solo owner puede editar. El nombre y `primary_color` siguen en `store_settings`; el logo y el ícono se guardan en `store_brand_assets`, mediante la migración `StoreBrandAssets1793360800000`. Las cargas aceptan JPG, PNG o WebP de hasta 5 MiB, se decodifican con los límites compartidos de imágenes y se publican como PNG. El ícono se reduce a 64 px y el logo a 320 px. Sin imagen configurada, la lectura devuelve un PNG transparente de 1 px. La carga requiere sesión owner, origen y CSRF; no reintenta automáticamente escrituras inciertas. La migración no debe revertirse mientras existan imágenes.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.

## Apariencia del escaparate

`PUT /admin/settings` acepta `name` y, opcionalmente, `primaryColor` (hexadecimal de seis dígitos). Una actualización antigua solo de nombre no cambia el color. `GET /catalog/theme.css` publica variables CSS validadas con caché deshabilitada: relleno elegido, texto de contraste, acento legible y pie oscuro. No usa estilos en línea ni amplía CSP.

La migración aditiva `StoreAppearance1793360900000` añade el color y permite `hero`/`about` en la tabla de imágenes. Requiere la migración de branding anterior. Ambos nuevos tipos usan el mismo control owner/origen/CSRF y procesador limitado, con salida WebP de hasta 1600 px. Sin personalización, redirigen a las ilustraciones existentes; logo e ícono conservan PNG transparente. No se pueden revertir personalizaciones silenciosamente.

El banner se comparte entre inicio y catálogo. La ilustración inferior solo afecta el inicio. El color claro conserva el relleno exacto, pero oscurece enlaces/textos y elige etiquetas claras u oscuras para su lectura. Las páginas ya abiertas reflejan cambios al recargarse.

Si las migraciones aún no están aplicadas, las lecturas públicas conservan la apariencia anterior; las escrituras no simulan éxito. No se ocultan otros errores de conexión. La cuenta de aplicación no debe recibir permisos de estructura: ejecutar las migraciones con una conexión administradora local autorizada.
