# Un solo propietario para reglas puras de presentación

> Decisión de una etapa anterior. La convivencia fue reemplazada por [la aplicación única](../rework-completion.md); los invariantes de seguridad siguen vigentes.
**Estado: adoptado durante T09.4.**

El catálogo SSR y el cliente existente necesitan las mismas reglas de URL, precisión monetaria y datos demo. Importar código de web desde el build emitido de API atravesaría su `rootDir`; duplicar las reglas produciría diferencias durante la convivencia.

Se trasladaron seis módulos puros a [presentación compartida dentro de API](../../src/presentation/catalog/shared/README.md). Web conserva reexports temporales, sin lógica duplicada. Los servicios de catálogo siguen validando su propio contrato; solo se comparten reglas de presentación. El adaptador SSR usa los servicios públicos existentes y proyecta sus DTOs explícitamente.

Se descartó crear un tercer paquete/workspace porque el destino autorizado es una sola aplicación, y ampliar `rootDir` porque mezclaría artefactos de ambas aplicaciones. El costo temporal es una dependencia de web hacia ese subárbol hoja; se limita mediante auditoría del bundle y pruebas de identidad, tipos, Next y ejecución compilada. Los reexports se retiran al consolidar consumidores, no antes.

El traslado se verificó contra los cuerpos previos, permitiendo únicamente el cambio de import de dinero. No cambió la configuración TypeScript ni el runner general de tests; las pruebas nativas de dinero/carrito importan sus implementaciones canónicas.
