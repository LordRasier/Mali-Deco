# Navegación de pedidos MVC

[Cliente administrativo](../README.md) → [binding DOM](orders-browser.ts) → [lector cancelable](orders-reader.ts) → parcial privado del servidor.

Paginación y detalle son lecturas GET explícitas. La última solicitud y la identidad actual determinan qué resultado puede renderizarse; desmontar aborta la lectura. Cambiar de sección conserva el nodo y la selección. El parser compartido acepta únicamente el parcial de pedidos, nunca HTML arbitrario de un error o datos de producto.

Desde la raíz: `node --import tsx --test tests/client/admin-orders-browser.check.ts`.
