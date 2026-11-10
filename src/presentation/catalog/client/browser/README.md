# Filtros interactivos

El catálogo actual no presenta el panel ni sus formularios. Este inicializador permanece inactivo cuando no encuentra `data-filter-form`; el contrato de parámetros y los enlaces de limpieza siguen admitidos para enlaces existentes.

[Volver al catálogo](../README.md)

[catalog-filters.ts](catalog-filters.ts) enlaza dos formularios SSR con IDs distintos. Sus fieldsets empiezan deshabilitados; se habilitan únicamente después de instalar handlers y validar contexto. Un fallo de JavaScript no debe enviar un GET vacío que descarte filtros.

La navegación se limita al pathname de catálogo permitido. Las opciones desconocidas permanecen en el estado aplicado aunque no exista su checkbox. Los errores de importes mantienen el diálogo y la URL; se muestran como texto con `role=alert`. `pageshow` restaura controles desde la consulta aplicada, sin afirmar que el navegador use BFCache.
