# Cliente de envíos

[Volver a presentación](../../README.md) · [Carrito](../../cart/client/README.md)

[ShippingSession](../../shared/shipping/shipping-session.ts) es el único propietario del destino y la cotización. [Estado y ciclo de vida](state/README.md) separa persistencia de navegador y proyección; el [adaptador DOM](browser/README.md) conecta los controles de la plantilla.

Las solicitudes siguen siendo JSON de mismo origen hacia `/api/v1/shipping/destination` y `/api/v1/shipping/quote`. Demo no solicita cotizaciones. Las guardas y los opt-ins del servidor no se amplían; no se habilitan proveedores desde la UI.
