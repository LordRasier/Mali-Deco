# Contratos HTTP transversales

[Volver al código](../../src/README.md)

[application-routing.test.ts](application-routing.test.ts) conserva las 50 combinaciones de método y ruta declaradas antes de extraer módulos, incluidos métodos heredados. También arranca la aplicación real sin base en un puerto efímero de loopback y comprueba el prefijo, indisponibilidad del catálogo y rechazo de operaciones no autorizadas.

No sustituye pruebas de negocio o integración MariaDB. Prohíbe llamadas HTTP a otro origen y cierra su aplicación al terminar. Los futuros cambios deliberados de rutas deben actualizar contrato, documentación y pruebas; no regenerar el listado para ocultar una regresión.

## Piloto MVC y fronteras

- [mvc-pilot.test.ts](mvc-pilot.test.ts): opt-in, prefijos, escape, headers, assets y traversal mediante paths HTTP crudos.
- [mvc-session-boundaries.test.ts](mvc-session-boundaries.test.ts): identidad, roles, cookie, CSRF, rotación, revocación y expiración con persistencia sintética.
- [mvc-checkout-boundary.test.ts](mvc-checkout-boundary.test.ts): scope de cookie y guardas de checkout sin base ni proveedor.
- [view-assets.test.ts](view-assets.test.ts): copia exclusiva de cuatro assets y fallo ante archivos requeridos ausentes.

La [evidencia](../../docs/mvc-verification.md) distingue caracterización HTTP, navegador y verificaciones aún pendientes.
