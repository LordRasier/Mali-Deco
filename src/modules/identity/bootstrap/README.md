# Alta inicial de administrador

[Volver al nivel anterior](../README.md)

[bootstrap.ts](bootstrap.ts) es una entrada interactiva; [bootstrap-owner.ts](bootstrap-owner.ts) controla la creación inicial; [secret-input.ts](secret-input.ts) oculta la entrada sensible.

## Reglas y verificación

No ejecutar automáticamente ni crear cuentas predeterminadas. El comando bootstrap:owner apunta aquí y requiere autorización/entorno local preparado.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
