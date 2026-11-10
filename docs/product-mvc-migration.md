# Detalle de producto MVC — T10

> Registro histórico de una etapa. Rutas de preview, flags y comandos de convivencia ya no son operativos. Consultar el estado consolidado (retirado; ver cobertura de reemplazo) y el [inicio vigente](../README.md).
Implementado en `GET /__mvc/productos/:slug`, sin cambiar el propietario de `/productos/:slug`. [Entrada y código](../src/presentation/products/README.md) · [cliente](../src/presentation/products/client/README.md) · [tareas](../tasks/todo.md).

## Contratos conservados

- HTML 404 para ausencia, 503 y reintento para indisponibilidad, sin fallback demo.
- Marca, descripción, medidas, galería pública ordenada y canonical solo con origen API válido.
- Estado de selección/paginación compartido por React y MVC. Variante fuera de página: una resolución por par, sin escaneo de páginas.
- DTO público en atributo escapado, parser autoritativo, botones deshabilitados hasta validar estado y carrito. Sin script inline.
- Paginación de 100 con detección de solapamiento/deriva; una respuesta cancelada no cambia selección ni cursor.

## Evidencia ejecutada

TDD: modelo SSR (5 casos), HTTP (4), parser bootstrap (2) y store de producto (11). El store y los probes heredados fueron ejecutados además por un revisor independiente: 11 casos, 14 probes de hooks y detalle existentes, todos verdes. La evaluación nativa no fue concluyente por inventario no versionado; se trató como riesgo alto, **no** como aprobación nativa. RDD continúa desactivado.

Navegador con API sintética local y 101 variantes:

- Selección directa de variante 101: una consulta de detalle, una resolución por par; carga posterior sin falso solapamiento.
- Solapamiento real bloquea agregar y permite reiniciar; cambiar selección durante una carga lenta cancela el resultado anterior.
- Selección duplicada y bootstrap malformado no habilitan agregar.
- Galería con segunda imagen fallida muestra placeholder; teclado vuelve a la primera.
- Agregar abre el panel compartido. Suspender/reanudar mientras espera un lock no agrega ni abre tardíamente.

El fixture y su pestaña se cerraron; no hubo base de datos, proveedores ni credenciales. Las pruebas de estado y HTTP no reemplazan la aceptación visual humana.

La validación integrada posterior, incluyendo artefacto sin fuentes, se registra en [T11](home-mvc-migration.md). Antes de retirar Next siguen pendientes el cambio reversible de rutas reales, administración, checkout y checkpoints del plan.
