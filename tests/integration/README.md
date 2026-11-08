# Integración real con MariaDB

[Volver a pruebas](../README.md)

Los cinco archivos `*.integration.ts` verifican catálogo, checkout, medios y pool con una base real. No forman parte de `npm test`.

Seguir [validación local](../../docs/ci.md) y [compatibilidad MariaDB](../../docs/mariadb-local.md). Se requiere autorización y una base aislada, exclusiva y vacía; después se utiliza `npm run test:integration`. No ejecutarlo contra datos comerciales o el preview. Un fallo puede dejar objetos que deben inspeccionarse antes de reintentar.
