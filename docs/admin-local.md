# Administración local consolidada

El administrador reúne las funciones existentes en una navegación persistente inspirada en el [patrón de menú de Tiendanube](https://tiendanube.dev/documentation/patterns/menu). No replica su producto ni agrega estadísticas, cobros o funciones simuladas.

## Secciones y permisos

| Enlace | Función | Roles |
|---|---|---|
| `/admin#products` | Productos, variantes e imágenes | owner, catalog |
| `/admin#classifications` | Categorías, materiales y colores | owner, catalog |
| `/admin#orders` | Pedidos, estados, seguimiento, comprobantes e historial | owner, operations |
| `/admin#settings` | Nombre visible de la tienda | owner |

Los enlaces admiten recarga y navegación Atrás/Adelante. Un enlace desconocido o no autorizado muestra un aviso, sin montar la sección restringida. La API conserva la autoridad sobre permisos y CSRF. La página administrativa no debe indexarse.

Las secciones visitadas conservan sus formularios al cambiar de sección. Un borrador guardado permanece en la base; recargar o salir puede descartar lo que aún no se guardó. Pedidos consulta cambios cada 30 segundos cuando no hay edición pendiente. Ver [gestión de pedidos](admin-orders.md) para las migraciones, permisos y configuración de Mercado Pago que requiere esta función.

## Cargar y publicar un producto

1. En **Productos → Nuevo artículo**, elegir las fotos directamente, incluso antes de escribir el nombre. Se puede marcar cualquiera como portada, quitarla o agregar más. La selección permanece en esta pestaña: todavía no se creó un producto.
2. Escribir el nombre y elegir **Guardar producto** una vez. El producto queda como borrador privado y las fotos seleccionadas se suben automáticamente. Si una foto falla, se puede reintentar desde la misma ficha sin volver a cargar las anteriores.
3. En **Precio y opciones**, guardar el precio y la modalidad. Para una pieza con colores o materiales, **Personalizar la primera variante** reutiliza el precio existente; **Agregar variante** conserva las anteriores y suma otra presentación.
4. Revisar la portada y el precio en la vista previa. **Publicar en catálogo** comprueba que haya nombre, portada y una opción con precio. **Volver a borrador** retira el producto de la tienda sin archivarlo.

En un producto ya publicado, los cambios guardados son visibles. Para preparar cambios en privado, volver primero a borrador. Publicar un producto no habilita el checkout.

## Inicio local con un servidor

Desde la raíz, completar `.env` con una base autorizada siguiendo [.env.example](../.env.example), o exportar la configuración al proceso. `npm run dev` lee el archivo antes de registrar la base y no reemplaza variables ya exportadas. `npm start` y producción siguen exigiendo configuración explícita. No inferir autorización actual de la evidencia histórica que sigue.

```powershell
$env:NODE_ENV='development'
$env:PORT='3000'
$env:ADMIN_ORIGIN='http://127.0.0.1:3000'
$env:STOREFRONT_MODE='api'
$env:ZIPNOVA_ENABLED='false'
$env:LOCAL_TEST_CHECKOUT_ENABLED='false'
npm run dev
```

Abrir `http://127.0.0.1:3000/admin`. Si se conserva otro puerto de navegador, usar ese mismo puerto en `PORT` y en los orígenes configurados: cambiar de origen cambia almacenamiento y cookies. No iniciar Next ni configurar proxy/API_BASE_URL.

Estas instrucciones no crean cuentas ni ejecutan migraciones. El bootstrap interactivo requiere autorización separada; nunca hay credenciales predeterminadas en código.

## Evidencia histórica y límites del corte anterior

- Se respaldó la base antes de aplicar la única migración pendiente, `ProductImages1793360700000`. La copia está fuera del repositorio, en `%LOCALAPPDATA%\MaliDeco-Backups`.
- Las comprobaciones HTTP sobre Nest y MariaDB locales verificaron producto y variante sintéticos, carga/reintento de imagen, publicación, resolución de carrito, conflicto de revisión, retiro/restauración de imagen, archivo del producto y rechazo de CSRF inválido. El producto y la categoría de verificación quedaron archivados; los datos anteriores se conservaron.
- Se comprobó el rechazo del checkout deshabilitado y la revocación efectiva de una sesión al cerrar sesión. Un archivo administrativo devuelve 200 sin cuerpo; logout devuelve 201 con `{ok:true}`. No asumir 204 para esos contratos.
- El navegador verificó inicio de sesión, secciones, recarga de enlace directo, Atrás, conservación de borradores y actualización de opciones sin perder el producto abierto. Se revisó el diseño a 390 px, sin desborde horizontal de página.
- Este corte no valida ventas reales, pagos, tarifas externas, creación de nuevos pedidos ni seguridad de despliegue público. No se ejecutó la suite destructiva de migraciones sobre esta base.

Ver [checkout local](checkout-local.md), [imágenes](product-media-development.md) y [estado general](estado-del-desarrollo.md).
