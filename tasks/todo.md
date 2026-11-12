# Estado del rework MVC

## Featured products and discounted prices (2026-11-11)

- [x] Featured product validation, persistence and opt-in landing source.
- [x] Nullable discount price and additive migration with safe defaults.
- [x] Effective pricing in catalog, cart, shipping, quote and order revalidation.
- [x] Admin controls, variant-aware diagonal ribbons and accessible prices.
- [x] Failing-first regressions, 640 full-suite tests, 5 browser fixtures, typecheck, lint, build and independent backend review. Evidence: `artifacts/featured-discounts`.
- [x] Authorized local migration, verified SQL backup, unchanged preexisting data and real list/editor rendering (2026-11-12). Production remains untouched.
- [x] Top-right discount ribbons and aligned purchase rows verified in six responsive sizes; sharing, information and zoom controls remain unobstructed.

## Contacto y pago de prueba (2026-11-07)

- [x] Reproducción y corrección de columnas desalineadas; prueba de regresión y compilación correctas.
- [x] Flujo Checkout Pro exclusivamente de prueba, desactivado por defecto, persistencia del inicio, recuperación y consulta segura. Migración escrita, todavía no aplicada.
- [x] Revisión independiente aprobada y corrección de carreras de estado. `npm test` final correcto: servidor 417, cliente 66 y arquitectura 7, sin omisiones. Conservados los fallos iniciales por límite de arranque y el ajuste acotado del arnés. Reversión de migración protegida si existen inicios de pago, siempre con escritores detenidos. Comprobación visual en 390/768/1280 y simulación sin proveedor. Evidencia en `artifacts/mercadopago-local/verification.md`.
- [ ] Configuración y prueba externa con cuenta de prueba y retorno HTTPS autorizado. No habilitar cobros reales ni exponer el servidor local.

## Personalización del escaparate y ampliación de imágenes

- [x] Código de persistencia y validación del color; imágenes configurables con valores actuales de respaldo y protecciones existentes. Activación local completada.
- [x] Controles de Configuración, tema público e imágenes conectadas al inicio y catálogo.
- [x] Panel sin «Ver carrito»; ampliación accesible de las fotos, sin alterar opciones ni compra.
- [x] Suites de servidor (376), cliente (65), arquitectura (7), regresiones finales de apariencia (4), tipos, lint, compilación, revisión y capturas de zoom a 390/768/1280 px.
- [x] Migraciones `1793360800000` y `1793360900000` aplicadas en `mali_catalog_pruebas` con la cuenta local autorizada para este paso, sin cambiar `.env` ni ampliar permisos. Los checksums de productos, variantes, imágenes y derivados coinciden antes/después; siguen los 55 productos y ahora hay diez migraciones. Guardado/lectura del color y carga/lectura de ambas imágenes comprobados con la cuenta habitual `mali_catalog_app` y las respuestas HTTP públicas. Se restauraron el azul y las imágenes originales después de la prueba. Las pruebas de ajustes (14) pasan; el navegador administrativo requiere iniciar sesión para una comprobación manual de la interfaz. Respaldo de ajustes/esquema y comprobaciones en `artifacts/store-appearance/migration-before.json` y `migration-after.json`.

## Único origen de datos público

- [x] Retirar la selección demo del arranque público y del cliente conservando el carrito real.
- [x] Verificar que las variables antiguas no produzcan datos ficticios ni oculten fallos de base: pruebas de configuración y 26 pruebas HTTP, suite completa, tipos, lint y build correctos.
- [x] Documentar el único origen público; mantener dobles sintéticos exclusivamente como soporte de pruebas, no como selección del arranque.
- [ ] Publicar el artefacto y verificar el arranque contra la copia recuperada. El comando de cambio de proceso fue rechazado antes de ejecutarse; el preview anterior continúa en demostración. No se modificó la base original ni se ejecutaron migraciones.

Objetivo: una aplicación NestJS, organizada por funcionalidad y navegable desde la URL; sin segundo frontend ni abstracciones preventivas. El usuario aprobó la base y pospuso el pulido visual.

## Implementación terminada

- [x] T01–T08: inventario, módulos, límites HTTP, motores y contratos preservados.
- [x] T09–T12: catálogo, filtros, detalle, portada, carrito y envío compartido.
- [x] T13–T18: sesión/navegación administrativa, productos, variantes, clasificaciones, medios, pedidos y ajustes.
- [x] T19–T20: checkout local con estado independiente, recuperación explícita e idempotencia.
- [x] T21: base y ocho migraciones trasladadas a infraestructura; pruebas fuera del build, sin ejecutar SQL.
- [x] T22: rutas canónicas permanentes, un package/lockfile, puerto/origen único y retiro de Next/React.
- [x] T23: READMEs, mapa de rutas y comandos actuales; informes de etapas marcados como históricos.

## Verificación de cierre (T24)

- [x] Lint, tipos, suite completa y build desde la raíz, sin fallos.
- [x] Orientación independiente desde dos URLs y dos carpetas; navegación documental verificada.
- [x] Revisión independiente de rutas, assets, permisos, migraciones y límites de bundles.
- [x] Arranque del artefacto sin fuentes ni recursos originales; cinco hashes de arte preservados.
- [x] Navegador móvil: producto → carrito → recarga → diálogo → Escape, sin errores ni desborde.
- [x] Corregido el ejecutor de pruebas anidadas; fallo intencional demuestra propagación del error.
- [ ] Instalación completamente limpia sin conexión: bloqueada por paquete ausente de caché (`walk@2.3.15`). No se autorizan descargas implícitas.

La comprobación de tipos, lint, suites y recorrido documental finales se registra en el [informe](../docs/rework-completion.md). [Plan original](plan.md) · [Registro por etapa](rework-stage-log.md).

## Después del rework

Pulido visual y accesibilidad de detalle; integración real autorizada contra base aislada; preparación productiva, pagos, inventario y logística. No confundir esas tareas con la reorganización ni habilitar servicios por completar esta lista.
# Checkout local compacto — 2026-11-07

- [x] Opt-in local de rutas y acceso desde carrito; producción y modo predeterminado cerrados.
- [x] Cotización validada de prueba sin afirmar preparación logística real.
- [x] Diseño compacto y Mercado Pago visible, inactivo y sin redirección.
- [x] Pruebas completas, revisión, capturas y un pedido sintético con pago/envío no iniciados. Lectura administrativa comprobada mediante su servicio real; la revisión visual del admin requiere iniciar sesión.


## Variant stock and checkout controls (2026-11-07)
- [x] Add inventory/settings migration and tested admin edits, including preserving multiple unsaved stock drafts.
- [x] Enforce stock in server quote/order transactions and public projections.
- [x] Add guarded shared-cart quantity controls, checkout trash and product warning.
- [x] Prove concurrency/rollback in isolated MariaDB; full checks and independent review.
- [x] Apply local migration without changing 55 products / 73 variants / 1 existing order; verify checkout at 390/768/1280 and capture evidence. Admin writes verified by service and DOM fixtures; authenticated admin visual review remains pending user login.
