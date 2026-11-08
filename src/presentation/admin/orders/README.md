# Consulta de pedidos

[Administración](../README.md) → [OrdersPage](orders-page.ts) → [lista](../views/admin-orders-list.hbs) o [detalle](../views/admin-order-detail.hbs).

El dispatcher autoriza owner/operations antes de consultar; catalog no accede. Solo lectura: lista de 20, detalle, estados y cantidades exactas. No hay controles para cobrar, enviar ni cambiar estados. Los pedidos locales siguen identificados como pruebas.

La query solo admite `view`, `page`, `id` según la vista. Nunca decide el nombre de plantilla. El [cliente](../client/browser/orders/README.md) conserva la selección al ocultar la sección.

Desde la raíz: `node --import tsx --test src/presentation/admin/orders/orders-page.test.ts`.
