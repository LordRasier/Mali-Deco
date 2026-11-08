# Pruebas y soporte aislado

[Volver a la API](../README.md) · [Código](../src/README.md)

Las pruebas unitarias de negocio permanecen junto a su implementación. Aquí están las comprobaciones transversales y herramientas que nunca deben formar parte del artefacto productivo.

- [Cliente](client/README.md): stores, DOM y transporte; wrappers con contexto Node saneado.
- [Arquitectura](architecture): paquete único y canario de ejecución anidada.
- [HTTP y composición](http/README.md): rutas, providers compartidos y límite del build.
- [Base sin conexión](database/README.md): configuración, pool y sentencias de migraciones con dobles.
- [Soporte de navegador](browser/README.md): arnés explícito y políticas de aislamiento.
- [Integración real](integration/README.md): requiere autorización, servidor local y esquema exclusivo.

`npm run test:server` descubre `src/**/*.test.ts` y `tests/**/*.test.ts`. No ejecuta `*.integration.ts` ni el arnés interactivo. Typecheck comprueba ambos árboles; el build tiene `rootDir: src`, incluye solo fuentes y excluye tests. No importar soporte de tests desde código productivo.

`npm test` prepara assets y ejecuta servidor, cliente y arquitectura. `npm run test:client` incluye los wrappers y las pruebas puras; no hereda el contexto del runner padre en sus subprocessos.
