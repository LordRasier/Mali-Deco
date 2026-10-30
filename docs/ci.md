# Validación local

Todas las comprobaciones deben ejecutarse localmente; este repositorio no incluye un workflow de ejecución automática en GitHub. Con Node.js 24 y las dependencias instaladas desde el lockfile, los comandos generales son:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

## Integración con MySQL

La integración requiere MySQL 8.4 local y una base **exclusiva, aislada y vacía** llamada `store_integration_test`. Configure `DB_HOST=127.0.0.1` o `localhost`, `DB_PORT`, `DB_DATABASE=store_integration_test`, `DB_USERNAME`, `DB_PASSWORD` y `MYSQL_INTEGRATION=1` en el entorno; después ejecute `npm run test:integration -w @store/api`. No use datos reales ni una base compartida o productiva. Sin `MYSQL_INTEGRATION=1` la prueba se omite.

La prueba comprueba que la base esté vacía, aplica las migraciones registradas, verifica operaciones y restricciones seleccionadas de catálogo e identidad, y las revierte. Crea un usuario de prueba temporal, no una cuenta productiva. MySQL hace commits implícitos para DDL: un fallo puede dejar tablas que deben inspeccionarse y repararse antes de reintentar. Véase el README principal para las precauciones completas.

Estas pruebas no cubren todo el negocio, pagos, envíos, integraciones externas ni una puesta en producción. Las pruebas con MySQL real y la validación interactiva en navegador del incremento de catálogo siguen pendientes; no se infiere que hayan pasado por la existencia de estos comandos.
