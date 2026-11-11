# Actualizar la tienda existente

El grupo de migraciones de contenido incluye configuración, borradores, las imágenes independientes del constructor y la presentación de las categorías. Ejecutar los pasos cuando la versión a desplegar ya esté publicada en `main`.

## Cambios desde el último push

La referencia anterior es `8f5ba73` (10 de noviembre de 2026). Esta entrega agrega únicamente `ContentMedia1793362000000` y `CategoryPresentation1793362100000`. Las migraciones de configuración y borradores ya estaban en esa referencia; no se modificaron migraciones anteriores.

Las dos nuevas migraciones crean tablas independientes. Su avance no ejecuta `UPDATE`, `DELETE`, `ALTER` ni `DROP` sobre las tablas existentes. Esto no confirma el estado de una base concreta: consultar su registro antes de aplicar cambios. El push no ejecuta migraciones ni comprueba la base de producción.

## Antes de actualizar

- Conservar un respaldo verificado de la base, el `.env` y la versión desplegada. Incluir `store_content_settings` y `store_content_drafts`: publicar desde el editor nuevo guarda un formato que el código anterior no acepta.
- Confirmar Node.js 24 o superior, permisos para crear tablas y claves foráneas, y una ventana para el reinicio. No asumir que toda la secuencia se revierte automáticamente si falla un paso.
- No hay un flujo de despliegue versionado en `.github/workflows`. Revisar cualquier automatización externa del alojamiento: un push podría activarla aunque no exista un flujo en el repositorio.

## Actualización manual

Desde la carpeta de la tienda en el servidor, con Node.js 24 o superior y el `.env` existente:

```sh
git fetch origin
git switch main
git pull --ff-only origin main
npm ci --include=dev
npm run build
NODE_ENV=production npm run migration:content
pm2 restart mali-deco --update-env
```

El último comando supone que el proceso actual de PM2 se llama `mali-deco`. Conservar el nombre y la configuración del proceso que ya sirve la tienda. `npm ci --include=dev` instala también las herramientas necesarias para compilar y ejecutar la migración.

`migration:content` carga el `.env` y consulta el registro de migraciones de la base configurada. Ejecuta únicamente las migraciones pendientes de este grupo:

| Migración | Tabla nueva | Uso |
| --- | --- | --- |
| `StoreContent1793361800000` | `store_content_settings` | Configuración publicada del sitio |
| `ContentDrafts1793361900000` | `store_content_drafts` | Borradores y revisiones del editor visual |
| `ContentMedia1793362000000` | `store_content_media` | Imágenes de los bloques de la landing |
| `CategoryPresentation1793362100000` | `category_presentations` | Imagen, descripción, texto alternativo e icono de cada categoría |

El comando ejecuta solamente las migraciones pendientes. Si las primeras tres ya están aplicadas, crea únicamente `category_presentations`. No cambia las categorías existentes, productos, precios, pedidos ni clientes. Usar el respaldo habitual de la base antes de aplicar cambios de esquema.

Las configuraciones antiguas se convierten a bloques al leerlas, conservando sus textos, imágenes de marca y visibilidad. No se reescribe el contenido guardado hasta guardar o publicar desde el editor. La nueva tabla conserva las imágenes al quitar un bloque, para permitir deshacer y reutilizarlas. No ejecutar los comandos `:local-root` en producción: son exclusivos del entorno local de desarrollo.

Para consultar el estado del grupo antes o después de migrar:

```sh
NODE_ENV=production node --env-file=.env --import tsx node_modules/typeorm/cli.js migration:show -d src/infrastructure/database/content-data-source.ts
```

## Compatibilidad y vuelta atrás

- Los colores y las tipografías del editor siguen siendo borradores hasta publicar. El despliegue sí actualiza la representación de la portada, los filtros y el carrusel; revisar esas pantallas y una compra de prueba antes de darlo por validado.
- Sin las dos migraciones nuevas, las categorías existentes siguen siendo legibles, pero guardar su presentación o subir imágenes del constructor falla explícitamente. Aplicar las migraciones antes de habilitar esas funciones.
- No hacer una vuelta atrás de código a `8f5ba73` después de guardar borradores o publicar con el esquema nuevo sin un plan para recuperar el contenido compatible. Restaurar únicamente las tablas de contenido necesarias desde el respaldo previo, preservando pedidos y otras operaciones posteriores; no restaurar toda la base indiscriminadamente.
- Las migraciones nuevas rechazan su reversión si sus tablas contienen datos. No borrarlas para forzar una vuelta atrás.

La publicación en GitHub no cambia el `.env` del servidor. Este procedimiento es manual; no certifica automatizaciones externas ni sustituye la verificación de la versión y migraciones realmente aplicadas en producción.
