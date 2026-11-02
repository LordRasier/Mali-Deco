# Base de tienda

Monorepo inicial para una tienda configurable. Contiene una API NestJS y una aplicación Next.js mínima; todavía no vende productos ni es apta para producción.

## Inicio local

Requiere Node.js 24 o posterior y npm. Ejecutar `npm ci`, luego `npm run dev:api` y `npm run dev:web` en terminales separadas. API en `http://127.0.0.1:3001/api/v1/health`, web en `http://127.0.0.1:3000`. Las variables del archivo `.env.example` deben exportarse al entorno de cada proceso: no se cargan automáticamente.

La configuración apunta a MariaDB 10.4 de XAMPP y requiere todas las variables `DB_*` del ejemplo en el entorno. La API escucha únicamente en `127.0.0.1`; arranca sin persistencia cuando `DB_HOST` está vacío y `NODE_ENV` no es `production`. En producción la ausencia de base impide el arranque. Las migraciones y el catálogo se probaron localmente en MariaDB 10.4.32; aún faltan revisión independiente y validación de la aplicación completa, por lo que no deben usarse con datos reales. Son para una instalación nueva; no aplicarlas a bases existentes sin un plan de migración revisado. Véase [compatibilidad MariaDB](docs/mariadb-local.md).

Comprobaciones: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. La configuración usa TypeORM con `synchronize: false`; los cambios de esquema requerirán migraciones explícitas.

`@nestjs/platform-express` 11.2.8 fija Multer 2.4.0, afectado por [GHSA-q7qp-rjg7-q26m](https://github.com/advisories/GHSA-q7qp-rjg7-q26m). El override del proyecto fija 2.5.0, versión corregida; revisar su vigencia al actualizar Nest. No hay carga de archivos implementada.

Con npm 11.6.2, `npm ls multer` informa `ELSPROBLEMS` porque Nest declara exactamente 2.4.0, aunque la instalación limpia resuelve 2.5.0; existe un [reporte similar de npm con overrides y workspaces](https://github.com/npm/cli/issues/9514). La suite verifica qué versión resuelve Nest. Usar `npm ci` con el lockfile y volver a verificar tras cambios de dependencias; no asumir que `npm update` conserva el override.

La prueba de integración requiere un servidor local autorizado y una base vacía **exclusiva** llamada `store_integration_test`. Configure `DB_HOST=127.0.0.1` o `localhost`, las demás variables `DB_*` y `MARIADB_INTEGRATION=1`; luego ejecute `npm run test:integration -w @store/api`. La prueba rechaza bases no vacías, aplica y revierte las migraciones y usa modo estricto en su propia conexión. Si falla, deja el esquema para inspección. Sin `MARIADB_INTEGRATION=1` se omite. Para la cuenta local sin contraseña confirmada, véase la excepción exclusiva de prueba en [compatibilidad MariaDB](docs/mariadb-local.md).

El storefront requiere `API_BASE_URL` con el prefijo público completo, por ejemplo `http://127.0.0.1:3001/api/v1/`. Para revisar el concepto sin base de datos, iniciar Next en desarrollo con `STOREFRONT_MODE=demo`; ese modo usa imágenes generadas y precios de ejemplo y no está habilitado en producción. Véase [storefront](apps/web/README.md).

## Límites y decisiones

- La marca visible se configura en `store_settings` y se obtiene de la API. `STORE_NAME` es opcional para el título de metadatos de Next, con `Tienda` como valor neutral. No hay multitenencia.
- La API ofrece `GET /api/v1/catalog/products` (parámetros `page`, `limit`, `search`), `GET /api/v1/catalog/products/:slug` (variantes paginadas con `page`, `limit`) y `GET /api/v1/catalog/settings`. El listado devuelve resúmenes; el detalle muestra variantes no archivadas. Ambos usan páginas de hasta 100 elementos. Los ajustes devuelven únicamente el nombre. Sin conexión devuelve 503 y no inventa datos. El owner puede indicar o cambiar el nombre visible desde Administración; no se crea uno automáticamente. `STORE_NAME` es opcional para los metadatos.
- El catálogo administrativo tiene rutas protegidas por sesión, rol y CSRF, todavía pendientes de prueba contra MariaDB real. Véase [identidad administrativa](docs/identity-status.md). Inventario y disponibilidad aún no están implementados: las políticas `stock` y `made_to_order` no implican stock disponible. No hay datos iniciales de producción.
- El detalle administrativo de un producto pagina sus variantes con `page` y `limit` (máximo 100), e incluye variantes archivadas para gestión.
- La descripción del producto admite hasta 65.535 bytes UTF-8, el límite de `TEXT` de MariaDB.
- [Decisiones pendientes para pagos y envíos](docs/architecture.md) describen restricciones para el trabajo posterior.

Referencias: [NestJS](https://docs.nestjs.com/first-steps), [Next.js App Router](https://nextjs.org/docs/app/getting-started/installation), [opciones de TypeORM](https://typeorm.io/docs/data-source/data-source-options/).
