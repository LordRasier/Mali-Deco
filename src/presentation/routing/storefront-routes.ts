export const STOREFRONT_ROUTES = Symbol('STOREFRONT_ROUTES');
export type StorefrontRoutes = Readonly<{ home: string; catalog: string; product: string; cart: string }>;
export const canonicalRoutes: StorefrontRoutes = Object.freeze({ home: '/', catalog: '/catalogo', product: '/productos', cart: '/carrito' });
export function storefrontRoutes(): StorefrontRoutes { return canonicalRoutes; }
