# Migraciones históricas

[Volver a infraestructura](../README.md)

Estos ocho archivos conservan sus nombres, orden y SQL. Se descubren desde [database-options.ts](../database-options.ts). No reescribir migraciones aplicadas para adaptar carpetas o reglas nuevas; un cambio de esquema requiere una migración propia y autorización.

Las [pruebas de sentencias](../../../../tests/database/README.md) no ejecutan SQL. La [integración real](../../../../tests/integration/README.md) requiere entorno aislado. Reorganizar fuentes no autoriza aplicar o revertir migraciones.
