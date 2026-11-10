# Herramientas locales

[Volver al proyecto](../README.md). Ejecutar desde la raíz; ningún build necesita un segundo servidor.

- [clean-build.mjs](clean-build.mjs): limpia únicamente `dist` dentro del proyecto y rechaza redirecciones por enlace.
- [build-browser.mjs](build-browser.mjs) y [build-admin-browser.mjs](build-admin-browser.mjs): empaquetan clientes autocontenidos y auditan dependencias, imports externos, tamaño y referencias de entorno.
- [copy-storefront-art.mjs](copy-storefront-art.mjs): valida cinco originales en [resources](../resources/storefront) y conserva sus bytes.
- [copy-view-assets.mjs](copy-view-assets.mjs): copia 36 assets explícitos. Nunca expone archivos adyacentes ni fuentes.
- [check-local-shipping.mjs](check-local-shipping.mjs): smoke de un servidor Nest con entorno limitado, sin base ni proveedor.
- [migration-local-root.mjs](migration-local-root.mjs): preconfiguración explícita de la migración de redes con el root local sin contraseña confirmado por el usuario. Solo desarrollo y `127.0.0.1`; credenciales limitadas al proceso, sin modificar `.env` ni permisos. Usar `npm run migration:social-links:local-root` desde una terminal con acceso a MariaDB.
- Las herramientas Zipnova no se ejecutan en dev/test/build. Requieren autorización y el [procedimiento](../docs/zipnova-quote-foundation.md).

[Assets](../tests/http/view-assets.test.ts) · [Arte](../tests/http/storefront-art.test.ts) · [Smoke](check-local-shipping.test.mjs).
