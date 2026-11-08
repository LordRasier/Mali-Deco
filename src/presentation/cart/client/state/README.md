# Estado independiente del renderizador

[Volver al carrito](../README.md)

| Archivo | Responsabilidad |
|---|---|
| [cart-store.ts](cart-store.ts) | Ciclo de vida, mutaciones, coordinación y descarte de respuestas obsoletas |
| [cart-runtime.ts](cart-runtime.ts) | Única frontera con eventos, storage y Web Locks del navegador |
| [cart-snapshot.ts](cart-snapshot.ts) | Proyección para la vista, subtotales exactos por moneda y estado de verificación |

Crear el store no hace I/O. Suscribirse con `subscribe`, iniciar después del montaje con `start` y llamar su limpieza al desmontar. Una instancia no admite dos propietarios activos. `getSnapshot` devuelve una referencia estable hasta una publicación; `getServerSnapshot` es vacío y estable para SSR. Tratar snapshots como datos de solo lectura. Las acciones son asíncronas; la UI obtiene el resultado del snapshot, no de una escritura optimista.

El adaptador público usa únicamente `storefront-cart-v1-api`. El sufijo conserva los carritos reales existentes; el antiguo `storefront-cart-v1-demo` no se importa ni se borra. No hay singleton compartido en el servidor. El adaptador DOM se suscribe directamente y conserva un único propietario. Las pruebas pueden inyectar resolvers sintéticos, pero no habilitan otro origen público.

## Invariantes

- Releer dentro del bloqueo antes de mutar. Los [Web Locks](https://www.w3.org/TR/web-locks/) coordinan participantes del mismo origen; no garantizan cooperación de código ajeno.
- Conservar formato de arrays, sufijo `:revision`, lock `cart:<key>` y evento `storefront-cart-changed` de [cart-storage.ts](../../../shared/cart/cart-storage.ts).
- Una copia de sesión existente, incluso vacía, tiene prioridad. Sin locks no se escribe storage local compartido. Si falla storage, conservar las líneas en memoria e informar la limitación; memoria no sobrevive una navegación completa ni sincroniza instancias.
- No podar contra el listado visible. El [resolver](../../../shared/cart/cart-resolution.ts) valida la partición completa de todos los lotes; un error no autoriza eliminaciones.
- Antes de adoptar o podar, verificar generación del montaje, revisión del carrito, aborto y versión persistida. Repetir la comprobación dentro del lock. Reagregar una línea idéntica invalida una respuesta vieja.
- Una notificación puede desmontar/reiniciar el propietario sincrónicamente. Comprobar vigencia después de publicar y antes de lanzar trabajo nuevo.
- Mantener subtotales `bigint` por moneda; precios cacheados no ocultan una resolución fallida.

## Verificación

Desde la raíz, ejecutar `node --import tsx --test tests/client/cart-store.check.ts`. La suite general también lo ejecuta mediante [cart-store.test.mjs](../../../../../tests/client/cart-store.test.mjs). Los [casos deterministas](../../../../../tests/client/cart-store.check.ts) no acceden a red ni storage real. Las pruebas controladas no demuestran comportamiento real de foco, layout ni BFCache; eso exige verificación de navegador.
