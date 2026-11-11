import { defaultContentConfig, targetPaths, type ContentConfig } from './content-config';
import { legacyLanding, parseLanding } from '../../shared/landing-layout';
import { parseAppearance } from '../../shared/store-appearance';

export const contentArrayItems: Record<string, unknown> = {
  sections: { id: 'seccion', title: 'Nueva sección', paragraphs: [], questions: [], links: [] },
  paragraphs: '', questions: { question: '', answer: '' }, links: { href: '/', label: '' },
  benefits: { enabled: true, icon: 'box', title: '', description: '' },
  columns: { title: '', enabled: true, links: [] },
};
export function normalizeSections(config: ContentConfig): ContentConfig {
  for (const page of Object.values(config.pages)) page.sections = page.sections.map(s => ({ ...s, paragraphs: s.paragraphs ?? [], questions: s.questions ?? [], links: s.links ?? [] }));
  return config;
}
const fail = (path: string): never => { throw Error(`Revisá el campo «${path}».`); };
export function safeContentHref(value: string): boolean {
  if (/^#[a-z][a-z0-9-]*$/.test(value)) return true;
  if (/^\/(?!\/)[a-z0-9/#%-]*$/.test(value) && !/^\/(api|admin)(\/|$)/.test(value)) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
/** Exact schema, bounded plain text and safe destinations. HTML is never accepted or rendered. */
export function parseContentConfig(value: unknown): ContentConfig {
  if (JSON.stringify(value)?.length > 80000) throw Error('El contenido supera el límite de 80.000 caracteres.');
  const defaults = normalizeSections(defaultContentConfig());
  function visit(input: unknown, example: unknown, path: string): unknown {
    if (path === 'landing') return parseLanding(input);
    if (path === 'appearance') return parseAppearance(input);
    if (typeof example === 'boolean') return typeof input === 'boolean' ? input : fail(path);
    if (typeof example === 'string' || example === null) {
      if (example === null && input === null) return null;
      if (typeof input !== 'string' || input.length > 6000 || /[<>\p{Cs}\p{Cc}]/u.test(input.replace(/[\r\n\t]/g, ''))) return fail(path);
      const text = input.trim();
      if (path === 'listing.columns' && !['2', '3', '4'].includes(text)) return fail(path);
      if (path === 'listing.pageSize' && !['12', '24', '36', '48'].includes(text)) return fail(path);
      if (path.endsWith('.href') && !safeContentHref(text)) return fail(path);
      if (path.endsWith('.target') && !Object.hasOwn(targetPaths, text)) return fail(path);
      if (path.endsWith('.icon') && !['box', 'truck', 'chat', 'star', 'shield'].includes(text)) return fail(path);
      if (path.endsWith('.id') && !/^[a-z][a-z0-9-]{0,59}$/.test(text)) return fail(path);
      return text;
    }
    if (Array.isArray(example)) {
      if (!Array.isArray(input) || input.length > (path.endsWith('columns') ? 4 : 40)) return fail(path);
      const key = path.split('.').at(-1)!;
      const template = key === 'links' && path.startsWith('footer.') ? { target: 'contacto', label: '' } : contentArrayItems[key];
      if (template === undefined) return fail(path);
      return input.map((item, index) => visit(item, template, `${path}.${index}`));
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(path);
    const fields = example as Record<string, unknown>, record = input as Record<string, unknown>;
    if (Object.keys(record).some(key => !Object.hasOwn(fields, key)) || Object.keys(fields).some(key => !Object.hasOwn(record, key))) return fail(path);
    return Object.fromEntries(Object.entries(fields).map(([key, template]) => [key, visit(record[key], template, path ? `${path}.${key}` : key)]));
  }
  const config = visit(value, defaults, '') as ContentConfig;
  for (const [key, page] of Object.entries(config.pages)) {
    if (!page.title || !page.label || new Set(page.sections.map(s => s.id)).size !== page.sections.length) fail(`pages.${key}`);
    for (const flag of ['contact', 'legal', 'about'] as const) if (page[flag] !== defaults.pages[key as keyof typeof defaults.pages][flag]) fail(`pages.${key}.${flag}`);
  }
  const { email, taxId, dataFiscalUrl } = config.contact;
  if (email && !/^[a-zA-Z0-9._+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(email)) fail('contact.email');
  if (taxId && !/^\d{11}$/.test(taxId)) fail('contact.taxId');
  if (dataFiscalUrl) {
    let url: URL; try { url = new URL(dataFiscalUrl); } catch { return fail('contact.dataFiscalUrl'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !/(^|\.)(afip|arca)\.gob\.ar$/.test(url.hostname)) fail('contact.dataFiscalUrl');
  }
  return config;
}

/** Add only fields introduced after the original schema when reading persisted JSON. Writes remain exact. */
function upgradeLandingBlocks(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const landing = structuredClone(value) as Record<string, unknown>;
  function visit(blocks: unknown, depth: number) {
    if (!Array.isArray(blocks) || blocks.length > 40 || depth > 3) return;
    for (const b of blocks) {
      if (!b || typeof b !== 'object') continue;
      if (b.style && typeof b.style === 'object' && !Array.isArray(b.style)) b.style = { backgroundColor: null, textColor: null, ...b.style };
      if (b.type === 'categories' && b.props && typeof b.props === 'object' && !Array.isArray(b.props)) b.props = { cardStyle: 'icons', textPosition: 'below', ...b.props };
      if (Array.isArray(b.columns)) for (const c of b.columns.slice(0, 3)) if (c && typeof c === 'object') visit(c.blocks, depth + 1);
    }
  }
  visit(landing.blocks, 0); return landing;
}
export function parseStoredContentConfig(value: unknown): ContentConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return parseContentConfig(value);
  const raw = value as Record<string, unknown>, defaults = defaultContentConfig();
  const listing = raw.listing && typeof raw.listing === 'object' && !Array.isArray(raw.listing)
    ? { filtersEnabled: defaults.listing.filtersEnabled, ...raw.listing as Record<string, unknown> } : raw.listing;
  const copy = raw.copy && typeof raw.copy === 'object' && !Array.isArray(raw.copy) ? raw.copy as Record<string, unknown> : undefined;
  const information = copy?.information && typeof copy.information === 'object' && !Array.isArray(copy.information) ? copy.information as Record<string, unknown> : undefined;
  const labels = Object.fromEntries(['indexTitle', 'contactTitle', 'hoursLabel', 'legalEyebrow', 'legalTitle'].map(key => [key, defaults.copy.information[key as keyof typeof defaults.copy.information]]));
  return parseContentConfig({ ...raw, appearance: Object.hasOwn(raw, 'appearance') ? raw.appearance : defaults.appearance, listing: Object.hasOwn(raw, 'listing') ? listing : defaults.listing,
    landing: !Object.hasOwn(raw, 'landing') ? legacyLanding({ ...defaults.copy.home, ...(copy?.home as Record<string, string> ?? {}) }, (raw.features as { homeAbout?: boolean } | undefined)?.homeAbout !== false) : upgradeLandingBlocks(raw.landing),
    ...(information ? { copy: { ...copy, information: { ...labels, ...information } } } : {}) });
}
