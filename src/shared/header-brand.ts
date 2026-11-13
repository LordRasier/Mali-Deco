export type HeaderBrandMode = 'logo' | 'logo_text' | 'text';
export type HeaderBrandSettings = { headerBrandMode?: HeaderBrandMode };
export function isHeaderBrandMode(value: unknown): value is HeaderBrandMode {
  return value === 'logo' || value === 'logo_text' || value === 'text';
}
export function headerBrandView(value: unknown) {
  const mode = isHeaderBrandMode(value) ? value : 'logo_text';
  return { mode, logoOnly: mode === 'logo', textOnly: mode === 'text' };
}
