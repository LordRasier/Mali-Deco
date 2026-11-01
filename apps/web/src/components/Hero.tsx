import { Icon } from './Icons';

export function Hero({ image }: { image?: string }) {
  const heroImage = image ?? '/storefront/hero-3d-objects.webp';
  return (
    <>
      <section className="hero" id="inicio">
        <div className="hero-picture" aria-hidden="true">
          <img src={heroImage} srcSet={heroImage === '/storefront/hero-3d-objects.webp' ? '/storefront/hero-3d-objects-960.webp 960w, /storefront/hero-3d-objects.webp 1774w' : undefined} sizes="100vw" alt="" fetchPriority="high" decoding="async" />
        </div>
        <div className="hero-copy">
          <h1>Objetos que<br />salen de lo común.</h1>
          <p>Diseño e impresión 3D para darle<br className="desktop-break" /> otra forma a tus espacios.</p>
          <div className="hero-links">
            <a className="button primary" href="/catalogo">Explorar objetos <Icon name="arrow" /></a>
            <a className="text-link" href="#coleccion">Ver colección</a>
          </div>
        </div>
      </section>
      <div className="ticker" aria-hidden="true">DISEÑO <span>·</span> COLOR <span>·</span> TEXTURA <span>·</span> IMPRESIÓN 3D</div>
    </>
  );
}
