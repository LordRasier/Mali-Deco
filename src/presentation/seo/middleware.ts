import { randomBytes } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SiteSettings } from '../../modules/settings/site-settings';
import { pageMetadata, publicCsp, SEO_ENV, type SeoEnvironment } from './metadata';
import type { StoreInformation } from '../information/store-information';

/** Enrich only explicitly rendered public views; API and admin responses keep their boundaries. */
export function configureSeo(app: NestExpressApplication) {
  const settings = app.get(SiteSettings), env = app.get<SeoEnvironment>(SEO_ENV);
  app.use((request: { originalUrl: string; method: string }, response: {
    locals: Record<string, unknown>; statusCode: number;
    setHeader(name: string, value: string): unknown;
    render(view: string, model: Record<string, unknown>, callback?: (error: Error | null, html: string) => void): unknown;
  }, next: (error?: unknown) => void) => {
    const render = response.render.bind(response);
    response.render = (view, model, callback) => {
      if (model.visualPreview === true || !['home', 'catalog', 'product', 'information-page', 'shipping-returns'].includes(view)) return render(view, model, callback);
      void settings.publicSettings().then(config => {
        const url = new URL(request.originalUrl, 'https://local.invalid');
        const seo = pageMetadata(view, { ...response.locals, ...model }, url.pathname, url.searchParams, response.statusCode, config, env, response.locals.storeInfo as StoreInformation | undefined);
        const nonce = randomBytes(18).toString('base64');
        response.setHeader('Content-Security-Policy', publicCsp(nonce, !!seo.analyticsId));
        response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        if (seo.noindex) response.setHeader('X-Robots-Tag', seo.robots);
        render(view, { ...model, seo: { ...seo, nonce, trackingPath: url.pathname } }, callback);
      }).catch(error => callback ? callback(error, '') : next(error));
      return response;
    };
    next();
  });
}
