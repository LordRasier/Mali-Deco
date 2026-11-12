# Actualizar la tienda existente

## Entornos de Mercado Pago

Esta entrega parte de `0018072` y requiere `PaymentEnvironments1793362600000` antes de reiniciar. Leer [configuración y validación de pagos](payment-environments.md), completar `MERCADOPAGO_ENV_FILE=.env.mercadopago` y conservar los secretos privados del servidor.

Con la versión publicada en `main` y las credenciales de mantenimiento disponibles:

```sh
git pull --ff-only origin main
npm ci --include=dev
npm run build
NODE_ENV=production npm run migration:payments
# Restaurar las credenciales habituales de la aplicación antes del reinicio.
pm2 restart mali-deco --update-env
```

Conservar el nombre real del proceso PM2 y su carga de `.env`. Detener la secuencia si falla cualquier paso. No utilizar `:local-root` en producción. Si faltan migraciones anteriores, aplicarlas también antes del reinicio; el comando de pagos no las ejecuta.

La migración deja los nuevos pagos **deshabilitados**. En **Configuración → Pagos**, el propietario debe verificar la conexión, elegir el entorno y habilitar los pagos. Registrar únicamente el evento **Pagos** en las URLs de producción y prueba que muestra el panel, con la firma de la aplicación correspondiente. Verificar la recepción efectiva de notificaciones antes de dar por terminado el despliegue.

## Entrega anterior: promociones

Las instrucciones que siguen se conservan para instalaciones que todavía no aplicaron la migración de promociones.

Para esta entrega, ejecutar `npm run migration:promotions` con una cuenta autorizada para migraciones **antes de iniciar o reiniciar la aplicación actualizada**. Ejecutar los pasos cuando la versión a desplegar ya esté publicada en `main`.

## Cambios desde el último push

La referencia anterior es `dfd0f5c` (11 de noviembre de 2026). Esta entrega agrega únicamente `ProductPromotions1793362200000`; no modifica migraciones anteriores.

La migración agrega `products.featured`, desactivado por defecto, y `product_variants.sale_price_minor`, inicialmente nulo. Ejecuta dos `ALTER TABLE` aditivos y registra su aplicación. No actualiza precios existentes, pedidos ni contenido publicado. Esto no confirma el estado de producción: consultar su registro antes de aplicar cambios. Publicar en GitHub no ejecuta esta migración.

## Antes de actualizar

- Conservar un respaldo verificado de la base, el `.env` y la versión desplegada.
- Confirmar Node.js 24 o superior y permisos de mantenimiento para `ALTER TABLE` y el registro de migraciones. Usar credenciales temporales en una terminal privada; no ampliar los permisos de la cuenta habitual de la aplicación ni guardar credenciales en el repositorio.
- Prever una ventana de mantenimiento: `ALTER TABLE` puede esperar bloqueos o demorar operaciones. MariaDB confirma los cambios de estructura por separado; un fallo no garantiza una reversión automática.
- No hay un flujo de despliegue versionado en `.github/workflows`. Revisar cualquier automatización externa del alojamiento: un push podría activarla aunque no exista un flujo en el repositorio.

## Actualización manual

Desde la carpeta de la tienda en el servidor, con Node.js 24 o superior y el `.env` existente:

```sh
git fetch origin
git switch main
git pull --ff-only origin main
npm ci --include=dev
npm run build
NODE_ENV=production npm run migration:promotions
# Restaurar el entorno habitual de la aplicación antes del reinicio.
pm2 restart mali-deco --update-env
```

El último comando supone que el proceso actual de PM2 se llama `mali-deco`. Conservar el nombre y la configuración del proceso que ya sirve la tienda. `npm ci --include=dev` instala también las herramientas necesarias para compilar y ejecutar la migración. Detener la secuencia si falla cualquier paso; no reiniciar con la migración incompleta. No realizar la actualización con un observador que recargue automáticamente el código antes de migrar.

`migration:promotions` carga el `.env` y consulta el registro de la base configurada. Las variables exportadas temporalmente prevalecen sobre `.env`. Limitar las credenciales de mantenimiento al proceso de migración y restaurar el entorno habitual antes de `pm2 restart --update-env`, para no transferir permisos administrativos a la aplicación. Ejecuta únicamente esta migración si está pendiente; no ejecuta otras migraciones del proyecto. No utilizar `:local-root` en producción.

Para consultar el estado antes o después de migrar:

```sh
NODE_ENV=production node --env-file=.env --import tsx node_modules/typeorm/cli.js migration:show -d src/infrastructure/database/product-promotions-data-source.ts
```

## Compatibilidad y vuelta atrás

- Sin esta migración, el código nuevo no puede consultar correctamente productos y precios. Aplicarla antes del reinicio es obligatorio, aunque todavía no se utilicen descuentos.
- La migración sola conserva el comportamiento anterior: no marca artículos destacados ni crea descuentos. Elegir una fuente de destacados en la portada continúa siendo un cambio de borrador hasta publicar. Guardar precios o marcas de un producto publicado mantiene el comportamiento inmediato del catálogo.
- Verificar Productos, edición de un artículo, catálogo, precio por variante y carrito antes de dar por finalizado el despliegue.
- No volver al código anterior con descuentos activos o bloques de destacados guardados sin un plan específico: ese código no interpreta los nuevos precios ni la nueva fuente de la portada. La reversión de la migración rechaza eliminar columnas con datos de promociones. No borrar esos datos para forzarla; detener escritores y evaluar el respaldo sin sobrescribir pedidos posteriores.

Para instalaciones anteriores a `dfd0f5c`, revisar además el registro completo y las [migraciones del editor](store-content.md); el comando de promociones no las reemplaza. Detalles de precios, límites y validación en [destacados y descuentos](product-promotions.md).

La publicación en GitHub no cambia el `.env` del servidor. Este procedimiento es manual; no certifica automatizaciones externas ni sustituye la verificación de la versión y migraciones realmente aplicadas en producción.
