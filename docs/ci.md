# Validación local

Todas las comprobaciones deben ejecutarse localmente; este repositorio no incluye un workflow de ejecución automática en GitHub. Con Node.js 24 y las dependencias instaladas desde el lockfile, los comandos generales son:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

## Integración con MariaDB

La integración requiere MariaDB local y una base **exclusiva, aislada y vacía** llamada `store_integration_test`. Configure `DB_HOST=127.0.0.1` o `localhost`, `DB_PORT`, `DB_DATABASE=store_integration_test`, `DB_USERNAME`, `DB_PASSWORD` y `MARIADB_INTEGRATION=1` en el entorno; después ejecute `npm run test:integration`. No use datos reales ni una base compartida o productiva. Sin `MARIADB_INTEGRATION=1` la prueba se omite. El acceso debe estar previamente autorizado: no se crean cuentas ni bases automáticamente.

La prueba comprueba que la base esté vacía y que el servidor sea MariaDB con restricciones CHECK activas; configura modo SQL estricto solo para su conexión, aplica las migraciones, verifica operaciones y restricciones seleccionadas de catálogo e identidad, y las revierte. Crea un usuario de aplicación de prueba, no una cuenta de base. MariaDB hace commits implícitos para DDL: un fallo puede dejar tablas que deben inspeccionarse antes de reintentar. Véase [compatibilidad MariaDB](mariadb-local.md).

Estas pruebas no cubren todo el negocio, pagos, envíos, integraciones externas ni una puesta en producción. La prueba aislada pasó en MariaDB 10.4.32 con modo estricto exclusivo de la sesión; además se verificó el pool real y el catálogo HTTP local con datos sintéticos retirados después de la prueba. Los detalles y límites figuran en [compatibilidad MariaDB](mariadb-local.md).
