import type { NestExpressApplication } from '@nestjs/platform-express';
import { PaymentSettings } from '../../modules/payments/payment-settings';
import { MVC_CART_MODE } from '../cart/cart-mode';

const storefrontViews = new Set(['home', 'catalog', 'product', 'information-page', 'shipping-returns', 'cart', 'checkout', 'tracking']);

/** Resolve shared cart/footer availability at render time, after each page's legacy local-test flags. */
export function configureCheckoutPresentation(app: NestExpressApplication): void {
  const payments = app.get(PaymentSettings), mode = app.get<'api' | 'demo'>(MVC_CART_MODE);
  app.use((_request: unknown, response: {
    render(view: string, model: Record<string, unknown>, callback?: (error: Error | null, html: string) => void): unknown;
  }, next: (error?: unknown) => void) => {
    const render = response.render.bind(response);
    response.render = (view, model, callback) => {
      if (!storefrontViews.has(view)) return render(view, model, callback);
      void (async () => {
        const state = mode === 'api' && model.demo !== true ? await payments.get().catch(() => undefined) : undefined;
        const checkoutEnabled = !!state?.available && state.enabled && state.mode === 'production';
        // Presentation only: CheckoutAccess still authorizes every new order/payment independently.
        render(view, { ...model, checkoutEnabled }, callback);
      })().catch(error => callback ? callback(error, '') : next(error));
      return response;
    };
    next();
  });
}
