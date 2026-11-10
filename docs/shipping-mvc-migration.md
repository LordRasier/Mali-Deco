# T09.3 — Cotización en el panel MVC

> Registro histórico de una etapa. Rutas de preview, flags y comandos de convivencia ya no son operativos. Consultar el estado consolidado (retirado; ver cobertura de reemplazo) y el [inicio vigente](../README.md).
**Implementada en `/__mvc/cart`, todavía aislada de las rutas de negocio.** Reutiliza el controlador de envíos existente; no activa proveedores, checkout ni persistencia de pedidos. Catálogo y filtros MVC siguen pendientes.

## Organización

Entrar por [envíos compartidos](../src/presentation/shipping/client/README.md): sesión existente → ciclo de vida de navegador → proyección coherente → adaptador DOM. React y MVC usan el mismo ciclo de vida para código postal, pista de localidad y vencimiento. No se duplicó el parser ni el cliente HTTP.

La UI ofrece código postal, elección explícita de localidad ambigua, reintento, envío estimado y total. Conserva partidas por moneda, no supone envío gratis y oculta totales mientras el carrito está sin verificar o la cotización no corresponde a su identidad. Un retiro exige elegir sucursal antes de confirmar; este panel no confirma entregas ni pedidos.

## Correcciones verificadas

- **Trabajo después de disponer:** `ShippingSession` podía lanzar una consulta/cotización después de que un suscriptor la suspendiera durante una publicación. Ahora comprueba estado activo y generación antes de iniciar trabajo y después de publicar resultados. Los callbacks obsoletos no reviven al reactivar el propietario.
- **Postal viejo sobre memoria:** rehidratar en cada montaje podía sustituir un valor reciente por uno antiguo después de un fallo de escritura. El ciclo compartido recuerda la hidratación por modo; una reanudación del mismo propietario conserva memoria, incluso si storage empieza a funcionar después.
- **Mensaje de localidad seleccionada:** después de cotizar una localidad ambigua, el texto volvía a pedir código postal. Una regresión reproduce ese estado; ahora informa el destino elegido.

El ciclo y la proyección tuvieron RED por módulos ausentes antes de implementarse. Los fallos concretos de ciclo de vida/storage se reprodujeron con 7 casos correctos y 3 fallidos, luego todos pasaron. El mensaje tuvo RED 8/1 y GREEN 9/9. Resultado enfocado final: **12 casos de ciclo de vida + 9 de proyección**; las regresiones anteriores de sesión siguen pasando.

## Evidencia general y límites

- `npm run lint`, `npm run typecheck`, `npm test` y `npm run build`: correctos. Suite general: **197 API + 65 web = 262**; los casos enfocados están dentro de dos wrappers web, no se suman otra vez.
- Bundle autocontenido: **33.329 bytes**, 20 módulos fuente, sin React/Next ni dependencias externas. Continúa bajo el límite auditado de 100 KB y se copia con los mismos siete assets.
- Revisión independiente por lectura: sin defectos materiales pendientes en el alcance revisado. No se le atribuyen ejecuciones de pruebas.
- Se repitieron comprobaciones del proxy local API/Next y del artefacto compilado sin fuentes. Las guardas y flags del servidor no se modificaron.
- Sin nuevas dependencias, instalaciones, migraciones, credenciales, llamadas reales al proveedor ni escrituras comerciales. RDD desactivado; sin commits.

## Navegador: respuestas sintéticas, no proveedor real

Se inició una API de desarrollo sin base ni proveedor en un puerto efímero propio. El navegador interceptó únicamente los tres endpoints de catálogo/destino/cotización de ese origen y devolvió fixtures. Se creó y luego retiró un carrito sintético mediante sus claves concretas; no se inspeccionaron cookies ni tokens. El proceso de prueba y las intercepciones se retiraron al finalizar.

Verificado en ese cliente real:

1. Código `7600` → localidades ambiguas; sin estimación hasta elegir una. El input mantiene el foco.
2. Elegir localidad → subtotal $10,00, envío $5,00, total $15,00.
3. Aumentar cantidad → total temporalmente «A calcular» y luego $25,00; el botón mantiene el foco.
4. Cotización de retiro → aviso de sucursal, sin selección automática.
5. Cotización con vencimiento de cinco segundos → importe oculto y reintento visible al vencer.
6. Respuesta HTTP 503 sintética → error explícito, sin total y sin perder el destino. El error de consola 503 corresponde a esta inyección deliberada.
7. Recargar → código y pista conservados; la localidad solo se restaura tras lookup nuevo. Mensaje final muestra el destino correcto.
8. Captura móvil de 375 × 812 inspeccionada tras recarga: controles dentro del diálogo y sin desbordamiento horizontal; el contenido se desplaza verticalmente.

En el origen de convivencia real, con demo y un artículo agregado desde Next, ingresar código en MVC produjo **cero solicitudes de envíos**. Navegar MVC → Next conservó `7600`; editarlo a `1000` en Next y volver a MVC conservó el cambio. Se retiraron el artículo y código usados para la prueba.

Las pruebas de solicitudes tardías, disposición durante publicaciones, reanudación y errores de storage son deterministas. No se afirma elegibilidad real de BFCache, auditoría productiva o integración MariaDB/proveedor. Las comprobaciones administrativas de T08 siguen pendientes.

## Próximo recorrido

T09.4–T09.5: listado y filtros MVC, conservando URLs, paginación, variantes y comportamiento móvil. No transferir `/catalogo` ni retirar Next antes de sus pruebas de paridad. Consultar [plan](../tasks/plan.md) y [tareas](../tasks/todo.md).
