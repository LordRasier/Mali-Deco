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

// Taxonomía sintética exclusiva de la vista demo; no describe inventario real.
const demoCategories = [
  { id: 'deco', slug: 'decoracion', name: 'Decoración (ejemplo)', sortOrder: 1 },
  { id: 'orden', slug: 'organizacion', name: 'Organización (ejemplo)', sortOrder: 2 },
  { id: 'plantas', slug: 'plantas', name: 'Plantas (ejemplo)', sortOrder: 3 },
];
const demoMaterial = { id: 'pla', slug: 'pla-ejemplo', name: 'PLA (ejemplo)', sortOrder: 1 };
const demoColorNames: Record<string, string> = { azul: 'Azul', coral: 'Coral', arena: 'Arena', crema: 'Crema', amarillo: 'Amarillo', negro: 'Negro', verde: 'Verde' };
for (const [index, product] of demoCatalog.products.entries()) {
  product.category = demoCategories[index];
  for (const variant of product.variants) {
    variant.material = demoMaterial;
    variant.colorInfo = { id: variant.id, slug: variant.id, name: `${demoColorNames[variant.id]} (ejemplo)`, hex: variant.color ?? null };
  }
}
