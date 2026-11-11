import { appearanceColor, parseAppearance, storeFonts, type StoreAppearance } from '../../shared/store-appearance';
import { flattenBlocks } from '../../shared/landing-layout';
import type { ContentConfig } from './content-config';
import { themePalette } from './store-theme';

type AppearanceSheet = { appearance: StoreAppearance; sections: [string, string | null, string | null][] };
export function appearanceSheet(config: ContentConfig): AppearanceSheet {
  return { appearance: config.appearance, sections: flattenBlocks(config.landing)
    .filter(block => block.style.backgroundColor !== null || block.style.textColor !== null)
    .map(block => [block.id, block.style.backgroundColor, block.style.textColor]) };
}
/** Preview URLs contain only validated design tokens, never draft text or private store data. */
export function parseAppearanceSheet(raw: unknown): AppearanceSheet {
  if (typeof raw !== 'string' || raw.length > 8000) throw Error('Apariencia inválida.');
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'appearance') || !Array.isArray(value.sections) || value.sections.length > 40) throw Error('Apariencia inválida.');
  const ids = new Set<string>();
  const sections = value.sections.map((row: unknown): AppearanceSheet['sections'][number] => {
    if (!Array.isArray(row) || row.length !== 3 || typeof row[0] !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/.test(row[0]) || ids.has(row[0])) throw Error('Sección inválida.');
    ids.add(row[0]); return [row[0], appearanceColor(row[1]), appearanceColor(row[2])];
  });
  return { appearance: parseAppearance(value.appearance), sections };
}
export function previewAppearanceHref(config: ContentConfig): string {
  return '/api/v1/admin/settings/content/editor/appearance.css?design=' + encodeURIComponent(JSON.stringify(appearanceSheet(config)));
}
/** All interpolated values are fixed font stacks, six-digit colors or validated identifiers. */
export function appearanceCss(sheet: AppearanceSheet): string {
  const { appearance, sections } = parseAppearanceSheet(JSON.stringify(sheet));
  let css = '';
  if (appearance.backgroundColor) css += `html body{background:${appearance.backgroundColor};color:${themePalette(appearance.backgroundColor).onPrimary};}`;
  if (appearance.bodyFont) {
    const font = storeFonts[appearance.bodyFont].family;
    css += `:root:root{--font-primary:${font};--store-font:${font};}`;
  }
  if (appearance.headingFont) css += `:root body :is(h1,h2,h3,h4,h5,h6){font-family:${storeFonts[appearance.headingFont].family};}`;
  for (const [id, background, text] of sections) {
    const frame = `.landing-block[data-landing-id="${id}"]`, content = `${frame}>.landing-block-content`;
    if (background) css += `${frame},${content}{background:${background};}`;
    const foreground = text ?? (background ? themePalette(background).onPrimary : null);
    if (foreground) css += `${content}{color:${foreground};--section-text:${foreground};}`;
  }
  return css;
}
