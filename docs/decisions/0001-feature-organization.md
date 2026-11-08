# Organización por funcionalidad y responsabilidad

> Decisión de una etapa anterior. La convivencia fue reemplazada por [la aplicación única](../rework-completion.md); los invariantes de seguridad siguen vigentes.
**Estado:** adoptada para la reorganización local autorizada. La migración completa a MVC continúa por etapas.

## Decisión

Cada funcionalidad conserva cerca sus controladores, servicios, modelos, consultas, vistas y cliente cuando existan. Los archivos se agrupan gradualmente por responsabilidad, con pruebas próximas y READMEs que explican propósito, límites y recorrido. No se crean carpetas vacías ni un framework de abstracciones propio.

El primer recorrido es catálogo público/facetas. Se conserva la estructura de workspaces mientras Next atienda páginas. Los nombres técnicos son ingleses; las guías siguen el español profesional existente.

## Consecuencias

- Un enlace desde el [mapa de rutas](../routes.md) lleva a entrada, servicio y prueba, sin búsquedas globales.
- Cada movimiento incluye actualización de imports y documentación; los cuerpos de negocio no cambian en la misma unidad.
- Extraer módulos reales de Nest reduce la composición central. Los providers son privados por defecto y se exportan solo para consumidores concretos, según [módulos de Nest](https://docs.nestjs.com/modules#shared-modules).
- No usar carpetas globales de todos los controladores o modelos: separarían piezas de un mismo caso de uso. Tampoco añadir una subcarpeta por archivo.

## Pendiente

El motor de plantillas, la separación definitiva de namespaces HTML/API y la convivencia se prueban en T06–T08. No se modifican las URLs administrativas ni se retira React por aprobar esta convención.
