# Pruebas de infraestructura sin conexión

[Volver a pruebas](../README.md)

Aquí se verifican [opciones](database-options.test.ts), [pool estricto](strict-pool.test.ts), [dependencias sensibles](dependency-security.test.ts) y migraciones usando dobles que capturan SQL. Capturar una sentencia no equivale a ejecutarla ni prueba compatibilidad real con MariaDB.

Se ejecutan mediante `npm run test:server`. Las migraciones permanecen en [migraciones](../../src/infrastructure/database/migrations/README.md); no se cambian nombres, orden o SQL al reorganizar pruebas.
