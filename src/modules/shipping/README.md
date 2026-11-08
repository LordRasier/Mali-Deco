# Envíos y localidades

[Volver a módulos](../README.md)

[ShippingModule](shipping.module.ts) es dueño de un único PostalCodeResolver y lo exporta a checkout.

## Cómo recorrer esta carpeta

- [Cotización y guarda local](quotes/README.md).
- [Localidades](postal/README.md).
- [Adaptadores externos](providers/README.md).
- [Contratos](contracts/README.md).

## Reglas y verificación

Los proveedores no se habilitan por reorganizar. La [prueba de paths privados](private-path.test.ts) protege el helper de credenciales; su resolución de rutas depende del directorio de ejecución.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
