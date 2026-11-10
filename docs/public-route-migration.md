# Rutas públicas MVC con reversión local

> Registro histórico de una etapa. Rutas de preview, flags y comandos de convivencia ya no son operativos. Consultar el estado consolidado (retirado; ver cobertura de reemplazo) y el [inicio vigente](../README.md).
Con `NODE_ENV=development`, `MVC_PILOT_ENABLED=true` y `MVC_PUBLIC_ROUTES_ENABLED=true` en ambos procesos, Nest sirve `/`, `/catalogo`, `/productos/:slug` y `/carrito`. Admin y checkout todavía pertenecen a Next. [Política y código](../src/presentation/routing/README.md).

## Propiedad explícita

Los controladores canónicos heredan los handlers MVC verificados. El mapa de enlaces se captura al arrancar; query/Host no pueden elegir renderizador ni destino. Next aplica una lista `beforeFiles`, no fallback por error. Las APIs mantienen `/api/v1`; no se excluyen namespaces administrativos genéricos.

Durante convivencia, los enlaces de carrito que cruzan renderizadores son anchors nativos. No se admiten parámetros Flight `_rsc` como filtros de catálogo.

## Evidencia

- Matriz HTTP: off/on/producción, flags discordantes, GET/HEAD, POST rechazado, ausencia de alias API, headers heredados y query/status conservados.
- Modelos y proxy RED→GREEN; revisión independiente: 3 pruebas de política/HTTP y 6 de rewrites correctas.
- G del snapshot integrado con T13: **245 API + 73 web = 318**, lint, tipos y ambos builds verdes.
- Navegador: portada → catálogo → variante → carrito → producto usa URLs canónicas y el mismo carrito. El enlace de la administración Next vuelve a la portada MVC sin Flight.
- Reversión real reiniciando ambos procesos: MVC → Next y Next → MVC conservaron una unidad en el carrito, en contextos de prueba aislados. La primera aserción de rollback coincidió con dos filas React (página/modal); se corrigió el selector de la prueba, no la aplicación, y se repitió correctamente.

## Revertir

Desactivar `MVC_PUBLIC_ROUTES_ENABLED` y reiniciar API y Next devuelve las cuatro páginas a Next. Mantener `MVC_PILOT_ENABLED=true` deja los pilotos disponibles. No cambia claves de almacenamiento, cookies, base de datos ni escrituras realizadas.

No confundir esta asignación local con soporte productivo ni con retirada definitiva del frontend antiguo. Administración, checkout y consolidación siguen bajo sus pruebas y tareas propias.
