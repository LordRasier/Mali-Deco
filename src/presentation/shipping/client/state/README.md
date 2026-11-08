# Ciclo de vida y presentación de envíos

[Volver a envíos](../README.md)

- [shipping-runtime.ts](shipping-runtime.ts): crear un ciclo de vida por sesión; iniciar en el montaje y ejecutar su limpieza al suspender. Se puede reanudar el mismo propietario sin rehidratar un código postal viejo sobre memoria más reciente. Crear el ciclo no toca el navegador y es seguro durante SSR.
- [shipping-presentation.ts](shipping-presentation.ts): identidad de carrito, coherencia, estado visible y totales. No muta la sesión ni selecciona una sucursal.
- [shipping-session.ts](../../../shared/shipping/shipping-session.ts): debounce, lookup, cotización, aborto, selección y vencimiento. Disponerlo bloquea trabajo nuevo hasta `activate`; la generación impide que una publicación del ciclo anterior arranque nuevas solicitudes al reanudar.

Se conservan las claves de sesión `storefront-shipping-postal-code-v1-<mode>` y `storefront-shipping-destination-hint-v1-<mode>`. Se persiste únicamente código y pista de localidad: nunca cotizaciones, precios, CSRF o cookies. La pista solo se acepta si una consulta nueva contiene exactamente su ID.

La identidad incluye modo, pares/cantidades ordenados, estado de resolución y totales exactos ordenados por moneda. Una actualización de cantidad/precio invalida la cotización; una revalidación del mismo carrito no extiende su vencimiento. No combinar monedas ni presentar estimaciones vencidas/incoherentes como total.

Pruebas: [ciclo de vida](../../../../../tests/client/shipping-runtime.check.ts), [proyección](../../../../../tests/client/shipping-panel.check.ts) y [regresiones existentes de sesión](../../../../../tests/client/shipping-session.check.ts). Se ejecutan desde `npm run test:client`; los dos primeros también con `node --import tsx --test tests/client/shipping-runtime.check.ts tests/client/shipping-panel.check.ts` desde la raíz.
