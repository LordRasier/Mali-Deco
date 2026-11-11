import type { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';

const groups = [
  { prefix: '/assets/storefront', roots: ['cart/public', 'catalog/public', 'products/public', 'home/public', 'shell/public', 'information/public', 'seo/public'],
    files: ['cart.css', 'catalog.css', 'product.css', 'home.css', 'landing.css', 'shell.css', 'information.css', 'analytics.css', 'generated/cart.js', 'generated/analytics.js',
      'fonts/figtree-variable.woff2', 'fonts/dm-mono-regular.woff2', 'fonts/dm-mono-medium.woff2', 'fonts/OFL-Figtree.txt', 'fonts/OFL-DMMono.txt',
      ...['catalog.css', 'manrope-latin-variable.woff2', 'nunito-sans-latin-variable.woff2', 'outfit-latin-variable.woff2', 'lora-latin-variable.woff2',
        'libre-baskerville-latin-variable.woff2', 'cormorant-garamond-latin-variable.woff2', 'bitter-latin-variable.woff2',
        'ibm-plex-mono-latin-400.woff2', 'ibm-plex-mono-latin-500.woff2', 'ibm-plex-mono-latin-600.woff2', 'ibm-plex-mono-latin-700.woff2',
        'OFL-Manrope.txt', 'OFL-NunitoSans.txt', 'OFL-Outfit.txt', 'OFL-Lora.txt', 'OFL-LibreBaskerville.txt', 'OFL-CormorantGaramond.txt', 'OFL-Bitter.txt', 'OFL-IBMPlexMono.txt'].map(file => `fonts/${file}`)] },
  { prefix: '/assets/admin', roots: ['admin/public'], files: ['admin.css', 'generated/admin.js', 'generated/admin.css', 'content-preview.css'] },
  { prefix: '/assets/checkout', roots: ['checkout/public'], files: ['checkout.css'] },
  { prefix: '/storefront', roots: ['home/public/generated/storefront'],
    files: ['florero-ondas.webp', 'hero-3d-objects-960.webp', 'hero-3d-objects.webp', 'maceta-geometrica.webp', 'organizador-arco.webp'] },
] as const;

/** Fixed URL/file allowlists precede ordinary static serving; neighboring files never become public implicitly. */
export function configureStaticAssets(app: NestExpressApplication): void {
  for (const group of groups) {
    const allowed = new Set(group.files.map(file => `/${file}`));
    app.use(group.prefix, (request: { method: string; path: string }, response: { status(code: number): { end(): void } }, next: () => void) => {
      if (!['GET', 'HEAD'].includes(request.method) || !allowed.has(request.path)) { response.status(404).end(); return; }
      next();
    });
    for (const root of group.roots) app.useStaticAssets(join(__dirname, root), {
      prefix: `${group.prefix}/`, index: false, redirect: false, dotfiles: 'deny', etag: true, lastModified: true,
      setHeaders(response) { response.setHeader('Cache-Control', group.prefix === '/assets/admin' || group.prefix === '/assets/checkout' ? 'no-store' : 'public, max-age=0, must-revalidate'); response.setHeader('X-Content-Type-Options', 'nosniff'); },
    });
  }
}
