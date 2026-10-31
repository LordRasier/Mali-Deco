export function ShippingEstimate() {
  return <section className="shipping-estimate" aria-labelledby="shipping-title">
    <h2 id="shipping-title">Envío</h2>
    <p id="shipping-help">Cálculo de envío todavía no disponible.</p>
    <label htmlFor="shipping-postcode">Código postal</label>
    <div className="shipping-controls"><input id="shipping-postcode" name="postalCode" autoComplete="postal-code" aria-describedby="shipping-help" /><button type="button" disabled>Calcular envío</button></div>
    <p className="fine-print">El costo de envío está pendiente de cálculo.</p>
  </section>;
}
