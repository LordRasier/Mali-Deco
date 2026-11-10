# Adaptador DOM del carrito

[Volver al carrito](../README.md) · [Plantilla Nest](../../README.md)

- [Arranque de presentación](../../../browser/browser.ts) inicia los clientes o informa un fallo sin simular éxito.
- [cart-panel.ts](cart-panel.ts) suscribe el store, coordina el diálogo nativo y preserva el ciclo de vida al salir/volver a la página.
- [cart-chrome.ts](cart-chrome.ts) conserva el ícono del acceso, actualiza su nombre accesible y contador, y alterna estado vacío/contenido sin reconstruir formularios.
- [cart-surface.ts](cart-surface.ts) mueve el mismo contenido entre página y modal sin duplicar estado; ignora eventos de cierre atrasados de un diálogo reabierto.
- [cart-row.ts](cart-row.ts) crea filas con nodos de texto y controles estables. No usa interpolación HTML ni handlers inline.

Los datos se proyectan en DOM mediante `textContent`; los enlaces se construyen desde rutas fijas y los IDs se codifican. Las imágenes se limitan al mismo origen y a rutas conocidas. Una actualización de precio/cantidad no reemplaza el botón enfocado. Al eliminar una fila, el foco pasa a otra fila o al enlace vacío. Un handler de Escape cierra el diálogo abierto; la modalidad y devolución de foco usan el diálogo nativo.

El [build de navegador](../../../../../scripts/build-browser.mjs) reutiliza el estado y resolver existentes. Produce un único archivo autocontenido, sin runtime de framework, source maps, imports externos ni sustitución de variables de entorno. No crear otro store ni otras claves para MVC.

El panel conecta la [cotización compartida](../../../shipping/client/README.md) con un único propietario de destino y carrito. La página y el diálogo conservan el mismo árbol de controles; no crear una sesión paralela al abrirlos.

## Presentación contextual

El estado vacío solo invita a explorar productos. Con artículos, la página separa listado y resumen en escritorio; el panel mantiene una columna compacta. El envío se muestra debajo de la lista, sin desplegable, con un campo postal de ancho acotado y altura táctil de 44 px. El panel ya no muestra «Ver carrito»; la ruta directa `/carrito` se conserva, y el checkout local solo aparece allí cuando su política existente lo permite. En demo el campo permanece visible con un aviso explícito de que no hay cálculo disponible: el estado compartido impide llamadas reales y no se inventa una tarifa.

La cantidad visible del acceso se limita a `99+`; su nombre accesible conserva el número exacto. El SVG y el contador son decorativos para lectores de pantalla. Los controles de cantidad mantienen sus nodos y el formulario de envío se mueve, nunca se clona. [Pruebas de presentación](../../../../../tests/client/cart-chrome.check.ts) y [plantilla](../../../../../tests/client/cart-template.check.ts).
