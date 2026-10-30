import type { StorefrontData } from './storefront-types';
// Imágenes generadas y precios ilustrativos: no representan productos publicados.
export const demoCatalog: StorefrontData = {
  brand: 'TU MARCA', heroImage: '/storefront/hero-3d-objects.webp', mode: 'demo', products: [
    { id: 'ondas', slug: 'florero-ondas', name: 'Florero Ondas', description: 'Una silueta fluida que lleva movimiento y textura a cada rincón.', image: '/storefront/florero-ondas.webp', variants: [
      { id: 'azul', name: 'Azul cobalto', color: '#073cce', priceMinor: 2450000, currency: 'ARS' }, { id: 'coral', name: 'Coral', color: '#fa796b', priceMinor: 2450000, currency: 'ARS' }, { id: 'arena', name: 'Arena', color: '#d9cbbc', priceMinor: 2450000, currency: 'ARS' }
    ] },
    { id: 'arco', slug: 'organizador-arco', name: 'Organizador Arco', description: 'Un pequeño gesto de diseño para ordenar lo cotidiano.', image: '/storefront/organizador-arco.webp', variants: [
      { id: 'crema', name: 'Crema', color: '#fbf6ed', priceMinor: 1890000, currency: 'ARS' }, { id: 'amarillo', name: 'Amarillo', color: '#ffc438', priceMinor: 1890000, currency: 'ARS' }, { id: 'negro', name: 'Negro', color: '#26262a', priceMinor: 1890000, currency: 'ARS' }
    ] },
    { id: 'espiral', slug: 'maceta-espiral', name: 'Maceta Espiral', description: 'Color y geometría para darle un lugar especial a tus plantas.', image: '/storefront/maceta-geometrica.webp', variants: [
      { id: 'coral', name: 'Coral', color: '#fa796b', priceMinor: 2190000, currency: 'ARS' }, { id: 'verde', name: 'Verde', color: '#4f7743', priceMinor: 2190000, currency: 'ARS' }, { id: 'crema', name: 'Crema', color: '#fbf6ed', priceMinor: 2190000, currency: 'ARS' }
    ] }
  ]
};
