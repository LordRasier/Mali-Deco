export default function ProductNotFound() {
  return (
    <main className="product-not-found section-wrap">
      <p className="eyebrow">404 · OBJETO NO ENCONTRADO</p>
      <h1>No encontramos este producto.</h1>
      <p>Puede que ya no esté disponible o que el enlace haya cambiado.</p>
      <a className="button primary" href="/catalogo">Explorar el catálogo <span aria-hidden="true">↗</span></a>
    </main>
  );
}
