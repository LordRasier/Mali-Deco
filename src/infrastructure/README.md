# Infraestructura

[Volver al código](../README.md)

[Base de datos](database/README.md) concentra la configuración de TypeORM, las protecciones de conexión y las migraciones. No contiene casos de uso ni plantillas. Los módulos reciben la conexión mediante la composición de dependencias.

Los arneses viven en [tests](../../tests/README.md), fuera del código de ejecución. No activar `synchronize`, ejecutar migraciones ni iniciar conexiones reales como comprobación documental.
