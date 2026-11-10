import { defaultContentConfig, targetPaths, type ContentConfig } from './content-config';

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
export function parseStoredContentConfig(value: unknown): ContentConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return parseContentConfig(value);
  const raw = value as Record<string, unknown>, defaults = defaultContentConfig();
  const copy = raw.copy && typeof raw.copy === 'object' && !Array.isArray(raw.copy) ? raw.copy as Record<string, unknown> : undefined;
  const information = copy?.information && typeof copy.information === 'object' && !Array.isArray(copy.information) ? copy.information as Record<string, unknown> : undefined;
  const labels = Object.fromEntries(['indexTitle', 'contactTitle', 'hoursLabel', 'legalEyebrow', 'legalTitle'].map(key => [key, defaults.copy.information[key as keyof typeof defaults.copy.information]]));
  return parseContentConfig({ ...raw, ...(!Object.hasOwn(raw, 'listing') ? { listing: defaults.listing } : {}),
    ...(information ? { copy: { ...copy, information: { ...labels, ...information } } } : {}) });
}
