# T09.5 — Controles de filtros MVC

> Registro histórico de una etapa. Rutas de preview, flags y comandos de convivencia ya no son operativos. Consultar el estado consolidado (retirado; ver cobertura de reemplazo) y el [inicio vigente](../README.md).
**Implementados en el catálogo aislado.** No se cambió todavía el dueño de `/catalogo`; continúa la migración del detalle y portada antes de cerrar la paridad del escaparate.

Reglas puras compartidas con React: alternar selecciones, límite de veinte por grupo, cambio de moneda, limpieza y conversión decimal exacta. La proyección SSR conserva selecciones y límites de metadatos. Un único parcial genera formularios con IDs distintos; los fieldsets arrancan deshabilitados hasta que el cliente valida y enlaza el formulario.

Ver [servidor](../src/presentation/catalog/README.md), [cliente](../src/presentation/catalog/client/README.md) y [arranque compartido](../src/presentation/browser/README.md).

## Evidencia de esta unidad

- Seis pruebas de reglas RED por módulo ausente → GREEN; proyección RED por campos inexistentes → GREEN. Los checks existentes de catálogo y tipos web pasan tras reutilizar las reglas en React.
- Suite de la copia aislada: 216 API + 65 web correctas; build API/Next correcto. Estos números corresponden a esta unidad, antes de integrar el detalle de producto delegado.
- Typecheck detectó iteración directa de colecciones DOM no admitida por las libs configuradas; se usó `Array.from`, sin ampliar configuración ni debilitar tipos.
- Revisión independiente por lectura sin defecto material encontrado; navegador verificado por el agente principal, no por el revisor.

## Navegador real, demo sin proveedores

1. En móvil, marcar Decoración no cambió URL ni resultados. Cancelar y reabrir dejó la elección descartada y devolvió el foco al botón.
2. Mínimo 3/máximo 2 mostró error sin navegar ni cerrar el diálogo.
3. Limpiar el borrador, elegir Decoración + Arena y máximo 25000,00 produjo `category=decoracion&color=arena&currency=ARS&maxPriceMinor=2500000`, con un resultado.
4. A viewport de escritorio, elegir Arena navegó inmediatamente. Una categoría desconocida conservó su parámetro y cero resultados: no se amplió la consulta silenciosamente.
5. Atrás/adelante restauró URL y estado checked correspondiente.

No se interpretan estas pruebas como paridad visual completa del escaparate ni revisión humana de checkpoints posteriores. No hubo escrituras comerciales, migraciones ni llamadas a proveedores. Sigue T10, conservando verificación por unidad sin pedir confirmación después de cada una.
