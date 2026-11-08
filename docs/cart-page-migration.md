# Página de carrito MVC — T12

> Registro histórico de una etapa. Rutas de preview, flags y comandos de convivencia ya no son operativos. Consultar el estado consolidado (retirado; ver cobertura de reemplazo) y el [inicio vigente](../README.md).
`/__mvc/cart` ahora presenta el carrito completo, además del panel. [Entrada](../src/presentation/cart/cart.controller.ts) → [modelo](../src/presentation/cart/cart-page.ts) → [vista](../src/presentation/cart/views/cart.hbs) → [cliente](../src/presentation/cart/client/browser/README.md).

## Una sola instancia

Página y modal comparten **el mismo árbol DOM**, store y sesión de cotización. [cart-surface](../src/presentation/cart/client/browser/cart-surface.ts) mueve el contenido al diálogo y lo devuelve al cerrar: no clona IDs, inputs ni listeners. La marca tiene fallback explícito si ajustes falla, sin ocultar líneas del navegador. Checkout de prueba aparece solo con modo API y opt-in local, y se oculta con carrito vacío/no verificado.

Una revisión independiente detectó que el evento nativo `close` es diferido: una restauración tardía podía vaciar un modal reabierto. Regresión RED→GREEN con evento encolado; restaurar solo si está cerrado y el contenido aún no está en la página evita la carrera y movimientos redundantes.

## Evidencia enfocada

- Modelo: 2 casos; superficie: 3 casos; HTTP de página, árbol único, shell, query rechazada y checkout apagado.
- Navegador en contextos nuevos aislados: formulario postal conserva valor al abrir/cerrar, un árbol único, devolución de foco, móvil sin overflow.
- Dos pestañas ajustaron concurrentemente 1 → 3 unidades; recarga conservó cantidad; eliminar sincronizó ambas y movió foco al enlace vacío.
- Fixture de cliente API: resolución incompleta conservó dos unidades y mostró error; reintento válido recuperó el producto. Es un doble de transporte, no una integración de base de datos.
- Bloquear local/sessionStorage tras cargar conservó tres unidades en memoria incluso al suspender/reanudar; aviso de carrito temporal visible.

No se usaron credenciales, datos de usuario ni proveedores. El primer fixture de almacenamiento usó por error un slug como ID y se descartó; el recorrido correcto utilizó el ID demo canónico `ondas`. Todos los contextos de prueba se cerraron.

La asignación canónica de `/carrito` se controla mediante el [selector local](../src/presentation/routing/README.md), junto con las otras páginas públicas. La retirada de Next sigue condicionada a completar administración/checkout y verificaciones finales.
