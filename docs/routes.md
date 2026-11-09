# Mapa de rutas

Un único proceso Nest sirve HTML, assets y JSON. [Entrada](../src/main.ts) → [composición](../src/app.module.ts) → [presentación](../src/presentation/presentation.module.ts). La API conserva `/api/v1`; las exclusiones HTML son GET exactas.

## Páginas

| URL | Controlador | Guía de vista y cliente | Pruebas |
|---|---|---|---|
| `/` | [Inicio](../src/presentation/home/home.controller.ts) | [Portada](../src/presentation/home/README.md) | [HTTP](../tests/http/home-mvc.test.ts) |
| `/catalogo` | [Catálogo](../src/presentation/catalog/catalog.controller.ts) | [Listado y filtros](../src/presentation/catalog/README.md) | [HTTP](../tests/http/catalog-mvc.test.ts) |
| `/productos/:slug` | [Producto](../src/presentation/products/product.controller.ts) | [Detalle](../src/presentation/products/README.md) | [HTTP](../tests/http/product-mvc.test.ts) |
| `/categorias/:slug` | [Categorías](../src/presentation/catalog/category.controller.ts) | [SEO](seo-implementation.md) | [Recorrido SSR](../tests/http/seo-routing.test.ts) |
| `/robots.txt`, `/sitemap.xml`, `/sitemaps/:name` | [Descubrimiento](../src/presentation/seo/discovery.controller.ts) | [SEO](seo-implementation.md) | [Recorrido SSR](../tests/http/seo-routing.test.ts) |
| `/carrito` | [Carrito](../src/presentation/cart/cart.controller.ts) | [Página y panel](../src/presentation/cart/README.md) | [Estado](../tests/client/cart-store.check.ts), [DOM](../tests/client/cart-surface.check.ts) |
| `/envios-y-reembolsos` | [Envíos y reembolsos](../src/presentation/information/shipping-returns.controller.ts) | [Información de compra](../src/presentation/information/README.md) | [HTTP](../tests/http/home-mvc.test.ts) |
| `/contacto`, `/politica-de-privacidad`, `/terminos-y-condiciones`, `/preguntas-frecuentes`, `/sobre-mali` | [Información de la tienda](../src/presentation/information/information.controller.ts) | [Contenido, contacto y estado de publicación](../src/presentation/information/README.md) | [Renderizado y configuración](../src/presentation/information/information.test.ts) |
| `/checkout` | [Checkout](../src/presentation/checkout/checkout.controller.ts) | [Pedido local](../src/presentation/checkout/README.md) | [Límites](../tests/http/mvc-checkout-boundary.test.ts), [estado](../tests/client/checkout-state.check.ts) |
| `/admin` | [Administración](../src/presentation/admin/admin.controller.ts) | [Sesión y navegación](../src/presentation/admin/README.md) | [HTTP](../src/presentation/admin/admin-http.test.ts), [DOM](../tests/client/admin-dom.check.ts) |

No existen rutas `__mvc`. La tienda devuelve 404 para `/checkout` y sus API salvo opt-in explícito de desarrollo (`LOCAL_TEST_CHECKOUT_ENABLED=true`). En producción nunca se registran. Las páginas públicas de producción correctas conservan indexación; demo, desarrollo, errores, páginas privadas, filtros y búsquedas usan noindex. Las URLs antiguas de productos registrados en el historial redirigen 301 al slug vigente.

## Administración

| Fragmento | Funcionalidad | Roles |
|---|---|---|
| `#products` | [Productos, variantes y medios](../src/presentation/admin/products/README.md) | owner, catalog |
| `#classifications` | [Clasificaciones](../src/presentation/admin/classifications/README.md) | owner, catalog |
| `#orders` | [Pedidos](../src/presentation/admin/orders/README.md) | owner, operations |
| `#settings` | [Ajustes](../src/presentation/admin/settings/README.md) | owner |

Los fragmentos no llegan al servidor. El cliente obtiene HTML interno en `/admin/sections/:section`; cada lectura y escritura repite autorización. Cambiar de sección conserva borradores; perder identidad, rol o sesión los destruye.

## Archivos públicos

`/assets/storefront`, `/assets/admin`, `/assets/checkout` y `/storefront` sirven únicamente nombres fijos mediante GET/HEAD. [Configuración](../src/presentation/static-assets.ts). No se expone una carpeta de fuentes o plantillas completa.

## API NestJS

Todas las rutas de las tablas siguientes llevan el prefijo **`/api/v1`**, aplicado en [main](../src/main.ts). El inventario de combinaciones declaradas de método/ruta se verifica contra metadatos de los controladores registrados, incluyendo métodos heredados. No se enumeran respuestas implícitas del adaptador como HEAD para GET. Las respuestas de éxito indicadas corresponden a decoradores/implementación: no constituyen evidencia de una prueba HTTP integral. Los errores de validación, autorización, ausencia, conflicto o servicio no disponible conservan sus status propios.

### Lectura pública y carrito

| Método | Sufijo | Controlador → servicio | Éxito | Prueba |
|---|---|---|---|---|
| GET | `/health` | [AppController](../src/app.controller.ts) | 200 | [arranque offline](../tests/http/checkout-app-smoke.test.ts) |
| GET | `/catalog/products` | [CatalogController](../src/modules/catalog/controllers/catalog.controller.ts) → [PublicCatalog](../src/modules/catalog/services/public-catalog.ts)/[listPublicProducts](../src/modules/catalog/queries/public-listing.ts) | 200 | [listado](../src/modules/catalog/queries/public-listing.test.ts) |
| GET | `/catalog/products/:slug` | [CatalogController](../src/modules/catalog/controllers/catalog.controller.ts) → [PublicCatalog](../src/modules/catalog/services/public-catalog.ts) | 200 | [catálogo](../src/modules/catalog/services/public-catalog.test.ts) |
| GET | `/catalog/facets` | [CatalogController](../src/modules/catalog/controllers/catalog.controller.ts) → [PublicFacets](../src/modules/catalog/services/public-facets.ts) | 200 | [facetas](../src/modules/catalog/services/public-facets.test.ts) |
| GET | `/catalog/settings` | [CatalogController](../src/modules/catalog/controllers/catalog.controller.ts) → [PublicCatalog](../src/modules/catalog/services/public-catalog.ts) | 200 | [catálogo](../src/modules/catalog/services/public-catalog.test.ts) |
| POST | `/catalog/cart/resolve` | [PublicCartController → PublicCartResolver](../src/modules/catalog/cart/cart-resolver.ts) | 200 explícito | [resolución](../src/modules/catalog/cart/cart-resolver.test.ts) |

Son rutas públicas, no autorizan escrituras. Filtros y cantidades se validan; ausencia de base no se reemplaza por demo. Contratos detallados en [API de catálogo](catalog-public-api.md).

### Identidad

Entrada común: [AuthController](../src/modules/identity/http/auth.controller.ts) → [IdentityService](../src/modules/identity/services/identity-service.ts). Pruebas de [identidad](../src/modules/identity/services/identity-service.test.ts), [seguridad](../src/modules/identity/security/security.test.ts) y [cookies](../src/modules/identity/http/http.test.ts).

| Método | Sufijo | Condición | Éxito |
|---|---|---|---|
| POST | `/auth/login` | Credenciales válidas, origen permitido y límites de intentos | 201, usuario/CSRF y cookie; no token de sesión en JSON |
| GET | `/auth/me` | Sesión vigente | 200 |
| POST | `/auth/csrf` | Sesión vigente y origen permitido; rota token CSRF | 201 |
| POST | `/auth/logout` | Sesión, origen y CSRF; revoca y limpia cookie | 201, `{ok:true}` |

### Productos y variantes administrativos

Entrada: [AdminCatalogController](../src/modules/catalog/controllers/admin.controller.ts) → [CatalogAdmin](../src/modules/catalog/services/catalog-admin.ts). [CatalogGuard](../src/modules/identity/http/catalog.guard.ts) exige owner/catalog; las mutaciones exigen origen y CSRF. Pruebas de [detalle](../src/modules/catalog/services/admin-detail.test.ts), [operaciones](../src/modules/catalog/services/catalog-admin.test.ts) y [guard](../src/modules/identity/http/catalog.guard.test.ts).

| Método | Sufijo | Éxito |
|---|---|---|
| GET | `/admin/catalog/products` | 200 |
| GET | `/admin/catalog/products/:id` | 200 |
| POST | `/admin/catalog/products` | 201 |
| POST | `/admin/catalog/products/with-price` | 201; crea borrador y variante estándar con precio, costo opcional y stock inicial en una transacción |
| PUT | `/admin/catalog/products/:id` | 200 |
| DELETE | `/admin/catalog/products/:id` | 200 sin cuerpo; archivo, no borrado físico |
| POST | `/admin/catalog/products/:id/variants` | 201 |
| PUT | `/admin/catalog/products/:id/variants/:variantId` | 200 |
| PUT | `/admin/catalog/products/:id/variants/:variantId/pricing` | 200; costo, venta, modalidad y stock modificado en una transacción; rechaza valores desactualizados con 409 |
| DELETE | `/admin/catalog/products/:id/variants/:variantId` | 200 sin cuerpo; archivo |

### Clasificaciones, ajustes y pedidos

| Método | Sufijo | Controlador → servicio | Rol y éxito | Prueba |
|---|---|---|---|---|
| GET / POST | `/admin/catalog/categories` | [AdminCategoriesController](../src/modules/catalog/controllers/admin-taxonomy.controller.ts) → [CatalogTaxonomy](../src/modules/catalog/services/catalog-taxonomy.ts) | owner/catalog; 200 / 201 | [taxonomías](../src/modules/catalog/services/catalog-taxonomy.test.ts) |
| PUT / DELETE | `/admin/catalog/categories/:id` | Mismo controlador/servicio | owner/catalog; 200 / 200 | [taxonomías](../src/modules/catalog/services/catalog-taxonomy.test.ts) |
| GET / POST | `/admin/catalog/materials` | [AdminMaterialsController](../src/modules/catalog/controllers/admin-taxonomy.controller.ts) → [CatalogTaxonomy](../src/modules/catalog/services/catalog-taxonomy.ts) | owner/catalog; 200 / 201 | [taxonomías](../src/modules/catalog/services/catalog-taxonomy.test.ts) |
| PUT / DELETE | `/admin/catalog/materials/:id` | Mismo controlador/servicio | owner/catalog; 200 / 200 | [taxonomías](../src/modules/catalog/services/catalog-taxonomy.test.ts) |
| GET / POST | `/admin/catalog/colors` | [AdminColorsController](../src/modules/catalog/controllers/admin-taxonomy.controller.ts) → [CatalogTaxonomy](../src/modules/catalog/services/catalog-taxonomy.ts) | owner/catalog; 200 / 201 | [taxonomías](../src/modules/catalog/services/catalog-taxonomy.test.ts) |
| PUT / DELETE | `/admin/catalog/colors/:id` | Mismo controlador/servicio | owner/catalog; 200 / 200 | [taxonomías](../src/modules/catalog/services/catalog-taxonomy.test.ts) |
| GET / PUT | `/admin/settings` | [StoreSettingsController → StoreSettings](../src/modules/settings/store-settings.ts) | owner; 200 | [ajustes](../src/modules/settings/store-settings.test.ts) |
| GET / PUT | `/admin/settings/seo` | [SiteSettingsController → SiteSettings](../src/modules/settings/site-settings.ts) | owner; 200, CSRF/origen para guardar, 409 si la revisión cambió | [ajustes SEO](../src/modules/settings/site-settings.test.ts), [SSR y permisos](../tests/http/seo-routing.test.ts) |
| GET | `/admin/orders` | [AdminOrdersController](../src/modules/orders/http/admin-orders.controller.ts) → [OrdersService](../src/modules/orders/services/orders.service.ts) | owner/operations; 200 | [pedidos](../src/modules/orders/services/orders.test.ts) |
| GET | `/admin/orders/:id` | Mismo controlador/servicio | owner/operations; 200 | [pedidos](../src/modules/orders/services/orders.test.ts) |

Las rutas concretas de clasificaciones heredan métodos del controlador base: no omitirlas del inventario por no encontrar decoradores HTTP dentro de cada clase hija. Ajustes usa [OwnerGuard](../src/modules/identity/http/owner.guard.ts); pedidos usa [OrdersGuard](../src/modules/orders/http/orders.guard.ts).

### Medios

La marca admite `PUT /admin/settings/branding/:kind` (owner, origen y CSRF, archivo multipart `file`) y `GET /catalog/branding/:kind` (PNG público sin caché). `kind` solo acepta `logo` o `icon`; ambos requieren la migración de marca.

Entrada: [controladores de medios](../src/modules/media/http/media.controller.ts) → [MediaService](../src/modules/media/services/media-service.ts). Las rutas administrativas exigen owner/catalog y CSRF/origen para mutaciones. Pruebas [HTTP](../src/modules/media/http/media-http.test.ts), [controlador](../src/modules/media/http/media.controller.test.ts) y [servicio](../src/modules/media/services/media-service.test.ts).

| Método | Sufijo | Contrato de éxito |
|---|---|---|
| GET | `/admin/catalog/products/:productId/images` | 200, lista administrativa |
| GET | `/admin/catalog/products/:productId/images/:imageId/content?w=…` | 200, WebP, `no-store`, ancho 320/800/1600 |
| POST | `/admin/catalog/products/:productId/images` | 201, multipart, `If-Match`, `Idempotency-Key`, límite 5 MiB |
| PUT | `/admin/catalog/products/:productId/images/order` | 200; `If-Match` y orden explícito |
| PUT | `/admin/catalog/products/:productId/images/:imageId` | 200; `If-Match` y texto alternativo |
| DELETE | `/admin/catalog/products/:productId/images/:imageId` | 200; `If-Match`, retiro |
| POST | `/admin/catalog/products/:productId/images/:imageId/restore` | 201; `If-Match`, restauración |
| GET | `/catalog/images/:imageId?w=…` | Público, 200 WebP publicado; mismo contrato de ancho/cache |

### Envíos y checkout experimental

La tienda conserva las rutas de estimación de envío. Las rutas de checkout de la tabla requieren opt-in explícito de desarrollo y conservan los controles de origen local, sesión y CSRF; únicamente registran pedidos de prueba sin pagos ni envíos.

| Método | Sufijo | Controlador → servicio | Éxito | Prueba |
|---|---|---|---|---|
| POST | `/shipping/destination` | [ShippingQuoteController](../src/modules/shipping/quotes/catalog-quote.ts) → [PostalCodeResolver](../src/modules/shipping/postal/postal-code-resolver.ts) | 200 | [postal](../src/modules/shipping/postal/postal-controller.test.ts) |
| POST | `/shipping/quote` | [ShippingQuoteController → ShippingQuoteService](../src/modules/shipping/quotes/catalog-quote.ts) | 200 | [cotización](../src/modules/shipping/quotes/catalog-quote.test.ts) |
| POST | `/checkout/session` | [SessionController → SessionService](../src/modules/checkout/sessions/session.ts) | 200; crea/reutiliza capacidad, no rota una válida | [sesión](../src/modules/checkout/sessions/session.test.ts) |
| POST | `/checkout/session/resume` | Mismo controlador/servicio | 200; recupera CSRF sin crear sesión | [sesión](../src/modules/checkout/sessions/session.test.ts) |
| POST | `/checkout/session/reset` | Mismo controlador/servicio | 200; descarta únicamente capacidad inválida | [sesión](../src/modules/checkout/sessions/session.test.ts) |
| POST | `/checkout/quotes` | [CheckoutQuoteController](../src/modules/checkout/http/checkout-quote.controller.ts) → [CheckoutQuoteService](../src/modules/checkout/services/quote.ts) | 200 | [cotización checkout](../src/modules/checkout/services/quote.test.ts) |
| POST | `/checkout/orders` | [CheckoutOrderController](../src/modules/checkout/http/checkout-order.controller.ts) → [OrdersService](../src/modules/orders/services/orders.service.ts) | 200; también en replay | [controlador](../src/modules/checkout/http/checkout-order.controller.test.ts) |
| POST | `/checkout/order-attempt` | Mismo controlador/servicio | 200; consulta por la misma clave, no crea orden | [pedidos](../src/modules/orders/services/orders.test.ts) |

Las tres operaciones de sesión se verifican en [session.test.ts](../src/modules/checkout/sessions/session.test.ts). Cotización/creación/consulta de intento requieren sesión y `X-CSRF-Token`; creación/consulta usan `Idempotency-Key`. Origen, host, JSON y headers de proxy se validan; no deben relajarse para admitir un formulario nuevo.

## Sesiones y estado que deben sobrevivir a la reorganización

| Estado | Contrato y ubicación actual |
|---|---|
| Sesión administrativa | Cookie `store_admin`, HttpOnly, SameSite Strict, Path `/`, Secure en producción; [http.ts](../src/modules/identity/http/http.ts) |
| Sesión checkout | Cookie `store_checkout`, HttpOnly, SameSite Strict, Path `/api/v1/checkout`, solo desarrollo local; `/checkout` no la recibe en SSR; [session.ts](../src/modules/checkout/sessions/session.ts) |
| CSRF administrativo | Memoria del cliente; emisión/rotación mediante API; nunca almacenamiento persistente; [session-core](../src/presentation/admin/client/session-core.ts) |
| Carrito | `storefront-cart-v1-api` y `storefront-cart-v1-demo`, con sufijo `:revision`; localStorage o fallback sessionStorage/memoria; lock `cart:<clave>`; [CartStore](../src/presentation/cart/client/state/cart-store.ts), [storage](../src/presentation/shared/cart/cart-storage.ts) |
| Destino sugerido | sessionStorage: `storefront-shipping-postal-code-v1-<modo>` y `storefront-shipping-destination-hint-v1-<modo>`; revalidar localidad; [ShippingSession](../src/presentation/shared/shipping/shipping-session.ts) |
| Pedido incierto | sessionStorage `checkout-local-pending-v1`; lock `checkout:session`; recuperar antes de reenviar; [CheckoutStore](../src/presentation/checkout/client/state/checkout-store.ts), [checkout-client](../src/presentation/shared/checkout/checkout-client.ts) |

## Cómo mantener el mapa

Cambiar una ruta implica actualizar su fila, enlaces, matriz de migración y prueba en la misma unidad. Mantener separado **contrato leído del código**, **prueba automatizada ejecutada** y **recorrido real verificado**. La [línea base](migration-baseline.md) registra evidencia; este índice no debe atribuir cobertura HTTP a una prueba unitaria que no la tiene.
