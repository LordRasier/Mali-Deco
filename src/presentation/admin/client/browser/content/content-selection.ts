/** Virtual selections describe UI groups and existing editors; they never enter the saved content. */
export const contentGroups: Record<string, { label: string; fields: string[] }> = {
  'blocks.header': { label: 'Encabezado', fields: ['copy.catalog.headerLink', 'features.catalog', 'features.cart'] },
  'blocks.home.hero': { label: 'Banner principal', fields: ['eyebrow', 'title', 'titleAccent', 'description', 'action', 'note'].map(key => `copy.home.${key}`) },
  'blocks.home.collection': { label: 'Productos destacados', fields: ['collectionEyebrow', 'collectionTitle', 'collectionAction', 'empty'].map(key => `copy.home.${key}`) },
  'blocks.home.about': { label: 'Presentación de la marca', fields: ['features.homeAbout', ...['aboutEyebrow', 'aboutTitle', 'aboutDescription', 'aboutCaption', 'aboutAlt', 'aboutSignature'].map(key => `copy.home.${key}`)] },
  'blocks.information.help': { label: 'Ayuda y contacto', fields: ['helpEyebrow', 'helpTitle', 'helpDescription', 'contactAction'].map(key => `copy.information.${key}`) },
  'blocks.information.legal': { label: 'Datos legales de la tienda', fields: ['contact.legalName', 'contact.taxId', 'contact.legalAddress', 'contact.dataFiscalUrl', 'copy.information.legalEyebrow', 'copy.information.legalTitle'] },
  'listing': { label: 'Diseño del listado', fields: ['columns', 'pageSize', 'categoriesEnabled', 'filtersEnabled', 'countEnabled'].map(key => `listing.${key}`) },
  'blocks.listing.cards': { label: 'Tarjetas de producto', fields: ['cardCategoryEnabled', 'cardDescriptionEnabled', 'cardPriceEnabled', 'moreLabel'].map(key => `listing.${key}`) },
  'blocks.listing.labels': { label: 'Textos del listado', fields: ['itemSingular', 'itemPlural', 'allCategoriesLabel'].map(key => `listing.${key}`) },
};

const imageSource = (label: string, section: string) => ({ label, description: `Cambiá esta imagen en Configuración → Imágenes → ${section}.`, href: '#settings', action: 'Abrir configuración de imágenes' });
export const contentSources: Record<string, { label: string; description: string; href: string; action: string }> = {
  'source.brand': { label: 'Marca de la tienda', description: 'El nombre y el color se editan en Configuración → Identidad.', href: '#settings', action: 'Abrir configuración de marca' },
  'source.logo': imageSource('Logo de la tienda', 'Logo de la tienda'),
  'source.hero': imageSource('Imagen del banner', 'Banner principal'),
  'source.about': imageSource('Imagen de presentación', 'Imagen de la sección inferior'),
  'source.social': { label: 'Redes de la tienda', description: 'El número de WhatsApp y el perfil de Instagram se editan en Configuración → Redes y contacto.', href: '#settings', action: 'Abrir redes y contacto' },
  'source.products': { label: 'Producto del catálogo', description: 'El nombre, las imágenes, la descripción, el precio y el stock se editan en Productos.', href: '#products', action: 'Abrir productos' },
  'source.categories': { label: 'Categorías del catálogo', description: 'Los nombres y el orden de las categorías se editan en Clasificaciones.', href: '#classifications', action: 'Abrir clasificaciones' },
};

export function contentSource(path: string) {
  if (/^source\.products\.\d+$/.test(path)) return contentSources['source.products'];
  return Object.hasOwn(contentSources, path) ? contentSources[path] : undefined;
}

export function isContentSelection(path: string, read: (path: string) => unknown) {
  return Object.hasOwn(contentGroups, path) || !!contentSource(path) || read(path) !== undefined;
}

export function contentParent(path: string): string | undefined {
  if (path.startsWith('landing.')) return path.match(/^(landing\.blocks\.\d+(?:\.columns\.\d+\.blocks\.\d+)*)(?:\.|$)/)?.[1];
  const group = Object.entries(contentGroups).find(([, value]) => value.fields.includes(path));
  if (group) return group[0];
  if (path.startsWith('copy.catalog.')) return 'copy.catalog';
  if (path.startsWith('copy.information.')) return 'copy.information';
  const item = path.match(/^(pages\.[^.]+\.sections\.\d+|footer\.(?:benefits|columns)\.\d+)(?:\.|$)/)?.[1];
  if (item && item !== path) return item;
  if (/^pages\.[^.]+\.[^.]+$/.test(path)) return path.split('.').slice(0, 2).join('.');
  if (path.startsWith('footer.') && path !== 'footer') return 'footer';
  if (path.startsWith('contact.')) return 'contact';
  return undefined;
}
