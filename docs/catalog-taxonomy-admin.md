# Taxonomías del catálogo (API administrativa)

La migración `1793360400000-CatalogTaxonomy` crea categorías, materiales y colores sin datos de ejemplo. Añade referencias opcionales a productos y variantes, por lo que las filas previas conservan `NULL` y no necesitan un backfill ficticio. La adaptación a MariaDB no fue validada contra un servidor real y se limita a una instalación nueva; no usarla sobre bases existentes sin un plan revisado. Como MariaDB ejecuta DDL con confirmaciones implícitas, se debe respaldar la base y planificar el despliegue y su recuperación. La reversión elimina las asignaciones y las tres tablas: úsese solo con una copia de seguridad y un plan explícito para esos datos.

Con el prefijo habitual `/api/v1`, los grupos son `/admin/catalog/categories`, `/admin/catalog/materials` y `/admin/catalog/colors`:

- `GET ?page=1&limit=24`: `{items, page, limit, total}` de registros no archivados, ordenados por `sortOrder`, `name`, `id`. Los límites son los mismos que para el catálogo (página máxima 10000, tamaño máximo 100).
- `POST`: `{slug, name, sortOrder?}`; colores admite además `hex?`. Devuelve el registro creado. `slug` es obligatorio, único aun para archivados, inmutable, de hasta 80 caracteres ASCII en minúsculas separados por guiones; `name` se recorta y admite de 1 a 100 caracteres; `sortOrder` es entero entre 0 y 4294967295 y por defecto 0. `hex` es `null` o `#RRGGBB`, normalizado a mayúsculas.
- `PUT /:id`: `{name, sortOrder?}` y, para colores, `hex?`. Se omite `slug`; los campos opcionales omitidos se conservan y `hex: null` lo limpia.
- `DELETE /:id`: archiva, no borra. Responde 409 si **cualquier** producto o variante mantiene la referencia, incluso si está archivado; se debe cambiar o limpiar la referencia primero. Una referencia o registro inexistente/archivado no puede asignarse. La asignación y el archivo bloquean la misma fila durante la transacción para evitar carreras. No hay cascadas ni restauración en esta versión.

El contrato original preveía borrar físicamente las entradas sin referencias. Esta implementación **archiva** incluso las entradas sin referencias: los listados administrativos y públicos solo muestran entradas no archivadas; no existe listado de archivadas ni restauración en esta versión. Un slug archivado sigue reservado y no se puede reutilizar; para crear otro registro hay que elegir un slug diferente. No se borran productos ni variantes, no hay cascadas ni reclasificación silenciosa.

Los cuerpos existentes de crear/actualizar producto admiten `categoryId`, y los de crear/actualizar variante admiten `materialId` y `colorId`: cada uno es UUID o `null`. En creación, omitirlos equivale a `null`; en actualización, omitirlos preserva la asignación y enviarlos como `null` la limpia. Se rechazan IDs malformados o que no correspondan a una taxonomía activa. Así los clientes administrativos anteriores no borran los metadatos al guardar.

Todas estas rutas usan el mismo `CatalogGuard` que los productos: roles `owner` o `catalog`, y en mutaciones sesión válida, origen permitido y `X-CSRF-Token`. El rol `operations` no tiene acceso administrativo al catálogo.
