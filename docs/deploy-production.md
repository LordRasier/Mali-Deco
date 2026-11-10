# Actualizar la tienda existente

Esta entrega publica en `main` la aplicación completa y conserva el historial de desarrollo. Para una tienda que ya tiene la versión con SEO (`8d3f909`), las únicas migraciones nuevas son las del contenido editable y sus borradores.

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

Si la primera ya fue aplicada, el mismo comando ejecuta solamente la segunda. Si ambas están registradas, no vuelve a crearlas. No cambia productos, precios, pedidos ni clientes. Usar el respaldo habitual de la base antes de aplicar cambios de esquema.

Las medidas con iconos, la organización del editor y los nuevos ajustes del listado no agregan otras migraciones. No ejecutar los comandos `:local-root` en producción: son exclusivos del entorno local de desarrollo.

Para consultar el estado del grupo antes o después de migrar:

```sh
NODE_ENV=production node --env-file=.env --import tsx node_modules/typeorm/cli.js migration:show -d src/infrastructure/database/content-data-source.ts
```

La publicación en GitHub no ejecuta estos pasos en el servidor ni cambia su `.env`.
