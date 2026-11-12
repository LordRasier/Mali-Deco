import { appearanceColor } from './store-appearance';
/** Shared, versioned page composition. No database or browser dependencies. */
export const blockDefinitions = {
  hero: { label: 'Banner principal', hint: 'Imagen, título y llamada a la acción', props: { eyebrow: '', title: 'Tu próxima historia empieza acá', accent: '', description: '', action: 'Ver productos', href: '/catalogo', image: '', mobileImage: '', alt: '', note: '' } },
  categories: { label: 'Categorías', hint: 'Accesos a categorías del catálogo', props: { title: 'Explorá por categoría', description: '', categoryIds: [] as string[], cardStyle: 'icons', textPosition: 'below', columns: 4, mobileColumns: 2 } },
  products: { label: 'Productos destacados', hint: 'Selección propia o productos de una categoría', props: { eyebrow: '', title: 'Productos destacados', action: 'Ver todos', href: '/catalogo', mode: 'category', productIds: [] as string[], category: '', limit: 3, columns: 3, mobileColumns: 1, empty: 'Todavía no hay productos publicados.' } },
  promotion: { label: 'Publicidad / promoción', hint: 'Una imagen con enlace y texto opcional', props: { title: '', description: '', action: '', href: '/catalogo', image: '', mobileImage: '', alt: 'Promoción' } },
  'text-image': { label: 'Imagen y texto', hint: 'Presentá tu marca o una colección', props: { eyebrow: '', title: 'Una historia para compartir', description: '', image: '', mobileImage: '', alt: '', caption: '', note: '', action: '', href: '' } },
  container: { label: 'Contenedor', hint: 'Combiná bloques en columnas', props: { title: '' } },
} as const;
export type BlockType = keyof typeof blockDefinitions;
export const blockStyleChoices = { width: ['contained', 'full'], spacing: ['none', 'small', 'medium', 'large'], theme: ['inherit', 'light', 'muted', 'brand', 'dark'], align: ['left', 'center', 'right'], radius: ['none', 'soft', 'round'] } as const;
export type BlockStyle = { -readonly [K in keyof typeof blockStyleChoices]: (typeof blockStyleChoices)[K][number] } & { backgroundColor: string | null; textColor: string | null };
export type LandingBlock = { id: string; type: BlockType; enabled: boolean; style: BlockStyle; props: Record<string, string | number | string[]>; columns: { id: string; blocks: LandingBlock[] }[] };
export type LandingLayout = { version: 1; blocks: LandingBlock[] };
export const newBlock = (type: BlockType, id: string): LandingBlock => ({ id, type, enabled: true,
  style: { width: 'contained', spacing: 'medium', theme: 'inherit', align: 'left', radius: 'none', backgroundColor: null, textColor: null },
  props: structuredClone(blockDefinitions[type].props), columns: type === 'container' ? [{ id: id + '-a', blocks: [] }, { id: id + '-b', blocks: [] }] : [] });

export function legacyLanding(home: Record<string, string>, aboutEnabled: boolean): LandingLayout {
  const hero = newBlock('hero', 'home-hero'), products = newBlock('products', 'home-collection'), about = newBlock('text-image', 'home-about');
  Object.assign(hero.props, { eyebrow: home.eyebrow, title: home.title, accent: home.titleAccent, description: home.description, action: home.action, note: home.note, image: '/api/v1/catalog/branding/hero' });
  hero.style.width = 'full'; hero.style.spacing = 'none';
  Object.assign(products.props, { eyebrow: home.collectionEyebrow, title: home.collectionTitle, action: home.collectionAction, empty: home.empty });
  Object.assign(about.props, { eyebrow: home.aboutEyebrow, title: home.aboutTitle, description: home.aboutDescription, image: '/api/v1/catalog/branding/about', alt: home.aboutAlt, caption: home.aboutCaption, note: home.aboutSignature });
  about.enabled = aboutEnabled;
  about.style.radius = 'soft';
  return { version: 1, blocks: [hero, products, about] };
}

export function flattenBlocks(layout: LandingLayout): LandingBlock[] {
  return layout.blocks.flatMap(function visit(block): LandingBlock[] { return [block, ...block.columns.flatMap(column => column.blocks.flatMap(visit))]; });
}
export function landingHref(value: string): boolean {
  if (value === '' || /^\/(?!\/)[a-zA-Z0-9/_?=&%#.-]*$/.test(value) && !/^\/(api|admin)(\/|$)/i.test(value)) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
export function landingImage(value: string): boolean {
  return value === '' || /^\/api\/v1\/catalog\/(?:branding\/(?:hero|about)|content-media\/[0-9a-f-]{36})$/.test(value);
}

export function parseLanding(value: unknown): LandingLayout {
  const fail = (message: string): never => { throw Error('Constructor: ' + message); };
  const record = (v: unknown, keys: string[]) => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) fail('estructura inválida.');
    return v as Record<string, unknown>;
  };
  const input = record(value, ['version', 'blocks']); if (input.version !== 1) fail('versión no admitida.');
  const ids = new Set<string>(); let total = 0, cards = 0;
  const identity = (v: unknown) => { if (typeof v !== 'string' || v === 'root' || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/.test(v) || ids.has(v)) fail('identificador duplicado o inválido.'); ids.add(v as string); };
  const walk = (list: unknown, depth: number): LandingBlock[] => {
    if (!Array.isArray(list) || depth > 3 || list.length > 40) return fail('máximo 40 bloques y 3 niveles de contenedores.');
    return list.map(value => {
      if (++total > 40) fail('máximo 40 bloques por página.');
      const b = record(value, ['id', 'type', 'enabled', 'style', 'props', 'columns']); identity(b.id);
      if (typeof b.type !== 'string' || !Object.hasOwn(blockDefinitions, b.type) || typeof b.enabled !== 'boolean') fail('tipo de bloque inválido.');
      const type = b.type as BlockType, style = record(b.style, [...Object.keys(blockStyleChoices), 'backgroundColor', 'textColor']);
      for (const [key, choices] of Object.entries(blockStyleChoices)) if (!(choices as readonly unknown[]).includes(style[key])) fail('estilo inválido.');
      const colors = { backgroundColor: appearanceColor(style.backgroundColor), textColor: appearanceColor(style.textColor) };
      const defaults = blockDefinitions[type].props, props = record(b.props, Object.keys(defaults));
      for (const [key, example] of Object.entries(defaults)) {
        const field = props[key];
        if (Array.isArray(example)) {
          if (!Array.isArray(field) || field.length > 24 || new Set(field).size !== field.length || field.some(v => typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(v))) fail('selección inválida.');
        } else if (typeof example === 'number') {
          const max = key === 'limit' ? 24 : key === 'mobileColumns' ? 2 : 4;
          if (!Number.isSafeInteger(field) || Number(field) < 1 || Number(field) > max) fail('cantidad inválida.');
        } else {
          if (typeof field !== 'string' || field.length > 3000 || /[<>\p{Cs}\p{Cc}]/u.test(field.replace(/[\r\n\t]/g, ''))) fail('texto inválido.');
          if (key === 'href' && !landingHref(field as string) || ['image', 'mobileImage'].includes(key) && !landingImage(field as string)) fail('enlace o imagen inválidos.');
          if (key === 'mode' && !['manual', 'category', 'featured'].includes(field as string)) fail('origen de productos inválido.');
          if (key === 'cardStyle' && !['icons', 'photo', 'circles'].includes(field as string)) fail('diseño de categorías inválido.');
          if (key === 'textPosition' && !['below', 'center'].includes(field as string)) fail('posición de texto inválida.');
          if (key === 'category' && field !== '' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(field as string)) fail('categoría inválida.');
        }
      }
      if (!Array.isArray(b.columns) || (type === 'container' ? b.columns.length < 1 || b.columns.length > 3 : b.columns.length !== 0)) fail('columnas inválidas.');
      if (type === 'products' && (cards += Number(props.limit)) > 96) fail('máximo 96 tarjetas de producto entre todos los bloques.');
      const columns = (b.columns as unknown[]).map(v => { const c = record(v, ['id', 'blocks']); identity(c.id); return { id: c.id as string, blocks: walk(c.blocks, depth + 1) }; });
      return { id: b.id as string, type, enabled: b.enabled as boolean, style: { ...style, ...colors } as BlockStyle, props: structuredClone(props) as LandingBlock['props'], columns };
    });
  };
  return { version: 1, blocks: walk(input.blocks, 0) };
}
