# Tienda · NestJS MVC

Una aplicación NestJS sirve páginas Handlebars, archivos públicos y API JSON. Un manifiesto, un proceso y un origen; sin Next, React ni workspaces. Incluye catálogo, administración, medios, carrito y pedidos locales de prueba. **No está habilitada para ventas reales.**

## Empezar

Requiere Node.js 24 o posterior. Desde la raíz:

```sh
npm ci
npm run dev
```

Abrir `http://127.0.0.1:3000`. Para desarrollo, copiar [.env.example](.env.example) a `.env` y completar una base autorizada: `npm run dev` lo lee antes de registrar la conexión. Las variables exportadas tienen prioridad; `npm start`, las pruebas y producción no leen este archivo. Si se modifica `.env`, reiniciar `npm run dev`. No guardar credenciales en Git. La tienda usa únicamente el catálogo de la base configurada. `STOREFRONT_MODE` está retirado: una variable antigua no reactiva datos de ejemplo. Sin base, las páginas dependientes del catálogo informan indisponibilidad, no muestran un catálogo ficticio.

El carrito conserva su clave `storefront-cart-v1-api` para mantener los artículos reales ya guardados. No importa ni borra el antiguo carrito de demostración. Los dobles de prueba se inyectan desde las pruebas y no habilitan otro modo público.

El paso a checkout queda pausado con `LOCAL_TEST_CHECKOUT_ENABLED=false`. Se puede navegar y usar el carrito, pero no continuar a comprar ni crear pedidos/pagos mediante las rutas de checkout. El mismo bloqueo se aplica al acceso directo a `/checkout`. Al cambiar esta variable, reiniciar el proceso. La configuración de ejemplo conserva también Mercado Pago y los correos desactivados.

Artefacto: `npm run build` y `npm start`. Nest escucha únicamente en `127.0.0.1`. Conservar el puerto/origen del navegador anterior evita cambiar el ámbito del almacenamiento y las cookies; no iniciar dos servidores sobre ese puerto.

## Encontrar una funcionalidad

1. Buscar la URL en el [mapa de rutas](docs/routes.md).
2. Entrar en [presentación](src/presentation/README.md): controlador → modelo de página → plantilla → cliente opcional de esa funcionalidad.
3. Seguir las reglas de negocio en [módulos](src/modules/README.md), no en las vistas.

[Mapa del código](src/README.md) · [Documentación](docs/README.md) · [Estado y límites](docs/estado-del-desarrollo.md) · [Cierre del rework](docs/rework-completion.md).

## Comprobar

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run check:local-shipping
```

Las pruebas ordinarias usan servicios sintéticos, no una base ni proveedores. La [integración MariaDB](docs/mariadb-local.md) y el [arnés de checkout](docs/checkout-browser-e2e.md) son opt-in separados: requieren autorización y una base de prueba exclusiva. No se ejecutan durante el build.

## Límites importantes

- Sin `DB_HOST`, desarrollo inicia sin persistencia y las lecturas reales fallan explícitamente. En producción la falta de base impide arrancar. TypeORM conserva `synchronize: false`; no ejecutar migraciones sobre datos existentes sin un plan revisado.
- Sesiones opacas HttpOnly, roles y CSRF siguen en la API. La navegación no sustituye autorización: [administración local](docs/admin-local.md).
- Por defecto la tienda funciona como catálogo con pedidos por Instagram. Solo con `NODE_ENV=development` y `LOCAL_TEST_CHECKOUT_ENABLED=true` se habilitan el checkout y los pedidos locales de prueba. Mercado Pago está desactivado por defecto; existe una [integración opcional exclusivamente de prueba](src/modules/payments/README.md), pendiente de configuración y comprobación externa autorizada. No hay cobros reales ni creación de envíos. En producción las rutas de checkout siguen ausentes. Ver [límites y prueba local](docs/checkout-local.md).
- Marca desde ajustes persistidos; no hay multitenencia. Imágenes con procesamiento y límites: [medios](docs/product-media-development.md).
- Se conserva el override `multer: 2.5.0`; una prueba verifica la versión resuelta por Nest. No se actualizaron dependencias durante la reorganización.
- Los emails de compra, despacho y entrega usan una cola transaccional y EnvíaloSimple; requieren configuración y validación real antes de activarlos. Ver [emails de pedidos](src/modules/order-emails/README.md).

## Preparar la subida

Conservar `src/`, `tests/`, `scripts/`, `resources/`, `docs/`, `tasks/`, el lockfile y las configuraciones versionables. `.env.example` contiene únicamente ejemplos y servicios desactivados. `.env`, `.env.mercadopago.local`, `envialosimple`, `.local-tools/`, `artifacts/`, `.atl/`, `node_modules/` y los archivos compilados quedan fuera de Git. Las evidencias locales se conservan en disco.

Ejecutar los controles de la sección «Comprobar» antes de publicar. Consultar `git remote -v` y usar el repositorio remoto correcto: un `origin` que apunta a otra carpeta del equipo no es un destino de GitHub. Las credenciales y la base de datos se configuran por separado en el servidor; no se suben al repositorio.
