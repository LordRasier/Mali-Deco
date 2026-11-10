# Adaptadores externos

[Volver al nivel anterior](../README.md)

Aquí se agrupan únicamente las integraciones que ya existen, no un catálogo de proveedores futuros.

## Cómo recorrer esta carpeta

- [Andreani](andreani/README.md).
- [Zipnova](zipnova/README.md).

## Reglas y verificación

La presencia del código no autoriza red, credenciales o despacho. Las pruebas usan transportes controlados.

Las pruebas unitarias están junto a la implementación y los contratos transversales en `tests`; ejecutar `npm run test:server` desde la raíz. Las pruebas que requieren infraestructura se ejecutan por separado y con autorización.
