# Ajustes de marca

[Administración](../README.md) → [SettingsPage](settings-page.ts) → [plantilla](../views/admin-settings.hbs). El dispatcher verifica rol owner antes de leer ajustes; este provider no recibe cookies ni cuerpos de mutación.

La vista usa el servicio existente y un formulario deshabilitado hasta montar el [cliente](../client/browser/settings/README.md). Las escrituras siguen pasando por `/api/v1/admin/settings`, con JSON, origen, rol y CSRF existentes.

Desde la raíz: `node --import tsx --test src/presentation/admin/settings/settings-page.test.ts`.
