# Edición de ajustes MVC

[Cliente administrativo](../README.md) → [binding DOM](settings-browser.ts) → [acciones](settings-editor.ts).

El input nativo conserva el borrador al cambiar de sección. Save/reload son explícitos; no se reenvían escrituras ante error. Mientras guarda, los campos permanecen deshabilitados. Una respuesta incierta conserva el borrador y ofrece recargar; una respuesta vieja de otra identidad no actualiza la vista.

El cliente no sustituye autorización del servidor. Al perder sesión, el workspace destruye la sección y su controller.

La vista se organiza en Identidad, Redes y contacto e Imágenes. [Pestañas](settings-tabs.ts) conserva los nodos y los borradores al cambiar; admite flechas, Inicio y Fin, con `tablist`/`tabpanel` y foco itinerante. La validación abre la pestaña del campo inválido antes de enfocarlo. Nombre, color y redes comparten una escritura; las cuatro imágenes conservan sus formularios y guardados independientes.

La grilla es de dos columnas en escritorio y una en móvil, con inputs SM y marcos de imagen del mismo tamaño. Recargar configuración actualiza también la disponibilidad de las redes después de aplicar la migración; si todavía falta, conserva los campos deshabilitados y la opción de recargar.

Desde la raíz: `node --import tsx --test tests/client/admin-settings.check.ts`.
